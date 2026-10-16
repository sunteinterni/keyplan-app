// PDF font manifest. Each TTF in server/fonts is converted from a @fontsource WOFF subset
// by `npm run fonts` (scripts/build-fonts.ts). pdf.ts registers fonts from this same list.
// Thai and Latin glyphs live in separate subset files, so the PDF splits text into runs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');

export interface FontFile {
  name: string; // pdfkit font name
  file: string; // file in server/fonts
  pkg: string; // @fontsource package
  src: string; // WOFF file inside the package's files/ folder
}

const fsrc = (name: string, file: string, pkg: string, src: string): FontFile => ({ name, file, pkg, src });

export const FONT_FILES: FontFile[] = [
  // IBM Plex Sans Thai — body text (Thai + Latin)
  ...[400, 500, 600].flatMap((w) => [
    fsrc(`th${w}`, `th-thai-${w}.ttf`, 'ibm-plex-sans-thai', `ibm-plex-sans-thai-thai-${w}-normal.woff`),
    fsrc(`la${w}`, `th-latin-${w}.ttf`, 'ibm-plex-sans-thai', `ibm-plex-sans-thai-latin-${w}-normal.woff`),
  ]),
  // IBM Plex Mono — codes, numbers, small labels
  ...[400, 500].map((w) => fsrc(`mono${w}`, `mono-latin-${w}.ttf`, 'ibm-plex-mono', `ibm-plex-mono-latin-${w}-normal.woff`)),
  // Schibsted Grotesk — headings and the wordmark (Latin only; Thai falls back to Plex Sans Thai)
  ...[400, 500, 700, 800].map((w) => fsrc(`disp${w}`, `display-latin-${w}.ttf`, 'schibsted-grotesk', `schibsted-grotesk-latin-${w}-normal.woff`)),
  // Instrument Serif italic — secondary, used sparingly (Latin only)
  fsrc('serifi', 'serif-latin-400-italic.ttf', 'instrument-serif', 'instrument-serif-latin-400-italic.woff'),
  // Mali — handwritten notes (Thai + Latin)
  ...[400, 600].flatMap((w) => [
    fsrc(`handth${w}`, `hand-thai-${w}.ttf`, 'mali', `mali-thai-${w}-normal.woff`),
    fsrc(`handla${w}`, `hand-latin-${w}.ttf`, 'mali', `mali-latin-${w}-normal.woff`),
  ]),
];

export type FontFamily = 'body' | 'display' | 'serif' | 'hand';
export type FontWeight = 400 | 500 | 600 | 700 | 800;

const pick = <T extends number>(have: readonly T[], w: number): T => have.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));

/** pdfkit font name for one run of text. Thai runs always use a Thai-capable face. */
export function fontFor(th: boolean, w: FontWeight = 400, family: FontFamily = 'body', mono = false): string {
  if (family === 'hand') return `${th ? 'handth' : 'handla'}${pick([400, 600] as const, w)}`;
  if (!th) {
    if (mono) return `mono${pick([400, 500] as const, w)}`;
    if (family === 'display') return `disp${pick([400, 500, 700, 800] as const, w)}`;
    if (family === 'serif') return 'serifi';
  }
  return `${th ? 'th' : 'la'}${pick([400, 500, 600] as const, w)}`;
}
