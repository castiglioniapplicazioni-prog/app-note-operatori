import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { dataBreve, dataOra } from '../format'
import { puoModificare } from '../permessi'
import { ricordaOperatore, ultimoOperatore } from '../preferenze'
import { nomeOperatore } from '../ricerca'
import {
  aggiornaNota,
  aggiungiCommento,
  caricaAllegato,
  caricaCommenti,
  caricaNota,
  eliminaAllegato,
  eliminaNota,
  percorsoMiniatura,
  type FileDaCaricare,
} from '../supabase'
import type { Commento, Liste, Nota, Operatore } from '../types'
import Allegati from './Allegati'
import CampoCodice from './CampoCodice'
import Conferma from './Conferma'
import Icona from './Icone'
import { SceltaOperatore } from './Scelte'
import { useLink } from './useLink'

interface Props {
  notaId: string
  io: Operatore
  liste: Liste
  onChiudi: () => void
  onCambiata: () => void // la nota è cambiata: aggiornare gli elenchi
  onMessaggio: (testo: string) => void
}

// Dettaglio nota (SPEC 5.6)
export default function DettaglioNota({ notaId, io, liste, onChiudi, onCambiata, onMessaggio }: Props) {
  const [nota, setNota] = useState<Nota | null | undefined>(undefined)
  const [commenti, setCommenti] = useState<Commento[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [modifica, setModifica] = useState(false)
  const [conferma, setConferma] = useState<{ testo: string; azione: () => Promise<void> } | null>(null)
  const [attesa, setAttesa] = useState<string | null>(null)

  const ricarica = useCallback(async () => {
    try {
      const [n, c] = await Promise.all([caricaNota(notaId), caricaCommenti(notaId)])
      setNota(n)
      setCommenti(c)
    } catch {
      setErrore('Impossibile caricare la nota. Controlla la connessione.')
    }
  }, [notaId])

  useEffect(() => {
    ricarica()
  }, [ricarica])

  const link = useLink(nota?.allegati ?? [])

  if (nota === undefined || nota === null) {
    return (
      <div className="foglio">
        <div className="foglio-testata">
          <button className="link" onClick={onChiudi}>Indietro</button>
          <h2>Nota</h2>
        </div>
        <div className="foglio-corpo">
          <p className={errore ? 'errore riquadro' : 'vuoto'}>
            {errore ?? (nota === null ? 'Nota non trovata (forse è stata eliminata).' : 'Caricamento…')}
          </p>
        </div>
      </div>
    )
  }

  const n = nota
  const modificabile = puoModificare(n, io)
  const azioniScelte = liste.azioni.filter((a) => a.attiva || a.id === n.azione_id)
  const destinatario = nomeOperatore(liste, n.destinatario_id)

  async function esegui(fn: () => Promise<void>, messaggio?: string) {
    setErrore(null)
    try {
      await fn()
      await ricarica()
      onCambiata()
      if (messaggio) onMessaggio(messaggio)
    } catch (err) {
      setErrore((err as Error).message)
    }
  }

  async function aggiungiAllegati(file: FileDaCaricare[]) {
    for (const [i, f] of file.entries()) {
      setAttesa(`Caricamento ${f.tipo === 'foto' ? 'foto' : 'vocale'} ${i + 1} di ${file.length}…`)
      try {
        await caricaAllegato(n.id, f)
      } catch (err) {
        setErrore((err as Error).message)
      }
    }
    setAttesa(null)
    await ricarica()
    onCambiata()
  }

  function chiediRimozione(chiave: string) {
    const a = n.allegati.find((x) => x.id === chiave)
    if (!a) return
    setConferma({
      testo: `Eliminare ${a.tipo === 'foto' ? 'questa foto' : 'questo vocale'}? L'operazione non si può annullare.`,
      azione: () => esegui(() => eliminaAllegato(a), a.tipo === 'foto' ? 'Foto eliminata' : 'Vocale eliminato'),
    })
  }

  function chiediEliminazione() {
    setConferma({
      testo: `Eliminare la nota ${n.codice} con foto, vocali e commenti? L'operazione non si può annullare.`,
      azione: async () => {
        try {
          await eliminaNota(n)
          onCambiata()
          onMessaggio('Nota eliminata')
          onChiudi()
        } catch (err) {
          setErrore((err as Error).message)
        }
      },
    })
  }

  return (
    <div className="foglio">
      <div className="foglio-testata">
        <button className="link" onClick={onChiudi}>Indietro</button>
        <h2>{n.codice}</h2>
      </div>
      <div className="foglio-corpo dettaglio-nota">
        <div className="scheda intestazione-nota">
          <div className="riga-intestazione">
            <span>{dataBreve(n.data)}</span>
            <span className={`stato ${n.chiusa ? 'stato-chiusa' : 'stato-aperta'}`}>{n.chiusa ? 'Chiusa' : 'Aperta'}</span>
          </div>
          <p className="persone-nota">
            <Icona nome="persona" dimensione={18} /> {nomeOperatore(liste, n.autore_id)}
            {destinatario && <> → {destinatario}</>}
          </p>
          {n.chiusa && n.chiusa_at && (
            <p className="nota-campo">
              Chiusa il {dataOra(n.chiusa_at)}
              {n.chiusa_da && ` da ${nomeOperatore(liste, n.chiusa_da)}`}
            </p>
          )}
        </div>

        <dl className="scheda dettaglio">
          <div>
            <dt>Rif Commessa</dt>
            <dd>{n.rif_commessa ? <strong>{n.rif_commessa}</strong> : '—'}</dd>
          </div>
          <div>
            <dt>Rif Bancale</dt>
            <dd>{n.rif_bancale ?? '—'}</dd>
          </div>
        </dl>
        {n.testo && <p className="scheda testo-nota">{n.testo}</p>}

        {modificabile && (
          <div className="pulsanti-fondo">
            <button className="pulsante" onClick={() => setModifica(true)}>
              <Icona nome="matita" dimensione={18} /> Modifica
            </button>
            <button className="pulsante pericolo" onClick={chiediEliminazione}>
              <Icona nome="cestino" dimensione={18} /> Elimina
            </button>
          </div>
        )}

        <div className="modulo blocco">
          <label>
            Azione
            <select
              value={n.azione_id ?? ''}
              onChange={(e) => esegui(() => aggiornaNota(n.id, { azione_id: e.target.value || null }), 'Azione aggiornata')}
            >
              <option value="">Scegli azione</option>
              {azioniScelte.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.attiva}>
                  {a.nome}
                  {a.attiva ? '' : ' (disattivata)'}
                </option>
              ))}
            </select>
          </label>

          <Allegati
            voci={n.allegati.map((a) => ({
              chiave: a.id,
              tipo: a.tipo,
              url: link[a.storage_path],
              miniatura: a.tipo === 'foto' ? link[percorsoMiniatura(a.storage_path)] : undefined,
            }))}
            onAggiungi={aggiungiAllegati}
            onRimuovi={modificabile ? chiediRimozione : undefined}
            attesa={attesa}
          />
        </div>

        {errore && <p className="errore riquadro">{errore}</p>}

        <Commenti
          nota={n}
          commenti={commenti}
          io={io}
          liste={liste}
          onInviato={() => esegui(async () => {}, 'Commento inviato')}
        />

        <button
          className={`pulsante grande larga ${n.chiusa ? '' : 'primario'}`}
          onClick={() =>
            esegui(() => aggiornaNota(n.id, { chiusa: !n.chiusa }), n.chiusa ? 'Nota riaperta' : 'Nota chiusa')
          }
        >
          {n.chiusa ? 'Riapri nota' : 'Chiudi nota'}
        </button>
        {!modificabile && (
          <p className="nota-campo centrata">
            Solo l'autore della nota o un admin può modificarne riferimenti e testo, eliminarla o eliminare foto e vocali.
          </p>
        )}
      </div>

      {modifica && (
        <ModificaNota
          nota={n}
          liste={liste}
          onChiudi={() => setModifica(false)}
          onSalva={async (campi) => {
            await aggiornaNota(n.id, campi)
            setModifica(false)
            await ricarica()
            onCambiata()
            onMessaggio('Nota aggiornata')
          }}
        />
      )}

      {conferma && (
        <Conferma
          testo={conferma.testo}
          etichettaConferma="Elimina"
          attesa={attesa === 'eliminazione'}
          onAnnulla={() => setConferma(null)}
          onConferma={async () => {
            setAttesa('eliminazione')
            await conferma.azione()
            setAttesa(null)
            setConferma(null)
          }}
        />
      )}
    </div>
  )
}

