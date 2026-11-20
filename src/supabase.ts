import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import { emailDaTelefono, normalizzaTelefono } from './telefono'
import type { Allegato, Azione, Commento, DatiNota, Nota, Operatore, StatoAccesso } from './types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurato = Boolean(url && anonKey)

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'non-configurato')

const BUCKET = 'note-allegati'

// Chiama una Edge Function; in caso di errore lancia il messaggio in italiano restituito
async function chiamaFunzione(nome: string, corpo: object) {
  const { error } = await supabase.functions.invoke(nome, { body: corpo })
  if (!error) return
  if (error instanceof FunctionsHttpError) {
    const dettaglio = await error.context.json().catch(() => null)
    if (dettaglio?.errore) throw new Error(dettaglio.errore)
  }
  throw new Error('Servizio non raggiungibile, riprova.')
}

// ---------- Accesso (come Controllo Produzione) ----------

export async function statoAccesso(telefono: string): Promise<StatoAccesso> {
  const { data, error } = await supabase.rpc('stato_accesso', { telefono: normalizzaTelefono(telefono) })
  if (error) throw error
  return data as StatoAccesso
}

export async function accedi(telefono: string, password: string): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email: emailDaTelefono(telefono), password })
  return !error
}

export async function primoAccesso(telefono: string, password: string) {
  await chiamaFunzione('primo_accesso', { telefono: normalizzaTelefono(telefono), password })
  if (!(await accedi(telefono, password))) throw new Error('Password creata, ma accesso non riuscito: riprova.')
}

export async function cambiaPassword(email: string, attuale: string, nuova: string) {
  const { error: erroreVerifica } = await supabase.auth.signInWithPassword({ email, password: attuale })
  if (erroreVerifica) throw new Error('La password attuale non è corretta.')
  const { error } = await supabase.auth.updateUser({ password: nuova })
  if (error) throw new Error('Impossibile cambiare la password: ' + error.message)
}

export async function reimpostaAccesso(operatoreId: string) {
  await chiamaFunzione('reimposta_accesso', { operatore_id: operatoreId })
}

// Operatore collegato all'utente loggato; null se disattivato o non collegato
export async function caricaProfilo(authUserId: string): Promise<Operatore | null> {
  const { data, error } = await supabase
    .from('operatori')
    .select('*')
    .eq('auth_user_id', authUserId)
    .eq('attivo', true)
    .maybeSingle()
  if (error) throw error
  return data as Operatore | null
}

// ---------- Messaggi di errore comprensibili ----------

export function messaggioErrore(err: unknown, specifici: Record<string, string> = {}): string {
  const e = err as { code?: string; message?: string }
  for (const [chiave, testo] of Object.entries(specifici)) {
    if (e.code === chiave || e.message?.includes(chiave)) return testo
  }
  switch (e.code) {
    case '42501':
      return 'Non hai i permessi per questa operazione.'
    case '23503':
      return 'Il dato è usato altrove e non si può eliminare.'
    case '23505':
      return 'Esiste già un elemento con lo stesso valore.'
    case '23514':
      return 'Dati non validi.'
    case 'P0001':
      return e.message ?? 'Operazione non consentita.'
  }
  if (e.message?.includes('Failed to fetch')) return 'Connessione assente, riprova.'
  return e.message ?? 'Errore sconosciuto.'
}

// ---------- Liste: operatori e azioni ----------

const ERRORI_OPERATORE = {
  operatori_telefono_unico: 'Questo numero di telefono è già registrato.',
  operatori_codice_key: 'Esiste già un operatore con questo codice.',
  '23503': 'Questo operatore compare in alcune note: non si può eliminare, disattivalo.',
  operatori_telefono_formato: 'Numero di telefono non valido (servono da 6 a 15 cifre).',
  operatori_nome_obbligatorio: 'Il nome è obbligatorio.',
}

export async function caricaOperatori(): Promise<Operatore[]> {
  const { data, error } = await supabase.from('operatori').select('*').order('nome')
  if (error) throw error
  return data as Operatore[]
}

export type DatiOperatore = Pick<Operatore, 'nome' | 'codice' | 'email' | 'telefono' | 'is_admin' | 'attivo'>

export async function salvaOperatore(dati: DatiOperatore, id?: string) {
  const riga = { ...dati, telefono: dati.telefono ? normalizzaTelefono(dati.telefono) : null }
  if (!id) {
    const { error } = await supabase.from('operatori').insert(riga)
    if (error) throw new Error(messaggioErrore(error, ERRORI_OPERATORE))
    return
  }
  const { data, error } = await supabase.from('operatori').update(riga).eq('id', id).select('id')
  if (error) throw new Error(messaggioErrore(error, ERRORI_OPERATORE))
  if (!data.length) throw new Error('Non puoi modificare questo operatore.')
}

