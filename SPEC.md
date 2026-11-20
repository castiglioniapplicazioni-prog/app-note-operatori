# App Note Operatori — specifica per la ricostruzione

> Ricostruzione su **Supabase + GitHub** dell'app Zite "Note Operatori" (workspace Castiglioni).
> Scritta per Claude Code: contiene tutto il necessario per costruire l'app da zero.
> Fonti: schema e dati del database Zite + cronologia completa dei requisiti dati a Zite (ott 2026).

---

## 1. Scopo
App interna Castiglioni per prendere **note di produzione** dallo smartphone.
Un operatore apre una nota su una commessa/bancale (testo, foto, vocali, azione richiesta,
eventuale destinatario); gli altri la commentano; la nota viene **chiusa** quando il problema è risolto.
Dal PC c'è una vista **Archivio** per consultare, filtrare, esportare e stampare.

## 2. Stack e convenzioni
- **Stesso stack, struttura, stile e deploy dell'app "Validazione / Test colla"** (GitHub + Supabase).
  Prima di scrivere codice, aprire quel repo e replicarne: framework, struttura cartelle,
  client Supabase, gestione sessione, componenti UI, procedura di pubblicazione.
- **Login con numero di telefono**, identico all'app test colla. Solo operatori censiti
  (niente registrazione libera). L'utente auth si collega alla riga `operatori` tramite `telefono`
  (trigger `link_operatore_on_signup` nello schema; se l'app test colla usa un meccanismo diverso,
  adattare il trigger a quel meccanismo).
- Lingua UI: **italiano**. Mobile-first; installabile come PWA (icona su Home).
- Colore principale: **verde** (pulsanti, FAB +, badge azione). Icona: foglia verde Castiglioni.
- Date in formato `gg/mm/aaaa`, ore 24h, fuso Europe/Rome.

## 3. Modello dati — `supabase/001_schema.sql`
| Tabella | Contenuto |
|---|---|
| `operatori` | nome, codice, email, telefono, `is_admin` (= "Editor" di Zite), `attivo`, link a `auth.users` |
| `azioni` | lista azioni, flag `attiva` (disattivate = non selezionabili nei form ma visibili sulle note vecchie) |
| `note` | codice `N-AAAAMMGG-HHMMSS` (auto), data (oggi), autore, destinatario (opz.), rif. commessa, rif. bancale, azione, testo, chiusa (+ chi/quando), `created_by` |
| `note_allegati` | foto e vocali; file nel bucket privato `note-allegati` con path `<nota_id>/<uuid>.<ext>` |
| `commenti` | nota, operatore, testo, data/ora |

Seed — `supabase/002_seed.sql`: 6 azioni e 12 operatori reali; admin = Luca.
**I telefoni degli operatori vanno compilati** prima del primo login.
Le 9 note presenti in Zite sono di test: **non si migrano**.

## 4. Permessi
| Azione | Chi |
|---|---|
| Vedere tutte le note (Archivio, Chiuse) | tutti gli operatori loggati |
| Creare nota, commentare, aggiungere foto/vocali, cambiare azione, chiudere/riaprire | tutti |
| Modificare commessa, bancale, destinatario, testo | autore della nota (`created_by` = utente, oppure `autore_id` = operatore loggato) o admin |
| Eliminare nota | autore o admin (da Dettaglio); **in Archivio solo admin** |
| Eliminare singola foto / vocale | autore o admin |
| Modificare Liste (operatori, azioni) | solo admin; gli altri le vedono in sola lettura con un avviso |

I controlli sono applicati **lato server** (RLS + trigger `note_before_update`), non solo nascondendo i pulsanti.
Quando si elimina una nota, l'app deve prima eliminare i suoi file dallo Storage
(le righe di `note_allegati` e `commenti` vanno via in cascata).

## 5. Navigazione (mobile)
Barra in basso con 5 voci: **Aperte · Chiuse · [+ grande verde centrale] · Liste · Archivio**.

