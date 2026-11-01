-- Members who join by invite. Additive: nothing existing changes.
CREATE TABLE IF NOT EXISTS members (
  slug TEXT PRIMARY KEY,
  display TEXT NOT NULL,
  perms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'invited',
  invited_by TEXT NOT NULL,
  invite_hash TEXT,
  invite_expires TEXT,
  claude_token_hash TEXT,
  fire_url TEXT NOT NULL DEFAULT '',
  fire_token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  joined_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS members_by_token ON members (claude_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS members_by_invite ON members (invite_hash);
