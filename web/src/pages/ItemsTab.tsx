import { useState } from 'react';
import { api, fileUrl, upload } from '../api';
import { quantities, byCode, unitWatt } from '../../../shared/calc';
import { COLORS, COLOR_LABEL, defaultSymbol, isLineSymbol, symbolMeta, symbolsFor } from '../../../shared/symbols';
import { FIELD_LABEL, PREFIX_BY_SYMBOL, cleanPrefix, hasLibraryUpdate, libraryChanges, nextCode, type Change } from '../../../shared/library';
import { LIGHTING, LIGHTING_PREFIXES, UNITS, categoryOf, isLengthUnit, sortCategories, unitTh } from '../../../shared/categories';
import { STATUSES, STATUS_STYLE } from '../../../shared/brand';
import type { Category, ColorKey, Fixture, LibraryItem, SymbolKind } from '../../../shared/types';
import { filterLibrary, libPrice, libSpec, useLibrary } from './Library';
import { LightSpec } from './LightSpec';
import { CatIcon, ConfirmButton, Empty, Field, FixtureChip, GlyphPicker, LengthPicker, StatusChip, SymbolIcon, Txt, money, qty } from '../ui';
import { glyphsFor } from '../../../shared/glyphs';
import type { TabProps } from './common';

/** Items (ITM): every coded item of the project, grouped by material category. */
export function ItemsTab({ bundle, reload, toast }: TabProps) {
  const cats = sortCategories(bundle.categories);
  const rank = new Map(cats.map((c, i) => [c.prefix, i]));
  const sorted = bundle.fixtures.slice().sort((a, b) => (rank.get(a.cat) ?? 999) - (rank.get(b.cat) ?? 999) || byCode(a, b));
  const [sel, setSel] = useState<number | null>(sorted[0]?.id ?? null);
  const [filter, setFilter] = useState('');
  const q = quantities(bundle);
  const list = sorted.filter((f) => !filter || f.cat === filter);
  const f = bundle.fixtures.find((x) => x.id === sel) ?? null;
  const lib = useLibrary();
  const libById = new Map((lib.items ?? []).map((i) => [i.id, i]));
  // right-hand panel: an item's form, the library picker, or the new-item form
  const [panel, setPanel] = useState<'form' | 'pick' | 'new'>(bundle.fixtures.length ? 'form' : 'new');
  // deleted codes count as taken, so the preview matches what the server issues
  const codes = [...bundle.fixtures.map((x) => x.code), ...(bundle.retired ?? [])];
  const count = (p: string) => bundle.fixtures.filter((x) => x.cat === p).length;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await Promise.all([reload(), lib.reload()]);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const add = (cat: string, symbol: SymbolKind, prefix: string, glyph: string | null) =>
    run(async () => {
      const code = nextCode(codes, prefix);
      const r = await api<{ id: number }>('POST', `/api/projects/${bundle.project.id}/fixtures`, { cat, code, symbol, glyph });
      setSel(r.id);
      setPanel('form');
      toast(`เพิ่ม ${code} แล้ว`);
    });
  const patch = (id: number, k: string) => (v: string | number | null) => run(() => api('PATCH', `/api/fixtures/${id}`, { [k]: v }));

  let lastCat = '';
  return (
    <main className="split">
      <aside className="side">
        <div className="row between">
          <h3 style={{ margin: 0 }}>รายการ ({bundle.fixtures.length})</h3>
          <div className="row gap">
            <button className={`btn small ${panel === 'pick' ? 'primary' : ''}`} onClick={() => setPanel((p) => (p === 'pick' ? 'form' : 'pick'))} title="เลือกสินค้าจากคลังกลางเข้าโปรเจกต์นี้">+ จากคลัง</button>
            <button className={`btn small ${panel === 'new' ? 'primary' : ''}`} onClick={() => setPanel((p) => (p === 'new' ? 'form' : 'new'))} title="เพิ่มรายการใหม่ เลือกหมวดก่อน">+ เพิ่ม</button>
          </div>
        </div>
        <div className="chips">
          <button className={`fchip ${filter === '' ? 'on' : ''}`} onClick={() => setFilter('')}>ทั้งหมด · {bundle.fixtures.length}</button>
          {cats.filter((c) => count(c.prefix) > 0).map((c) => (
            <button key={c.prefix} className={`fchip ${filter === c.prefix ? 'on' : ''}`} onClick={() => setFilter(c.prefix)} title={c.name_th}>{c.prefix} · {count(c.prefix)}</button>
          ))}
        </div>
        <div className="list">
          {list.map((x) => {
            const c = categoryOf(cats, x.cat);
            const head = x.cat !== lastCat;
            lastCat = x.cat;
            return (
              <div key={x.id} className="col">
                {head && <div className="listgroup"><CatIcon icon={c.icon} size={16} />{c.prefix} · {c.name_th}</div>}
                <button className={`li ${x.id === sel && panel === 'form' ? 'on' : ''}`} onClick={() => { setSel(x.id); setPanel('form'); }}>
                  <SymbolIcon kind={x.symbol} glyph={x.glyph} color={x.color} />
                  <span className="code">{x.code}</span>
                  <span className="grow trunc">{x.name || x.model || <i className="muted">ยังไม่ตั้งชื่อ</i>}</span>
                  {x.library_id != null && (hasLibraryUpdate(x, libById.get(x.library_id)) ? <span className="tag hot" title="คลังมีข้อมูลใหม่">อัปเดต</span> : <span className="tag" title="มาจากคลังกลาง">คลัง</span>)}
                  <span className="qty">{qty(q[x.id]?.total ?? 0)} {unitTh(x.unit)}</span>
                </button>
              </div>
            );
          })}
          {bundle.fixtures.length === 0 && <div className="muted small">ยังไม่มีรายการ กด “+ เพิ่ม” แล้วเลือกหมวด</div>}
        </div>
      </aside>
      <section className="detail">
        {panel === 'new' ? (
          <NewItem cats={cats.filter((c) => !c.archived)} codes={codes} initialCat={filter || undefined} onCreate={add} onClose={() => setPanel('form')} />
        ) : panel === 'pick' ? (
          <LibraryPicker items={lib.items} cats={cats} codes={codes} onClose={() => setPanel('form')} onPick={(it, prefix) => run(async () => {
            const r = await api<{ id: number; code: string }>('POST', `/api/projects/${bundle.project.id}/fixtures/from-library`, { library_id: it.id, prefix });
            setSel(r.id);
            setPanel('form');
            toast(`เพิ่ม ${r.code} จากคลังแล้ว`);
          })} />
        ) : !f ? (
          <Empty>เลือกรายการทางซ้าย หรือกด “+ เพิ่ม” / “+ จากคลัง”</Empty>
        ) : (
          <>
            <LibraryStatus f={f} item={f.library_id != null ? libById.get(f.library_id) : undefined} loaded={!!lib.items} run={run} />
            <ItemForm key={f.id} f={f} cats={cats} planQty={q[f.id]?.plan ?? 0} total={q[f.id]?.total ?? 0} setField={(k, v) => patch(f.id, k)(v)} run={run} onDeleted={() => setSel(null)}
              setCategory={(cat) => run(async () => {
                // the code stays as it is; it can be edited by hand in the form
                await api('PATCH', `/api/fixtures/${f.id}`, { cat });
                setFilter('');
              })} />
          </>
        )}
      </section>
    </main>
  );
}

