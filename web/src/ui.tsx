import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BRAND, LOCKUP, LOGO_ON, MARK, MOTIFS, STROKE, WORDMARK, type LogoOn, type MotifName, type StrokeWeight } from '../../shared/brand';
import { COLORS, DEFAULT_LINEAR_M, LINEAR_LENGTHS, isLineSymbol, lineStyle, pointSymbol, type Prim } from '../../shared/symbols';
import type { ColorKey, Fixture, SymbolKind } from '../../shared/types';

/** The Light Theory mark (ring + crosshair), h px square, coloured for the background it sits on. */
export function Mark({ h = 32, on = 'light' }: { h?: number; on?: LogoOn }) {
  const c = LOGO_ON[on];
  return (
    <svg width={h} height={h} viewBox={`0 0 ${MARK.viewBox} ${MARK.viewBox}`} aria-hidden fill="none" strokeLinecap="round" strokeWidth={MARK.strokeWidth}>
      <path d={MARK.ring} stroke={c.ring} />
      <path d={MARK.cross} stroke={c.cross} />
    </svg>
  );
}

/** Primary lockup: mark + two-line "light / theory" wordmark. h = mark height in px (min 30). */
export function Logo({ h = 32, on = 'light' }: { h?: number; on?: LogoOn }) {
  const fs = h * LOCKUP.fontSize;
  return (
    <span className="logo" role="img" aria-label="light theory" style={{ gap: h * LOCKUP.gap, color: LOGO_ON[on].word }}>
      <Mark h={h} on={on} />
      <span className="wordmark" style={{ fontSize: fs, letterSpacing: `${WORDMARK.tracking}em`, fontWeight: WORDMARK.weight, lineHeight: LOCKUP.leading }} aria-hidden>
        {WORDMARK.lines[0]}
        <br />
        {WORDMARK.lines[1]}
      </span>
    </span>
  );
}

/**
 * A hand-drawn element of the graphic language. Lines keep one of the three brand weights
 * (fine 2.5 / standard 4.5 / bold 7 px) whatever the size. Decorative only (aria-hidden).
 */
export function Motif({ name, width, weight = width >= 120 ? 'standard' : 'fine', className, style }: { name: MotifName; width: number; weight?: StrokeWeight; className?: string; style?: CSSProperties }) {
  const m = MOTIFS[name];
  return (
    <svg className={className} style={style} width={width} height={(width * m.h) / m.w} viewBox={`0 0 ${m.w} ${m.h}`} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {m.strokes.map((s, i) => (
        <path key={i} d={s.d} vectorEffect="non-scaling-stroke" strokeWidth={STROKE[weight]} stroke={'ink' in s && s.ink ? BRAND.ink : BRAND.filament} strokeDasharray={'dash' in s && s.dash ? s.dash.join(' ') : undefined} />
      ))}
    </svg>
  );
}

/** Empty state card with one small element of the graphic language. */
export const Empty = ({ motif = 'strip', children }: { motif?: MotifName; children: ReactNode }) => (
  <div className="card empty">
    <Motif name={motif} width={motif === 'strip' || motif === 'glow' ? 120 : 56} weight="fine" className="empty-motif" />
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
  // the icon carries the plan colour; the code stays Ink so it is readable (green on white is < 4.5:1)
  <span className="chip">
    <SymbolIcon kind={f.symbol} color={f.color} size={20} />
    <b className="code">{f.code}</b>
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
