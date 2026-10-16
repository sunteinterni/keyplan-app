import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import { db } from './db';
import { currentUser, endSession, hashPassword, requireAdmin, requireUser, startSession, verifyPassword } from './auth';
import { isPdf, pdfPageCount, pdfPageToPng, saveImage, uploadPath } from './files';
import type { Bundle, Circuit, Fixture, Floor, LineEl, Placement, Project } from '../shared/types';
import { defaultSymbol, isLineSymbol, symbolsFor } from '../shared/symbols';
import { LIGHTING, categoryOf, isLengthUnit } from '../shared/categories';
import { nextCode } from '../shared/library';
import { FIXTURE_RULES, bad, catRule, clamp01, idOf, notRetired, num, patch, retiredCodes, row, str, touch, type Body, type Rule } from './common';
import { registerLibraryRoutes } from './library';
import { listCategories, registerCategoryRoutes } from './categories';
import { buildPdf } from './pdf';
import { buildXlsx } from './xlsx';

const PROJECT_RULES: Record<string, Rule> = {
  name: (v) => str(v) || 'โปรเจกต์ใหม่',
  client: str, location: str, project_no: str, designer: str, prepared_by: str, revision: str, note: str,
  doc_date: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : new Date().toISOString().slice(0, 10)),
  vat_rate: (v) => num(v) ?? 7,
  voltage: (v) => num(v) ?? 220,
  pf: (v) => { const n = num(v); return n && n > 0 && n <= 1 ? n : 1; },
  discount: (v) => Math.max(0, num(v) ?? 0),
  install_fee: (v) => Math.max(0, num(v) ?? 0),
};

const FLOOR_RULES: Record<string, Rule> = {
  name: (v) => str(v) || 'ชั้น',
  sort: (v) => num(v) ?? 0,
  mpp: (v) => { const n = num(v); return n && n > 0 ? n : null; },
  symbol_scale: (v) => { const n = num(v); return n && n > 0.2 && n < 5 ? n : 1; },
  plan_gray: (v) => (v === true || v === 1 || v === '1' ? 1 : 0),
  plan_opacity: (v) => { const n = num(v); return n == null ? 0.5 : Math.min(1, Math.max(0.1, n)); },
};

const CIRCUIT_RULES: Record<string, Rule> = {
  name: (v) => { const s = str(v); if (!s) throw bad('ต้องระบุชื่อวงจร'); return s; },
  area: str, note: str, breaker_a: num, sort: (v) => num(v) ?? 0,
};

const parseLine = (r: Record<string, unknown>): LineEl => ({ ...(r as unknown as LineEl), pts: JSON.parse(String(r.pts)) });

export function getBundle(pid: number): Bundle | null {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pid) as Project | undefined;
  if (!project) return null;
  return {
    project,
    categories: listCategories(),
    retired: (db.prepare('SELECT code FROM retired_codes WHERE project_id = ? ORDER BY code').all(pid) as { code: string }[]).map((r) => r.code),
    floors: db.prepare('SELECT * FROM floors WHERE project_id = ? ORDER BY sort, id').all(pid) as Floor[],
    fixtures: db.prepare('SELECT * FROM fixtures WHERE project_id = ? ORDER BY sort, id').all(pid) as Fixture[],
    placements: db.prepare('SELECT * FROM placements WHERE project_id = ? ORDER BY id').all(pid) as Placement[],
    lines: (db.prepare('SELECT * FROM lines WHERE project_id = ? ORDER BY id').all(pid) as Record<string, unknown>[]).map(parseLine),
    circuits: db.prepare('SELECT * FROM circuits WHERE project_id = ? ORDER BY sort, id').all(pid) as Circuit[],
  };
}

