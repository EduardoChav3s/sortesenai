#!/usr/bin/env bash
# Runs every migration, the seed and the tests against a throwaway local Postgres.
# Usage: bash supabase/tests/run.sh   (needs PostgreSQL 15+; set PG_BIN if not on PATH)
set -euo pipefail
export PGCLIENTENCODING=UTF8
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/16/bin}"
PORT="${PORT:-54329}"
work="$(mktemp -d)"
trap '"$PG_BIN/pg_ctl" -D "$work/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

"$PG_BIN/initdb" -D "$work/data" -U postgres -A trust --no-locale -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$work/data" -o "-p $PORT" -l "$work/log" -w start >/dev/null
psql() { "$PG_BIN/psql" -h localhost -p "$PORT" -U postgres -d sortesenai -v ON_ERROR_STOP=1 -qtA "$@"; }
"$PG_BIN/createdb" -h localhost -p "$PORT" -U postgres sortesenai

psql -f "$here/bootstrap.sql"
for f in "$root"/migrations/*.sql; do echo "migration: $(basename "$f")"; psql -f "$f"; done
psql -f "$root/seed.sql"
psql -f "$here/test.sql" 2>&1 | grep -v "^$" | sed -E "s/^psql:[^ ]+ (NOTICE|NOTA): +//"
