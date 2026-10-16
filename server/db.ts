import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from './schema';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// When this data folder was first used. If it changes after a redeploy, the folder is not on a persistent volume.
const STAMP = path.join(DATA_DIR, '.created');
if (!fs.existsSync(STAMP)) fs.writeFileSync(STAMP, new Date().toISOString());
export const DATA_CREATED = fs.readFileSync(STAMP, 'utf8').trim();
/** true when DATA_DIR sits on a different device than the root filesystem, i.e. a mounted volume. */
export const DATA_MOUNTED = (() => {
  try {
    return fs.statSync(DATA_DIR).dev !== fs.statSync(path.parse(DATA_DIR).root).dev;
  } catch {
    return false;
  }
})();

export const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

migrate(db);
