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
      <div className="row between">
        <h1>โปรเจกต์</h1>
        <form className="row" onSubmit={create}>
          <input placeholder="ชื่อโปรเจกต์ใหม่" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" type="submit">+ สร้างโปรเจกต์</button>
        </form>
      </div>
      {rows && rows.length === 0 && <Empty motif="beam">ยังไม่มีโปรเจกต์ — ตั้งชื่อแล้วกด “สร้างโปรเจกต์” ได้เลย (หรือรัน <code>npm run seed:demo</code> เพื่อดูตัวอย่าง)<p className="hand-note">light the plan, not the guess.</p></Empty>}
      <div className="grid">
        {rows?.map((p) => (
          <div key={p.id} className="card project">
            <a href={`#/p/${p.id}/plan`} className="pname">{p.name}</a>
            <div className="muted">{[p.client, p.project_no && `#${p.project_no}`, p.revision && `Rev.${p.revision}`].filter(Boolean).join(' · ') || '—'}</div>
            <div className="muted small">{p.floors} ชั้น · {p.points} จุด · แก้ไขล่าสุด {p.updated_at.slice(0, 16)}</div>
            <div className="row gap">
              <a className="btn" href={`#/p/${p.id}/plan`}>เปิด</a>
              <button className="btn" onClick={() => act(() => api('POST', `/api/projects/${p.id}/duplicate`))}>ทำสำเนา</button>
              <ConfirmButton label="ลบ" onConfirm={() => act(() => api('DELETE', `/api/projects/${p.id}`))} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
