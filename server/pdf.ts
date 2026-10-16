// Client-facing PDF (A3 landscape) with real, selectable text.
// Thai and Latin glyphs live in separate font files, so every string is split into runs.
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { boq, byCode, isLighting, issues as _issues, lampText, lineLengthM, loadSchedule, quantities, unitWatt } from '../shared/calc';
import { BRAND, TYPE, WIRE_COLORS as WIRE, onColor } from '../shared/brand';
import { ICON_PATHS, MARK_SHAPES, WORDMARK_PATH } from '../shared/brand-assets';
import { categoryOf, sortCategories, unitTh } from '../shared/categories';
import { CANVAS, canvasItems, cropPlacement, placeImages } from '../shared/moodboard';
import { COLORS, LABEL_COLORS, markScale, linearLengthPx, baseRadius, isLineSymbol, lineStyle, pointSymbol, pointsAlong, polylineLength, primToSvg, symbolMeta, wiringPath } from '../shared/symbols';
import type { Bundle, Fixture, Floor, Moodboard } from '../shared/types';
import { planImage, uploadPath } from './files';
import { FONT_DIR, FONT_FILES, fontFor, type FontFamily, type FontWeight } from './fonts';

void _issues;

type Doc = InstanceType<typeof PDFDocument>;
const W = 1190.55;
const H = 841.89;
const MX = 40;
const TOP = 82;
const BOT = H - 52;

const INK = BRAND.ink;
const GREY = BRAND.ink2;
const RULE = BRAND.line;
const SOFT = BRAND.fill;
const PAPER = BRAND.canvas;

const TH = /[฀-๿]/;
const COMBINING = /[ัิ-ฺ็-๎]/;

function registerFonts(doc: Doc) {
  for (const f of FONT_FILES) doc.registerFont(f.name, path.join(FONT_DIR, f.file));
}

interface TOpts {
  size?: number;
  w?: FontWeight;
  color?: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
  mono?: boolean;
  family?: FontFamily; // Latin face; Thai runs stay in IBM Plex Sans Thai
  halo?: number; // white outline thickness
  track?: number; // letter-spacing in em (brand type scale); Latin runs only — Thai is never spaced out
}

/** Brand type styles for the PDF (Brand Guideline 06). */
const T = {
  display: { family: 'display', w: TYPE.display.weight, track: TYPE.display.tracking },
  headline: { family: 'display', w: TYPE.headline.weight, track: TYPE.headline.tracking },
  label: { mono: true, w: TYPE.label.weight, track: TYPE.label.tracking, color: GREY },
} satisfies Record<string, TOpts>;

function split(s: string): { t: string; th: boolean }[] {
  const out: { t: string; th: boolean }[] = [];
  for (const ch of s) {
    const th = TH.test(ch);
    const last = out[out.length - 1];
    if (last && last.th === th) last.t += ch;
    else out.push({ t: ch, th });
  }
  return out;
}
const spacing = (o: TOpts, th: boolean) => (o.track && !th ? (o.size ?? 10) * o.track : 0);

function tw(doc: Doc, s: string, o: TOpts = {}): number {
  const { size = 10, w = 400, mono, family } = o;
  let sum = 0;
  for (const r of split(s)) sum += doc.font(fontFor(r.th, w, family, mono)).fontSize(size).widthOfString(r.t, { characterSpacing: spacing(o, r.th) });
  return sum;
}

/** One line of text. y is the top of the line. */
function txt(doc: Doc, s: string, x: number, y: number, o: TOpts = {}) {
  if (!s) return;
  const { size = 10, w = 400, color = INK, align = 'left', width, mono, family, halo } = o;
  const total = tw(doc, s, o);
  let cx = x;
  if (width != null) cx = align === 'center' ? x + (width - total) / 2 : align === 'right' ? x + width - total : x;
  for (const r of split(s)) {
    doc.font(fontFor(r.th, w, family, mono)).fontSize(size);
    const characterSpacing = spacing(o, r.th);
    const rw = doc.widthOfString(r.t, { characterSpacing });
    if (halo) {
      doc.save().lineJoin('round').lineWidth(halo).strokeColor('#ffffff');
      doc.text(r.t, cx, y, { lineBreak: false, stroke: true, characterSpacing });
      doc.restore();
    }
    doc.fillColor(color).text(r.t, cx, y, { lineBreak: false, characterSpacing });
    cx += rw;
  }
}

function clip(doc: Doc, s: string, maxW: number, o: TOpts): string {
  if (tw(doc, s, o) <= maxW) return s;
  let t = s;
  while (t.length > 1 && tw(doc, t + '…', o) > maxW) t = t.slice(0, -1);
  return t + '…';
}

