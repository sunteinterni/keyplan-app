import { useEffect, useState } from 'react';
import { api } from '../api';
import type { User } from '../../../shared/types';
import { ConfirmButton } from '../ui';

export function Users({ me, toast }: { me: User; toast: (m: string) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [f, setF] = useState({ email: '', name: '', password: '', role: 'member' });
  const [pw, setPw] = useState({ old: '', next: '' });
  const admin = me.role === 'admin';
  const load = async () => {
    if (admin) setUsers(await api<User[]>('GET', '/api/users'));
  };
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      await load();
    } catch (x) {
      toast((x as Error).message);
    }
  };
  return (
    <main className="page narrow">
      <div className="eyebrow">TEAM · Team</div>
      <h1>ทีม / บัญชี</h1>
      <section className="card">
        <h3>เปลี่ยนรหัสผ่านของฉัน</h3>
        <div className="row gap">
          <input type="password" placeholder="รหัสผ่านเดิม" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
          <input type="password" placeholder="รหัสผ่านใหม่ (8 ตัวขึ้นไป)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="btn" onClick={() => act(async () => { await api('POST', '/api/me/password', { current: pw.old, next: pw.next }); setPw({ old: '', next: '' }); }, 'เปลี่ยนรหัสผ่านแล้ว')}>บันทึก</button>
        </div>
      </section>
      {admin ? (
        <section className="card">
          <h3>สมาชิกทีม</h3>
          <table className="tbl">
            <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id} onChange={(e) => act(() => api('PATCH', `/api/users/${u.id}`, { role: e.target.value }))}>
                      <option value="admin">ผู้ดูแล</option>
                      <option value="member">สมาชิก</option>
                    </select>
                  </td>
                  <td className="right">{u.id !== me.id && <ConfirmButton label="ลบ" onConfirm={() => act(() => api('DELETE', `/api/users/${u.id}`))} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>เพิ่มสมาชิก</h4>
          <div className="row gap wrap">
            <input placeholder="อีเมล" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <input placeholder="ชื่อ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input type="password" placeholder="รหัสผ่านเริ่มต้น" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="member">สมาชิก</option>
              <option value="admin">ผู้ดูแล</option>
            </select>
            <button className="btn primary" onClick={() => act(async () => { await api('POST', '/api/users', f); setF({ email: '', name: '', password: '', role: 'member' }); }, 'เพิ่มสมาชิกแล้ว')}>+ เพิ่ม</button>
          </div>
        </section>
      ) : (
        <p className="muted">เฉพาะผู้ดูแลระบบที่เพิ่มหรือลบสมาชิกได้</p>
      )}
    </main>
  );
}
