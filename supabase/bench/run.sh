#!/usr/bin/env bash
# Load test on a throwaway local Postgres: many players at the same time.
# Usage: bash supabase/bench/run.sh [skip-last-migrations]   (needs PostgreSQL 15+ and pgbench; set PG_BIN)
# PLAYERS, PULLS, CLIENTS and DURATION (seconds) change the size of the test.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
win="/c/Program Files/PostgreSQL/16/bin"
PG_BIN="${PG_BIN:-$( [ -d "$win" ] && echo "$win" || echo /usr/lib/postgresql/16/bin)}"
PORT="${PORT:-54331}"
PLAYERS="${PLAYERS:-40}"; PULLS="${PULLS:-3000}"; CLIENTS="${CLIENTS:-30}"; DURATION="${DURATION:-15}"
SKIP="${1:-0}"
work="$(mktemp -d)"
trap '"$PG_BIN/pg_ctl" -D "$work/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
"$PG_BIN/initdb" -D "$work/data" -U postgres -A trust --no-locale -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$work/data" -o "-p $PORT -c max_connections=200" -l "$work/log" -w start >/dev/null
psql() { "$PG_BIN/psql" -h localhost -p "$PORT" -U postgres -d sortesenai -v ON_ERROR_STOP=1 -qtA "$@"; }
"$PG_BIN/createdb" -h localhost -p "$PORT" -U postgres sortesenai
psql -f "$root/tests/bootstrap.sql" >/dev/null
files=("$root"/migrations/*.sql)
n=$(( ${#files[@]} - SKIP ))
for f in "${files[@]:0:$n}"; do psql -f "$f" >/dev/null; done
echo "migrations: $n (last: $(basename "${files[$((n-1))]}"))"
psql -f "$root/seed.sql" >/dev/null
psql -v players="$PLAYERS" -v pulls="$PULLS" -f "$here/populate.sql" >/dev/null
psql -c "grant usage on schema bench to authenticated; grant select on bench.users to authenticated;" >/dev/null
echo "players=$PLAYERS pulls/player=$PULLS clients=$CLIENTS seconds=$DURATION"
# burst: everyone refreshes the chat at the same instant (what happens when someone writes)
out=$("$PG_BIN/pgbench" -h localhost -p "$PORT" -U postgres -n -c "$CLIENTS" -j 4 -t 1 -D players="$PLAYERS" -f "$here/chat.sql" sortesenai 2>&1)
printf '%-8s %s clients at once: latency avg %s\n' burst "$CLIENTS" "$(grep -oP 'latency average = \K[0-9.]+ ms' <<<"$out")"
for s in chat page ranking pull; do
  out=$("$PG_BIN/pgbench" -h localhost -p "$PORT" -U postgres -n -c "$CLIENTS" -j 4 -T "$DURATION" -D players="$PLAYERS" -f "$here/$s.sql" sortesenai 2>&1)
  tps=$(grep -oP 'tps = \K[0-9.]+' <<<"$out" | head -1); lat=$(grep -oP 'latency average = \K[0-9.]+ ms' <<<"$out")
  fail=$(grep -oP 'number of failed transactions: \K[0-9]+' <<<"$out" || echo 0)
  printf '%-8s %10s req/s   latency avg %12s   failed %s\n' "$s" "$tps" "$lat" "$fail"
done