function wrap(doc: Doc, s: string, maxW: number, o: TOpts): string[] {
  const lines: string[] = [];
  for (const para of String(s ?? '').split('\n')) {
    let cur = '';
    const push = () => {
      lines.push(cur);
      cur = '';
    };
    for (const word of para.split(/(?<= )/)) {
      if (tw(doc, cur + word, o) <= maxW) {
        cur += word;
        continue;
      }
      if (cur) push();
      if (tw(doc, word, o) <= maxW) {
        cur = word;
        continue;
      }
      for (const ch of word) {
        if (tw(doc, cur + ch, o) > maxW && !COMBINING.test(ch) && cur) push();
        cur += ch;
      }
    }
    push();
  }
  return lines;
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/* ---------- frame ---------- */
interface Ctx {
  doc: Doc;
  b: Bundle;
  prices: boolean;
  sheets: { title: string; sub: string }[]; // every page after the cover, in order
  plans: Map<number, Buffer>; // floor id → plan image as it should appear (see planImage)
}

/** KEYPLAN room-plan mark (brand-assets.ts, from the official SVG). Box is `size` pt square. */
function drawSymbol(doc: Doc, x: number, y: number, size: number, recolor?: (c: string) => string) {
  doc.save().translate(x, y).scale(size / 100);
  for (const m of MARK_SHAPES) {
    if (m.t === 'rect') {
      const c = recolor ? recolor(m.fill) : m.fill;
      (m.rx ? doc.roundedRect(m.x, m.y, m.w, m.h, m.rx) : doc.rect(m.x, m.y, m.w, m.h)).fill(c);
    } else if (m.t === 'circle') doc.circle(m.cx, m.cy, m.r).fill(recolor ? recolor(m.fill) : m.fill);
    else doc.path(m.d).lineWidth(m.sw).strokeColor(recolor ? recolor(m.stroke) : m.stroke).stroke();
  }
  doc.restore();
}
/** Horizontal lockup (mark + KEYPLAN wordmark), h = mark height. Returns the lockup width. Never retyped: the wordmark is the official path. */
function drawLogo(doc: Doc, x: number, y: number, h = 38): number {
  drawSymbol(doc, x, y, h);
  const k = h / 100;
  doc.save().translate(x + WORDMARK_PATH.x * k, y + WORDMARK_PATH.y * k).scale(WORDMARK_PATH.scale * k);
  doc.path(WORDMARK_PATH.d).fill(INK);
  doc.restore();
  return WORDMARK_PATH.viewW * k;
}
/** Plan pattern (guideline: canvas variant) — the mark tiled in quiet beige tones; cover page only. */
function drawPattern(doc: Doc, x: number, y: number, w: number, h: number, cell = 150) {
  doc.save().rect(x, y, w, h).clip();
  doc.rect(x, y, w, h).fill(BRAND.sidebar);
  const quiet = (c: string) => (c === BRAND.ink ? '#E3DCCB' : c);
  for (let cy = y + 24; cy < y + h; cy += cell) for (let cx = x + 24; cx < x + w; cx += cell) drawSymbol(doc, cx, cy, cell - 48, quiet);
  doc.restore();
}
/** Category icon (brand-assets.ts, 48 × 48 stroked paths), top-left at (x, y), size pt square. */
function drawCatIcon(doc: Doc, icon: string, x: number, y: number, size: number, color = INK) {
  const paths = ICON_PATHS[icon] ?? ['M10 10H38V38H10Z', 'M10 24H38'];
  doc.save().translate(x, y).scale(size / 48).lineWidth(2.25).lineCap('square').lineJoin('miter').strokeColor(color);
  for (const d of paths) doc.path(d).stroke();
  doc.restore();
}

function newSheet(c: Ctx, title: string, sub = ''): void {
  const { doc, b } = c;
  doc.addPage({ size: 'A3', layout: 'landscape', margin: 0 });
  c.sheets.push({ title, sub });
  doc.rect(0, 0, W, H).fill(PAPER); // canvas paper; plans, cards and tables sit on white
  const lw = drawLogo(doc, MX, 20, 32);
  const dx = MX + lw + 18;
  doc.moveTo(dx, 22).lineTo(dx, 54).lineWidth(0.8).strokeColor(RULE).stroke();
  const name: TOpts = { ...T.headline, size: 20 };
  txt(doc, 'PROJECT', dx + 18, 20, { ...T.label, size: 7.5 });
  txt(doc, clip(doc, b.project.name || 'Untitled', 560, name), dx + 18, 32, name);
  // sheet title, right aligned: "SHEET" label above, then title (display) + sub (body)
  const subO: TOpts = { size: 12, color: GREY };
  const titleO: TOpts = { ...T.headline, size: 15 };
  const subW = sub ? tw(doc, sub, subO) + 10 : 0;
  txt(doc, 'SHEET', W - MX - 200, 20, { ...T.label, size: 7.5, align: 'right', width: 200 });
  txt(doc, title, W - MX - subW - 520, 34, { ...titleO, align: 'right', width: 520 });
  if (sub) txt(doc, sub, W - MX - subW + 10, 36, subO);
  doc.moveTo(MX, 66).lineTo(W - MX, 66).lineWidth(0.8).strokeColor(INK).stroke();
}

/** Cover page (page 1): drawn last so it can list every sheet. */
function coverPage(c: Ctx) {
  const { doc, b } = c;
  const p = b.project;
  const L = 64;
  doc.switchToPage(0);
  doc.rect(0, 0, W, H).fill(PAPER);
  const PW = 330;
  drawPattern(doc, W - PW, 0, PW, H);
  doc.moveTo(W - PW, 0).lineTo(W - PW, H).lineWidth(1.5).strokeColor(INK).stroke();
  drawLogo(doc, L, 60, 64);
  txt(doc, 'PLAN  ·  PRICE  ·  YOUR HOME', L, 136, { ...T.label, size: 9 });

  let y = 250;
  txt(doc, 'FF&E SCHEDULE  ·  รายการวัสดุและครุภัณฑ์', L, y, { ...T.label, size: 10, color: BRAND.primaryText });
  y += 26;
  const big: TOpts = { ...T.display, size: 54 };
  const lines = wrap(doc, p.name || 'Untitled', 420, big).slice(0, 2);
  lines.forEach((ln, i) => txt(doc, ln, L, y + i * 66, big));
  y += lines.length * 66 + 10;
  txt(doc, 'แปลน รายการวัสดุ ราคา และสเปค สำหรับงานรีโนเวท', L, y, { size: 16, color: GREY });

  // title block (as in the CI drawing title block)
  const cells: [string, string][] = [
    ['PROJECT NO.', p.project_no],
    ['CLIENT', p.client],
    ['LOCATION', p.location],
    ['DATE / REV', [dmy(p.doc_date), p.revision && `Rev. ${p.revision}`].filter(Boolean).join('  ·  ')],
    ['DESIGNER', p.designer],
    ['PREPARED BY', p.prepared_by],
  ];
  const tbW = 560;
  const cw = tbW / 3;
  const chh = 58;
  const ty = H - 64 - chh * 2;
  doc.rect(L, ty, tbW, chh * 2).fill(BRAND.white);
  cells.forEach(([k, v], i) => {
    const cx = L + (i % 3) * cw;
    const cy = ty + Math.floor(i / 3) * chh;
    doc.rect(cx, cy, cw, chh).lineWidth(0.8).strokeColor(INK).stroke();
    txt(doc, k, cx + 12, cy + 11, { ...T.label, size: 7.5 });
    const o: TOpts = { size: 12, w: 600 };
    txt(doc, clip(doc, v || '–', cw - 24, o), cx + 12, cy + 29, o);
  });

  // sheet index; continuation pages ("2/3", "(ต่อ)") collapse into one row with a page range
  const rows: { from: number; to: number; title: string; sub: string }[] = [];
  c.sheets.forEach((sh, i) => {
    const page = i + 2;
    const last = rows[rows.length - 1];
    if (last && last.title === sh.title && /^(\d+\/\d+|\(.*\))$/.test(sh.sub)) last.to = page;
    else rows.push({ from: page, to: page, title: sh.title, sub: /^\d+\/\d+$/.test(sh.sub) ? '' : sh.sub });
  });
  const ix = W - PW - 40 - 300; // sheet index between the title and the pattern panel
  let iy = 250;
  txt(doc, 'SHEETS  ·  รายการแบบ', ix, iy, { ...T.label, size: 9 });
  iy += 18;
  doc.moveTo(ix, iy).lineTo(ix + 300, iy).lineWidth(0.8).strokeColor(INK).stroke();
  iy += 10;
  const maxRows = Math.floor((H - 64 - 130 - iy) / 24);
  const pg = (n: number) => String(n).padStart(2, '0');
  rows.slice(0, maxRows).forEach((r) => {
    txt(doc, r.from === r.to ? pg(r.from) : `${pg(r.from)}–${pg(r.to)}`, ix, iy + 3, { size: 9.5, w: 500, mono: true, color: GREY });
    const t: TOpts = { size: 12, w: 500, family: 'display' };
    txt(doc, r.title, ix + 64, iy + 1, t);
    const sx = ix + 74 + tw(doc, r.title, t);
    if (r.sub) txt(doc, clip(doc, r.sub, ix + 300 - sx, { size: 10.5, color: GREY }), sx, iy + 3, { size: 10.5, color: GREY });
    iy += 24;
  });
  if (rows.length > maxRows) txt(doc, `… และอีก ${rows.length - maxRows} รายการ`, ix + 64, iy, { size: 9.5, color: GREY });
  txt(doc, 'Prepared with KEYPLAN', L, H - 40, { size: 8.5, color: GREY, mono: true });
}

function footers(c: Ctx) {
  const { doc, b } = c;
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    // page 1 is the cover: no footer
    doc.switchToPage(range.start + i);
    const y = H - 34;
    doc.moveTo(MX, y - 6).lineTo(W - MX, y - 6).lineWidth(0.5).strokeColor(RULE).stroke();
    const p = b.project;
    const left = [p.client && `ลูกค้า: ${p.client}`, p.location && `สถานที่: ${p.location}`].filter(Boolean).join('   ');
    txt(doc, left, MX, y, { size: 8.5, color: GREY });
    const mid = [p.project_no && `Project No. ${p.project_no}`, p.revision && `Rev. ${p.revision}`, `Date ${dmy(p.doc_date)}`, p.designer && `Designer: ${p.designer}`].filter(Boolean).join('   ');
    txt(doc, mid, W / 2 - 250, y, { size: 8.5, color: GREY, align: 'center', width: 500 });
    txt(doc, `${i + 1} / ${range.count}`, W - MX - 100, y, { size: 8.5, color: GREY, align: 'right', width: 100, mono: true });
  }
}

