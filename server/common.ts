// Small helpers shared by the API route files.
import type { FastifyRequest } from 'fastify';
import { db } from './db';
import { SYMBOLS, isMarkSize } from '../shared/symbols';
import { isUnit } from '../shared/categories';
import { isGlyph } from '../shared/glyphs';
import { isStatus } from '../shared/brand';

export type Body = Record<string, unknown>;
export const bad = (msg: string, code = 400) => Object.assign(new Error(msg), { statusCode: code });
export const num = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
export const str = (v: unknown): string => (v == null ? '' : String(v).trim());
export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export const idOf = (req: FastifyRequest): number => {
  const n = Number((req.params as { id?: string }).id);
  if (!Number.isInteger(n)) throw bad('รหัสไม่ถูกต้อง');
  return n;
};

export type Rule = (v: unknown) => unknown;
export function patch(table: string, id: number, rules: Record<string, Rule>, body: Body) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, rule] of Object.entries(rules)) {
    if (k in body) {
      sets.push(`${k} = ?`);
      vals.push(rule(body[k]));
    }
  }
  if (!sets.length) return;
  db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
}

export const touch = (pid: number) => db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(pid);

export const row = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T | undefined;

export const SYMBOL_KINDS = SYMBOLS.map((s) => s.kind as string);
/** A category prefix that exists (archived ones too, so existing items keep theirs). */
export const catRule: Rule = (v) => {
  const p = str(v);
  if (!row('SELECT id FROM categories WHERE prefix = ?', p)) throw bad('ไม่พบหมวดนี้');
  return p;
};
export const FIXTURE_RULES: Record<string, Rule> = {
  code: (v) => { const s = str(v); if (!s) throw bad('ต้องระบุรหัส'); return s; },
  cat: catRule,
  model: str, name: str, size: str, room: str, finish: str, socket: str, ip: str, supplier: str, note: str,
  qty_manual: (v) => { const n = num(v); if (n != null && n < 0) throw bad('จำนวนต้องไม่ติดลบ'); return n == null ? null : Math.round(n * 100) / 100; },
  glyph: (v) => { const s = str(v); if (!s) return null; if (!isGlyph(s)) throw bad('ไม่พบสัญลักษณ์นี้ในคู่มือ'); return s; },
  light_type: (v) => { const s = str(v); if (!['builtin', 'retrofit', 'driver'].includes(s)) throw bad('ประเภทโคมต้องเป็น Built-in, Retrofit หรือ Driver'); return s; },
  lamp_type: str, driver_type: str,
  lamp_price: (v) => { const n = num(v); if (n != null && n < 0) throw bad('ราคาต้องไม่ติดลบ'); return n; },
  driver_price: (v) => { const n = num(v); if (n != null && n < 0) throw bad('ราคาต้องไม่ติดลบ'); return n; },
  mark_size: (v) => { if (!isMarkSize(str(v))) throw bad('ขนาดสัญลักษณ์ต้องเป็น S, M หรือ L'); return str(v); },
  status: (v) => { if (!isStatus(str(v))) throw bad('สถานะไม่ถูกต้อง'); return str(v); },
  bulbs: num, watt_per_lamp: num, watt_total: num, kelvin: (v) => { const n = num(v); return n == null ? null : Math.round(n); },
  symbol: (v) => { if (!SYMBOL_KINDS.includes(str(v))) throw bad('รูปแบบสัญลักษณ์ไม่ถูกต้อง'); return str(v); },
  color: (v) => { if (!['red', 'blue', 'green'].includes(str(v))) throw bad('สีไม่ถูกต้อง'); return str(v); },
  unit: (v) => (isUnit(str(v)) ? str(v) : 'ea'),
  price: num, spec_qty: num, sort: (v) => num(v) ?? 0,
  length_m: (v) => { const n = num(v); return n != null && n > 0 && n <= 20 ? n : null; },
};

/** Codes of deleted items in a project. */
export const retiredCodes = (pid: number) => (db.prepare('SELECT code FROM retired_codes WHERE project_id = ?').all(pid) as { code: string }[]).map((r) => r.code);
/** A deleted item's code is never issued again (KEYPLAN rule). */
export function notRetired(pid: number, code: string) {
  if (row('SELECT 1 FROM retired_codes WHERE project_id = ? AND code = ?', pid, code)) throw bad(`รหัส ${code} เคยใช้กับรายการที่ลบไปแล้ว ใช้ซ้ำไม่ได้`, 409);
}
