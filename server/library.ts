// Central item library API (คลังสินค้า), shared by all projects.
// Projects copy items from the library (and can save their fixtures into it); a copy never changes by
// itself — "update from library" brings later library edits in, field by field (see shared/library.ts).
import type { FastifyInstance } from 'fastify';
import { db } from './db';
import { requireAdmin } from './auth';
import { saveImage } from './files';
import { FIXTURE_RULES, bad, catRule, idOf, notRetired, num, patch, retiredCodes, row, str, touch, type Body, type Rule } from './common';
import { SPEC_FIELDS, cleanPrefix, nextCode } from '../shared/library';
import { defaultSymbol, isLineSymbol, symbolsFor } from '../shared/symbols';
import { LIGHTING, categoryOf, isLengthUnit } from '../shared/categories';
import { listCategories } from './categories';
import type { Fixture, LibraryItem } from '../shared/types';

// library timestamps keep milliseconds so "edited after the copy" is reliable within the same second
const NOW = "strftime('%Y-%m-%d %H:%M:%f', 'now')";

const LIB_RULES: Record<string, Rule> = {
  ...Object.fromEntries([...SPEC_FIELDS.filter((k) => k in FIXTURE_RULES), 'color'].map((k) => [k, FIXTURE_RULES[k]])),
  category: str,
};

const item = (id: number) => row<LibraryItem>('SELECT * FROM library WHERE id = ?', id);
const mustItem = (id: number) => {
  const it = item(id);
  if (!it) throw bad('ไม่พบรายการในคลัง', 404);
  return it;
};
const mustFixture = (id: number) => {
  const f = row<Fixture>('SELECT * FROM fixtures WHERE id = ?', id);
  if (!f) throw bad('ไม่พบรหัสนี้', 404);
  return f;
};
const bump = (id: number) => db.prepare(`UPDATE library SET updated_at = ${NOW} WHERE id = ?`).run(id);
const usedOnPlan = (fid: number) =>
  (row<{ c: number }>('SELECT (SELECT COUNT(*) FROM placements WHERE fixture_id = ?) + (SELECT COUNT(*) FROM lines WHERE fixture_id = ?) AS c', fid, fid) ?? { c: 0 }).c > 0;

/** Copies the spec fields (+ optional extra columns) from `src` into `table` row `id`. */
function copySpec(table: 'fixtures' | 'library', id: number, src: Record<string, unknown>, extra: string[] = []) {
  const cols = [...SPEC_FIELDS, ...extra];
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => src[c] ?? null), id);
}

