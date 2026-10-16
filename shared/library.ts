// Central item library (คลังสินค้า): which fields a project copy shares with its library item,
// and how to tell that the library has moved on since the copy was made.
import type { Fixture, LibraryItem } from './types';

/**
 * Spec fields copied from the library into a project and offered by "update from library".
 * Not here: code / spec_qty / sort (belong to the project) and color — the plan colour is chosen
 * per project, so it is only copied once on import and never overwritten later.
 */
export const SPEC_FIELDS = [
  'cat', 'model', 'name', 'size', 'finish', 'socket', 'bulbs', 'watt_per_lamp', 'watt_total', 'kelvin', 'ip',
  'symbol', 'unit', 'price', 'supplier', 'note', 'photo_file', 'drawing_file', 'length_m',
] as const;
export type SpecField = (typeof SPEC_FIELDS)[number];

export const FIELD_LABEL: Record<SpecField, string> = {
  cat: 'หมวด', model: 'รุ่น', name: 'ชื่อ', size: 'ขนาด', finish: 'สี/ผิว', socket: 'ขั้วหลอด', bulbs: 'จำนวนหลอด', watt_per_lamp: 'วัตต์/หลอด',
  watt_total: 'วัตต์รวม', kelvin: 'อุณหภูมิสี', ip: 'IP', symbol: 'สัญลักษณ์', unit: 'หน่วย', price: 'ราคา',
  supplier: 'ซัพพลายเออร์', note: 'หมายเหตุ', photo_file: 'รูปสินค้า', drawing_file: 'รูป Drawing', length_m: 'ความยาว (ม.)',
};

export interface Change {
  field: SpecField;
  from: unknown; // value in the project
  to: unknown; // value in the library
}

const norm = (v: unknown) => (v === undefined || v === '' ? null : typeof v === 'number' ? Number(v) : v);

/** Spec fields where the project copy differs from the library item. */
export function libraryChanges(f: Pick<Fixture, SpecField>, item: Pick<LibraryItem, SpecField>): Change[] {
  return SPEC_FIELDS.filter((k) => norm(f[k]) !== norm(item[k])).map((k) => ({ field: k, from: f[k], to: item[k] }));
}

/** The library item was edited after this copy was made or last reviewed, and the edit changed something. */
export function hasLibraryUpdate(f: Fixture, item: LibraryItem | undefined): boolean {
  if (!item || f.library_id !== item.id) return false;
  return item.updated_at > (f.library_synced_at ?? '') && libraryChanges(f, item).length > 0;
}

/** Lighting: suggested code prefix per plan symbol (DL downlight …). Other categories use their own prefix. */
export const PREFIX_BY_SYMBOL: Record<string, string> = {
  downlight: 'DL', wall: 'WL', spot: 'SP', pendant: 'PD', track: 'TR', strip: 'LN', linear: 'T5',
};

/** Normalises a typed code prefix: letters/digits only, upper case, at most 6 characters. */
export const cleanPrefix = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'X';

/**
 * Next free code for a prefix in the brand format PREFIX-NN (two digits, more when needed):
 * DL-01, DL-02 … Existing codes count whether written DL1, DL-1 or DL-01; gaps are never reused,
 * so codes already on drawings never shift.
 */
export function nextCode(codes: string[], prefix = 'X'): string {
  const p = cleanPrefix(prefix);
  const re = new RegExp(`^${p}-?(\\d+)$`, 'i');
  const max = codes.reduce((m, c) => Math.max(m, Number(re.exec(c.trim())?.[1] ?? 0)), 0);
  return `${p}-${String(max + 1).padStart(2, '0')}`;
}

/** Text a library search matches against. */
export const searchText = (i: Pick<LibraryItem, 'code' | 'cat' | 'model' | 'name' | 'size' | 'supplier' | 'category' | 'socket' | 'finish'>) =>
  [i.code, i.cat, i.model, i.name, i.size, i.supplier, i.category, i.socket, i.finish].join(' ').toLowerCase();
