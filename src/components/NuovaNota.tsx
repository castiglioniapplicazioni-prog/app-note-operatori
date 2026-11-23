import { useEffect, useRef, useState, type FormEvent } from 'react'
import { dataBreve, oggi } from '../format'
import { ricordaOperatore, ultimoOperatore } from '../preferenze'
import { caricaAllegato, creaNota, type FileDaCaricare } from '../supabase'
import type { Liste, Nota, Operatore } from '../types'
import Allegati, { type VoceAllegato } from './Allegati'
import CampoCodice from './CampoCodice'
import { SceltaOperatore } from './Scelte'

interface Props {
  io: Operatore
  liste: Liste
  onChiudi: () => void
  onSalvata: (nota: Nota, avviso?: string) => void
}

interface FileLocale extends FileDaCaricare {
  chiave: string
  url: string
  urlMiniatura?: string
}

// Nuova nota (SPEC 5.4)
export default function NuovaNota({ io, liste, onChiudi, onSalvata }: Props) {
  const attivi = liste.operatori.filter((o) => o.attivo)
  const preselezionato = attivi.some((o) => o.id === io.id) ? io.id : (ultimoOperatore() ?? '')
  const [autore, setAutore] = useState(attivi.some((o) => o.id === preselezionato) ? preselezionato : '')
  const [destinatario, setDestinatario] = useState('')
  const [commessa, setCommessa] = useState('')
  const [bancale, setBancale] = useState('')
  const [azione, setAzione] = useState('')
  const [testo, setTesto] = useState('')
  const [file, setFile] = useState<FileLocale[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState<string | null>(null)

  // anteprime locali: liberate all'uscita
  const fileAttuali = useRef(file)
  fileAttuali.current = file
  useEffect(
    () => () =>
      fileAttuali.current.forEach((f) => {
        URL.revokeObjectURL(f.url)
        if (f.urlMiniatura) URL.revokeObjectURL(f.urlMiniatura)
      }),
    [],
  )

  function aggiungi(nuovi: FileDaCaricare[]) {
    setFile((prima) => [
      ...prima,
      ...nuovi.map((f) => ({
        ...f,
        chiave: crypto.randomUUID(),
        url: URL.createObjectURL(f.file),
        urlMiniatura: f.miniatura ? URL.createObjectURL(f.miniatura) : undefined,
      })),
    ])
  }

  function rimuovi(chiave: string) {
    setFile((prima) => prima.filter((f) => f.chiave !== chiave))
  }

  async function salva(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    if (!autore) return setErrore("Scegli l'operatore.")
    if (!destinatario && !commessa.trim() && !bancale.trim() && !azione && !testo.trim() && !file.length) {
      return setErrore('Compila almeno un altro campo oltre all\'operatore.')
    }
    setAttesa('Salvataggio…')
    let nota: Nota
    try {
      nota = await creaNota({
        autore_id: autore,
        destinatario_id: destinatario || null,
        rif_commessa: commessa.trim(),
        rif_bancale: bancale.trim(),
        azione_id: azione || null,
        testo: testo.trim(),
      })
      ricordaOperatore(autore)
    } catch (err) {
      setErrore((err as Error).message)
      setAttesa(null)
      return
    }
    // la nota è salvata: ora foto e vocali, uno alla volta
    let falliti = 0
    for (const [i, f] of file.entries()) {
      setAttesa(`Caricamento allegati ${i + 1} di ${file.length}…`)
      try {
        nota.allegati.push(await caricaAllegato(nota.id, f))
      } catch {
        falliti++
      }
    }
    onSalvata(nota, falliti ? `Nota salvata, ma ${falliti} allegati non caricati: riprova dal dettaglio.` : undefined)
  }

  const voci: VoceAllegato[] = file.map((f) => ({ chiave: f.chiave, tipo: f.tipo, url: f.url, miniatura: f.urlMiniatura }))

  return (
    <div className="foglio">
      <div className="foglio-testata">
        <button className="link" onClick={onChiudi} disabled={Boolean(attesa)}>
          Annulla
        </button>
        <h2>Nuova nota</h2>
        <span className="data-testata">{dataBreve(oggi())}</span>
      </div>
      <form className="foglio-corpo modulo" onSubmit={salva}>
        <label>
          Operatore *
          <SceltaOperatore operatori={attivi} valore={autore} onCambia={setAutore} vuota="Scegli operatore" />
        </label>
        <label>
          Destinatario
          <SceltaOperatore operatori={attivi} valore={destinatario} onCambia={setDestinatario} vuota="Nessun destinatario" vuotaSelezionabile />
        </label>
        <CampoCodice etichetta="Rif Commessa" valore={commessa} onCambia={setCommessa} togliInizio={3} togliFine={3} />
        <CampoCodice etichetta="Rif Bancale" valore={bancale} onCambia={setBancale} togliInizio={3} />
        <label>
          Azione
          <select value={azione} onChange={(e) => setAzione(e.target.value)}>
            <option value="">Scegli azione</option>
            {liste.azioni.filter((a) => a.attiva).map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </label>
        <label>
          Nota
          <textarea rows={4} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Descrivi il problema…" />
        </label>

        <Allegati voci={voci} onAggiungi={aggiungi} onRimuovi={rimuovi} />

        {errore && <p className="errore">{errore}</p>}
        <button className="pulsante primario grande" disabled={Boolean(attesa)}>
          {attesa ?? 'Salva'}
        </button>
      </form>
    </div>
  )
}