// Chi ha già fatto l'accesso si elimina tramite Edge Function (va cancellato anche
// l'utente di Supabase Auth); gli altri direttamente.
export async function eliminaOperatore(operatore: Operatore) {
  if (operatore.auth_user_id) {
    await chiamaFunzione('elimina_operatore', { operatore_id: operatore.id })
    return
  }
  const { data, error } = await supabase.from('operatori').delete().eq('id', operatore.id).select('id')
  if (error) throw new Error(messaggioErrore(error, ERRORI_OPERATORE))
  if (!data.length) throw new Error('Non puoi eliminare questo operatore.')
}

const ERRORI_AZIONE = {
  azioni_nome_key: 'Esiste già un\'azione con questo nome.',
  '23505': 'Esiste già un\'azione con questo nome.',
  azioni_nome_obbligatorio: 'Il nome è obbligatorio.',
}

export async function caricaAzioni(): Promise<Azione[]> {
  const { data, error } = await supabase.from('azioni').select('id, nome, attiva, ordine').order('ordine').order('nome')
  if (error) throw error
  return data as Azione[]
}

export async function salvaAzione(dati: Pick<Azione, 'nome' | 'attiva' | 'ordine'>, id?: string) {
  const { data, error } = id
    ? await supabase.from('azioni').update(dati).eq('id', id).select('id')
    : await supabase.from('azioni').insert(dati).select('id')
  if (error) throw new Error(messaggioErrore(error, ERRORI_AZIONE))
  if (!data.length) throw new Error('Non puoi modificare le azioni.')
}

export async function eliminaAzione(id: string) {
  const { data, error } = await supabase.from('azioni').delete().eq('id', id).select('id')
  if (error) throw new Error(messaggioErrore(error, ERRORI_AZIONE))
  if (!data.length) throw new Error('Non puoi eliminare le azioni.')
}

// ---------- Note ----------

const CAMPI_NOTA =
  '*, allegati:note_allegati(id, nota_id, tipo, storage_path, filename, mime_type, created_at), commenti(count)'

export interface FiltroServer {
  chiusa?: boolean
  dal?: string
  al?: string
}

// Tutte le note che rispettano il filtro, dalla più recente (a blocchi di 1000)
export async function caricaNote(filtro: FiltroServer = {}): Promise<Nota[]> {
  const tutte: Nota[] = []
  const BLOCCO = 1000
  for (let da = 0; ; da += BLOCCO) {
    let query = supabase.from('note').select(CAMPI_NOTA)
    if (filtro.chiusa !== undefined) query = query.eq('chiusa', filtro.chiusa)
    if (filtro.dal) query = query.gte('data', filtro.dal)
    if (filtro.al) query = query.lte('data', filtro.al)
    const { data, error } = await query
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(da, da + BLOCCO - 1)
    if (error) throw error
    tutte.push(...(data as unknown as Nota[]))
    if (data.length < BLOCCO) return tutte.map(ordinaAllegati)
  }
}

export async function caricaNota(id: string): Promise<Nota | null> {
  const { data, error } = await supabase.from('note').select(CAMPI_NOTA).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? ordinaAllegati(data as unknown as Nota) : null
}

function ordinaAllegati(n: Nota): Nota {
  n.allegati.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return n
}

export async function creaNota(dati: DatiNota): Promise<Nota> {
  const { data, error } = await supabase
    .from('note')
    .insert({ ...dati, rif_commessa: dati.rif_commessa || null, rif_bancale: dati.rif_bancale || null, testo: dati.testo || null })
    .select(CAMPI_NOTA)
    .single()
  if (error) throw new Error(messaggioErrore(error))
  return data as unknown as Nota
}

// Modifica parziale (es. solo azione, solo chiusa); le regole sono nel database
export async function aggiornaNota(id: string, campi: Partial<DatiNota & { chiusa: boolean }>) {
  const { data, error } = await supabase.from('note').update(campi).eq('id', id).select('id')
  if (error) throw new Error(messaggioErrore(error))
  if (!data.length) throw new Error('Non puoi modificare questa nota.')
}

// Prima i file nello Storage, poi la riga (allegati e commenti vanno via in cascata)
export async function eliminaNota(nota: Nota) {
  const { data: file } = await supabase.storage.from(BUCKET).list(nota.id, { limit: 1000 })
  const percorsi = new Set([
    ...(file ?? []).map((f) => `${nota.id}/${f.name}`),
    ...nota.allegati.flatMap((a) => percorsiFile(a)),
  ])
  if (percorsi.size) {
    const { error } = await supabase.storage.from(BUCKET).remove([...percorsi])
    if (error) throw new Error('Impossibile eliminare le foto/vocali: ' + error.message)
  }
  const { data, error } = await supabase.from('note').delete().eq('id', nota.id).select('id')
  if (error) throw new Error(messaggioErrore(error))
  if (!data.length) throw new Error('Non puoi eliminare questa nota.')
}

