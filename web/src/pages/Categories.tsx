import { useState } from 'react';
import { api, useCategories } from '../api';
import { ICON_KEYS, UNITS, cleanCategoryPrefix, sortCategories } from '../../../shared/categories';
import type { Category, User } from '../../../shared/types';
import { CatIcon, Field, GlyphIcon, Txt } from '../ui';
import { glyphsFor } from '../../../shared/glyphs';

const ICON_LABEL: Record<string, string> = {
  furniture: 'เฟอร์นิเจอร์', 'built-in': 'บิวท์อิน', lighting: 'ไฟ', surfaces: 'ผิว', paint: 'สี', plumbing: 'ประปา', hardware: 'ฮาร์ดแวร์',
  equipment: 'อุปกรณ์', countertop: 'ท็อป', decor: 'ตกแต่ง', signage: 'ป้าย', graphics: 'กราฟิก', other: 'ทั่วไป',
};

/** Material categories: the 12 from the guideline plus the studio's own. Admins add, rename and archive. */
export function Categories({ me, toast }: { me: User; toast: (m: string) => void }) {
  const { items, reload } = useCategories();
  const [sel, setSel] = useState<number | 'new' | null>(null);
  const admin = me.role === 'admin';
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const list = sortCategories(items ?? []);
  const active = list.filter((c) => !c.archived);
  const archived = list.filter((c) => c.archived);
  const cur = typeof sel === 'number' ? list.find((c) => c.id === sel) : undefined;

  const tile = (c: Category) => (
    <button key={c.id} className={`cattile ${sel === c.id ? 'on' : ''}`} onClick={() => setSel(c.id)}>
      <CatIcon icon={c.icon} size={30} />
      <span className="grow">
        <span className="cp">{c.prefix}{c.builtin ? '' : ' · ของสตูดิโอ'}</span>
        <span className="cn">{c.name_th}</span>
        <span className="muted small">{c.name_en || '—'} · {c.items ?? 0} รายการ</span>
      </span>
    </button>
  );

  return (
    <main className="page">
      <div className="pagehead">
        <div>
          <div className="eyebrow">CAT · Categories</div>
          <h1>หมวดหมู่วัสดุ</h1>
          <p className="sub">หมวดกำหนดตัวนำหน้ารหัส (F-01, BI-02 …) หน่วยเริ่มต้น ไอคอน และวิธีนับจำนวน 12 หมวดแรกมาจากคู่มือ KEYPLAN เพิ่มหมวดของสตูดิโอได้ไม่จำกัด</p>
        </div>
        {admin ? <button className="btn primary" onClick={() => setSel('new')}>+ เพิ่มหมวด</button> : <span className="muted small">เพิ่มหรือแก้หมวดได้เฉพาะผู้ดูแล</span>}
      </div>
      <div className="totals" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px' }}>
        <div>
          <div className="cattiles">{active.map(tile)}</div>
          {archived.length > 0 && (
            <>
              <h4 className="muted">เก็บถาวรแล้ว ({archived.length})</h4>
              <p className="muted small">ไม่แสดงตอนเพิ่มรายการใหม่ รายการเดิมและรหัสเดิมยังอยู่ครบ ตัวนำหน้าของหมวดเหล่านี้ใช้ซ้ำไม่ได้</p>
              <div className="cattiles">{archived.map(tile)}</div>
            </>
          )}
        </div>
        <div>
          {sel === 'new' && admin ? (
            <NewCategory taken={list} onClose={() => setSel(null)} onCreate={(body) => run(async () => {
              const r = await api<{ id: number; prefix: string }>('POST', '/api/categories', body);
              setSel(r.id);
              toast(`เพิ่มหมวด ${r.prefix} แล้ว`);
            })} />
          ) : cur ? (
            <CategoryForm key={cur.id} c={cur} admin={admin} run={run} />
          ) : (
            <div className="empty">เลือกหมวดทางซ้ายเพื่อดูหรือแก้ไข</div>
          )}
        </div>
      </div>
    </main>
  );
}

function IconPicker({ value, onChange, disabled }: { value: string; onChange: (k: string) => void; disabled?: boolean }) {
  return (
    <div className="chips">
      {ICON_KEYS.map((k) => (
        <button key={k} type="button" disabled={disabled} className={`fchip ${value === k ? 'on' : ''}`} onClick={() => onChange(k)} title={ICON_LABEL[k]} aria-label={ICON_LABEL[k]}>
          <CatIcon icon={k} size={20} />
        </button>
      ))}
    </div>
  );
}

function UnitSelect({ value, onChange, disabled }: { value: string; onChange: (u: string) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {UNITS.map((u) => <option key={u.code} value={u.code}>{u.th} ({u.en})</option>)}
    </select>
  );
}

function QtyMode({ value, onChange, disabled }: { value: string; onChange: (m: string) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="plan">นับจากหมุดและเส้นบนแปลน</option>
      <option value="manual">กรอกจำนวนเอง (งานพื้นที่ / ความยาว)</option>
    </select>
  );
}

