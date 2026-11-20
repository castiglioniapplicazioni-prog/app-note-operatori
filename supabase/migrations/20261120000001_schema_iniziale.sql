-- =====================================================================
-- App Note Operatori — schema iniziale
-- Ricostruito dall'app Zite "Note Operatori" (vedi SPEC.md, sezioni 3-4)
-- e adattato al login dell'app Controllo Produzione:
--   telefono → email fittizia <telefono>@operatori.local + password personale,
--   creata al primo accesso dalla Edge Function "primo_accesso", che collega
--   l'utente Auth alla riga di operatori (operatori.auth_user_id).
--   (Al posto del trigger link_operatore_on_signup dello SPEC.)
--
-- Permessi (SPEC sezione 4):
--   tutti gli operatori    → vedono tutto; creano note, commentano, aggiungono
--                            foto/vocali, cambiano azione, chiudono/riaprono
--   autore della nota/admin → modificano commessa, bancale, destinatario, testo;
--                            eliminano nota, foto e vocali
--   admin (is_admin)       → gestisce le liste (operatori, azioni)
--
-- "Contesto fidato" = nessun utente collegato (auth.uid() nullo): SQL Editor
-- di Supabase, seed e Edge Function con la service key.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Funzioni di utilità
-- ---------------------------------------------------------------------

-- Data italiana (il server Supabase lavora in UTC)
create or replace function public.oggi_italia()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Rome')::date;
$$;

-- Telefono normalizzato: solo cifre, senza prefisso +39 / 0039.
-- La stessa regola è nell'app (src/telefono.ts) e nelle Edge Function.
create or replace function public.normalizza_telefono(t text)
returns text
language sql
immutable
as $$
  select case
    when d like '0039%' then substr(d, 5)
    when d like '39%' and length(d) > 10 then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g') as d) x;
$$;


-- ---------------------------------------------------------------------
-- OPERATORI  (Zite: Operatori + Editor App → is_admin)
-- ---------------------------------------------------------------------
create table public.operatori (
  id            uuid primary key default gen_random_uuid(),
  codice        text unique,                 -- Zite "id operatore" (es. Stefano_B)
  nome          text not null,               -- nome visualizzato (es. "Stefano B")
  email         text,
  telefono      text,                        -- nome utente per il login (solo cifre, senza +39)
  auth_user_id  uuid references auth.users (id) on delete set null,
  is_admin      boolean not null default false,
  attivo        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint operatori_nome_obbligatorio check (length(trim(nome)) > 0),
  constraint operatori_telefono_formato  check (telefono is null or telefono ~ '^[0-9]{6,15}$'),
  constraint operatori_telefono_unico    unique (telefono),
  constraint operatori_auth_user_unico   unique (auth_user_id)
);

-- Funzioni sul profilo dell'utente collegato.
-- "security definer": leggono operatori senza passare dalle RLS
-- (altrimenti le policy di operatori chiamerebbero sé stesse).
-- Un operatore disattivato non risulta operatore: non vede né scrive nulla.
create or replace function public.current_operatore_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id from public.operatori where auth_user_id = auth.uid() and attivo;
$$;

create or replace function public.is_operatore()
returns boolean
language sql
stable
as $$
  select public.current_operatore_id() is not null;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.operatori where auth_user_id = auth.uid() and attivo), false);
$$;

-- Controlli che le policy da sole non possono esprimere
create or replace function public.operatori_controlli()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.auth_user_id is not null then
      raise exception 'Questo operatore ha già fatto il primo accesso: si elimina con il pulsante Elimina dell''app (solo admin) oppure si disattiva.';
    end if;
    return old;
  end if;

  new.nome := trim(new.nome);
  new.codice := nullif(trim(new.codice), '');
  new.email := nullif(trim(new.email), '');
  new.telefono := nullif(public.normalizza_telefono(new.telefono), '');

  if auth.uid() is null then
    return new;  -- contesto fidato
  end if;

  if tg_op = 'INSERT' then
    new.auth_user_id := null;  -- il collegamento lo crea solo la Edge Function del primo accesso
    new.created_at := now();
    return new;
  end if;

  -- UPDATE dall'app
  new.id := old.id;
  new.auth_user_id := old.auth_user_id;
  new.created_at := old.created_at;

  if old.auth_user_id = auth.uid() and (new.is_admin <> old.is_admin or new.attivo <> old.attivo) then
    raise exception 'Non puoi cambiare il tuo ruolo di admin né disattivarti da solo.';
  end if;

  -- il telefono è il nome utente: cambiarlo dopo il primo accesso romperebbe il login
  if old.auth_user_id is not null and new.telefono is distinct from old.telefono then
    raise exception 'Per cambiare il telefono di un operatore che ha già fatto il primo accesso, usa prima "Reimposta accesso".';
  end if;

  return new;
end;
$$;

create trigger operatori_controlli
  before insert or update or delete on public.operatori
  for each row execute function public.operatori_controlli();

