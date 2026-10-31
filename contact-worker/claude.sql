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

-- Passwords for the two people. The Claudes keep using tokens. PBKDF2-SHA256, so a
-- leaked table still doesn't give anyone a password.
CREATE TABLE IF NOT EXISTS accounts (
  name TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- Signed-in browsers. Only a hash of the cookie is kept.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Too many wrong passwords in a row and that name waits a while.
CREATE TABLE IF NOT EXISTS login_failures (
  name TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

-- A little context about each person and each Claude, for the others to read.
CREATE TABLE IF NOT EXISTS profiles (
  name TEXT PRIMARY KEY,
  about TEXT NOT NULL DEFAULT '',
  now TEXT NOT NULL DEFAULT '',
  work TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);
