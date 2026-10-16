import { useEffect, useState } from 'react';
import { api, type ProjectRow } from '../api';
import { ConfirmButton, Empty } from '../ui';

export function Projects({ toast }: { toast: (m: string) => void }) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [name, setName] = useState('');
  const load = async () => setRows(await api<ProjectRow[]>('GET', '/api/projects'));
  useEffect(() => void load(), []);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ id: number }>('POST', '/api/projects', { name });
      location.hash = `#/p/${r.id}/info`;
    } catch (x) {
      toast((x as Error).message);
    }
  };
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (x) {
      toast((x as Error).message);
    }
  };
  return (
    <main className="page">
      <div className="pagehead">
        <div>
          <div className="eyebrow">PRJ · Projects</div>
          <h1>โปรเจกต์</h1>
          <p className="sub">งานรีโนเวทแต่ละงาน มีแปลน รายการวัสดุ ราคา และเอกสารสำหรับลูกค้า</p>
        </div>
        <form className="row gap" onSubmit={create}>
          <input placeholder="ชื่อโปรเจกต์ใหม่" value={name} onChange={(e) => setName(e.target.value)} aria-label="ชื่อโปรเจกต์ใหม่" />
          <button className="btn primary" type="submit">+ สร้างโปรเจกต์</button>
        </form>
      </div>
      {rows && rows.length === 0 && <Empty>ยังไม่มีโปรเจกต์ ตั้งชื่อแล้วกด “สร้างโปรเจกต์” · No projects yet</Empty>}
      <div className="grid">
        {rows?.map((p) => (
          <div key={p.id} className="pcard">
            <div className="pat" aria-hidden />
            <div className="body">
              <span className="pcode">{p.project_no ? `PRJ ${p.project_no}` : `PRJ-${String(p.id).padStart(3, '0')}`}{p.revision ? ` · Rev.${p.revision}` : ''}</span>
              <a href={`#/p/${p.id}/plan`} className="pname">{p.name}</a>
              <div className="muted small">{p.client || '—'}</div>
              <div className="muted small">{p.floors} ชั้น · {p.items ?? 0} รายการ · {p.points} หมุด · แก้ไข {p.updated_at.slice(0, 10)}</div>
              <div className="actions">
                <a className="btn small" href={`#/p/${p.id}/plan`}>เปิด</a>
                <button className="btn small" onClick={() => act(() => api('POST', `/api/projects/${p.id}/duplicate`))}>ทำสำเนา</button>
                <ConfirmButton className="btn small danger" label="ลบ" onConfirm={() => act(() => api('DELETE', `/api/projects/${p.id}`))} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
