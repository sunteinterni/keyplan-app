import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import { FONT_DIR, FONT_FILES, fontFor } from '../server/fonts';
import { woffToSfnt } from '../scripts/build-fonts';

const sum32 = (b: Buffer) => {
  let s = 0;
  for (let i = 0; i < b.length; i += 4) s = (s + b.readUInt32BE(i)) >>> 0;
  return s;
};

test('every font in the manifest exists and loads in pdfkit', () => {
  const doc = new PDFDocument({ autoFirstPage: false });
  const names = new Set<string>();
  for (const f of FONT_FILES) {
    assert.ok(!names.has(f.name), `duplicate font name ${f.name}`);
    names.add(f.name);
    const file = path.join(FONT_DIR, f.file);
    assert.ok(fs.existsSync(file), `missing ${f.file} — run npm run fonts`);
    doc.registerFont(f.name, file);
    assert.ok(doc.font(f.name).fontSize(10).widthOfString('Aa 12') > 0, f.name);
  }
});

test('Thai faces contain Thai glyphs and Latin faces contain Latin glyphs', () => {
  const doc = new PDFDocument({ autoFirstPage: false });
  for (const f of FONT_FILES) doc.registerFont(f.name, path.join(FONT_DIR, f.file));
  // pdfkit exposes the parsed fontkit font on the current font object
  const has = (name: string, ch: string) => (doc.font(name) as unknown as { _font: { font: { hasGlyphForCodePoint(c: number): boolean } } })._font.font.hasGlyphForCodePoint(ch.codePointAt(0)!);
  for (const n of ['th400', 'th600']) for (const ch of 'กขฟ่ั') assert.ok(has(n, ch), `${n} ${ch}`);
  for (const n of ['la400', 'disp800', 'disp600', 'mono400']) for (const ch of 'keyPLAN0฿'.replace('฿', '')) assert.ok(has(n, ch), `${n} ${ch}`);
});

test('fontFor picks the right face for each run', () => {
  assert.equal(fontFor(false), 'la400');
  assert.equal(fontFor(true, 600), 'th600');
  assert.equal(fontFor(false, 800, 'display'), 'disp800');
  assert.equal(fontFor(false, 600, 'display'), 'disp600');
  assert.equal(fontFor(false, 400, 'display'), 'disp500'); // nearest available
  assert.equal(fontFor(true, 800, 'display'), 'th600'); // Thai stays in Plex Sans Thai
  assert.equal(fontFor(false, 600, 'body', true), 'mono500');
  assert.equal(fontFor(true, 400, 'body', true), 'th400'); // mono has no Thai
});

test('woffToSfnt rebuilds a valid sfnt', () => {
  // Build a tiny WOFF by hand: one compressed "head" table and one stored "name" table.
  const headT = Buffer.alloc(54);
  headT.writeUInt32BE(0x5f0f3cf5, 12); // magic
  const nameT = Buffer.from('abcdef');
  const tabs = [
    { tag: 'head', data: headT, comp: zlib.deflateSync(headT) },
    { tag: 'name', data: nameT, comp: nameT },
  ];
  const dir = Buffer.alloc(44 + 20 * tabs.length);
  dir.write('wOFF', 0, 'latin1');
  dir.writeUInt32BE(0x00010000, 4);
  dir.writeUInt16BE(tabs.length, 12);
  let off = dir.length;
  const blobs: Buffer[] = [];
  tabs.forEach((t, i) => {
    const e = 44 + i * 20;
    dir.write(t.tag, e, 'latin1');
    dir.writeUInt32BE(off, e + 4);
    dir.writeUInt32BE(t.comp.length, e + 8);
    dir.writeUInt32BE(t.data.length, e + 12);
    const pad = (4 - (t.comp.length % 4)) % 4;
    blobs.push(t.comp, Buffer.alloc(pad));
    off += t.comp.length + pad;
  });
  const sfnt = woffToSfnt(Buffer.concat([dir, ...blobs]));
  assert.equal(sfnt.readUInt32BE(0), 0x00010000);
  assert.equal(sfnt.readUInt16BE(4), 2);
  const headOff = sfnt.readUInt32BE(12 + 8);
  assert.ok(sfnt.subarray(headOff + 12, headOff + 16).equals(headT.subarray(12, 16)), 'head inflated');
  assert.equal(sfnt.readUInt32BE(headOff + 8) === 0, false);
  assert.equal(sum32(sfnt), 0xb1b0afba, 'whole-file checksum matches the TrueType magic');
});

test('shipped TTFs carry a correct checkSumAdjustment', () => {
  for (const f of FONT_FILES) assert.equal(sum32(fs.readFileSync(path.join(FONT_DIR, f.file))), 0xb1b0afba, f.file);
});
