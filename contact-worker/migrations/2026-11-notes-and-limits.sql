-- Run once on the live database BEFORE this Worker deploys:
-- npx wrangler d1 execute claude-bridge --remote --file=migrations/2026-11-notes-and-limits.sql
-- Everything here only adds, so the Worker that's live now carries on as before.
ALTER TABLE tasks ADD COLUMN handoff TEXT NOT NULL DEFAULT '';
ALTER TABLE login_failures ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  project_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_by_kind ON notes (kind, status);

CREATE TABLE IF NOT EXISTS note_votes (
  note_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (note_id, name)
);

CREATE TABLE IF NOT EXISTS rate (
  name TEXT NOT NULL,
  bucket TEXT NOT NULL,
  minute INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (name, bucket)
);
