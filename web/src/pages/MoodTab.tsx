import { useRef, useState } from 'react';
import { api, fileUrl, upload } from '../api';
import { AUTO, CANVAS, SHEET_RATIO, TEMPLATES, placeImages, slotsFor, type Slot } from '../../../shared/moodboard';
import { MoodCanvas } from './MoodCanvas';
import type { Moodboard } from '../../../shared/types';
import { ConfirmButton, Empty, Txt } from '../ui';
import type { TabProps } from './common';


/** Mood board (MB): pick a template and drop images into its slots, or add images and let the layout follow. Printed right after the cover. */
export function MoodTab({ bundle, reload, toast }: TabProps) {
  const boards = bundle.moodboards ?? [];
  const [sel, setSel] = useState<number | null>(boards[0]?.id ?? null);
  const mb = boards.find((b) => b.id === sel) ?? boards[0] ?? null;
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const add = () => run(async () => setSel((await api<{ id: number }>('POST', `/api/projects/${bundle.project.id}/moodboards`, { title: `Mood board ${boards.length + 1}`, template: AUTO })).id));

  return (
    <main className="split">
      <aside className="side">
        <div className="row between">
          <div>
            <div className="eyebrow">MB · Mood board</div>
            <h3 style={{ margin: 0 }}>บอร์ด ({boards.length})</h3>
          </div>
          <button className="btn primary small" onClick={add}>+ บอร์ดใหม่</button>
        </div>
        <p className="muted small">ใน PDF แต่ละบอร์ดอยู่ถัดจากหน้าปก ตามลำดับนี้ บอร์ดที่ยังไม่มีรูปจะไม่ถูกพิมพ์</p>
        <div className="list">
          {boards.map((b) => (
            <button key={b.id} className={`li ${b.id === mb?.id ? 'on' : ''}`} onClick={() => setSel(b.id)}>
              <MiniLayout slots={slotsFor(b.template, Math.max(1, b.images.length))} filled={b.images.length} />
              <span className="grow trunc">{b.title}</span>
              <span className="qty">{b.images.length} รูป</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="detail" style={{ maxWidth: 1280 }}>
        {!mb ? (
          <Empty>ยังไม่มี mood board กด “+ บอร์ดใหม่” แล้วเลือกเทมเพลตหรือให้จัดหน้าอัตโนมัติ</Empty>
        ) : (
          <Board key={mb.id} mb={mb} run={run} toast={toast} onDeleted={() => setSel(null)} />
        )}
      </section>
    </main>
  );
}

/** Small preview of a layout (template picker, board list). */
function MiniLayout({ slots, filled = 0, w = 44 }: { slots: Slot[]; filled?: number; w?: number }) {
  const h = w / SHEET_RATIO;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="minilayout">
      {slots.map((s, i) => <rect key={i} x={s.x * w + 1} y={s.y * h + 1} width={s.w * w - 2} height={s.h * h - 2} fill={i < filled ? 'var(--line-c)' : 'var(--white)'} stroke="var(--ink)" strokeWidth={1} />)}
    </svg>
  );
}

function Board({ mb, run, toast, onDeleted }: { mb: Moodboard; run: (fn: () => Promise<unknown>) => Promise<void>; toast: (m: string) => void; onDeleted: () => void }) {
  const set = (k: string) => (v: string) => run(() => api('PATCH', `/api/moodboards/${mb.id}`, { [k]: v }));
  const canvas = mb.template === CANVAS;
  const auto = mb.template === AUTO || canvas;
  const placed = placeImages(mb.template, mb.images);
  const hidden = auto ? 0 : mb.images.filter((i) => i.slot >= placed.length).length;
  const many = useRef<HTMLInputElement>(null);
  const one = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null); // slot that the file chooser fills
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const images = (files: FileList | File[]) => [...files].filter((f) => f.type.startsWith('image/'));
  const put = async (files: File[], slot: number | null) => {
    if (!files.length) return;
    setBusy(true);
    await run(async () => {
      if (slot != null) {
        // first file into the slot, the rest into the next free slots (or appended, in automatic layout)
        await upload(`/api/moodboards/${mb.id}/images?slot=${slot}`, files[0]);
        for (const f of files.slice(1)) await upload(`/api/moodboards/${mb.id}/images`, f);
      } else for (const f of files) await upload(`/api/moodboards/${mb.id}/images`, f);
      if (files.length > 1) toast(`เพิ่ม ${files.length} รูปแล้ว`);
    });
    setBusy(false);
  };
  const onDrop = (e: React.DragEvent, slot: number | null) => {
    e.preventDefault();
    setOver(null);
    const from = e.dataTransfer.getData('text/x-kp-slot');
    if (from !== '' && slot != null) {
      if (Number(from) !== slot) void run(() => api('POST', `/api/moodboards/${mb.id}/move`, { from: Number(from), to: slot }));
      return;
    }
    // automatic layout: new files are added to the end; templates: the file goes into the slot it was dropped on
    void put(images(e.dataTransfer.files), auto ? null : slot);
  };

  return (
    <>
      <div className="row between">
        <Txt className="titleinput" value={mb.title} onCommit={set('title')} />
        <ConfirmButton label="ลบบอร์ดนี้" onConfirm={() => run(async () => { await api('DELETE', `/api/moodboards/${mb.id}`); onDeleted(); })} />
      </div>
      <div className="card">
        <h4>รูปแบบหน้า</h4>
        <div className="tpls">
          <button className={`tpl ${mb.template === AUTO ? 'on' : ''}`} onClick={() => set('template')(AUTO)}>
            <MiniLayout slots={slotsFor(AUTO, Math.max(3, mb.images.length))} w={70} />
            <span>จัดหน้าอัตโนมัติ</span>
          </button>
          <button className={`tpl ${canvas ? 'on' : ''}`} onClick={() => set('template')(CANVAS)}>
            <MiniLayout slots={[{ x: 0.05, y: 0.1, w: 0.45, h: 0.6 }, { x: 0.38, y: 0.3, w: 0.35, h: 0.55 }, { x: 0.65, y: 0.08, w: 0.3, h: 0.45 }]} filled={3} w={70} />
            <span>Canvas · จัดเอง ซ้อนชั้นได้</span>
          </button>
          {TEMPLATES.map((t) => (
            <button key={t.key} className={`tpl ${mb.template === t.key ? 'on' : ''}`} onClick={() => set('template')(t.key)}>
              <MiniLayout slots={t.slots} w={70} />
              <span>{t.th} · {t.slots.length} ช่อง</span>
            </button>
          ))}
        </div>
        <p className="muted small">{canvas ? 'วางรูปได้อิสระ ลากย้าย ย่อขยาย ซ้อนชั้นแบบ collage ตัดขอบภาพ และลบพื้นหลังได้' : auto ? 'เพิ่มรูปกี่รูปก็ได้ ระบบจัดหน้าให้ตามจำนวนรูป ลากรูปสลับลำดับได้' : 'ลากรูปจากเครื่องมาวางในช่อง หรือคลิกช่องว่างเพื่อเลือกไฟล์ ลากรูปไปช่องอื่นเพื่อสลับ'}</p>
        {hidden > 0 && <div className="banner">มี {hidden} รูปที่เกินจำนวนช่องของเทมเพลตนี้ จึงไม่แสดงและไม่พิมพ์ เลือกเทมเพลตที่มีช่องมากขึ้นหรือจัดหน้าอัตโนมัติ</div>}
        <div className="row gap wrap">
          <button className="btn primary" disabled={busy} onClick={() => many.current?.click()}>{busy ? 'กำลังอัปโหลด…' : '+ เพิ่มรูป (เลือกได้หลายรูป)'}</button>
          <input ref={many} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = images(e.target.files ?? []); e.target.value = ''; void put(f, null); }} />
          <input ref={one} type="file" accept="image/*" hidden onChange={(e) => { const f = images(e.target.files ?? []); e.target.value = ''; void put(f, target); }} />
        </div>
      </div>

      {canvas ? (
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void put(images(e.dataTransfer.files), null); }}>
          <MoodCanvas mb={mb} run={run} toast={toast} />
        </div>
      ) : (
      <div className="moodsheet" style={{ aspectRatio: String(SHEET_RATIO) }} onDragOver={(e) => auto && e.preventDefault()} onDrop={(e) => auto && onDrop(e, null)}>
        {placed.length === 0 && (
          <button className="moodslot empty" style={{ left: 0, top: 0, width: '100%', height: '100%' }} onClick={() => many.current?.click()}>
            วางรูปที่นี่ หรือคลิกเพื่อเลือกหลายรูป · Drop images here
          </button>
        )}
        {placed.map(({ slot, index, image }) => {
          const style = { left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.w * 100}%`, height: `${slot.h * 100}%` };
          const dropProps = {
            onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setOver(index); },
            onDragLeave: () => setOver((o) => (o === index ? null : o)),
            onDrop: (e: React.DragEvent) => { e.stopPropagation(); onDrop(e, auto ? image?.slot ?? index : index); },
          };
          if (!image) {
            return (
              <button key={index} className={`moodslot empty ${over === index ? 'over' : ''}`} style={style} {...dropProps} onClick={() => { setTarget(index); one.current?.click(); }}>
                ช่อง {index + 1}<br /><span className="small">ลากรูปมาวาง หรือคลิก</span>
              </button>
            );
          }
          return (
            <div key={image.id} className={`moodslot ${over === index ? 'over' : ''}`} style={style} draggable {...dropProps}
              onDragStart={(e) => e.dataTransfer.setData('text/x-kp-slot', String(image.slot))}>
              <img src={fileUrl(image.cutout ?? image.file)} alt={image.caption || `รูปที่ ${index + 1}`} draggable={false} />
              <div className="moodbar">
                <Txt className="cap" value={image.caption} placeholder="คำอธิบาย (ไม่บังคับ)" onCommit={(v) => run(() => api('PATCH', `/api/moodboard-images/${image.id}`, { caption: v }))} />
                <button className="btn small" title="เปลี่ยนรูป" onClick={() => { setTarget(auto ? image.slot : index); one.current?.click(); }}>เปลี่ยน</button>
                <button className="btn small danger" title="ลบรูป" onClick={() => run(() => api('DELETE', `/api/moodboard-images/${image.id}`))}>ลบ</button>
              </div>
            </div>
          );
        })}
      </div>
      )}
      <div className="card mt">
        <label className="field"><span>หมายเหตุใต้บอร์ด (พิมพ์ใน PDF)</span><Txt value={mb.note} placeholder="เช่น โทนสีหลัก วัสดุ และบรรยากาศ" onCommit={set('note')} /></label>
      </div>
    </>
  );
}