// ---------- Commenti ----------

function Commenti({
  nota,
  commenti,
  io,
  liste,
  onInviato,
}: {
  nota: Nota
  commenti: Commento[]
  io: Operatore
  liste: Liste
  onInviato: () => void
}) {
  const attivi = liste.operatori.filter((o) => o.attivo)
  const iniziale = attivi.some((o) => o.id === io.id) ? io.id : (ultimoOperatore() ?? '')
  const [operatore, setOperatore] = useState(attivi.some((o) => o.id === iniziale) ? iniziale : '')
  const [testo, setTesto] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

  async function invia(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    if (!operatore) return setErrore("Scegli l'operatore.")
    if (!testo.trim()) return setErrore('Scrivi il commento.')
    setInvio(true)
    try {
      await aggiungiCommento(nota.id, operatore, testo.trim())
      ricordaOperatore(operatore)
      setTesto('')
      onInviato()
    } catch (err) {
      setErrore((err as Error).message)
    } finally {
      setInvio(false)
    }
  }

  return (
    <section className="commenti">
      <h3>Commenti {commenti.length > 0 && <span className="contatore">{commenti.length}</span>}</h3>
      {commenti.length === 0 && <p className="nota-campo">Nessun commento.</p>}
      <ul>
        {commenti.map((c) => (
          <li key={c.id} className="scheda commento">
            <div className="commento-alto">
              <strong>{nomeOperatore(liste, c.operatore_id)}</strong>
              <span>{dataOra(c.created_at)}</span>
            </div>
            <p>{c.testo}</p>
          </li>
        ))}
      </ul>
      <form className="modulo scheda nuovo-commento" onSubmit={invia}>
        <SceltaOperatore operatori={attivi} valore={operatore} onCambia={setOperatore} vuota="Scegli operatore" />
        <textarea rows={2} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi un commento…" />
        {errore && <p className="errore">{errore}</p>}
        <button className="pulsante primario" disabled={invio}>
          {invio ? 'Invio…' : 'Invia'}
        </button>
      </form>
    </section>
  )
}

