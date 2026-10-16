// Database schema and migrations. No side effects: db.ts runs migrate() on the real database,
// tests run it on throwaway ones.
import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 4;

// Version 1 schema; later versions are applied as migrations below so existing databases keep their data.
export const SCHEMA_V1 = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member', pw TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
  project_no TEXT NOT NULL DEFAULT '', designer TEXT NOT NULL DEFAULT '', prepared_by TEXT NOT NULL DEFAULT '',
  revision TEXT NOT NULL DEFAULT '', doc_date TEXT NOT NULL DEFAULT (date('now')),
  vat_rate REAL NOT NULL DEFAULT 7, voltage REAL NOT NULL DEFAULT 220, pf REAL NOT NULL DEFAULT 1,
  discount REAL NOT NULL DEFAULT 0, install_fee REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE floors (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, plan_file TEXT, plan_w INTEGER, plan_h INTEGER,
  mpp REAL, symbol_scale REAL NOT NULL DEFAULT 1
);
CREATE TABLE fixtures (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', finish TEXT NOT NULL DEFAULT '',
  socket TEXT NOT NULL DEFAULT '', bulbs REAL, watt_per_lamp REAL, watt_total REAL, kelvin INTEGER, ip TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL DEFAULT 'downlight', color TEXT NOT NULL DEFAULT 'red', unit TEXT NOT NULL DEFAULT 'ea',
  price REAL, supplier TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  photo_file TEXT, drawing_file TEXT, spec_qty REAL, sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, code)
);
CREATE TABLE circuits (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, area TEXT NOT NULL DEFAULT '', breaker_a REAL, note TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, name)
);
CREATE TABLE placements (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE RESTRICT,
  x REAL NOT NULL, y REAL NOT NULL, rot REAL NOT NULL DEFAULT 0,
  circuit_id INTEGER REFERENCES circuits(id) ON DELETE SET NULL, circuit_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE lines (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE RESTRICT,
  pts TEXT NOT NULL, heads INTEGER NOT NULL DEFAULT 0,
  head_fixture_id INTEGER REFERENCES fixtures(id) ON DELETE SET NULL,
  circuit_id INTEGER REFERENCES circuits(id) ON DELETE SET NULL, circuit_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_floors_p ON floors(project_id);
CREATE INDEX idx_fix_p ON fixtures(project_id);
CREATE INDEX idx_pl_p ON placements(project_id);
CREATE INDEX idx_ln_p ON lines(project_id);
`;

const migrations: Record<number, string> = {
  // how the uploaded plan is shown (web + PDF): greyscale on/off and opacity over white
  2: `ALTER TABLE floors ADD COLUMN plan_gray INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE floors ADD COLUMN plan_opacity REAL NOT NULL DEFAULT 0.5;`,
  // central fixture library; project fixtures keep their own copy and remember where it came from
  3: `CREATE TABLE library (
        id INTEGER PRIMARY KEY, model TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', finish TEXT NOT NULL DEFAULT '',
        socket TEXT NOT NULL DEFAULT '', bulbs REAL, watt_per_lamp REAL, watt_total REAL, kelvin INTEGER, ip TEXT NOT NULL DEFAULT '',
        symbol TEXT NOT NULL DEFAULT 'downlight', color TEXT NOT NULL DEFAULT 'red', unit TEXT NOT NULL DEFAULT 'ea',
        price REAL, supplier TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', photo_file TEXT, drawing_file TEXT,
        category TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      ALTER TABLE fixtures ADD COLUMN library_id INTEGER REFERENCES library(id) ON DELETE SET NULL;
      ALTER TABLE fixtures ADD COLUMN library_synced_at TEXT;
      CREATE INDEX idx_fix_lib ON fixtures(library_id);`,
  // linear fixtures (T5 battens …) are drawn to scale from their body length
  4: `ALTER TABLE fixtures ADD COLUMN length_m REAL;
      ALTER TABLE library ADD COLUMN length_m REAL;`,
};

/** Brings any database (new or older version) up to SCHEMA_VERSION. */
export function migrate(db: Database.Database) {
  let ver = db.pragma('user_version', { simple: true }) as number;
  if (ver === 0) {
    db.exec(SCHEMA_V1);
    db.pragma('user_version = 1');
    ver = 1;
  }
  for (let v = ver + 1; v <= SCHEMA_VERSION; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v}`);
    })();
  }
}
