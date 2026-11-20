-- =====================================================================
-- App Note Operatori — schema Supabase
-- Ricostruito dall'app Zite "Note Operatori" (workspace Castiglioni)
-- Vedi SPEC.md per la logica applicativa.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- OPERATORI  (Zite: Operatori + Editor App -> flag is_admin)
-- ---------------------------------------------------------------------
create table public.operatori (
  id            uuid primary key default gen_random_uuid(),
  codice        text unique,                 -- Zite "id operatore" (es. Stefano_B)
  nome          text not null,               -- nome visualizzato (es. "Stefano B")
  email         text,
  telefono      text unique,                 -- login via telefono, formato E.164 (+39...)
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  is_admin      boolean not null default false,   -- = "Editor" in Zite
  attivo        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AZIONI  (lista valori; disattivabili; solo admin modifica)
-- ---------------------------------------------------------------------
create table public.azioni (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  attiva     boolean not null default true,
  ordine     int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- NOTE
-- ---------------------------------------------------------------------
create table public.note (
  id              uuid primary key default gen_random_uuid(),
  codice          text unique not null
                  default ('N-' || to_char(now() at time zone 'Europe/Rome', 'YYYYMMDD-HH24MISS')),
  data            date not null default (now() at time zone 'Europe/Rome')::date,
  autore_id       uuid not null references public.operatori(id),           -- "Operatore" (preselezionato = utente loggato)
  destinatario_id uuid references public.operatori(id) on delete set null, -- null = "Nessun destinatario"
  rif_commessa    text,
  rif_bancale     text,
  azione_id       uuid references public.azioni(id) on delete set null,
  testo           text,
  chiusa          boolean not null default false,
  chiusa_at       timestamptz,
  chiusa_da       uuid references public.operatori(id),
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) default auth.uid(),       -- account che l'ha creata ("Creata Da")
  updated_at      timestamptz not null default now()
);
create index on public.note (chiusa, data desc, created_at desc);
create index on public.note (autore_id);
create index on public.note (destinatario_id);

-- Allegati: foto e vocali (Zite: tabella Foto + campo Vocale)
create table public.note_allegati (
  id           uuid primary key default gen_random_uuid(),
  nota_id      uuid not null references public.note(id) on delete cascade,
  tipo         text not null check (tipo in ('foto','vocale')),
  storage_path text not null,        -- path nel bucket "note-allegati": <nota_id>/<uuid>.<ext>
  filename     text,
  mime_type    text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) default auth.uid()
);
create index on public.note_allegati (nota_id, tipo);

-- COMMENTI
create table public.commenti (
  id           uuid primary key default gen_random_uuid(),
  nota_id      uuid not null references public.note(id) on delete cascade,
  operatore_id uuid not null references public.operatori(id),   -- preselezionato = utente loggato
  testo        text not null,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) default auth.uid()
);
create index on public.commenti (nota_id, created_at);

-- ---------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------
create or replace function public.current_operatore_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.operatori where auth_user_id = auth.uid() and attivo
$$;

create or replace function public.is_operatore()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_operatore_id() is not null
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.operatori where auth_user_id = auth.uid() and attivo), false)
$$;

-- Autore di una nota = account che l'ha creata OPPURE operatore indicato come autore
create or replace function public.is_autore(p_nota uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.note n
    where n.id = p_nota
      and (n.created_by = auth.uid() or n.autore_id = public.current_operatore_id())
  )
$$;

-- Primo login via telefono: collega l'utente auth all'operatore con lo stesso numero
create or replace function public.link_operatore_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone is not null then
    update public.operatori
       set auth_user_id = new.id
     where auth_user_id is null
       and right(regexp_replace(telefono, '\D', '', 'g'), 10) = right(regexp_replace(new.phone, '\D', '', 'g'), 10);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_operatore_on_signup();

-- Regole di modifica nota:
--  - chiunque (operatore) può cambiare azione e aprire/chiudere
--  - solo autore o admin possono cambiare commessa, bancale, destinatario, testo, autore, data
create or replace function public.note_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or old.created_by = auth.uid() or old.autore_id = public.current_operatore_id()) then
    if new.rif_commessa    is distinct from old.rif_commessa
    or new.rif_bancale     is distinct from old.rif_bancale
    or new.destinatario_id is distinct from old.destinatario_id
    or new.testo           is distinct from old.testo
    or new.autore_id       is distinct from old.autore_id
    or new.data            is distinct from old.data then
      raise exception 'Solo chi ha creato la nota o un admin può modificarla';
    end if;
  end if;

  if new.chiusa and not old.chiusa then
    new.chiusa_at := now();
    new.chiusa_da := public.current_operatore_id();
  elsif not new.chiusa and old.chiusa then
    new.chiusa_at := null;
    new.chiusa_da := null;
  end if;

  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end $$;

create trigger trg_note_before_update
  before update on public.note
  for each row execute function public.note_before_update();

-- ---------------------------------------------------------------------
-- RLS
-- Lettura: ogni operatore vede tutte le note (il filtro della scheda
-- "Aperte" è un filtro di interfaccia, l'Archivio mostra tutto).
-- ---------------------------------------------------------------------
alter table public.operatori     enable row level security;
alter table public.azioni        enable row level security;
alter table public.note          enable row level security;
alter table public.note_allegati enable row level security;
alter table public.commenti      enable row level security;

-- Liste: lettura a tutti gli operatori, scrittura solo admin
create policy op_read  on public.operatori for select to authenticated using (public.is_operatore());
create policy op_admin on public.operatori for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy az_read  on public.azioni    for select to authenticated using (public.is_operatore());
create policy az_admin on public.azioni    for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Note
create policy note_read   on public.note for select to authenticated using (public.is_operatore());
create policy note_insert on public.note for insert to authenticated with check (public.is_operatore());
create policy note_update on public.note for update to authenticated using (public.is_operatore()) with check (public.is_operatore());
create policy note_delete on public.note for delete to authenticated using (public.is_admin() or public.is_autore(id));

-- Allegati: tutti aggiungono; elimina solo autore della nota o admin
create policy all_read   on public.note_allegati for select to authenticated using (public.is_operatore());
create policy all_insert on public.note_allegati for insert to authenticated with check (public.is_operatore());
create policy all_delete on public.note_allegati for delete to authenticated using (public.is_admin() or public.is_autore(nota_id));

-- Commenti: tutti leggono e scrivono; elimina solo admin
create policy com_read   on public.commenti for select to authenticated using (public.is_operatore());
create policy com_insert on public.commenti for insert to authenticated with check (public.is_operatore());
create policy com_delete on public.commenti for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- STORAGE: bucket privato per foto e vocali  (path: <nota_id>/<file>)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('note-allegati', 'note-allegati', false)
on conflict (id) do nothing;

create policy "allegati read"   on storage.objects for select to authenticated
  using (bucket_id = 'note-allegati' and public.is_operatore());
create policy "allegati upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-allegati' and public.is_operatore());
create policy "allegati delete" on storage.objects for delete to authenticated
  using (bucket_id = 'note-allegati'
         and (public.is_admin() or public.is_autore(((storage.foldername(name))[1])::uuid)));
