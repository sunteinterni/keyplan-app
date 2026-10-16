// Client-facing PDF (A3 landscape) with real, selectable text.
// Thai and Latin glyphs live in separate font files, so every string is split into runs.
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { boq, byCode, issues as _issues, lampText, lineLengthM, loadSchedule, quantities, unitWatt } from '../shared/calc';
import { BRAND, LOCKUP, MARK, MOTIFS, STROKE, TONES, TYPE, WIRE_COLORS as WIRE, WORDMARK, onColor, type Motif, type MotifName, type StrokeWeight } from '../shared/brand';
import { COLORS, LABEL_COLORS, linearLengthPx, baseRadius, isLineSymbol, lineStyle, pointSymbol, pointsAlong, polylineLength, primToSvg, symbolMeta, wiringPath } from '../shared/symbols';
import type { Bundle, Fixture, Floor } from '../shared/types';
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
const GREY = TONES.muted;
const RULE = TONES.line;
const SOFT = TONES.soft;

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
  family?: FontFamily; // Latin face; Thai runs stay in IBM Plex Sans Thai (Mali for 'hand')
  halo?: number; // white outline thickness
  track?: number; // letter-spacing in em (brand type scale); Latin runs only — Thai is never spaced out
}

/** Brand type styles for the PDF (Brand Guideline 06). */
const T = {
  display: { family: 'display', w: TYPE.display.weight, track: TYPE.display.tracking },
  headline: { family: 'display', w: TYPE.headline.weight, track: TYPE.headline.tracking },
  label: { mono: true, w: TYPE.label.weight, track: TYPE.label.tracking, color: TONES.muted },
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

/** Light Theory mark (shared/brand.ts): Filament ring + Ink crosshair. Box is `size` pt square. */
function drawSymbol(doc: Doc, x: number, y: number, size: number, ink = INK) {
  doc.save().translate(x, y).scale(size / MARK.viewBox).lineCap('round').lineWidth(MARK.strokeWidth);
  doc.path(MARK.ring).strokeColor(BRAND.filament).stroke();
  doc.path(MARK.cross).strokeColor(ink).stroke();
  doc.restore();
}
/** Symbol + stacked "light / theory" wordmark. Returns the lockup width. */
function drawLogo(doc: Doc, x: number, y: number, h = 38, ink = INK): number {
  drawSymbol(doc, x, y, h, ink);
  const fs = h * LOCKUP.fontSize;
  const tx = x + h + h * LOCKUP.gap;
  const cs = fs * WORDMARK.tracking;
  const [l1, l2] = WORDMARK.lines;
  doc.font(fontFor(false, WORDMARK.weight, 'display')).fontSize(fs).fillColor(ink);
  doc.text(l1, tx, y + h * LOCKUP.top, { lineBreak: false, characterSpacing: cs });
  doc.text(l2, tx, y + h * LOCKUP.top + fs * LOCKUP.leading, { lineBreak: false, characterSpacing: cs });
  return h + h * LOCKUP.gap + doc.widthOfString(l2, { characterSpacing: cs });
}

/**
 * Graphic-language element (shared/brand.ts) scaled to `width`, top-left at (x, y). Decoration only — never on a plan.
 * The line keeps one of the brand weights (2.5 / 4.5 / 7 pt) whatever the scale.
 */
function drawMotif(doc: Doc, name: MotifName, x: number, y: number, width: number, weight: StrokeWeight = 'standard') {
  const m: Motif = MOTIFS[name];
  const s = width / m.w;
  doc.save().translate(x, y).scale(s).lineCap('round').lineJoin('round').lineWidth(STROKE[weight] / s);
  for (const st of m.strokes) {
    if (st.dash) doc.dash(st.dash[0], { space: st.dash[1] });
    else doc.undash();
    doc.path(st.d).strokeColor(st.ink ? INK : BRAND.filament).stroke();
  }
  doc.undash().restore();
}

function newSheet(c: Ctx, title: string, sub = ''): void {
  const { doc, b } = c;
  doc.addPage({ size: 'A3', layout: 'landscape', margin: 0 });
  c.sheets.push({ title, sub });
  doc.rect(0, 0, W, H).fill(TONES.paper); // light plaster paper (guideline 08); plans and cards sit on white
  const lw = drawLogo(doc, MX, 16, 40);
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
  doc.rect(0, 0, W, H).fill(BRAND.plaster);
  drawLogo(doc, L, 60, 96);
  // graphic language: two elements only — a light beam here and the glow under the title
  drawMotif(doc, 'beam', W - 64 - 200, 48, 200, 'standard');

  let y = 290;
  txt(doc, 'LIGHTING DESIGN  ·  ออกแบบแสงสว่าง', L, y, { ...T.label, size: 10 });
  y += 26;
  const big: TOpts = { ...T.display, size: 54 };
  const lines = wrap(doc, p.name || 'Untitled', 620, big).slice(0, 2);
  lines.forEach((ln, i) => txt(doc, ln, L, y + i * 66, big));
  y += lines.length * 66 + 4;
  drawMotif(doc, 'glow', L, y, 150, 'fine');
  y += 58; // glow is ~47 pt tall
  txt(doc, 'light is a theory, proven in space.', L, y, { size: 22, family: 'serif' });

  // title block (as in the CI drawing title block)
  const cells: [string, string][] = [
    ['PROJECT NO.', p.project_no],
    ['CLIENT', p.client],
    ['LOCATION', p.location],
    ['DATE / REV', [dmy(p.doc_date), p.revision && `Rev. ${p.revision}`].filter(Boolean).join('  ·  ')],
    ['DESIGNER', p.designer],
    ['PREPARED BY', p.prepared_by],
  ];
  const tbW = 640;
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
  const ix = W - 64 - 380;
  let iy = 330;
  txt(doc, 'SHEETS  ·  รายการแบบ', ix, iy, { ...T.label, size: 9 });
  iy += 18;
  doc.moveTo(ix, iy).lineTo(ix + 380, iy).lineWidth(0.8).strokeColor(INK).stroke();
  iy += 10;
  const maxRows = Math.floor((H - 64 - iy) / 24);
  const pg = (n: number) => String(n).padStart(2, '0');
  rows.slice(0, maxRows).forEach((r) => {
    txt(doc, r.from === r.to ? pg(r.from) : `${pg(r.from)}–${pg(r.to)}`, ix, iy + 3, { size: 9.5, w: 500, mono: true, color: GREY });
    const t: TOpts = { size: 12, w: 500, family: 'display' };
    txt(doc, r.title, ix + 64, iy + 1, t);
    const sx = ix + 74 + tw(doc, r.title, t);
    if (r.sub) txt(doc, clip(doc, r.sub, ix + 380 - sx, { size: 10.5, color: GREY }), sx, iy + 3, { size: 10.5, color: GREY });
    iy += 24;
  });
  if (rows.length > maxRows) txt(doc, `… และอีก ${rows.length - maxRows} รายการ`, ix + 64, iy, { size: 9.5, color: GREY });
  txt(doc, 'architectural lighting studio, bangkok', L, H - 40, { size: 8.5, color: GREY, mono: true });
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
    drawPrims(doc, pointSymbol(f.symbol, cx, cy, r, symbolMeta(f.symbol).rotatable ? p.rot : 0, f.symbol === 'linear' ? linearLengthPx(f.length_m, floor.mpp, r) : undefined), color, u);
    doc.restore();
    txt(doc, f.code, cx + r * 0.9, cy - r * 2.7, { size: r * 1.2, w: 600, color: LABEL_COLORS[f.color], halo: r * 0.35 });
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
    .sort(byCode);
  txt(doc, 'LEGEND', x, y, { ...T.label, size: 9 });
  doc.moveTo(x, y + 14).lineTo(x + w, y + 14).lineWidth(0.6).strokeColor(INK).stroke();
  let cy = y + 22;
  for (const f of fx) {
    if (cy > BOT - 40) break;
    icon(doc, f, x + 16, cy + 11);
    txt(doc, f.code, x + 38, cy + 2, { size: 11, w: 500, mono: true }); // icon carries the plan colour
    const n = q[f.id].perFloor[floor.id];
    txt(doc, `${qtyText(n)} ${f.unit === 'm' ? 'm' : 'ชุด'}`, x + w - 70, cy + 2, { size: 10, w: 500, align: 'right', width: 70 });
    const desc = [f.name || f.model, lampText(f), f.kelvin ? `${f.kelvin}K` : ''].filter(Boolean).join('  ·  ');
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
    newSheet(c, 'Lighting Layout', fl.name);
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
  const list = b.fixtures.slice().sort(byCode);
  if (!list.length) return;
  const cols = 3;
  const rows = 2;
  const gap = 16;
  const cw = (W - MX * 2 - gap * (cols - 1)) / cols;
  const ch = (BOT - TOP - gap * (rows - 1)) / rows;
  list.forEach((f, i) => {
    const k = i % (cols * rows);
    if (k === 0) newSheet(c, 'Lighting Specification', `${Math.floor(i / (cols * rows)) + 1}/${Math.ceil(list.length / (cols * rows))}`);
    const x = MX + (k % cols) * (cw + gap);
    const y = TOP + Math.floor(k / cols) * (ch + gap);
    doc.rect(x, y, cw, ch).fill(BRAND.white);
    doc.rect(x, y, cw, ch).lineWidth(0.6).strokeColor(RULE).stroke();
    // head: icon in plan colour, code in display type, Filament rule underneath (CI spec sheet)
    doc.rect(x, y, cw, 34).fill(SOFT);
    doc.rect(x, y + 34, cw, 2).fill(BRAND.filament);
    icon(doc, f, x + 22, y + 17, 11);
    txt(doc, f.code, x + 48, y + 6, { ...T.headline, size: 18 });
    const n = q[f.id]?.total ?? 0;
    txt(doc, `${qtyText(n)} ${f.unit === 'm' ? 'm' : 'ชุด'}`, x + cw - 110, y + 10, { size: 13, w: 600, align: 'right', width: 100 });
    // images
    const iy = y + 42;
    const ih = 120;
    const iw = (cw - 30) / 2;
    for (const [j, file] of [f.photo_file, f.drawing_file].entries()) {
      const bx = x + 10 + j * (iw + 10);
      doc.rect(bx, iy, iw, ih).lineWidth(0.4).strokeColor(RULE).stroke();
      if (file && fs.existsSync(uploadPath(file))) doc.image(uploadPath(file), bx + 3, iy + 3, { fit: [iw - 6, ih - 6], align: 'center', valign: 'center' });
      else txt(doc, j === 0 ? 'รูปโคม' : 'แบบ / Drawing', bx, iy + ih / 2 - 6, { size: 9, color: GREY, align: 'center', width: iw });
    }
    // details
    let ty = iy + ih + 12;
    const kv: [string, string][] = [
      ['รุ่น', f.model],
      ['ชื่อ', f.name],
      ['ขั้ว / หลอด', [f.socket, f.bulbs ? `${f.bulbs} หลอด` : ''].filter(Boolean).join(' · ')],
      ['กำลังไฟ', f.watt_per_lamp != null ? `${f.watt_per_lamp} W${f.unit === 'm' ? '/m' : ' / หลอด'}${unitWatt(f) && f.unit !== 'm' ? `  (รวม ${qtyText(unitWatt(f))} W)` : ''}` : f.watt_total != null ? `${f.watt_total} W` : ''],
      ['อุณหภูมิสี / IP', [f.kelvin ? `${f.kelvin}K` : '', f.ip].filter(Boolean).join(' · ')],
      ['สี / ผิว', f.finish],
      ['ซัพพลายเออร์', f.supplier],
    ];
    if (c.prices) kv.push(['ราคา', f.price != null ? `${money(f.price)} บาท${f.unit === 'm' ? ' / ม.' : ' / ชุด'}` : 'รอราคา']);
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

function table(c: Ctx, title: string, cols: Col[], rows: (string[] & { bold?: boolean })[], opts: { rowH?: number; totalW?: number; firstY?: number } = {}): number {
  const { doc } = c;
  const rowH = opts.rowH ?? 22;
  const totalW = opts.totalW ?? W - MX * 2;
  const scale = totalW / cols.reduce((a, z) => a + z.w, 0);
  const cw = cols.map((x) => x.w * scale);
  let y = opts.firstY ?? TOP;
  const head = () => {
    doc.rect(MX, y, totalW, 24).fill(INK);
    let x = MX;
    cols.forEach((col, i) => {
      txt(doc, col.h, x + 6, y + 6, { size: 9.5, w: 600, color: '#ffffff', align: col.align ?? 'left', width: cw[i] - 12 });
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
    doc.rect(MX, y, totalW, rowH).fill(ri % 2 === 1 ? SOFT : BRAND.white);
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
  const rows: (string[] & { bold?: boolean })[] = [];
  const itemsText = (r: (typeof ls.rows)[number]) => r.items.map((i) => `${i.fixture.code} ×${qtyText(i.qty)}${i.fixture.unit === 'm' ? ' m' : ''}`).join(',  ');
  for (const r of ls.rows) {
    rows.push([r.circuit?.name ?? '', r.circuit?.area ?? '', itemsText(r), qtyText(r.pieces), r.meters ? qtyText(Math.round(r.meters * 10) / 10) : '-', qtyText(Math.round(r.watts)), r.amps.toFixed(2), r.circuit?.breaker_a ? `${r.circuit.breaker_a} A` : '-']);
  }
  if (ls.unassigned) rows.push(['ยังไม่ระบุวงจร', '', itemsText(ls.unassigned), qtyText(ls.unassigned.pieces), ls.unassigned.meters ? qtyText(Math.round(ls.unassigned.meters * 10) / 10) : '-', qtyText(Math.round(ls.unassigned.watts)), ls.unassigned.amps.toFixed(2), '-']);
  const tot = ['รวม', '', '', qtyText(ls.totalPieces), ls.totalMeters ? qtyText(Math.round(ls.totalMeters * 10) / 10) : '-', qtyText(Math.round(ls.totalWatts)), ls.totalAmps.toFixed(2), ''] as string[] & { bold?: boolean };
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
  const rows: string[][] = r.rows.map((row, i) => {
    const f = row.fixture;
    return [
      String(i + 1),
      f.code,
      [f.name || f.model, f.name && f.model ? f.model : ''].filter(Boolean).join(' · '),
      [lampText(f), f.kelvin ? `${f.kelvin}K` : ''].filter(Boolean).join('  '),
      qtyText(row.qty.total),
      f.unit === 'm' ? 'ม.' : 'ชุด',
      row.price != null ? money(row.price) : 'รอราคา',
      row.price != null ? money(row.amount) : '-',
    ];
  });
  const endY = table(c, 'Quotation / Bill of Quantities', [
    { h: 'ลำดับ', w: 40, align: 'center', mono: true },
    { h: 'รหัส', w: 60, mono: true },
    { h: 'รายการ / รุ่น', w: 300 },
    { h: 'สเปค', w: 190 },
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
  doc.rect(x - 8, y - 6, bw + 8, 26).fill(BRAND.beam);
  line('ยอดรวมสุทธิ', `฿ ${money(r.grand)}`, true);
  if (r.unpriced) txt(doc, `* มี ${r.unpriced} รายการที่ยังรอราคา ยังไม่รวมในยอดนี้`, x, y + 4, { size: 9, color: TONES.warn });
  if (b.project.note) wrap(doc, b.project.note, W / 2 - MX, { size: 9.5 }).slice(0, 6).forEach((ln, i) => txt(doc, ln, MX, endY + 18 + i * 13, { size: 9.5, color: GREY }));
}

export interface PdfOptions {
  prices: boolean;
}

export async function buildPdf(b: Bundle, opts: PdfOptions): Promise<Buffer> {
  // plans are pre-rendered (greyscale / opacity per floor) because drawing is synchronous
  const plans = new Map<number, Buffer>();
  for (const fl of b.floors) {
    if (fl.plan_file && fs.existsSync(uploadPath(fl.plan_file))) plans.set(fl.id, await planImage(uploadPath(fl.plan_file), !!fl.plan_gray, fl.plan_opacity ?? 1));
  }
  const doc = new PDFDocument({ size: 'A3', layout: 'landscape', margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: `${b.project.name} — Lighting Design`, Author: b.project.designer || 'Light Theory' } });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  doc.on('data', (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((res, rej) => {
    doc.on('end', () => res(Buffer.concat(chunks)));
    doc.on('error', rej);
  });
  const c: Ctx = { doc, b, prices: opts.prices, sheets: [], plans };
  doc.addPage({ size: 'A3', layout: 'landscape', margin: 0 }); // cover, filled in by coverPage()
  layoutSheets(c);
  wiringSheets(c);
  specSheets(c);
  loadSheet(c);
  if (opts.prices) boqSheet(c);
  if (!c.sheets.length) newSheet(c, 'Lighting Design', 'ยังไม่มีข้อมูล');
  coverPage(c);
  footers(c);
  doc.end();
  return done;
}

void polylineLength;