/** Items in category order (guideline order, then the studio's own), then by code — same order as the BOQ. */
function byCategory(b: Bundle) {
  const rank = new Map(sortCategories(b.categories).map((c, i) => [c.prefix, i]));
  return (a: Fixture, z: Fixture) => (rank.get(a.cat) ?? 999) - (rank.get(z.cat) ?? 999) || a.cat.localeCompare(z.cat) || byCode(a, z);
}

/* ---------- symbols ---------- */
function drawPrims(doc: Doc, prims: ReturnType<typeof pointSymbol>, color: string, u: number) {
  for (const p of prims) {
    doc.lineWidth(u * (p.sw ?? 1)).strokeColor(color).fillColor(color);
    if (p.t === 'circle') {
      doc.circle(p.cx, p.cy, p.r);
      p.fill ? doc.fillAndStroke(color, color) : doc.stroke();
    } else if (p.t === 'line') {
      doc.path(primToSvg(p)).stroke();
    } else {
      doc.path(primToSvg(p));
      p.fill ? doc.fillAndStroke(color, color) : doc.stroke();
    }
  }
}

/** Small legend icon, drawn at (x, y) = centre, within about 22pt. */
function icon(doc: Doc, f: Fixture, x: number, y: number, size = 9) {
  const color = COLORS[f.color];
  doc.save();
  if (isLineSymbol(f.symbol)) {
    const st = lineStyle(f.symbol, 4);
    doc.lineWidth(Math.max(1.4, st.sw * 0.6)).strokeColor(color);
    if (st.dash) doc.dash(4, { space: 3 });
    doc.moveTo(x - 12, y).lineTo(x + 12, y).stroke().undash();
  } else {
    const r = size * 0.5;
    doc.translate(x - (f.symbol === 'spot' ? r : 0), y);
    drawPrims(doc, pointSymbol(f.symbol, 0, 0, r, 0, f.symbol === 'linear' ? 14 : undefined), color, Math.max(0.9, r * 0.2));
  }
  doc.restore();
}

