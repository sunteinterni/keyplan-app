import { api } from '../api';
import { boq, isLighting, issues, lampText, lightExtra, lightExtraText, quantities } from '../../../shared/calc';
import { STATUSES, STATUS_STYLE } from '../../../shared/brand';
import { unitTh } from '../../../shared/categories';
import { CatIcon, Field, FixtureChip, StatusChip, Txt, money, qty } from '../ui';
import type { TabProps } from './common';

/** BOQ / quotation: rows grouped by material category with a subtotal each, then discount, fees and VAT. */
export function QuoteTab({ bundle, reload, toast }: TabProps) {
  const r = boq(bundle);
  const q = quantities(bundle);
  const p = bundle.project;
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const fx = (id: number, k: string) => (v: string) => run(() => api('PATCH', `/api/fixtures/${id}`, { [k]: ['price', 'qty_manual'].includes(k) ? (v === '' ? null : Number(v)) : v }));
  const pj = (k: string) => (v: string) => run(() => api('PATCH', `/api/projects/${p.id}`, { [k]: v }));
  const warn = issues(bundle).filter((i) => i.level === 'crit');
  // manual items with no quantity yet are not in the BOQ; list them so they can be filled in here
  const missing = bundle.fixtures.filter((f) => q[f.id]?.manual && f.qty_manual == null);
  const cols = 9;
  return (
    <main className="page">
      <div className="pagehead">
        <div>
          <div className="eyebrow">BOQ · Bill of Quantities</div>
          <h1>BOQ / ใบเสนอราคา</h1>
          <p className="sub">จำนวนนับจากแปลนอัตโนมัติ หมวดงานพื้นที่และความยาวกรอกจำนวนเอง · ใส่ราคาได้ที่นี่ (เว้นว่าง = รอราคา)</p>
        </div>
        <a className="btn primary" href={`/api/projects/${p.id}/export.pdf?prices=1`}>⬇ PDF ใบเสนอราคา</a>
      </div>
      {warn.length > 0 && <div className="banner">มี {warn.length} รายการที่ควรตรวจก่อนส่งลูกค้า ดูที่แท็บ Export</div>}
      {missing.length > 0 && (
        <div className="card">
          <h4>ยังไม่กรอกจำนวน ({missing.length})</h4>
          <div className="row gap wrap">
            {missing.map((f) => (
              <label key={f.id} className="row gap"><FixtureChip f={f} /><Txt className="w90 num" type="number" value={f.qty_manual} placeholder="จำนวน" onCommit={fx(f.id, 'qty_manual')} /><span className="muted">{unitTh(f.unit)}</span></label>
            ))}
          </div>
        </div>
      )}
      <div className="card scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>รหัส</th><th>รายการ / รุ่น</th><th>สเปค</th><th>ห้อง</th>
              <th className="right">จำนวน</th><th>หน่วย</th><th className="right">ราคา/หน่วย</th><th className="right">รวมเงิน</th><th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {r.groups.map((g) => [
              <tr key={`g${g.category.prefix}`} className="group">
                <td colSpan={cols - 2}><span className="row gap"><CatIcon icon={g.category.icon} size={20} />{g.category.prefix} · {g.category.name_th} <span className="muted">{g.category.name_en}</span></span></td>
                <td className="right">{money(g.sub)}</td><td />
              </tr>,
              ...g.rows.map((row) => {
                const f = row.fixture;
                return (
                  <tr key={f.id}>
                    <td><FixtureChip f={f} /></td>
                    <td>{f.name || f.model}<div className="muted small">{f.name ? f.model : ''}</div></td>
                    <td className="small">{(isLighting(f) ? [lampText(f), f.kelvin ? `${f.kelvin}K` : '', lightExtraText(f)] : [f.size, f.finish]).filter(Boolean).join(' · ')}</td>
                    <td><Txt className="w100" value={f.room} placeholder="ห้อง" onCommit={fx(f.id, 'room')} /></td>
                    <td className="right">
                      {row.qty.manual
                        ? <span className="qtycell"><Txt className="w90 num" type="number" value={f.qty_manual} onCommit={fx(f.id, 'qty_manual')} /></span>
                        : <b>{qty(row.qty.total)}</b>}
                      {row.qty.uncalibrated > 0 && <span className="warn" title="มีเส้นบนชั้นที่ยังไม่ตั้งสเกล"> ⚠</span>}
                    </td>
                    <td>{unitTh(f.unit)}</td>
                    <td className="right">
                      <Txt className="w100 num" type="number" value={f.price} placeholder="รอราคา" onCommit={fx(f.id, 'price')} />
                      {lightExtra(f) > 0 && <div className="muted small" title="ราคาโคม + หลอด/Driver">+ {money(lightExtra(f))} = {row.price != null ? money(row.price) : 'รอราคา'}</div>}
                    </td>
                    <td className="right">{row.price != null ? money(row.amount) : <span className="muted">รอราคา</span>}</td>
                    <td>
                      <select className="statussel" aria-label={`สถานะ ${f.code}`} value={f.status} onChange={(e) => fx(f.id, 'status')(e.target.value)} style={{ background: STATUS_STYLE[f.status]?.bg, color: STATUS_STYLE[f.status]?.fg, borderColor: STATUS_STYLE[f.status]?.fg }}>
                        {STATUSES.map((s) => <option key={s} value={s}>● {STATUS_STYLE[s].th}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              }),
            ])}
            {r.rows.length === 0 && <tr><td colSpan={cols} className="muted">ยังไม่มีรายการที่มีจำนวน วางหมุดบนแปลน หรือกรอกจำนวนในแท็บรายการ</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="totals card">
        <div className="form compact">
          <Field label="ส่วนลด (บาท)"><Txt type="number" value={p.discount} onCommit={pj('discount')} /></Field>
          <Field label="ค่าติดตั้ง / ค่าบริการ (บาท)"><Txt type="number" value={p.install_fee} onCommit={pj('install_fee')} /></Field>
          <Field label="VAT (%)"><Txt type="number" value={p.vat_rate} onCommit={pj('vat_rate')} /></Field>
          <div className="wide row gap wrap muted small">สถานะ: {STATUSES.map((s) => <StatusChip key={s} s={s} />)}</div>
        </div>
        <div className="sum">
          <div><span>รวมเป็นเงิน</span><b>{money(r.sub)}</b></div>
          {r.discount > 0 && <div><span>ส่วนลด</span><b>-{money(r.discount)}</b></div>}
          {r.install > 0 && <div><span>ค่าติดตั้ง / ค่าบริการ</span><b>{money(r.install)}</b></div>}
          <div><span>ราคาก่อนภาษี</span><b>{money(r.base)}</b></div>
          <div><span>ภาษีมูลค่าเพิ่ม {p.vat_rate}%</span><b>{money(r.vat)}</b></div>
          <div className="grand"><span>ยอดรวมสุทธิ</span><b>฿ {money(r.grand)}</b></div>
          {r.unpriced > 0 && <div className="warn small">* ยังรอราคา {r.unpriced} รายการ ไม่รวมในยอดนี้</div>}
        </div>
      </div>
    </main>
  );
}
