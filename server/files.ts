import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { UPLOAD_DIR } from './db';

export interface Saved {
  file: string;
  w: number;
  h: number;
}

/** Normalise any raster upload to a flattened JPEG inside UPLOAD_DIR. */
export async function saveImage(buf: Buffer, opts: { maxDim?: number; quality?: number } = {}): Promise<Saved> {
  const { maxDim = 3600, quality = 90 } = opts;
  const out = await sharp(buf, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, chromaSubsampling: '4:4:4' })
    .toBuffer({ resolveWithObject: true });
  const file = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), out.data);
  return { file, w: out.info.width, h: out.info.height };
}

/** Save a PNG (keeps transparency, e.g. a cut-out) inside UPLOAD_DIR. */
export function savePng(png: Buffer): string {
  const file = `${crypto.randomUUID()}.png`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), png);
  return file;
}

/** The uploaded plan turned clockwise by 0 / 90 / 180 / 270 degrees, saved as a new JPEG. */
export async function rotatePlan(src: string, deg: number): Promise<Saved> {
  const out = await sharp(src, { failOn: 'none' }).rotate(deg).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true });
  const file = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), out.data);
  return { file, w: out.info.width, h: out.info.height };
}

/**
 * The plan as it should appear on a sheet: optional greyscale, then blended with white at `opacity`
 * (out = opacity·in + 255·(1−opacity)). Baked into the image rather than using PDF transparency,
 * which some printers handle badly. The uploaded original is never changed.
 */
export async function planImage(src: string | Buffer, gray: boolean, opacity: number): Promise<Buffer> {
  const a = Math.min(1, Math.max(0.1, opacity));
  let img = sharp(src, { failOn: 'none' });
  if (gray) img = img.grayscale();
  if (a < 1) img = img.linear(a, 255 * (1 - a));
  return img.jpeg({ quality: 88 }).toBuffer();
}

export const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString('latin1') === '%PDF-';

function tmpPdf(buf: Buffer): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-'));
  const file = path.join(dir, 'in.pdf');
  fs.writeFileSync(file, buf);
  return { dir, file };
}

export function pdfPageCount(buf: Buffer): number | null {
  const { dir, file } = tmpPdf(buf);
  try {
    const r = spawnSync('pdfinfo', [file], { encoding: 'utf8' });
    if (r.error || r.status !== 0) return null;
    const m = /Pages:\s+(\d+)/.exec(r.stdout);
    return m ? Number(m[1]) : null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Rasterise one PDF page with poppler (pdftoppm). Returns PNG bytes. */
export function pdfPageToPng(buf: Buffer, page: number, dpi = 150): Buffer {
  const { dir, file } = tmpPdf(buf);
  try {
    const prefix = path.join(dir, 'out');
    const r = spawnSync('pdftoppm', ['-singlefile', '-r', String(dpi), '-f', String(page), '-l', String(page), '-png', file, prefix], { encoding: 'utf8' });
    if (r.error) throw new Error('เซิร์ฟเวอร์ยังไม่ได้ติดตั้ง poppler-utils (pdftoppm) จึงแปลง PDF เป็นภาพไม่ได้ ให้อัปโหลดเป็น PNG/JPG แทน');
    if (r.status !== 0 || !fs.existsSync(prefix + '.png')) throw new Error('แปลงหน้า PDF ไม่สำเร็จ ตรวจสอบเลขหน้า');
    return fs.readFileSync(prefix + '.png');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export const uploadPath = (name: string) => path.join(UPLOAD_DIR, path.basename(name));
