import { issues } from '../../../shared/calc';
import type { TabProps } from './common';

export function ExportTab({ bundle }: TabProps) {
  const id = bundle.project.id;
  const list = issues(bundle);
  return (
    <main className="page narrow">
      <h2>Export</h2>
      <section className="card">
        <h3>PDF A3 แนวนอน</h3>
        <p className="muted">แปลนต่อชั้น + Legend, หน้าโยงวงจร, สเปคชีท, Load Schedule และใบเสนอราคา (ตัวหนังสือเป็นข้อความจริง เลือก/ค้นหาได้)</p>
        <div className="row gap wrap">
          <a className="btn primary" href={`/api/projects/${id}/export.pdf?prices=1`}>⬇ PDF พร้อมราคา / ใบเสนอราคา</a>
          <a className="btn" href={`/api/projects/${id}/export.pdf?prices=0`}>⬇ PDF ไม่แสดงราคา</a>
        </div>
      </section>
      <section className="card">
        <h3>Excel</h3>
        <p className="muted">BOQ และ Load Schedule สำหรับแก้ไขต่อหรือส่งฝ่ายจัดซื้อ</p>
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