function ownFixture(pid: number, fid: unknown): Fixture {
  const f = row<Fixture>('SELECT * FROM fixtures WHERE id = ? AND project_id = ?', Number(fid), pid);
  if (!f) throw bad('ไม่พบรหัสนี้ในโปรเจกต์', 404);
  return f;
}
/** Circuits are for lighting only. */
function wireable(f: Fixture, cid: number | null) {
  if (cid != null && f.cat !== LIGHTING) throw bad(`${f.code} ไม่ใช่หมวดไฟส่องสว่าง จึงโยงวงจรไม่ได้`);
}
function ownCircuit(pid: number, cid: unknown): number | null {
  if (cid == null || cid === '') return null;
  const c = row<Circuit>('SELECT id FROM circuits WHERE id = ? AND project_id = ?', Number(cid), pid);
  if (!c) throw bad('ไม่พบวงจรในโปรเจกต์นี้', 404);
  return c.id;
}
function normPts(v: unknown): [number, number][] {
  if (!Array.isArray(v) || v.length < 2) throw bad('เส้นต้องมีอย่างน้อย 2 จุด');
  return v.map((p) => {
    const a = Array.isArray(p) ? p : [];
    const x = num(a[0]);
    const y = num(a[1]);
    if (x == null || y == null) throw bad('พิกัดไม่ถูกต้อง');
    return [clamp01(x), clamp01(y)] as [number, number];
  });
}

