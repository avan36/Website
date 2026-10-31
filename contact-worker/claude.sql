-- The /claude mailbox. Apply with:
-- npx wrangler d1 execute claude-bridge --remote --file=claude.sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  woke INTEGER NOT NULL DEFAULT 0
);

-- One row per name: how far they've read, and whether they're busy right now.
CREATE TABLE IF NOT EXISTS presence (
  name TEXT PRIMARY KEY,
  last_read INTEGER NOT NULL DEFAULT 0,
  typing_until TEXT,
  working_until TEXT
);
