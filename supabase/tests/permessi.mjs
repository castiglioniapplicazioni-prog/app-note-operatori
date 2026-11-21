// Prova migrazioni + seed + permessi (SPEC sezione 4) su PGlite,
// con un finto "auth" e un finto "storage" di Supabase.
// Uso: npm run test:db  (dalla cartella del progetto)
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'

const P = process.argv[2] ?? '.'
const db = new PGlite()
let ok = 0, ko = 0
const verifica = (cond, msg) => { cond ? ok++ : ko++; console.log(`${cond ? '✓' : '✗'} ${msg}`) }

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create schema auth; grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage; grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant all on storage.objects to authenticated;
`)
for (const f of readdirSync(`${P}/supabase/migrations`).sort())
  await db.exec(readFileSync(`${P}/supabase/migrations/${f}`, 'utf8'))
await db.exec(readFileSync(`${P}/supabase/seed.sql`, 'utf8'))
console.log('migrazioni e seed applicati')

const n = (sql, p) => db.query(sql, p).then((r) => r.rows)
verifica((await n('select count(*)::int c from azioni'))[0].c === 6, 'seed: 6 azioni')
verifica((await n('select count(*)::int c from operatori'))[0].c === 12, 'seed: 12 operatori')
verifica((await n(`select is_admin from operatori where codice = 'Luca'`))[0].is_admin === true, 'seed: Luca è admin')

// Utenti di prova: admin = Luca, op1 = Yari, op2 = Annalisa, op3 = Andrea (poi disattivato)
const U = { admin: 'a0000000-0000-4000-8000-000000000001', op1: 'a0000000-0000-4000-8000-000000000002',
            op2: 'a0000000-0000-4000-8000-000000000003', op3: 'a0000000-0000-4000-8000-000000000004' }
const CODICI = { admin: 'Luca', op1: 'Yari', op2: 'Annalisa', op3: 'Andrea' }
const O = {}
for (const [i, k] of Object.keys(U).entries()) {
  await db.query(`update operatori set telefono = $1 where codice = $2`, [`+39 300 000 000${i + 1}`, CODICI[k]])
  await db.query(`insert into auth.users values ($1, $2)`, [U[k], `300000000${i + 1}@operatori.local`])
  // collegamento come farebbe la Edge Function del primo accesso (contesto fidato)
  const r = await n(`update operatori set auth_user_id = $1 where codice = $2 returning id, telefono`, [U[k], CODICI[k]])
  O[k] = r[0].id
  if (i === 0) verifica(r[0].telefono === '3000000001', 'telefono normalizzato (senza +39 e spazi)')
}

async function come(utente, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${utente ? U[utente] : ''}', false);`)
  await db.exec(utente ? 'set role authenticated' : 'set role anon')
  try { return { r: await db.query(sql, params) } }
  catch (e) { return { e: e.message } }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`) }
}
const fidato = (sql, params) => db.query(sql, params).then((r) => ({ r }), (e) => ({ e: e.message }))
const azione = (await n(`select id from azioni where nome = 'Riparare'`))[0].id
const azione2 = (await n(`select id from azioni where nome = 'Sostituire'`))[0].id

// --- anon
let x = await come(null, 'select * from note')
verifica(x.e?.includes('permission denied'), 'anon: nessun accesso alle note')
x = await come(null, 'select * from operatori')
verifica(x.e?.includes('permission denied'), 'anon: nessun accesso agli operatori')

// --- creazione nota (op1)
x = await come('op1', `insert into note (autore_id, rif_commessa, testo, azione_id, codice, data, created_by)
  values ($1, ' 12345 ', 'Graffio sul pannello', $2, 'FALSO', '2020-01-01', $3) returning *`, [O.op1, azione, U.op2])
const nota = x.r?.rows[0]
verifica(!!nota, 'operatore crea una nota')
verifica(/^N-\d{8}-\d{6}$/.test(nota?.codice ?? ''), `codice automatico (${nota?.codice})`)
verifica(nota?.created_by === U.op1, 'created_by = utente collegato (valore del client ignorato)')
verifica(nota?.data !== '2020-01-01' && String(nota?.data) !== String(new Date('2020-01-01')), 'data = oggi (valore del client ignorato)')
verifica(nota?.rif_commessa === '12345', 'commessa ripulita dagli spazi')
x = await come('op1', `insert into note (autore_id, testo) values ($1, 'seconda') returning codice`, [O.op1])
verifica(x.r && x.r.rows[0].codice !== nota.codice, `due note nello stesso secondo: codici diversi (${x.r?.rows[0].codice})`)
const nota2 = (await n(`select id from note where testo = 'seconda'`))[0].id

// --- lettura
x = await come('op2', 'select count(*)::int c from note')
verifica(x.r?.rows[0].c === 2, 'altro operatore vede tutte le note')

// --- modifiche di un non autore (op2)
x = await come('op2', `update note set azione_id = $2 where id = $1 returning azione_id`, [nota.id, azione2])
verifica(x.r?.rows[0]?.azione_id === azione2, 'non autore cambia l\'azione')
x = await come('op2', `update note set chiusa = true where id = $1 returning chiusa_at, chiusa_da`, [nota.id])
verifica(x.r?.rows[0]?.chiusa_at && x.r.rows[0].chiusa_da === O.op2, 'non autore chiude la nota (chiusa_da/chiusa_at automatici)')
x = await come('op2', `update note set chiusa = false where id = $1 returning chiusa_at, chiusa_da`, [nota.id])
verifica(x.r?.rows[0] && x.r.rows[0].chiusa_at === null && x.r.rows[0].chiusa_da === null, 'non autore riapre la nota')
for (const [campo, valore] of [['rif_commessa', "'999'"], ['rif_bancale', "'B1'"], ['testo', "'altro'"],
                               ['destinatario_id', `'${O.op2}'`], ['autore_id', `'${O.op2}'`]]) {
  x = await come('op2', `update note set ${campo} = ${valore} where id = $1`, [nota.id])
  verifica(x.e?.includes('Solo chi ha creato'), `non autore NON modifica ${campo}`)
}
x = await come('op2', `delete from note where id = $1`, [nota.id])
verifica(x.r?.affectedRows === 0, 'non autore NON elimina la nota')

// --- autore (op1)
x = await come('op1', `update note set rif_commessa = '777', destinatario_id = $2, testo = 'nuovo testo', created_by = $3 where id = $1 returning *`, [nota.id, O.op2, U.op2])
verifica(x.r?.rows[0]?.rif_commessa === '777' && x.r.rows[0].destinatario_id === O.op2, 'autore modifica commessa, destinatario, testo')
verifica(x.r?.rows[0]?.created_by === U.op1, 'created_by non modificabile')
x = await come('op1', `update note set destinatario_id = null where id = $1 returning destinatario_id`, [nota.id])
verifica(x.r?.rows[0] && x.r.rows[0].destinatario_id === null, 'autore torna a "Nessun destinatario"')

// --- nota con autore_id = op2 creata da op1: anche op2 è autore
x = await come('op1', `insert into note (autore_id, testo) values ($1, 'per conto di op2') returning id`, [O.op2])
const nota3 = x.r?.rows[0].id
x = await come('op2', `update note set testo = 'modificata da op2' where id = $1`, [nota3])
verifica(x.r?.affectedRows === 1, 'operatore indicato come autore modifica la nota')

// --- admin modifica nota altrui
x = await come('admin', `update note set rif_bancale = 'BANC-1' where id = $1`, [nota.id])
verifica(x.r?.affectedRows === 1, 'admin modifica nota altrui')

// --- allegati
x = await come('op2', `insert into note_allegati (nota_id, tipo, storage_path) values ($1, 'foto', $2) returning created_by`, [nota.id, `${nota.id}/a.jpg`])
verifica(x.r?.rows[0]?.created_by === U.op2, 'non autore aggiunge una foto')
x = await come('op2', `insert into note_allegati (nota_id, tipo, storage_path) values ($1, 'foto', $2)`, [nota.id, `${nota2}/b.jpg`])
verifica(!!x.e, 'allegato con percorso di un\'altra nota rifiutato')
x = await come('op2', `delete from note_allegati where nota_id = $1`, [nota.id])
verifica(x.r?.affectedRows === 0, 'non autore NON elimina la foto (anche se l\'ha aggiunta lui)')
x = await come('op1', `delete from note_allegati where nota_id = $1`, [nota.id])
verifica(x.r?.affectedRows === 1, 'autore elimina la foto')

// --- storage
x = await come('op2', `insert into storage.objects (bucket_id, name) values ('note-allegati', $1)`, [`${nota.id}/c.jpg`])
verifica(x.r?.affectedRows === 1, 'operatore carica un file nello Storage')
x = await come('op2', `delete from storage.objects where name = $1`, [`${nota.id}/c.jpg`])
verifica(x.r?.affectedRows === 0, 'non autore NON elimina il file dallo Storage')
x = await come('op2', `delete from storage.objects where name = 'non-uuid/x.jpg'`)
verifica(!x.e, 'percorso non valido: nessun errore')
x = await come('op1', `delete from storage.objects where name = $1`, [`${nota.id}/c.jpg`])
verifica(x.r?.affectedRows === 1, 'autore elimina il file dallo Storage')
x = await come(null, `select * from storage.objects`)
verifica(!!x.e || x.r?.rows.length === 0, 'anon non vede i file')

// --- commenti
x = await come('op2', `insert into commenti (nota_id, operatore_id, testo) values ($1, $2, 'Visto') returning created_by`, [nota.id, O.op2])
verifica(x.r?.rows[0]?.created_by === U.op2, 'operatore commenta')
x = await come('op2', `insert into commenti (nota_id, operatore_id, testo) values ($1, $2, '   ')`, [nota.id, O.op2])
verifica(!!x.e, 'commento vuoto rifiutato')
x = await come('op1', `delete from commenti`)
verifica(x.r?.affectedRows === 0, 'operatore NON elimina commenti')

// --- eliminazione nota: autore sì (commenti e allegati in cascata)
await come('op2', `insert into note_allegati (nota_id, tipo, storage_path) values ($1, 'vocale', $2)`, [nota.id, `${nota.id}/v.webm`])
x = await come('op1', `delete from note where id = $1`, [nota.id])
verifica(x.r?.affectedRows === 1, 'autore elimina la nota')
verifica((await n('select count(*)::int c from commenti'))[0].c === 0 && (await n('select count(*)::int c from note_allegati'))[0].c === 0,
  'commenti e allegati eliminati in cascata')
x = await come('admin', `delete from note where id = $1`, [nota2])
verifica(x.r?.affectedRows === 1, 'admin elimina nota altrui')

// --- liste
x = await come('op1', `insert into azioni (nome) values ('Nuova')`)
verifica(!!x.e, 'operatore NON crea azioni')
x = await come('op1', `update azioni set attiva = false`)
verifica(x.r?.affectedRows === 0, 'operatore NON modifica azioni')
x = await come('op1', `insert into operatori (nome) values ('Tizio')`)
verifica(!!x.e, 'operatore NON crea operatori')
x = await come('op1', `update operatori set is_admin = true where id = $1`, [O.op1])
verifica(x.r?.affectedRows === 0, 'operatore NON si promuove admin')
x = await come('op1', 'select count(*)::int c from azioni')
verifica(x.r?.rows[0].c === 6, 'operatore legge le azioni')

x = await come('admin', `insert into azioni (nome, ordine) values ('Pulire', 7) returning id`)
verifica(!!x.r, 'admin crea un\'azione')
x = await come('admin', `update azioni set attiva = false where nome = 'Pulire'`)
verifica(x.r?.affectedRows === 1, 'admin disattiva un\'azione')
x = await come('admin', `delete from azioni where nome = 'Pulire'`)
verifica(x.r?.affectedRows === 1, 'admin elimina un\'azione')
x = await come('admin', `insert into operatori (nome, telefono, is_admin, auth_user_id) values ('Nuovo', '333 1112222', false, $1) returning auth_user_id, telefono`, [U.op1])
verifica(x.r?.rows[0]?.auth_user_id === null && x.r.rows[0].telefono === '3331112222', 'admin crea operatore (auth_user_id ignorato, telefono normalizzato)')
x = await come('admin', `insert into operatori (nome, telefono) values ('Doppio', '3331112222')`)
verifica(x.e?.includes('unique') || x.e?.includes('duplicate'), 'telefono duplicato rifiutato')
x = await come('admin', `update operatori set auth_user_id = $1 where id = $2`, [U.admin, O.op1])
verifica((await n('select auth_user_id from operatori where id = $1', [O.op1]))[0].auth_user_id === U.op1, 'auth_user_id non modificabile dall\'app')
x = await come('admin', `update operatori set telefono = '3339999999' where id = $1`, [O.op1])
verifica(x.e?.includes('Reimposta accesso'), 'telefono non modificabile dopo il primo accesso')
x = await come('admin', `update operatori set is_admin = false where id = $1`, [O.admin])
verifica(x.e?.includes('Non puoi'), 'admin non si toglie da solo il ruolo')
x = await come('admin', `update operatori set is_admin = true where id = $1`, [O.op2])
verifica(x.r?.affectedRows === 1, 'admin nomina un secondo admin')
x = await come('op2', `update operatori set is_admin = false where id = $1`, [O.op2])
verifica(x.e?.includes('Non puoi'), 'il secondo admin non si toglie da solo il ruolo')
x = await come('admin', `update operatori set is_admin = false where id = $1`, [O.op2])
verifica(x.r?.affectedRows === 1, 'admin toglie il ruolo al secondo admin')
x = await come('admin', `delete from operatori where id = $1`, [O.op1])
verifica(!!x.e, 'operatore con accesso non eliminabile direttamente')
x = await come('admin', `delete from operatori where nome = 'Nuovo'`)
verifica(x.r?.affectedRows === 1, 'admin elimina operatore mai entrato')
x = await come('admin', `delete from operatori where id = $1`, [O.op2])
verifica(!!x.e, 'operatore con note non eliminabile')

// --- presa in carico (solo il destinatario)
x = await come('op1', `insert into note (autore_id, destinatario_id, testo, presa_in_carico)
  values ($1, $2, 'per Annalisa', true) returning id, presa_in_carico`, [O.op1, O.op2])
const notaPer = x.r?.rows[0]
verifica(notaPer && notaPer.presa_in_carico === false, 'nota nuova nasce non presa in carico (valore del client ignorato)')
x = await come('op1', `update note set presa_in_carico = true where id = $1`, [notaPer.id])
verifica(x.e?.includes('Solo il destinatario'), 'autore (non destinatario) NON prende in carico')
x = await come('admin', `update note set presa_in_carico = true where id = $1`, [notaPer.id])
verifica(x.e?.includes('Solo il destinatario'), 'admin (non destinatario) NON prende in carico')
x = await come('op2', `update note set presa_in_carico = true, presa_in_carico_da = $2 where id = $1
  returning presa_in_carico, presa_in_carico_at, presa_in_carico_da`, [notaPer.id, O.op1])
verifica(x.r?.rows[0]?.presa_in_carico === true && x.r.rows[0].presa_in_carico_at && x.r.rows[0].presa_in_carico_da === O.op2,
  'destinatario prende in carico (data e "da" automatici)')
x = await come('op2', `update note set azione_id = $2 where id = $1 returning presa_in_carico, presa_in_carico_da`, [notaPer.id, azione])
verifica(x.r?.rows[0]?.presa_in_carico === true && x.r.rows[0].presa_in_carico_da === O.op2, 'altre modifiche non toccano la presa in carico')
x = await come('op2', `update note set presa_in_carico = false where id = $1 returning presa_in_carico_at`, [notaPer.id])
verifica(x.r?.rows[0] && x.r.rows[0].presa_in_carico_at === null, 'destinatario toglie la presa in carico')
await come('op2', `update note set presa_in_carico = true where id = $1`, [notaPer.id])
x = await come('op1', `update note set destinatario_id = $2 where id = $1 returning presa_in_carico, presa_in_carico_da`, [notaPer.id, O.admin])
verifica(x.r?.rows[0]?.presa_in_carico === false && x.r.rows[0].presa_in_carico_da === null, 'cambio destinatario azzera la presa in carico')
x = await come('op1', `insert into note (autore_id, testo) values ($1, 'senza destinatario') returning id`, [O.op1])
x = await come('op2', `update note set presa_in_carico = true where id = $1`, [x.r.rows[0].id])
verifica(x.e?.includes('Solo il destinatario'), 'nota senza destinatario: nessuno la prende in carico')

// --- operatore disattivato
x = await come('admin', `update operatori set attivo = false where id = $1`, [O.op3])
verifica(x.r?.affectedRows === 1, 'admin disattiva un operatore')
x = await come('op3', 'select count(*)::int c from note')
verifica(x.r?.rows[0].c === 0, 'operatore disattivato non vede nulla')
x = await come('op3', `insert into note (autore_id, testo) values ($1, 'x')`, [O.op3])
verifica(!!x.e, 'operatore disattivato non crea note')

// --- ultimo admin (contesto fidato)
x = await fidato(`update operatori set is_admin = false where id = $1`, [O.admin])
verifica(x.e?.includes('almeno un amministratore'), 'deve restare almeno un admin attivo')

// --- stato_accesso (chiamata senza login)
const stato = async (t) => (await come(null, 'select stato_accesso($1) s', [t])).r?.rows[0].s
await fidato(`update operatori set telefono = '3335550000' where codice = 'Moreno'`)
verifica(await stato('+39 333 555 0000') === 'nuovo', 'stato_accesso: nuovo (telefono con +39 e spazi)')
verifica(await stato('3000000002') === 'attivo', 'stato_accesso: attivo')
verifica(await stato('3000000004') === 'disattivato', 'stato_accesso: disattivato')
verifica(await stato('3999999999') === 'sconosciuto', 'stato_accesso: sconosciuto')
verifica(await stato('') === 'sconosciuto', 'stato_accesso: vuoto = sconosciuto (operatori senza telefono)')

console.log(`\n${ok} riuscite, ${ko} fallite`)
process.exit(ko ? 1 : 0)