/* ---------- plan drawing ---------- */
interface PlanBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawPlan(c: Ctx, floor: Floor, box: PlanBox, mode: 'layout' | 'wiring') {
  const { doc, b } = c;
  const iw = floor.plan_w ?? 1000;
  const ih = floor.plan_h ?? 700;
  const s = Math.min(box.w / iw, box.h / ih);
  const ox = box.x + (box.w - iw * s) / 2;
  const oy = box.y + (box.h - ih * s) / 2;
  doc.rect(box.x, box.y, box.w, box.h).fill(BRAND.white); // the plan sits on white, not on the paper tone
  const plan = c.plans.get(floor.id);
  if (plan) {
    doc.image(plan, ox, oy, { width: iw * s, height: ih * s });
  } else {
    txt(doc, 'ยังไม่ได้อัปโหลดแปลน', box.x, box.y + box.h / 2 - 8, { size: 14, color: GREY, align: 'center', width: box.w });
  }
  doc.rect(box.x, box.y, box.w, box.h).lineWidth(0.5).strokeColor(RULE).stroke(); // frame on top of the plan image
  const fixtures = new Map(b.fixtures.map((f) => [f.id, f]));
  const r = baseRadius(iw, floor.symbol_scale);
  const u = Math.max(1.3, r * 0.16);
  const circuitColor = new Map(b.circuits.map((cc, i) => [cc.id, WIRE[i % WIRE.length]]));
  const dim = mode === 'wiring';

  doc.save().rect(box.x, box.y, box.w, box.h).clip();
  doc.translate(ox, oy).scale(s);
  doc.opacity(1);

  // lines
  for (const l of b.lines.filter((x) => x.floor_id === floor.id)) {
    const f = fixtures.get(l.fixture_id);
    if (!f || l.pts.length < 2) continue;
    const px = l.pts.map(([x, y]) => [x * iw, y * ih] as [number, number]);
    const color = COLORS[f.color];
    const st = lineStyle(f.symbol, r);
    doc.save().lineWidth(st.sw).strokeColor(color).lineCap('butt').lineJoin('round');
    if (dim) doc.opacity(0.55);
    if (st.dash) doc.dash(st.dash[0], { space: st.dash[1] });
    doc.moveTo(px[0][0], px[0][1]);
    for (const p of px.slice(1)) doc.lineTo(p[0], p[1]);
    doc.stroke().undash().restore();
    if (l.heads > 0) {
      const hf = l.head_fixture_id ? fixtures.get(l.head_fixture_id) : undefined;
      const hc = hf ? COLORS[hf.color] : color;
      for (const h of pointsAlong(px, l.heads)) {
        doc.save().translate(h.x, h.y).rotate((h.ang * 180) / Math.PI + 90);
        doc.circle(0, 0, r * 0.5).fillAndStroke(hc, hc);
        doc.moveTo(0, 0).lineTo(0, r * 1.7).lineWidth(u).strokeColor(hc).stroke().restore();
      }
    }
    const mid = pointsAlong(px, 1)[0];
    const len = lineLengthM(l, floor);
    const label = `${f.code}${len != null ? `  ${qtyText(Math.round(len * 10) / 10)} m` : ''}`;
    txt(doc, label, mid.x + r * 0.8, mid.y - r * 2.2, { size: r * 1.15, w: 600, color: LABEL_COLORS[f.color], halo: r * 0.35 });
  }

  // wiring
  if (mode === 'wiring') {
    for (const cc of b.circuits) {
      const items = [
        ...b.placements.filter((p) => p.floor_id === floor.id && p.circuit_id === cc.id).map((p) => ({ o: p.circuit_order, x: p.x * iw, y: p.y * ih })),
        ...b.lines
          .filter((l) => l.floor_id === floor.id && l.circuit_id === cc.id && l.pts.length >= 2)
          .map((l) => {
            const m = pointsAlong(l.pts.map(([x, y]) => [x * iw, y * ih] as [number, number]), 1)[0];
            return { o: l.circuit_order, x: m.x, y: m.y };
          }),
      ].sort((a, z) => a.o - z.o);
      if (!items.length) continue;
      const col = circuitColor.get(cc.id) ?? WIRE[0];
      if (items.length > 1) {
        doc.save().lineWidth(u * 1.5).strokeColor(col).dash(r * 1.1, { space: r * 0.5 });
        doc.path(wiringPath(items.map((i) => [i.x, i.y] as [number, number]))).stroke().undash().restore();
      }
      const fs2 = r * 1.2;
      const tagW = tw(doc, cc.name, { size: fs2, w: 600 }) + r * 1.1;
      const tx = items[0].x - tagW / 2;
      const ty = items[0].y - r * 3.8;
      doc.roundedRect(tx, ty, tagW, fs2 * 1.5, r * 0.4).fillAndStroke(col, col);
      txt(doc, cc.name, tx, ty + fs2 * 0.2, { size: fs2, w: 600, color: '#ffffff', align: 'center', width: tagW });
    }
  }

  // points
  for (const p of b.placements.filter((x) => x.floor_id === floor.id)) {
    const f = fixtures.get(p.fixture_id);
    if (!f) continue;
    const color = COLORS[f.color];
    const cx = p.x * iw;
    const cy = p.y * ih;
    doc.save();
    if (dim) doc.opacity(0.7);
    const rs = f.symbol === 'linear' ? r : r * markScale(f.mark_size); // S / M / L pin size
    drawPrims(doc, pointSymbol(f.symbol, cx, cy, rs, symbolMeta(f.symbol).rotatable ? p.rot : 0, f.symbol === 'linear' ? linearLengthPx(f.length_m, floor.mpp, r) : undefined), color, u);
    doc.restore();
    txt(doc, f.code, cx + rs * 0.9 + r * 0.3, cy - rs * 1.25 - r * 1.45, { size: r * 1.2, w: 600, color: LABEL_COLORS[f.color], halo: r * 0.35 });
  }
  doc.restore();

