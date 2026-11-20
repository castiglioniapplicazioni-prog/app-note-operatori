import { useEffect, useRef, useState } from 'react'
import { preparaFoto } from '../foto'
import type { FileDaCaricare } from '../supabase'
import Icona from './Icone'

// Foto e vocali di una nota (SPEC 5.4 punti 8-9 e 5.6).
// Usato sia nella nuova nota (file ancora sul telefono) sia nel dettaglio (file già caricati).

export interface VoceAllegato {
  chiave: string
  tipo: 'foto' | 'vocale'
  url?: string // foto grande o audio
  miniatura?: string
  nome?: string
}

interface Props {
  voci: VoceAllegato[]
  onAggiungi: (file: FileDaCaricare[]) => Promise<void> | void
  onRimuovi?: (chiave: string) => void // assente = non si può eliminare (né autore né admin)
  attesa?: string | null // es. "Caricamento foto…"
}

// Formato di registrazione supportato dal browser (webm su Chrome/Android, mp4 su iPhone)
function formatoAudio(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  )
}

export default function Allegati({ voci, onAggiungi, onRimuovi, attesa }: Props) {
  const scatta = useRef<HTMLInputElement>(null)
  const galleria = useRef<HTMLInputElement>(null)
  const allegaAudio = useRef<HTMLInputElement>(null)
  const registratore = useRef<MediaRecorder | null>(null)
  const [registrando, setRegistrando] = useState(false)
  const [secondi, setSecondi] = useState(0)
  const [errore, setErrore] = useState<string | null>(null)
  const [preparazione, setPreparazione] = useState(false)
  const [ingrandita, setIngrandita] = useState<string | null>(null)

  const foto = voci.filter((v) => v.tipo === 'foto')
  const vocali = voci.filter((v) => v.tipo === 'vocale')

  useEffect(() => {
    if (!registrando) return
    const t = setInterval(() => setSecondi((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [registrando])

  // se si esce dalla schermata durante una registrazione, il microfono si spegne
  useEffect(() => () => registratore.current?.stream.getTracks().forEach((t) => t.stop()), [])

  async function fotoScelte(file: FileList | null) {
    if (!file?.length) return
    setErrore(null)
    setPreparazione(true)
    try {
      const pronte: FileDaCaricare[] = []
      for (const f of Array.from(file)) {
        const { foto, miniatura } = await preparaFoto(f)
        pronte.push({ tipo: 'foto', file: foto, miniatura, nome: f.name || 'foto.jpg' })
      }
      await onAggiungi(pronte)
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setPreparazione(false)
    }
  }

  async function audioScelti(file: FileList | null) {
    if (!file?.length) return
    setErrore(null)
    await onAggiungi(Array.from(file).map((f) => ({ tipo: 'vocale' as const, file: f, nome: f.name || 'audio' })))
  }

  async function avviaRegistrazione() {
    setErrore(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrore('Registrazione non disponibile su questo browser: usa "Allega".')
      return
    }
    let flusso: MediaStream
    try {
      flusso = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErrore('Permesso per il microfono negato. Consentilo nelle impostazioni del browser.')
      return
    }
    const tipo = formatoAudio()
    const rec = new MediaRecorder(flusso, tipo ? { mimeType: tipo } : undefined)
    const pezzi: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && pezzi.push(e.data)
    rec.onstop = () => {
      flusso.getTracks().forEach((t) => t.stop())
      const mime = (rec.mimeType || tipo || 'audio/webm').split(';')[0]
      const blob = new Blob(pezzi, { type: mime })
      const est = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
      if (blob.size) onAggiungi([{ tipo: 'vocale', file: blob, nome: `vocale.${est}` }])
    }
    registratore.current = rec
    rec.start()
    setSecondi(0)
    setRegistrando(true)
  }

  function fermaRegistrazione() {
    registratore.current?.stop()
    registratore.current = null
    setRegistrando(false)
  }

  const occupato = preparazione || Boolean(attesa)

  return (
    <>
      <div className="campo">
        <span className="etichetta">Vocale</span>
        <div className="pulsanti-allegati">
          {registrando ? (
            <button type="button" className="pulsante pericolo-pieno" onClick={fermaRegistrazione}>
              <Icona nome="stop" /> Ferma {Math.floor(secondi / 60)}:{String(secondi % 60).padStart(2, '0')}
            </button>
          ) : (
            <button type="button" className="pulsante" onClick={avviaRegistrazione} disabled={occupato}>
              <Icona nome="microfono" /> Registra
            </button>
          )}
          <button type="button" className="pulsante" onClick={() => allegaAudio.current?.click()} disabled={occupato || registrando}>
            <Icona nome="allega" /> Allega
          </button>
        </div>
        <input ref={allegaAudio} type="file" accept="audio/*" multiple hidden onChange={(e) => { audioScelti(e.target.files); e.target.value = '' }} />
        {vocali.length > 0 && (
          <ul className="elenco-vocali">
            {vocali.map((v) => (
              <li key={v.chiave}>
                {v.url ? <audio controls preload="metadata" src={v.url} /> : <span className="nota-campo">Caricamento…</span>}
                {onRimuovi && (
                  <button type="button" className="x-rossa" onClick={() => onRimuovi(v.chiave)} aria-label="Elimina vocale">
                    <Icona nome="chiudi" dimensione={18} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="campo">
        <span className="etichetta">Foto</span>
        <div className="pulsanti-allegati">
          <button type="button" className="pulsante" onClick={() => scatta.current?.click()} disabled={occupato}>
            <Icona nome="fotocamera" /> Scatta
          </button>
          <button type="button" className="pulsante" onClick={() => galleria.current?.click()} disabled={occupato}>
            <Icona nome="galleria" /> Galleria
          </button>
        </div>
        <input ref={scatta} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { fotoScelte(e.target.files); e.target.value = '' }} />
        <input ref={galleria} type="file" accept="image/*" multiple hidden onChange={(e) => { fotoScelte(e.target.files); e.target.value = '' }} />
        {foto.length > 0 && (
          <div className="griglia-foto">
            {foto.map((f) => (
              <div key={f.chiave} className="miniatura">
                {f.miniatura || f.url ? (
                  <img
                    src={f.miniatura ?? f.url}
                    alt="Foto"
                    onClick={() => f.url && setIngrandita(f.url)}
                    onError={(e) => f.url && e.currentTarget.src !== f.url && (e.currentTarget.src = f.url)}
                  />
                ) : (
                  <span className="nota-campo">…</span>
                )}
                {onRimuovi && (
                  <button type="button" className="x-rossa" onClick={() => onRimuovi(f.chiave)} aria-label="Elimina foto">
                    <Icona nome="chiudi" dimensione={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(preparazione || attesa) && <p className="nota-modulo caricamento">{preparazione ? 'Preparazione foto…' : attesa}</p>}
      {errore && <p className="errore">{errore}</p>}

      {ingrandita && (
        <div className="velo visore" onClick={() => setIngrandita(null)}>
          <img src={ingrandita} alt="Foto ingrandita" />
          <button type="button" className="icona-pulsante visore-chiudi" aria-label="Chiudi">
            <Icona nome="chiudi" />
          </button>
        </div>
      )}
    </>
  )
}
