import { useState } from 'react';
import { issues } from '../../../shared/calc';
import { LIGHTING, sortCategories } from '../../../shared/categories';
import { CatIcon } from '../ui';
import type { TabProps } from './common';

// parts of the PDF in book order; the cover is always included (same keys as server/pdf.ts PDF_PARTS)
const PARTS: { key: string; th: string; hint: string }[] = [
  { key: 'mood', th: 'Mood board', hint: 'ต่อจากหน้าปก' },
  { key: 'plan', th: 'แปลน + Legend', hint: 'ทุกชั้นที่มีแปลน' },
  { key: 'wiring', th: 'แปลนโยงวงจรไฟ', hint: 'เฉพาะหมวด L' },
  { key: 'spec', th: 'สเปคชีทรายการ', hint: 'รูป ขนาด วัสดุ' },
  { key: 'load', th: 'Lighting Load Schedule', hint: 'เฉพาะหมวด L' },
  { key: 'boq', th: 'ใบเสนอราคา / BOQ', hint: 'แยกตามหมวด' },
];

export function ExportTab({ bundle }: TabProps) {
  const id = bundle.project.id;
  const list = issues(bundle);
  const used = sortCategories(bundle.categories).filter((c) => bundle.fixtures.some((f) => f.cat === c.prefix));
  const hasLighting = bundle.fixtures.some((f) => f.cat === LIGHTING);
  const [mode, setMode] = useState<'all' | 'custom'>('all');
  const [parts, setParts] = useState<string[]>(PARTS.map((p) => p.key));
  const [cats, setCats] = useState<string[]>(used.map((c) => c.prefix));
  const [prices, setPrices] = useState(true);
  const toggle = (arr: string[], k: string) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  const customUrl = `/api/projects/${id}/export.pdf?prices=${prices ? 1 : 0}&parts=${PARTS.filter((p) => parts.includes(p.key)).map((p) => p.key).join(',')}&cats=${cats.join(',')}`;
  const nothing = parts.length === 0;
  const boards = (bundle.moodboards ?? []).filter((b) => b.images.length).length;

  return (
    <main className="page narrow">
      <div className="pagehead"><div><div className="eyebrow">OUT · Export</div><h1>Export</h1><p className="sub">เอกสารสำหรับลูกค้าและฝ่ายจัดซื้อ ตรวจรายการด้านล่างก่อนส่ง</p></div></div>
      <section className="card">
        <h3>PDF A3 แนวนอน</h3>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={mode === 'all'} className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>ทั้งเล่ม</button>
          <button role="tab" aria-selected={mode === 'custom'} className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>กำหนดเอง</button>
        </div>
        {mode === 'all' ? (
          <>
            <p className="muted">ปก{boards ? `, mood board ${boards} หน้า` : ''}, แปลนต่อชั้นพร้อม Legend, สเปคชีท, ใบเสนอราคาแยกตามหมวด{hasLighting ? ' และสำหรับงานไฟ: แปลนโยงวงจรกับ Load Schedule' : ''} (ตัวหนังสือเป็นข้อความจริง ค้นหาได้)</p>
            <div className="row gap wrap">
              <a className="btn primary" href={`/api/projects/${id}/export.pdf?prices=1`}>⬇ PDF พร้อมราคา / ใบเสนอราคา</a>
              <a className="btn" href={`/api/projects/${id}/export.pdf?prices=0`}>⬇ PDF ไม่แสดงราคา</a>
            </div>
          </>
        ) : (
          <>
            <h4>ส่วนของเล่ม <span className="muted small" style={{ fontWeight: 400 }}>(หน้าปกมีเสมอ)</span></h4>
            <div className="export-opts">
              {PARTS.map((p) => (
                <label key={p.key} className="checkrow">
                  <input type="checkbox" checked={parts.includes(p.key)} onChange={() => setParts((a) => toggle(a, p.key))} />
                  <span>{p.th} <span className="muted">· {p.hint}</span></span>
                </label>
              ))}
              <label className="checkrow">
                <input type="checkbox" checked={prices} onChange={() => setPrices((v) => !v)} />
                <span>แสดงราคาในสเปคชีท</span>
              </label>
            </div>
            <h4>หมวดรายการ <span className="muted small" style={{ fontWeight: 400 }}>(มีผลกับแปลน สเปคชีท และใบเสนอราคา ยอดรวมคิดเฉพาะหมวดที่เลือก)</span></h4>
            <div className="row gap wrap" style={{ marginBottom: 6 }}>
              <button className="btn small" onClick={() => setCats(used.map((c) => c.prefix))}>เลือกทุกหมวด</button>
              <button className="btn small" onClick={() => setCats([])}>ไม่เลือกเลย</button>
            </div>
            <div className="export-opts">
              {used.map((c) => (
                <label key={c.prefix} className="checkrow">
                  <input type="checkbox" checked={cats.includes(c.prefix)} onChange={() => setCats((a) => toggle(a, c.prefix))} />
                  <CatIcon icon={c.icon} size={20} />
                  <span><b className="codetag">{c.prefix}</b> {c.name_th} <span className="muted">· {bundle.fixtures.filter((f) => f.cat === c.prefix).length} รายการ</span></span>
                </label>
              ))}
              {used.length === 0 && <span className="muted">ยังไม่มีรายการในโปรเจกต์</span>}
            </div>
            {nothing ? <span className="btn" aria-disabled style={{ pointerEvents: 'none', borderStyle: 'dashed', color: 'var(--ink-2)', background: 'var(--sidebar)' }}>เลือกอย่างน้อย 1 ส่วน</span>
              : <a className="btn primary" href={customUrl}>⬇ PDF ตามที่เลือก ({parts.length} ส่วน · {cats.length} หมวด)</a>}
          </>
        )}
      </section>
      <section className="card">
        <h3>Excel</h3>
        <p className="muted">BOQ แยกตามหมวด (และ Load Schedule ถ้ามีวงจรไฟ) สำหรับแก้ไขต่อหรือส่งฝ่ายจัดซื้อ</p>
        <a className="btn" href={`/api/projects/${id}/export.xlsx`}>⬇ Excel (.xlsx)</a>
      </section>
      <section className="card">
        <h3>ตรวจก่อนส่งลูกค้า {list.length ? `(${list.length})` : ''}</h3>
        {list.length === 0 ? <div className="ok">ไม่พบข้อควรตรวจสอบ</div> : (
          <ul className="issues">
            {list.map((i, k) => (
              <li key={k} className={i.level}><b>{i.code}</b> {i.text}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