  // scale bar
  if (floor.mpp) {
    const target = 130 / s; // pixels
    const metres = target * floor.mpp;
    const nice = [0.5, 1, 2, 5, 10, 20, 50].reduce((a, z) => (Math.abs(z - metres) < Math.abs(a - metres) ? z : a));
    const len = (nice / floor.mpp) * s;
    const x0 = box.x + 12;
    const y0 = box.y + box.h - 16;
    doc.save().rect(x0 - 6, y0 - 14, len + 52, 26).fillOpacity(0.85).fill('#ffffff').restore();
    doc.moveTo(x0, y0).lineTo(x0 + len, y0).lineWidth(1.4).strokeColor(INK).stroke();
    doc.moveTo(x0, y0 - 4).lineTo(x0, y0 + 4).moveTo(x0 + len, y0 - 4).lineTo(x0 + len, y0 + 4).lineWidth(1).stroke();
    txt(doc, `${nice} m`, x0 + len + 6, y0 - 5, { size: 8.5, color: INK, mono: true });
  }
}

/* ---------- sheets ---------- */
function legend(c: Ctx, x: number, y: number, w: number, floor: Floor) {
  const { doc, b } = c;
  const q = quantities(b);
  const fx = b.fixtures
    .filter((f) => (q[f.id]?.perFloor[floor.id] ?? 0) > 0)
    .sort(byCategory(b));
  txt(doc, 'LEGEND', x, y, { ...T.label, size: 9 });
  doc.moveTo(x, y + 14).lineTo(x + w, y + 14).lineWidth(0.6).strokeColor(INK).stroke();
  let cy = y + 22;
  for (const f of fx) {
    if (cy > BOT - 40) break;
    icon(doc, f, x + 16, cy + 11);
    txt(doc, f.code, x + 38, cy + 2, { size: 11, w: 500, mono: true }); // icon carries the plan colour
    const n = q[f.id].perFloor[floor.id];
    txt(doc, `${qtyText(n)} ${unitTh(f.unit)}`, x + w - 70, cy + 2, { size: 10, w: 500, align: 'right', width: 70 });
    const desc = (isLighting(f) ? [f.name || f.model, lampText(f), f.kelvin ? `${f.kelvin}K` : ''] : [f.name || f.model, f.size, f.finish]).filter(Boolean).join('  ·  ');
    const lines = wrap(doc, desc, w - 100, { size: 8.5 }).slice(0, 2);
    lines.forEach((ln, i) => txt(doc, ln, x + 38, cy + 17 + i * 11, { size: 8.5, color: GREY }));
    cy += 24 + lines.length * 11;
    doc.moveTo(x, cy - 3).lineTo(x + w, cy - 3).lineWidth(0.3).strokeColor(RULE).stroke();
  }
}

function layoutSheets(c: Ctx) {
  const { b } = c;
  const has = (fl: Floor) => b.placements.some((p) => p.floor_id === fl.id) || b.lines.some((l) => l.floor_id === fl.id) || !!fl.plan_file;
  for (const fl of b.floors.filter(has)) {
    newSheet(c, 'Plan Layout', fl.name);
    const lw = 250;
    drawPlan(c, fl, { x: MX, y: TOP, w: W - MX * 2 - lw - 16, h: BOT - TOP }, 'layout');
    legend(c, W - MX - lw, TOP, lw, fl);
  }
}

function wiringSheets(c: Ctx) {
  const { doc, b } = c;
  if (!b.circuits.length) return;
  for (const fl of b.floors) {
    const used = b.circuits.filter((cc) => b.placements.some((p) => p.floor_id === fl.id && p.circuit_id === cc.id) || b.lines.some((l) => l.floor_id === fl.id && l.circuit_id === cc.id));
    if (!used.length) continue;
    newSheet(c, 'Circuit Wiring', fl.name);
    const lw = 250;
    drawPlan(c, fl, { x: MX, y: TOP, w: W - MX * 2 - lw - 16, h: BOT - TOP }, 'wiring');
    const x = W - MX - lw;
    txt(doc, 'CIRCUITS', x, TOP, { ...T.label, size: 9 });
    doc.moveTo(x, TOP + 14).lineTo(x + lw, TOP + 14).lineWidth(0.6).strokeColor(INK).stroke();
    let cy = TOP + 24;
    for (const cc of used) {
      if (cy > BOT - 30) break;
      const col = WIRE[b.circuits.indexOf(cc) % WIRE.length];
      doc.roundedRect(x, cy, 52, 18, 4).fillAndStroke(col, col);
      txt(doc, cc.name, x, cy + 3, { size: 10, w: 600, color: onColor(col), align: 'center', width: 52 });
      const pcs = b.placements.filter((p) => p.floor_id === fl.id && p.circuit_id === cc.id).length;
      const lns = b.lines.filter((l) => l.floor_id === fl.id && l.circuit_id === cc.id).length;
      txt(doc, clip(doc, cc.area || '', lw - 70, { size: 9.5 }), x + 60, cy + 3, { size: 9.5 });
      txt(doc, `${pcs} จุด${lns ? ` + ${lns} เส้น` : ''}`, x + 60, cy + 15, { size: 8.5, color: GREY });
      cy += 40;
    }
  }
}

