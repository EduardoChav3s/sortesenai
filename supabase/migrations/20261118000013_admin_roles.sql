-- SorteSenai: an admin can make another player admin, or take it back.
-- Nobody changes their own role, so the admin doing this always stays admin (the site never ends up with none).

create or replace function public.admin_set_role(p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := app.require_admin();
  v_banned boolean;
begin
  if p_user = v_me or p_role is null or p_role not in ('player', 'admin') then raise exception 'invalid'; end if;
  select banned into v_banned from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if v_banned and p_role = 'admin' then raise exception 'invalid'; end if;
  update public.profiles set role = p_role where id = p_user;
  return jsonb_build_object('id', p_user, 'role', p_role);
end $$;

revoke all on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
