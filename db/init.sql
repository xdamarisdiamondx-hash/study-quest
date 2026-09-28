-- Runs once, when the database volume is first created (docker-entrypoint-initdb.d).
-- Extensions must exist before Drizzle migrations run.

-- Trigram matching powers typo-tolerant search (PRD 29: "Newt" finds "Newton").
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- gen_random_uuid() is built in from PostgreSQL 13, so no pgcrypto needed.

-- Timestamps are timestamptz (UTC) throughout the schema; this is the default
-- display timezone for the local database only.
SET TIME ZONE 'UTC';