function specSheets(c: Ctx) {
  const { doc, b } = c;
  const q = quantities(b);
  const list = b.fixtures.slice().sort(byCategory(b));
  if (!list.length) return;
  const cols = 3;
  const rows = 2;
  const gap = 16;
  const cw = (W - MX * 2 - gap * (cols - 1)) / cols;
  const ch = (BOT - TOP - gap * (rows - 1)) / rows;
  list.forEach((f, i) => {
    const k = i % (cols * rows);
    if (k === 0) newSheet(c, 'Item Specification', `${Math.floor(i / (cols * rows)) + 1}/${Math.ceil(list.length / (cols * rows))}`);
    const x = MX + (k % cols) * (cw + gap);
    const y = TOP + Math.floor(k / cols) * (ch + gap);
    doc.rect(x, y, cw, ch).fill(BRAND.white);
    doc.rect(x, y, cw, ch).lineWidth(0.6).strokeColor(RULE).stroke();
    // head: category icon, code in display type, Charcoal rule underneath
    const cat = categoryOf(b.categories, f.cat);
    doc.rect(x, y, cw, 34).fill(SOFT);
    doc.rect(x, y + 34, cw, 1.5).fill(INK);
    drawCatIcon(doc, cat.icon, x + 10, y + 7, 20);
    icon(doc, f, x + 44, y + 17, 9);
    txt(doc, f.code, x + 60, y + 7, { ...T.headline, size: 17, color: BRAND.primaryText });
    const n = q[f.id]?.total ?? 0;
    txt(doc, `${qtyText(n)} ${unitTh(f.unit)}`, x + cw - 110, y + 10, { size: 13, w: 600, align: 'right', width: 100 });
    // images
    const iy = y + 42;
    const ih = 120;
    const iw = (cw - 30) / 2;
    for (const [j, file] of [f.photo_file, f.drawing_file].entries()) {
      const bx = x + 10 + j * (iw + 10);
      doc.rect(bx, iy, iw, ih).lineWidth(0.4).strokeColor(RULE).stroke();
      if (file && fs.existsSync(uploadPath(file))) doc.image(uploadPath(file), bx + 3, iy + 3, { fit: [iw - 6, ih - 6], align: 'center', valign: 'center' });
      else txt(doc, j === 0 ? 'รูปสินค้า' : 'แบบ / Drawing', bx, iy + ih / 2 - 6, { size: 9, color: GREY, align: 'center', width: iw });
    }
    // details
    let ty = iy + ih + 12;
    const kv: [string, string][] = [
      ['หมวด', cat.name_th],
      ['ชื่อ', f.name],
      ['รุ่น', f.model],
      ['ขนาด', f.size],
      ['ห้อง / พื้นที่', f.room],
    ];
    if (isLighting(f)) {
      kv.push(
        ['ขั้ว / หลอด', [f.socket, f.bulbs ? `${f.bulbs} หลอด` : ''].filter(Boolean).join(' · ')],
        ['กำลังไฟ', f.watt_per_lamp != null ? `${f.watt_per_lamp} W${f.unit === 'm' ? '/m' : ' / หลอด'}${unitWatt(f) && f.unit !== 'm' ? `  (รวม ${qtyText(unitWatt(f))} W)` : ''}` : f.watt_total != null ? `${f.watt_total} W` : ''],
        ['อุณหภูมิสี / IP', [f.kelvin ? `${f.kelvin}K` : '', f.ip].filter(Boolean).join(' · ')],
      );
    }
    kv.push(['สี / ผิว', f.finish], ['ซัพพลายเออร์', f.supplier]);
    if (c.prices) kv.push(['ราคา', f.price != null ? `${money(f.price)} บาท / ${unitTh(f.unit)}` : 'รอราคา']);
    if (f.note) kv.push(['หมายเหตุ', f.note]);
    for (const [k2, v] of kv) {
      if (!v) continue;
      const ls = wrap(doc, v, cw - 120, { size: 9.5, w: 500 }).slice(0, 2);
      if (ty + ls.length * 12 > y + ch - 4) break;
      txt(doc, k2, x + 12, ty, { size: 9, color: GREY });
      ls.forEach((ln, idx) => txt(doc, ln, x + 104, ty + idx * 12, { size: 9.5, w: 500 }));
      ty += ls.length * 12 + 3;
    }
  });
}

interface Col {
  h: string;
  w: number;
  align?: 'left' | 'right' | 'center';
  mono?: boolean; // numbers and codes use IBM Plex Mono (guideline 08)
}

type Row = string[] & { bold?: boolean; group?: boolean };
function table(c: Ctx, title: string, cols: Col[], rows: Row[], opts: { rowH?: number; totalW?: number; firstY?: number } = {}): number {
  const { doc } = c;
  const rowH = opts.rowH ?? 22;
  const totalW = opts.totalW ?? W - MX * 2;
  const scale = totalW / cols.reduce((a, z) => a + z.w, 0);
  const cw = cols.map((x) => x.w * scale);
  let y = opts.firstY ?? TOP;
  const head = () => {
    doc.rect(MX, y, totalW, 24).fill(SOFT);
    doc.rect(MX, y + 22.5, totalW, 1.5).fill(INK);
    let x = MX;
    cols.forEach((col, i) => {
      txt(doc, col.h, x + 6, y + 6, { size: 9.5, w: 600, color: INK, align: col.align ?? 'left', width: cw[i] - 12 });
      x += cw[i];
    });
    y += 24;
  };
  head();
  rows.forEach((r, ri) => {
    if (y + rowH > BOT - 6) {
      newSheet(c, title, '(ต่อ)');
      y = TOP;
      head();
    }
    doc.rect(MX, y, totalW, rowH).fill(r.group ? BRAND.sidebar : BRAND.white);
    void ri;
    if (r.group) {
      // section row: the category name across the table, its subtotal in the last column
      txt(doc, r[0], MX + 6, y + (rowH - 11) / 2, { size: 10, w: 600 });
      const last = cols.length - 1;
      txt(doc, r[last] ?? '', MX + totalW - cw[last] + 6, y + (rowH - 11) / 2, { size: 9.5, w: 600, align: 'right', width: cw[last] - 12, mono: true });
      doc.moveTo(MX, y + rowH).lineTo(MX + totalW, y + rowH).lineWidth(0.6).strokeColor(INK).stroke();
      y += rowH;
      return;
    }
    let x = MX;
    cols.forEach((col, i) => {
      const o: TOpts = { size: 9.5, w: r.bold ? 600 : 400, align: col.align ?? 'left', width: cw[i] - 12, mono: col.mono };
      txt(doc, clip(doc, r[i] ?? '', cw[i] - 12, o), x + 6, y + (rowH - 11) / 2, o);
      x += cw[i];
    });
    doc.moveTo(MX, y + rowH).lineTo(MX + totalW, y + rowH).lineWidth(0.3).strokeColor(RULE).stroke();
    y += rowH;
  });
  return y;
}

