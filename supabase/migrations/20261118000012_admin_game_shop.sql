-- SorteSenai: admin screens for game settings, the shop, the weekly event and pinned missions.

-- Settings: a null in the patch removes that key (unpin missions / event card). Everything is checked.
create or replace function public.admin_update_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_new jsonb; k text; v jsonb;
begin
  perform app.require_admin();
  v_new := jsonb_strip_nulls(app.settings() || coalesce(p_patch, '{}'));
  foreach k in array array['pull_cost','daily_reward','luck_cap','streak_window_seconds','streak_cap','feed_min_odds','recycle_base'] loop
    if jsonb_typeof(v_new->k) is distinct from 'number' or (v_new->>k)::numeric <= 0 then raise exception 'invalid'; end if;
  end loop;
  if (v_new->>'streak_step')::numeric < 0 or (v_new->>'streak_cap')::numeric < 1 then raise exception 'invalid'; end if;

  if jsonb_typeof(v_new->'slots_bets') is distinct from 'array' or jsonb_array_length(v_new->'slots_bets') = 0 then raise exception 'invalid'; end if;
  for v in select * from jsonb_array_elements(v_new->'slots_bets') loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <= 0 then raise exception 'invalid'; end if;
  end loop;

  if jsonb_typeof(v_new->'game_daily_limits') is distinct from 'object' then raise exception 'invalid'; end if;
  foreach k in array array['slots','memory','reflex','clicker'] loop
    if jsonb_typeof(v_new->'game_daily_limits'->k) is distinct from 'number' or (v_new->'game_daily_limits'->>k)::numeric < 0 then
      raise exception 'invalid';
    end if;
  end loop;

  if v_new ? 'missions' then
    if jsonb_typeof(v_new->'missions') <> 'array' or jsonb_array_length(v_new->'missions') not between 1 and 5
       or (select count(distinct m) from jsonb_array_elements_text(v_new->'missions') m) <> jsonb_array_length(v_new->'missions')
       or exists (select 1 from jsonb_array_elements_text(v_new->'missions') m where m not in (select id from app.mission_defs())) then
      raise exception 'invalid';
    end if;
  end if;

  if v_new ? 'event_card' then
    if jsonb_typeof(v_new->'event_card') <> 'string'
       or not exists (select 1 from public.cards where active and id::text = v_new->>'event_card') then
      raise exception 'invalid';
    end if;
  end if;

  update public.settings set value = v_new where id;
  return v_new;
end $$;

-- Only a real list of missions pins the day; anything else means "pick them by the day".
create or replace function app.missions_for(p_day date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when jsonb_typeof(app.settings()->'missions') = 'array' then app.settings()->'missions'
              else (select jsonb_agg(id) from (select id from app.mission_defs() order by md5(id || p_day::text) limit 3) x) end
$$;

create or replace function public.admin_mission_defs() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return (select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'goal', goal, 'coins', coins)) from app.mission_defs());
end $$;

-- The players only see active items and titles; the admin sees all of them to edit or reactivate.
create or replace function public.admin_list_items() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(i) order by i.active desc, i.price) from public.items i), '[]');
end $$;

create or replace function public.admin_list_titles() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.active desc, t.price nulls last, t.name) from public.titles t), '[]');
end $$;

revoke all on function public.admin_mission_defs(), public.admin_list_items(), public.admin_list_titles() from public, anon;
grant execute on function public.admin_mission_defs(), public.admin_list_items(), public.admin_list_titles() to authenticated;
