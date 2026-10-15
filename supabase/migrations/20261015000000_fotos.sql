-- ============================================================
-- Fotos do perfil e do assistente
--
-- Bucket público "fotos" (a foto do assistente aparece no chat de
-- quem não tem conta). Cada um só grava na própria pasta: <uid>/...
-- Só imagem comum (nada de SVG, que pode carregar script), até 2 MB.
-- A coluna só aceita endereço deste bucket: ninguém põe link de fora
-- (pixel de rastreio, imagem ofensiva hospedada em outro lugar).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos: grava na própria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "fotos: troca na própria pasta" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "fotos: apaga da própria pasta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.profiles add column if not exists foto_url text
  constraint profiles_foto_url_check check (foto_url is null or foto_url like 'https://cdscurcwcyzeagincjdv.supabase.co/storage/v1/object/public/fotos/%');
alter table public.assistants add column if not exists foto_url text
  constraint assistants_foto_url_check check (foto_url is null or foto_url like 'https://cdscurcwcyzeagincjdv.supabase.co/storage/v1/object/public/fotos/%');

-- o perfil só deixa mudar colunas liberadas; a foto entra na lista
grant update (foto_url) on public.profiles to authenticated;
