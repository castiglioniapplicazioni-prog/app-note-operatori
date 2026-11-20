import { useState, type FormEvent } from 'react'
import {
  eliminaAzione,
  eliminaOperatore,
  reimpostaAccesso,
  salvaAzione,
  salvaOperatore,
  type DatiOperatore,
} from '../supabase'
import type { Azione, Liste, Operatore } from '../types'
import Conferma from './Conferma'
import Icona from './Icone'

interface Props {
  io: Operatore
  liste: Liste
  onCambiate: () => void
  onMessaggio: (t: string) => void
}

// Liste: Operatori e Azioni (SPEC 5.7). Modifiche solo admin; gli altri in sola lettura.
export default function PaginaListe({ io, liste, onCambiate, onMessaggio }: Props) {
  const [operatore, setOperatore] = useState<Operatore | 'nuovo' | null>(null)
  const [azione, setAzione] = useState<Azione | 'nuova' | null>(null)
  const admin = io.is_admin

  return (
    <section className="liste">
      {!admin && <p className="avviso">Solo gli amministratori possono modificare le liste.</p>}

      <div className="titolo-elenco">
        <h2>Operatori</h2>
        {admin && (
          <button className="pulsante piccolo primario" onClick={() => setOperatore('nuovo')}>
            <Icona nome="piu" dimensione={16} /> Aggiungi
          </button>
        )}
      </div>
      <ul className="elenco-semplice">
        {liste.operatori.map((o) => (
          <li key={o.id}>
            <button className="scheda riga-semplice" disabled={!admin} onClick={() => setOperatore(o)}>
              <span className="riga-titolo">
                <strong>{o.nome}</strong>
                {o.is_admin && <span className="stato stato-admin">Admin</span>}
                {!o.attivo && <span className="stato stato-disattivato">Disattivato</span>}
                {o.attivo && !o.auth_user_id && o.telefono && <span className="stato stato-in-attesa">Mai entrato</span>}
              </span>
              <small className="nota-campo">
                {[o.email, o.telefono].filter(Boolean).join(' · ') || 'nessun contatto'}
              </small>
            </button>
          </li>
        ))}
      </ul>

      <div className="titolo-elenco">
        <h2>Azioni</h2>
        {admin && (
          <button className="pulsante piccolo primario" onClick={() => setAzione('nuova')}>
            <Icona nome="piu" dimensione={16} /> Aggiungi
          </button>
        )}
      </div>
      <ul className="elenco-semplice">
        {liste.azioni.map((a) => (
          <li key={a.id}>
            <button className="scheda riga-semplice" disabled={!admin} onClick={() => setAzione(a)}>
              <span className="riga-titolo">
                <strong>{a.nome}</strong>
                <span className={`stato ${a.attiva ? 'stato-attivo' : 'stato-disattivato'}`}>
                  {a.attiva ? 'Attiva' : 'Disattivata'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {operatore && (
        <ModuloOperatore
          io={io}
          operatore={operatore === 'nuovo' ? null : operatore}
          onChiudi={() => setOperatore(null)}
          onFatto={(m) => {
            setOperatore(null)
            onCambiate()
            onMessaggio(m)
          }}
        />
      )}
      {azione && (
        <ModuloAzione
          azione={azione === 'nuova' ? null : azione}
          prossimoOrdine={Math.max(0, ...liste.azioni.map((a) => a.ordine)) + 1}
          onChiudi={() => setAzione(null)}
          onFatto={(m) => {
            setAzione(null)
            onCambiate()
            onMessaggio(m)
          }}
        />
      )}
    </section>
  )
}

function ModuloOperatore({
  io,
  operatore,
  onChiudi,
  onFatto,
}: {
  io: Operatore
  operatore: Operatore | null
  onChiudi: () => void
  onFatto: (messaggio: string) => void
}) {
  const [dati, setDati] = useState<DatiOperatore>({
    nome: operatore?.nome ?? '',
    codice: operatore?.codice ?? '',
    email: operatore?.email ?? '',
    telefono: operatore?.telefono ?? '',
    is_admin: operatore?.is_admin ?? false,
    attivo: operatore?.attivo ?? true,
  })
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)
  const [conferma, setConferma] = useState<'elimina' | 'reimposta' | null>(null)
  const sonoIo = operatore?.id === io.id
  const entrato = Boolean(operatore?.auth_user_id)

  function cambia<K extends keyof DatiOperatore>(k: K, v: DatiOperatore[K]) {
    setDati((d) => ({ ...d, [k]: v }))
  }

  async function esegui(fn: () => Promise<void>, messaggio: string) {
    setErrore(null)
    setAttesa(true)
    try {
      await fn()
      onFatto(messaggio)
    } catch (err) {
      setErrore((err as Error).message)
      setAttesa(false)
      setConferma(null)
    }
  }

  function salva(e: FormEvent) {
    e.preventDefault()
    if (!dati.nome.trim()) return setErrore('Il nome è obbligatorio.')
    esegui(
      () => salvaOperatore({ ...dati, codice: dati.codice || null, email: dati.email || null, telefono: dati.telefono || null }, operatore?.id),
      operatore ? 'Operatore aggiornato' : 'Operatore aggiunto',
    )
  }

  return (
    <div className="foglio">
      <div className="foglio-testata">
        <button className="link" onClick={onChiudi}>Annulla</button>
        <h2>{operatore ? 'Modifica operatore' : 'Nuovo operatore'}</h2>
      </div>
      <form className="foglio-corpo modulo" onSubmit={salva}>
        <label>
          Nome *
          <input value={dati.nome} onChange={(e) => cambia('nome', e.target.value)} required />
        </label>
        <label>
          Codice <span className="facoltativo">(facoltativo, es. Stefano_B)</span>
          <input value={dati.codice ?? ''} onChange={(e) => cambia('codice', e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={dati.email ?? ''} onChange={(e) => cambia('email', e.target.value)} />
        </label>
        <label>
          Telefono <span className="facoltativo">(serve per accedere all'app)</span>
          <input
            type="tel"
            inputMode="tel"
            value={dati.telefono ?? ''}
            onChange={(e) => cambia('telefono', e.target.value)}
            disabled={entrato}
          />
        </label>
        {entrato && <p className="nota-campo">Ha già fatto l'accesso: per cambiare il telefono usa prima "Reimposta accesso".</p>}
        <label className="spunta">
          <input type="checkbox" checked={dati.is_admin} onChange={(e) => cambia('is_admin', e.target.checked)} disabled={sonoIo} />
          Amministratore (modifica le liste e tutte le note)
        </label>
        <label className="spunta">
          <input type="checkbox" checked={dati.attivo} onChange={(e) => cambia('attivo', e.target.checked)} disabled={sonoIo} />
          Attivo (può accedere ed essere scelto nelle note)
        </label>
        {errore && <p className="errore">{errore}</p>}
        <button className="pulsante primario grande" disabled={attesa}>
          {attesa ? 'Salvataggio…' : 'Salva'}
        </button>

        {operatore && !sonoIo && (
          <div className="azioni-secondarie">
            {entrato && (
              <button type="button" className="pulsante" onClick={() => setConferma('reimposta')}>
                <Icona nome="chiave" dimensione={18} /> Reimposta accesso (password dimenticata)
              </button>
            )}
            <button type="button" className="pulsante pericolo" onClick={() => setConferma('elimina')}>
              <Icona nome="cestino" dimensione={18} /> Elimina operatore
            </button>
          </div>
        )}
      </form>

      {conferma === 'elimina' && operatore && (
        <Conferma
          testo={`Eliminare ${operatore.nome}? L'operazione non si può annullare. Se compare in qualche nota, va invece disattivato.`}
          etichettaConferma="Elimina"
          attesa={attesa}
          onAnnulla={() => setConferma(null)}
          onConferma={() => esegui(() => eliminaOperatore(operatore), 'Operatore eliminato')}
        />
      )}
      {conferma === 'reimposta' && operatore && (
        <Conferma
          testo={`Reimpostare l'accesso di ${operatore.nome}? Al prossimo accesso dovrà creare una nuova password.`}
          etichettaConferma="Reimposta"
          attesa={attesa}
          onAnnulla={() => setConferma(null)}
          onConferma={() => esegui(() => reimpostaAccesso(operatore.id), 'Accesso reimpostato')}
        />
      )}
    </div>
  )
}

function ModuloAzione({
  azione,
  prossimoOrdine,
  onChiudi,
  onFatto,
}: {
  azione: Azione | null
  prossimoOrdine: number
  onChiudi: () => void
  onFatto: (messaggio: string) => void
}) {
  const [nome, setNome] = useState(azione?.nome ?? '')
  const [attiva, setAttiva] = useState(azione?.attiva ?? true)
  const [ordine, setOrdine] = useState(String(azione?.ordine ?? prossimoOrdine))
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)
  const [conferma, setConferma] = useState(false)

  async function esegui(fn: () => Promise<void>, messaggio: string) {
    setErrore(null)
    setAttesa(true)
    try {
      await fn()
      onFatto(messaggio)
    } catch (err) {
      setErrore((err as Error).message)
      setAttesa(false)
      setConferma(false)
    }
  }

  return (
    <div className="foglio">
      <div className="foglio-testata">
        <button className="link" onClick={onChiudi}>Annulla</button>
        <h2>{azione ? 'Modifica azione' : 'Nuova azione'}</h2>
      </div>
      <form
        className="foglio-corpo modulo"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nome.trim()) return setErrore('Il nome è obbligatorio.')
          esegui(() => salvaAzione({ nome: nome.trim(), attiva, ordine: Number(ordine) || 0 }, azione?.id), azione ? 'Azione aggiornata' : 'Azione aggiunta')
        }}
      >
        <label>
          Nome *
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          Ordine nell'elenco
          <input type="number" inputMode="numeric" value={ordine} onChange={(e) => setOrdine(e.target.value)} />
        </label>
        <label className="spunta">
          <input type="checkbox" checked={attiva} onChange={(e) => setAttiva(e.target.checked)} />
          Attiva (selezionabile nelle note)
        </label>
        {errore && <p className="errore">{errore}</p>}
        <button className="pulsante primario grande" disabled={attesa}>
          {attesa ? 'Salvataggio…' : 'Salva'}
        </button>
        {azione && (
          <div className="azioni-secondarie">
            <button type="button" className="pulsante pericolo" onClick={() => setConferma(true)}>
              <Icona nome="cestino" dimensione={18} /> Elimina azione
            </button>
            <p className="nota-campo">Le note che la usano resteranno senza azione: se serve conservarla, disattivala.</p>
          </div>
        )}
      </form>
      {conferma && azione && (
        <Conferma
          testo={`Eliminare l'azione "${azione.nome}"? L'operazione non si può annullare.`}
          etichettaConferma="Elimina"
          attesa={attesa}
          onAnnulla={() => setConferma(false)}
          onConferma={() => esegui(() => eliminaAzione(azione.id), 'Azione eliminata')}
        />
      )}
    </div>
  )
}
