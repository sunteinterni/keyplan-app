import { useState } from 'react';
import { api, fileUrl, upload } from '../api';
import { quantities, byCode, unitWatt } from '../../../shared/calc';
import { COLORS, COLOR_LABEL, SYMBOLS, isLineSymbol } from '../../../shared/symbols';
import { FIELD_LABEL, PREFIX_BY_SYMBOL, PREFIX_CHOICES, cleanPrefix, hasLibraryUpdate, libraryChanges, nextCode, type Change } from '../../../shared/library';
import type { ColorKey, Fixture, LibraryItem, SymbolKind } from '../../../shared/types';
import { filterLibrary, libPrice, libSpec, useLibrary } from './Library';
import { ConfirmButton, Empty, Field, FixtureChip, LengthPicker, SymbolIcon, Txt, money, qty } from '../ui';
import type { TabProps } from './common';

export function SpecsTab({ bundle, reload, toast }: TabProps) {
  const [sel, setSel] = useState<number | null>(bundle.fixtures.slice().sort(byCode)[0]?.id ?? null);
  const q = quantities(bundle);
  const list = bundle.fixtures.slice().sort(byCode);
  const f = bundle.fixtures.find((x) => x.id === sel) ?? null;
  const lib = useLibrary();
  const libById = new Map((lib.items ?? []).map((i) => [i.id, i]));
  // right-hand panel: a fixture's form, the library picker, or the new-fixture form
  const [panel, setPanel] = useState<'form' | 'pick' | 'new'>('form');
  const codes = bundle.fixtures.map((x) => x.code);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await Promise.all([reload(), lib.reload()]);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const add = (symbol: SymbolKind, prefix: string) =>
    run(async () => {
      const code = nextCode(codes, prefix);
      const r = await api<{ id: number }>('POST', `/api/projects/${bundle.project.id}/fixtures`, { code, symbol });
      setSel(r.id);
      setPanel('form');
      toast(`เพิ่ม ${code} แล้ว`);
    });
  const patch = (id: number, k: string) => (v: string | number | null) => run(() => api('PATCH', `/api/fixtures/${id}`, { [k]: v }));

  return (
    <main className="split">
      <aside className="side">
        <div className="row between">
          <h3>รหัสโคม ({list.length})</h3>
          <div className="row gap">
            <button className={`btn ${panel === 'pick' ? 'primary' : ''}`} onClick={() => setPanel((p) => (p === 'pick' ? 'form' : 'pick'))} title="เลือกโคมจากคลังกลางเข้าโปรเจกต์นี้">+ จากคลัง</button>
            <button className={`btn ${panel === 'new' ? 'primary' : ''}`} onClick={() => setPanel((p) => (p === 'new' ? 'form' : 'new'))} title="เพิ่มรหัสโคมใหม่ เลือกตัวนำหน้ารหัสเองได้">+ เพิ่ม</button>
          </div>
        </div>
        <div className="list">
          {list.map((x) => (
            <button key={x.id} className={`li ${x.id === sel && panel === 'form' ? 'on' : ''}`} onClick={() => { setSel(x.id); setPanel('form'); }}>
              <SymbolIcon kind={x.symbol} color={x.color} />
              <span className="code">{x.code}</span>
              <span className="grow trunc">{x.name || x.model || <i className="muted">ยังไม่ตั้งชื่อ</i>}</span>
              {x.library_id != null && (hasLibraryUpdate(x, libById.get(x.library_id)) ? <span className="tag hot" title="คลังมีข้อมูลใหม่">อัปเดต</span> : <span className="tag" title="มาจากคลังกลาง">คลัง</span>)}
              <span className="qty">{qty(q[x.id]?.total ?? 0)}{x.unit === 'm' ? ' m' : ''}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="detail">
        {panel === 'new' ? (
          <NewFixture codes={codes} onCreate={add} onClose={() => setPanel('form')} />
        ) : panel === 'pick' ? (
          <LibraryPicker items={lib.items} codes={codes} onClose={() => setPanel('form')} onPick={(it, prefix) => run(async () => {
            const r = await api<{ id: number; code: string }>('POST', `/api/projects/${bundle.project.id}/fixtures/from-library`, { library_id: it.id, prefix });
            setSel(r.id);
            setPanel('form');
            toast(`เพิ่ม ${r.code} จากคลังแล้ว`);
          })} />
        ) : !f ? (
          <Empty motif="spark">เลือกรหัสโคมทางซ้าย หรือกด “+ เพิ่ม” / “+ จากคลัง”</Empty>
        ) : (
          <>
            <LibraryStatus f={f} item={f.library_id != null ? libById.get(f.library_id) : undefined} loaded={!!lib.items} run={run} />
            <FixtureForm key={f.id} f={f} qtyTotal={q[f.id]?.total ?? 0} setField={(k, v) => patch(f.id, k)(v)} run={run} onDeleted={() => setSel(null)} />
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

function FixtureForm({ f, qtyTotal, setField, run, onDeleted }: { f: Fixture; qtyTotal: number; setField: (k: string, v: string | number | null) => void; run: (fn: () => Promise<unknown>) => Promise<void>; onDeleted: () => void }) {
  const imgBox = (kind: 'photo' | 'drawing', file: string | null, label: string) => ImgBox({ f, kind, file, label, run });
  return (
    <>
      <div className="row between">
        <h2><FixtureChip f={f} /> <span className="muted">ใช้ในแปลน {qty(qtyTotal)}{f.unit === 'm' ? ' ม.' : ' ชุด'}</span></h2>
        <ConfirmButton label="ลบรหัสนี้" onConfirm={() => run(async () => { await api('DELETE', `/api/fixtures/${f.id}`); onDeleted(); })} />
      </div>
      <div className="card">
        <h3>สัญลักษณ์บนแปลน</h3>
        <div className="symgrid">
          {SYMBOLS.map((s) => {
            const lineNow = isLineSymbol(f.symbol);
            const blocked = (s.geometry === 'line') !== lineNow && qtyTotal > 0;
            return (
              <button key={s.kind} disabled={blocked} title={blocked ? 'ลบจุด/เส้นที่ใช้รหัสนี้ก่อนจึงจะเปลี่ยนชนิดได้' : ''} className={`sym ${f.symbol === s.kind ? 'on' : ''}`} onClick={() => setField('symbol', s.kind)}>
                <SymbolIcon kind={s.kind} color={f.color} size={34} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="row gap center-y">
          <span className="muted">สี</span>
          {(Object.keys(COLORS) as ColorKey[]).map((c) => (
            <button key={c} className={`swatch ${f.color === c ? 'on' : ''}`} style={{ background: COLORS[c] }} onClick={() => setField('color', c)} title={COLOR_LABEL[c]} aria-label={COLOR_LABEL[c]} />
          ))}
          <span className="muted">หน่วย</span>
          <select value={f.unit} onChange={(e) => setField('unit', e.target.value)}>
            <option value="ea">ชุด (ea)</option>
            <option value="m">เมตร (m) — ไฟเส้น/ราง</option>
          </select>
        </div>
        {f.symbol === 'linear' && <LengthPicker value={f.length_m} onChange={(v) => setField('length_m', v)} />}
      </div>
      <div className="card form">
        <FxField f={f} setField={setField} k="code" label="รหัส (เช่น LT1)" />
        <FxField f={f} setField={setField} k="model" label="รุ่น (Model)" />
        <FxField f={f} setField={setField} k="name" label="ชื่อ / ประเภท" wide />
        <FxField f={f} setField={setField} k="finish" label="สี / ผิว (Finish)" />
        <FxField f={f} setField={setField} k="socket" label="ขั้วหลอด" ph="E27, G9, GU10…" />
        <FxField f={f} setField={setField} k="bulbs" label="จำนวนหลอด" type="number" />
        <FxField f={f} setField={setField} k="watt_per_lamp" label={f.unit === 'm' ? 'วัตต์ต่อเมตร (W/m)' : 'วัตต์ต่อหลอด (W)'} type="number" />
        <FxField f={f} setField={setField} k="watt_total" label="วัตต์รวมต่อชุด (ถ้าไม่ใช้หลอด)" type="number" />
        <FxField f={f} setField={setField} k="kelvin" label="อุณหภูมิสี (K)" type="number" />
        <FxField f={f} setField={setField} k="ip" label="IP" />
        <FxField f={f} setField={setField} k="price" label={`ราคา/${f.unit === 'm' ? 'เมตร' : 'ชุด'} (ก่อน VAT)`} type="number" ph="เว้นว่าง = รอราคา" />
        <FxField f={f} setField={setField} k="supplier" label="ซัพพลายเออร์ / ร้านไฟ" />
        <FxField f={f} setField={setField} k="spec_qty" label="จำนวนตามสเปคชีท (ไว้เทียบกับแปลน)" type="number" />
        <FxField f={f} setField={setField} k="note" label="หมายเหตุ" wide />
        <div className="muted wide">กำลังไฟต่อชุด: <b>{qty(unitWatt(f))} W{f.unit === 'm' ? '/m' : ''}</b></div>
      </div>
      <div className="card imgs">
        {imgBox('photo', f.photo_file, 'รูปโคม')}
        {imgBox('drawing', f.drawing_file, 'ภาพ Drawing / ขนาด')}
      </div>
    </>
  );
}

/** Pick a library item to copy into this project. */
function LibraryPicker({ items, codes, onPick, onClose }: { items: LibraryItem[] | null; codes: string[]; onPick: (it: LibraryItem, prefix: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [prefix, setPrefix] = useState(''); // '' = by the item's symbol
  const prefixFor = (it: LibraryItem) => prefix || PREFIX_BY_SYMBOL[it.symbol] || 'LT';
  const list = filterLibrary(items ?? [], q);
  return (
    <div className="card">
      <div className="row between">
        <h3>เพิ่มจากคลังโคม</h3>
        <button className="btn small ghost" onClick={onClose}>ปิด</button>
      </div>
      <p className="muted small">โคมที่เลือกจะถูกคัดลอกเข้าโปรเจกต์พร้อมรูปและราคาล่าสุด และได้รหัสถัดไปอัตโนมัติ (แก้รหัสได้ภายหลัง) — จัดการคลังได้ที่เมนู <a href="#/library"><u>คลังโคม</u></a></p>
      <input className="libsearch" type="search" autoFocus placeholder="ค้นหา รุ่น / ชื่อ / ซัพพลายเออร์ / หมวด" value={q} onChange={(e) => setQ(e.target.value)} />
      <PrefixChooser value={prefix} onChange={setPrefix} allowAuto />
      {!items ? <div className="muted">กำลังโหลด…</div> : (
        <div className="pick">
          {list.map((it) => (
            <button key={it.id} className="pickrow" onClick={() => onPick(it, prefixFor(it))}>
              <span className="thumb">{it.photo_file ? <img src={fileUrl(it.photo_file)} alt="" /> : <SymbolIcon kind={it.symbol} color={it.color} size={30} />}</span>
              <span className="grow">
                <b>{it.model || 'ยังไม่ระบุรุ่น'}</b> <span className="muted">{it.name}</span>
                <span className="block muted small">{[it.category, libSpec(it), it.supplier].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={it.price == null ? 'warn small' : 'small'}>{libPrice(it)}</span>
              <span className="btn small">+ เพิ่มเป็น <span className="code">{nextCode(codes, prefixFor(it))}</span></span>
            </button>
          ))}
          {list.length === 0 && <div className="muted small">{items.length ? 'ไม่พบรายการที่ค้นหา' : 'คลังยังว่าง — บันทึกโคมจากโปรเจกต์เข้าคลังด้วยปุ่ม “บันทึกเข้าคลัง” ในหน้าสเปคของแต่ละรหัส'}</div>}
        </div>
      )}
    </div>
  );
}

const showVal = (field: Change['field'], v: unknown) =>
  v == null || v === '' ? '—' : field === 'photo_file' || field === 'drawing_file' ? 'มีรูป' : field === 'price' ? money(Number(v)) : String(v);

/** Link between this project fixture and the central library, with update / save / push actions. */
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
  if (!item) return <div className="libstatus"><span className="muted small">รายการในคลังถูกลบไปแล้ว — ข้อมูลในโปรเจกต์ยังอยู่ครบ</span></div>;
  const changes = libraryChanges(f, item);
  if (hasLibraryUpdate(f, item)) {
    return (
      <div className="libstatus update">
        <div className="grow">
          <b>คลังมีข้อมูลใหม่</b> <span className="muted small">(แก้ไข {item.updated_at.slice(0, 16)})</span>
          <table className="tbl changes">
            <thead><tr><th>ช่อง</th><th>ในโปรเจกต์</th><th>ในคลัง</th></tr></thead>
            <tbody>{changes.map((c) => <tr key={c.field}><td>{FIELD_LABEL[c.field]}</td><td className="muted">{showVal(c.field, c.from)}</td><td><b>{showVal(c.field, c.to)}</b></td></tr>)}</tbody>
          </table>
          <div className="muted small">สีบนแปลนและรหัสของโปรเจกต์จะไม่ถูกเปลี่ยน</div>
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

/** Code prefix buttons (DL, WL, PD …) plus a box for any other prefix. */
function PrefixChooser({ value, onChange, allowAuto }: { value: string; onChange: (p: string) => void; allowAuto?: boolean }) {
  const custom = value !== '' && !PREFIX_CHOICES.includes(value);
  return (
    <div className="prefixes">
      <span className="muted small">ตัวนำหน้ารหัส</span>
      {allowAuto && <button className={`chipbtn ${value === '' ? 'on' : ''}`} onClick={() => onChange('')} title="DL ดาวน์ไลท์, WL ไฟกิ่ง, PD โคมแขวน …">ตามชนิดโคม</button>}
      {PREFIX_CHOICES.map((p) => <button key={p} className={`chipbtn code ${value === p ? 'on' : ''}`} onClick={() => onChange(p)}>{p}</button>)}
      <input className={`w70 code ${custom ? 'on' : ''}`} placeholder="อื่น ๆ" value={custom ? value : ''} maxLength={6} onChange={(e) => onChange(e.target.value ? cleanPrefix(e.target.value) : allowAuto ? '' : 'LT')} />
    </div>
  );
}

/** New fixture: pick the plan symbol and the code prefix; the number is filled in (brand format PREFIX-NN). */
function NewFixture({ codes, onCreate, onClose }: { codes: string[]; onCreate: (symbol: SymbolKind, prefix: string) => void; onClose: () => void }) {
  const [symbol, setSymbol] = useState<SymbolKind>('downlight');
  const [prefix, setPrefix] = useState(PREFIX_BY_SYMBOL.downlight);
  const [touched, setTouched] = useState(false); // once the user picks a prefix, changing the symbol keeps it
  const code = nextCode(codes, prefix);
  return (
    <div className="card">
      <div className="row between">
        <h3>เพิ่มรหัสโคมใหม่</h3>
        <button className="btn small ghost" onClick={onClose}>ปิด</button>
      </div>
      <div className="symgrid">
        {SYMBOLS.map((s) => (
          <button key={s.kind} className={`sym ${symbol === s.kind ? 'on' : ''}`} onClick={() => { setSymbol(s.kind); if (!touched) setPrefix(PREFIX_BY_SYMBOL[s.kind] ?? 'LT'); }}>
            <SymbolIcon kind={s.kind} color="red" size={34} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <PrefixChooser value={prefix} onChange={(p) => { setPrefix(p || 'LT'); setTouched(true); }} />
      <div className="row gap center-y mt">
        <span className="muted">รหัสที่จะได้</span>
        <b className="code bigcode">{code}</b>
        <div className="grow" />
        <button className="btn primary" onClick={() => onCreate(symbol, prefix)}>สร้าง {code}</button>
      </div>
      <p className="muted small">เลขต่อจากรหัสเดิมที่ขึ้นต้นเหมือนกันในโปรเจกต์นี้ (เช่น DL-01, DL-02 …) แก้รหัสเองได้ภายหลังในฟอร์ม</p>
    </div>
  );
}