-- Deve restare sempre almeno un admin attivo
create or replace function public.operatori_almeno_un_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.operatori where is_admin and attivo) then
    raise exception 'Deve restare almeno un amministratore attivo.';
  end if;
  return null;
end;
$$;

create trigger operatori_almeno_un_admin
  after update or delete on public.operatori
  for each statement execute function public.operatori_almeno_un_admin();


-- ---------------------------------------------------------------------
-- AZIONI  (lista valori; disattivate = non selezionabili ma visibili sulle note vecchie)
-- ---------------------------------------------------------------------
create table public.azioni (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  attiva     boolean not null default true,
  ordine     int not null default 0,
  created_at timestamptz not null default now(),
  constraint azioni_nome_obbligatorio check (length(trim(nome)) > 0)
);


-- ---------------------------------------------------------------------
-- NOTE
-- ---------------------------------------------------------------------
create table public.note (
  id              uuid primary key default gen_random_uuid(),
  codice          text unique not null,                                     -- N-AAAAMMGG-HHMMSS (trigger)
  data            date not null default public.oggi_italia(),
  autore_id       uuid not null references public.operatori (id),            -- "Operatore"
  destinatario_id uuid references public.operatori (id) on delete set null,  -- null = "Nessun destinatario"
  rif_commessa    text,
  rif_bancale     text,
  azione_id       uuid references public.azioni (id) on delete set null,
  testo           text,
  chiusa          boolean not null default false,
  chiusa_at       timestamptz,
  chiusa_da       uuid references public.operatori (id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at      timestamptz not null default now()
);
create index note_stato_data_idx on public.note (chiusa, data desc, created_at desc);
create index note_autore_idx on public.note (autore_id);
create index note_destinatario_idx on public.note (destinatario_id);

-- Allegati: foto e vocali. File nel bucket privato "note-allegati": <nota_id>/<uuid>.<ext>
-- (per le foto l'app salva anche la miniatura <nota_id>/<uuid>.mini.jpg)
create table public.note_allegati (
  id           uuid primary key default gen_random_uuid(),
  nota_id      uuid not null references public.note (id) on delete cascade,
  tipo         text not null check (tipo in ('foto', 'vocale')),
  storage_path text not null,
  filename     text,
  mime_type    text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  constraint allegati_percorso_della_nota check (storage_path like nota_id::text || '/%')
);
create index note_allegati_nota_idx on public.note_allegati (nota_id, tipo);

-- COMMENTI
create table public.commenti (
  id           uuid primary key default gen_random_uuid(),
  nota_id      uuid not null references public.note (id) on delete cascade,
  operatore_id uuid not null references public.operatori (id),
  testo        text not null,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  constraint commenti_testo_obbligatorio check (length(trim(testo)) > 0)
);
create index commenti_nota_idx on public.commenti (nota_id, created_at);


-- ---------------------------------------------------------------------
-- Autore di una nota = account che l'ha creata OPPURE operatore indicato come autore
-- ---------------------------------------------------------------------
create or replace function public.is_autore(p_nota uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.note n
     where n.id = p_nota
       and (n.created_by = auth.uid() or n.autore_id = public.current_operatore_id())
  );
$$;

-- Come is_autore, ma partendo dal percorso di un file nello Storage (<nota_id>/...).
-- Un percorso che non inizia con un uuid valido dà false (niente errori di conversione).
create or replace function public.is_autore_percorso(percorso text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  cartella text := split_part(percorso, '/', 1);
begin
  if cartella !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_autore(cartella::uuid);
end;
$$;


-- ---------------------------------------------------------------------
-- Automatismi delle note
-- ---------------------------------------------------------------------

-- Inserimento: codice automatico, data di oggi, created_by = utente collegato
create or replace function public.note_before_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base text := 'N-' || to_char(now() at time zone 'Europe/Rome', 'YYYYMMDD-HH24MISS');
  n int := 1;
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.data := public.oggi_italia();
    new.created_at := now();
    new.codice := null;  -- sempre automatico dall'app
  end if;

  if new.codice is null then
    -- due note nello stesso secondo: N-...-2, N-...-3 ...
    new.codice := base;
    while exists (select 1 from public.note where codice = new.codice) loop
      n := n + 1;
      new.codice := base || '-' || n;
    end loop;
  end if;

  new.rif_commessa := nullif(trim(new.rif_commessa), '');
  new.rif_bancale := nullif(trim(new.rif_bancale), '');
  new.testo := nullif(trim(new.testo), '');

  if new.chiusa then
    new.chiusa_at := coalesce(new.chiusa_at, now());
    new.chiusa_da := coalesce(new.chiusa_da, public.current_operatore_id());
  else
    new.chiusa_at := null;
    new.chiusa_da := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_note_before_insert
  before insert on public.note
  for each row execute function public.note_before_insert();

-- Modifica:
--  - chiunque (operatore) può cambiare azione e aprire/chiudere
--  - solo autore o admin cambiano commessa, bancale, destinatario, testo, autore, data
create or replace function public.note_before_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.rif_commessa := nullif(trim(new.rif_commessa), '');
  new.rif_bancale := nullif(trim(new.rif_bancale), '');
  new.testo := nullif(trim(new.testo), '');

  if auth.uid() is not null
     and not (public.is_admin() or old.created_by = auth.uid() or old.autore_id = public.current_operatore_id()) then
    if new.rif_commessa    is distinct from old.rif_commessa
    or new.rif_bancale     is distinct from old.rif_bancale
    or new.destinatario_id is distinct from old.destinatario_id
    or new.testo           is distinct from old.testo
    or new.autore_id       is distinct from old.autore_id
    or new.data            is distinct from old.data then
      raise exception 'Solo chi ha creato la nota o un admin può modificarla.';
    end if;
  end if;

  if new.chiusa and not old.chiusa then
    new.chiusa_at := now();
    new.chiusa_da := public.current_operatore_id();
  elsif not new.chiusa and old.chiusa then
    new.chiusa_at := null;
    new.chiusa_da := null;
  else
    new.chiusa_at := old.chiusa_at;
    new.chiusa_da := old.chiusa_da;
  end if;

  new.id := old.id;
  new.codice := old.codice;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_note_before_update
  before update on public.note
  for each row execute function public.note_before_update();

-- Allegati e commenti: created_by e data/ora li mette il database
create or replace function public.imposta_created_by()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

create trigger allegati_created_by
  before insert on public.note_allegati
  for each row execute function public.imposta_created_by();

create trigger commenti_created_by
  before insert on public.commenti
  for each row execute function public.imposta_created_by();


-- ---------------------------------------------------------------------
-- Regole di sicurezza (Row Level Security)
-- Lettura: ogni operatore vede tutte le note (il filtro della scheda
-- "Aperte" è un filtro di interfaccia, l'Archivio mostra tutto).
-- ---------------------------------------------------------------------
alter table public.operatori     enable row level security;
alter table public.azioni        enable row level security;
alter table public.note          enable row level security;
alter table public.note_allegati enable row level security;
alter table public.commenti      enable row level security;

revoke all on public.operatori, public.azioni, public.note, public.note_allegati, public.commenti from anon;

-- Liste: lettura a tutti gli operatori, scrittura solo admin
create policy "lettura operatori" on public.operatori
  for select to authenticated using (public.is_operatore());
create policy "inserimento operatori" on public.operatori
  for insert to authenticated with check (public.is_admin());
create policy "modifica operatori" on public.operatori
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "eliminazione operatori" on public.operatori
  for delete to authenticated using (public.is_admin());

create policy "lettura azioni" on public.azioni
  for select to authenticated using (public.is_operatore());
create policy "inserimento azioni" on public.azioni
  for insert to authenticated with check (public.is_admin());
create policy "modifica azioni" on public.azioni
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "eliminazione azioni" on public.azioni
  for delete to authenticated using (public.is_admin());

-- Note
create policy "lettura note" on public.note
  for select to authenticated using (public.is_operatore());
create policy "inserimento note" on public.note
  for insert to authenticated with check (public.is_operatore());
create policy "modifica note" on public.note
  for update to authenticated using (public.is_operatore()) with check (public.is_operatore());
create policy "eliminazione note" on public.note
  for delete to authenticated using (public.is_admin() or public.is_autore(id));

-- Allegati: tutti aggiungono; elimina solo autore della nota o admin
create policy "lettura allegati" on public.note_allegati
  for select to authenticated using (public.is_operatore());
create policy "inserimento allegati" on public.note_allegati
  for insert to authenticated with check (public.is_operatore());
create policy "eliminazione allegati" on public.note_allegati
  for delete to authenticated using (public.is_admin() or public.is_autore(nota_id));

-- Commenti: tutti leggono e scrivono; elimina solo admin
create policy "lettura commenti" on public.commenti
  for select to authenticated using (public.is_operatore());
create policy "inserimento commenti" on public.commenti
  for insert to authenticated with check (public.is_operatore());
create policy "eliminazione commenti" on public.commenti
  for delete to authenticated using (public.is_admin());


-- ---------------------------------------------------------------------
-- Accesso: stato di un telefono prima del login
-- ---------------------------------------------------------------------
-- Chiamata dalla schermata di accesso (quindi anche senza login).
-- Restituisce solo lo stato, mai altri dati dell'operatore:
--   'nuovo'        → operatore attivo senza password: mostrare "Crea la tua password"
--   'attivo'       → ha già la password: mostrare telefono + password
--   'disattivato'  → operatore disattivato
--   'sconosciuto'  → telefono non registrato
create or replace function public.stato_accesso(telefono text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select case
              when not o.attivo then 'disattivato'
              when o.auth_user_id is null then 'nuovo'
              else 'attivo'
            end
       from public.operatori o
      where o.telefono = public.normalizza_telefono(stato_accesso.telefono)
        and public.normalizza_telefono(stato_accesso.telefono) <> ''),
    'sconosciuto');
$$;

revoke all on function public.stato_accesso(text) from public;
grant execute on function public.stato_accesso(text) to anon, authenticated;
