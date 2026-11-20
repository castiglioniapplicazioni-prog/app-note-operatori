import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Accesso from './components/Accesso'
import CambiaPassword from './components/CambiaPassword'
import DettaglioNota from './components/DettaglioNota'
import ElencoNote from './components/ElencoNote'
import Icona, { type NomeIcona } from './components/Icone'
import NuovaNota from './components/NuovaNota'
import PaginaListe from './components/PaginaListe'
import { caricaAzioni, caricaNote, caricaOperatori, caricaProfilo, supabase, supabaseConfigurato } from './supabase'
import type { Liste, Nota, Operatore } from './types'

const Archivio = lazy(() => import('./components/Archivio'))

export default function App() {
  const [sessione, setSessione] = useState<Session | null | undefined>(undefined)
  const [profilo, setProfilo] = useState<Operatore | null | undefined>(undefined)
  const [avviso, setAvviso] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigurato) return
    supabase.auth.getSession().then(({ data }) => setSessione(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessione(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // dopo il login: carica l'operatore collegato; se è disattivato lo fa uscire
  const authUserId = sessione?.user.id
  useEffect(() => {
    if (!authUserId) {
      setProfilo(undefined)
      return
    }
    caricaProfilo(authUserId)
      .then((p) => {
        if (p) {
          setProfilo(p)
          setAvviso(null)
        } else {
          setAvviso("Accesso disattivato. Rivolgiti all'amministratore.")
          supabase.auth.signOut()
        }
      })
      .catch(() => setAvviso('Impossibile caricare il profilo. Controlla la connessione e riprova.'))
  }, [authUserId])

  if (!supabaseConfigurato) return <DaConfigurare />
  if (sessione === undefined) return <p className="vuoto">Caricamento…</p>
  if (!sessione) return <Accesso key={avviso ?? ''} avviso={avviso} />
  if (!profilo) {
    return avviso ? <ErroreProfilo messaggio={avviso} /> : <p className="vuoto">Caricamento…</p>
  }
  return <Principale profilo={profilo} email={sessione.user.email ?? ''} />
}

type Scheda = 'aperte' | 'chiuse' | 'liste' | 'archivio'

const SCHEDE: { id: Scheda; titolo: string; icona: NomeIcona }[] = [
  { id: 'aperte', titolo: 'Aperte', icona: 'aperte' },
  { id: 'chiuse', titolo: 'Chiuse', icona: 'chiuse' },
  { id: 'liste', titolo: 'Liste', icona: 'liste' },
  { id: 'archivio', titolo: 'Archivio', icona: 'archivio' },
]

// La scheda è nell'indirizzo (#/aperte, #/archivio…): l'archivio si apre anche direttamente
function schedaDaIndirizzo(): Scheda {
  const s = location.hash.replace(/^#\/?/, '') as Scheda
  return SCHEDE.some((x) => x.id === s) ? s : 'aperte'
}

function Principale({ profilo, email }: { profilo: Operatore; email: string }) {
  const [scheda, setScheda] = useState<Scheda>(schedaDaIndirizzo)
  const [liste, setListe] = useState<Liste | null>(null)
  const [note, setNote] = useState<Nota[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [versione, setVersione] = useState(0)
  const [nuova, setNuova] = useState(false)
  const [aperta, setAperta] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [cambioPassword, setCambioPassword] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)

  useEffect(() => {
    const segui = () => setScheda(schedaDaIndirizzo())
    window.addEventListener('hashchange', segui)
    return () => window.removeEventListener('hashchange', segui)
  }, [])

  function vaiA(s: Scheda) {
    history.replaceState(null, '', `#/${s}`)
    setScheda(s)
  }

  useEffect(() => {
    if (!messaggio) return
    const t = setTimeout(() => setMessaggio(null), 2500)
    return () => clearTimeout(t)
  }, [messaggio])

  // operatori e azioni: servono a tutte le schede (nomi, menu a tendina)
  useEffect(() => {
    Promise.all([caricaOperatori(), caricaAzioni()])
      .then(([operatori, azioni]) => setListe({ operatori, azioni }))
      .catch(() => setErrore('Impossibile caricare i dati. Controlla la connessione e riprova.'))
  }, [versione])

  // note della scheda Aperte / Chiuse
  useEffect(() => {
    if (scheda !== 'aperte' && scheda !== 'chiuse') return
    let annullato = false
    setNote(null)
    setErrore(null)
    caricaNote({ chiusa: scheda === 'chiuse' })
      .then((n) => !annullato && setNote(n))
      .catch(() => !annullato && setErrore('Impossibile caricare le note. Controlla la connessione e riprova.'))
    return () => {
      annullato = true
    }
  }, [scheda, versione])

  const aggiorna = useCallback(() => setVersione((v) => v + 1), [])

  const titolo = SCHEDE.find((s) => s.id === scheda)!.titolo
  const larga = scheda === 'archivio'

  return (
    <div className={`app ${larga ? 'larga' : ''}`}>
      <header className="barra-alta">
        <img className="logo-piccolo" src="./logo.png" alt="Castiglioni" />
        <h1>{scheda === 'aperte' || scheda === 'chiuse' ? 'Note' : titolo}</h1>
        <button className="icona-pulsante" onClick={aggiorna} aria-label="Aggiorna">
          <Icona nome="aggiorna" />
        </button>
        <button className="icona-pulsante" onClick={() => setMenu(true)} aria-label="Menu">
          <Icona nome="menu" />
        </button>
      </header>

      <main className="contenuto">
        {!liste ? (
          <p className={errore ? 'errore riquadro' : 'vuoto'}>{errore ?? 'Caricamento…'}</p>
        ) : scheda === 'liste' ? (
          <PaginaListe io={profilo} liste={liste} onCambiate={aggiorna} onMessaggio={setMessaggio} />
        ) : scheda === 'archivio' ? (
          <Suspense fallback={<p className="vuoto">Caricamento…</p>}>
            <Archivio io={profilo} liste={liste} versione={versione} onCambiata={aggiorna} onMessaggio={setMessaggio} />
          </Suspense>
        ) : (
          <ElencoNote
            key={scheda}
            titolo={scheda === 'aperte' ? 'Note aperte' : 'Note chiuse'}
            note={note}
            errore={errore}
            liste={liste}
            io={profilo}
            soloMie={scheda === 'aperte'}
            onApri={(n) => setAperta(n.id)}
          />
        )}
      </main>

      <nav className="schede-basso">
        {SCHEDE.slice(0, 2).map((s) => (
          <PulsanteScheda key={s.id} scheda={s} attiva={scheda === s.id} onClick={() => vaiA(s.id)} />
        ))}
        <button className="nuova-nota" onClick={() => liste && setNuova(true)} aria-label="Nuova nota">
          <Icona nome="piu" dimensione={32} />
        </button>
        {SCHEDE.slice(2).map((s) => (
          <PulsanteScheda key={s.id} scheda={s} attiva={scheda === s.id} onClick={() => vaiA(s.id)} />
        ))}
      </nav>

      {nuova && liste && (
        <NuovaNota
          io={profilo}
          liste={liste}
          onChiudi={() => setNuova(false)}
          onSalvata={(n, avviso) => {
            setNuova(false)
            setMessaggio(avviso ?? 'Nota salvata')
            aggiorna()
            setAperta(n.id)
          }}
        />
      )}

      {aperta && liste && (
        <DettaglioNota
          notaId={aperta}
          io={profilo}
          liste={liste}
          onChiudi={() => setAperta(null)}
          onCambiata={aggiorna}
          onMessaggio={setMessaggio}
        />
      )}

      {menu && (
        <div className="velo" onClick={() => setMenu(false)}>
          <nav className="menu-laterale destra" onClick={(e) => e.stopPropagation()} aria-label="Menu">
            <div className="menu-utente">
              <strong>{profilo.nome}</strong>
              <small>{profilo.is_admin ? 'Amministratore' : 'Operatore'}</small>
            </div>
            <div className="menu-gruppo">
              <button className="menu-voce" onClick={() => { setMenu(false); setCambioPassword(true) }}>
                <Icona nome="chiave" /> Cambia password
              </button>
              <button className="menu-voce" onClick={() => supabase.auth.signOut()}>
                <Icona nome="esci" /> Esci
              </button>
            </div>
            <small className="menu-versione">Versione {__VERSIONE_APP__}</small>
          </nav>
        </div>
      )}

      {cambioPassword && (
        <CambiaPassword
          email={email}
          onChiudi={() => setCambioPassword(false)}
          onFatto={() => {
            setCambioPassword(false)
            setMessaggio('Password cambiata')
          }}
        />
      )}

      {messaggio && <div className="messaggio-breve">{messaggio}</div>}
    </div>
  )
}

function PulsanteScheda({ scheda, attiva, onClick }: { scheda: (typeof SCHEDE)[number]; attiva: boolean; onClick: () => void }) {
  return (
    <button className={attiva ? 'attiva' : ''} onClick={onClick}>
      <Icona nome={scheda.icona} />
      {scheda.titolo}
    </button>
  )
}

function ErroreProfilo({ messaggio }: { messaggio: string }) {
  return (
    <main className="schermata-centrale">
      <img className="logo" src="./logo.png" alt="Castiglioni" />
      <p className="errore riquadro">{messaggio}</p>
      <button className="pulsante" onClick={() => supabase.auth.signOut()}>
        Torna all'accesso
      </button>
    </main>
  )
}

function DaConfigurare() {
  return (
    <main className="schermata-centrale">
      <img className="logo" src="./logo.png" alt="Castiglioni" />
      <h1>Note Operatori</h1>
      <div className="scheda testo">
        <p><strong>Manca il collegamento a Supabase.</strong></p>
        <p>
          Crea il file <code>.env.local</code> copiando <code>.env.example</code> e inserisci URL e
          chiave del tuo progetto Supabase. Poi riavvia l'app.
        </p>
      </div>
    </main>
  )
}
