// Quantity, BOQ and Lighting Load Schedule calculations. Pure functions over a project bundle.
import type { Bundle, Category, Circuit, Fixture, Floor, LineEl } from './types';
import { LIGHTING, categoryOf, isLengthUnit, sortCategories } from './categories';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const LIGHT_TYPES = [
  { key: 'builtin', th: 'Built-in', en: 'Integrated LED', note: 'หลอด/LED ในตัว ราคาเดียวจบ' },
  { key: 'retrofit', th: 'Retrofit', en: 'Replaceable lamp', note: 'โคม + หลอดแยก ราคาหลอดคูณจำนวนหลอดต่อชุด' },
  { key: 'driver', th: 'Driver', en: 'With driver', note: 'โคม + Driver แยก ราคา Driver ต่อหน่วย' },
] as const;

/**
 * Price per unit of an item as quoted: the fixture price, plus the lamps for a retrofit light (price × lamps per set)
 * or the driver for a light with a separate driver. Null while the fixture price is missing ("รอราคา").
 * Only lighting items have extras.
 */
export function unitPrice(f: Pick<Fixture, 'cat' | 'price' | 'light_type' | 'lamp_price' | 'driver_price' | 'bulbs'>): number | null {
  if (f.price == null) return null;
  return r2(f.price + lightExtra(f));
}
/** The lamp or driver part of the unit price (0 for built-in lights and other categories). */
export function lightExtra(f: Pick<Fixture, 'cat' | 'light_type' | 'lamp_price' | 'driver_price' | 'bulbs'>): number {
  if (f.cat !== 'L') return 0;
  if (f.light_type === 'retrofit') return r2((f.lamp_price ?? 0) * (f.bulbs && f.bulbs > 0 ? f.bulbs : 1));
  if (f.light_type === 'driver') return r2(f.driver_price ?? 0);
  return 0;
}
/** Short text for spec columns: lamp or driver type and what was added to the price. */
export function lightExtraText(f: Pick<Fixture, 'cat' | 'light_type' | 'lamp_type' | 'lamp_price' | 'driver_type' | 'driver_price' | 'bulbs'>): string {
  if (f.cat !== 'L') return '';
  if (f.light_type === 'retrofit') return ['หลอด', f.lamp_type, f.lamp_price != null ? `${f.bulbs && f.bulbs > 1 ? `${f.bulbs}×` : ''}${f.lamp_price.toLocaleString('en-US')}` : ''].filter(Boolean).join(' ');
  if (f.light_type === 'driver') return ['Driver', f.driver_type, f.driver_price != null ? f.driver_price.toLocaleString('en-US') : ''].filter(Boolean).join(' ');
  return '';
}

export function unitWatt(f: Fixture): number {
  if (f.unit === 'm') return f.watt_per_lamp ?? f.watt_total ?? 0; // W per metre
  if (f.watt_total != null) return f.watt_total;
  if (f.bulbs != null && f.watt_per_lamp != null) return f.bulbs * f.watt_per_lamp;
  return f.watt_per_lamp ?? 0;
}

export function lampText(f: Fixture): string {
  const parts: string[] = [];
  if (f.socket) parts.push(f.socket);
  if (f.bulbs) parts.push(`×${f.bulbs}`);
  if (f.watt_per_lamp != null) parts.push(`${f.watt_per_lamp}W${f.unit === 'm' ? '/m' : ''}`);
  else if (f.watt_total != null) parts.push(`${f.watt_total}W`);
  return parts.join(' ');
}

/** Real length of a drawn line in metres, or null when the floor has no scale yet. */
export function lineLengthM(line: Pick<LineEl, 'pts'>, floor: Pick<Floor, 'mpp' | 'plan_w' | 'plan_h'>): number | null {
  if (!floor.mpp || !floor.plan_w || !floor.plan_h) return null;
  let px = 0;
  for (let i = 1; i < line.pts.length; i++) {
    px += Math.hypot((line.pts[i][0] - line.pts[i - 1][0]) * floor.plan_w, (line.pts[i][1] - line.pts[i - 1][1]) * floor.plan_h);
  }
  return px * floor.mpp;
}

export interface Qty {
  perFloor: Record<number, number>; // counted on the plan, per floor
  plan: number; // counted on the plan, all floors
  total: number; // quantity used in BOQ: the typed quantity when manual, else the plan count
  manual: boolean; // total comes from qty_manual (manual category, or a typed override)
  uncalibrated: number; // lines of this fixture on floors without a scale
}

/** Manual categories (area / length work) never take QTY from pins; any item can override the plan count by typing a quantity. */
export const isManualQty = (f: Pick<Fixture, 'cat' | 'qty_manual'>, cats: Category[]) =>
  f.qty_manual != null || categoryOf(cats, f.cat).qty_mode === 'manual';

