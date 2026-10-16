import { useRef, useState } from 'react';
import { api, fileUrl } from '../api';
import { SHEET_RATIO, canvasItems, cropPlacement } from '../../../shared/moodboard';
import type { MoodImage, Moodboard } from '../../../shared/types';
import { Txt } from '../ui';

type Frame = { x: number; y: number; w: number; h: number };
type Crop = { crop_x: number; crop_y: number; crop_w: number; crop_h: number };
type Edge = 'l' | 'r' | 't' | 'b';
/** What a drag is doing: moving, resizing from the bottom-right corner, or cropping one edge. */
type Drag = { id: number; kind: 'move' | 'resize' | Edge; sx: number; sy: number; frame: Frame; crop: Crop; free: boolean };

const pct = (n: number) => `${n * 100}%`;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Collage board: images are moved, resized, layered and cropped by hand, and backgrounds can be removed.
 * Positions are fractions of the sheet, the same numbers the PDF uses, so what is on screen is what prints.
 */
export function MoodCanvas({ mb, run, toast }: { mb: Moodboard; run: (fn: () => Promise<unknown>) => Promise<void>; toast: (m: string) => void }) {
  const sheet = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [cropping, setCropping] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  // live geometry while dragging (saved on release), keyed by image id
  const [live, setLive] = useState<Record<number, { frame: Frame; crop: Crop }>>({});
  const [busy, setBusy] = useState('');
  const items = canvasItems(mb.images).map(({ img, frame }) => ({ img, frame: live[img.id]?.frame ?? frame, crop: live[img.id]?.crop ?? { crop_x: img.crop_x, crop_y: img.crop_y, crop_w: img.crop_w, crop_h: img.crop_h } }));
  const cur = items.find((i) => i.img.id === sel) ?? null;

  const save = (img: MoodImage, body: Record<string, unknown>) => run(() => api('PATCH', `/api/moodboard-images/${img.id}`, body));
  const layer = (img: MoodImage, op: string) => run(() => api('POST', `/api/moodboard-images/${img.id}/layer`, { op }));

  const start = (e: React.PointerEvent, it: (typeof items)[number], kind: Drag['kind']) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSel(it.img.id);
    setDrag({ id: it.img.id, kind, sx: e.clientX, sy: e.clientY, frame: it.frame, crop: it.crop, free: e.shiftKey });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !sheet.current) return;
    const r = sheet.current.getBoundingClientRect();
    const dx = (e.clientX - drag.sx) / r.width;
    const dy = (e.clientY - drag.sy) / r.height;
    const f = { ...drag.frame };
    const c = { ...drag.crop };
    const fullW = f.w / c.crop_w; // the whole image's width in sheet fractions (constant while cropping)
    const fullH = f.h / c.crop_h;
    if (drag.kind === 'move') {
      f.x = clamp(f.x + dx, -f.w * 0.8, 1 - f.w * 0.2);
      f.y = clamp(f.y + dy, -f.h * 0.8, 1 - f.h * 0.2);
    } else if (drag.kind === 'resize') {
      // keep the shape unless Shift is held
      const w = clamp(f.w + dx, 0.04, 2);
      const h = drag.free || e.shiftKey ? clamp(f.h + dy, 0.04, 2) : (w * f.h) / f.w;
      f.w = w;
      f.h = h;
    } else if (drag.kind === 'l') {
      const d = clamp(dx / fullW, -c.crop_x, c.crop_w - 0.05);
      c.crop_x += d; c.crop_w -= d; f.x += d * fullW; f.w -= d * fullW;
    } else if (drag.kind === 'r') {
      const d = clamp(dx / fullW, 0.05 - c.crop_w, 1 - c.crop_x - c.crop_w);
      c.crop_w += d; f.w += d * fullW;
    } else if (drag.kind === 't') {
      const d = clamp(dy / fullH, -c.crop_y, c.crop_h - 0.05);
      c.crop_y += d; c.crop_h -= d; f.y += d * fullH; f.h -= d * fullH;
    } else {
      const d = clamp(dy / fullH, 0.05 - c.crop_h, 1 - c.crop_y - c.crop_h);
      c.crop_h += d; f.h += d * fullH;
    }
    setLive((l) => ({ ...l, [drag.id]: { frame: f, crop: c } }));
  };
  const end = () => {
    if (!drag) return;
    const g = live[drag.id];
    const img = mb.images.find((i) => i.id === drag.id);
    setDrag(null);
    if (!g || !img) return;
    void save(img, { ...g.frame, ...g.crop }).then(() => setLive((l) => { const n = { ...l }; delete n[drag.id]; return n; }));
  };

  const cutout = async (img: MoodImage, level: string) => {
    setBusy(level);
    await run(async () => {
      const r = await api<{ removed: number }>('POST', `/api/moodboard-images/${img.id}/cutout`, { level });
      toast(`ลบพื้นหลังแล้ว (${r.removed}% ของภาพ) ถ้ายังเหลือขอบ ลองระดับที่มากขึ้น`);
    });
    setBusy('');
  };

  return (
    <div className="canvasgrid">
      <div ref={sheet} className="moodsheet canvasmode" style={{ aspectRatio: String(SHEET_RATIO) }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={() => { setSel(null); setCropping(false); }}>
        {items.length === 0 && <div className="canvashint">กด “+ เพิ่มรูป” แล้วลากจัดวางได้อิสระ ซ้อนกันได้แบบ collage</div>}
        {items.map((it, k) => {
          const on = it.img.id === sel;
          const at = cropPlacement({ x: 0, y: 0, w: 1, h: 1 }, it.crop);
          return (
            <div key={it.img.id} className={`citem ${on ? 'on' : ''} ${on && cropping ? 'cropping' : ''}`} style={{ left: pct(it.frame.x), top: pct(it.frame.y), width: pct(it.frame.w), height: pct(it.frame.h), zIndex: k + 1 }}
              onPointerDown={(e) => start(e, it, 'move')}>
              <div className="cclip">
                <img src={fileUrl(it.img.cutout ?? it.img.file)} alt={it.img.caption || `รูป ${k + 1}`} draggable={false} style={{ left: pct(at.x), top: pct(at.y), width: pct(at.w), height: pct(at.h) }} />
              </div>
              {on && cropping && (['l', 'r', 't', 'b'] as Edge[]).map((edge) => <span key={edge} className={`crophandle ${edge}`} onPointerDown={(e) => start(e, it, edge)} aria-label="ลากเพื่อตัดขอบ" />)}
              {on && !cropping && <span className="sizehandle" onPointerDown={(e) => start(e, it, 'resize')} aria-label="ลากเพื่อย่อขยาย (Shift = ไม่ล็อกสัดส่วน)" />}
            </div>
          );
        })}
      </div>

      <aside className="card canvaspanel">
        {!cur ? (
          <p className="muted small">คลิกรูปบนบอร์ดเพื่อเลือก · ลากเพื่อย้าย · ลากมุมขวาล่างเพื่อย่อขยาย (กด Shift ค้างไว้ถ้าไม่ต้องการล็อกสัดส่วน) · รูปที่อยู่ชั้นบนจะทับรูปชั้นล่าง</p>
        ) : (
          <>
            <h4>รูปที่เลือก</h4>
            <div className="toolgrid">
              <button className="btn small" onClick={() => layer(cur.img, 'front')} title="ไว้บนสุด">⤒ บนสุด</button>
              <button className="btn small" onClick={() => layer(cur.img, 'up')} title="ขึ้น 1 ชั้น">↑ ขึ้น 1 ชั้น</button>
              <button className="btn small" onClick={() => layer(cur.img, 'down')} title="ลง 1 ชั้น">↓ ลง 1 ชั้น</button>
              <button className="btn small" onClick={() => layer(cur.img, 'back')} title="ไว้ล่างสุด">⤓ ล่างสุด</button>
            </div>
            <h4 className="mt">ตัดภาพ (crop)</h4>
            <div className="toolgrid">
              <button className={`btn small ${cropping ? 'primary' : ''}`} onClick={() => setCropping((c) => !c)}>{cropping ? 'เสร็จ' : '✂ ตัดขอบภาพ'}</button>
              <button className="btn small" disabled={cur.crop.crop_w === 1 && cur.crop.crop_h === 1}
                onClick={() => save(cur.img, { crop_x: 0, crop_y: 0, crop_w: 1, crop_h: 1, ...cropPlacement(cur.frame, cur.crop) })}>คืนภาพเต็ม</button>
            </div>
            {cropping && <p className="muted small">ลากแถบที่ขอบทั้ง 4 ด้านของรูปเพื่อตัด</p>}
            <h4 className="mt">ลบพื้นหลัง</h4>
            <p className="muted small">เหมาะกับรูปสินค้าพื้นหลังสีเรียบ (ขาว เทา หรือสีเดียว)</p>
            <div className="toolgrid">
              {[['low', 'น้อย'], ['medium', 'กลาง'], ['high', 'มาก']].map(([k, th]) => (
                <button key={k} className="btn small" disabled={!!busy} onClick={() => cutout(cur.img, k)}>{busy === k ? 'กำลังทำ…' : th}</button>
              ))}
              {cur.img.cutout && <button className="btn small" onClick={() => run(() => api('POST', `/api/moodboard-images/${cur.img.id}/cutout`, { off: true }))}>ใช้รูปเดิม</button>}
            </div>
            <label className="field mt"><span>คำอธิบายใต้รูป (ไม่บังคับ)</span><Txt value={cur.img.caption} onCommit={(v) => save(cur.img, { caption: v })} /></label>
            <button className="btn small danger mt" onClick={() => run(async () => { await api('DELETE', `/api/moodboard-images/${cur.img.id}`); setSel(null); })}>ลบรูปนี้</button>
          </>
        )}
        <h4 className="mt">ชั้น (บนสุดอยู่บน)</h4>
        <div className="list">
          {items.slice().reverse().map((it) => (
            <button key={it.img.id} className={`li ${it.img.id === sel ? 'on' : ''}`} onClick={() => setSel(it.img.id)}>
              <span className="thumb small"><img src={fileUrl(it.img.cutout ?? it.img.file)} alt="" /></span>
              <span className="grow trunc small">{it.img.caption || `รูป ${it.img.slot + 1}`}</span>
              {it.img.cutout && <span className="tag">ตัดพื้นหลัง</span>}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