function NewCategory({ taken, onCreate, onClose }: { taken: Category[]; onCreate: (b: Record<string, string>) => void; onClose: () => void }) {
  const [prefix, setPrefix] = useState('');
  const [th, setTh] = useState('');
  const [en, setEn] = useState('');
  const [unit, setUnit] = useState('ea');
  const [mode, setMode] = useState('plan');
  const [icon, setIcon] = useState('other');
  const clash = taken.find((c) => c.prefix === prefix);
  const ok = prefix && th.trim() && !clash;
  return (
    <form className="card col gap" onSubmit={(e) => { e.preventDefault(); if (ok) onCreate({ prefix, name_th: th, name_en: en, unit, qty_mode: mode, icon }); }}>
      <div className="row between"><h3>เพิ่มหมวดใหม่</h3><button type="button" className="btn small ghost" onClick={onClose}>ปิด</button></div>
      <Field label="ตัวนำหน้ารหัส (A–Z 1–4 ตัว)">
        <input className="code" value={prefix} maxLength={4} placeholder="เช่น WD" onChange={(e) => setPrefix(cleanCategoryPrefix(e.target.value))} autoFocus />
      </Field>
      {clash && <div className="error">{clash.archived ? `${prefix} เคยใช้กับหมวด “${clash.name_th}” ที่เก็บถาวรแล้ว ใช้ซ้ำไม่ได้` : `${prefix} ใช้กับหมวด “${clash.name_th}” อยู่แล้ว`}</div>}
      <Field label="ชื่อหมวด (ไทย)"><input value={th} onChange={(e) => setTh(e.target.value)} placeholder="เช่น งานไม้ / ผ้าม่าน / วอลเปเปอร์" /></Field>
      <Field label="ชื่อหมวด (English)"><input value={en} onChange={(e) => setEn(e.target.value)} placeholder="e.g. Woodwork" /></Field>
      <Field label="หน่วยเริ่มต้น"><UnitSelect value={unit} onChange={setUnit} /></Field>
      <Field label="วิธีนับจำนวน"><QtyMode value={mode} onChange={setMode} /></Field>
      <div className="field"><span>ไอคอน</span><IconPicker value={icon} onChange={setIcon} /></div>
      <p className="muted small">รหัสที่จะได้: <b className="codetag">{prefix ? `${prefix}-01` : '—'}</b> · ตัวนำหน้าเปลี่ยนภายหลังไม่ได้ และใช้ซ้ำไม่ได้แม้เก็บหมวดถาวรแล้ว</p>
      <button className="btn primary" type="submit" disabled={!ok}>เพิ่มหมวด {prefix}</button>
    </form>
  );
}

function CategoryForm({ c, admin, run }: { c: Category; admin: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const set = (k: string) => (v: string) => run(() => api('PATCH', `/api/categories/${c.id}`, { [k]: v }));
  return (
    <div className="card col gap">
      <div className="row gap"><CatIcon icon={c.icon} size={40} /><div><div className="codetag">{c.prefix}-01, {c.prefix}-02 …</div><h3 style={{ margin: 0 }}>{c.name_th}</h3></div></div>
      <p className="muted small">{c.builtin ? 'หมวดมาตรฐานจากคู่มือ KEYPLAN' : 'หมวดที่สตูดิโอเพิ่มเอง'} · ใช้อยู่ {c.items ?? 0} รายการ (โปรเจกต์ + คลัง)</p>
      <Field label="ชื่อหมวด (ไทย)"><Txt value={c.name_th} disabled={!admin} onCommit={set('name_th')} /></Field>
      <Field label="ชื่อหมวด (English)"><Txt value={c.name_en} disabled={!admin} onCommit={set('name_en')} /></Field>
      <Field label="หน่วยเริ่มต้น (ใช้กับรายการใหม่)"><UnitSelect value={c.unit} disabled={!admin} onChange={set('unit')} /></Field>
      <Field label="วิธีนับจำนวน"><QtyMode value={c.qty_mode} disabled={!admin} onChange={set('qty_mode')} /></Field>
      <div className="field"><span>ไอคอน</span><IconPicker value={c.icon} disabled={!admin} onChange={set('icon')} /></div>
      {admin && (
        c.archived
          ? <button className="btn" onClick={() => run(() => api('POST', `/api/categories/${c.id}/archive`, { archived: false }))}>นำกลับมาใช้</button>
          : <button className="btn danger" onClick={() => run(() => api('POST', `/api/categories/${c.id}/archive`, { archived: true }))}>เก็บถาวร (ซ่อนจากรายการใหม่)</button>
      )}
      <p className="muted small">ตัวนำหน้า {c.prefix} เปลี่ยนไม่ได้ เพื่อให้รหัสที่ออกไปแล้วบนแบบและใบเสนอราคาไม่เปลี่ยน</p>
      <h4 className="mt">สัญลักษณ์บนแบบ ({glyphsFor(c.prefix).length})</h4>
      {glyphsFor(c.prefix).length ? (
        <div className="glyphlist">
          {glyphsFor(c.prefix).map((g) => (
            <div key={g.code} className="glyphrow" title={g.en}>
              <GlyphIcon code={g.code} size={36} />
              <span className="codetag">{g.code}</span>
              <span className="grow small">{g.th}<br /><span className="muted">{g.en}</span></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">{c.prefix === 'L' ? 'หมวดไฟใช้สัญลักษณ์โคม (ดาวน์ไลท์ สปอต ราง …) ที่มีอยู่แล้ว' : 'หมวดนี้ยังไม่มีสัญลักษณ์ตามคู่มือ ใช้หมุดสี่เหลี่ยม วงกลม หรือสามเหลี่ยมได้'}</p>
      )}
    </div>
  );
}
