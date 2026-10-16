import { useCallback, useEffect, useState } from 'react';
import { api, useToast } from './api';
import type { User } from '../../shared/types';
import { Projects } from './pages/Projects';
import { Users } from './pages/Users';
import { Library } from './pages/Library';
import { ProjectView } from './pages/ProjectView';
import { Logo, Motif } from './ui';

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
        <Logo h={88} />
        <p className="concept">
          แสงคือทฤษฎี
          <br />
          ที่พิสูจน์ได้
          <br />
          ในพื้นที่จริง
        </p>
        <p className="concept-en">light is a theory, proven in space.</p>
        {/* graphic language: at most two elements per piece — a light beam and one hand-written note */}
        <div className="login-motifs">
          <Motif name="beam" width={110} weight="standard" />
          <p className="hand-note">light the plan,<br />not the guess.</p>
        </div>
        <p className="studio">architectural lighting studio, bangkok · Lighting Platform</p>
      </section>
      <form className="card login-card" onSubmit={submit}>
        <h1>{needsSetup ? 'ตั้งค่าครั้งแรก' : 'เข้าสู่ระบบ'}</h1>
        {needsSetup && <p className="muted">สร้างบัญชีผู้ดูแลระบบคนแรก (เพิ่มสมาชิกทีมได้ภายหลัง)</p>}
        <label className="field"><span>อีเมล</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></label>
        {needsSetup && <label className="field"><span>ชื่อที่แสดง</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>}
        <label className="field"><span>รหัสผ่าน{needsSetup ? ' (อย่างน้อย 8 ตัว)' : ''}</span><input type="password" autoComplete={needsSetup ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" type="submit">{needsSetup ? 'สร้างบัญชีและเริ่มใช้งาน' : 'เข้าสู่ระบบ'}</button>
      </form>
    </div>
  );
}

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
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="light theory · หน้าโปรเจกต์">
          <Logo h={34} />
          <span className="brand-sub">Lighting Platform</span>
        </a>
        <nav>
          <a href="#/" className={!m && hash !== '#/users' && hash !== '#/library' ? 'on' : ''}>โปรเจกต์</a>
          <a href="#/library" className={hash === '#/library' ? 'on' : ''}>คลังโคม</a>
          <a href="#/users" className={hash === '#/users' ? 'on' : ''}>ทีม / บัญชี</a>
        </nav>
        <div className="grow" />
        <span className="muted who">{user.name}</span>
        <button className="btn ghost" onClick={logout}>ออกจากระบบ</button>
      </header>
      {toast.msg && <div className="toast" onClick={() => toast.show('')}>{toast.msg}</div>}
      {m ? <ProjectView key={m[1]} pid={Number(m[1])} tab={m[2] ?? 'plan'} toast={toast.show} /> : hash === '#/users' ? <Users me={user} toast={toast.show} /> : hash === '#/library' ? <Library me={user} toast={toast.show} /> : <Projects toast={toast.show} />}
    </div>
  );
}
