-- SorteSenai: admin panel functions, default settings and storage rules.

insert into public.settings (id, value) values (true, jsonb_build_object(
  'pull_cost', 10, 'daily_reward', 200, 'luck_cap', 1000000,
  'streak_window_seconds', 8, 'streak_step', 0.05, 'streak_cap', 2,
  'feed_min_odds', 1000000, 'recycle_base', 5,
  'game_daily_limits', jsonb_build_object('slots', 500, 'memory', 300, 'reflex', 200, 'clicker', 200),
  'slots_bets', jsonb_build_array(10, 25, 50)
)) on conflict (id) do nothing;

-- ---------------------------------------------------------------- cards and suggestions
create or replace function public.admin_list_cards() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(app.card_full(c) order by c.number) from public.cards c), '[]');
end $$;

-- p: { id?, title, joke, odds_n, image_path? }
create or replace function public.admin_upsert_card(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_admin(); v_card public.cards;
begin
  begin
    if p->>'id' is null then
      insert into public.cards (title, joke, odds_n, image_path, created_by)
      values (trim(p->>'title'), trim(p->>'joke'), (p->>'odds_n')::bigint, p->>'image_path', v_uid)
      returning * into v_card;
    else
      update public.cards set title = trim(p->>'title'), joke = trim(p->>'joke'), odds_n = (p->>'odds_n')::bigint,
        image_path = case when p ? 'image_path' then p->>'image_path' else image_path end
      where id = (p->>'id')::uuid returning * into v_card;
      if not found then raise exception 'not_found'; end if;
    end if;
  exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid';
  end;
  return app.card_full(v_card);
end $$;

create or replace function public.admin_set_card_active(p_card uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  update public.cards set active = p_active where id = p_card;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_list_suggestions(p_status text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('author', app.player_summary(s.user_id)) order by s.created_at desc)
                   from public.suggestions s where s.status = p_status), '[]');
end $$;

create or replace function public.admin_approve_suggestion(p_id uuid, p_title text, p_joke text, p_odds_n bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.suggestions; v_card jsonb;
begin
  perform app.require_admin();
  select * into v_s from public.suggestions where id = p_id and status = 'pending' for update;
  if not found then raise exception 'not_found'; end if;
  v_card := public.admin_upsert_card(jsonb_build_object('title', p_title, 'joke', p_joke, 'odds_n', p_odds_n, 'image_path', v_s.image_path));
  update public.suggestions set status = 'approved', card_id = (v_card->>'id')::uuid where id = p_id;
  return v_card;
end $$;

create or replace function public.admin_reject_suggestion(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  update public.suggestions set status = 'rejected', admin_note = nullif(trim(p_note), '') where id = p_id and status = 'pending';
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------- economy
create or replace function public.admin_update_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_new jsonb; k text;
begin
  perform app.require_admin();
  v_new := app.settings() || p_patch;
  foreach k in array array['pull_cost','daily_reward','luck_cap','streak_window_seconds','streak_cap','feed_min_odds','recycle_base'] loop
    if jsonb_typeof(v_new->k) is distinct from 'number' or (v_new->>k)::numeric <= 0 then raise exception 'invalid'; end if;
  end loop;
  if (v_new->>'streak_step')::numeric < 0 or (v_new->>'streak_cap')::numeric < 1 then raise exception 'invalid'; end if;
  if jsonb_typeof(v_new->'slots_bets') is distinct from 'array' or jsonb_array_length(v_new->'slots_bets') = 0 then raise exception 'invalid'; end if;
  update public.settings set value = v_new where id;
  return v_new;
end $$;

-- p: { id?, name, description, price, multiplier, duration_minutes | duration_pulls, active }
create or replace function public.admin_upsert_item(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.items;
begin
  perform app.require_admin();
  begin
    insert into public.items (id, name, description, price, multiplier, duration_minutes, duration_pulls, active)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'name', coalesce(p->>'description', ''), (p->>'price')::bigint,
            (p->>'multiplier')::numeric, (p->>'duration_minutes')::int, (p->>'duration_pulls')::int, coalesce((p->>'active')::boolean, true))
    on conflict (id) do update set name = excluded.name, description = excluded.description, price = excluded.price,
      multiplier = excluded.multiplier, duration_minutes = excluded.duration_minutes, duration_pulls = excluded.duration_pulls,
      active = excluded.active
    returning * into v_item;
  exception when check_violation or not_null_violation or invalid_text_representation then raise exception 'invalid';
  end;
  return to_jsonb(v_item);
end $$;

-- p: { id?, name, description, condition, price (null = not for sale), active }
create or replace function public.admin_upsert_title(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.titles;
begin
  perform app.require_admin();
  begin
    insert into public.titles (id, name, description, condition, price, active)
    values (coalesce((p->>'id')::uuid, gen_random_uuid()), p->>'name', coalesce(p->>'description', ''),
            coalesce(p->'condition', '{"type":"manual"}'), (p->>'price')::bigint, coalesce((p->>'active')::boolean, true))
    on conflict (id) do update set name = excluded.name, description = excluded.description, condition = excluded.condition,
      price = excluded.price, active = excluded.active
    returning * into v_t;
  exception when check_violation or not_null_violation or unique_violation or invalid_text_representation then raise exception 'invalid';
  end;
  return to_jsonb(v_t);
end $$;

create or replace function public.admin_grant_title(p_user uuid, p_title uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  insert into public.user_titles (user_id, title_id, source) values (p_user, p_title, 'granted') on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- players and guests
create or replace function public.admin_list_players() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
            'cards_owned', (select count(*) from public.inventory i where i.user_id = p.id and i.quantity > 0)) order by p.nickname)
          from public.profiles p), '[]');
