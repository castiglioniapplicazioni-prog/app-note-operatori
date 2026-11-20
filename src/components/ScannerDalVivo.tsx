import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { FORMATI_NATIVI, suggerimentiZxing } from '../codici'
import { apriFotocamera, fotocameraDisponibile, messaggioFotocamera } from '../fotocamera'

// Lettura dal vivo con la fotocamera posteriore (SPEC 5.5, modalità 2):
// fotocamera principale (non ultra-grandangolo), zoom iniziale 2x se supportato,
// pulsanti 1x/2x/3x/4x, torcia se supportata, mirino con linea rossa.
// Caricato solo all'uso (zxing è grande).

interface Props {
  onLetto: (testo: string) => void
  onChiudi: () => void
}

const LIVELLI_ZOOM = [1, 2, 3, 4]

type Capacita = MediaTrackCapabilities & {
  focusMode?: string[]
  zoom?: { min: number; max: number }
  torch?: boolean
}
interface RilevatoreNativo {
  detect(sorgente: HTMLVideoElement): Promise<{ rawValue: string }[]>
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

export default function ScannerDalVivo({ onLetto, onChiudi }: Props) {
  const contenitore = useRef<HTMLDivElement>(null)
  const traccia = useRef<MediaStreamTrack | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [zoomMassimo, setZoomMassimo] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [torcia, setTorcia] = useState<boolean | null>(null) // null = non supportata
  // il componente padre si ridisegna spesso: la fotocamera non deve ripartire ogni volta
  const avvisaLetto = useRef(onLetto)
  avvisaLetto.current = onLetto

  useEffect(() => {
    if (!fotocameraDisponibile()) {
      setErrore("La fotocamera dal vivo funziona solo se l'app è aperta con un indirizzo https://")
      return
    }
    const video = document.createElement('video')
    video.muted = true
    video.autoplay = true
    video.playsInline = true
    video.setAttribute('playsinline', '') // richiesto da Safari su iPhone
    contenitore.current!.appendChild(video)

    let flusso: MediaStream | undefined
    let controlliZxing: IScannerControls | undefined
    let prossimo: ReturnType<typeof setTimeout> | undefined
    let chiuso = false

    function ferma() {
      chiuso = true
      clearTimeout(prossimo)
      controlliZxing?.stop()
      flusso?.getTracks().forEach((t) => t.stop())
      flusso = undefined
      traccia.current = null
    }

    function letto(testo: string) {
      if (chiuso) return
      ferma()
      navigator.vibrate?.(80)
      avvisaLetto.current(testo)
    }

    async function avvia() {
      try {
        flusso = await apriFotocamera(1920, 1080)
        if (chiuso) return ferma()
      } catch (err) {
        if (!chiuso) setErrore(messaggioFotocamera(err, ', oppure usa "Scatta una foto del codice"'))
        return
      }

      video.srcObject = flusso
      await video.play().catch(() => {})
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
      if (chiuso) return

      const nativo = await creaRilevatoreNativo()
      if (nativo) {
        const tentativo = async () => {
          if (chiuso) return
          try {
            const codici = await nativo.detect(video)
            if (codici.length) return letto(codici[0].rawValue)
          } catch {
            // fotogramma non pronto
          }
          prossimo = setTimeout(tentativo, 100)
        }
        tentativo()
        return
      }
      controlliZxing = await new BrowserMultiFormatReader(suggerimentiZxing()).decodeFromVideoElement(
        video,
        (risultato) => risultato && letto(risultato.getText()),
      )
      if (chiuso) controlliZxing.stop()
    }

    // piccolo ritardo: in sviluppo React monta due volte il componente
    const timer = setTimeout(avvia, 50)
    return () => {
      clearTimeout(timer)
      ferma()
      video.remove()
    }
  }, [])

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
      <div ref={contenitore} className="scanner-video" />
      <div className="scanner-mirino">
        <div className="scanner-linea" />
      </div>
      <p className="scanner-testo">{errore ?? 'Inquadra il codice nel riquadro'}</p>
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
      <button className="pulsante grande scanner-annulla" onClick={onChiudi}>
        Annulla
      </button>
    </div>
  )
}