export function quantities(b: Bundle): Record<number, Qty> {
  const q: Record<number, Qty> = {};
  const get = (id: number) => (q[id] ??= { perFloor: {}, plan: 0, total: 0, manual: false, uncalibrated: 0 });
  const add = (id: number, floorId: number, n: number) => {
    const e = get(id);
    e.perFloor[floorId] = (e.perFloor[floorId] ?? 0) + n;
    e.total += n;
  };
  const floors = new Map(b.floors.map((f) => [f.id, f]));
  for (const p of b.placements) add(p.fixture_id, p.floor_id, 1);
  for (const l of b.lines) {
    const fl = floors.get(l.floor_id);
    const len = fl ? lineLengthM(l, fl) : null;
    if (len == null) get(l.fixture_id).uncalibrated++;
    else add(l.fixture_id, l.floor_id, len);
    if (l.head_fixture_id && l.heads > 0) add(l.head_fixture_id, l.floor_id, l.heads);
  }
  for (const e of Object.values(q)) {
    e.total = r2(e.total);
    for (const k of Object.keys(e.perFloor)) e.perFloor[+k] = r2(e.perFloor[+k]);
  }
  const cats = b.categories ?? [];
  for (const f of b.fixtures) {
    const e = get(f.id);
    e.plan = e.total;
    e.manual = isManualQty(f, cats);
    if (e.manual) e.total = r2(Math.max(0, f.qty_manual ?? 0));
  }
  return q;
}

export interface BoqRow {
  fixture: Fixture;
  category: Category;
  qty: Qty;
  price: number | null;
  amount: number;
}
export interface BoqGroup {
  category: Category;
  rows: BoqRow[];
  sub: number;
}
export interface Boq {
  rows: BoqRow[]; // in category order, then by code
  groups: BoqGroup[];
  sub: number;
  discount: number;
  install: number;
  base: number;
  vat: number;
  grand: number;
  unpriced: number;
}

const codeNo = (c: string) => parseInt(c.replace(/\D/g, ''), 10) || 0;
export const byCode = (a: Fixture, b: Fixture) => a.code.replace(/\d+/g, '').localeCompare(b.code.replace(/\d+/g, '')) || codeNo(a.code) - codeNo(b.code);

export function boq(b: Bundle): Boq {
  const q = quantities(b);
  const cats = b.categories ?? [];
  const order = new Map(sortCategories(cats).map((c, i) => [c.prefix, i]));
  const rank = (f: Fixture) => order.get(f.cat) ?? 999;
  const rows: BoqRow[] = b.fixtures
    .slice()
    .sort((a, z) => rank(a) - rank(z) || a.cat.localeCompare(z.cat) || byCode(a, z))
    .filter((f) => (q[f.id]?.total ?? 0) > 0)
    .map((f) => {
      const qty = q[f.id];
      const price = unitPrice(f);
      return { fixture: f, category: categoryOf(cats, f.cat), qty, price, amount: price == null ? 0 : r2(price * qty.total) };
    });
  const groups: BoqGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.category.prefix === r.category.prefix) last.rows.push(r);
    else groups.push({ category: r.category, rows: [r], sub: 0 });
  }
  for (const g of groups) g.sub = r2(g.rows.reduce((a, r) => a + r.amount, 0));
  const sub = r2(rows.reduce((a, r) => a + r.amount, 0));
  const discount = Math.min(b.project.discount || 0, sub);
  const install = b.project.install_fee || 0;
  const base = r2(sub - discount + install);
  const vat = r2(base * ((b.project.vat_rate ?? 7) / 100));
  return { rows, groups, sub, discount, install, base, vat, grand: r2(base + vat), unpriced: rows.filter((r) => r.price == null).length };
}

export interface LoadItem {
  fixture: Fixture;
  qty: number;
  watts: number;
}
export interface LoadRow {
  circuit: Circuit | null; // null = not assigned to any circuit
  items: LoadItem[];
  pieces: number; // fixtures counted in pieces
  meters: number; // strip / track length
  watts: number;
  amps: number;
}
export interface LoadSchedule {
  rows: LoadRow[];
  unassigned: LoadRow | null;
  totalPieces: number;
  totalMeters: number;
  totalWatts: number;
  totalAmps: number;
}

