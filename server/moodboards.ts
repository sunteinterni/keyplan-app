// Mood boards API: boards per project, images placed in template slots or laid out automatically.
import type { FastifyInstance } from 'fastify';
import { db } from './db';
import { saveImage } from './files';
import { bad, idOf, num, patch, row, str, touch, type Body, type Rule } from './common';
import { AUTO, isTemplate, slotsFor } from '../shared/moodboard';
import type { MoodImage, Moodboard } from '../shared/types';

const RULES: Record<string, Rule> = {
  title: (v) => str(v).slice(0, 80) || 'Mood board',
  note: (v) => str(v).slice(0, 400),
  sort: (v) => num(v) ?? 0,
};

type BoardRow = Omit<Moodboard, 'images'>;
const board = (id: number) => {
  const b = row<BoardRow>('SELECT * FROM moodboards WHERE id = ?', id);
  if (!b) throw bad('ไม่พบ mood board', 404);
  return b;
};
const imagesOf = (bid: number) => db.prepare('SELECT * FROM moodboard_images WHERE board_id = ? ORDER BY slot').all(bid) as MoodImage[];

export function listMoodboards(pid: number): Moodboard[] {
  return (db.prepare('SELECT * FROM moodboards WHERE project_id = ? ORDER BY sort, id').all(pid) as BoardRow[]).map((b) => ({ ...b, images: imagesOf(b.id) }));
}

/** Copies boards and their image references into another project (files are shared, never changed). */
export function copyMoodboards(boards: Moodboard[], pid: number) {
  for (const b of boards) {
    const nb = Number(db.prepare('INSERT INTO moodboards (project_id, title, template, note, sort) VALUES (?, ?, ?, ?, ?)').run(pid, b.title, b.template, b.note, b.sort).lastInsertRowid);
    for (const i of b.images) db.prepare('INSERT INTO moodboard_images (board_id, slot, file, caption) VALUES (?, ?, ?, ?)').run(nb, i.slot, i.file, i.caption);
  }
}

/** In automatic layout the slots are just the order: keep them 0, 1, 2 … without gaps. */
function renumber(bid: number) {
  imagesOf(bid).forEach((img, i) => {
    if (img.slot !== i) db.prepare('UPDATE moodboard_images SET slot = ? WHERE id = ?').run(-1 - i, img.id);
  });
  db.prepare('UPDATE moodboard_images SET slot = -slot - 1 WHERE board_id = ? AND slot < 0').run(bid);
}

export function registerMoodboardRoutes(api: FastifyInstance) {
  api.post('/api/projects/:id/moodboards', async (req) => {
    const pid = idOf(req);
    if (!row('SELECT id FROM projects WHERE id = ?', pid)) throw bad('ไม่พบโปรเจกต์', 404);
    const b = (req.body ?? {}) as Body;
    const template = isTemplate(str(b.template)) ? str(b.template) : AUTO;
    const n = (row<{ c: number }>('SELECT COUNT(*) c FROM moodboards WHERE project_id = ?', pid) ?? { c: 0 }).c;
    const r = db.prepare('INSERT INTO moodboards (project_id, title, template, sort) VALUES (?, ?, ?, ?)').run(pid, RULES.title(b.title) as string, template, n);
    touch(pid);
    return { id: Number(r.lastInsertRowid) };
  });

  api.patch('/api/moodboards/:id', async (req) => {
    const id = idOf(req);
    const bd = board(id);
    const b = (req.body ?? {}) as Body;
    if ('template' in b) {
      const t = str(b.template);
      if (!isTemplate(t)) throw bad('ไม่พบเทมเพลตนี้');
      db.transaction(() => {
        db.prepare('UPDATE moodboards SET template = ? WHERE id = ?').run(t, id);
        // to a template: images keep their order in the first slots; to automatic: order without gaps
        renumber(id);
      })();
    }
    patch('moodboards', id, RULES, b);
    touch(bd.project_id);
    return { ok: true };
  });

  api.delete('/api/moodboards/:id', async (req) => {
    const bd = board(idOf(req));
    db.prepare('DELETE FROM moodboards WHERE id = ?').run(bd.id);
    touch(bd.project_id);
    return { ok: true };
  });

  /** Add an image: ?slot=N puts it in that slot (replacing what is there); without a slot it takes the first free one. */
  api.post('/api/moodboards/:id/images', async (req) => {
    const id = idOf(req);
    const bd = board(id);
    const part = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }).file();
    if (!part) throw bad('ไม่พบไฟล์');
    const imgs = imagesOf(id);
    const given = num((req.query as { slot?: string }).slot);
    let slot: number;
    if (given != null && given >= 0) slot = Math.floor(given);
    else if (bd.template === AUTO) slot = imgs.length;
    else {
      const count = slotsFor(bd.template, 0).length;
      const free = Array.from({ length: count }, (_, i) => i).find((i) => !imgs.some((x) => x.slot === i));
      if (free == null) throw bad('ทุกช่องในเทมเพลตนี้มีรูปแล้ว เลือกช่องที่จะแทนที่ หรือเปลี่ยนเป็นจัดหน้าอัตโนมัติ', 409);
      slot = free;
    }
    let saved;
    try { saved = await saveImage(await part.toBuffer(), { maxDim: 2000, quality: 86 }); } catch { throw bad('อ่านไฟล์ภาพไม่ได้ ใช้ JPG หรือ PNG', 422); }
    db.transaction(() => {
      db.prepare('DELETE FROM moodboard_images WHERE board_id = ? AND slot = ?').run(id, slot);
      db.prepare('INSERT INTO moodboard_images (board_id, slot, file) VALUES (?, ?, ?)').run(id, slot, saved.file);
    })();
    touch(bd.project_id);
    return { slot, file: saved.file };
  });

  /** Move an image to another slot; an image already there swaps places. */
  api.post('/api/moodboards/:id/move', async (req) => {
    const id = idOf(req);
    const bd = board(id);
    const b = (req.body ?? {}) as Body;
    const from = num(b.from);
    const to = num(b.to);
    if (from == null || to == null || to < 0) throw bad('ตำแหน่งไม่ถูกต้อง');
    db.transaction(() => {
      db.prepare('UPDATE moodboard_images SET slot = -1 WHERE board_id = ? AND slot = ?').run(id, to);
      db.prepare('UPDATE moodboard_images SET slot = ? WHERE board_id = ? AND slot = ?').run(to, id, from);
      db.prepare('UPDATE moodboard_images SET slot = ? WHERE board_id = ? AND slot = -1').run(from, id);
    })();
    touch(bd.project_id);
    return { ok: true };
  });

  api.patch('/api/moodboard-images/:id', async (req) => {
    const img = row<MoodImage>('SELECT * FROM moodboard_images WHERE id = ?', idOf(req));
    if (!img) throw bad('ไม่พบรูป', 404);
    patch('moodboard_images', img.id, { caption: (v) => str(v).slice(0, 120) }, (req.body ?? {}) as Body);
    return { ok: true };
  });

  api.delete('/api/moodboard-images/:id', async (req) => {
    const img = row<MoodImage>('SELECT * FROM moodboard_images WHERE id = ?', idOf(req));
    if (!img) throw bad('ไม่พบรูป', 404);
    const bd = board(img.board_id);
    db.transaction(() => {
      db.prepare('DELETE FROM moodboard_images WHERE id = ?').run(img.id);
      if (bd.template === AUTO) renumber(bd.id);
    })();
    touch(bd.project_id);
    return { ok: true };
  });
}