export function registerRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, _req, reply) => {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return reply.code(409).send({ error: 'ข้อมูลซ้ำ (รหัส/ชื่อนี้มีอยู่แล้ว)' });
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || err.code === 'SQLITE_CONSTRAINT_TRIGGER') return reply.code(409).send({ error: 'ยังมีรายการอ้างอิงอยู่ ลบจุด/เส้นที่ใช้รหัสนี้ก่อน' });
    const code = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (code === 500) app.log.error(err);
    return reply.code(code).send({ error: code === 500 ? 'เกิดข้อผิดพลาดในระบบ' : err.message });
  });

  /* ---------- auth ---------- */
  app.get('/api/auth/state', async (req) => {
    const n = (db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c;
    return { needsSetup: n === 0, user: currentUser(req) ?? null };
  });
  app.post('/api/auth/setup', async (req, reply) => {
    const n = (db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c;
    if (n > 0) throw bad('ตั้งค่าเริ่มต้นไปแล้ว', 403);
    const b = (req.body ?? {}) as Body;
    const email = str(b.email).toLowerCase();
    const pw = str(b.password);
    if (!email.includes('@') || pw.length < 8) throw bad('ต้องใช้อีเมลและรหัสผ่านอย่างน้อย 8 ตัวอักษร');
    const r = db.prepare("INSERT INTO users (email, name, role, pw) VALUES (?, ?, 'admin', ?)").run(email, str(b.name) || email, hashPassword(pw));
    startSession(reply, Number(r.lastInsertRowid));
    return { ok: true };
  });
  app.post('/api/auth/login', async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    const u = row<{ id: number; pw: string }>('SELECT id, pw FROM users WHERE email = ?', str(b.email).toLowerCase());
    if (!u || !verifyPassword(str(b.password), u.pw)) throw bad('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
    startSession(reply, u.id);
    return { ok: true };
  });
  app.post('/api/auth/logout', async (_req, reply) => {
    endSession(reply);
    return { ok: true };
  });

  app.register(async (api) => {
    api.addHook('preHandler', requireUser);
    registerLibraryRoutes(api);
    registerCategoryRoutes(api);

    /* ---------- users (admin) ---------- */
    api.get('/api/users', { preHandler: requireAdmin }, async () => db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY id').all());
    api.post('/api/users', { preHandler: requireAdmin }, async (req) => {
      const b = (req.body ?? {}) as Body;
      const email = str(b.email).toLowerCase();
      const pw = str(b.password);
      if (!email.includes('@') || pw.length < 8) throw bad('ต้องใช้อีเมลและรหัสผ่านอย่างน้อย 8 ตัวอักษร');
      const role = str(b.role) === 'admin' ? 'admin' : 'member';
      const r = db.prepare('INSERT INTO users (email, name, role, pw) VALUES (?, ?, ?, ?)').run(email, str(b.name) || email, role, hashPassword(pw));
      return { id: Number(r.lastInsertRowid) };
    });
    api.patch('/api/users/:id', { preHandler: requireAdmin }, async (req) => {
      const id = idOf(req);
      const b = (req.body ?? {}) as Body;
      if ('name' in b) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(str(b.name), id);
      if ('role' in b) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(str(b.role) === 'admin' ? 'admin' : 'member', id);
      if (str(b.password)) {
        if (str(b.password).length < 8) throw bad('รหัสผ่านอย่างน้อย 8 ตัวอักษร');
        db.prepare('UPDATE users SET pw = ? WHERE id = ?').run(hashPassword(str(b.password)), id);
      }
      return { ok: true };
    });
    api.delete('/api/users/:id', { preHandler: requireAdmin }, async (req) => {
      const id = idOf(req);
      if (id === req.user!.id) throw bad('ลบบัญชีตัวเองไม่ได้');
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      return { ok: true };
    });
    api.post('/api/me/password', async (req) => {
      const b = (req.body ?? {}) as Body;
      const u = row<{ pw: string }>('SELECT pw FROM users WHERE id = ?', req.user!.id)!;
      if (!verifyPassword(str(b.current), u.pw)) throw bad('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      if (str(b.next).length < 8) throw bad('รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร');
      db.prepare('UPDATE users SET pw = ? WHERE id = ?').run(hashPassword(str(b.next)), req.user!.id);
      return { ok: true };
    });

    /* ---------- projects ---------- */
    api.get('/api/projects', async () =>
      db.prepare(`SELECT p.id, p.name, p.client, p.project_no, p.revision, p.doc_date, p.updated_at,
        (SELECT COUNT(*) FROM placements WHERE project_id = p.id) AS points,
        (SELECT COUNT(*) FROM fixtures WHERE project_id = p.id) AS items,
        (SELECT COUNT(*) FROM floors WHERE project_id = p.id) AS floors
        FROM projects p ORDER BY p.updated_at DESC`).all());
    api.post('/api/projects', async (req) => {
      const b = (req.body ?? {}) as Body;
      const r = db.prepare('INSERT INTO projects (name, created_by) VALUES (?, ?)').run(str(b.name) || 'โปรเจกต์ใหม่', req.user!.id);
      const id = Number(r.lastInsertRowid);
      patch('projects', id, PROJECT_RULES, b);
      return { id };
    });
    api.get('/api/projects/:id', async (req) => {
      const b = getBundle(idOf(req));
      if (!b) throw bad('ไม่พบโปรเจกต์', 404);
      return b;
    });
    api.patch('/api/projects/:id', async (req) => {
      const id = idOf(req);
      patch('projects', id, PROJECT_RULES, (req.body ?? {}) as Body);
      touch(id);
      return { ok: true };
    });
    api.delete('/api/projects/:id', async (req) => {
      db.prepare('DELETE FROM projects WHERE id = ?').run(idOf(req));
      return { ok: true };
    });
    api.post('/api/projects/:id/duplicate', async (req) => {
      const src = getBundle(idOf(req));
      if (!src) throw bad('ไม่พบโปรเจกต์', 404);
      const tx = db.transaction(() => {
        const p = src.project;
        const r = db.prepare(`INSERT INTO projects (name, client, location, project_no, designer, prepared_by, revision, doc_date, vat_rate, voltage, pf, discount, install_fee, note, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`${p.name} (สำเนา)`, p.client, p.location, p.project_no, p.designer, p.prepared_by, p.revision, p.doc_date, p.vat_rate, p.voltage, p.pf, p.discount, p.install_fee, p.note, req.user!.id);
        const nid = Number(r.lastInsertRowid);
        const fm = new Map<number, number>(), fx = new Map<number, number>(), cm = new Map<number, number>();
        for (const f of src.floors) fm.set(f.id, Number(db.prepare('INSERT INTO floors (project_id, name, sort, plan_file, plan_w, plan_h, mpp, symbol_scale, plan_gray, plan_opacity) VALUES (?,?,?,?,?,?,?,?,?,?)').run(nid, f.name, f.sort, f.plan_file, f.plan_w, f.plan_h, f.mpp, f.symbol_scale, f.plan_gray, f.plan_opacity).lastInsertRowid));
        for (const f of src.fixtures) fx.set(f.id, Number(db.prepare(`INSERT INTO fixtures (project_id, code, cat, room, size, qty_manual, status, model, name, finish, socket, bulbs, watt_per_lamp, watt_total, kelvin, ip, symbol, color, unit, price, supplier, note, photo_file, drawing_file, spec_qty, sort, library_id, library_synced_at, length_m)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(nid, f.code, f.cat, f.room, f.size, f.qty_manual, f.status, f.model, f.name, f.finish, f.socket, f.bulbs, f.watt_per_lamp, f.watt_total, f.kelvin, f.ip, f.symbol, f.color, f.unit, f.price, f.supplier, f.note, f.photo_file, f.drawing_file, f.spec_qty, f.sort, f.library_id, f.library_synced_at, f.length_m).lastInsertRowid));
        for (const code of src.retired) db.prepare('INSERT INTO retired_codes (project_id, code) VALUES (?, ?)').run(nid, code);
        for (const c of src.circuits) cm.set(c.id, Number(db.prepare('INSERT INTO circuits (project_id, name, area, breaker_a, note, sort) VALUES (?,?,?,?,?,?)').run(nid, c.name, c.area, c.breaker_a, c.note, c.sort).lastInsertRowid));
        for (const p2 of src.placements) db.prepare('INSERT INTO placements (project_id, floor_id, fixture_id, x, y, rot, circuit_id, circuit_order) VALUES (?,?,?,?,?,?,?,?)').run(nid, fm.get(p2.floor_id), fx.get(p2.fixture_id), p2.x, p2.y, p2.rot, p2.circuit_id ? cm.get(p2.circuit_id) : null, p2.circuit_order);
        for (const l of src.lines) db.prepare('INSERT INTO lines (project_id, floor_id, fixture_id, pts, heads, head_fixture_id, circuit_id, circuit_order) VALUES (?,?,?,?,?,?,?,?)').run(nid, fm.get(l.floor_id), fx.get(l.fixture_id), JSON.stringify(l.pts), l.heads, l.head_fixture_id ? fx.get(l.head_fixture_id) : null, l.circuit_id ? cm.get(l.circuit_id) : null, l.circuit_order);
        return nid;
      });
      return { id: tx() };
    });

    /* ---------- floors ---------- */
    api.post('/api/projects/:id/floors', async (req) => {
      const pid = idOf(req);
      const b = (req.body ?? {}) as Body;
      const n = (row<{ c: number }>('SELECT COUNT(*) c FROM floors WHERE project_id = ?', pid) ?? { c: 0 }).c;
      const r = db.prepare('INSERT INTO floors (project_id, name, sort) VALUES (?, ?, ?)').run(pid, str(b.name) || `ชั้น ${n + 1}`, n);
      touch(pid);
      return { id: Number(r.lastInsertRowid) };
    });
    api.patch('/api/floors/:id', async (req) => {
      const id = idOf(req);
      const f = row<Floor>('SELECT * FROM floors WHERE id = ?', id);
      if (!f) throw bad('ไม่พบชั้น', 404);
      patch('floors', id, FLOOR_RULES, (req.body ?? {}) as Body);
      touch(f.project_id);
      return { ok: true };
    });
    api.delete('/api/floors/:id', async (req) => {
      const id = idOf(req);
      const f = row<Floor>('SELECT * FROM floors WHERE id = ?', id);
      if (!f) throw bad('ไม่พบชั้น', 404);
      db.prepare('DELETE FROM floors WHERE id = ?').run(id);
      touch(f.project_id);
      return { ok: true };
    });
    /** Plan upload: PNG/JPG/WebP image, or a PDF (page chosen with ?page=N). */
    api.post('/api/floors/:id/plan', async (req) => {
      const id = idOf(req);
      const f = row<Floor>('SELECT * FROM floors WHERE id = ?', id);
      if (!f) throw bad('ไม่พบชั้น', 404);
      const part = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer>; fields: Record<string, { value?: string }> } | undefined> }).file();
      if (!part) throw bad('ไม่พบไฟล์');
      let buf = await part.toBuffer();
      const page = Math.max(1, Number((req.query as { page?: string }).page ?? part.fields?.page?.value ?? 1) || 1);
      let pages: number | null = null;
      if (isPdf(buf)) {
        pages = pdfPageCount(buf);
        if (pages && page > pages) throw bad(`ไฟล์ PDF มี ${pages} หน้า`);
        try { buf = pdfPageToPng(buf, page, 150); } catch (e) { throw bad((e as Error).message, 422); }
      }
      let saved;
      try { saved = await saveImage(buf, { maxDim: 3600, quality: 90 }); } catch { throw bad('อ่านไฟล์ภาพไม่ได้ ใช้ PNG, JPG หรือ PDF', 422); }
      // a new plan image invalidates the metric scale
      db.prepare('UPDATE floors SET plan_file = ?, plan_w = ?, plan_h = ?, mpp = NULL WHERE id = ?').run(saved.file, saved.w, saved.h, id);
      touch(f.project_id);
      return { file: saved.file, w: saved.w, h: saved.h, pages };
    });
    /** Set the drawing scale: two normalised points and their real distance in metres. */
    api.post('/api/floors/:id/scale', async (req) => {
      const id = idOf(req);
      const f = row<Floor>('SELECT * FROM floors WHERE id = ?', id);
      if (!f || !f.plan_w || !f.plan_h) throw bad('ชั้นนี้ยังไม่มีแปลน', 400);
      const b = (req.body ?? {}) as { a?: number[]; b?: number[]; meters?: number };
      const pa = normPts([b.a, b.b]);
      const m = num(b.meters);
      if (!m || m <= 0) throw bad('ระยะจริงต้องมากกว่า 0');
      const px = Math.hypot((pa[1][0] - pa[0][0]) * f.plan_w, (pa[1][1] - pa[0][1]) * f.plan_h);
      if (px < 2) throw bad('สองจุดอยู่ใกล้กันเกินไป');
      db.prepare('UPDATE floors SET mpp = ? WHERE id = ?').run(m / px, id);
      touch(f.project_id);
      return { mpp: m / px };
    });

    /* ---------- fixtures ---------- */
    api.post('/api/projects/:id/fixtures', async (req) => {
      const pid = idOf(req);
      if (!row('SELECT id FROM projects WHERE id = ?', pid)) throw bad('ไม่พบโปรเจกต์', 404);
      const b = (req.body ?? {}) as Body;
      // category: given, or lighting for callers that only send a symbol (Light Theory API)
      const cat = categoryOf(listCategories(), b.cat == null ? LIGHTING : (catRule(b.cat) as string));
      if (cat.archived) throw bad(`หมวด ${cat.name_th} ถูกเก็บถาวรแล้ว`);
      const lighting = cat.prefix === LIGHTING;
      const allowed = symbolsFor(lighting).map((x) => x.kind as string);
      const symbol = allowed.includes(str(b.symbol)) ? str(b.symbol) : defaultSymbol(lighting, isLengthUnit(cat.unit));
      const codes = (db.prepare('SELECT code FROM fixtures WHERE project_id = ?').all(pid) as { code: string }[]).map((x) => x.code);
      const code = str(b.code) || nextCode([...codes, ...retiredCodes(pid)], cat.prefix);
      notRetired(pid, code);
      const unit = isLineSymbol(symbol as never) ? 'm' : cat.unit;
      const r = db.prepare('INSERT INTO fixtures (project_id, code, cat, symbol, unit, sort) VALUES (?, ?, ?, ?, ?, ?)').run(pid, code, cat.prefix, symbol, unit, codes.length);
      const id = Number(r.lastInsertRowid);
      const rest = { ...b };
      delete rest.code;
      delete rest.cat;
      delete rest.symbol; // already chosen above, within the symbols this category allows
      patch('fixtures', id, FIXTURE_RULES, rest);
      touch(pid);
      return { id };
    });
    api.patch('/api/fixtures/:id', async (req) => {
      const id = idOf(req);
      const f = row<Fixture>('SELECT * FROM fixtures WHERE id = ?', id);
      if (!f) throw bad('ไม่พบรหัสนี้', 404);
      const b = (req.body ?? {}) as Body;
      const nextCat = 'cat' in b ? str(b.cat) : f.cat;
      const allowed = symbolsFor(nextCat === LIGHTING).map((x) => x.kind as string);
      if ('symbol' in b && !allowed.includes(str(b.symbol))) throw bad('สัญลักษณ์นี้ใช้ได้เฉพาะหมวดไฟส่องสว่าง');
      // leaving Lighting takes the item out of every circuit, and a lighting point symbol becomes a plain marker
      if (nextCat !== LIGHTING && f.cat === LIGHTING) {
        db.prepare('UPDATE placements SET circuit_id = NULL, circuit_order = 0 WHERE fixture_id = ?').run(id);
        db.prepare('UPDATE lines SET circuit_id = NULL, circuit_order = 0 WHERE fixture_id = ?').run(id);
        if (!('symbol' in b) && !allowed.includes(f.symbol)) db.prepare("UPDATE fixtures SET symbol = 'marker' WHERE id = ?").run(id);
      }
      if ('symbol' in b && isLineSymbol(f.symbol) !== isLineSymbol(str(b.symbol) as never)) {
        const used = (row<{ c: number }>('SELECT (SELECT COUNT(*) FROM placements WHERE fixture_id = ?) + (SELECT COUNT(*) FROM lines WHERE fixture_id = ?) AS c', id, id) ?? { c: 0 }).c;
        if (used) throw bad('เปลี่ยนระหว่างสัญลักษณ์จุดกับเส้นไม่ได้ เพราะรหัสนี้ถูกใช้บนแปลนแล้ว ลบจุด/เส้นก่อน', 409);
      }
      if ('code' in b && str(b.code) !== f.code) notRetired(f.project_id, str(b.code));
      patch('fixtures', id, FIXTURE_RULES, b);
      touch(f.project_id);
      return { ok: true };
    });
    api.delete('/api/fixtures/:id', async (req) => {
      const id = idOf(req);
      const f = row<Fixture>('SELECT * FROM fixtures WHERE id = ?', id);
      if (!f) throw bad('ไม่พบรหัสนี้', 404);
      db.transaction(() => {
        db.prepare('DELETE FROM fixtures WHERE id = ?').run(id);
        db.prepare('INSERT OR IGNORE INTO retired_codes (project_id, code) VALUES (?, ?)').run(f.project_id, f.code);
      })();
      touch(f.project_id);
      return { ok: true };
    });
    api.post('/api/fixtures/:id/image', async (req) => {
      const id = idOf(req);
      const f = row<Fixture>('SELECT * FROM fixtures WHERE id = ?', id);
      if (!f) throw bad('ไม่พบรหัสนี้', 404);
      const kind = (req.query as { kind?: string }).kind === 'drawing' ? 'drawing_file' : 'photo_file';
      const part = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }).file();
      if (!part) throw bad('ไม่พบไฟล์');
      let saved;
      try { saved = await saveImage(await part.toBuffer(), { maxDim: 1000, quality: 88 }); } catch { throw bad('อ่านไฟล์ภาพไม่ได้', 422); }
      db.prepare(`UPDATE fixtures SET ${kind} = ? WHERE id = ?`).run(saved.file, id);
      touch(f.project_id);
      return { file: saved.file };
    });
    api.delete('/api/fixtures/:id/image', async (req) => {
      const id = idOf(req);
      const kind = (req.query as { kind?: string }).kind === 'drawing' ? 'drawing_file' : 'photo_file';
      db.prepare(`UPDATE fixtures SET ${kind} = NULL WHERE id = ?`).run(id);
      return { ok: true };
    });

    /* ---------- placements ---------- */
    api.post('/api/floors/:id/placements', async (req) => {
      const fid = idOf(req);
      const fl = row<Floor>('SELECT * FROM floors WHERE id = ?', fid);
      if (!fl) throw bad('ไม่พบชั้น', 404);
      const b = (req.body ?? {}) as Body;
      const fx = ownFixture(fl.project_id, b.fixture_id);
      if (isLineSymbol(fx.symbol)) throw bad('รหัสนี้เป็นเส้น ใช้เครื่องมือวาดเส้นแทน');
      const x = num(b.x), y = num(b.y);
      if (x == null || y == null) throw bad('พิกัดไม่ถูกต้อง');
      const cid = ownCircuit(fl.project_id, b.circuit_id);
      wireable(fx, cid);
      // an explicit order restores a point to its old place in the wiring (undo); otherwise append
      const given = num(b.circuit_order);
      const order = cid ? (given ?? row<{ m: number }>('SELECT COALESCE(MAX(circuit_order), -1) + 1 AS m FROM placements WHERE circuit_id = ?', cid)?.m ?? 0) : 0;
      const r = db.prepare('INSERT INTO placements (project_id, floor_id, fixture_id, x, y, rot, circuit_id, circuit_order) VALUES (?,?,?,?,?,?,?,?)').run(fl.project_id, fid, fx.id, clamp01(x), clamp01(y), num(b.rot) ?? 0, cid, order);
      touch(fl.project_id);
      return { id: Number(r.lastInsertRowid) };
    });
    api.patch('/api/placements/:id', async (req) => {
      const id = idOf(req);
      const p = row<Placement>('SELECT * FROM placements WHERE id = ?', id);
      if (!p) throw bad('ไม่พบจุด', 404);
      const b = (req.body ?? {}) as Body;
      const target = ownFixture(p.project_id, 'fixture_id' in b ? b.fixture_id : p.fixture_id);
      if ('fixture_id' in b) {
        if (isLineSymbol(target.symbol)) throw bad('เปลี่ยนเป็นรหัสแบบเส้นไม่ได้');
        if (target.cat !== LIGHTING && !('circuit_id' in b)) db.prepare('UPDATE placements SET circuit_id = NULL, circuit_order = 0 WHERE id = ?').run(id);
      }
      if ('circuit_id' in b) {
        const cid = ownCircuit(p.project_id, b.circuit_id);
        wireable(target, cid);
        const given = num(b.circuit_order);
        const order = !cid ? 0 : given != null ? given : cid !== p.circuit_id ? (row<{ m: number }>('SELECT COALESCE(MAX(circuit_order), -1) + 1 AS m FROM placements WHERE circuit_id = ?', cid)?.m ?? 0) : p.circuit_order;
        db.prepare('UPDATE placements SET circuit_id = ?, circuit_order = ? WHERE id = ?').run(cid, order, id);
      }
      patch('placements', id, { fixture_id: (v) => Number(v), x: (v) => clamp01(num(v) ?? p.x), y: (v) => clamp01(num(v) ?? p.y), rot: (v) => num(v) ?? 0 }, b);
      touch(p.project_id);
      return { ok: true };
    });
    api.delete('/api/placements/:id', async (req) => {
      const id = idOf(req);
      const p = row<Placement>('SELECT * FROM placements WHERE id = ?', id);
      if (!p) throw bad('ไม่พบจุด', 404);
      db.prepare('DELETE FROM placements WHERE id = ?').run(id);
      touch(p.project_id);
      return { ok: true };
    });
    /** Bulk: assign many placements/lines to a circuit (or null), appending to the wiring order. */
    api.post('/api/projects/:id/assign-circuit', async (req) => {
      const pid = idOf(req);
      const b = (req.body ?? {}) as { circuit_id?: number | null; placement_ids?: number[]; line_ids?: number[] };
      const cid = ownCircuit(pid, b.circuit_id);
      const tx = db.transaction(() => {
        let order = cid ? (row<{ m: number }>('SELECT COALESCE(MAX(circuit_order), -1) + 1 AS m FROM placements WHERE circuit_id = ?', cid)?.m ?? 0) : 0;
        for (const id of b.placement_ids ?? []) {
          const ok = db.prepare(`UPDATE placements SET circuit_id = ?, circuit_order = ? WHERE id = ? AND project_id = ?
            AND (? IS NULL OR fixture_id IN (SELECT id FROM fixtures WHERE cat = '${LIGHTING}'))`).run(cid, cid ? order : 0, Number(id), pid, cid);
          if (ok.changes && cid) order++;
        }
        for (const id of b.line_ids ?? []) db.prepare(`UPDATE lines SET circuit_id = ? WHERE id = ? AND project_id = ?
          AND (? IS NULL OR fixture_id IN (SELECT id FROM fixtures WHERE cat = '${LIGHTING}'))`).run(cid, Number(id), pid, cid);
      });
      tx();
      touch(pid);
      return { ok: true };
    });

    /* ---------- export ---------- */
    const attach = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
    api.get('/api/projects/:id/export.pdf', async (req, reply) => {
      const b = getBundle(idOf(req));
      if (!b) throw bad('ไม่พบโครงการ', 404);
      const q = req.query as { prices?: string };
      const buf = await buildPdf(b, { prices: q.prices !== '0' });
      return reply.header('content-type', 'application/pdf').header('content-disposition', attach(`${b.project.name}-keyplan.pdf`)).send(buf);
    });
    api.get('/api/projects/:id/export.xlsx', async (req, reply) => {
      const b = getBundle(idOf(req));
      if (!b) throw bad('ไม่พบโครงการ', 404);
      const buf = await buildXlsx(b);
      return reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition', attach(`${b.project.name}-boq.xlsx`)).send(buf);
    });

    /* ---------- lines ---------- */
    api.post('/api/floors/:id/lines', async (req) => {
      const fid = idOf(req);
      const fl = row<Floor>('SELECT * FROM floors WHERE id = ?', fid);
      if (!fl) throw bad('ไม่พบชั้น', 404);
      const b = (req.body ?? {}) as Body;
      const fx = ownFixture(fl.project_id, b.fixture_id);
      if (!isLineSymbol(fx.symbol)) throw bad('รหัสนี้เป็นสัญลักษณ์จุด ใช้เครื่องมือวางจุดแทน');
      const head = b.head_fixture_id ? ownFixture(fl.project_id, b.head_fixture_id).id : null;
      wireable(fx, ownCircuit(fl.project_id, b.circuit_id));
      const r = db.prepare('INSERT INTO lines (project_id, floor_id, fixture_id, pts, heads, head_fixture_id, circuit_id, circuit_order) VALUES (?,?,?,?,?,?,?,?)').run(
        fl.project_id, fid, fx.id, JSON.stringify(normPts(b.pts)), Math.max(0, Math.round(num(b.heads) ?? 0)), head, ownCircuit(fl.project_id, b.circuit_id), num(b.circuit_order) ?? 0);
      touch(fl.project_id);
      return { id: Number(r.lastInsertRowid) };
    });
    api.patch('/api/lines/:id', async (req) => {
      const id = idOf(req);
      const l = row<Record<string, unknown>>('SELECT * FROM lines WHERE id = ?', id);
      if (!l) throw bad('ไม่พบเส้น', 404);
      const pid = Number(l.project_id);
      const b = (req.body ?? {}) as Body;
      if ('fixture_id' in b && !isLineSymbol(ownFixture(pid, b.fixture_id).symbol)) throw bad('เปลี่ยนเป็นรหัสแบบจุดไม่ได้');
      if ('head_fixture_id' in b && b.head_fixture_id) ownFixture(pid, b.head_fixture_id);
      if ('circuit_id' in b) wireable(ownFixture(pid, 'fixture_id' in b ? b.fixture_id : l.fixture_id), ownCircuit(pid, b.circuit_id));
      patch('lines', id, {
        fixture_id: (v) => Number(v), pts: (v) => JSON.stringify(normPts(v)), heads: (v) => Math.max(0, Math.round(num(v) ?? 0)),
        head_fixture_id: (v) => (v ? Number(v) : null), circuit_id: (v) => (v ? Number(v) : null), circuit_order: (v) => num(v) ?? 0,
      }, b);
      touch(pid);
      return { ok: true };
    });
    api.delete('/api/lines/:id', async (req) => {
      const id = idOf(req);
      const l = row<{ project_id: number }>('SELECT project_id FROM lines WHERE id = ?', id);
      if (!l) throw bad('ไม่พบเส้น', 404);
      db.prepare('DELETE FROM lines WHERE id = ?').run(id);
      touch(l.project_id);
      return { ok: true };
    });

    /* ---------- circuits ---------- */
    api.post('/api/projects/:id/circuits', async (req) => {
      const pid = idOf(req);
      const b = (req.body ?? {}) as Body;
      const n = (row<{ c: number }>('SELECT COUNT(*) c FROM circuits WHERE project_id = ?', pid) ?? { c: 0 }).c;
      const name = str(b.name) || `C-${String(n + 1).padStart(2, '0')}`;
      const r = db.prepare('INSERT INTO circuits (project_id, name, sort) VALUES (?, ?, ?)').run(pid, name, n);
      const id = Number(r.lastInsertRowid);
      const rest = { ...b };
      delete rest.name;
      patch('circuits', id, CIRCUIT_RULES, rest);
      touch(pid);
      return { id };
    });
    api.patch('/api/circuits/:id', async (req) => {
      const id = idOf(req);
      const c = row<Circuit>('SELECT * FROM circuits WHERE id = ?', id);
      if (!c) throw bad('ไม่พบวงจร', 404);
      patch('circuits', id, CIRCUIT_RULES, (req.body ?? {}) as Body);
      touch(c.project_id);
      return { ok: true };
    });
    api.delete('/api/circuits/:id', async (req) => {
      const id = idOf(req);
      const c = row<Circuit>('SELECT * FROM circuits WHERE id = ?', id);
      if (!c) throw bad('ไม่พบวงจร', 404);
      db.prepare('DELETE FROM circuits WHERE id = ?').run(id);
      touch(c.project_id);
      return { ok: true };
    });

    /* ---------- uploaded files (login required) ---------- */
    api.get('/files/:name', async (req, reply) => {
      const p = uploadPath((req.params as { name: string }).name);
      if (!fs.existsSync(p)) return reply.code(404).send({ error: 'ไม่พบไฟล์' });
      return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/jpeg').send(fs.createReadStream(p));
    });
  });
}
