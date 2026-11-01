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
  working_until TEXT,
  listening_until TEXT
);
-- Added later. On a database made before it, run once:
-- ALTER TABLE presence ADD COLUMN listening_until TEXT;

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
  locked_until TEXT,
  strikes INTEGER NOT NULL DEFAULT 0
);
-- strikes was added later: each lockout in a row waits longer. On an older database:
-- ALTER TABLE login_failures ADD COLUMN strikes INTEGER NOT NULL DEFAULT 0;

-- A little context about each person and each Claude, for the others to read.
CREATE TABLE IF NOT EXISTS profiles (
  name TEXT PRIMARY KEY,
  about TEXT NOT NULL DEFAULT '',
  now TEXT NOT NULL DEFAULT '',
  work TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);

-- Projects the Claudes propose. A person approves one before work starts
-- (proposed -> active) and again before it goes live (ready -> live).
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed',
  proposed_by TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  decided_by TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A project's tasks: open -> claimed -> review -> done. A claim is one UPDATE that only
-- matches an open task, so two Claudes can never both get the same one.
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  owner TEXT,
  pr TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  handoff TEXT NOT NULL DEFAULT ''
);
-- handoff was added later. On a database made before it, run once:
-- ALTER TABLE tasks ADD COLUMN handoff TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS tasks_by_project ON tasks (project_id, status);

-- Browsers that asked for notifications, one row each. Only the two people have them.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Shared ideas and memories. Everyone reads everything, so nothing sensitive goes in.
-- An idea is something to maybe build. A memory is something worth knowing next run:
-- a decision, a convention, a lesson. A person can pin a memory so it's always in the brief.
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

-- One +1 per name per idea.
CREATE TABLE IF NOT EXISTS note_votes (
  note_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (note_id, name)
);

-- How many things each name has done this minute, so nobody floods the board.
CREATE TABLE IF NOT EXISTS rate (
  name TEXT NOT NULL,
  bucket TEXT NOT NULL,
  minute INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (name, bucket)
);
