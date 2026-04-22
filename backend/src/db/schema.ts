/**
 * SQLite schema. Kept deliberately boring so a Postgres swap is mechanical:
 * the only SQLite-specific features in use are INTEGER PRIMARY KEY (replace
 * with SERIAL/BIGSERIAL) and TEXT storing JSON (replace with JSONB).
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS plans (
  id              TEXT PRIMARY KEY,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  storage_key     TEXT NOT NULL,
  uploaded_at     TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending','processing','complete','failed')),
  page_count      INTEGER NOT NULL DEFAULT 1,
  error_message   TEXT
);

CREATE TABLE IF NOT EXISTS units (
  id                    TEXT PRIMARY KEY,
  plan_id               TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  unit_number           TEXT NOT NULL,
  floor                 INTEGER NOT NULL,
  unit_type             TEXT NOT NULL,
  square_footage        INTEGER NOT NULL,
  floor_plan_image_key  TEXT,
  bbox_json             TEXT,
  source_page_index     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_units_plan     ON units(plan_id);
CREATE INDEX IF NOT EXISTS idx_units_floor    ON units(floor);
CREATE INDEX IF NOT EXISTS idx_units_type     ON units(unit_type);

CREATE TABLE IF NOT EXISTS furniture_placements (
  id               TEXT PRIMARY KEY,
  unit_id          TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  catalog_item_id  TEXT NOT NULL,
  x_inches         REAL NOT NULL,
  y_inches         REAL NOT NULL,
  width_inches     REAL NOT NULL,
  depth_inches     REAL NOT NULL,
  rotation_degrees REAL NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_placements_unit ON furniture_placements(unit_id);
`;
