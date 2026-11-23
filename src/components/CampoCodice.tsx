import { lazy, Suspense, useRef, useState } from 'react'
import Icona from './Icone'

// Lo scanner usa zxing (grande): si scarica solo quando serve
const ScannerDalVivo = lazy(() => import('./ScannerDalVivo'))

interface Props {
  etichetta: string
  valore: string
  onCambia: (v: string) => void
  // caratteri da togliere dal codice letto con lo scanner (non da quello scritto a mano)
  togliInizio?: number
  togliFine?: number
}

// Toglie i caratteri in eccesso dal codice letto; se il codice è troppo corto lo lascia com'è
export function tagliaCodice(testo: string, inizio = 0, fine = 0): string {
  if (testo.length <= inizio + fine) return testo
  return testo.slice(inizio, testo.length - fine)
}

// Campo testo + pulsante verde di scansione (SPEC 5.5). Il campo resta modificabile a mano.
export default function CampoCodice({ etichetta, valore, onCambia, togliInizio = 0, togliFine = 0 }: Props) {
  const [pannello, setPannello] = useState(false)
  const [dalVivo, setDalVivo] = useState(false)
  const [lettura, setLettura] = useState<string | null>(null) // messaggio durante/dopo la lettura da foto
  const inputFoto = useRef<HTMLInputElement>(null)

  function letto(testo: string) {
    import('../codici').then(({ pulisciCodice }) => onCambia(tagliaCodice(pulisciCodice(testo), togliInizio, togliFine)))
    setDalVivo(false)
    setPannello(false)
    setLettura(null)
  }

  async function fotoScelta(file: File | undefined) {
    if (!file) return
    setLettura('Lettura del codice…')
    try {
      const { leggiCodiceDaFoto } = await import('../leggiFoto')
      const testo = await leggiCodiceDaFoto(file)
      if (testo) letto(testo)
      else setLettura('Nessun codice trovato. Riprova avvicinandoti, con il codice ben a fuoco e illuminato.')
    } catch {
      setLettura('Impossibile leggere la foto. Riprova.')
    }
  }

  return (
    <div className="campo">
      <span className="etichetta">{etichetta}</span>
      <div className="campo-con-pulsante">
        <input type="text" value={valore} onChange={(e) => onCambia(e.target.value)} enterKeyHint="next" />
        <button
          type="button"
          className="pulsante primario pulsante-scansione"
          onClick={() => {
            setLettura(null)
            setPannello(true)
          }}
          aria-label={`Scansiona ${etichetta}`}
        >
          <Icona nome="codice" />
        </button>
      </div>

      {pannello && (
        <div className="velo centrato" onClick={() => setPannello(false)}>
          <div className="scheda finestra pannello-scansione" onClick={(e) => e.stopPropagation()} role="dialog">
            <h2>Scansiona {etichetta.toLowerCase()}</h2>
            <button type="button" className="pulsante primario grande" onClick={() => inputFoto.current?.click()}>
              <Icona nome="fotocamera" /> Scatta una foto del codice
              <small>più preciso (consigliato)</small>
            </button>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                fotoScelta(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {lettura && <p className="nota-modulo">{lettura}</p>}
            <button type="button" className="pulsante grande" onClick={() => setDalVivo(true)}>
              <Icona nome="codice" /> Lettura dal vivo
            </button>
            <button type="button" className="link" onClick={() => setPannello(false)}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {dalVivo && (
        <Suspense fallback={<div className="scanner"><p className="scanner-testo">Avvio fotocamera…</p></div>}>
          <ScannerDalVivo onLetto={letto} onChiudi={() => setDalVivo(false)} />
        </Suspense>
      )}
    </div>
  )
}
