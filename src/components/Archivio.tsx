import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NOTE_PER_PAGINA } from '../config'
import { apriFinestraStampa, scaricaCsv, stampaElenco, stampaNota } from '../esporta'
import { dataBreve, dataOra } from '../format'
import { contaCommenti, corrisponde, nomeAzione, nomeOperatore } from '../ricerca'
import { caricaCommenti, caricaNote, eliminaNota, percorsoMiniatura } from '../supabase'
import type { Commento, Liste, Nota, Operatore } from '../types'
import Conferma from './Conferma'
import Icona from './Icone'
import { useLink } from './useLink'

interface Props {
  io: Operatore
  liste: Liste
  versione: number
  onCambiata: () => void
  onMessaggio: (t: string) => void
}

type Stato = 'tutte' | 'aperte' | 'chiuse'

interface Filtri {
  testo: string
  stato: Stato
  dal: string
  al: string
  autore: string
  azione: string
  destinatario: string // '' = tutti, 'mio' = per me + senza destinatario, altrimenti id
}

const FILTRI_INIZIALI: Filtri = { testo: '', stato: 'aperte', dal: '', al: '', autore: '', azione: '', destinatario: '' }

type Colonna = 'data' | 'codice' | 'commessa' | 'bancale' | 'operatore' | 'destinatario' | 'azione' | 'stato' | 'testo' | 'commenti'

const COLONNE: { id: Colonna; titolo: string }[] = [
  { id: 'data', titolo: 'Data' },
  { id: 'codice', titolo: 'N° nota' },
  { id: 'commessa', titolo: 'Commessa' },
  { id: 'bancale', titolo: 'Bancale' },
  { id: 'operatore', titolo: 'Operatore' },
  { id: 'destinatario', titolo: 'Destinatario' },
  { id: 'azione', titolo: 'Azione' },
  { id: 'stato', titolo: 'Stato' },
  { id: 'testo', titolo: 'Testo' },
  { id: 'commenti', titolo: 'Comm.' },
]

function valoreColonna(n: Nota, c: Colonna, liste: Liste): string | number {
  switch (c) {
    case 'data': return n.data + n.created_at
    case 'codice': return n.codice
    case 'commessa': return n.rif_commessa ?? ''
    case 'bancale': return n.rif_bancale ?? ''
    case 'operatore': return nomeOperatore(liste, n.autore_id)
    case 'destinatario': return nomeOperatore(liste, n.destinatario_id)
    case 'azione': return nomeAzione(liste, n.azione_id)
    case 'stato': return n.chiusa ? 1 : 0
    case 'testo': return n.testo ?? ''
    case 'commenti': return contaCommenti(n)
  }
}

