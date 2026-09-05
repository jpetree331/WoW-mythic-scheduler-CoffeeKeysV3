CREATE TABLE v3_boards (board TEXT PRIMARY KEY, title TEXT NOT NULL);
CREATE TABLE v3_players (
  id TEXT PRIMARY KEY, board TEXT NOT NULL, owner_hash TEXT, payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL,
  UNIQUE(board, owner_hash, id)
);
CREATE INDEX v3_players_board ON v3_players(board);
CREATE TABLE v3_events (
  id TEXT PRIMARY KEY, board TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','locked','completed')),
  revision INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX v3_events_board ON v3_events(board);
CREATE TABLE v3_signups (
  event_id TEXT NOT NULL REFERENCES v3_events(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES v3_players(id) ON DELETE CASCADE,
  member_hash TEXT NOT NULL, tier TEXT NOT NULL CHECK(tier IN ('2-5','6-9','10+')),
  PRIMARY KEY(event_id, player_id), UNIQUE(event_id, member_hash)
);
CREATE TABLE v3_assignments (
  event_id TEXT NOT NULL, player_id TEXT NOT NULL, group_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('2-5','6-9','10+')),
  role TEXT NOT NULL CHECK(role IN ('Tank','Healer','DPS')),
  PRIMARY KEY(event_id, player_id),
  FOREIGN KEY(event_id, player_id) REFERENCES v3_signups(event_id, player_id) ON DELETE CASCADE
);
CREATE TABLE v3_history (
  id BIGSERIAL PRIMARY KEY, event_id TEXT NOT NULL REFERENCES v3_events(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE v3_imports (source_id TEXT PRIMARY KEY, imported_id TEXT NOT NULL);
CREATE TABLE v3_quarantine (source_id TEXT PRIMARY KEY, payload TEXT NOT NULL, reason TEXT NOT NULL);
CREATE TABLE v3_requests (board TEXT NOT NULL, owner_hash TEXT NOT NULL, request_id TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES v3_players(id) ON DELETE CASCADE, PRIMARY KEY(board,owner_hash,request_id));
CREATE TABLE v3_claims (player_id TEXT PRIMARY KEY REFERENCES v3_players(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL, expires_at BIGINT NOT NULL);

CREATE TABLE v3_rate_limits (key TEXT PRIMARY KEY, bucket BIGINT NOT NULL, count INTEGER NOT NULL);
CREATE INDEX v3_rate_limits_bucket ON v3_rate_limits(bucket);
