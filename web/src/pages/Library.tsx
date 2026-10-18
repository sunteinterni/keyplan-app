import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fileUrl, upload, useCategories } from '../api';
import { lampText, lightExtraText, unitPrice } from '../../../shared/calc';
import { searchText } from '../../../shared/library';
import { COLORS, COLOR_LABEL, symbolsFor } from '../../../shared/symbols';
import { LIGHTING, UNITS, categoryOf, isLengthUnit, sortCategories, unitTh } from '../../../shared/categories';
import type { Category, ColorKey, Fixture, LibraryItem, User } from '../../../shared/types';
import { LightSpec } from './LightSpec';
import { CatIcon, ConfirmButton, Empty, Field, GlyphPicker, LengthPicker, SymbolIcon, Txt, money } from '../ui';

/** Loads the central library; `reload()` refetches. Shared by this page and the items tab. */
export function useLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const reload = useCallback(async () => setItems(await api<LibraryItem[]>('GET', '/api/library')), []);
  useEffect(() => void reload(), [reload]);
  return { items, reload };
}

export const filterLibrary = (items: LibraryItem[], q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((i) => words.every((w) => searchText(i).includes(w)));
};

/** One line of spec text: lighting "GU10 ×1 · 7W · 3000K · หลอด …", other categories "size · finish". */
export const libSpec = (i: LibraryItem) =>
  (i.cat === LIGHTING ? [lampText(i as unknown as Fixture), i.kelvin ? `${i.kelvin}K` : '', i.ip, lightExtraText(i)] : [i.size, i.finish]).filter(Boolean).join(' · ');
export const libPrice = (i: LibraryItem) => { const p = unitPrice(i); return p != null ? `${money(p)} / ${unitTh(i.unit)}` : 'รอราคา'; };

