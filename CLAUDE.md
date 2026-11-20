# App Note Operatori

Web app mobile (PWA) per le **note di produzione** Castiglioni: un operatore apre una nota su
commessa/bancale (testo, foto, vocali, azione, destinatario), gli altri commentano, la nota si chiude
quando il problema è risolto. Dal PC c'è l'**Archivio** (filtri, CSV, stampa).
Ricostruzione dell'app Zite "Note Operatori": la specifica completa è in `SPEC.md`.
L'utente (Luca) è alle prime armi: spiega le modifiche in italiano, in modo semplice, un passo alla volta.

## Stack (come Controllo Produzione, `../controllo_produzione`)
- Vite + React 19 + TypeScript, CSS semplice in `src/styles.css`
- Supabase: Auth (telefono → email fittizia `<telefono>@operatori.local` + password creata al primo
  accesso), Postgres con RLS e trigger, Storage (bucket privato `note-allegati`), Edge Functions
  (`primo_accesso`, `reimposta_accesso`, `elimina_operatore`)
- GitHub Pages (`base: './'`), workflow `.github/workflows/deploy.yml`

## Comandi
- `npm run dev` — avvia in locale (raggiungibile dal telefono sulla stessa Wi-Fi)
- `npm run dev:https` — come dev ma in HTTPS: serve per fotocamera e microfono dal telefono
- `npm run build` — controllo dei tipi + build in `dist/`
- `npm run test:db` — migrazioni + seed su Postgres in memoria (PGlite) e prova dei permessi (SPEC §4)
- `supabase db push --remote` — applica le nuove migrazioni al progetto collegato
- `supabase functions deploy <nome> --use-api` — pubblica una Edge Function

## Struttura
- `supabase/migrations/` — schema versionato (fonte di verità). Mai modificare una migrazione già
  applicata: aggiungerne una nuova e aggiornare `supabase/tests/permessi.mjs`.
  (`supabase/001_schema.sql` e `002_seed.sql` sono gli originali dello SPEC, solo come riferimento.)
- `supabase/seed.sql` — azioni e operatori reali: NON è su GitHub (email dei colleghi), solo su questo Mac
- `src/supabase.ts` — client e tutte le query; `src/permessi.ts` — stesse regole del database
- `src/components/` — schermate (ElencoNote, NuovaNota, DettaglioNota, PaginaListe, Archivio…)

## Regole di dominio
- Permessi (SPEC §4), applicati da RLS + trigger `note_before_update`: tutti vedono tutto, creano,
  commentano, aggiungono foto/vocali, cambiano azione, chiudono/riaprono. Solo autore (`created_by`
  = utente o `autore_id` = suo operatore) o admin modificano commessa/bancale/destinatario/testo ed
  eliminano nota, foto, vocali. In Archivio elimina solo l'admin. Liste: scrittura solo admin.
- Codice nota `N-AAAAMMGG-HHMMSS` (+ `-2`, `-3` se nello stesso secondo), data, `created_by`,
  chiusa_at/chiusa_da li imposta il database.
- Scheda Aperte: note mie OR destinate a me OR senza destinatario. Chiuse: tutte.
- Allegati: `<nota_id>/<uuid>.<ext>`; per le foto anche la miniatura `<uuid>.mini.jpg` (360px).
  Foto compresse sul telefono (1920px, JPEG 0.8). Eliminando una nota si cancellano prima i file.
- Scanner (SPEC §5.5): 1) foto con la fotocamera di sistema decodificata da `src/leggiFoto.ts`
  (rotazioni 0/90/180/270/45/315); 2) lettura dal vivo `ScannerDalVivo.tsx` (principale, zoom 2x, torcia).
- Telefono normalizzato: solo cifre, senza +39/0039 (`normalizza_telefono` in SQL e `src/telefono.ts`).
- Sempre almeno un admin attivo; nessuno si toglie l'admin o si disattiva da solo.
- Date gg/mm/aaaa, ore 24h, fuso Europe/Rome (`src/format.ts`). UI in italiano, verde primario.

## Sicurezza
- Mai committare `.env.local`. Nell'app solo la chiave anon/publishable; service key SOLO nelle Edge Function.
- La protezione sta nelle policy RLS e nei trigger, non nell'interfaccia.
