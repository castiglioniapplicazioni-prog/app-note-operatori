import { useMemo, useState } from 'react'
import { dataBreve } from '../format'
import { contaCommenti, contaFoto, corrisponde, nomeAzione, nomeOperatore } from '../ricerca'
import type { Liste, Nota, Operatore } from '../types'
import Icona from './Icone'

interface Props {
  titolo: string
  note: Nota[] | null // null = caricamento
  errore: string | null
  liste: Liste
  io: Operatore | null
  soloMie: boolean // scheda Aperte: mie OR per me OR senza destinatario
  onApri: (nota: Nota) => void
}

// Scheda Aperte / Chiuse (SPEC 5.1-5.3)
export default function ElencoNote({ titolo, note, errore, liste, io, soloMie, onApri }: Props) {
  const [ricerca, setRicerca] = useState('')

  const visibili = useMemo(() => {
    if (!note) return []
    return note
      .filter((n) => {
        if (!soloMie) return true
        if (!io) return !n.destinatario_id
        return n.autore_id === io.id || n.created_by === io.auth_user_id || n.destinatario_id === io.id || !n.destinatario_id
      })
      .filter((n) => corrisponde(n, liste, ricerca))
  }, [note, soloMie, io, liste, ricerca])

  return (
    <section>
      <div className="titolo-elenco">
        <h2>{titolo}</h2>
        {note && <span className="contatore">{visibili.length}</span>}
      </div>
      <input
        className="casella-ricerca"
        type="search"
        placeholder="Cerca commessa, bancale, operatore, testo…"
        value={ricerca}
        onChange={(e) => setRicerca(e.target.value)}
      />
      {errore && <p className="errore riquadro">{errore}</p>}
      {!note && !errore && <p className="vuoto">Caricamento…</p>}
      {note && !visibili.length && <p className="vuoto">{ricerca ? 'Nessuna nota trovata.' : 'Nessuna nota.'}</p>}
      <ul className="elenco-note">
        {visibili.map((n) => (
          <li key={n.id}>
            <CardNota nota={n} liste={liste} onApri={() => onApri(n)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CardNota({ nota, liste, onApri }: { nota: Nota; liste: Liste; onApri: () => void }) {
  const azione = nomeAzione(liste, nota.azione_id)
  const destinatario = nomeOperatore(liste, nota.destinatario_id)
  const foto = contaFoto(nota)
  const commenti = contaCommenti(nota)
  return (
    <button className="scheda card-nota" onClick={onApri}>
      <div className="card-alto">
        <span className="card-data">{dataBreve(nota.data)}</span>
        {azione && <span className="badge-azione">{azione}</span>}
      </div>
      {nota.rif_commessa && <strong className="card-commessa"># {nota.rif_commessa}</strong>}
      {nota.testo && <p className="card-testo">{nota.testo}</p>}
      <div className="card-basso">
        <span className="card-persone">
          <Icona nome="persona" dimensione={16} /> {nomeOperatore(liste, nota.autore_id)}
          {destinatario && <> → {destinatario}</>}
        </span>
        {foto > 0 && (
          <span>
            <Icona nome="fotocamera" dimensione={16} /> {foto}
          </span>
        )}
        {commenti > 0 && (
          <span>
            <Icona nome="commento" dimensione={16} /> {commenti}
          </span>
        )}
      </div>
    </button>
  )
}
