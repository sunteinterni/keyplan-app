// Loads a fictional sample project: two generated floor plans, specs, markers, a few lines and circuits.
// Every name is a [PLACEHOLDER] and the plans are drawn here — no client data lives in the repo.
// Usage: npm run seed:demo  (refuses to run if the sample project already exists)
import sharp from 'sharp';
import { db } from './db';
import { saveImage } from './files';

const NAME = '[PLACEHOLDER] Residence';
const exists = db.prepare('SELECT id FROM projects WHERE name = ?').get(NAME);
if (exists) {
  console.log(`${NAME} already exists — nothing to do.`);
  process.exit(0);
}

/* ---------- generated floor plans ---------- */
const PW = 2400;
const PH = 1600;
const PLAN_WIDTH_M = 16; // the drawing is 16 m wide → scale is set on seed

type Rect = [number, number, number, number]; // x0, y0, x1, y1 (0–1)
interface PlanDef {
  rooms: Rect[];
  wet: Rect[]; // hatched rooms (bath, kitchen)
  doors: { x: number; y: number; r: number; rot: number }[]; // swing arcs, r in 0–1 of width
  windows: { x0: number; x1: number; y: number }[];
  stair?: Rect;
}

const F1: PlanDef = {
  rooms: [[0.05, 0.08, 0.45, 0.55], [0.45, 0.08, 0.75, 0.55], [0.75, 0.08, 0.95, 0.55], [0.05, 0.55, 0.3, 0.92], [0.3, 0.55, 0.45, 0.92], [0.45, 0.55, 0.6, 0.92], [0.6, 0.55, 0.95, 0.92]],
  wet: [[0.45, 0.55, 0.6, 0.92], [0.75, 0.08, 0.95, 0.2]],
  doors: [{ x: 0.12, y: 0.92, r: 0.05, rot: 0 }, { x: 0.25, y: 0.55, r: 0.04, rot: 0 }, { x: 0.47, y: 0.55, r: 0.035, rot: 0 }, { x: 0.65, y: 0.55, r: 0.04, rot: 0 }],
  windows: [{ x0: 0.1, x1: 0.38, y: 0.08 }, { x0: 0.5, x1: 0.7, y: 0.08 }, { x0: 0.66, x1: 0.9, y: 0.92 }],
  stair: [0.3, 0.55, 0.45, 0.92],
};
const F2: PlanDef = {
  rooms: [[0.05, 0.08, 0.45, 0.55], [0.45, 0.08, 0.95, 0.5], [0.62, 0.5, 0.95, 0.92], [0.45, 0.5, 0.62, 0.92], [0.05, 0.55, 0.45, 0.92]],
  wet: [[0.45, 0.5, 0.62, 0.92]],
  doors: [{ x: 0.38, y: 0.55, r: 0.04, rot: 0 }, { x: 0.5, y: 0.5, r: 0.035, rot: 0 }, { x: 0.66, y: 0.5, r: 0.04, rot: 0 }],
  windows: [{ x0: 0.1, x1: 0.38, y: 0.08 }, { x0: 0.55, x1: 0.88, y: 0.08 }, { x0: 0.68, x1: 0.9, y: 0.92 }],
  stair: [0.3, 0.55, 0.45, 0.92],
};

function planSvg(p: PlanDef): string {
  const X = (v: number) => (v * PW).toFixed(1);
  const Y = (v: number) => (v * PH).toFixed(1);
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}">`, `<rect width="${PW}" height="${PH}" fill="#fff"/>`];
  out.push('<defs><pattern id="h" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="24" stroke="#c9c9c9" stroke-width="3"/></pattern></defs>');
  for (const [a, b, c, d] of p.wet) out.push(`<rect x="${X(a)}" y="${Y(b)}" width="${X(c - a)}" height="${Y(d - b)}" fill="url(#h)"/>`);
  if (p.stair) {
    const [a, b, c, d] = p.stair;
    for (let i = 1; i < 10; i++) out.push(`<line x1="${X(a)}" y1="${Y(b + ((d - b) * i) / 10)}" x2="${X(c)}" y2="${Y(b + ((d - b) * i) / 10)}" stroke="#777" stroke-width="3"/>`);
  }
  for (const [a, b, c, d] of p.rooms) out.push(`<rect x="${X(a)}" y="${Y(b)}" width="${X(c - a)}" height="${Y(d - b)}" fill="none" stroke="#2b2b2b" stroke-width="10"/>`);
  out.push(`<rect x="${X(0.05)}" y="${Y(0.08)}" width="${X(0.9)}" height="${Y(0.84)}" fill="none" stroke="#1a1a1a" stroke-width="22"/>`);
  for (const w of p.windows) {
    out.push(`<rect x="${X(w.x0)}" y="${(w.y * PH - 9).toFixed(1)}" width="${X(w.x1 - w.x0)}" height="18" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>`);
    out.push(`<line x1="${X(w.x0)}" y1="${Y(w.y)}" x2="${X(w.x1)}" y2="${Y(w.y)}" stroke="#1a1a1a" stroke-width="3"/>`);
  }
  for (const d of p.doors) {
    const r = d.r * PW;
    out.push(`<g transform="translate(${X(d.x)} ${Y(d.y)}) rotate(${d.rot})"><rect x="0" y="-8" width="${r.toFixed(1)}" height="16" fill="#fff"/><line x1="0" y1="0" x2="0" y2="${(-r).toFixed(1)}" stroke="#444" stroke-width="4"/><path d="M0 ${(-r).toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${r.toFixed(1)} 0" fill="none" stroke="#888" stroke-width="3" stroke-dasharray="10 8"/></g>`);
  }
  out.push('</svg>');
  return out.join('');
}

