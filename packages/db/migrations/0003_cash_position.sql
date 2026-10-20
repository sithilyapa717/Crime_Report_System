-- 0003: cash notes keep the order they were entered in (an explicit column instead of SQLite's
-- rowid, which PostgreSQL does not have).
ALTER TABLE cash_notes ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
