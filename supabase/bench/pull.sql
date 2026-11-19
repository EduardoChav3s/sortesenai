-- One player rolls.
\set u random(1, :players)
select set_config('request.jwt.claim.sub', id::text, false), set_config('request.jwt.claims', json_build_object('sub', id, 'email', email)::text, false) from bench.users where n = :u;
set role authenticated;
select public.pull();
reset role;
