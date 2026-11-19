-- One player opens the main screen: what the browser asks for at once.
\set u random(1, :players)
select set_config('request.jwt.claim.sub', id::text, false), set_config('request.jwt.claims', json_build_object('sub', id, 'email', email)::text, false) from bench.users where n = :u;
set role authenticated;
select public.get_feed(8);
select public.get_level();
select public.get_luck();
select public.get_notifications();
select public.get_missions();
reset role;