// ---------- Modifica (solo autore o admin) ----------

function ModificaNota({
  nota,
  liste,
  onChiudi,
  onSalva,
}: {
  nota: Nota
  liste: Liste
  onChiudi: () => void
  onSalva: (campi: { rif_commessa: string; rif_bancale: string; destinatario_id: string | null; testo: string }) => Promise<void>
}) {
  const [commessa, setCommessa] = useState(nota.rif_commessa ?? '')
  const [bancale, setBancale] = useState(nota.rif_bancale ?? '')
  const [destinatario, setDestinatario] = useState(nota.destinatario_id ?? '')
  const [testo, setTesto] = useState(nota.testo ?? '')
  const [errore, setErrore] = useState<string | null>(null)
  const [attesa, setAttesa] = useState(false)
  const operatori = liste.operatori.filter((o) => o.attivo || o.id === nota.destinatario_id)

  async function salva(e: FormEvent) {
    e.preventDefault()
    setErrore(null)
    setAttesa(true)
    try {
      await onSalva({ rif_commessa: commessa.trim(), rif_bancale: bancale.trim(), destinatario_id: destinatario || null, testo: testo.trim() })
    } catch (err) {
      setErrore((err as Error).message)
      setAttesa(false)
    }
  }

  return (
    <div className="foglio">
      <div className="foglio-testata">
        <button className="link" onClick={onChiudi}>Annulla</button>
        <h2>Modifica nota</h2>
      </div>
      <form className="foglio-corpo modulo" onSubmit={salva}>
        <CampoCodice etichetta="Rif Commessa" valore={commessa} onCambia={setCommessa} />
        <CampoCodice etichetta="Rif Bancale" valore={bancale} onCambia={setBancale} />
        <label>
          Destinatario
          <SceltaOperatore operatori={operatori} valore={destinatario} onCambia={setDestinatario} vuota="Nessun destinatario" vuotaSelezionabile />
        </label>
        <label>
          Nota
          <textarea rows={5} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Descrivi il problema…" />
        </label>
        {errore && <p className="errore">{errore}</p>}
        <button className="pulsante primario grande" disabled={attesa}>
          {attesa ? 'Salvataggio…' : 'Salva modifiche'}
        </button>
      </form>
    </div>
  )
}

