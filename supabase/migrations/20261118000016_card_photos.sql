-- SorteSenai: card photos for every player, not only admins.
-- The storage rule runs as the player, and players cannot read the cards table (card text stays secret),
-- so the old rule never found the card and only admins got photo links. A helper now looks at the cards
-- for the rule: active cards (the reel shows them all), cards the player owns, and cards that hit the mural.

create or replace function app.can_see_card_photo(p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_admin() or (app.is_member() and exists (
    select 1 from public.cards c
    where c.image_path = p_path
      and (c.active
        or exists (select 1 from public.inventory i where i.card_id = c.id and i.user_id = auth.uid() and i.quantity > 0)
        or exists (select 1 from public.feed_events f where f.card_id = c.id))))
$$;

revoke all on function app.can_see_card_photo(text) from public, anon;
grant execute on function app.can_see_card_photo(text) to authenticated;

-- Storage (Supabase only).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists cards_read on storage.objects;
    execute $p$create policy cards_read on storage.objects for select to authenticated
      using (bucket_id = 'cards' and app.can_see_card_photo(name))$p$;
  end if;
end $$;