const planImage = async (p: PlanDef) => saveImage(await sharp(Buffer.from(planSvg(p))).png().toBuffer());

/* ---------- specs (generic types, placeholder models) ---------- */
interface Spec { code: string; model: string; name: string; finish?: string; socket?: string; bulbs?: number; w?: number; wt?: number; k?: number; ip?: string; qty?: number; symbol: string; color: string; unit?: string; price?: number; note?: string }
const S: Spec[] = [
  { code: 'LT1', model: '[MODEL]-01', name: 'โคมช่อ', socket: 'E27', bulbs: 6, k: 3000, qty: 1, symbol: 'pendant', color: 'red' },
  { code: 'LT2', model: '[MODEL]-02', name: 'โคมช่อกิ่งไม้', finish: 'ทอง', socket: 'G9', bulbs: 12, k: 3000, qty: 1, symbol: 'pendant', color: 'red' },
  { code: 'LT3', model: '[MODEL]-03', name: 'โคมผนังทรงกลม', socket: 'G9', bulbs: 1, k: 3000, qty: 2, symbol: 'wall', color: 'blue' },
  { code: 'LT4', model: '[MODEL]-04', name: 'โคมแขวนวงแหวน', wt: 80, k: 3000, ip: 'IP20', qty: 2, symbol: 'pendant', color: 'red', note: 'สเปคชีทระบุ 2 ชุด แต่แปลนมี 1 จุด' },
  { code: 'LT5', model: '[MODEL]-05', name: 'โคมแขวนราง', socket: 'G9', bulbs: 7, k: 3000, qty: 1, symbol: 'pendant', color: 'red' },
  { code: 'LT6', model: '', name: 'โคมตั้งโต๊ะ', k: 3000, symbol: 'downlight', color: 'green' },
  { code: 'LT7', model: '[MODEL]-07', name: 'โคมผนังกระเปาะ', socket: 'E27', bulbs: 1, w: 40, k: 3000, qty: 2, symbol: 'wall', color: 'blue' },
  { code: 'LT8', model: '[MODEL]-08', name: 'โคมแขวนวงแหวนคู่', k: 3000, qty: 1, symbol: 'pendant', color: 'red' },
  { code: 'LT9', model: '[MODEL]-09', name: 'โคมแขวนราง', finish: 'สโมค', wt: 16, k: 6500, qty: 1, symbol: 'pendant', color: 'red' },
  { code: 'LT10', model: '[MODEL]-10', name: 'โคมซาลาเปา คริสตัล', finish: 'ใส', socket: 'E14', bulbs: 12, w: 40, k: 3000, qty: 2, symbol: 'pendant', color: 'red' },
  { code: 'LT11', model: '', name: 'โคมตั้งโต๊ะ', k: 3000, symbol: 'downlight', color: 'green' },
  { code: 'LT12', model: '[MODEL]-12', name: 'โคมแขวนราง', socket: 'G9', bulbs: 8, w: 40, k: 3000, qty: 1, symbol: 'pendant', color: 'red' },
  { code: 'LT13', model: '[MODEL]-13', name: 'โคมแขวนวงกลม', socket: 'G9', bulbs: 15, k: 3000, qty: 1, symbol: 'pendant', color: 'red' },
  { code: 'LN1', model: '[MODEL] LED strip 9W/m', name: 'ไฟเส้น LED ซ่อนฝ้า', w: 9, k: 3000, symbol: 'strip', color: 'blue', unit: 'm', price: 180, note: 'ตัวอย่างข้อมูล (เส้นประ)' },
  { code: 'TR1', model: '[MODEL] Track 1 m', name: 'ราง Tracklight', symbol: 'track', color: 'red', unit: 'm', price: 650, note: 'ตัวอย่างข้อมูล' },
  { code: 'SP1', model: '[MODEL] Spot 12W', name: 'สปอตไลท์หัวราง', wt: 12, k: 3000, symbol: 'spot', color: 'red', price: 890, note: 'ตัวอย่างข้อมูล' },
];

