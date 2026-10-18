// Database schema and migrations. No side effects: db.ts runs migrate() on the real database,
// tests run it on throwaway ones.
import type Database from 'better-sqlite3';
import { BUILTIN_CATEGORIES } from '../shared/categories';

export const SCHEMA_VERSION = 11;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

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
  // KEYPLAN: material categories (12 built in + the studio's own) and the item fields every category needs.
  // Items that existed before (Light Theory data) are lighting.
  5: `CREATE TABLE categories (
        id INTEGER PRIMARY KEY, prefix TEXT NOT NULL UNIQUE, name_th TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT 'ea', qty_mode TEXT NOT NULL DEFAULT 'plan', icon TEXT NOT NULL DEFAULT 'other',
        builtin INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO categories (prefix, name_th, name_en, unit, qty_mode, icon, builtin, sort) VALUES
        ${BUILTIN_CATEGORIES.map((c, i) => `(${[c.prefix, c.name_th, c.name_en, c.unit, c.qty_mode, c.icon].map(q).join(', ')}, 1, ${i + 1})`).join(',\n        ')};
      ALTER TABLE fixtures ADD COLUMN cat TEXT NOT NULL DEFAULT 'L';
      ALTER TABLE fixtures ADD COLUMN room TEXT NOT NULL DEFAULT '';
      ALTER TABLE fixtures ADD COLUMN size TEXT NOT NULL DEFAULT '';
      ALTER TABLE fixtures ADD COLUMN qty_manual REAL;
      ALTER TABLE fixtures ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
      ALTER TABLE library ADD COLUMN cat TEXT NOT NULL DEFAULT 'L';
      ALTER TABLE library ADD COLUMN size TEXT NOT NULL DEFAULT '';
      CREATE INDEX idx_fix_cat ON fixtures(project_id, cat);
      -- codes of deleted items: never issued again in that project
      CREATE TABLE retired_codes (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, code TEXT NOT NULL,
        PRIMARY KEY (project_id, code)
      );`,
  // pin size on the plan per item, and mood boards (template or automatic layout) shown after the PDF cover
  6: `ALTER TABLE fixtures ADD COLUMN mark_size TEXT NOT NULL DEFAULT 'M';
      CREATE TABLE moodboards (
        id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'Mood board', template TEXT NOT NULL DEFAULT 'auto', note TEXT NOT NULL DEFAULT '',
        sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE moodboard_images (
        id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
        slot INTEGER NOT NULL, file TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '',
        UNIQUE (board_id, slot)
      );
      CREATE INDEX idx_mb_p ON moodboards(project_id);`,
  // library items get their own code (F-01 …), numbered per category in the library and never reused after deletion
  7: `ALTER TABLE library ADD COLUMN code TEXT NOT NULL DEFAULT '';
      UPDATE library SET code = cat || '-' || printf('%02d', (SELECT COUNT(*) FROM library l2 WHERE l2.cat = library.cat AND l2.id <= library.id));
      CREATE UNIQUE INDEX idx_lib_code ON library(code);
      CREATE TABLE library_retired (code TEXT PRIMARY KEY);`,
  // plan rotation (the upload is kept, the shown plan is turned from it) and free-form canvas mood boards:
  // position and size as fractions of the sheet, layer order, crop as fractions of the image, a cut-out PNG
  8: `ALTER TABLE floors ADD COLUMN plan_orig TEXT;
      ALTER TABLE floors ADD COLUMN plan_rot INTEGER NOT NULL DEFAULT 0;
      UPDATE floors SET plan_orig = plan_file WHERE plan_file IS NOT NULL;
      ALTER TABLE moodboard_images ADD COLUMN img_w INTEGER;
      ALTER TABLE moodboard_images ADD COLUMN img_h INTEGER;
      ALTER TABLE moodboard_images ADD COLUMN x REAL;
      ALTER TABLE moodboard_images ADD COLUMN y REAL;
      ALTER TABLE moodboard_images ADD COLUMN w REAL;
      ALTER TABLE moodboard_images ADD COLUMN h REAL;
      ALTER TABLE moodboard_images ADD COLUMN z INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE moodboard_images ADD COLUMN crop_x REAL NOT NULL DEFAULT 0;
      ALTER TABLE moodboard_images ADD COLUMN crop_y REAL NOT NULL DEFAULT 0;
      ALTER TABLE moodboard_images ADD COLUMN crop_w REAL NOT NULL DEFAULT 1;
      ALTER TABLE moodboard_images ADD COLUMN crop_h REAL NOT NULL DEFAULT 1;
      ALTER TABLE moodboard_images ADD COLUMN cutout TEXT;`,
  // the Thai line under the project name on the cover (e.g. "บ้านริมน้ำ งานปรับปรุงภายใน")
  9: `ALTER TABLE projects ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';`,
  // floor-plan symbol from the FF&E Symbol Guideline (F-01 sofa …), drawn when symbol = 'glyph'
  10: `ALTER TABLE fixtures ADD COLUMN glyph TEXT;
      ALTER TABLE library ADD COLUMN glyph TEXT;`,
  // lighting type: built-in LED (one price), retrofit lamp (lamp type + price per lamp) or driver (driver type + price)
  11: `ALTER TABLE fixtures ADD COLUMN light_type TEXT NOT NULL DEFAULT 'builtin';
      ALTER TABLE fixtures ADD COLUMN lamp_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE fixtures ADD COLUMN lamp_price REAL;
      ALTER TABLE fixtures ADD COLUMN driver_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE fixtures ADD COLUMN driver_price REAL;
      ALTER TABLE library ADD COLUMN light_type TEXT NOT NULL DEFAULT 'builtin';
      ALTER TABLE library ADD COLUMN lamp_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE library ADD COLUMN lamp_price REAL;
      ALTER TABLE library ADD COLUMN driver_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE library ADD COLUMN driver_price REAL;`,
};

/** Brings any database (new or older version) up to SCHEMA_VERSION (or an older target, for tests of the upgrade path). */
export function migrate(db: Database.Database, target = SCHEMA_VERSION) {
  let ver = db.pragma('user_version', { simple: true }) as number;
  if (ver === 0) {
    db.exec(SCHEMA_V1);
    db.pragma('user_version = 1');
    ver = 1;
  }
  for (let v = ver + 1; v <= target; v++) {
    db.transaction(() => {
      db.exec(migrations[v]);
      db.pragma(`user_version = ${v}`);
    })();
  }
}
