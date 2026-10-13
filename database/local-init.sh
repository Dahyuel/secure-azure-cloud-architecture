#!/bin/sh
# The official PostgreSQL entrypoint runs this only on a fresh data volume.
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --set app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE sentinel_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
REVOKE CONNECT, TEMPORARY ON DATABASE sentinellab FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE sentinellab TO sentinel_app;
ALTER ROLE sentinel_app SET default_transaction_read_only = on;
ALTER ROLE sentinel_app SET statement_timeout = '4s';
SQL
