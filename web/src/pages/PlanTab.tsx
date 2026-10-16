import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { api, fileUrl, upload } from '../api';
import { historyFor, snapLine, snapPlacement, type Edit, type Single } from '../history';
import { boxOf, has, inBox, shift, toggle, union, wiringOrder, type Item } from '../selection';
import { BRAND, SELECT_HALO, WIRE_COLORS, WIRE_NONE, onColor } from '../../../shared/brand';
import { lineLengthM, quantities, byCode } from '../../../shared/calc';
import { COLORS, COLOR_LABEL, LABEL_COLORS, SYMBOLS, linearLengthPx, baseRadius, isLineSymbol, lineStyle, pointSymbol, pointsAlong, symbolMeta, wiringPath } from '../../../shared/symbols';
import type { ColorKey, Fixture, Floor, LineEl, Placement } from '../../../shared/types';
import { ConfirmButton, Empty, FixtureChip, Prims, SymbolIcon, Txt, qty } from '../ui';
import type { TabProps } from './common';

type Tool = 'select' | 'place' | 'line' | 'scale' | 'wire';
type Sel = Item | null;
type Pt = [number, number];

/** 'm': moving the selected items (start sx/sy → current x/y); 'v': moving one vertex of a line. All in image px. */
type Drag =
  | { kind: 'm'; items: Item[]; sx: number; sy: number; x: number; y: number; moved: boolean }
  | { kind: 'v'; id: number; vi: number; x: number; y: number; moved: boolean };