// ---------- Allegati (foto e vocali) ----------

// Miniatura di una foto: stesso nome con ".mini.jpg"
export function percorsoMiniatura(percorso: string): string {
  return percorso.replace(/\.[^./]+$/, '') + '.mini.jpg'
}

function percorsiFile(a: Allegato): string[] {
  return a.tipo === 'foto' ? [a.storage_path, percorsoMiniatura(a.storage_path)] : [a.storage_path]
}

function estensione(mime: string, nome?: string): string {
  const daNome = nome?.match(/\.([a-z0-9]{1,5})$/i)?.[1]
  if (daNome) return daNome.toLowerCase()
  if (mime.includes('jpeg')) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'bin'
}

export interface FileDaCaricare {
  tipo: 'foto' | 'vocale'
  file: Blob
  nome: string
  miniatura?: Blob
}

export async function caricaAllegato(notaId: string, f: FileDaCaricare): Promise<Allegato> {
  const mime = f.file.type || (f.tipo === 'foto' ? 'image/jpeg' : 'audio/webm')
  const percorso = `${notaId}/${crypto.randomUUID()}.${f.tipo === 'foto' ? 'jpg' : estensione(mime, f.nome)}`
  const archivio = supabase.storage.from(BUCKET)
  const { error: erroreFile } = await archivio.upload(percorso, f.file, { contentType: mime })
  if (erroreFile) throw new Error('Caricamento non riuscito: ' + erroreFile.message)
  if (f.miniatura) {
    await archivio.upload(percorsoMiniatura(percorso), f.miniatura, { contentType: 'image/jpeg' })
  }
  const { data, error } = await supabase
    .from('note_allegati')
    .insert({ nota_id: notaId, tipo: f.tipo, storage_path: percorso, filename: f.nome, mime_type: mime })
    .select('id, nota_id, tipo, storage_path, filename, mime_type, created_at')
    .single()
  if (error) {
    await archivio.remove([percorso, percorsoMiniatura(percorso)])
    throw new Error(messaggioErrore(error))
  }
  return data as Allegato
}

export async function eliminaAllegato(a: Allegato) {
  const { data, error } = await supabase.from('note_allegati').delete().eq('id', a.id).select('id')
  if (error) throw new Error(messaggioErrore(error))
  if (!data.length) throw new Error('Solo chi ha creato la nota o un admin può eliminare foto e vocali.')
  await supabase.storage.from(BUCKET).remove(percorsiFile(a))
}

// Link temporanei firmati (bucket privato), tenuti in memoria finché validi
const DURATA_LINK = 60 * 60 // 1 ora
const linkInMemoria = new Map<string, { url: string; scade: number }>()

export async function linkFirmati(percorsi: string[], durata = DURATA_LINK): Promise<Record<string, string>> {
  const adesso = Date.now()
  const risultato: Record<string, string> = {}
  const mancanti: string[] = []
  for (const p of new Set(percorsi)) {
    const l = durata === DURATA_LINK ? linkInMemoria.get(p) : undefined
    if (l && l.scade > adesso + 60_000) risultato[p] = l.url
    else mancanti.push(p)
  }
  for (let i = 0; i < mancanti.length; i += 500) {
    const blocco = mancanti.slice(i, i + 500)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(blocco, durata)
    if (error) throw error
    for (const d of data) {
      if (!d.signedUrl || !d.path) continue
      risultato[d.path] = d.signedUrl
      if (durata === DURATA_LINK) linkInMemoria.set(d.path, { url: d.signedUrl, scade: adesso + durata * 1000 })
    }
  }
  return risultato
}

// ---------- Commenti ----------

export async function caricaCommenti(notaId: string): Promise<Commento[]> {
  const { data, error } = await supabase
    .from('commenti')
    .select('id, nota_id, operatore_id, testo, created_at')
    .eq('nota_id', notaId)
    .order('created_at')
  if (error) throw error
  return data as Commento[]
}

// Commenti di più note insieme (export CSV e stampa)
export async function caricaCommentiDi(notaIds: string[]): Promise<Commento[]> {
  const tutti: Commento[] = []
  for (let i = 0; i < notaIds.length; i += 200) {
    const { data, error } = await supabase
      .from('commenti')
      .select('id, nota_id, operatore_id, testo, created_at')
      .in('nota_id', notaIds.slice(i, i + 200))
      .order('created_at')
    if (error) throw error
    tutti.push(...(data as Commento[]))
  }
  return tutti
}

export async function aggiungiCommento(notaId: string, operatoreId: string, testo: string) {
  const { error } = await supabase.from('commenti').insert({ nota_id: notaId, operatore_id: operatoreId, testo })
  if (error) throw new Error(messaggioErrore(error, { commenti_testo_obbligatorio: 'Scrivi il testo del commento.' }))
}