export function registerLibraryRoutes(api: FastifyInstance) {
  api.get('/api/library', async () =>
    db.prepare('SELECT l.*, (SELECT COUNT(*) FROM fixtures f WHERE f.library_id = l.id) AS used FROM library l ORDER BY l.category, l.model, l.name, l.id').all());

  api.get('/api/library/:id', async (req) => mustItem(idOf(req)));

  api.post('/api/library', async (req) => {
    const b = (req.body ?? {}) as Body;
    const cat = categoryOf(listCategories(), b.cat == null ? LIGHTING : (catRule(b.cat) as string));
    const lighting = cat.prefix === LIGHTING;
    const symbol = symbolsFor(lighting).some((x) => x.kind === str(b.symbol)) ? str(b.symbol) : defaultSymbol(lighting, isLengthUnit(cat.unit));
    const r = db.prepare(`INSERT INTO library (cat, symbol, unit, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ${NOW}, ${NOW})`)
      .run(cat.prefix, symbol, isLineSymbol(symbol as never) ? 'm' : cat.unit, req.user?.id ?? null);
    const id = Number(r.lastInsertRowid);
    const rest = { ...b };
    delete rest.cat;
    delete rest.symbol;
    patch('library', id, LIB_RULES, rest);
    return { id };
  });

  api.patch('/api/library/:id', async (req) => {
    const id = idOf(req);
    mustItem(id);
    const b = (req.body ?? {}) as Body;
    patch('library', id, LIB_RULES, b);
    if (Object.keys(b).some((k) => k in LIB_RULES)) bump(id);
    return { ok: true };
  });

  // deleting is for admins; project copies stay as they are and simply lose the link
  api.delete('/api/library/:id', { preHandler: requireAdmin }, async (req) => {
    const id = idOf(req);
    mustItem(id);
    db.prepare('DELETE FROM library WHERE id = ?').run(id);
    return { ok: true };
  });

  api.post('/api/library/:id/image', async (req) => {
    const id = idOf(req);
    mustItem(id);
    const kind = (req.query as { kind?: string }).kind === 'drawing' ? 'drawing_file' : 'photo_file';
    const part = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }).file();
    if (!part) throw bad('ไม่พบไฟล์');
    let saved;
    try { saved = await saveImage(await part.toBuffer(), { maxDim: 1000, quality: 88 }); } catch { throw bad('อ่านไฟล์ภาพไม่ได้', 422); }
    db.prepare(`UPDATE library SET ${kind} = ? WHERE id = ?`).run(saved.file, id);
    bump(id);
    return { file: saved.file };
  });
  api.delete('/api/library/:id/image', async (req) => {
    const id = idOf(req);
    mustItem(id);
    const kind = (req.query as { kind?: string }).kind === 'drawing' ? 'drawing_file' : 'photo_file';
    db.prepare(`UPDATE library SET ${kind} = NULL WHERE id = ?`).run(id);
    bump(id);
    return { ok: true };
  });

  /** Project → library: save a project fixture as a new library item and link it. */
  api.post('/api/fixtures/:id/to-library', async (req) => {
    const f = mustFixture(idOf(req));
    if (f.library_id && item(f.library_id)) throw bad('รหัสนี้ผูกกับคลังอยู่แล้ว', 409);
    const b = (req.body ?? {}) as Body;
    const r = db.prepare(`INSERT INTO library (category, created_by, created_at, updated_at) VALUES (?, ?, ${NOW}, ${NOW})`).run(str(b.category), req.user?.id ?? null);
    const lid = Number(r.lastInsertRowid);
    copySpec('library', lid, f as unknown as Record<string, unknown>, ['color']);
    db.prepare('UPDATE fixtures SET library_id = ?, library_synced_at = (SELECT updated_at FROM library WHERE id = ?) WHERE id = ?').run(lid, lid, f.id);
    touch(f.project_id);
    return { id: lid };
  });

  /** Project → library: push this project's (newer) spec into the linked library item. */
  api.post('/api/fixtures/:id/push-library', async (req) => {
    const f = mustFixture(idOf(req));
    if (!f.library_id) throw bad('รหัสนี้ไม่ได้ผูกกับคลัง', 400);
    mustItem(f.library_id);
    copySpec('library', f.library_id, f as unknown as Record<string, unknown>);
    bump(f.library_id);
    db.prepare('UPDATE fixtures SET library_synced_at = (SELECT updated_at FROM library WHERE id = ?) WHERE id = ?').run(f.library_id, f.id);
    return { ok: true };
  });

  /** Library → project: bring library edits into the copy (apply), or mark them as seen without copying (skip). */
  api.post('/api/fixtures/:id/sync-library', async (req) => {
    const f = mustFixture(idOf(req));
    if (!f.library_id) throw bad('รหัสนี้ไม่ได้ผูกกับคลัง', 400);
    const it = mustItem(f.library_id);
    const apply = ((req.body ?? {}) as Body).apply !== false;
    if (apply) {
      if (isLineSymbol(it.symbol) !== isLineSymbol(f.symbol) && usedOnPlan(f.id)) throw bad('สัญลักษณ์ในคลังเป็นคนละชนิด (จุด/เส้น) กับที่ใช้บนแปลนแล้ว อัปเดตไม่ได้', 409);
      copySpec('fixtures', f.id, it as unknown as Record<string, unknown>);
      if (it.cat !== LIGHTING) {
        // circuits are for lighting only
        db.prepare('UPDATE placements SET circuit_id = NULL, circuit_order = 0 WHERE fixture_id = ?').run(f.id);
        db.prepare('UPDATE lines SET circuit_id = NULL, circuit_order = 0 WHERE fixture_id = ?').run(f.id);
      }
    }
    db.prepare('UPDATE fixtures SET library_synced_at = ? WHERE id = ?').run(it.updated_at, f.id);
    touch(f.project_id);
    return { ok: true };
  });

  /** Library → project: add a copy of a library item to a project with the next free code. */
  api.post('/api/projects/:id/fixtures/from-library', async (req) => {
    const pid = idOf(req);
    if (!row('SELECT id FROM projects WHERE id = ?', pid)) throw bad('ไม่พบโปรเจกต์', 404);
    const b = (req.body ?? {}) as Body;
    const it = mustItem(Number(num(b.library_id)));
    const codes = (db.prepare('SELECT code FROM fixtures WHERE project_id = ?').all(pid) as { code: string }[]).map((x) => x.code);
    const code = str(b.code) || nextCode([...codes, ...retiredCodes(pid)], str(b.prefix) ? cleanPrefix(str(b.prefix)) : it.cat);
    notRetired(pid, code);
    const r = db.prepare('INSERT INTO fixtures (project_id, code, sort, library_id, library_synced_at) VALUES (?, ?, ?, ?, ?)').run(pid, code, codes.length, it.id, it.updated_at);
    const id = Number(r.lastInsertRowid);
    copySpec('fixtures', id, it as unknown as Record<string, unknown>, ['color']);
    touch(pid);
    return { id, code };
  });
}
