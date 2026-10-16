// Material categories API. The 12 built-in categories come from the migration; admins add the studio's own.
// A prefix is unique and never reused: categories are archived, not deleted, and the prefix cannot be renamed.
import type { FastifyInstance } from 'fastify';
import { db } from './db';
import { requireAdmin } from './auth';
import { bad, idOf, patch, row, str, type Body, type Rule } from './common';
import { ICON_KEYS, cleanCategoryPrefix, isUnit } from '../shared/categories';
import type { Category } from '../shared/types';

const RULES: Record<string, Rule> = {
  name_th: (v) => { const s = str(v); if (!s) throw bad('ต้องระบุชื่อหมวดภาษาไทย'); return s.slice(0, 60); },
  name_en: (v) => str(v).slice(0, 60),
  unit: (v) => { if (!isUnit(str(v))) throw bad('หน่วยไม่ถูกต้อง'); return str(v); },
  qty_mode: (v) => (str(v) === 'manual' ? 'manual' : 'plan'),
  icon: (v) => (ICON_KEYS.includes(str(v) as never) ? str(v) : 'other'),
};

const mustCategory = (id: number) => {
  const c = row<Category>('SELECT * FROM categories WHERE id = ?', id);
  if (!c) throw bad('ไม่พบหมวด', 404);
  return c;
};

export const listCategories = () => db.prepare('SELECT * FROM categories ORDER BY sort, prefix').all() as Category[];

export function registerCategoryRoutes(api: FastifyInstance) {
  api.get('/api/categories', async () =>
    db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM fixtures f WHERE f.cat = c.prefix) + (SELECT COUNT(*) FROM library l WHERE l.cat = c.prefix) AS items
      FROM categories c ORDER BY c.sort, c.prefix`).all());

  api.post('/api/categories', { preHandler: requireAdmin }, async (req) => {
    const b = (req.body ?? {}) as Body;
    const prefix = cleanCategoryPrefix(str(b.prefix));
    if (!prefix) throw bad('ตัวนำหน้ารหัสต้องเป็นตัวอักษรภาษาอังกฤษ 1–4 ตัว เช่น WD');
    const used = row<Category>('SELECT * FROM categories WHERE prefix = ?', prefix);
    if (used) throw bad(used.archived ? `ตัวนำหน้า ${prefix} เคยใช้กับหมวด “${used.name_th}” ที่เก็บถาวรแล้ว ใช้ซ้ำไม่ได้ เลือกตัวอื่นหรือนำหมวดเดิมกลับมาใช้` : `ตัวนำหน้า ${prefix} ใช้กับหมวด “${used.name_th}” อยู่แล้ว`, 409);
    const sort = (row<{ m: number }>('SELECT COALESCE(MAX(sort), 0) + 1 AS m FROM categories') ?? { m: 100 }).m;
    const name = RULES.name_th(b.name_th) as string;
    const r = db.prepare('INSERT INTO categories (prefix, name_th, sort) VALUES (?, ?, ?)').run(prefix, name, sort);
    const id = Number(r.lastInsertRowid);
    const rest = { ...b };
    delete rest.prefix;
    patch('categories', id, RULES, rest);
    return { id, prefix };
  });

  api.patch('/api/categories/:id', { preHandler: requireAdmin }, async (req) => {
    const id = idOf(req);
    mustCategory(id);
    const b = (req.body ?? {}) as Body;
    if ('prefix' in b) throw bad('เปลี่ยนตัวนำหน้ารหัสของหมวดไม่ได้ เพราะรหัสที่ออกไปแล้วต้องไม่เปลี่ยน');
    patch('categories', id, RULES, b);
    return { ok: true };
  });

  /** Archive hides a category from new items; existing items and their codes stay as they are. */
  api.post('/api/categories/:id/archive', { preHandler: requireAdmin }, async (req) => {
    const id = idOf(req);
    mustCategory(id);
    const archived = ((req.body ?? {}) as Body).archived === false ? 0 : 1;
    db.prepare('UPDATE categories SET archived = ? WHERE id = ?').run(archived, id);
    return { ok: true };
  });
}