function loadSheet(c: Ctx) {
  const { b } = c;
  if (!b.circuits.length) return;
  const ls = loadSchedule(b);
  newSheet(c, 'Lighting Load Schedule', `${b.project.voltage} V`);
  const rows: Row[] = [];
  const itemsText = (r: (typeof ls.rows)[number]) => r.items.map((i) => `${i.fixture.code} ×${qtyText(i.qty)}${i.fixture.unit === 'm' ? ' m' : ''}`).join(',  ');
  for (const r of ls.rows) {
    rows.push([r.circuit?.name ?? '', r.circuit?.area ?? '', itemsText(r), qtyText(r.pieces), r.meters ? qtyText(Math.round(r.meters * 10) / 10) : '-', qtyText(Math.round(r.watts)), r.amps.toFixed(2), r.circuit?.breaker_a ? `${r.circuit.breaker_a} A` : '-']);
  }
  if (ls.unassigned) rows.push(['ยังไม่ระบุวงจร', '', itemsText(ls.unassigned), qtyText(ls.unassigned.pieces), ls.unassigned.meters ? qtyText(Math.round(ls.unassigned.meters * 10) / 10) : '-', qtyText(Math.round(ls.unassigned.watts)), ls.unassigned.amps.toFixed(2), '-']);
  const tot = ['รวม', '', '', qtyText(ls.totalPieces), ls.totalMeters ? qtyText(Math.round(ls.totalMeters * 10) / 10) : '-', qtyText(Math.round(ls.totalWatts)), ls.totalAmps.toFixed(2), ''] as Row;
  tot.bold = true;
  rows.push(tot);
  table(c, 'Lighting Load Schedule', [
    { h: 'วงจร', w: 70, mono: true },
    { h: 'พื้นที่', w: 120 },
    { h: 'โคมในวงจร', w: 360 },
    { h: 'ชุด', w: 50, align: 'right', mono: true },
    { h: 'เมตร', w: 55, align: 'right', mono: true },
    { h: 'วัตต์ (W)', w: 70, align: 'right', mono: true },
    { h: 'แอมป์ (A)', w: 70, align: 'right', mono: true },
    { h: 'เบรกเกอร์', w: 70, align: 'right', mono: true },
  ], rows, { rowH: 26 });
  txt(c.doc, `คำนวณ A = W ÷ (${b.project.voltage} V × PF ${b.project.pf})`, MX, BOT - 4, { size: 8.5, color: GREY });
}

function boqSheet(c: Ctx) {
  const { doc, b } = c;
  const r = boq(b);
  newSheet(c, 'Quotation / Bill of Quantities', `VAT ${b.project.vat_rate}%`);
  const rows: Row[] = [];
  let n = 0;
  for (const g of r.groups) {
    const head = [`${g.category.prefix}  ·  ${g.category.name_th}${g.category.name_en ? `  ${g.category.name_en}` : ''}`, '', '', '', '', '', '', '', money(g.sub)] as Row;
    head.group = true;
    rows.push(head);
    for (const row of g.rows) {
      const f = row.fixture;
      rows.push([
        String(++n),
        f.code,
        [f.name || f.model, f.name && f.model ? f.model : ''].filter(Boolean).join(' · '),
        (isLighting(f) ? [lampText(f), f.kelvin ? `${f.kelvin}K` : ''] : [f.size, f.finish]).filter(Boolean).join('  '),
        f.room,
        qtyText(row.qty.total),
        unitTh(f.unit),
        row.price != null ? money(row.price) : 'รอราคา',
        row.price != null ? money(row.amount) : '-',
      ]);
    }
  }
  const endY = table(c, 'Quotation / Bill of Quantities', [
    { h: 'ลำดับ', w: 40, align: 'center', mono: true },
    { h: 'รหัส', w: 60, mono: true },
    { h: 'รายการ / รุ่น', w: 260 },
    { h: 'สเปค', w: 170 },
    { h: 'ห้อง', w: 90 },
    { h: 'จำนวน', w: 60, align: 'right', mono: true },
    { h: 'หน่วย', w: 45, align: 'center' },
    { h: 'ราคา/หน่วย', w: 90, align: 'right', mono: true },
    { h: 'รวมเงิน', w: 100, align: 'right', mono: true },
  ], rows, { rowH: 24 });
  let y = endY + 14;
  const bw = 330;
  if (y + 150 > BOT) {
    newSheet(c, 'Quotation / Bill of Quantities', '(สรุป)');
    y = TOP;
  }
  const x = W - MX - bw;
  const line = (label: string, v: string, bold = false) => {
    txt(doc, label, x, y, { size: 10.5, w: bold ? 600 : 400 });
    txt(doc, v, x + bw - 140, y, { size: 10.5, w: bold ? 600 : 400, align: 'right', width: 140, mono: true });
    y += 20;
  };
  line('รวมเป็นเงิน', money(r.sub));
  if (r.discount) line('ส่วนลด', `-${money(r.discount)}`);
  if (r.install) line('ค่าติดตั้ง / ค่าบริการ', money(r.install));
  line('ราคาก่อนภาษี', money(r.base));
  line(`ภาษีมูลค่าเพิ่ม ${b.project.vat_rate}%`, money(r.vat));
  doc.moveTo(x, y - 2).lineTo(x + bw, y - 2).lineWidth(0.8).strokeColor(INK).stroke();
  y += 4;
  doc.rect(x - 8, y - 6, bw + 8, 26).fill(BRAND.primary); // the one Terracotta accent on this page
  line('ยอดรวมสุทธิ', `฿ ${money(r.grand)}`, true);
  if (r.unpriced) txt(doc, `* มี ${r.unpriced} รายการที่ยังรอราคา ยังไม่รวมในยอดนี้`, x, y + 4, { size: 9, color: BRAND.warn });
  if (b.project.note) wrap(doc, b.project.note, W / 2 - MX, { size: 9.5 }).slice(0, 6).forEach((ln, i) => txt(doc, ln, MX, endY + 18 + i * 13, { size: 9.5, color: GREY }));
}

/** Parts of the book, in the order they appear after the cover. */
export const PDF_PARTS = ['mood', 'plan', 'wiring', 'spec', 'load', 'boq'] as const;
export type PdfPart = (typeof PDF_PARTS)[number];