/** Lighting Load Schedule: lighting items only (other categories have no circuits). */
export function loadSchedule(b: Bundle): LoadSchedule {
  const floors = new Map(b.floors.map((f) => [f.id, f]));
  const fixtures = new Map(b.fixtures.filter(isLighting).map((f) => [f.id, f]));
  const volts = b.project.voltage || 220;
  const pf = b.project.pf || 1;
  const bucket = new Map<number | null, Map<number, number>>();
  const put = (cid: number | null, fid: number, n: number) => {
    const m = bucket.get(cid) ?? new Map<number, number>();
    m.set(fid, (m.get(fid) ?? 0) + n);
    bucket.set(cid, m);
  };
  for (const p of b.placements) put(p.circuit_id, p.fixture_id, 1);
  for (const l of b.lines) {
    const fl = floors.get(l.floor_id);
    const len = fl ? lineLengthM(l, fl) : null;
    if (len != null) put(l.circuit_id, l.fixture_id, len);
    if (l.head_fixture_id && l.heads > 0) put(l.circuit_id, l.head_fixture_id, l.heads);
  }
  const mk = (circuit: Circuit | null): LoadRow => {
    const m = bucket.get(circuit ? circuit.id : null) ?? new Map<number, number>();
    const items: LoadItem[] = [...m.entries()]
      .map(([fid, qty]) => ({ fixture: fixtures.get(fid)!, qty: r2(qty), watts: 0 }))
      .filter((i) => i.fixture)
      .sort((a, c) => byCode(a.fixture, c.fixture));
    for (const i of items) i.watts = r2(i.qty * unitWatt(i.fixture));
    const watts = r2(items.reduce((a, i) => a + i.watts, 0));
    return {
      circuit,
      items,
      pieces: items.filter((i) => !isLengthUnit(i.fixture.unit)).reduce((a, i) => a + i.qty, 0),
      meters: r2(items.filter((i) => isLengthUnit(i.fixture.unit)).reduce((a, i) => a + i.qty, 0)),
      watts,
      amps: r2(watts / (volts * pf)),
    };
  };
  const rows = b.circuits.slice().sort((a, c) => a.sort - c.sort || a.name.localeCompare(c.name, 'en', { numeric: true })).map(mk);
  const un = mk(null);
  const unassigned = un.items.length ? un : null;
  const all = unassigned ? [...rows, unassigned] : rows;
  const totalWatts = r2(all.reduce((a, r) => a + r.watts, 0));
  return {
    rows,
    unassigned,
    totalPieces: all.reduce((a, r) => a + r.pieces, 0),
    totalMeters: r2(all.reduce((a, r) => a + r.meters, 0)),
    totalWatts,
    totalAmps: r2(totalWatts / (volts * pf)),
  };
}

export interface Issue {
  level: 'crit' | 'warn' | 'cool';
  code: string;
  text: string;
}

export const isLighting = (f: Pick<Fixture, 'cat'>) => f.cat === LIGHTING;

export function issues(b: Bundle): Issue[] {
  const out: Issue[] = [];
  const q = quantities(b);
  const used = b.fixtures.filter((f) => (q[f.id]?.total ?? 0) > 0 || (q[f.id]?.uncalibrated ?? 0) > 0).sort(byCode);
  for (const f of b.fixtures.slice().sort(byCode)) {
    if (q[f.id]?.manual && f.qty_manual == null) out.push({ level: 'warn', code: f.code, text: 'ยังไม่กรอกจำนวน (หมวดนี้กรอกจำนวนเอง)' });
  }
  const kc: Record<string, number> = {};
  used.filter(isLighting).forEach((f) => f.kelvin && (kc[f.kelvin] = (kc[f.kelvin] ?? 0) + 1));
  const dom = Object.keys(kc).sort((a, c) => kc[c] - kc[a])[0];
  for (const f of used) {
    const e = q[f.id];
    if (!f.model && !f.name) out.push({ level: 'crit', code: f.code, text: 'ยังไม่มีชื่อหรือรุ่น' });
    if (f.price == null) out.push({ level: 'warn', code: f.code, text: 'รอราคา' });
    if (isLighting(f) && f.light_type === 'retrofit' && f.lamp_price == null) out.push({ level: 'warn', code: f.code, text: 'ยังไม่มีราคาหลอด' });
    if (isLighting(f) && f.light_type === 'driver' && f.driver_price == null) out.push({ level: 'warn', code: f.code, text: 'ยังไม่มีราคา Driver' });
    if (!e.manual && !isLengthUnit(f.unit) && f.spec_qty != null && f.spec_qty !== e.total)
      out.push({ level: 'crit', code: f.code, text: `สเปคชีทระบุ ×${f.spec_qty} แต่บนแปลนมี ${e.total}` });
    if (e.uncalibrated) out.push({ level: 'crit', code: f.code, text: `มีเส้น ${e.uncalibrated} เส้นบนชั้นที่ยังไม่ตั้งสเกล จึงยังไม่นับความยาว` });
    if (!isLighting(f)) continue;
    if (dom && f.kelvin && String(f.kelvin) !== dom) out.push({ level: 'cool', code: f.code, text: `${f.kelvin}K ต่างจากโคมส่วนใหญ่ (${dom}K)` });
    if (unitWatt(f) === 0) out.push({ level: 'warn', code: f.code, text: 'ยังไม่ระบุวัตต์ จึงไม่นับใน Load Schedule' });
  }
  if (b.circuits.length) {
    const ls = loadSchedule(b);
    if (ls.unassigned) for (const i of ls.unassigned.items) out.push({ level: 'warn', code: i.fixture.code, text: 'มีรายการที่ยังไม่อยู่ในวงจรใด' });
    for (const r of ls.rows) if (!r.items.length) out.push({ level: 'warn', code: r.circuit!.name, text: 'วงจรนี้ยังไม่มีโคม' });
  }
  return out.filter((v, i, a) => a.findIndex((x) => x.code === v.code && x.text === v.text) === i);
}