### 5.1 Aperte (home)
- Titolo "Note aperte" con contatore.
- Casella di ricerca: "Cerca commessa, bancale, operatore, testo…".
- **Mostra solo**: note aperte create dall'utente **OR** destinate all'utente **OR** senza destinatario.
  Se l'utente non è riconosciuto come operatore → solo note senza destinatario.
- Ordinamento: dalla più recente (data, poi ora di creazione).
- Card nota: data · badge azione (verde, in alto a destra) · `# commessa` in grassetto se presente ·
  testo (1–2 righe) · riga icone: autore (e "→ destinatario" se presente), n° foto, n° commenti.
- Tap → Dettaglio nota.

### 5.2 Chiuse
Come Aperte ma `chiusa = true`, **tutte le note chiuse** (nessun filtro per utente).

### 5.3 Ricerca (in Aperte e Chiuse)
Cerca in: codice nota, commessa, bancale, testo, nome operatore, nome azione.

### 5.4 Nuova nota (pulsante +)
Campi, nell'ordine:
1. **Data** — mostrata in alto a destra, automatica = oggi (non modificabile).
2. **Operatore \*** — select dagli operatori attivi; **preselezionato** con l'operatore dell'utente loggato.
   Fallback: ultimo operatore scelto su quel dispositivo (localStorage).
3. **Destinatario** — select con prima voce "Nessun destinatario" (default); deve essere sempre possibile tornare a nessuno.
4. **Rif Commessa** — input testo + pulsante verde **scansione barcode**.
5. **Rif Bancale** — idem.
6. **Azione** — select solo azioni attive ("Scegli azione").
7. **Nota** — textarea "Descrivi il problema…".
8. **Vocale** — pulsanti **Registra** (registrazione dal microfono, MediaRecorder → webm/mp4 a seconda del browser; più vocali per nota) e **Allega** (file audio). Lista dei vocali con player e X per rimuovere prima del salvataggio.
9. **Foto** — pulsanti **Scatta** (`capture="environment"`) e **Galleria** (selezione multipla da archivio telefono/PC). Miniature con X. Comprimere/ridimensionare le foto lato client prima dell'upload (es. lato lungo 1920px, JPEG ~0.8).
- **Salva**: richiede Operatore + almeno un altro campo compilato. Dopo il salvataggio → Dettaglio o lista Aperte.

### 5.5 Scanner codici a barre (requisito importante — su Zite ha dato problemi)
Al tap sul pulsante di scansione si apre un pannello con due modalità:
1. **In alto, consigliata: "Scatta una foto del codice (più preciso)"** → apre la fotocamera nativa
   (`<input type="file" accept="image/*" capture="environment">`), che ha autofocus vero e messa a fuoco da vicino;
   l'app decodifica il codice dall'immagine e lo inserisce nel campo.
   Deve riconoscere codici storti/verticali e i formati: EAN-13/8, Code128, Code39, ITF, Codabar, QR, Data Matrix.
   (es. libreria `zxing-wasm` / `@zxing/library` con `TRY_HARDER`, provando anche rotazioni a 90°.)
