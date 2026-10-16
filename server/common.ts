// Small helpers shared by the API route files.
import type { FastifyRequest } from 'fastify';
import { db } from './db';
import { SYMBOLS } from '../shared/symbols';

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
export const FIXTURE_RULES: Record<string, Rule> = {
  code: (v) => { const s = str(v); if (!s) throw bad('ต้องระบุรหัสโคม'); return s; },
  model: str, name: str, finish: str, socket: str, ip: str, supplier: str, note: str,
  bulbs: num, watt_per_lamp: num, watt_total: num, kelvin: (v) => { const n = num(v); return n == null ? null : Math.round(n); },
  symbol: (v) => { if (!SYMBOL_KINDS.includes(str(v))) throw bad('รูปแบบสัญลักษณ์ไม่ถูกต้อง'); return str(v); },
  color: (v) => { if (!['red', 'blue', 'green'].includes(str(v))) throw bad('สีไม่ถูกต้อง'); return str(v); },
  unit: (v) => (str(v) === 'm' ? 'm' : 'ea'),
  price: num, spec_qty: num, sort: (v) => num(v) ?? 0,
  length_m: (v) => { const n = num(v); return n != null && n > 0 && n <= 20 ? n : null; },
};