export function Library({ me, toast }: { me: User; toast: (m: string) => void }) {
  const { items, reload } = useLibrary();
  const catsHook = useCategories();
  const cats = sortCategories(catsHook.items ?? []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const list = useMemo(() => filterLibrary(items ?? [], q).filter((i) => !cat || i.cat === cat), [items, q, cat]);
  const it = items?.find((x) => x.id === sel) ?? null;
  const count = (p: string) => (items ?? []).filter((i) => i.cat === p).length;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const add = () => run(async () => setSel((await api<{ id: number }>('POST', '/api/library', { cat: cat || 'F', name: q.trim() })).id));

  return (
    <main className="split">
      <aside className="side">
        <div className="row between">
          <div>
            <div className="eyebrow">LIB · Library</div>
            <h3 style={{ margin: 0 }}>คลังสินค้า ({items?.length ?? 0})</h3>
          </div>
          <button className="btn primary small" onClick={add} title={cat ? `เพิ่มในหมวด ${cat}` : 'เพิ่มในหมวด F (เลือกหมวดก่อนเพื่อเพิ่มในหมวดอื่น)'}>+ เพิ่ม{cat ? ` ${cat}` : ''}</button>
        </div>
        <input className="libsearch" type="search" placeholder="ค้นหา ชื่อ / รุ่น / ขนาด / ซัพพลายเออร์" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={`fchip ${cat === '' ? 'on' : ''}`} onClick={() => setCat('')}>ทั้งหมด</button>
          {cats.filter((c) => !c.archived || count(c.prefix)).map((c) => (
            <button key={c.prefix} className={`fchip ${cat === c.prefix ? 'on' : ''} ${count(c.prefix) ? '' : 'zero'}`} onClick={() => setCat(c.prefix)} title={c.name_th}>{c.prefix} · {count(c.prefix)}</button>
          ))}
        </div>
        <div className="list">
          {list.map((x) => (
            <button key={x.id} className={`li libli ${x.id === sel ? 'on' : ''}`} onClick={() => setSel(x.id)}>
              <CatIcon icon={categoryOf(cats, x.cat).icon} size={20} />
              <span className="code">{x.code}</span>
              <span className="grow">
                <span className="trunc block">{x.name || x.model || <i className="muted">ยังไม่ตั้งชื่อ</i>}</span>
                <span className="trunc block muted small">{[x.name ? x.model : '', x.category].filter(Boolean).join(' · ') || categoryOf(cats, x.cat).name_th}</span>
              </span>
              <span className="qty" title="จำนวนรหัสในโปรเจกต์ที่ใช้">{x.used ? `ใช้ ${x.used}` : ''}</span>
            </button>
          ))}
          {items && list.length === 0 && <div className="muted small">{items.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีสินค้าในคลัง กด “+ เพิ่ม” หรือ “บันทึกเข้าคลัง” จากแท็บรายการของโปรเจกต์'}</div>}
        </div>
      </aside>
      <section className="detail">
        {!it ? (
          <Empty>คลังสินค้ากลาง ใช้ร่วมกันทุกโปรเจกต์ เลือกรายการทางซ้าย หรือกด “+ เพิ่ม”</Empty>
        ) : (
          <LibraryForm key={it.id} it={it} cats={cats} me={me} run={run} onDeleted={() => setSel(null)} />
        )}
      </section>
    </main>
  );
}

function LibraryForm({ it, cats, me, run, onDeleted }: { it: LibraryItem; cats: Category[]; me: User; run: (fn: () => Promise<unknown>) => Promise<void>; onDeleted: () => void }) {
  const set = (k: string, v: string | number | null) => run(() => api('PATCH', `/api/library/${it.id}`, { [k]: v }));
  const lighting = it.cat === LIGHTING;
  const c = categoryOf(cats, it.cat);
  const F = ({ k, label, type, wide, ph }: { k: keyof LibraryItem; label: string; type?: string; wide?: boolean; ph?: string }) => (
    <Field label={label} wide={wide}>
      <Txt value={it[k] as string | number | null} type={type} placeholder={ph} onCommit={(v) => set(k, type === 'number' ? (v === '' ? null : Number(v)) : v)} />
    </Field>
  );
  const img = (kind: 'photo' | 'drawing', file: string | null, label: string) => (
    <div className="imgbox">
      <div className="imgframe">{file ? <img src={fileUrl(file)} alt={label} /> : <span className="muted">ยังไม่มี{label}</span>}</div>
      <div className="row gap">
        <label className="btn small">
          {file ? 'เปลี่ยน' : 'อัปโหลด'}{label}
          <input type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void run(() => upload(`/api/library/${it.id}/image?kind=${kind}`, f));
          }} />
        </label>
        {file && <button className="btn small" onClick={() => run(() => api('DELETE', `/api/library/${it.id}/image?kind=${kind}`))}>ลบ</button>}
      </div>
    </div>
  );
  return (
    <>
      <div className="row between">
        <h2 className="row gap"><CatIcon icon={c.icon} size={28} /><span className="codetag">{it.code}</span> {it.name || it.model || 'ยังไม่ตั้งชื่อ'} <span className="muted small mono">{libPrice(it)}</span></h2>
        {me.role === 'admin' ? (
          <ConfirmButton label="ลบออกจากคลัง" confirm={it.used ? `ยืนยัน (${it.used} โปรเจกต์ยังเก็บสำเนาไว้)` : 'ยืนยันลบ'} onConfirm={() => run(async () => { await api('DELETE', `/api/library/${it.id}`); onDeleted(); })} />
        ) : (
          <span className="muted small">ลบได้เฉพาะผู้ดูแล</span>
        )}
      </div>
      <p className="muted small">
        {it.used ? `ใช้ใน ${it.used} รหัสของโปรเจกต์ · ` : ''}แก้ไขล่าสุด {it.updated_at.slice(0, 16)} · การแก้ที่นี่ไม่เปลี่ยนโปรเจกต์ที่นำไปแล้ว แต่ละโปรเจกต์จะเห็นปุ่ม “อัปเดตจากคลัง” ในแท็บรายการ
      </p>
      <div className="card form">
        <div className="section-label">หมวดและหน่วย</div>
        <Field label="หมวด">
          <select value={it.cat} onChange={(e) => set('cat', e.target.value)}>
            {cats.filter((x) => !x.archived || x.prefix === it.cat).map((x) => <option key={x.prefix} value={x.prefix}>{x.prefix} · {x.name_th}</option>)}
          </select>
        </Field>
        <Field label="หน่วย">
          <select value={it.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNITS.map((u) => <option key={u.code} value={u.code}>{u.th} ({u.en})</option>)}
          </select>
        </Field>
        {F({ k: 'category', label: 'กลุ่มย่อย (เช่น โซฟา, ดาวน์ไลท์)' })}
      </div>
      <div className="card">
        <h4>สัญลักษณ์บนแปลน (ค่าเริ่มต้นเมื่อนำเข้าโปรเจกต์)</h4>
        <GlyphPicker cat={it.cat} value={it.symbol === 'glyph' ? it.glyph : null} onPick={(code) => run(() => api('PATCH', `/api/library/${it.id}`, { symbol: 'glyph', glyph: code }))} />
        <div className="symgrid">
          {symbolsFor(lighting).map((s) => (
            <button key={s.kind} className={`sym ${it.symbol === s.kind ? 'on' : ''}`} onClick={() => set('symbol', s.kind)}>
              <SymbolIcon kind={s.kind} color={it.color} size={34} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="row gap center-y">
          <span className="muted">สีบนแปลน</span>
          {(Object.keys(COLORS) as ColorKey[]).map((k) => (
            <button key={k} className={`swatch ${it.color === k ? 'on' : ''}`} style={{ background: COLORS[k] }} onClick={() => set('color', k)} title={COLOR_LABEL[k]} aria-label={COLOR_LABEL[k]} />
          ))}
        </div>
        {it.symbol === 'linear' && <LengthPicker value={it.length_m} onChange={(v) => set('length_m', v)} />}
      </div>
      <div className="card form">
        <div className="section-label">รายละเอียด</div>
        {F({ k: 'code', label: 'รหัสในคลัง' })}
        {F({ k: 'name', label: 'ชื่อรายการ' })}
        {F({ k: 'model', label: 'รุ่น / SKU' })}
        {F({ k: 'size', label: 'ขนาด (ก×ล×ส)' })}
        {F({ k: 'finish', label: 'สี / ผิว / วัสดุ' })}
        {F({ k: 'price', label: `ราคา / ${unitTh(it.unit)} (ก่อน VAT)`, type: 'number', ph: 'เว้นว่าง = รอราคา' })}
        {F({ k: 'supplier', label: 'ซัพพลายเออร์ / ร้าน' })}
        {F({ k: 'note', label: 'หมายเหตุ', wide: true })}
        {lighting && <LightSpec v={it} set={set} />}
        <div className="muted wide">สเปค: {libSpec(it) || '—'}</div>
      </div>
      <div className="card imgs">
        {img('photo', it.photo_file, 'รูปสินค้า')}
        {img('drawing', it.drawing_file, 'ภาพ Drawing / ขนาด')}
      </div>
    </>
  );
}
