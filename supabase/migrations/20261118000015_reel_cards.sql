-- SorteSenai: the roll's reel shows every active card in full (photo, title, joke), even ones the player
-- does not own yet. The album, other players' pages and trades still hide the cards a player is missing.

create or replace function public.get_reel_cards() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_member();
  return coalesce((select jsonb_agg(app.card_full(c) order by c.odds_n, c.number) from public.cards c where c.active), '[]');
end $$;

revoke all on function public.get_reel_cards() from public, anon;
grant execute on function public.get_reel_cards() to authenticated;

-- Storage (Supabase only): members may now read the photo of any active card, since the reel shows them all.
-- Owned cards (even if turned off later) and mural cards stay readable as before.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists cards_read on storage.objects;
    execute $p$create policy cards_read on storage.objects for select to authenticated using (
      bucket_id = 'cards' and (
        app.is_admin()
        or (app.is_member() and exists (
              select 1 from public.cards c
              where c.image_path = storage.objects.name
                and (c.active or exists (select 1 from public.inventory i where i.card_id = c.id and i.user_id = auth.uid() and i.quantity > 0))))
        or (app.is_member() and exists (
              select 1 from public.feed_events f join public.cards c on c.id = f.card_id where c.image_path = storage.objects.name))))$p$;
  end if;
end $$;
