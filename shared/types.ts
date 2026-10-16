// Shared data types: used by the server (SQLite rows / JSON API), the web app and the PDF exporter.

// marker (square), circle, triangle: item pins for every category; the lighting symbols come from Light Theory
export type PointSymbol = 'marker' | 'circle' | 'triangle' | 'downlight' | 'wall' | 'spot' | 'pendant' | 'linear'; // linear: T5 batten etc., a fixed-length line counted per piece
export type LineSymbol = 'track' | 'strip';
export type SymbolKind = PointSymbol | LineSymbol;
export type ColorKey = 'red' | 'blue' | 'green';
export type MarkSize = 'S' | 'M' | 'L';
export type Unit = 'ea' | 'set' | 'm' | 'm2' | 'ltr' | 'roll' | 'pnl' | 'pt' | 'ls'; // see shared/categories.ts UNITS
import type { Status } from './brand';
export type { Status };

/** Material category (shared/categories.ts). Prefix is unique and never reused, even after it is archived. */
export interface Category {
  id: number;
  prefix: string; // F, BI, L … or the studio's own (e.g. WD)
  name_th: string;
  name_en: string;
  unit: Unit; // default unit for new items
  qty_mode: 'plan' | 'manual'; // plan = counted from pins and lines; manual = typed in (area, length)
  icon: string; // icon key in shared/categories.ts ICON_KEYS
  builtin: number; // 1 = one of the 12 from the guideline
  sort: number;
  archived: number; // 1 = hidden from new items; existing items keep it
  items?: number; // items in projects + library using it (list endpoint only)
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'member';
}

export interface Project {
  id: number;
  name: string;
  client: string;
  location: string;
  project_no: string;
  designer: string;
  prepared_by: string;
  revision: string;
  doc_date: string; // YYYY-MM-DD
  vat_rate: number; // percent
  voltage: number; // V, for the load schedule
  pf: number; // power factor used for amps
  discount: number; // THB
  install_fee: number; // THB
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: number;
  project_id: number;
  name: string;
  sort: number;
  plan_file: string | null;
  plan_w: number | null; // pixel size of the plan image
  plan_h: number | null;
  mpp: number | null; // metres per image pixel (set by the scale tool)
  symbol_scale: number; // multiplier on symbol size for this floor
  plan_gray: number; // 1 = show the plan in greyscale (web + PDF), 0 = original colours
  plan_opacity: number; // 0.1–1, plan drawn over white at this opacity
  plan_orig: string | null; // the uploaded plan before rotation
  plan_rot: number; // 0 / 90 / 180 / 270, clockwise from the upload
}

export interface Fixture {
  id: number;
  project_id: number;
  code: string; // F-01, BI-02, DL-01 ...
  cat: string; // category prefix
  room: string; // room / zone shown in the schedule
  size: string; // W×D×H or other dimensions, free text
  qty_manual: number | null; // typed quantity; overrides the plan count when set (always used for manual categories)
  status: Status;
  mark_size: MarkSize; // pin size on the plan (S / M / L)
  model: string;
  name: string;
  finish: string;
  socket: string; // E27, G9 ...
  bulbs: number | null; // lamps per fixture
  watt_per_lamp: number | null; // W per lamp (W per metre for unit 'm')
  watt_total: number | null; // overrides bulbs * watt_per_lamp (integrated LED)
  kelvin: number | null;
  ip: string;
  symbol: SymbolKind;
  color: ColorKey;
  unit: Unit;
  price: number | null; // THB per unit (per metre for unit 'm')
  supplier: string;
  note: string;
  photo_file: string | null;
  drawing_file: string | null;
  spec_qty: number | null; // quantity written in the original spec sheet, for cross-checking
  length_m: number | null; // linear fixtures: body length drawn to scale (e.g. T5 0.60 / 1.20 m); null = 1.20
  sort: number;
  library_id: number | null; // central library item this was copied from (null = project-only)
  library_synced_at: string | null; // library item's updated_at when last copied / reviewed
}

/** Central fixture library shared by all projects. Projects keep their own copy (see shared/library.ts). */
export interface LibraryItem {
  id: number;
  code: string; // library code (F-01 …), numbered per category, never reused
  model: string;
  name: string;
  finish: string;
  socket: string;
  bulbs: number | null;
  watt_per_lamp: number | null;
  watt_total: number | null;
  kelvin: number | null;
  ip: string;
  symbol: SymbolKind;
  color: ColorKey; // default plan colour when imported
  unit: Unit;
  price: number | null;
  supplier: string;
  note: string;
  photo_file: string | null;
  drawing_file: string | null;
  length_m: number | null;
  cat: string; // category prefix
  size: string;
  category: string; // sub-group, free text for grouping / search, e.g. "ดาวน์ไลท์", "โซฟา"
  created_by: number | null;
  created_at: string;
  updated_at: string;
  used?: number; // number of project fixtures linked to it (list endpoint only)
}

export interface Placement {
  id: number;
  project_id: number;
  floor_id: number;
  fixture_id: number;
  x: number; // 0..1 of plan width
  y: number; // 0..1 of plan height
  rot: number; // degrees, used by wall / spot symbols
  circuit_id: number | null;
  circuit_order: number;
}

export interface LineEl {
  id: number;
  project_id: number;
  floor_id: number;
  fixture_id: number;
  pts: [number, number][]; // normalised points
  heads: number; // track: number of spot heads along the rail
  head_fixture_id: number | null; // track: fixture counted for the heads
  circuit_id: number | null;
  circuit_order: number;
}

export interface Circuit {
  id: number;
  project_id: number;
  name: string; // LV-01 ...
  area: string;
  breaker_a: number | null;
  note: string;
  sort: number;
}

/** Mood board: a template (fixed slots) or 'auto' (layout from the number of images). */
export interface MoodImage {
  id: number;
  board_id: number;
  slot: number; // slot index in the template; in 'auto' the order
  file: string;
  caption: string;
  img_w: number | null; // pixel size of the image
  img_h: number | null;
  // canvas mode: frame as fractions of the sheet (null = not placed yet), layer order, crop as fractions of the image
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  z: number;
  crop_x: number;
  crop_y: number;
  crop_w: number;
  crop_h: number;
  cutout: string | null; // PNG with the background removed; shown instead of file when set
}
export interface Moodboard {
  id: number;
  project_id: number;
  title: string;
  template: string; // key in shared/moodboard.ts TEMPLATES, or 'auto'
  note: string;
  sort: number;
  images: MoodImage[];
}

export interface Bundle {
  project: Project;
  categories: Category[];
  moodboards: Moodboard[];
  retired: string[]; // codes of deleted items: never issued again in this project
  floors: Floor[];
  fixtures: Fixture[];
  placements: Placement[];
  lines: LineEl[];
  circuits: Circuit[];
}