function FxField({ f, k, label, type, wide, area, ph, setField }: { f: Fixture; k: keyof Fixture; label: string; type?: string; wide?: boolean; area?: boolean; ph?: string; setField: (k: string, v: string | number | null) => void }) {
  return (
    <Field label={label} wide={wide}>
      <Txt value={f[k] as string | number | null} type={type} area={area} placeholder={ph} onCommit={(v) => setField(k, type === 'number' ? (v === '' ? null : Number(v)) : v)} />
    </Field>
  );
}

function ImgBox({ f, kind, file, label, run }: { f: Fixture; kind: 'photo' | 'drawing'; file: string | null; label: string; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  return (
    <div className="imgbox">
      <div className="imgframe">{file ? <img src={fileUrl(file)} alt={label} /> : <span className="muted">ยังไม่มี{label}</span>}</div>
      <div className="row gap">
        <label className="btn small">
          {file ? 'เปลี่ยน' : 'อัปโหลด'}{label}
          <input type="file" accept="image/*" hidden onChange={(e) => {
            const file2 = e.target.files?.[0];
            e.target.value = '';
            if (file2) void run(() => upload(`/api/fixtures/${f.id}/image?kind=${kind}`, file2));
          }} />
        </label>
        {file && <button className="btn small" onClick={() => run(() => api('DELETE', `/api/fixtures/${f.id}/image?kind=${kind}`))}>ลบ</button>}
      </div>
    </div>
  );
}

function ItemForm({ f, cats, planQty, total, setField, setCategory, run, onDeleted }: { f: Fixture; cats: Category[]; planQty: number; total: number; setField: (k: string, v: string | number | null) => void; setCategory: (cat: string) => void; run: (fn: () => Promise<unknown>) => Promise<void>; onDeleted: () => void }) {
  const cat = categoryOf(cats, f.cat);
  const lighting = f.cat === LIGHTING;
  const manualCat = cat.qty_mode === 'manual';
  const used = planQty > 0;
  return (
    <>
      <div className="row between">
        <h2 className="row gap"><CatIcon icon={cat.icon} size={28} /><FixtureChip f={f} /> <span className="muted" style={{ fontFamily: 'var(--font-ui)', fontWeight: 400, fontSize: 16 }}>{f.name || f.model}</span></h2>
        <ConfirmButton label="ลบรหัสนี้" onConfirm={() => run(async () => { await api('DELETE', `/api/fixtures/${f.id}`); onDeleted(); })} />
      </div>
      <div className="card form">
        <div className="section-label">หมวด สถานะ และจำนวน</div>
        <Field label="หมวด">
          <select value={f.cat} onChange={(e) => setCategory(e.target.value)}>
            {cats.filter((c) => !c.archived || c.prefix === f.cat).map((c) => <option key={c.prefix} value={c.prefix}>{c.prefix} · {c.name_th}</option>)}
          </select>
        </Field>
        <Field label="สถานะ">
          <select value={f.status} onChange={(e) => setField('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].th} ({STATUS_STYLE[s].en})</option>)}
          </select>
        </Field>
        <Field label="หน่วย">
          <select value={f.unit} onChange={(e) => setField('unit', e.target.value)}>
            {UNITS.map((u) => <option key={u.code} value={u.code}>{u.th} ({u.en})</option>)}
          </select>
        </Field>
        <Field label={manualCat ? 'จำนวน (หมวดนี้กรอกเอง)' : 'จำนวน (เว้นว่าง = นับจากแปลน)'}>
          <Txt type="number" value={f.qty_manual} placeholder={manualCat ? 'ยังไม่กรอก' : `ตามแปลน ${qty(planQty)}`} onCommit={(v) => setField('qty_manual', v === '' ? null : Number(v))} />
        </Field>
        <div className="wide row gap wrap">
          <StatusChip s={f.status} />
          <span className="muted">ใช้ใน BOQ: <b className="mono">{qty(total)}</b> {unitTh(f.unit)} {f.qty_manual != null || manualCat ? '· กรอกเอง' : '· นับจากแปลน'}{used && (f.qty_manual != null || manualCat) ? ` (บนแปลนมี ${qty(planQty)})` : ''}</span>
        </div>
      </div>
      <div className="card">
        <h4>สัญลักษณ์บนแปลน <span className="muted small" style={{ fontWeight: 400 }}>หมุนทีละ 90° ได้ที่แท็บแปลน (เลือกหมุดแล้วกดปุ่มหมุน หรือกด R)</span></h4>
        {glyphsFor(f.cat).length > 0 && (
          <>
            <div className="muted small">ตามคู่มือสัญลักษณ์ FF&E (มุมมองด้านบน)</div>
            <GlyphPicker cat={f.cat} value={f.symbol === 'glyph' ? f.glyph : null} onPick={(code) => run(() => api('PATCH', `/api/fixtures/${f.id}`, { symbol: 'glyph', glyph: code }))} />
            <div className="muted small">หรือหมุดทั่วไป</div>
          </>
        )}
        <div className="symgrid">
          {symbolsFor(lighting || symbolMeta(f.symbol).lighting).map((s) => {
            const lineNow = isLineSymbol(f.symbol);
            const blocked = (s.geometry === 'line') !== lineNow && used;
            return (
              <button key={s.kind} disabled={blocked} title={blocked ? 'ลบจุด/เส้นที่ใช้รหัสนี้ก่อนจึงจะเปลี่ยนชนิดได้' : ''} className={`sym ${f.symbol === s.kind ? 'on' : ''}`} onClick={() => setField('symbol', s.kind)}>
                <SymbolIcon kind={s.kind} color={f.color} size={34} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="row gap center-y">
          <span className="muted">สีบนแปลน</span>
          {(Object.keys(COLORS) as ColorKey[]).map((c) => (
            <button key={c} className={`swatch ${f.color === c ? 'on' : ''}`} style={{ background: COLORS[c] }} onClick={() => setField('color', c)} title={COLOR_LABEL[c]} aria-label={COLOR_LABEL[c]} />
          ))}
          {!isLineSymbol(f.symbol) && f.symbol !== 'linear' && (
            <>
              <span className="muted" style={{ marginLeft: 12 }}>ขนาดบนแปลน</span>
              <span className="sizebtns" role="group" aria-label="ขนาดบนแปลน">
                {(['S', 'M', 'L'] as const).map((s) => <button key={s} className={`chipbtn code ${f.mark_size === s ? 'on' : ''}`} onClick={() => setField('mark_size', s)}>{s}</button>)}
              </span>
            </>
          )}
        </div>
        {f.symbol === 'linear' && <LengthPicker value={f.length_m} onChange={(v) => setField('length_m', v)} />}
      </div>
      <div className="card form">
        <div className="section-label">รายละเอียด</div>
        <FxField f={f} setField={setField} k="code" label="รหัส" />
        <FxField f={f} setField={setField} k="name" label="ชื่อรายการ" />
        <FxField f={f} setField={setField} k="model" label="รุ่น / SKU" />
        <FxField f={f} setField={setField} k="size" label="ขนาด (ก×ล×ส)" ph="เช่น 220×95×80 ซม." />
        <FxField f={f} setField={setField} k="finish" label="สี / ผิว / วัสดุ" />
        <FxField f={f} setField={setField} k="room" label="ห้อง / พื้นที่" ph="เช่น ห้องนั่งเล่น" />
        <FxField f={f} setField={setField} k="price" label={lighting && f.light_type !== 'builtin' ? `ราคาโคม / ${unitTh(f.unit)} (ไม่รวม${f.light_type === 'retrofit' ? 'หลอด' : ' Driver'})` : `ราคา / ${unitTh(f.unit)} (ก่อน VAT)`} type="number" ph="เว้นว่าง = รอราคา" />
        <FxField f={f} setField={setField} k="supplier" label="ซัพพลายเออร์ / ร้าน" />
        <FxField f={f} setField={setField} k="note" label="หมายเหตุ" wide />
        {lighting && <LightSpec v={f} set={setField} showSpecQty />}
      </div>
      <div className="card imgs">
        <ImgBox f={f} kind="photo" file={f.photo_file} label="รูปสินค้า" run={run} />
        <ImgBox f={f} kind="drawing" file={f.drawing_file} label="ภาพ Drawing / ขนาด" run={run} />
      </div>
    </>
  );
}

/** Pick a library item to copy into this project. */
function LibraryPicker({ items, cats, codes, onPick, onClose }: { items: LibraryItem[] | null; cats: Category[]; codes: string[]; onPick: (it: LibraryItem, prefix: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const list = filterLibrary(items ?? [], q).filter((i) => !cat || i.cat === cat);
  const present = cats.filter((c) => (items ?? []).some((i) => i.cat === c.prefix));
  return (
    <div className="card">
      <div className="row between">
        <h3>เพิ่มจากคลังสินค้า</h3>
        <button className="btn small ghost" onClick={onClose}>ปิด</button>
      </div>
      <p className="muted small">สินค้าที่เลือกจะถูกคัดลอกเข้าโปรเจกต์พร้อมรูปและราคาล่าสุด และได้รหัสถัดไปของหมวดนั้นอัตโนมัติ จัดการคลังได้ที่เมนู <a href="#/library"><u>คลังสินค้า</u></a></p>
      <input className="libsearch" type="search" autoFocus placeholder="ค้นหา ชื่อ / รุ่น / ขนาด / ซัพพลายเออร์" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        <button className={`fchip ${cat === '' ? 'on' : ''}`} onClick={() => setCat('')}>ทุกหมวด</button>
        {present.map((c) => <button key={c.prefix} className={`fchip ${cat === c.prefix ? 'on' : ''}`} onClick={() => setCat(c.prefix)}>{c.prefix} · {c.name_th}</button>)}
      </div>
      {!items ? <div className="muted">กำลังโหลด…</div> : (
        <div className="pick">
          {list.map((it) => (
            <button key={it.id} className="pickrow" onClick={() => onPick(it, it.cat)}>
              <span className="thumb">{it.photo_file ? <img src={fileUrl(it.photo_file)} alt="" /> : <CatIcon icon={categoryOf(cats, it.cat).icon} size={26} />}</span>
              <span className="grow">
                <b className="codetag">{it.code}</b> <b>{it.name || it.model || 'ยังไม่ตั้งชื่อ'}</b> <span className="muted">{it.name ? it.model : ''}</span>
                <span className="block muted small">{[categoryOf(cats, it.cat).name_th, it.category, libSpec(it), it.supplier].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={it.price == null ? 'warn small' : 'small mono'}>{libPrice(it)}</span>
              <span className="btn small">+ เป็น <span className="codetag">{it.code && !codes.includes(it.code) ? it.code : nextCode(codes, it.cat)}</span></span>
            </button>
          ))}
          {list.length === 0 && <div className="muted small">{items.length ? 'ไม่พบรายการที่ค้นหา' : 'คลังยังว่าง บันทึกรายการจากโปรเจกต์เข้าคลังด้วยปุ่ม “บันทึกเข้าคลัง” ในฟอร์มของแต่ละรหัส'}</div>}
        </div>
      )}
    </div>
  );
}

const showVal = (field: Change['field'], v: unknown) =>
  v == null || v === '' ? '—' : field === 'photo_file' || field === 'drawing_file' ? 'มีรูป' : field === 'price' ? money(Number(v)) : String(v);

/** Link between this project item and the central library, with update / save / push actions. */
function LibraryStatus({ f, item, loaded, run }: { f: Fixture; item?: LibraryItem; loaded: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  if (!loaded) return null;
  if (f.library_id == null) {
    return (
      <div className="libstatus">
        <span className="muted small">รหัสนี้มีเฉพาะในโปรเจกต์นี้</span>
        <button className="btn small" onClick={() => run(() => api('POST', `/api/fixtures/${f.id}/to-library`, {}))}>บันทึกเข้าคลัง</button>
      </div>
    );
  }
  if (!item) return <div className="libstatus"><span className="muted small">รายการในคลังถูกลบไปแล้ว ข้อมูลในโปรเจกต์ยังอยู่ครบ</span></div>;
  const changes = libraryChanges(f, item);
  if (hasLibraryUpdate(f, item)) {
    return (
      <div className="libstatus update">
        <div className="grow">
          <b>คลังมีข้อมูลใหม่</b> <span className="small">(แก้ไข {item.updated_at.slice(0, 16)})</span>
          <table className="tbl changes">
            <thead><tr><th>ช่อง</th><th>ในโปรเจกต์</th><th>ในคลัง</th></tr></thead>
            <tbody>{changes.map((c) => <tr key={c.field}><td>{FIELD_LABEL[c.field]}</td><td className="muted">{showVal(c.field, c.from)}</td><td><b>{showVal(c.field, c.to)}</b></td></tr>)}</tbody>
          </table>
          <div className="small">สีบนแปลนและรหัสของโปรเจกต์จะไม่ถูกเปลี่ยน</div>
        </div>
        <div className="col gap">
          <button className="btn primary small" onClick={() => run(() => api('POST', `/api/fixtures/${f.id}/sync-library`, {}))}>อัปเดตจากคลัง</button>
          <button className="btn small" onClick={() => run(() => api('POST', `/api/fixtures/${f.id}/sync-library`, { apply: false }))}>ข้าม (คงค่าเดิม)</button>
        </div>
      </div>
    );
  }
  return (
    <div className="libstatus">
      <span className="small"><span className="tag">คลัง</span> {changes.length ? <span className="muted">ข้อมูลในโปรเจกต์ต่างจากคลัง {changes.length} ช่อง ({changes.map((c) => FIELD_LABEL[c.field]).join(', ')})</span> : <span className="muted">ตรงกับคลัง</span>}</span>
      {changes.length > 0 && <button className="btn small" title="ใช้ข้อมูลของโปรเจกต์นี้อัปเดตรายการในคลัง (โปรเจกต์อื่นจะเห็นปุ่มอัปเดต)" onClick={() => run(() => api('POST', `/api/fixtures/${f.id}/push-library`))}>ส่งไปอัปเดตคลัง</button>}
    </div>
  );
}

/** New item: pick the category (tiles), then for lighting the symbol and prefix; the number is filled in (PREFIX-NN). */
function NewItem({ cats, codes, initialCat, onCreate, onClose }: { cats: Category[]; codes: string[]; initialCat?: string; onCreate: (cat: string, symbol: SymbolKind, prefix: string, glyph: string | null) => void; onClose: () => void }) {
  const [cat, setCat] = useState(initialCat && cats.some((c) => c.prefix === initialCat) ? initialCat : cats[0]?.prefix ?? 'F');
  const c = categoryOf(cats, cat);
  const lighting = cat === LIGHTING;
  const [symbol, setSymbol] = useState<SymbolKind>(defaultSymbol(lighting, isLengthUnit(c.unit)));
  const [prefix, setPrefix] = useState(cat);
  const [custom, setCustom] = useState('');
  const [glyph, setGlyph] = useState<string | null>(null);
  const pick = (p: string) => {
    const nc = categoryOf(cats, p);
    setCat(p);
    setPrefix(p);
    setCustom('');
    setGlyph(null);
    setSymbol(defaultSymbol(p === LIGHTING, isLengthUnit(nc.unit)));
  };
  const usePrefix = custom || prefix;
  const code = nextCode(codes, usePrefix);
  const choices = lighting ? [LIGHTING, ...LIGHTING_PREFIXES] : [cat];
  return (
    <div className="card">
      <div className="row between">
        <h3>เพิ่มรายการใหม่</h3>
        <button className="btn small ghost" onClick={onClose}>ปิด</button>
      </div>
      <h4>1 · หมวด</h4>
      <div className="cattiles">
        {cats.map((x) => (
          <button key={x.prefix} className={`cattile ${x.prefix === cat ? 'on' : ''}`} onClick={() => pick(x.prefix)}>
            <CatIcon icon={x.icon} size={26} />
            <span><span className="cp">{x.prefix}</span><span className="cn">{x.name_th}</span></span>
          </button>
        ))}
        <a className="cattile add" href="#/categories">+ เพิ่มหมวดใหม่</a>
      </div>
      <p className="muted small">หน่วยเริ่มต้น {unitTh(c.unit)} · {c.qty_mode === 'manual' ? 'กรอกจำนวนเอง (งานพื้นที่/ความยาว)' : 'นับจำนวนจากหมุดบนแปลน'}</p>
      <h4>2 · สัญลักษณ์บนแปลน</h4>
      <GlyphPicker cat={cat} value={symbol === 'glyph' ? glyph : null} onPick={(code) => { setGlyph(code); setSymbol('glyph'); }} />
      <div className="symgrid">
        {symbolsFor(lighting).map((s) => (
          <button key={s.kind} className={`sym ${symbol === s.kind ? 'on' : ''}`} onClick={() => { setSymbol(s.kind); setGlyph(null); if (lighting && !custom && prefix !== LIGHTING) setPrefix(PREFIX_BY_SYMBOL[s.kind] ?? LIGHTING); }}>
            <SymbolIcon kind={s.kind} color="red" size={34} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <h4>3 · รหัส</h4>
      <div className="prefixes">
        <span className="muted small">ตัวนำหน้า</span>
        {choices.map((p) => <button key={p} className={`chipbtn code ${!custom && prefix === p ? 'on' : ''}`} onClick={() => { setPrefix(p); setCustom(''); }}>{p}</button>)}
        {lighting && <input className={`w70 code ${custom ? 'on' : ''}`} placeholder="อื่น ๆ" value={custom} maxLength={6} onChange={(e) => setCustom(e.target.value ? cleanPrefix(e.target.value) : '')} />}
      </div>
      <div className="row gap center-y mt">
        <span className="muted">รหัสที่จะได้</span>
        <b className="code bigcode">{code}</b>
        <div className="grow" />
        <button className="btn primary" onClick={() => onCreate(cat, symbol, usePrefix, symbol === 'glyph' ? glyph : null)}>สร้าง {code}</button>
      </div>
      <p className="muted small">เลขต่อจากรหัสเดิมที่ขึ้นต้นเหมือนกันในโปรเจกต์นี้ และไม่นำเลขที่ลบไปแล้วกลับมาใช้ แก้รหัสเองได้ในฟอร์ม</p>
    </div>
  );
}
