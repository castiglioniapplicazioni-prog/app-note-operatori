import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { FORMATI_NATIVI, suggerimentiZxing } from '../codici'
import { apriFotocamera, fotocameraDisponibile, messaggioFotocamera } from '../fotocamera'

// Lettura dal vivo con la fotocamera posteriore (SPEC 5.5, modalità 2).
// Non legge da sola: l'operatore mira con calma e preme "Leggi codice".
// Si legge SOLO la parte di immagine dentro il riquadro bianco, così un altro codice
// visibile ai bordi della fotocamera non viene preso per sbaglio.
// Fotocamera principale, zoom iniziale 2x se supportato, pulsanti 1x-4x, torcia.
// Caricato solo all'uso (zxing è grande).

interface Props {
  onLetto: (testo: string) => void
  onChiudi: () => void
}

const LIVELLI_ZOOM = [1, 2, 3, 4]
const TENTATIVI = 8 // fotogrammi provati a ogni pressione del pulsante (circa 1 secondo)

type Capacita = MediaTrackCapabilities & {
  focusMode?: string[]
  zoom?: { min: number; max: number }
  torch?: boolean
}
interface RilevatoreNativo {
  detect(sorgente: HTMLCanvasElement): Promise<{ rawValue: string }[]>
}
interface CostruttoreRilevatore {
  new (opzioni: { formats: string[] }): RilevatoreNativo
  getSupportedFormats(): Promise<string[]>
}

// Lettore integrato nel browser (Chrome su Android): più veloce di zxing
async function creaRilevatoreNativo(): Promise<RilevatoreNativo | null> {
  const R = (window as unknown as { BarcodeDetector?: CostruttoreRilevatore }).BarcodeDetector
  if (!R) return null
  try {
    const supportati = await R.getSupportedFormats()
    const formati = FORMATI_NATIVI.filter((f) => supportati.includes(f))
    return formati.length ? new R({ formats: formati }) : null
  } catch {
    return null
  }
}

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Copia in un canvas solo la parte del video che sta dentro il riquadro sullo schermo.
// Il video riempie lo schermo "ritagliato" (object-fit: cover): si ricalcolano le coordinate.
function ritagliaRiquadro(video: HTMLVideoElement, riquadro: HTMLElement): HTMLCanvasElement | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null
  const sv = video.getBoundingClientRect()
  const sr = riquadro.getBoundingClientRect()
  const scala = Math.max(sv.width / vw, sv.height / vh)
  const spostX = (sv.width - vw * scala) / 2
  const spostY = (sv.height - vh * scala) / 2
  // un piccolo margine attorno al riquadro, per non tagliare le zone bianche ai lati del codice
  const margine = 12
  let x = (sr.left - sv.left - spostX - margine) / scala
  let y = (sr.top - sv.top - spostY - margine) / scala
  let w = (sr.width + margine * 2) / scala
  let h = (sr.height + margine * 2) / scala
  x = Math.max(0, x)
  y = Math.max(0, y)
  w = Math.min(vw - x, w)
  h = Math.min(vh - y, h)
  // zxing legge meglio se il codice non è troppo piccolo: si ingrandisce fino a 1000px di larghezza
  const ingrandimento = Math.max(1, Math.min(3, 1000 / w))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * ingrandimento)
  canvas.height = Math.round(h * ingrandimento)
  canvas.getContext('2d')!.drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height)
  return canvas
}

