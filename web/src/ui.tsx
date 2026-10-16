import { useEffect, useState, type ReactNode } from 'react';
import { STATUS_STYLE, type Status } from '../../shared/brand';
import { ICON_PATHS, MARK_SHAPES, WORDMARK_PATH } from '../../shared/brand-assets';
import { COLORS, DEFAULT_LINEAR_M, LINEAR_LENGTHS, isLineSymbol, lineStyle, pointSymbol, type Prim } from '../../shared/symbols';
import type { ColorKey, Fixture, SymbolKind } from '../../shared/types';

/** The KEYPLAN room-plan mark (official geometry, brand-assets.ts), h px square. mono = Charcoal only. */
export function Mark({ h = 32, mono }: { h?: number; mono?: boolean }) {
  return (
    <svg width={h} height={h} viewBox="0 0 100 100" aria-hidden>
      {MARK_SHAPES.map((m, i) =>
        m.t === 'rect' ? <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} rx={m.rx || undefined} fill={mono ? '#1F1F1F' : m.fill} />
        : m.t === 'circle' ? <circle key={i} cx={m.cx} cy={m.cy} r={m.r} fill={mono ? '#1F1F1F' : m.fill} />
        : <path key={i} d={m.d} fill="none" stroke={m.stroke} strokeWidth={m.sw} />,
      )}
    </svg>
  );
}

/**
 * Horizontal lockup: mark + KEYPLAN wordmark, drawn from the official SVG paths (never retyped).
 * h = mark height in px. Below 160 px lockup width the guideline asks for the mark alone.
 */
export function Logo({ h = 32 }: { h?: number }) {
  const w = (WORDMARK_PATH.viewW * h) / 100;
  if (w < 160) return <span className="logo" role="img" aria-label="KEYPLAN"><Mark h={h} /></span>;
  return (
    <span className="logo" role="img" aria-label="KEYPLAN">
      <svg width={w} height={h} viewBox={`0 0 ${WORDMARK_PATH.viewW} 100`} aria-hidden>
        {MARK_SHAPES.map((m, i) =>
          m.t === 'rect' ? <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} rx={m.rx || undefined} fill={m.fill} />
          : m.t === 'circle' ? <circle key={i} cx={m.cx} cy={m.cy} r={m.r} fill={m.fill} />
          : <path key={i} d={m.d} fill="none" stroke={m.stroke} strokeWidth={m.sw} />,
        )}
        <path d={WORDMARK_PATH.d} fill="#1F1F1F" transform={`translate(${WORDMARK_PATH.x} ${WORDMARK_PATH.y}) scale(${WORDMARK_PATH.scale})`} />
      </svg>
    </span>
  );
}

/** Category icon (official set, 48 × 48 strokes). Studio-made categories without an icon get a plain box. */
export function CatIcon({ icon, size = 24, title }: { icon: string; size?: number; title?: string }) {
  const paths = ICON_PATHS[icon] ?? ['M10 10H38V38H10Z', 'M10 24H38'];
  return (
    <svg className="caticon" width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="square" strokeLinejoin="miter" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** Status chip: tint + border in the text colour + dot + word (never colour alone). */
export function StatusChip({ s }: { s: Status }) {
  const st = STATUS_STYLE[s] ?? STATUS_STYLE.draft;
  return (
    <span className="status" style={{ background: st.bg, color: st.fg, borderColor: st.fg }}>
      <span className="sdot" style={{ background: st.fg }} />{st.th}
    </span>
  );
}

/** Empty state: dashed box, mono mark, one line, one action. */
export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="empty">
    <Mark h={36} mono />
    <div>{children}</div>
  </div>
);

/** SVG elements for symbol primitives. u = base stroke width. */
export function Prims({ prims, color, u }: { prims: Prim[]; color: string; u: number }) {
  return (
    <>
      {prims.map((p, i) => {
        const sw = u * (p.sw ?? 1);
        if (p.t === 'circle') return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill ? color : 'none'} stroke={color} strokeWidth={sw} />;
        if (p.t === 'line') return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={color} strokeWidth={sw} strokeLinecap="round" />;
        return <polygon key={i} points={p.pts.map((q) => q.join(',')).join(' ')} fill={p.fill ? color : 'none'} stroke={color} strokeWidth={sw} strokeLinejoin="round" />;
      })}
    </>
  );
}

