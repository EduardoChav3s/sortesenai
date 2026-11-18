-- SorteSenai: music the admin uploads. 'login' tracks play on the sign-in page (before anyone signs in),
-- 'lendario' and 'mitico' tracks play when a player pulls a card of that rarity.

create table if not exists public.music_tracks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(trim(title)) between 1 and 80),
  path       text not null,
  slot       text not null check (slot in ('login', 'lendario', 'mitico')),
  created_at timestamptz not null default now()
);
alter table public.music_tracks enable row level security;
revoke all on table public.music_tracks from anon, authenticated;

create or replace function app.track_json(m public.music_tracks) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', m.id, 'title', m.title, 'path', m.path, 'slot', m.slot, 'created_at', m.created_at)
$$;

-- The sign-in page has no session yet, so this one is open to anon too. It only returns file paths of login music.
create or replace function public.get_login_music() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(app.track_json(m) order by m.created_at), '[]') from public.music_tracks m where m.slot = 'login'
$$;

create or replace function public.get_rare_music() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_member();
  return jsonb_build_object(
    'lendario', coalesce((select jsonb_agg(app.track_json(m) order by m.created_at) from public.music_tracks m where m.slot = 'lendario'), '[]'),
    'mitico', coalesce((select jsonb_agg(app.track_json(m) order by m.created_at) from public.music_tracks m where m.slot = 'mitico'), '[]'));
end $$;

create or replace function public.admin_list_tracks() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(app.track_json(m) order by m.slot, m.created_at) from public.music_tracks m), '[]');
end $$;

create or replace function public.admin_add_track(p_title text, p_path text, p_slot text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.music_tracks;
begin
  perform app.require_admin();
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_path), '') = '' or p_slot not in ('login', 'lendario', 'mitico') then
    raise exception 'invalid';
  end if;
  insert into public.music_tracks (title, path, slot) values (left(trim(p_title), 80), trim(p_path), p_slot) returning * into v_m;
  return app.track_json(v_m);
end $$;

-- Returns the file path so the app can remove the file from storage too.
create or replace function public.admin_delete_track(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_path text;
begin
  perform app.require_admin();
  delete from public.music_tracks where id = p_id returning path into v_path;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('path', v_path);
end $$;

revoke all on function app.track_json(public.music_tracks) from public, anon, authenticated;
revoke all on function public.get_login_music(), public.get_rare_music(), public.admin_list_tracks(),
                       public.admin_add_track(text, text, text), public.admin_delete_track(uuid)
  from public, anon;
grant execute on function public.get_login_music() to anon, authenticated;
grant execute on function public.get_rare_music(), public.admin_list_tracks(),
                          public.admin_add_track(text, text, text), public.admin_delete_track(uuid)
  to authenticated;

-- ---------------------------------------------------------------- storage (Supabase only)
-- 'music' is a public bucket: the sign-in page must play it before anyone signs in. Only the admin writes.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('music', 'music', true, 15728640, array['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'music_admin_write') then
      execute $p$create policy music_admin_write on storage.objects for all to authenticated
        using (bucket_id = 'music' and app.is_admin()) with check (bucket_id = 'music' and app.is_admin())$p$;
    end if;
  end if;
end $$;
