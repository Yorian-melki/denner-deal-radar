CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rid TEXT NOT NULL,          -- identifiant aléatoire de l'appareil (localStorage), aucune donnée perso
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,         -- duel | recall | spell | meaning | session
  data TEXT NOT NULL,         -- JSON
  lang TEXT, device TEXT
);
CREATE INDEX IF NOT EXISTS idx_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_rid ON events(rid);
