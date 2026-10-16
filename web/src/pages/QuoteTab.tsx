import { api } from '../api';
import { boq, lampText, issues } from '../../../shared/calc';
import { FixtureChip, Field, Txt, money, qty } from '../ui';
import type { TabProps } from './common';

export function QuoteTab({ bundle, reload, toast }: TabProps) {
  const r = boq(bundle);
  const p = bundle.project;
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const fx = (id: number, k: string) => (v: string) => run(() => api('PATCH', `/api/fixtures/${id}`, { [k]: k === 'price' ? (v === '' ? null : Number(v)) : v }));
  const pj = (k: string) => (v: string) => run(() => api('PATCH', `/api/projects/${p.id}`, { [k]: v }));
  const warn = issues(bundle).filter((i) => i.level === 'crit');
  return (
    <main className="page">
      <h2>ใบเสนอราคา / BOQ</h2>
      <p className="muted">จำนวนมาจากแปลนอัตโนมัติ · ใส่ราคาและซัพพลายเออร์ได้ที่นี่โดยตรง (เว้นว่าง = รอราคา)</p>
      {warn.length > 0 && <div className="banner">มี {warn.length} รายการที่ควรตรวจสอบก่อนส่งลูกค้า — ดูที่แท็บ Export</div>}
      <div className="card scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>รหัส</th><th>รายการ / รุ่น</th><th>สเปค</th>
              {bundle.floors.map((f) => <th key={f.id} className="right">{f.name}</th>)}
              <th className="right">รวม</th><th>หน่วย</th><th>ซัพพลายเออร์</th><th className="right">ราคา/หน่วย</th><th className="right">รวมเงิน</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => {
              const f = row.fixture;
              return (
                <tr key={f.id}>
                  <td><FixtureChip f={f} /></td>
                  <td>{f.name}<div className="muted small">{f.model}</div></td>
                  <td className="small">{[lampText(f), f.kelvin ? `${f.kelvin}K` : ''].filter(Boolean).join(' · ')}</td>
                  {bundle.floors.map((fl) => <td key={fl.id} className="right">{row.qty.perFloor[fl.id] ? qty(row.qty.perFloor[fl.id]) : '–'}</td>)}
                  <td className="right"><b>{qty(row.qty.total)}</b>{row.qty.uncalibrated > 0 && <span className="warn" title="มีเส้นบนชั้นที่ยังไม่ตั้งสเกล"> ⚠</span>}</td>
                  <td>{f.unit === 'm' ? 'ม.' : 'ชุด'}</td>
                  <td><Txt className="w140" value={f.supplier} onCommit={fx(f.id, 'supplier')} /></td>
                  <td className="right"><Txt className="w100 num" type="number" value={f.price} placeholder="รอราคา" onCommit={fx(f.id, 'price')} /></td>
                  <td className="right">{row.price != null ? money(row.amount) : <span className="muted">รอราคา</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="totals card">
        <div className="form compact">
          <Field label="ส่วนลด (บาท)"><Txt type="number" value={p.discount} onCommit={pj('discount')} /></Field>
          <Field label="ค่าติดตั้ง / ค่าบริการ (บาท)"><Txt type="number" value={p.install_fee} onCommit={pj('install_fee')} /></Field>
          <Field label="VAT (%)"><Txt type="number" value={p.vat_rate} onCommit={pj('vat_rate')} /></Field>
        </div>
        <div className="sum">
          <div><span>รวมเป็นเงิน</span><b>{money(r.sub)}</b></div>
          {r.discount > 0 && <div><span>ส่วนลด</span><b>-{money(r.discount)}</b></div>}
          {r.install > 0 && <div><span>ค่าติดตั้ง / ค่าบริการ</span><b>{money(r.install)}</b></div>}
          <div><span>ราคาก่อนภาษี</span><b>{money(r.base)}</b></div>
          <div><span>ภาษีมูลค่าเพิ่ม {p.vat_rate}%</span><b>{money(r.vat)}</b></div>
          <div className="grand"><span>ยอดรวมสุทธิ</span><b className="code">฿ {money(r.grand)}</b></div>
          {r.unpriced > 0 && <div className="warn small">* ยังรอราคา {r.unpriced} รายการ ไม่รวมในยอดนี้</div>}
        </div>
      </div>
    </main>
  );
}