export interface PdfOptions {
  prices: boolean; // prices on spec sheets (and the quotation when parts is not given)
  parts?: PdfPart[]; // custom export: only these parts (the cover is always there)
  cats?: string[] | null; // custom export: only items of these categories
}

/** The bundle limited to some categories: their items, and only the pins and lines that use them. */
export function filterBundle(b: Bundle, cats: string[] | null | undefined): Bundle {
  if (!cats) return b;
  const keep = new Set(cats);
  const fixtures = b.fixtures.filter((f) => keep.has(f.cat));
  const ids = new Set(fixtures.map((f) => f.id));
  return {
    ...b,
    fixtures,
    placements: b.placements.filter((p) => ids.has(p.fixture_id)),
    lines: b.lines.filter((l) => ids.has(l.fixture_id)).map((l) => (l.head_fixture_id && !ids.has(l.head_fixture_id) ? { ...l, head_fixture_id: null, heads: 0 } : l)),
  };
}

/** One sheet per mood board: images fill the template slots (cropped to fit), empty slots stay as frames. */
function moodSheets(c: Ctx) {
  const { doc } = c;
  for (const mb of c.b.moodboards ?? []) {
    if (!mb.images.length) continue;
    moodSheet(c, mb);
  }
  void doc;
}
function moodSheet(c: Ctx, mb: Moodboard) {
  const { doc } = c;
  newSheet(c, 'Mood Board', mb.title);
  const noteH = mb.note ? 28 : 0;
  const box = { x: MX, y: TOP, w: W - MX * 2, h: BOT - TOP - noteH };
  const g = 8;
  if (mb.template === CANVAS) {
    // collage: frames in layer order, each image cropped to its frame; cut-outs keep their transparency
    doc.rect(box.x, box.y, box.w, box.h).fill(BRAND.white);
    doc.save().rect(box.x, box.y, box.w, box.h).clip();
    for (const { img, frame } of canvasItems(mb.images)) {
      const file = uploadPath(img.cutout ?? img.file);
      if (!fs.existsSync(file)) continue;
      const fr = { x: box.x + frame.x * box.w, y: box.y + frame.y * box.h, w: frame.w * box.w, h: frame.h * box.h };
      const at = cropPlacement(fr, img);
      doc.save().rect(fr.x, fr.y, fr.w, fr.h).clip();
      doc.image(file, at.x, at.y, { width: at.w, height: at.h });
      doc.restore();
      if (img.caption) txt(doc, clip(doc, img.caption, fr.w, { size: 9, w: 500 }), fr.x, fr.y + fr.h + 3, { size: 9, w: 500, color: GREY });
    }
    doc.restore();
    doc.rect(box.x, box.y, box.w, box.h).lineWidth(0.6).strokeColor(RULE).stroke();
  } else for (const { slot, index, image } of placeImages(mb.template, mb.images)) {
    const x = box.x + slot.x * box.w + g / 2;
    const y = box.y + slot.y * box.h + g / 2;
    const w = slot.w * box.w - g;
    const h = slot.h * box.h - g;
    const file = image && fs.existsSync(uploadPath(image.cutout ?? image.file)) ? uploadPath(image.cutout ?? image.file) : null;
    if (file) {
      doc.save().rect(x, y, w, h).clip();
      doc.image(file, x, y, { cover: [w, h], align: 'center', valign: 'center' });
      doc.restore();
      if (image!.caption) {
        const o: TOpts = { size: 9, w: 500 };
        const tw2 = Math.min(w - 12, tw(doc, image!.caption, o) + 16);
        doc.rect(x, y + h - 22, tw2, 22).fill(BRAND.white);
        txt(doc, clip(doc, image!.caption, tw2 - 16, o), x + 8, y + h - 16, o);
      }
    } else {
      doc.save().rect(x, y, w, h).lineWidth(0.8).dash(4, { space: 3 }).strokeColor(GREY).stroke().undash().restore();
      txt(doc, `ช่อง ${index + 1}`, x, y + h / 2 - 6, { size: 9, color: GREY, align: 'center', width: w });
    }
  }
  if (mb.note) wrap(doc, mb.note, W - MX * 2, { size: 10 }).slice(0, 2).forEach((ln, i) => txt(doc, ln, MX, BOT - noteH + 8 + i * 13, { size: 10, color: GREY }));
}

export async function buildPdf(full: Bundle, opts: PdfOptions): Promise<Buffer> {
  const b = filterBundle(full, opts.cats);
  const want = (p: PdfPart) => (opts.parts ? opts.parts.includes(p) : p !== 'boq' || opts.prices);
  // plans are pre-rendered (greyscale / opacity per floor) because drawing is synchronous
  const plans = new Map<number, Buffer>();
  for (const fl of b.floors) {
    if (fl.plan_file && fs.existsSync(uploadPath(fl.plan_file))) plans.set(fl.id, await planImage(uploadPath(fl.plan_file), !!fl.plan_gray, fl.plan_opacity ?? 1));
  }
  const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: `${b.project.name} — KEYPLAN`, Author: b.project.designer || 'KEYPLAN', Creator: 'KEYPLAN' } });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((res, rej) => {
    doc.on('end', () => res(Buffer.concat(chunks)));
    doc.on('error', rej);
  });
  const c: Ctx = { doc, b, prices: opts.prices, sheets: [], plans };
  doc.addPage({ size: 'A3', layout: 'landscape', margin: 0 }); // cover, filled in by coverPage()
  if (want('mood')) moodSheets(c); // right after the cover
  if (want('plan')) layoutSheets(c);
  if (want('wiring')) wiringSheets(c);
  if (want('spec')) specSheets(c);
  if (want('load')) loadSheet(c);
  if (want('boq')) boqSheet(c);
  if (!c.sheets.length) newSheet(c, 'Project', 'ยังไม่มีข้อมูล');
  coverPage(c);
  footers(c);
  doc.end();
  return done;
}

void polylineLength;