export function SymbolIcon({ kind, color, size = 26 }: { kind: SymbolKind; color: ColorKey; size?: number }) {
  const c = COLORS[color];
  if (isLineSymbol(kind)) {
    const st = lineStyle(kind, 4);
    return (
      <svg width={size} height={size} viewBox="-14 -10 28 20" aria-hidden>
        <line x1={-12} y1={0} x2={12} y2={0} stroke={c} strokeWidth={Math.max(1.6, st.sw * 0.7)} strokeDasharray={st.dash ? '4 3' : undefined} />
      </svg>
    );
  }
  const r = 5;
  const ox = kind === 'spot' ? -4 : 0;
  return (
    <svg width={size} height={size} viewBox="-14 -14 28 28" aria-hidden>
      <g transform={`translate(${ox} 0)`}>
        <Prims prims={pointSymbol(kind, 0, 0, r, 0, kind === 'linear' ? 14 : undefined)} color={c} u={1.2} />
      </g>
    </svg>
  );
}

export const FixtureChip = ({ f }: { f: Fixture }) => (
  // the icon carries the plan colour; the code is Terracotta Deep text (green on white is < 4.5:1)
  <span className="chip">
    <SymbolIcon kind={f.symbol} color={f.color} size={20} />
    <b className="codetag">{f.code}</b>
  </span>
);

/** Text input that keeps a local draft and commits on blur / Enter. */
export function Txt({ value, onCommit, type = 'text', placeholder, className, area, disabled }: { value: string | number | null | undefined; onCommit: (v: string) => void; type?: string; placeholder?: string; className?: string; area?: boolean; disabled?: boolean }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  const commit = () => {
    if (v !== (value == null ? '' : String(value))) onCommit(v);
  };
  if (area) return <textarea className={className} value={v} placeholder={placeholder} disabled={disabled} rows={3} onChange={(e) => setV(e.target.value)} onBlur={commit} />;
  return (
    <input
      className={className}
      type={type}
      value={v}
      placeholder={placeholder}
      disabled={disabled}
      step="any"
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export const Field = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
  <label className={`field${wide ? ' wide' : ''}`}>
    <span>{label}</span>
    {children}
  </label>
);

/** Button that needs a second click to confirm (no browser dialogs). */
export function ConfirmButton({ label, confirm = 'ยืนยันลบ', onConfirm, className = 'btn danger' }: { label: string; confirm?: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className + (armed ? ' armed' : '')}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

export const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString());

/** Body length of a linear (T5) fixture: one-click standard lengths or any other value, in metres. */
export function LengthPicker({ value, onChange }: { value: number | null; onChange: (m: number | null) => void }) {
  const cur = value ?? DEFAULT_LINEAR_M;
  return (
    <div className="row gap center-y mt wrap">
      <span className="muted">ความยาวโคม</span>
      {LINEAR_LENGTHS.map((m) => (
        <button key={m} className={`chipbtn code ${cur === m ? 'on' : ''}`} onClick={() => onChange(m)}>{m.toFixed(2)} m</button>
      ))}
      <Txt className="w90 num" type="number" value={LINEAR_LENGTHS.includes(cur) ? '' : cur} placeholder="อื่น ๆ (ม.)" onCommit={(v) => onChange(v === '' ? null : Number(v))} />
      <span className="muted small">วาดบนแปลนยาวตามจริงเมื่อชั้นตั้งสเกลแล้ว{value == null ? ' · ยังไม่ระบุ ใช้ 1.20 m' : ''}</span>
    </div>
  );
}