// Archivio (SPEC 6): pensato per PC, funziona anche dal telefono
export default function Archivio({ io, liste, versione, onCambiata, onMessaggio }: Props) {
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_INIZIALI)
  const [note, setNote] = useState<Nota[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [ordine, setOrdine] = useState<{ colonna: Colonna; crescente: boolean }>({ colonna: 'data', crescente: false })
  const [pagina, setPagina] = useState(0)
  const [selezionata, setSelezionata] = useState<string | null>(null)
  const [lavoro, setLavoro] = useState<string | null>(null)

  // stato e date si filtrano nel database, il resto qui
  useEffect(() => {
    let annullato = false
    setErrore(null)
    caricaNote({
      chiusa: filtri.stato === 'tutte' ? undefined : filtri.stato === 'chiuse',
      dal: filtri.dal || undefined,
      al: filtri.al || undefined,
    })
      .then((n) => !annullato && setNote(n))
      .catch(() => !annullato && setErrore('Impossibile caricare le note. Controlla la connessione.'))
    return () => {
      annullato = true
    }
  }, [filtri.stato, filtri.dal, filtri.al, versione])

  const filtrate = useMemo(() => {
    if (!note) return []
    const r = note.filter(
      (n) =>
        (!filtri.autore || n.autore_id === filtri.autore) &&
        (!filtri.azione || n.azione_id === filtri.azione) &&
        (!filtri.destinatario ||
          (filtri.destinatario === 'mio'
            ? n.destinatario_id === io.id || !n.destinatario_id
            : n.destinatario_id === filtri.destinatario)) &&
        corrisponde(n, liste, filtri.testo),
    )
    const verso = ordine.crescente ? 1 : -1
    return r.sort((a, b) => {
      const va = valoreColonna(a, ordine.colonna, liste)
      const vb = valoreColonna(b, ordine.colonna, liste)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'it', { numeric: true })
      return c * verso || b.created_at.localeCompare(a.created_at)
    })
  }, [note, filtri, liste, io.id, ordine])

  useEffect(() => setPagina(0), [filtri, ordine])

  const pagine = Math.max(1, Math.ceil(filtrate.length / NOTE_PER_PAGINA))
  const inPagina = filtrate.slice(pagina * NOTE_PER_PAGINA, (pagina + 1) * NOTE_PER_PAGINA)
  const miniature = useLink(
    inPagina.flatMap((n) => n.allegati.filter((a) => a.tipo === 'foto').slice(0, 4)),
    true,
  )
  const nota = note?.find((n) => n.id === selezionata) ?? null

  function cambia<K extends keyof Filtri>(k: K, v: Filtri[K]) {
    setFiltri((f) => ({ ...f, [k]: v }))
  }

  function ordinaPer(colonna: Colonna) {
    setOrdine((o) => ({ colonna, crescente: o.colonna === colonna ? !o.crescente : colonna !== 'data' }))
  }

  function descrizioneFiltri(): string {
    const parti = [filtri.stato === 'tutte' ? 'Tutte le note' : filtri.stato === 'aperte' ? 'Note aperte' : 'Note chiuse']
    if (filtri.dal) parti.push(`dal ${dataBreve(filtri.dal)}`)
    if (filtri.al) parti.push(`al ${dataBreve(filtri.al)}`)
    if (filtri.autore) parti.push(`operatore ${nomeOperatore(liste, filtri.autore)}`)
    if (filtri.azione) parti.push(`azione ${nomeAzione(liste, filtri.azione)}`)
    if (filtri.destinatario) parti.push(filtri.destinatario === 'mio' ? 'per me + senza destinatario' : `destinatario ${nomeOperatore(liste, filtri.destinatario)}`)
    if (filtri.testo) parti.push(`ricerca "${filtri.testo}"`)
    return parti.join(', ')
  }

  async function esporta() {
    setLavoro('Preparazione del file…')
    try {
      await scaricaCsv(filtrate, liste)
    } catch {
      onMessaggio('Esportazione non riuscita')
    } finally {
      setLavoro(null)
    }
  }

  async function stampa() {
    const f = apriFinestraStampa()
    if (!f) return onMessaggio('Il browser ha bloccato la finestra di stampa')
    try {
      await stampaElenco(f, filtrate, liste, descrizioneFiltri())
    } catch {
      f.close()
      onMessaggio('Stampa non riuscita')
    }
  }

  return (
    <section className="archivio">
      <div className="archivio-testata">
        <div>
          <h2>{note ? `${filtrate.length} note trovate` : 'Archivio'}</h2>
          <p className="nota-campo">
            Collegato come {io.nome}
            {io.is_admin && ' · (Admin)'}
          </p>
        </div>
        <div className="archivio-comandi">
          <button className="pulsante" onClick={esporta} disabled={!filtrate.length || Boolean(lavoro)}>
            <Icona nome="scarica" dimensione={18} /> {lavoro ?? 'Scarica Excel (CSV)'}
          </button>
          <button className="pulsante" onClick={stampa} disabled={!filtrate.length}>
            <Icona nome="stampa" dimensione={18} /> Stampa / PDF elenco
          </button>
        </div>
      </div>

      <div className="scheda filtri-archivio">
        <input
          type="search"
          className="filtro-testo"
          placeholder="Cerca commessa, bancale, operatore, testo…"
          value={filtri.testo}
          onChange={(e) => cambia('testo', e.target.value)}
        />
        <label>
          Stato
          <select value={filtri.stato} onChange={(e) => cambia('stato', e.target.value as Stato)}>
            <option value="tutte">Tutte</option>
            <option value="aperte">Aperte</option>
            <option value="chiuse">Chiuse</option>
          </select>
        </label>
        <label>
          Dal
          <input type="date" value={filtri.dal} onChange={(e) => cambia('dal', e.target.value)} />
        </label>
        <label>
          Al
          <input type="date" value={filtri.al} onChange={(e) => cambia('al', e.target.value)} />
        </label>
        <label>
          Operatore
          <select value={filtri.autore} onChange={(e) => cambia('autore', e.target.value)}>
            <option value="">Tutti gli operatori</option>
            {liste.operatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </label>
        <label>
          Azione
          <select value={filtri.azione} onChange={(e) => cambia('azione', e.target.value)}>
            <option value="">Tutte le azioni</option>
            {liste.azioni.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </label>
        <label>
          Destinatario
          <select value={filtri.destinatario} onChange={(e) => cambia('destinatario', e.target.value)}>
            <option value="">Tutti i destinatari</option>
            <option value="mio">Per me + senza destinatario</option>
            {liste.operatori.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </label>
        <button className="pulsante" onClick={() => setFiltri({ ...FILTRI_INIZIALI, stato: 'tutte' })}>
          Azzera
        </button>
      </div>

      {errore && <p className="errore riquadro">{errore}</p>}
      {!note && !errore && <p className="vuoto">Caricamento…</p>}
      {note && !filtrate.length && <p className="vuoto">Nessuna nota con questi filtri.</p>}

      {filtrate.length > 0 && (
        <div className="scheda tabella-scorri">
          <table className="tabella-note">
            <thead>
              <tr>
                {COLONNE.map((c) => (
                  <th key={c.id} onClick={() => ordinaPer(c.id)} className={ordine.colonna === c.id ? 'ordinata' : ''}>
                    {c.titolo}
                    {ordine.colonna === c.id && (ordine.crescente ? ' ▲' : ' ▼')}
                  </th>
                ))}
                <th>Foto</th>
              </tr>
            </thead>
            <tbody>
              {inPagina.map((n) => {
                const foto = n.allegati.filter((a) => a.tipo === 'foto')
                return (
                  <tr key={n.id} onClick={() => setSelezionata(n.id)} className={n.id === selezionata ? 'selezionata' : ''}>
                    <td className="nowrap">{dataBreve(n.data)}</td>
                    <td className="nowrap">{n.codice}</td>
                    <td><strong>{n.rif_commessa}</strong></td>
                    <td>{n.rif_bancale}</td>
                    <td>{nomeOperatore(liste, n.autore_id)}</td>
                    <td>{nomeOperatore(liste, n.destinatario_id)}</td>
                    <td>{nomeAzione(liste, n.azione_id) && <span className="badge-azione">{nomeAzione(liste, n.azione_id)}</span>}</td>
                    <td><span className={`stato ${n.chiusa ? 'stato-chiusa' : 'stato-aperta'}`}>{n.chiusa ? 'Chiusa' : 'Aperta'}</span>{n.presa_in_carico && !n.chiusa && <> <span className="stato stato-in-carico">In carico</span></>}</td>
                    <td className="cella-testo">{n.testo}</td>
                    <td className="centrata">{contaCommenti(n) || ''}</td>
                    <td className="cella-foto">
                      {foto.slice(0, 4).map((a) => {
                        const u = miniature[percorsoMiniatura(a.storage_path)] ?? miniature[a.storage_path]
                        return u ? <img key={a.id} src={u} alt="" onError={(e) => miniature[a.storage_path] && (e.currentTarget.src = miniature[a.storage_path])} /> : <span key={a.id} className="mini-vuota" />
                      })}
                      {foto.length > 4 && <span className="altre">+{foto.length - 4}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagine > 1 && (
        <div className="paginazione">
          <button className="pulsante piccolo" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>‹ Precedenti</button>
          <span>Pagina {pagina + 1} di {pagine}</span>
          <button className="pulsante piccolo" disabled={pagina >= pagine - 1} onClick={() => setPagina(pagina + 1)}>Successive ›</button>
        </div>
      )}

      {nota && (
        <PannelloNota
          key={nota.id}
          nota={nota}
          io={io}
          liste={liste}
          onChiudi={() => setSelezionata(null)}
          onEliminata={() => {
            setSelezionata(null)
            onCambiata()
            onMessaggio('Nota eliminata')
          }}
          onMessaggio={onMessaggio}
        />
      )}
    </section>
  )
}

// Pannello laterale con tutti i dati della nota
function PannelloNota({
  nota,
  io,
  liste,
  onChiudi,
  onEliminata,
  onMessaggio,
}: {
  nota: Nota
  io: Operatore
  liste: Liste
  onChiudi: () => void
  onEliminata: () => void
  onMessaggio: (t: string) => void
}) {
  const [commenti, setCommenti] = useState<Commento[] | null>(null)
  const [conferma, setConferma] = useState(false)
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const link = useLink(nota.allegati, false)
  const foto = nota.allegati.filter((a) => a.tipo === 'foto')
  const vocali = nota.allegati.filter((a) => a.tipo === 'vocale')

  useEffect(() => {
    caricaCommenti(nota.id).then(setCommenti).catch(() => setCommenti([]))
  }, [nota.id])

  async function stampa() {
    const f = apriFinestraStampa()
    if (!f) return onMessaggio('Il browser ha bloccato la finestra di stampa')
    try {
      await stampaNota(f, nota, liste, commenti ?? (await caricaCommenti(nota.id)))
    } catch {
      f.close()
      onMessaggio('Stampa non riuscita')
    }
  }

  const riga = (titolo: string, valore: ReactNode) => (
    <div>
      <dt>{titolo}</dt>
      <dd>{valore || '—'}</dd>
    </div>
  )

  return (
    <>
    <div className="velo" onClick={onChiudi}>
      <aside className="pannello-laterale" onClick={(e) => e.stopPropagation()}>
        <div className="pannello-testata">
          <h2>{nota.codice}</h2>
          <button className="icona-pulsante" onClick={onChiudi} aria-label="Chiudi">
            <Icona nome="chiudi" />
          </button>
        </div>
        <div className="pannello-comandi">
          <button className="pulsante" onClick={stampa}>
            <Icona nome="stampa" dimensione={18} /> Stampa PDF
          </button>
          {io.is_admin && (
            <button className="pulsante pericolo" onClick={() => setConferma(true)}>
              <Icona nome="cestino" dimensione={18} /> Elimina
            </button>
          )}
        </div>
        {errore && <p className="errore riquadro">{errore}</p>}
        <dl className="scheda dettaglio">
          {riga('Data', dataBreve(nota.data))}
          {riga('Presa in carico', nota.presa_in_carico ? `Sì${nota.presa_in_carico_at ? ' il ' + dataOra(nota.presa_in_carico_at) : ''}${nota.presa_in_carico_da ? ' da ' + nomeOperatore(liste, nota.presa_in_carico_da) : ''}` : 'No')}
          {riga('Stato', nota.chiusa ? `Chiusa${nota.chiusa_at ? ' il ' + dataOra(nota.chiusa_at) : ''}${nota.chiusa_da ? ' da ' + nomeOperatore(liste, nota.chiusa_da) : ''}` : 'Aperta')}
          {riga('Commessa', nota.rif_commessa && <strong>{nota.rif_commessa}</strong>)}
          {riga('Bancale', nota.rif_bancale)}
          {riga('Operatore', nomeOperatore(liste, nota.autore_id))}
          {riga('Destinatario', nomeOperatore(liste, nota.destinatario_id))}
          {riga('Azione', nomeAzione(liste, nota.azione_id))}
          {riga('Creata il', dataOra(nota.created_at))}
        </dl>
        {nota.testo && <p className="scheda testo-nota">{nota.testo}</p>}

        {foto.length > 0 && (
          <>
            <h3>Foto ({foto.length})</h3>
            <div className="foto-grandi">
              {foto.map((a) =>
                link[a.storage_path] ? (
                  <a key={a.id} href={link[a.storage_path]} target="_blank" rel="noreferrer" title="Apri a piena grandezza">
                    <img src={link[a.storage_path]} alt="Foto" />
                  </a>
                ) : (
                  <div key={a.id} className="mini-vuota grande" />
                ),
              )}
            </div>
          </>
        )}
        {vocali.length > 0 && (
          <>
            <h3>Vocali ({vocali.length})</h3>
            <ul className="elenco-vocali">
              {vocali.map((a) => (
                <li key={a.id}>{link[a.storage_path] ? <audio controls preload="metadata" src={link[a.storage_path]} /> : '…'}</li>
              ))}
            </ul>
          </>
        )}
        <h3>Commenti {commenti && `(${commenti.length})`}</h3>
        {!commenti ? (
          <p className="nota-campo">Caricamento…</p>
        ) : commenti.length === 0 ? (
          <p className="nota-campo">Nessun commento.</p>
        ) : (
          <ul className="commenti">
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
        )}
      </aside>
    </div>

      {conferma && (
        <Conferma
          testo={`Eliminare la nota ${nota.codice} con foto, vocali e commenti? L'operazione non si può annullare.`}
          etichettaConferma="Elimina"
          attesa={attesa}
          onAnnulla={() => setConferma(false)}
          onConferma={async () => {
            setAttesa(true)
            try {
              await eliminaNota(nota)
              onEliminata()
            } catch (err) {
              setErrore((err as Error).message)
              setAttesa(false)
              setConferma(false)
            }
          }}
        />
      )}
    </>
  )
}
