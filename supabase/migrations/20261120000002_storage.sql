-- =====================================================================
-- STORAGE: bucket privato per foto e vocali  (percorso: <nota_id>/<file>)
-- Le foto si mostrano con "signed URL" (link temporanei firmati).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('note-allegati', 'note-allegati', false, 26214400)  -- 25 MB per file
on conflict (id) do nothing;

create policy "allegati lettura" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-allegati' and public.is_operatore());

create policy "allegati caricamento" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-allegati' and public.is_operatore());

-- Elimina solo l'autore della nota (cartella) o un admin
create policy "allegati eliminazione" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-allegati' and (public.is_admin() or public.is_autore_percorso(name)));
