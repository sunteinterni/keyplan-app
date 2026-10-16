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
  // Manrope — headings, sheet titles and numbers in display type (Latin only; Thai falls back to Plex Sans Thai)
  ...[500, 600, 700, 800].map((w) => fsrc(`disp${w}`, `display-latin-${w}.ttf`, 'manrope', `manrope-latin-${w}-normal.woff`)),
];

export type FontFamily = 'body' | 'display';
export type FontWeight = 400 | 500 | 600 | 700 | 800;

const pick = <T extends number>(have: readonly T[], w: number): T => have.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));

/** pdfkit font name for one run of text. Thai runs always use a Thai-capable face. */
export function fontFor(th: boolean, w: FontWeight = 400, family: FontFamily = 'body', mono = false): string {
  if (!th) {
    if (mono) return `mono${pick([400, 500] as const, w)}`;
    if (family === 'display') return `disp${pick([500, 600, 700, 800] as const, w)}`;
  }
  return `${th ? 'th' : 'la'}${pick([400, 500, 600] as const, w)}`;
}