2. **Sotto: lettura dal vivo** dalla fotocamera: scegliere la camera posteriore **principale**
   (non l'ultra-grandangolo, scartare device con label "ultra"/"wide"), zoom iniziale **2x** se supportato
   con pulsanti 1x/2x/3x/4x, pulsante **torcia** se supportato, mirino con riquadro e linea rossa.
- Il campo resta sempre modificabile a mano.

### 5.6 Dettaglio nota
- Intestazione: codice nota, data, stato (Aperta/Chiusa), autore "→ destinatario".
- Riferimenti: commessa, bancale. Testo della nota.
- Pulsanti **Modifica** e **Elimina** (rosso, con conferma): visibili solo ad autore/admin.
  Modifica permette di cambiare: commessa, bancale (con scanner), destinatario (anche "Nessun destinatario"), testo.
- **Azione**: modificabile da tutti (select azioni attive).
- **Foto**: griglia miniature, tap = ingrandisci; pulsanti Scatta / Galleria per aggiungerne altre (tutti);
  X rossa sulla miniatura per eliminare (solo autore/admin, con conferma).
- **Vocali**: player per ciascuno; Registra / Allega per aggiungerne (tutti); X rossa per eliminare (solo autore/admin).
- **Commenti**: elenco cronologico (nome operatore, data/ora, testo). Form in fondo:
  select operatore (preselezionato = utente loggato, fallback ultimo usato) + testo + Invia.
- Pulsante **Chiudi nota** / **Riapri nota** (tutti).

### 5.7 Liste
Due sezioni: **Operatori** e **Azioni**.
- Admin: aggiungere operatore (nome, email, **telefono**, flag admin), modificarlo, disattivarlo/eliminarlo;
  aggiungere azione, attivarla/disattivarla, eliminarla.
- Sotto ogni operatore: email/telefono oppure "nessun contatto".
- Non admin: sola lettura con avviso "Solo gli amministratori possono modificare le liste".

## 6. Archivio (pensato per PC, raggiungibile anche da `/archivio`)
- In alto: numero di note trovate e riga "Collegato come <nome> · (Admin)".
- **Filtri** combinabili:
  - ricerca libera (stessi campi della ricerca mobile);
  - **Stato**: Tutte / Aperte / Chiuse — **default Aperte**;
  - **Dal / Al** (intervallo date);
  - **Operatore** (autore) — default libero;
  - **Azione**;
  - **Destinatario**: "Tutti i destinatari" (default), "Per me + senza destinatario", singoli operatori.
  - Pulsante **Azzera**: toglie tutti i filtri (Stato → Tutte).
- **Tabella**: Data, N° nota, Commessa, Bancale, Operatore, Destinatario, Azione, Stato, Testo, N° commenti,
  miniature delle prime 4 foto (+N se di più). Colonne ordinabili con click sul titolo; paginazione da 50.
- Click su riga → **pannello laterale** con tutti i dati, foto grandi (click = apre a piena grandezza in nuova scheda
  per salvarla), vocali ascoltabili, commenti.
  - Pulsante **Stampa PDF** della singola nota: pagina A4 con dati (numero, data, stato, commessa, bancale,
    operatore, destinatario, azione), testo, commenti e **tutte le foto, due per riga**; la stampa parte quando le foto sono caricate.
  - Pulsante **Elimina** (rosso, conferma): **solo admin**.
- **Scarica Excel (CSV)**: le note filtrate (tutte le pagine), separatore `;` e BOM UTF-8 per Excel italiano;
  per ogni nota: campi, link alle foto e ai vocali (signed URL a lunga scadenza o link all'app), testo dei commenti concatenato.
- **Stampa / PDF elenco**: tutte le note filtrate (non solo la pagina) con miniature.

## 7. Comportamenti trasversali
- Operatore dell'utente loggato riconosciuto da `operatori.auth_user_id`; usato per preselezioni, scheda Aperte, permessi.
- Signed URL per mostrare foto/vocali (bucket privato).
- Conferma prima di ogni eliminazione ("non si può annullare").
- Feedback di caricamento durante upload foto/vocali.

## 8. Passi per Claude Code
1. Leggere questo file e il repo dell'app test colla (stack, login, deploy).
2. Creare il progetto Supabase "app-note", eseguire `supabase/001_schema.sql` e `supabase/002_seed.sql`.
3. Configurare l'auth via telefono come nell'app test colla; compilare i telefoni degli operatori.
4. Costruire il frontend (sezioni 5–7), mobile-first + Archivio desktop.
5. Testare con almeno due utenti (admin e operatore normale) i permessi della sezione 4.
6. Creare il repo GitHub `app-note-operatori` e pubblicare come per le altre app.
