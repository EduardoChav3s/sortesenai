-- SorteSenai: admin deletes cards and sets a player's exact balance.

-- Removes a card for good. Every copy players own, its rolls and mural posts go with it
-- (foreign keys cascade). Returns the image path so the app can remove the file too.
create or replace function public.admin_delete_card(p_card uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owners int;
  v_image text;
begin
  perform app.require_admin();
  select count(*) into v_owners from public.inventory where card_id = p_card and quantity > 0;
  delete from public.cards where id = p_card returning image_path into v_image;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('owners', v_owners, 'image_path', v_image);
end $$;

-- Sets the balance to an exact amount. The difference goes to the coin history like any other move.
create or replace function public.admin_set_coins(p_user uuid, p_coins bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now bigint;
begin
  perform app.require_admin();
  if p_coins is null or p_coins < 0 or p_coins > 1000000000000 or coalesce(trim(p_reason), '') = '' then
    raise exception 'invalid';
  end if;
  select coins into v_now from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if p_coins = v_now then return jsonb_build_object('coins_after', v_now); end if;
  return jsonb_build_object('coins_after', app.move_coins(p_user, p_coins - v_now, 'admin: ' || trim(p_reason)));
end $$;

revoke all on function public.admin_delete_card(uuid), public.admin_set_coins(uuid, bigint, text) from public, anon;
grant execute on function public.admin_delete_card(uuid), public.admin_set_coins(uuid, bigint, text) to authenticated;
