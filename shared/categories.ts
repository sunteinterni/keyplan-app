// Material categories: the 12 built in from the KEYPLAN guideline (page 09) plus any the studio adds.
// A category gives every item its code prefix (F-01, BI-02 …), default unit, icon and quantity rule.
import type { Category, Unit } from './types';

export interface UnitInfo {
  code: Unit;
  th: string;
  en: string;
  length?: boolean; // measured along a drawn line on the plan
}
export const UNITS: UnitInfo[] = [
  { code: 'ea', th: 'ชิ้น', en: 'PC' },
  { code: 'set', th: 'ชุด', en: 'SET' },
  { code: 'm', th: 'ม.', en: 'M', length: true },
  { code: 'm2', th: 'ตร.ม.', en: 'M2' },
  { code: 'ltr', th: 'ลิตร', en: 'LTR' },
  { code: 'roll', th: 'ม้วน', en: 'ROLL' },
  { code: 'pnl', th: 'บาน', en: 'PNL' },
  { code: 'pt', th: 'จุด', en: 'PT' },
  { code: 'ls', th: 'เหมา', en: 'LS' },
];
export const UNIT_CODES = UNITS.map((u) => u.code);
export const unitInfo = (u: string): UnitInfo => UNITS.find((x) => x.code === u) ?? UNITS[0];
export const unitTh = (u: string) => unitInfo(u).th;
export const isLengthUnit = (u: string) => !!unitInfo(u).length;
export const isUnit = (u: unknown): u is Unit => UNIT_CODES.includes(u as Unit);

/** Icon keys = files in reference/brand/icons (see brand-assets.ts). 'other' draws a plain box for new categories. */
export const ICON_KEYS = ['furniture', 'built-in', 'lighting', 'surfaces', 'paint', 'plumbing', 'hardware', 'equipment', 'countertop', 'decor', 'signage', 'graphics', 'other'] as const;
export type IconKey = (typeof ICON_KEYS)[number];

/** Lighting keeps Light Theory's tools: watts, kelvin, circuits and the load schedule. */
export const LIGHTING = 'L';

export interface BuiltinCategory {
  prefix: string;
  name_th: string;
  name_en: string;
  unit: Unit;
  qty_mode: 'plan' | 'manual';
  icon: IconKey;
}
/** Order and names follow the guideline. Area / length work (surfaces, paint, countertop, graphics) is entered by hand. */
export const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { prefix: 'F', name_th: 'เฟอร์นิเจอร์', name_en: 'Furniture', unit: 'ea', qty_mode: 'plan', icon: 'furniture' },
  { prefix: 'BI', name_th: 'งานบิวท์อิน', name_en: 'Built-in', unit: 'set', qty_mode: 'plan', icon: 'built-in' },
  { prefix: 'L', name_th: 'ไฟส่องสว่าง', name_en: 'Lighting', unit: 'set', qty_mode: 'plan', icon: 'lighting' },
  { prefix: 'S', name_th: 'วัสดุปิดผิว', name_en: 'Surfaces', unit: 'm2', qty_mode: 'manual', icon: 'surfaces' },
  { prefix: 'P', name_th: 'สี', name_en: 'Paint', unit: 'm2', qty_mode: 'manual', icon: 'paint' },
  { prefix: 'PL', name_th: 'สุขภัณฑ์และประปา', name_en: 'Plumbing', unit: 'set', qty_mode: 'plan', icon: 'plumbing' },
  { prefix: 'H', name_th: 'ฮาร์ดแวร์', name_en: 'Hardware', unit: 'ea', qty_mode: 'plan', icon: 'hardware' },
  { prefix: 'EQ', name_th: 'เครื่องใช้และอุปกรณ์', name_en: 'Equipment', unit: 'ea', qty_mode: 'plan', icon: 'equipment' },
  { prefix: 'CT', name_th: 'เคาน์เตอร์ท็อป', name_en: 'Countertop', unit: 'm', qty_mode: 'manual', icon: 'countertop' },
  { prefix: 'D', name_th: 'ของตกแต่ง', name_en: 'Decor', unit: 'ea', qty_mode: 'plan', icon: 'decor' },
  { prefix: 'SG', name_th: 'ป้าย', name_en: 'Signage', unit: 'ea', qty_mode: 'plan', icon: 'signage' },
  { prefix: 'G', name_th: 'กราฟิก', name_en: 'Graphics', unit: 'm2', qty_mode: 'manual', icon: 'graphics' },
];

/** Lighting sub-prefixes kept from Light Theory (DL downlight, WL wall …), offered next to "L" for lighting items. */
export const LIGHTING_PREFIXES = ['DL', 'WL', 'PD', 'SP', 'TR', 'LN', 'T5', 'EX'];

/**
 * Normalises a typed category prefix: A–Z only, upper case, 1–4 letters. Digits are not allowed because
 * codes are PREFIX-NN and a trailing digit would make codes ambiguous.
 */
export const cleanCategoryPrefix = (p: string) => p.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

/** Category of an item, falling back to a neutral one when the prefix is unknown (e.g. archived and missing). */
export function categoryOf(cats: Category[], prefix: string): Category {
  return cats.find((c) => c.prefix === prefix) ?? {
    id: 0, prefix, name_th: prefix, name_en: '', unit: 'ea', qty_mode: 'plan', icon: 'other', builtin: 0, sort: 999, archived: 0,
  };
}

/** Categories in display order (built-in first in guideline order, then the studio's own). */
export const sortCategories = (cats: Category[]) => cats.slice().sort((a, b) => a.sort - b.sort || a.prefix.localeCompare(b.prefix));

/** Label like "F · เฟอร์นิเจอร์". */
export const categoryLabel = (c: Pick<Category, 'prefix' | 'name_th'>) => `${c.prefix} · ${c.name_th}`;
