import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fileUrl, upload } from '../api';
import { lampText } from '../../../shared/calc';
import { searchText } from '../../../shared/library';
import { COLORS, COLOR_LABEL, SYMBOLS } from '../../../shared/symbols';
import type { ColorKey, Fixture, LibraryItem, User } from '../../../shared/types';
import { ConfirmButton, Empty, Field, LengthPicker, SymbolIcon, Txt, money } from '../ui';

/** Loads the central library; `reload()` refetches. Shared by this page and the specs tab. */
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

/** One line of spec text, e.g. "GU10 ×1 · 7W · 3000K". */
export const libSpec = (i: LibraryItem) => [lampText(i as unknown as Fixture), i.kelvin ? `${i.kelvin}K` : '', i.ip].filter(Boolean).join(' · ');
export const libPrice = (i: LibraryItem) => (i.price != null ? `${money(i.price)} / ${i.unit === 'm' ? 'ม.' : 'ชุด'}` : 'รอราคา');

export function Library({ me, toast }: { me: User; toast: (m: string) => void }) {
  const { items, reload } = useLibrary();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const list = useMemo(() => filterLibrary(items ?? [], q), [items, q]);
  const it = items?.find((x) => x.id === sel) ?? null;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const add = () => run(async () => setSel((await api<{ id: number }>('POST', '/api/library', { name: q.trim() })).id));

  return (
    <main className="split">
      <aside className="side">
        <div className="row between">
          <h3>คลังโคม ({items?.length ?? 0})</h3>
          <button className="btn primary" onClick={add}>+ เพิ่ม</button>
        </div>
        <input className="libsearch" type="search" placeholder="ค้นหา รุ่น / ชื่อ / ซัพพลายเออร์ / หมวด" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list">
          {list.map((x) => (
            <button key={x.id} className={`li libli ${x.id === sel ? 'on' : ''}`} onClick={() => setSel(x.id)}>
              <SymbolIcon kind={x.symbol} color={x.color} />
              <span className="grow">
                <span className="trunc block">{x.model || <i className="muted">ยังไม่ระบุรุ่น</i>}</span>
                <span className="trunc block muted small">{[x.name, x.category].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="qty" title="จำนวนโปรเจกต์ที่ใช้">{x.used ? `ใช้ ${x.used}` : ''}</span>
            </button>
          ))}
          {items && list.length === 0 && <div className="muted small">{items.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีโคมในคลัง — กด “+ เพิ่ม” หรือ “บันทึกเข้าคลัง” จากแท็บสเปคโคมของโปรเจกต์'}</div>}
        </div>
      </aside>
      <section className="detail">
        {!it ? (
          <Empty motif="spark">คลังสเปคโคมกลาง ใช้ร่วมกันทุกโปรเจกต์ — เลือกรายการทางซ้าย หรือกด “+ เพิ่ม”</Empty>
        ) : (
          <LibraryForm key={it.id} it={it} me={me} run={run} onDeleted={() => setSel(null)} />
        )}
      </section>
    </main>
  );
}

function LibraryForm({ it, me, run, onDeleted }: { it: LibraryItem; me: User; run: (fn: () => Promise<unknown>) => Promise<void>; onDeleted: () => void }) {
  const set = (k: string, v: string | number | null) => run(() => api('PATCH', `/api/library/${it.id}`, { [k]: v }));
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
        <h2>{it.model || 'ยังไม่ระบุรุ่น'} <span className="muted small">{libPrice(it)}</span></h2>
        {me.role === 'admin' ? (
          <ConfirmButton label="ลบออกจากคลัง" confirm={it.used ? `ยืนยัน (${it.used} โปรเจกต์ยังเก็บสำเนาไว้)` : 'ยืนยันลบ'} onConfirm={() => run(async () => { await api('DELETE', `/api/library/${it.id}`); onDeleted(); })} />
        ) : (
          <span className="muted small">ลบได้เฉพาะผู้ดูแล</span>
        )}
      </div>
      <p className="muted small">
        {it.used ? `ใช้ใน ${it.used} รหัสโคมของโปรเจกต์ · ` : ''}แก้ไขล่าสุด {it.updated_at.slice(0, 16)} — การแก้ที่นี่ไม่เปลี่ยนโปรเจกต์ที่นำไปแล้ว แต่ละโปรเจกต์จะเห็นปุ่ม “อัปเดตจากคลัง” ในแท็บสเปคโคม
      </p>
      <div className="card">
        <h3>สัญลักษณ์บนแปลน (ค่าเริ่มต้นเมื่อนำเข้า)</h3>
        <div className="symgrid">
          {SYMBOLS.map((s) => (
            <button key={s.kind} className={`sym ${it.symbol === s.kind ? 'on' : ''}`} onClick={() => set('symbol', s.kind)}>
              <SymbolIcon kind={s.kind} color={it.color} size={34} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="row gap center-y">
          <span className="muted">สี</span>
          {(Object.keys(COLORS) as ColorKey[]).map((c) => (
            <button key={c} className={`swatch ${it.color === c ? 'on' : ''}`} style={{ background: COLORS[c] }} onClick={() => set('color', c)} title={COLOR_LABEL[c]} aria-label={COLOR_LABEL[c]} />
          ))}
          <span className="muted">หน่วย</span>
          <select value={it.unit} onChange={(e) => set('unit', e.target.value)}>
            <option value="ea">ชุด (ea)</option>
            <option value="m">เมตร (m) — ไฟเส้น/ราง</option>
          </select>
        </div>
        {it.symbol === 'linear' && <LengthPicker value={it.length_m} onChange={(v) => set('length_m', v)} />}
      </div>
      <div className="card form">
        {F({ k: 'model', label: 'รุ่น (Model)' })}
        {F({ k: 'category', label: 'หมวด (เช่น ดาวน์ไลท์, โคมแขวน)' })}
        {F({ k: 'name', label: 'ชื่อ / ประเภท', wide: true })}
        {F({ k: 'finish', label: 'สี / ผิว (Finish)' })}
        {F({ k: 'socket', label: 'ขั้วหลอด', ph: 'E27, G9, GU10…' })}
        {F({ k: 'bulbs', label: 'จำนวนหลอด', type: 'number' })}
        {F({ k: 'watt_per_lamp', label: it.unit === 'm' ? 'วัตต์ต่อเมตร (W/m)' : 'วัตต์ต่อหลอด (W)', type: 'number' })}
        {F({ k: 'watt_total', label: 'วัตต์รวมต่อชุด (ถ้าไม่ใช้หลอด)', type: 'number' })}
        {F({ k: 'kelvin', label: 'อุณหภูมิสี (K)', type: 'number' })}
        {F({ k: 'ip', label: 'IP' })}
        {F({ k: 'price', label: `ราคา/${it.unit === 'm' ? 'เมตร' : 'ชุด'} (ก่อน VAT)`, type: 'number', ph: 'เว้นว่าง = รอราคา' })}
        {F({ k: 'supplier', label: 'ซัพพลายเออร์ / ร้านไฟ' })}
        {F({ k: 'note', label: 'หมายเหตุ', wide: true })}
        <div className="muted wide">สเปค: {libSpec(it) || '—'}</div>
      </div>
      <div className="card imgs">
        {img('photo', it.photo_file, 'รูปโคม')}
        {img('drawing', it.drawing_file, 'ภาพ Drawing / ขนาด')}
      </div>
    </>
  );
}
