import { useCallback, useEffect, useState } from 'react';
import { api, useToast } from './api';
import type { User } from '../../shared/types';
import { Projects } from './pages/Projects';
import { Users } from './pages/Users';
import { Library } from './pages/Library';
import { Categories } from './pages/Categories';
import { ProjectView } from './pages/ProjectView';
import { Logo } from './ui';

interface AuthState {
  needsSetup: boolean;
  user: User | null;
}

function useHash() {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => {
    const f = () => setH(location.hash || '#/');
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

function Login({ needsSetup, onDone }: { needsSetup: boolean; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api('POST', needsSetup ? '/api/auth/setup' : '/api/auth/login', { email, name, password: pw });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="login">
      <section className="login-hero">
        <Logo h={56} />
        <p className="concept">Plan. Price.<br />Your home.</p>
        <p className="concept-th">แปลน รายการวัสดุ และราคา ในที่เดียว</p>
        <p className="muted">จากแปลนและรหัสสินค้า สู่ BOQ ใบเสนอราคา และสเปคสำหรับลูกค้า สำหรับนักออกแบบภายในและสถาปนิก</p>
        <p className="studio">KEYPLAN · คีย์แปลน · BETA</p>
      </section>
      <div className="login-side">
        <form className="card login-card" onSubmit={submit}>
          <h1>{needsSetup ? 'ตั้งค่าครั้งแรก' : 'เข้าสู่ระบบ'}</h1>
          {needsSetup && <p className="muted">สร้างบัญชีผู้ดูแลคนแรก แล้วเพิ่มสมาชิกทีมได้ภายหลัง</p>}
          <label className="field"><span>อีเมล</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
          {needsSetup && <label className="field"><span>ชื่อที่แสดง</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <label className="field"><span>รหัสผ่าน{needsSetup ? ' (อย่างน้อย 8 ตัว)' : ''}</span><input type="password" autoComplete={needsSetup ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary" type="submit">{needsSetup ? 'สร้างบัญชีและเริ่มใช้งาน' : 'เข้าสู่ระบบ'}</button>
        </form>
      </div>
    </div>
  );
}

const NAV: [string, string, string, string][] = [
  ['#/', 'PRJ', 'โปรเจกต์', 'Projects'],
  ['#/library', 'LIB', 'คลังสินค้า', 'Library'],
  ['#/categories', 'CAT', 'หมวดหมู่วัสดุ', 'Categories'],
  ['#/users', 'TEAM', 'ทีม / บัญชี', 'Team'],
];

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const hash = useHash();
  const toast = useToast();
  const refresh = useCallback(async () => setAuth(await api<AuthState>('GET', '/api/auth/state')), []);
  useEffect(() => void refresh(), [refresh]);

  if (!auth) return <div className="center muted">กำลังโหลด…</div>;
  if (!auth.user) return <Login needsSetup={auth.needsSetup} onDone={refresh} />;
  const user = auth.user;

  const m = /^#\/p\/(\d+)(?:\/(\w+))?/.exec(hash);
  const logout = async () => {
    await api('POST', '/api/auth/logout');
    location.hash = '#/';
    await refresh();
  };
  const current = m ? '#/' : NAV.find(([h]) => h === hash)?.[0] ?? '#/';
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#/" aria-label="KEYPLAN · หน้าโปรเจกต์">
          <Logo h={36} />
          <span className="tagline">PLAN · PRICE · YOUR HOME</span>
        </a>
        {NAV.map(([h, code, th, en]) => (
          <a key={h} href={h} className={`nav ${current === h ? 'on' : ''}`} title={en}>
            <span className="navcode">{code}</span>{th}
          </a>
        ))}
        <div className="foot">
          <span className="muted small who trunc">{user.name}</span>
          <button className="btn small" onClick={logout}>ออกจากระบบ</button>
        </div>
      </aside>
      <div className="main">
        {toast.msg && <div className="toast" role="status" onClick={() => toast.show('')}>{toast.msg}</div>}
        {m ? <ProjectView key={m[1]} pid={Number(m[1])} tab={m[2] ?? 'plan'} toast={toast.show} />
          : hash === '#/users' ? <Users me={user} toast={toast.show} />
          : hash === '#/library' ? <Library me={user} toast={toast.show} />
          : hash === '#/categories' ? <Categories me={user} toast={toast.show} />
          : <Projects toast={toast.show} />}
      </div>
    </div>
  );
}