export function PlanTab({ bundle, reload, toast }: TabProps) {
  const [floorId, setFloorId] = useState<number | null>(bundle.floors[0]?.id ?? null);
  const floor = bundle.floors.find((f) => f.id === floorId) ?? bundle.floors[0] ?? null;
  const [tool, setTool] = useState<Tool>('select');
  const [activeFx, setActiveFx] = useState<number | null>(null);
  const [activeCircuit, setActiveCircuit] = useState<number | null>(bundle.circuits[0]?.id ?? null);
  // selection: any number of points/lines; `sel` is the single selected item when exactly one is selected
  const [sels, setSels] = useState<Item[]>([]);
  const sel: Sel = sels.length === 1 ? sels[0] : null;
  const setSel = (s: Sel) => setSels(s ? [s] : []);
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null); // Shift+drag selection box, image px
  const boxRef = useRef<{ a: Pt; b: Pt } | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [scalePts, setScalePts] = useState<Pt[]>([]);
  const [meters, setMeters] = useState('');
  const [showWires, setShowWires] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfPage, setPdfPage] = useState('1');
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const fixtures = useMemo(() => new Map(bundle.fixtures.map((f) => [f.id, f])), [bundle.fixtures]);
  const fxList = useMemo(() => bundle.fixtures.slice().sort(byCode), [bundle.fixtures]);
  const q = useMemo(() => quantities(bundle), [bundle]);

  const iw = floor?.plan_w ?? 1000;
  const ih = floor?.plan_h ?? 700;
  const hasPlan = !!floor?.plan_file;
  const r = floor ? baseRadius(iw, floor.symbol_scale) : 10;
  const u = Math.max(1.3, r * 0.16);

  const placements = useMemo(() => (floor ? bundle.placements.filter((p) => p.floor_id === floor.id) : []), [bundle.placements, floor]);
  const lines = useMemo(() => (floor ? bundle.lines.filter((l) => l.floor_id === floor.id) : []), [bundle.lines, floor]);

  useEffect(() => {
    setView({ x: 0, y: 0, z: 1 });
    setSel(null);
    setDraft([]);
    setScalePts([]);
  }, [floor?.id]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await reload();
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [reload, toast],
  );

  // undo / redo: every plan edit goes through the project's history
  const hist = historyFor(bundle.project.id, api);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const edit = useCallback<EditFn>(
    async (e) => {
      let id: number | null = null;
      await run(async () => {
        try {
          id = await hist.do(e);
        } finally {
          bump();
        }
      });
      return id;
    },
    [hist, run],
  );
  const undo = useCallback(() => run(async () => { try { await hist.undo(); } finally { bump(); } }), [hist, run]);
  const redo = useCallback(() => run(async () => { try { await hist.redo(); } finally { bump(); } }), [hist, run]);
  const codeOf = (fixtureId: number) => fixtures.get(fixtureId)?.code ?? '';

  // items that an undo (or someone else) removed drop out of the selection
  useEffect(() => {
    const live = sels.filter((s) => (s.k === 'p' ? bundle.placements : bundle.lines).some((x) => x.id === s.id));
    if (live.length !== sels.length) setSels(live);
  }, [bundle, sels]);

  const pointOf = (id: number) => bundle.placements.find((x) => x.id === id);
  const lineOf = (id: number) => bundle.lines.find((x) => x.id === id);

  /** One undo step for one or many items: a single edit as is, several as a batch. */
  const editMany = (parts: Single[], label: string) => (parts.length === 1 ? edit(parts[0]) : parts.length ? edit({ t: 'batch', edits: parts, label }) : Promise.resolve(null));

  const deleteItems = (items: Item[]) => {
    const parts: Single[] = [];
    for (const it of items) {
      const p = it.k === 'p' ? pointOf(it.id) : undefined;
      const l = it.k === 'l' ? lineOf(it.id) : undefined;
      if (p) parts.push({ t: 'delete', e: 'p', id: p.id, floor: p.floor_id, snap: snapPlacement(p), label: `ลบจุด ${codeOf(p.fixture_id)}` });
      if (l) parts.push({ t: 'delete', e: 'l', id: l.id, floor: l.floor_id, snap: snapLine(l), label: `ลบเส้น ${codeOf(l.fixture_id)}` });
    }
    return editMany(parts, `ลบ ${parts.length} รายการ`);
  };
  const deleteItem = (k: 'p' | 'l', id: number) => deleteItems([{ k, id }]);

  const toImg =(e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  };

  // wheel zoom (needs a non-passive listener)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      setView((v) => {
        const z = Math.min(12, Math.max(1, v.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const f = v.z / z;
        const nx = p.x - (p.x - v.x) * f;
        const ny = p.y - (p.y - v.y) * f;
        return clampView({ x: nx, y: ny, z }, iw, ih);
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [iw, ih, hasPlan]);

  const finishLine = useCallback(
    (pts: Pt[]) => {
      const clean = pts.filter((p, i) => i === 0 || Math.hypot((p[0] - pts[i - 1][0]) * iw, (p[1] - pts[i - 1][1]) * ih) > 3);
      setDraft([]);
      if (!floor || !activeFx || clean.length < 2) return;
      void edit({ t: 'create', e: 'l', floor: floor.id, snap: { fixture_id: activeFx, pts: clean, heads: 0, head_fixture_id: null, circuit_id: null }, label: `วาดเส้น ${fixtures.get(activeFx)?.code ?? ''}` }).then((id) => {
        if (id) setSel({ k: 'l', id });
        setTool('select');
      });
    },
    [floor, activeFx, iw, ih, edit, fixtures],
  );

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return; // text fields keep their own undo
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        void redo();
      } else if (mod && k === 'z') {
        e.preventDefault();
        void undo();
      } else if (e.key === 'Escape') {
        setDraft([]);
        setScalePts([]);
        setSel(null);
        setTool('select');
      } else if (mod && k === 'a' && floor) {
        e.preventDefault(); // select everything on this floor
        setTool('select');
        setSels([...placements.map((p) => ({ k: 'p' as const, id: p.id })), ...lines.map((l) => ({ k: 'l' as const, id: l.id }))]);
      } else if (e.key === 'Enter' && tool === 'line') finishLine(draft);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sels.length) {
        e.preventDefault();
        void deleteItems(sels).then(() => setSels([]));
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const norm = (p: Pt): Pt => [Math.min(1, Math.max(0, p[0] / iw)), Math.min(1, Math.max(0, p[1] / ih))];

  const assign = (kind: 'p' | 'l', id: number, current: number | null) => {
    if (!floor) return;
    const target = current === activeCircuit ? null : activeCircuit;
    if (target == null && current == null) return;
    const item = (kind === 'p' ? bundle.placements : bundle.lines).find((x) => x.id === id);
    if (!item) return;
    const cname = bundle.circuits.find((c) => c.id === (target ?? current))?.name ?? '';
    void edit({
      t: 'assign', e: kind, id, project: bundle.project.id, to: target,
      before: { circuit_id: item.circuit_id, circuit_order: item.circuit_order },
      label: target ? `โยง ${codeOf(item.fixture_id)} เข้า ${cname}` : `เอา ${codeOf(item.fixture_id)} ออกจาก ${cname}`,
    });
  };

  const onItemDown = (e: React.PointerEvent, kind: 'p' | 'l', id: number, circuitId: number | null) => {
    if (e.button !== 0) return;
    if (tool === 'wire') {
      e.stopPropagation();
      if (!activeCircuit) return toast('เลือกหรือสร้างวงจรทางซ้ายก่อน');
      assign(kind, id, circuitId);
      return;
    }
    if (tool === 'select' || tool === 'place') {
      e.stopPropagation();
      const it: Item = { k: kind, id };
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        setSels((s) => toggle(s, it)); // add to / remove from the selection
        return;
      }
      // pressing on an item that is part of the selection drags the whole selection
      const items = has(sels, it) ? sels : [it];
      setSels(items);
      if (tool === 'select') {
        const [x, y] = toImg(e);
        const d: Drag = { kind: 'm', items, sx: x, sy: y, x, y, moved: false };
        dragRef.current = d;
        setDrag(d);
        svgRef.current?.setPointerCapture(e.pointerId);
      }
    }
  };

  const onVertexDown = (e: React.PointerEvent, id: number, vi: number, p: Pt) => {
    e.stopPropagation();
    const d: Drag = { kind: 'v', id, vi, x: p[0] * iw, y: p[1] * ih, moved: false };
    dragRef.current = d;
    setDrag(d);
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onDown = (e: React.PointerEvent) => {
    if (!floor || !hasPlan) return;
    const pt = toImg(e);
    if (tool === 'select' && e.button === 0 && e.shiftKey) {
      // Shift+drag on empty space: selection box (adds to the current selection)
      boxRef.current = { a: pt, b: pt };
      setBox(boxRef.current);
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    const pan =e.button === 1 || e.button === 2 || (tool === 'select' && e.button === 0) || e.shiftKey;
    if (pan && !(tool === 'line' && e.button === 0 && !e.shiftKey)) {
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'place') {
      if (!activeFx) return toast('เลือกรหัสโคมทางซ้ายก่อน');
      const fx = fixtures.get(activeFx);
      if (!fx || isLineSymbol(fx.symbol)) return;
      const [x, y] = norm(pt);
      void edit({ t: 'create', e: 'p', floor: floor.id, snap: { fixture_id: activeFx, x, y, rot: 0, circuit_id: null }, label: `วางโคม ${fx.code}` }).then((id) => {
        if (id) setSel({ k: 'p', id });
      });
    } else if (tool === 'line') {
      setDraft((d) => [...d, norm(pt)]);
    } else if (tool === 'scale') {
      setScalePts((s) => (s.length >= 2 ? [norm(pt)] : [...s, norm(pt)]));
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!hasPlan) return;
    if (panRef.current) {
      const pr = panRef.current;
      const svg = svgRef.current!;
      const m = svg.getScreenCTM()!;
      const dx = (e.clientX - pr.sx) / m.a;
      const dy = (e.clientY - pr.sy) / m.d;
      if (Math.abs(e.clientX - pr.sx) + Math.abs(e.clientY - pr.sy) > 3) pr.moved = true;
      setView((v) => clampView({ ...v, x: pr.vx - dx, y: pr.vy - dy }, iw, ih));
      return;
    }
    const pt = toImg(e);
    if (boxRef.current) {
      boxRef.current = { ...boxRef.current, b: pt };
      setBox(boxRef.current);
      return;
    }
    if (dragRef.current) {
      const d = { ...dragRef.current, x: pt[0], y: pt[1], moved: true };
      dragRef.current = d;
      setDrag(d);
      return;
    }
    if (tool === 'line' || tool === 'scale') setHover(norm(pt));
  };

  const onUp = () => {
    if (panRef.current) {
      const moved = panRef.current.moved;
      panRef.current = null;
      if (!moved && tool === 'select') setSel(null);
    }
    const bx = boxRef.current;
    boxRef.current = null;
    setBox(null);
    if (bx && Math.hypot(bx.b[0] - bx.a[0], bx.b[1] - bx.a[1]) > 4) {
      const b = boxOf(norm(bx.a), norm(bx.b));
      const found: Item[] = [
        ...placements.filter((p) => inBox(p, b)).map((p) => ({ k: 'p' as const, id: p.id })),
        // a line is caught when its middle is inside the box
        ...lines.filter((l) => { const m = pointsAlong(l.pts, 1)[0]; return m && inBox(m, b); }).map((l) => ({ k: 'l' as const, id: l.id })),
      ];
      setSels((s) => union(s, found));
    }
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d && d.moved) {
      if (d.kind === 'm') {
        const dx = (d.x - d.sx) / iw;
        const dy = (d.y - d.sy) / ih;
        const parts: Single[] = [];
        for (const it of d.items) {
          const p = it.k === 'p' ? pointOf(it.id) : undefined;
          const l = it.k === 'l' ? lineOf(it.id) : undefined;
          if (p) {
            const [x, y] = shift([p.x, p.y], dx, dy);
            parts.push({ t: 'patch', e: 'p', id: p.id, before: { x: p.x, y: p.y }, after: { x, y }, label: `ย้ายจุด ${codeOf(p.fixture_id)}` });
          }
          if (l) parts.push({ t: 'patch', e: 'l', id: l.id, before: { pts: l.pts }, after: { pts: l.pts.map((q) => shift(q, dx, dy)) }, label: `ย้ายเส้น ${codeOf(l.fixture_id)}` });
        }
        void editMany(parts, `ย้าย ${parts.length} รายการ`);
      } else {
        const [nx, ny] = norm([d.x, d.y]);
        const l = bundle.lines.find((x) => x.id === d.id);
        if (l) {
          const pts = l.pts.map((p, i) => (i === d.vi ? ([nx, ny] as Pt) : p));
          void edit({ t: 'patch', e: 'l', id: l.id, before: { pts: l.pts }, after: { pts }, label: `แก้เส้น ${codeOf(l.fixture_id)}` });
        }
      }
    }
  };

  const doUpload = async (file: File) => {
    if (!floor) return;
    setBusy(true);
    try {
      await upload(`/api/floors/${floor.id}/plan?page=${Math.max(1, Number(pdfPage) || 1)}`, file);
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addFloor = () => run(async () => {
    const res = await api<{ id: number }>('POST', `/api/projects/${bundle.project.id}/floors`, {});
    setFloorId(res.id);
  });

  const pickFixture = (f: Fixture) => {
    setActiveFx(f.id);
    setTool(isLineSymbol(f.symbol) ? 'line' : 'place');
    setDraft([]);
  };

  const submitScale = () => {
    if (!floor || scalePts.length < 2) return;
    // same calculation as POST /api/floors/:id/scale, sent as a floor patch so it can be undone
    const m = Number(meters);
    const pxLen = Math.hypot((scalePts[1][0] - scalePts[0][0]) * iw, (scalePts[1][1] - scalePts[0][1]) * ih);
    if (!(m > 0)) return toast('ระยะจริงต้องมากกว่า 0');
    if (pxLen < 2) return toast('สองจุดอยู่ใกล้กันเกินไป');
    void edit({ t: 'patch', e: 'floor', id: floor.id, before: { mpp: floor.mpp }, after: { mpp: m / pxLen }, label: `ตั้งสเกล ${floor.name}` }).then(() => {
      setScalePts([]);
      setMeters('');
      setTool('select');
    });
  };

  const px = (p: Pt): Pt => [p[0] * iw, p[1] * ih];
  // while dragging the selection, draw the selected items at their would-be position
  const moving = (k: 'p' | 'l', id: number) => drag?.kind === 'm' && drag.moved && has(drag.items, { k, id });
  const offset = (p: Pt): Pt => (drag?.kind === 'm' ? px(shift(p, (drag.x - drag.sx) / iw, (drag.y - drag.sy) / ih)) : px(p));
  const placementPos = (p: Placement): Pt => (moving('p', p.id) ? offset([p.x, p.y]) : px([p.x, p.y]));
  const linePts = (l: LineEl): Pt[] =>
    moving('l', l.id) ? l.pts.map(offset) : l.pts.map((p, i) => (drag?.kind === 'v' && drag.id === l.id && drag.vi === i && drag.moved ? ([drag.x, drag.y] as Pt) : px(p)));

  const circuitColor = (id: number | null) => (id == null ? WIRE_NONE : WIRE_COLORS[Math.max(0, bundle.circuits.findIndex((c) => c.id === id)) % WIRE_COLORS.length]);
  const wiring = (showWires || tool === 'wire') && floor
    ? bundle.circuits.map((c) => {
        const items = [
          ...placements.filter((p) => p.circuit_id === c.id).map((p) => ({ o: p.circuit_order, p: placementPos(p) })),
          ...lines.filter((l) => l.circuit_id === c.id && l.pts.length >= 2).map((l) => ({ o: l.circuit_order, p: pointsAlong(linePts(l), 1)[0] ? ([pointsAlong(linePts(l), 1)[0].x, pointsAlong(linePts(l), 1)[0].y] as Pt) : linePts(l)[0] })),
        ].sort((a, b) => a.o - b.o);
        return { c, pts: items.map((i) => i.p) };
      }).filter((w) => w.pts.length > 0)
    : [];

  const selP = sel?.k === 'p' ? placements.find((p) => p.id === sel.id) : undefined;
  const selL = sel?.k === 'l' ? lines.find((l) => l.id === sel.id) : undefined;

  const activeF = activeFx ? fixtures.get(activeFx) : undefined;
  const viewBox = `${view.x} ${view.y} ${iw / view.z} ${ih / view.z}`;

  const toolBtn = (t: Tool, label: string, hint: string) => (
    <button className={`tool ${tool === t ? 'on' : ''}`} title={hint} onClick={() => { setTool(t); setDraft([]); setScalePts([]); }}>{label}</button>
  );

  return (
    <div className="editor">
      <div className="floorbar">
        {bundle.floors.map((f) => (
          <button key={f.id} className={`ftab ${f.id === floor?.id ? 'on' : ''}`} onClick={() => setFloorId(f.id)}>{f.name}</button>
        ))}
        <button className="ftab add" onClick={addFloor}>+ เพิ่มชั้น</button>
        <div className="grow" />
        {floor && (
          <>
            <span className="muted small">{floor.mpp ? `สเกล: 1 px = ${(floor.mpp * 100).toFixed(2)} ซม.` : 'ยังไม่ตั้งสเกล'}</span>
            <label className="muted small row gap">ขนาดสัญลักษณ์
              <input type="range" min={0.5} max={2.5} step={0.1} value={floor.symbol_scale} onChange={(e) => void edit({ t: 'patch', e: 'floor', id: floor.id, before: { symbol_scale: floor.symbol_scale }, after: { symbol_scale: Number(e.target.value) }, label: 'ขนาดสัญลักษณ์', merge: 'symbol_scale' })} />
            </label>
            <label className="muted small row gap"><input type="checkbox" checked={showWires || tool === 'wire'} disabled={tool === 'wire'} onChange={(e) => setShowWires(e.target.checked)} />แสดงเส้นวงจร</label>
          </>
        )}
      </div>
      {!floor ? (
        <Empty motif="strip">ยังไม่มีชั้น — กด “+ เพิ่มชั้น” เพื่อเริ่ม แล้วอัปโหลดแปลนของลูกค้า</Empty>
      ) : (
        <div className="editor-body">
          <aside className="tools">
            <div className="toolrow">
              {toolBtn('select', '↖ เลือก/ย้าย', 'คลิกเลือก ลากย้าย ลากพื้นที่ว่างเพื่อเลื่อนแปลน เลื่อนล้อเมาส์เพื่อซูม')}
              {toolBtn('place', '● วางโคม', 'เลือกรหัสโคม แล้วคลิกบนแปลน')}
              {toolBtn('line', '╱ วาดเส้น', 'คลิกทีละจุด ดับเบิลคลิกหรือ Enter เพื่อจบ')}
              {toolBtn('wire', '⌁ โยงวงจร', 'เลือกวงจร แล้วคลิกโคมตามลำดับ (คลิกซ้ำเพื่อเอาออก)')}
              {toolBtn('scale', '📏 ตั้งสเกล', 'คลิกสองจุดที่รู้ระยะจริง')}
            </div>
            <div className="toolrow undo">
              <button className="tool" disabled={!hist.canUndo} onClick={() => void undo()} title={hist.canUndo ? `ย้อนกลับ: ${hist.undoLabel} (Ctrl+Z)` : 'ยังไม่มีอะไรให้ย้อนกลับ'}>↶ ย้อนกลับ</button>
              <button className="tool" disabled={!hist.canRedo} onClick={() => void redo()} title={hist.canRedo ? `ทำซ้ำ: ${hist.redoLabel} (Ctrl+Y)` : 'ยังไม่มีอะไรให้ทำซ้ำ'}>↷ ทำซ้ำ</button>
            </div>
            {hist.canUndo && <div className="muted small undo-last" title="ขั้นล่าสุดที่จะย้อนกลับ">ล่าสุด: {hist.undoLabel}</div>}
            {tool === 'wire' ? (
              <>
                <div className="row between"><h4>วงจร</h4>
                  <button className="btn small" onClick={() => void run(async () => {
                    const nums = bundle.circuits.map((c) => parseInt(c.name.replace(/\D/g, ''), 10) || 0);
                    const res = await api<{ id: number }>('POST', `/api/projects/${bundle.project.id}/circuits`, { name: `LV-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}` });
                    setActiveCircuit(res.id);
                  })}>+ วงจรใหม่</button>
                </div>
                <p className="muted small">เลือกวงจรด้านล่าง แล้วคลิกโคมบนแปลนตามลำดับการเดินสาย คลิกซ้ำเพื่อเอาออกจากวงจร</p>
                <div className="list">
                  {bundle.circuits.map((c) => {
                    const n = bundle.placements.filter((p) => p.circuit_id === c.id).length + bundle.lines.filter((l) => l.circuit_id === c.id).length;
                    return (
                      <button key={c.id} className={`li ${c.id === activeCircuit ? 'on' : ''}`} onClick={() => setActiveCircuit(c.id)}>
                        <span className="dot" style={{ background: circuitColor(c.id) }} />
                        <Txt className="inl" value={c.name} onCommit={(v) => void run(() => api('PATCH', `/api/circuits/${c.id}`, { name: v }))} />
                        <span className="grow trunc muted small">{c.area}</span>
                        <span className="qty">{n}</span>
                      </button>
                    );
                  })}
                  {bundle.circuits.length === 0 && <div className="muted small">ยังไม่มีวงจร กด “+ วงจรใหม่”</div>}
                </div>
              </>
            ) : (
              <>
                <h4>รหัสโคม</h4>
                <div className="list">
                  {fxList.map((f) => (
                    <button key={f.id} className={`li ${f.id === activeFx && (tool === 'place' || tool === 'line') ? 'on' : ''}`} onClick={() => pickFixture(f)}>
                      <SymbolIcon kind={f.symbol} color={f.color} />
                      <span className="code">{f.code}</span>
                      <span className="grow trunc small">{f.name || f.model}</span>
                      <span className="qty">{qty(q[f.id]?.perFloor[floor.id] ?? 0)}</span>
                    </button>
                  ))}
                  {fxList.length === 0 && <div className="muted small">ยังไม่มีรหัสโคม — ไปที่แท็บ “สเปคโคม” เพื่อเพิ่ม</div>}
                </div>
              </>
            )}
          </aside>

          <div className="canvas-wrap">
            {!hasPlan ? (
              <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void doUpload(f); }}>
                <h3>อัปโหลดแปลน “{floor.name}”</h3>
                <p className="muted">ลากไฟล์มาวาง หรือเลือกไฟล์ — รองรับ PNG, JPG, PDF</p>
                <div className="row gap center-y">
                  <label className="muted small">PDF หน้าที่ <input className="w70" type="number" min={1} value={pdfPage} onChange={(e) => setPdfPage(e.target.value)} /></label>
                  <label className="btn primary">{busy ? 'กำลังอัปโหลด…' : 'เลือกไฟล์แปลน'}
                    <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doUpload(f); }} />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <svg
                  ref={svgRef}
                  className={`canvas tool-${tool}`}
                  viewBox={viewBox}
                  preserveAspectRatio="xMidYMid meet"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerLeave={() => setHover(null)}
                  onDoubleClick={() => tool === 'line' && finishLine(draft)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <rect x={0} y={0} width={iw} height={ih} fill="#fff" />
                  <image href={fileUrl(floor.plan_file)} x={0} y={0} width={iw} height={ih} opacity={floor.plan_opacity} style={floor.plan_gray ? { filter: 'grayscale(1)' } : undefined} />

                  {/* lines */}
                  {lines.map((l) => {
                    const f = fixtures.get(l.fixture_id);
                    if (!f) return null;
                    const pts = linePts(l);
                    const st = lineStyle(f.symbol, r);
                    const color = COLORS[f.color];
                    const heads = l.heads > 0 ? pointsAlong(pts, l.heads) : [];
                    const hf = l.head_fixture_id ? fixtures.get(l.head_fixture_id) : undefined;
                    const mid = pointsAlong(pts, 1)[0];
                    const len = floor ? lineLengthM(l, floor) : null;
                    return (
                      <g key={l.id}>
                        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={st.sw} strokeDasharray={st.dash?.join(' ')} strokeLinejoin="round" opacity={tool === 'wire' ? 0.6 : 1} />
                        {heads.map((h, i) => (
                          <g key={i} transform={`translate(${h.x} ${h.y}) rotate(${(h.ang * 180) / Math.PI + 90})`}>
                            <circle r={r * 0.5} fill={hf ? COLORS[hf.color] : color} />
                            <line x1={0} y1={0} x2={0} y2={r * 1.7} stroke={hf ? COLORS[hf.color] : color} strokeWidth={u} />
                          </g>
                        ))}
                        {mid && <text className="lbl" x={mid.x + r * 0.8} y={mid.y - r * 1.4} fontSize={r * 1.15} fill={LABEL_COLORS[f.color]}>{f.code}{len != null ? `  ${(Math.round(len * 10) / 10).toString()} m` : ''}</text>}
                        <polyline className="hit" points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="transparent" strokeWidth={r * 1.8} onPointerDown={(e) => onItemDown(e, 'l', l.id, l.circuit_id)} />
                        {has(sels, { k: 'l', id: l.id }) && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={SELECT_HALO} strokeWidth={st.sw + r * 0.9} opacity={0.6} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
                        {sel?.k === 'l' && sel.id === l.id && tool === 'select' && pts.map((p, i) => (
                          <circle key={i} className="vhandle" cx={p[0]} cy={p[1]} r={r * 0.6} fill="#fff" stroke={BRAND.ink} strokeWidth={u * 1.3} onPointerDown={(e) => onVertexDown(e, l.id, i, l.pts[i])} />
                        ))}
                      </g>
                    );
                  })}

                  {/* wiring */}
                  {wiring.map(({ c, pts }) => (
                    <g key={c.id} pointerEvents="none">
                      {pts.length > 1 && <path d={wiringPath(pts)} fill="none" stroke={circuitColor(c.id)} strokeWidth={u * 1.5} strokeDasharray={`${r * 1.1} ${r * 0.5}`} />}
                      <g transform={`translate(${pts[0][0]} ${pts[0][1] - r * 3.2})`}>
                        <rect x={-(c.name.length * r * 0.38 + r * 0.6)} y={-r * 0.9} width={c.name.length * r * 0.76 + r * 1.2} height={r * 1.8} rx={r * 0.4} fill={circuitColor(c.id)} />
                        <text textAnchor="middle" y={r * 0.42} fontSize={r * 1.15} fill={onColor(circuitColor(c.id))} fontWeight={600}>{c.name}</text>
                      </g>
                    </g>
                  ))}

                  {/* points */}
                  {placements.map((p) => {
                    const f = fixtures.get(p.fixture_id);
                    if (!f) return null;
                    const [cx, cy] = placementPos(p);
                    const color = COLORS[f.color];
                    const selected = has(sels, { k: 'p', id: p.id });
                    const inActive = tool === 'wire' && p.circuit_id === activeCircuit;
                    return (
                      <g key={p.id} opacity={tool === 'wire' && p.circuit_id == null ? 0.85 : 1}>
                        {inActive && !selected && <circle cx={cx} cy={cy} r={r * 2} fill={circuitColor(p.circuit_id)} opacity={0.25} pointerEvents="none" />}
                        {selected && (
                          <g pointerEvents="none">
                            <circle cx={cx} cy={cy} r={r * 2.1} fill={SELECT_HALO} opacity={0.55} />
                            <circle cx={cx} cy={cy} r={r * 2.1} fill="none" stroke={BRAND.ink} strokeWidth={u * 1.2} strokeDasharray={`${r * 0.45} ${r * 0.35}`} />
                          </g>
                        )}
                        <Prims prims={pointSymbol(f.symbol, cx, cy, r, symbolMeta(f.symbol).rotatable ? p.rot : 0, f.symbol === 'linear' ? linearLengthPx(f.length_m, floor.mpp, r) : undefined)} color={color} u={u} />
                        <text className="lbl" x={cx + r * 0.9} y={cy - r * 1.6} fontSize={r * 1.2} fill={LABEL_COLORS[f.color]}>{f.code}</text>
                        <circle className="hit" cx={cx} cy={cy} r={r * 1.9} fill="transparent" onPointerDown={(e) => onItemDown(e, 'p', p.id, p.circuit_id)} />
                        {f.symbol === 'linear' && (() => {
                          // the whole bar is clickable, not only its middle
                          const half = linearLengthPx(f.length_m, floor.mpp, r) / 2;
                          const a = (p.rot * Math.PI) / 180;
                          return <line className="hit" x1={cx - Math.cos(a) * half} y1={cy - Math.sin(a) * half} x2={cx + Math.cos(a) * half} y2={cy + Math.sin(a) * half} stroke="transparent" strokeWidth={r * 1.8} onPointerDown={(e) => onItemDown(e, 'p', p.id, p.circuit_id)} />;
                        })()}
                      </g>
                    );
                  })}

                  {/* selection box */}
                  {box && (() => {
                    const b = boxOf(box.a, box.b);
                    return <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill={SELECT_HALO} fillOpacity={0.15} stroke={BRAND.ink} strokeWidth={u} strokeDasharray={`${r * 0.5} ${r * 0.35}`} pointerEvents="none" />;
                  })()}

                  {/* drafts */}
                  {tool === 'line' && draft.length > 0 && (
                    <g pointerEvents="none">
                      <polyline points={[...draft, ...(hover ? [hover] : [])].map((p) => px(p).join(',')).join(' ')} fill="none" stroke={activeF ? COLORS[activeF.color] : BRAND.ink} strokeWidth={u * 1.6} strokeDasharray={`${r} ${r * 0.6}`} />
                      {draft.map((p, i) => <circle key={i} cx={p[0] * iw} cy={p[1] * ih} r={r * 0.45} fill="#fff" stroke={activeF ? COLORS[activeF.color] : BRAND.ink} strokeWidth={u} />)}
                    </g>
                  )}
                  {tool === 'scale' && scalePts.length > 0 && (
                    <g pointerEvents="none" stroke={BRAND.ink} strokeWidth={u * 1.6} strokeDasharray={`${r * 0.6} ${r * 0.4}`}>
                      <line x1={scalePts[0][0] * iw} y1={scalePts[0][1] * ih} x2={(scalePts[1] ?? hover ?? scalePts[0])[0] * iw} y2={(scalePts[1] ?? hover ?? scalePts[0])[1] * ih} />
                      {scalePts.map((p, i) => <circle key={i} cx={p[0] * iw} cy={p[1] * ih} r={r * 0.5} fill="#fff" />)}
                    </g>
                  )}
                </svg>
                <div className="hint">
                  {tool === 'select' && 'คลิกเลือก · Shift+คลิก/Shift+ลากกรอบ เลือกหลายจุด · ลากโคมเพื่อย้าย · ลากพื้นที่ว่างเพื่อเลื่อน · ล้อเมาส์ซูม · Delete ลบ · Ctrl+Z ย้อนกลับ'}
                  {tool === 'place' && (activeF ? `คลิกบนแปลนเพื่อวาง ${activeF.code} — Esc เพื่อออก` : 'เลือกรหัสโคมทางซ้ายก่อน')}
                  {tool === 'line' && (activeF ? `คลิกเพื่อเพิ่มจุด · ดับเบิลคลิก/Enter จบ · Esc ยกเลิก (${activeF.code})` : 'เลือกรหัสแบบเส้น (ไฟเส้น/ราง) ทางซ้ายก่อน')}
                  {tool === 'wire' && 'คลิกโคมตามลำดับการเดินสาย — คลิกซ้ำเพื่อเอาออกจากวงจร'}
                  {tool === 'scale' && 'คลิกสองจุดที่รู้ระยะจริง (เช่น ความกว้างห้อง) แล้วกรอกระยะเป็นเมตร'}
                </div>
                {tool === 'scale' && scalePts.length === 2 && (
                  <div className="floating card">
                    <b>ระยะจริงระหว่างสองจุด (เมตร)</b>
                    <div className="row gap"><input type="number" step="any" autoFocus value={meters} onChange={(e) => setMeters(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitScale()} placeholder="เช่น 3.5" />
                      <button className="btn primary" disabled={!(Number(meters) > 0)} onClick={submitScale}>ตั้งสเกล</button>
                      <button className="btn" onClick={() => setScalePts([])}>วัดใหม่</button></div>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="inspector">
            <FloorPanel floor={floor} hasPlan={hasPlan} busy={busy} onUpload={doUpload} pdfPage={pdfPage} setPdfPage={setPdfPage} run={run} edit={edit}
              onDeleted={() => { hist.clear(); bump(); setFloorId(null); }} />
            {selP && (
              <PlacementPanel p={selP} fixtures={fxList.filter((f) => !isLineSymbol(f.symbol))} fixture={fixtures.get(selP.fixture_id)} circuits={bundle.circuits} edit={edit} onDelete={() => void deleteItem('p', selP.id).then(() => setSel(null))} />
            )}
            {selL && <LinePanel l={selL} floor={floor} fixtures={fxList} circuits={bundle.circuits} edit={edit} onDelete={() => void deleteItem('l', selL.id).then(() => setSel(null))} />}
            {sels.length > 1 && (
              <MultiPanel
                points={sels.filter((x) => x.k === 'p').map((x) => pointOf(x.id)).filter((p): p is Placement => !!p)}
                lines={sels.filter((x) => x.k === 'l').map((x) => lineOf(x.id)).filter((l): l is LineEl => !!l)}
                fixtures={fxList} circuits={bundle.circuits} project={bundle.project.id} codeOf={codeOf} editMany={editMany}
                onDelete={() => void deleteItems(sels).then(() => setSels([]))} onClear={() => setSels([])}
              />
            )}
            {sels.length === 0 && <div className="card small muted">คลิกโคมหรือเส้นบนแปลนเพื่อแก้ไข เปลี่ยนรหัสโคม หมุนทิศ หรือย้ายวงจร — Shift+คลิก หรือ Shift+ลากกรอบ เพื่อเลือกหลายจุด, Ctrl+A เลือกทั้งชั้น</div>}
          </aside>
        </div>
      )}
    </div>
  );
}

function clampView(v: { x: number; y: number; z: number }, iw: number, ih: number) {
  const w = iw / v.z;
  const h = ih / v.z;
  return { z: v.z, x: Math.min(Math.max(v.x, 0), iw - w), y: Math.min(Math.max(v.y, 0), ih - h) };
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;
/** Performs an edit through the undo history; resolves to the new id for a create. */
type EditFn = (e: Edit) => Promise<number | null>;

function FloorPanel({ floor, hasPlan, busy, onUpload, pdfPage, setPdfPage, run, edit, onDeleted }: { floor: Floor; hasPlan: boolean; busy: boolean; onUpload: (f: File) => void; pdfPage: string; setPdfPage: (v: string) => void; run: Run; edit: EditFn; onDeleted: () => void }) {
  const look = (after: { plan_gray?: boolean; plan_opacity?: number }, label: string, merge?: string) =>
    void edit({ t: 'patch', e: 'floor', id: floor.id, before: { plan_gray: !!floor.plan_gray, plan_opacity: floor.plan_opacity }, after, label, merge });
  return (
    <div className="card">
      <h4>ชั้น</h4>
      <Txt value={floor.name} onCommit={(v) => void edit({ t: 'patch', e: 'floor', id: floor.id, before: { name: floor.name }, after: { name: v }, label: 'เปลี่ยนชื่อชั้น' })} />
      <div className="row gap wrap mt">
        <label className="btn small">{busy ? 'กำลังอัปโหลด…' : hasPlan ? 'เปลี่ยนแปลน' : 'อัปโหลดแปลน'}
          <input type="file" hidden accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
        </label>
        <label className="muted small">PDF หน้า <input className="w50" type="number" min={1} value={pdfPage} onChange={(e) => setPdfPage(e.target.value)} /></label>
      </div>
      {hasPlan && <p className="muted small">การเปลี่ยนแปลนจะล้างสเกลของชั้นนี้ (ต้องตั้งสเกลใหม่) ส่วนโคมที่วางไว้ยังอยู่</p>}
      {hasPlan && (
        <div className="stylebox">
          <h4>การแสดงแปลน <span className="muted small">(เว็บและ PDF)</span></h4>
          <label className="row gap small">
            <input type="checkbox" checked={!!floor.plan_gray} onChange={(e) => look({ plan_gray: e.target.checked }, e.target.checked ? 'แปลนขาวดำ' : 'แปลนสีเดิม')} />
            ขาวดำ (Greyscale)
          </label>
          <label className="row gap small mt">
            ความทึบ
            <input type="range" min={0.1} max={1} step={0.05} value={floor.plan_opacity} onChange={(e) => look({ plan_opacity: Number(e.target.value) }, 'ความทึบแปลน', `opacity:${floor.id}`)} />
            <span className="code">{Math.round(floor.plan_opacity * 100)}%</span>
          </label>
          {(floor.plan_gray !== 1 || floor.plan_opacity !== 0.5) && (
            <button className="btn small mt" onClick={() => look({ plan_gray: true, plan_opacity: 0.5 }, 'แปลนค่าเริ่มต้น')}>ค่าเริ่มต้น (ขาวดำ 50%)</button>
          )}
        </div>
      )}
      <ConfirmButton label="ลบชั้นนี้" confirm="ยืนยัน: ลบชั้นพร้อมโคมทั้งหมด" onConfirm={() => void run(async () => { await api('DELETE', `/api/floors/${floor.id}`); onDeleted(); })} />
    </div>
  );
}

function CircuitSelect({ value, circuits, onChange }: { value: number | null; circuits: { id: number; name: string }[]; onChange: (id: number | null) => void }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">— ยังไม่ระบุ —</option>
      {circuits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function FixtureStyle({ f, edit }: { f: Fixture; edit: EditFn }) {
  const pointKinds = SYMBOLS.filter((s) => s.geometry === (isLineSymbol(f.symbol) ? 'line' : 'point'));
  const set = (k: 'color' | 'symbol', v: string, label: string) => {
    if (f[k] !== v) void edit({ t: 'patch', e: 'fixture', id: f.id, before: { [k]: f[k] }, after: { [k]: v }, label: `${label} ${f.code}` });
  };
  return (
    <div className="stylebox">
      <div className="muted small">สัญลักษณ์ของรหัส {f.code} (มีผลกับทุกจุดที่ใช้รหัสนี้)</div>
      <div className="row gap center-y wrap">
        {(Object.keys(COLORS) as ColorKey[]).map((c) => (
          <button key={c} className={`swatch ${f.color === c ? 'on' : ''}`} style={{ background: COLORS[c] }} title={COLOR_LABEL[c]} aria-label={COLOR_LABEL[c]} onClick={() => set('color', c, 'เปลี่ยนสี')} />
        ))}
      </div>
      <div className="symgrid small">
        {pointKinds.map((s) => (
          <button key={s.kind} className={`sym ${f.symbol === s.kind ? 'on' : ''}`} onClick={() => set('symbol', s.kind, 'เปลี่ยนสัญลักษณ์')}>
            <SymbolIcon kind={s.kind} color={f.color} size={26} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlacementPanel({ p, fixtures, fixture, circuits, edit, onDelete }: { p: Placement; fixtures: Fixture[]; fixture?: Fixture; circuits: { id: number; name: string }[]; edit: EditFn; onDelete: () => void }) {
  const rot = fixture ? symbolMeta(fixture.symbol).rotatable : false;
  const code = fixture?.code ?? '';
  const set = (before: Record<string, unknown>, after: Record<string, unknown>, label: string, merge?: string) =>
    void edit({ t: 'patch', e: 'p', id: p.id, before, after, label: `${label} ${code}`, merge });
  return (
    <div className="card">
      <div className="row between"><h4>จุดที่เลือก {fixture && <FixtureChip f={fixture} />}</h4></div>
      <label className="field"><span>เปลี่ยนโคม (รหัส)</span>
        <select value={p.fixture_id} onChange={(e) => set({ fixture_id: p.fixture_id }, { fixture_id: Number(e.target.value) }, 'เปลี่ยนรหัส')}>
          {fixtures.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name || f.model}</option>)}
        </select>
      </label>
      <label className="field"><span>วงจร</span>
        <CircuitSelect value={p.circuit_id} circuits={circuits} onChange={(id) => set({ circuit_id: p.circuit_id, circuit_order: p.circuit_order }, { circuit_id: id }, 'ย้ายวงจร')} />
      </label>
      {rot && (
        <label className="field"><span>ทิศทาง {Math.round(p.rot)}°</span>
          <input type="range" min={0} max={359} value={p.rot} onChange={(e) => set({ rot: p.rot }, { rot: Number(e.target.value) }, 'หมุน', `rot:${p.id}`)} />
        </label>
      )}
      {fixture && <FixtureStyle f={fixture} edit={edit} />}
      <ConfirmButton label="ลบจุดนี้" onConfirm={onDelete} />
    </div>
  );
}

function LinePanel({ l, floor, fixtures, circuits, edit, onDelete }: { l: LineEl; floor: Floor; fixtures: Fixture[]; circuits: { id: number; name: string }[]; edit: EditFn; onDelete: () => void }) {
  const f = fixtures.find((x) => x.id === l.fixture_id);
  const len = lineLengthM(l, floor);
  const isTrack = f?.symbol === 'track';
  const set = (before: Record<string, unknown>, after: Record<string, unknown>, label: string) =>
    void edit({ t: 'patch', e: 'l', id: l.id, before, after, label: `${label} ${f?.code ?? ''}` });
  return (
    <div className="card">
      <h4>เส้นที่เลือก {f && <FixtureChip f={f} />}</h4>
      <div className="muted small">ความยาว: {len != null ? `${(Math.round(len * 100) / 100).toString()} ม.` : 'ยังไม่ตั้งสเกล (ใช้ 📏 ตั้งสเกลก่อน)'}</div>
      <label className="field"><span>รหัสของเส้น</span>
        <select value={l.fixture_id} onChange={(e) => set({ fixture_id: l.fixture_id }, { fixture_id: Number(e.target.value) }, 'เปลี่ยนรหัสเส้น')}>
          {fixtures.filter((x) => isLineSymbol(x.symbol)).map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name || x.model}</option>)}
        </select>
      </label>
      {isTrack && (
        <>
          <label className="field"><span>จำนวนหัวสปอตบนราง</span>
            <Txt type="number" value={l.heads} onCommit={(v) => set({ heads: l.heads }, { heads: Number(v) || 0 }, 'จำนวนหัวสปอต')} />
          </label>
          <label className="field"><span>รหัสโคมของหัวสปอต</span>
            <select value={l.head_fixture_id ?? ''} onChange={(e) => set({ head_fixture_id: l.head_fixture_id }, { head_fixture_id: e.target.value ? Number(e.target.value) : null }, 'รหัสหัวสปอต')}>
              <option value="">— ไม่ระบุ —</option>
              {fixtures.filter((x) => !isLineSymbol(x.symbol)).map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name || x.model}</option>)}
            </select>
          </label>
        </>
      )}
      <label className="field"><span>วงจร</span>
        <CircuitSelect value={l.circuit_id} circuits={circuits} onChange={(id) => set({ circuit_id: l.circuit_id, circuit_order: l.circuit_order }, { circuit_id: id }, 'ย้ายวงจร')} />
      </label>
      {f && <FixtureStyle f={f} edit={edit} />}
      <ConfirmButton label="ลบเส้นนี้" onConfirm={onDelete} />
    </div>
  );
}

/** Inspector for several selected items: one action applies to all of them as a single undo step. */
function MultiPanel({ points, lines, fixtures, circuits, project, codeOf, editMany, onDelete, onClear }: {
  points: Placement[]; lines: LineEl[]; fixtures: Fixture[]; circuits: { id: number; name: string }[]; project: number;
  codeOf: (fixtureId: number) => string; editMany: (parts: Single[], label: string) => Promise<number | null>; onDelete: () => void; onClear: () => void;
}) {
  const n = points.length + lines.length;
  const codes = [...new Set([...points, ...lines].map((x) => codeOf(x.fixture_id)))].sort();

  const wire = (v: string) => {
    if (!v) return;
    const to = v === 'none' ? null : Number(v);
    const name = circuits.find((c) => c.id === to)?.name ?? '';
    // points in a sensible cable run (nearest neighbour from the top-left), then lines
    const items: (Placement | LineEl)[] = [...wiringOrder(points), ...lines];
    const parts: Single[] = items
      .filter((x) => to != null || x.circuit_id != null)
      .map((x) => ({
        t: 'assign', e: 'x' in x ? 'p' : 'l', id: x.id, project, to,
        before: { circuit_id: x.circuit_id, circuit_order: x.circuit_order },
        label: to ? `โยง ${codeOf(x.fixture_id)} เข้า ${name}` : `เอา ${codeOf(x.fixture_id)} ออกจากวงจร`,
      }));
    void editMany(parts, to ? `โยง ${parts.length} รายการเข้า ${name}` : `เอา ${parts.length} รายการออกจากวงจร`);
  };

  const recode = (kind: 'p' | 'l', v: string) => {
    const fid = Number(v);
    if (!fid) return;
    const list: (Placement | LineEl)[] = kind === 'p' ? points : lines;
    const parts: Single[] = list
      .filter((x) => x.fixture_id !== fid)
      .map((x) => ({ t: 'patch', e: kind, id: x.id, before: { fixture_id: x.fixture_id }, after: { fixture_id: fid }, label: `เปลี่ยนรหัสเป็น ${codeOf(fid)}` }));
    void editMany(parts, `เปลี่ยน ${parts.length} รายการเป็น ${codeOf(fid)}`);
  };

  return (
    <div className="card">
      <div className="row between">
        <h4>เลือก {points.length ? `${points.length} จุด` : ''}{points.length && lines.length ? ' · ' : ''}{lines.length ? `${lines.length} เส้น` : ''}</h4>
        <button className="btn small ghost" onClick={onClear}>ยกเลิกการเลือก</button>
      </div>
      <div className="muted small">{codes.join(', ')}</div>
      <p className="muted small">ลากจุดใดก็ได้ในกลุ่มเพื่อย้ายทั้งหมด · ทุกคำสั่งด้านล่างย้อนกลับได้ในครั้งเดียว (Ctrl+Z)</p>
      <label className="field"><span>ย้ายเข้าวงจร (เรียงลำดับเดินสายจากบนซ้ายตามจุดที่ใกล้ที่สุด)</span>
        <select value="" onChange={(e) => wire(e.target.value)}>
          <option value="">— เลือกวงจร —</option>
          {circuits.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">เอาออกจากวงจร</option>
        </select>
      </label>
      {points.length > 0 && (
        <label className="field"><span>เปลี่ยนรหัสโคมของ {points.length} จุด</span>
          <select value="" onChange={(e) => recode('p', e.target.value)}>
            <option value="">— เลือกรหัส —</option>
            {fixtures.filter((f) => !isLineSymbol(f.symbol)).map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name || f.model}</option>)}
          </select>
        </label>
      )}
      {lines.length > 0 && (
        <label className="field"><span>เปลี่ยนรหัสของ {lines.length} เส้น</span>
          <select value="" onChange={(e) => recode('l', e.target.value)}>
            <option value="">— เลือกรหัส —</option>
            {fixtures.filter((f) => isLineSymbol(f.symbol)).map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name || f.model}</option>)}
          </select>
        </label>
      )}
      <ConfirmButton label={`ลบ ${n} รายการ`} confirm={`ยืนยัน: ลบ ${n} รายการ`} onConfirm={onDelete} />
    </div>
  );
}
