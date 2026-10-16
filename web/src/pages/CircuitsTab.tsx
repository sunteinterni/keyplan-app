import { api } from '../api';
import { loadSchedule } from '../../../shared/calc';
import { ConfirmButton, Txt, qty } from '../ui';
import type { TabProps } from './common';

export function CircuitsTab({ bundle, reload, toast }: TabProps) {
  const ls = loadSchedule(bundle);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const add = () => {
    const nums = bundle.circuits.map((c) => parseInt(c.name.replace(/\D/g, ''), 10) || 0);
    const name = `LV-${String(Math.max(0, ...nums) + 1).padStart(2, '0')}`;
    return run(() => api('POST', `/api/projects/${bundle.project.id}/circuits`, { name }));
  };
  const set = (id: number, k: string) => (v: string) => run(() => api('PATCH', `/api/circuits/${id}`, { [k]: v }));
  const rowOf = (id: number | null) => ls.rows.find((r) => (r.circuit?.id ?? null) === id);
  const r2 = (n: number) => Math.round(n * 10) / 10;
  return (
    <main className="page">
      <div className="row between">
        <h2>วงจร และ Lighting Load Schedule</h2>
        <button className="btn primary" onClick={add}>+ เพิ่มวงจร</button>
      </div>
      <p className="muted">โยงโคมเข้าวงจรที่แท็บ “แปลน” → โหมด “โยงวงจร” แล้วคลิกโคมตามลำดับ · คำนวณแอมป์ = W ÷ ({bundle.project.voltage} V × PF {bundle.project.pf}) (ปรับได้ที่ “ข้อมูลโครงการ”)</p>
      <div className="card scroll">
        <table className="tbl">
          <thead>
            <tr><th>วงจร</th><th>พื้นที่ / โซน</th><th>เบรกเกอร์ (A)</th><th>โคมในวงจร</th><th className="right">ชุด</th><th className="right">เมตร</th><th className="right">วัตต์</th><th className="right">แอมป์</th><th /></tr>
          </thead>
          <tbody>
            {bundle.circuits.map((c) => {
              const r = rowOf(c.id);
              return (
                <tr key={c.id}>
                  <td><Txt className="w90" value={c.name} onCommit={set(c.id, 'name')} /></td>
                  <td><Txt value={c.area} onCommit={set(c.id, 'area')} placeholder="เช่น ห้องรับแขก" /></td>
                  <td><Txt className="w70" type="number" value={c.breaker_a} onCommit={set(c.id, 'breaker_a')} /></td>
                  <td className="items">{r?.items.map((i) => `${i.fixture.code} ×${qty(i.qty)}${i.fixture.unit === 'm' ? ' m' : ''}`).join(', ') || <span className="muted">ยังไม่มีโคม</span>}</td>
                  <td className="right">{r?.pieces ?? 0}</td>
                  <td className="right">{r?.meters ? r2(r.meters) : '–'}</td>
                  <td className="right">{Math.round(r?.watts ?? 0)}</td>
                  <td className="right">{(r?.amps ?? 0).toFixed(2)}{c.breaker_a && r && r.amps > c.breaker_a * 0.8 ? <span className="warn" title="เกิน 80% ของเบรกเกอร์"> ⚠</span> : null}</td>
                  <td className="right"><ConfirmButton label="ลบ" onConfirm={() => run(() => api('DELETE', `/api/circuits/${c.id}`))} /></td>
                </tr>
              );
            })}
            {ls.unassigned && (
              <tr className="unassigned">
                <td colSpan={3}><i>ยังไม่ระบุวงจร</i></td>
                <td className="items">{ls.unassigned.items.map((i) => `${i.fixture.code} ×${qty(i.qty)}`).join(', ')}</td>
                <td className="right">{ls.unassigned.pieces}</td>
                <td className="right">{ls.unassigned.meters ? r2(ls.unassigned.meters) : '–'}</td>
                <td className="right">{Math.round(ls.unassigned.watts)}</td>
                <td className="right">{ls.unassigned.amps.toFixed(2)}</td>
                <td />
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr><td colSpan={4}>รวมทั้งโครงการ</td><td className="right">{ls.totalPieces}</td><td className="right">{ls.totalMeters ? r2(ls.totalMeters) : '–'}</td><td className="right">{Math.round(ls.totalWatts)}</td><td className="right">{ls.totalAmps.toFixed(2)}</td><td /></tr>
          </tfoot>
        </table>
      </div>
    </main>
  );
}
