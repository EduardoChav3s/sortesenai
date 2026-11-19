                                                        -- SorteSenai: the admin screen updates live. Every change an admin cares about leaves a short note
                                                        -- here (which table, who did it); admins' screens listen to new notes through Supabase Realtime.
                                                        -- Notes older than an hour are removed as new ones arrive. Rolls (coins, streak) never create notes.
                                                        
                                                        create table if not exists public.admin_events (
                                                          id         bigint generated always as identity primary key,
                                                          kind       text not null,
                                                          actor      uuid,
                                                          created_at timestamptz not null default now()
                                                        );
                                                        create index if not exists admin_events_created_idx on public.admin_events (created_at);
                                                        alter table public.admin_events enable row level security;
                                                        revoke all on table public.admin_events from anon, authenticated;
                                                        grant select on table public.admin_events to authenticated; -- rows filtered by the policy below
                                                        drop policy if exists admin_events_read on public.admin_events;
                                                        create policy admin_events_read on public.admin_events for select to authenticated using (app.is_admin());
                                                        
                                                        create or replace function app.note_admin_event() returns trigger
                                                        language plpgsql security definer set search_path = public, pg_temp as $$
                                                        begin
                                                          insert into public.admin_events (kind, actor) values (tg_table_name, auth.uid());
                                                          delete from public.admin_events where created_at < now() - interval '1 hour';
                                                          return null;
                                                        end $$;
                                                        revoke all on function app.note_admin_event() from public, anon, authenticated;
                                                        
                                                        do $$
                                                        declare t text;
                                                        begin
                                                          foreach t in array array['cards', 'suggestions', 'items', 'titles', 'settings', 'music_tracks'] loop
                                                            execute format('drop trigger if exists admin_note on public.%I', t);
                                                            execute format('create trigger admin_note after insert or update or delete on public.%I for each statement execute function app.note_admin_event()', t);
                                                          end loop;
                                                        end $$;
                                                        
                                                        -- Players: only what the admin list shows besides coins (coins change on every roll; that list polls instead).
                                                        drop trigger if exists admin_note on public.profiles;
                                                        create trigger admin_note after insert or delete on public.profiles for each statement execute function app.note_admin_event();
                                                        drop trigger if exists admin_note_fields on public.profiles;
                                                        create trigger admin_note_fields after update of role, banned, nickname, avatar_url on public.profiles
                                                          for each statement execute function app.note_admin_event();
                                                        
                                                        -- Realtime (Supabase only).
                                                        do $$
                                                        begin
                                                          if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
                                                             and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_events') then
                                                            alter publication supabase_realtime add table public.admin_events;
                                                          end if;
                                                        end $$;
