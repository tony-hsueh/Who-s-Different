CREATE TABLE IF NOT EXISTS game_events (
  event_id     TEXT PRIMARY KEY,
  timestamp    TEXT NOT NULL,
  room_id      TEXT NOT NULL,
  game_id      TEXT,
  round_number INTEGER,
  player_id    TEXT,
  event_type   TEXT NOT NULL,
  payload      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_game ON game_events(game_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_room ON game_events(room_id, timestamp);

CREATE TABLE IF NOT EXISTS games (
  game_id        TEXT PRIMARY KEY,
  room_id        TEXT,
  started_at     TEXT,
  finished_at    TEXT,
  player_count   INTEGER,
  minority_count INTEGER,
  winner         TEXT,
  rounds         INTEGER
);

CREATE TABLE IF NOT EXISTS game_private_records (
  game_id          TEXT PRIMARY KEY,
  question_pair_id TEXT,
  majority_word    TEXT,
  minority_word    TEXT,
  assignments      TEXT,
  created_at       TEXT
);