/* ---------- markers, placed inside the generated rooms ---------- */
const POINTS: { code: string; floor: 'f1' | 'f2'; x: number; y: number }[] = [
  { code: 'LT1', floor: 'f1', x: 0.175, y: 0.73 }, // foyer
  { code: 'LT2', floor: 'f1', x: 0.6, y: 0.3 }, // dining
  { code: 'LT3', floor: 'f1', x: 0.62, y: 0.68 }, // guest room wall
  { code: 'LT3', floor: 'f1', x: 0.62, y: 0.84 },
  { code: 'LT4', floor: 'f1', x: 0.25, y: 0.3 }, // living
  { code: 'LT5', floor: 'f1', x: 0.85, y: 0.36 }, // kitchen island
  { code: 'LT6', floor: 'f1', x: 0.1, y: 0.48 }, // living, table lamps
  { code: 'LT6', floor: 'f1', x: 0.4, y: 0.48 },
  { code: 'LT7', floor: 'f1', x: 0.07, y: 0.66 }, // foyer wall
  { code: 'LT7', floor: 'f1', x: 0.07, y: 0.84 },
  { code: 'LT8', floor: 'f2', x: 0.25, y: 0.3 }, // bedroom 1
  { code: 'LT9', floor: 'f2', x: 0.6, y: 0.28 }, // family
  { code: 'LT10', floor: 'f2', x: 0.72, y: 0.72 }, // bedroom 2
  { code: 'LT10', floor: 'f2', x: 0.86, y: 0.72 },
  { code: 'LT11', floor: 'f2', x: 0.1, y: 0.48 },
  { code: 'LT11', floor: 'f2', x: 0.3, y: 0.48 },
  { code: 'LT12', floor: 'f2', x: 0.8, y: 0.28 },
  { code: 'LT13', floor: 'f2', x: 0.16, y: 0.74 }, // hall
];

const run = async () => {
  const pid = Number(db.prepare("INSERT INTO projects(name, client, location, project_no, designer, revision, doc_date) VALUES(?, '[PLACEHOLDER]', '[PLACEHOLDER]', 'LT-0000-000', '[PLACEHOLDER]', 'A', date('now'))").run(NAME).lastInsertRowid);
  const floorIds: Record<string, number> = {};
  for (const [i, [key, name, def]] of ([['f1', 'ชั้น 1', F1], ['f2', 'ชั้น 2', F2]] as const).entries()) {
    const im = await planImage(def);
    floorIds[key] = Number(db.prepare('INSERT INTO floors(project_id,name,sort,plan_file,plan_w,plan_h,mpp) VALUES(?,?,?,?,?,?,?)').run(pid, name, i, im.file, im.w, im.h, PLAN_WIDTH_M / im.w).lastInsertRowid);
  }
  const fid: Record<string, number> = {};
  for (const [i, s] of S.entries()) {
    fid[s.code] = Number(db.prepare(`INSERT INTO fixtures(project_id,code,model,name,finish,socket,bulbs,watt_per_lamp,watt_total,kelvin,ip,symbol,color,unit,price,note,spec_qty,sort)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(pid, s.code, s.model, s.name, s.finish ?? '', s.socket ?? '', s.bulbs ?? null, s.w ?? null, s.wt ?? null, s.k ?? null, s.ip ?? '', s.symbol, s.color, s.unit ?? 'ea', s.price ?? null, s.note ?? '', s.qty ?? null, i).lastInsertRowid);
  }
  const circ: Record<string, number> = {};
  for (const [i, [n, area]] of ([['LV-01', 'ห้องนั่งเล่น / โถง'], ['LV-02', 'ห้องทานอาหาร / ครัว'], ['LV-03', 'ชั้น 2 ห้องนอน']] as const).entries())
    circ[n] = Number(db.prepare('INSERT INTO circuits(project_id,name,area,sort) VALUES(?,?,?,?)').run(pid, n, area, i).lastInsertRowid);
  const route: Record<string, string> = { LT1: 'LV-01', LT4: 'LV-01', LT7: 'LV-01', LT2: 'LV-02', LT3: 'LV-02', LT5: 'LV-02', LT8: 'LV-03', LT9: 'LV-03', LT10: 'LV-03', LT12: 'LV-03', LT13: 'LV-03' };
  const order: Record<string, number> = {};
  for (const p of POINTS) {
    const c = route[p.code];
    const o = c ? (order[c] = (order[c] ?? -1) + 1) : 0;
    db.prepare('INSERT INTO placements(project_id,floor_id,fixture_id,x,y,rot,circuit_id,circuit_order) VALUES(?,?,?,?,?,?,?,?)').run(pid, floorIds[p.floor], fid[p.code], p.x, p.y, 0, c ? circ[c] : null, o);
  }
  // sample line elements on floor 1: cove LED strip in the living room, track rail over the dining table
  db.prepare('INSERT INTO lines(project_id,floor_id,fixture_id,pts,heads,circuit_id,circuit_order) VALUES(?,?,?,?,?,?,?)').run(pid, floorIds.f1, fid.LN1, JSON.stringify([[0.08, 0.13], [0.42, 0.13], [0.42, 0.5]]), 0, circ['LV-01'], 90);
  db.prepare('INSERT INTO lines(project_id,floor_id,fixture_id,pts,heads,head_fixture_id,circuit_id,circuit_order) VALUES(?,?,?,?,?,?,?,?)').run(pid, floorIds.f1, fid.TR1, JSON.stringify([[0.49, 0.45], [0.71, 0.45]]), 3, fid.SP1, circ['LV-02'], 91);
  console.log(`Seeded ${NAME}, project id`, pid);
};
await run();