end $$;

create or replace function public.admin_adjust_coins(p_user uuid, p_amount bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  if p_amount = 0 or coalesce(trim(p_reason), '') = '' then raise exception 'invalid'; end if;
  begin
    return jsonb_build_object('coins_after', app.move_coins(p_user, p_amount, 'admin: ' || trim(p_reason)));
  exception when raise_exception then
    if sqlerrm = 'insufficient_coins' then raise exception 'invalid'; end if;
    raise;
  end;
end $$;

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_me uuid := app.require_admin();
begin
  if p_user = v_me then raise exception 'invalid'; end if; -- an admin cannot lock themself out
  update public.profiles set banned = p_banned where id = p_user;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function public.admin_add_allowed_email(p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := app.require_admin();
begin
  begin
    insert into public.allowed_emails (email, added_by) values (lower(trim(p_email)), v_uid) on conflict do nothing;
  exception when check_violation then raise exception 'invalid';
  end;
end $$;

create or replace function public.admin_remove_allowed_email(p_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.require_admin();
  delete from public.allowed_emails where email = lower(trim(p_email));
end $$;

grant execute on function
  public.admin_list_cards(), public.admin_upsert_card(jsonb), public.admin_set_card_active(uuid, boolean),
  public.admin_list_suggestions(text), public.admin_approve_suggestion(uuid, text, text, bigint), public.admin_reject_suggestion(uuid, text),
  public.admin_update_settings(jsonb), public.admin_upsert_item(jsonb), public.admin_upsert_title(jsonb), public.admin_grant_title(uuid, uuid),
  public.admin_list_players(), public.admin_adjust_coins(uuid, bigint, text), public.admin_set_banned(uuid, boolean),
  public.admin_add_allowed_email(text), public.admin_remove_allowed_email(text)
to authenticated;

-- ---------------------------------------------------------------- storage (Supabase only)
-- Buckets: cards (private; a player may read a card image only if they own that card or it hit the mural),
-- profile (avatars and banners; each player writes only inside their own folder <uid>/),
-- suggestions (private; author and admins read).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('cards', 'cards', false, 2097152, array['image/jpeg','image/png','image/webp']),
      ('profile', 'profile', false, 2097152, array['image/jpeg','image/png','image/webp']),
      ('suggestions', 'suggestions', false, 2097152, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy cards_read on storage.objects for select to authenticated using (
      bucket_id = 'cards' and (app.is_admin() or exists (
        select 1 from public.cards c join public.inventory i on i.card_id = c.id
        where c.image_path = storage.objects.name and i.user_id = auth.uid() and i.quantity > 0)
      or (app.is_member() and exists (select 1 from public.feed_events f join public.cards c on c.id = f.card_id where c.image_path = storage.objects.name))))$p$;
    execute $p$create policy cards_admin_write on storage.objects for all to authenticated
      using (bucket_id = 'cards' and app.is_admin()) with check (bucket_id = 'cards' and app.is_admin())$p$;
    execute $p$create policy profile_read on storage.objects for select to authenticated using (bucket_id = 'profile' and app.is_member())$p$;
    execute $p$create policy profile_write on storage.objects for all to authenticated
      using (bucket_id = 'profile' and app.is_member() and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'profile' and app.is_member() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy suggestions_read on storage.objects for select to authenticated using (
      bucket_id = 'suggestions' and (app.is_admin() or (storage.foldername(name))[1] = auth.uid()::text))$p$;
    execute $p$create policy suggestions_write on storage.objects for insert to authenticated
      with check (bucket_id = 'suggestions' and app.is_member() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- Realtime: the mural listens to new feed_events (Supabase only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.feed_events;
  end if;
end $$;
