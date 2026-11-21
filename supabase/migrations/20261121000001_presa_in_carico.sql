-- Presa in carico: il destinatario della nota indica che si sta occupando del problema.
-- Regole (applicate dal database, non dall'interfaccia):
--   * solo il destinatario della nota può attivarla o disattivarla;
--   * data/ora e chi l'ha presa in carico li imposta il database;
--   * se cambia il destinatario, la presa in carico si azzera;
--   * una nota nuova nasce sempre "non presa in carico".

alter table public.note
  add column presa_in_carico    boolean not null default false,
  add column presa_in_carico_at timestamptz,
  add column presa_in_carico_da uuid references public.operatori (id) on delete set null;

create or replace function public.note_presa_in_carico()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.presa_in_carico := false;
      new.presa_in_carico_at := null;
      new.presa_in_carico_da := null;
    end if;
    return new;
  end if;

  if new.destinatario_id is distinct from old.destinatario_id then
    -- nuovo destinatario: deve prenderla in carico lui
    new.presa_in_carico := false;
    new.presa_in_carico_at := null;
    new.presa_in_carico_da := null;
  elsif new.presa_in_carico is distinct from old.presa_in_carico then
    if auth.uid() is not null
       and (old.destinatario_id is null or old.destinatario_id is distinct from public.current_operatore_id()) then
      raise exception 'Solo il destinatario della nota può prenderla in carico.';
    end if;
    if new.presa_in_carico then
      new.presa_in_carico_at := now();
      new.presa_in_carico_da := public.current_operatore_id();
    else
      new.presa_in_carico_at := null;
      new.presa_in_carico_da := null;
    end if;
  else
    new.presa_in_carico_at := old.presa_in_carico_at;
    new.presa_in_carico_da := old.presa_in_carico_da;
  end if;
  return new;
end;
$$;

-- il nome viene dopo trg_note_before_insert/update: Postgres esegue i trigger in ordine alfabetico
create trigger trg_note_presa_in_carico
  before insert or update on public.note
  for each row execute function public.note_presa_in_carico();
