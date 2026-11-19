-- SorteSenai: @mentions in the chat. A message that names a player (@nickname, any letter case) leaves them
-- a note in the bell. Each player once per message, never the writer, at most 5 players per message.

create or replace function app.mention_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if new.kind not in ('text', 'image') or new.body is null or position('@' in new.body) = 0 then return null; end if;
  for r in
    select distinct p.id
    from regexp_matches(new.body, '@([A-Za-z0-9_]{3,20})', 'g') m
    join public.profiles p on lower(p.nickname) = lower(m[1])
    where p.id <> new.user_id and not p.banned
    limit 5
  loop
    perform app.notify(r.id, 'mention', format('%s mencionou você no chat: "%s"', app.nick(new.user_id), left(new.body, 120)), '/chat');
  end loop;
  return null;
end $$;

drop trigger if exists notify_mentions on public.chat_messages;
create trigger notify_mentions after insert on public.chat_messages for each row execute function app.mention_trigger();

revoke all on function app.mention_trigger() from public, anon, authenticated;
