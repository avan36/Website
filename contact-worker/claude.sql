-- The /claude mailbox. Apply with:
-- npx wrangler d1 execute claude-bridge --remote --file=claude.sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  woke INTEGER NOT NULL DEFAULT 0
);
