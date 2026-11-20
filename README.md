# Note Operatori

App da telefono per le **note di produzione**: si apre una nota su una commessa o un bancale
(testo, foto, vocali, azione richiesta, destinatario), i colleghi commentano, la nota si chiude
quando il problema è risolto. Dal PC c'è l'**Archivio** per cercare, esportare in Excel e stampare.

| Parte | Cosa fa |
|---|---|
| **App web** (`src/`) | Le schermate usate dal telefono e dal PC |
| **Supabase** | Database nel cloud, utenti e password, foto e vocali, piccole funzioni lato server |
| **GitHub Pages** | Pubblica l'app su internet, gratis |

## 1. Creare il progetto Supabase (una volta sola)

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**, nome `app-note`,
   una password per il database (conservala), regione **Central EU (Frankfurt)**.
2. **Authentication → Sign In / Providers**: disattiva **Allow new users to sign up** e,
   nella sezione Email, disattiva **Confirm email** → Save.

## 2. Schema, dati iniziali e funzioni

Dalla cartella del progetto, nel Terminale:

```bash
supabase link --project-ref <ref>               # <ref> = codice nell'indirizzo supabase.com/dashboard/project/<ref>
supabase db push --remote --include-seed        # tabelle, regole di sicurezza, bucket foto, 6 azioni, 12 operatori
supabase functions deploy primo_accesso reimposta_accesso elimina_operatore --use-api
```

Prova senza Supabase (database in memoria sul Mac): `npm run test:db`.

### Telefoni degli operatori

Si accede con il **numero di telefono**: senza numero un operatore non può entrare.
In Supabase → **SQL Editor** (solo cifre, senza +39):

```sql
update public.operatori set telefono = '3331234567' where codice = 'Luca';
```

Gli altri si possono aggiungere anche dall'app (scheda **Liste**, da admin).
Al primo accesso ognuno crea la propria password.

## 3. Collegare l'app

Copia `.env.example` in `.env.local` e inserisci **Project URL** e chiave **anon / publishable**
(pulsante **Connect** in alto nel progetto Supabase). Mai la chiave *service_role / secret*.

## 4. Avviare l'app sul Mac

```bash
npm install
npm run dev
```

Apri `http://localhost:5173`. Per fotocamera e microfono dal telefono serve HTTPS:
`npm run dev:https` e apri `https://<indirizzo Network>:5173` (accetta il certificato di prova).

## Pubblicazione (GitHub Pages)

A ogni modifica sul ramo `main` l'app si ripubblica da sola in circa un minuto.
URL e chiave publishable di Supabase sono **variabili** del repository
(Settings → Secrets and variables → Actions → Variables).

- App: `https://castiglioniapplicazioni-prog.github.io/app-note-operatori/`
- Archivio dal PC: `https://castiglioniapplicazioni-prog.github.io/app-note-operatori/archivio/`

### Installare sul telefono

- **iPhone (Safari)**: Condividi → **Aggiungi alla schermata Home**.
- **Android (Chrome)**: menu ⋮ → **Installa app**.
