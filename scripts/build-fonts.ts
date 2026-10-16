// Converts the @fontsource WOFF subsets listed in server/fonts.ts into TTF files for pdfkit.
// Usage: npm run fonts   (rewrites server/fonts/*.ttf; no Python / fonttools needed)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { FONT_DIR, FONT_FILES } from '../server/fonts';

/** WOFF 1.0 → plain sfnt (TrueType/OpenType). Tables are copied as-is, inflating compressed ones. */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('not a WOFF 1.0 file');
  const flavor = woff.readUInt32BE(4);
  const n = woff.readUInt16BE(12);
  const tables = Array.from({ length: n }, (_, i) => {
    const e = 44 + i * 20;
    const off = woff.readUInt32BE(e + 4);
    const comp = woff.readUInt32BE(e + 8);
    const orig = woff.readUInt32BE(e + 12);
    const raw = woff.subarray(off, off + comp);
    return { tag: woff.subarray(e, e + 4), checksum: woff.readUInt32BE(e + 16), data: comp < orig ? zlib.inflateSync(raw) : raw };
  });
  const pow = 2 ** Math.floor(Math.log2(n));
  const head = Buffer.alloc(12 + 16 * n);
  head.writeUInt32BE(flavor, 0);
  head.writeUInt16BE(n, 4);
  head.writeUInt16BE(pow * 16, 6);
  head.writeUInt16BE(Math.log2(pow), 8);
  head.writeUInt16BE(n * 16 - pow * 16, 10);
  const body: Buffer[] = [];
  let off = head.length;
  let headOff = -1;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    t.tag.copy(head, r);
    head.writeUInt32BE(t.checksum, r + 4);
    head.writeUInt32BE(off, r + 8);
    head.writeUInt32BE(t.data.length, r + 12);
    if (t.tag.toString('latin1') === 'head') headOff = off;
    const pad = (4 - (t.data.length % 4)) % 4;
    body.push(t.data, Buffer.alloc(pad));
    off += t.data.length + pad;
  });
  const out = Buffer.concat([head, ...body]);
  // head.checkSumAdjustment = 0xB1B0AFBA − checksum of the whole file (computed with the field zeroed)
  if (headOff >= 0) {
    out.writeUInt32BE(0, headOff + 8);
    out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headOff + 8);
  }
  return out;
}

function checksum(b: Buffer): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) sum = (sum + b.readUInt32BE(i)) >>> 0;
  return sum;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('scripts', 'build-fonts.ts'))) {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  for (const f of FONT_FILES) {
    const src = path.resolve('node_modules', '@fontsource', f.pkg, 'files', f.src);
    const ttf = woffToSfnt(fs.readFileSync(src));
    fs.writeFileSync(path.join(FONT_DIR, f.file), ttf);
    console.log(`${f.file.padEnd(28)} ${String(ttf.length).padStart(7)} B  ← ${f.pkg}/${f.src}`);
  }
}
