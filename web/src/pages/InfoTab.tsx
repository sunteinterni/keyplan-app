import { api } from '../api';
import { Field, Txt } from '../ui';
import type { Project } from '../../../shared/types';
import { LIGHTING } from '../../../shared/categories';
import type { TabProps } from './common';

export function InfoTab({ bundle, reload, toast }: TabProps) {
  const p = bundle.project;
  const save = (k: string) => async (v: string) => {
    try {
      await api('PATCH', `/api/projects/${p.id}`, { [k]: v });
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <main className="page narrow">
      <div className="pagehead"><div><div className="eyebrow">PRJ · Project</div><h1>ข้อมูลโครงการ</h1><p className="sub">แสดงบนหน้าปก หัวกระดาษ และส่วนท้ายของ PDF ทุกหน้า</p></div></div>
      <section className="card form">
        <PField p={p} save={save} k="name" label="ชื่อโครงการ" wide />
        <PField p={p} save={save} k="client" label="ลูกค้า / เจ้าของโครงการ" />
        <PField p={p} save={save} k="location" label="สถานที่" />
        <PField p={p} save={save} k="project_no" label="เลขที่โครงการ (Project No.)" />
        <PField p={p} save={save} k="revision" label="Revision" />
        <PField p={p} save={save} k="doc_date" label="วันที่เอกสาร" type="date" />
        <PField p={p} save={save} k="designer" label="ผู้ออกแบบ (Designer)" />
        <PField p={p} save={save} k="prepared_by" label="ผู้จัดทำ (Prepared by)" />
        <PField p={p} save={save} k="note" label="หมายเหตุท้ายใบเสนอราคา" wide area />
      </section>
      {(bundle.fixtures.some((f) => f.cat === LIGHTING) || bundle.circuits.length > 0) && (
        <>
          <h3>ค่าไฟฟ้าสำหรับ Load Schedule (หมวดไฟ)</h3>
          <section className="card form">
            <PField p={p} save={save} k="voltage" label="แรงดัน (V)" type="number" />
            <PField p={p} save={save} k="pf" label="Power Factor (0–1)" type="number" />
          </section>
        </>
      )}
    </main>
  );
}

function PField({ p, k, label, type, wide, area, save }: { p: Project; k: keyof Project; label: string; type?: string; wide?: boolean; area?: boolean; save: (k: string) => (v: string) => void }) {
  return (
    <Field label={label} wide={wide}>
      <Txt value={p[k] as string | number} onCommit={save(k)} type={type} area={area} />
    </Field>
  );
}