export default function ScannerDalVivo({ onLetto, onChiudi }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const riquadro = useRef<HTMLDivElement>(null)
  const traccia = useRef<MediaStreamTrack | null>(null)
  const nativo = useRef<RilevatoreNativo | null>(null)
  const zxing = useRef<BrowserMultiFormatReader | null>(null)
  const [pronta, setPronta] = useState(false)
  const [lettura, setLettura] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [zoomMassimo, setZoomMassimo] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [torcia, setTorcia] = useState<boolean | null>(null) // null = non supportata

  useEffect(() => {
    if (!fotocameraDisponibile()) {
      setErrore("La fotocamera dal vivo funziona solo se l'app è aperta con un indirizzo https://")
      return
    }
    let flusso: MediaStream | undefined
    let chiuso = false
    const ferma = () => {
      flusso?.getTracks().forEach((t) => t.stop())
      flusso = undefined
      traccia.current = null
    }

    async function avvia() {
      try {
        flusso = await apriFotocamera(1920, 1080)
        if (chiuso) return ferma()
      } catch (err) {
        if (!chiuso) setErrore(messaggioFotocamera(err, ', oppure usa "Scatta una foto del codice"'))
        return
      }
      const v = video.current!
      v.srcObject = flusso
      await v.play().catch(() => {})
      const t = flusso.getVideoTracks()[0]
      traccia.current = t
      const capacita = (t.getCapabilities?.() ?? {}) as Capacita
      if (capacita.focusMode?.includes('continuous')) {
        await t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
      }
      if (capacita.zoom && capacita.zoom.max >= 2) {
        setZoomMassimo(capacita.zoom.max)
        await t
          .applyConstraints({ advanced: [{ zoom: 2 } as MediaTrackConstraintSet] })
          .then(() => setZoom(2))
          .catch(() => {})
      }
      if (capacita.torch) setTorcia(false)
      nativo.current = await creaRilevatoreNativo()
      if (!nativo.current) zxing.current = new BrowserMultiFormatReader(suggerimentiZxing())
      if (!chiuso) setPronta(true)
    }

    // piccolo ritardo: in sviluppo React monta due volte il componente
    const timer = setTimeout(avvia, 50)
    return () => {
      chiuso = true
      clearTimeout(timer)
      ferma()
    }
  }, [])

  async function decodifica(canvas: HTMLCanvasElement): Promise<string | null> {
    if (nativo.current) {
      try {
        const codici = await nativo.current.detect(canvas)
        if (codici.length) return codici[0].rawValue
      } catch {
        // si prova con zxing
      }
      zxing.current ??= new BrowserMultiFormatReader(suggerimentiZxing())
    }
    try {
      return zxing.current!.decodeFromCanvas(canvas).getText()
    } catch {
      return null
    }
  }

  async function leggi() {
    if (!video.current || !riquadro.current || lettura) return
    setLettura(true)
    setMessaggio(null)
    for (let i = 0; i < TENTATIVI; i++) {
      const canvas = ritagliaRiquadro(video.current, riquadro.current)
      const testo = canvas ? await decodifica(canvas) : null
      if (canvas) canvas.width = canvas.height = 0
      if (testo) {
        navigator.vibrate?.(80)
        traccia.current?.stop()
        onLetto(testo)
        return
      }
      await attendi(120)
    }
    setLettura(false)
    setMessaggio('Nessun codice nel riquadro. Avvicinati o allontanati un po’, poi riprova.')
  }

  function impostaZoom(livello: number) {
    traccia.current
      ?.applyConstraints({ advanced: [{ zoom: livello } as MediaTrackConstraintSet] })
      .then(() => setZoom(livello))
      .catch(() => {})
  }

  function cambiaTorcia() {
    const accesa = !torcia
    traccia.current
      ?.applyConstraints({ advanced: [{ torch: accesa } as MediaTrackConstraintSet] })
      .then(() => setTorcia(accesa))
      .catch(() => {})
  }

  return (
    <div className="scanner">
      <div className="scanner-video">
        <video ref={video} muted autoPlay playsInline />
      </div>
      <div ref={riquadro} className="scanner-mirino">
        <div className="scanner-linea" />
      </div>
      <p className="scanner-testo">
        {errore ?? messaggio ?? (lettura ? 'Lettura…' : pronta ? 'Metti il codice dentro il riquadro e premi "Leggi codice"' : 'Avvio fotocamera…')}
      </p>
      <div className="scanner-comandi">
        {zoomMassimo >= 2 &&
          LIVELLI_ZOOM.filter((z) => z <= zoomMassimo).map((z) => (
            <button key={z} className={`pulsante ${zoom === z ? 'scelto' : ''}`} onClick={() => impostaZoom(z)}>
              {z}x
            </button>
          ))}
        {torcia !== null && (
          <button className={`pulsante ${torcia ? 'scelto' : ''}`} onClick={cambiaTorcia}>
            Torcia
          </button>
        )}
      </div>
      {pronta && (
        <button className="pulsante primario grande scanner-leggi" onClick={leggi} disabled={lettura}>
          {lettura ? 'Lettura…' : 'Leggi codice'}
        </button>
      )}
      <button className="pulsante grande scanner-annulla" onClick={onChiudi}>
        Annulla
      </button>
    </div>
  )
}
