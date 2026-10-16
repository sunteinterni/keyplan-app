import ExcelJS from 'exceljs';
import { boq, isLighting, lampText, loadSchedule } from '../shared/calc';
import { unitTh } from '../shared/categories';
import type { Bundle } from '../shared/types';

export async function buildXlsx(b: Bundle): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KEYPLAN';
  const r = boq(b);
  const ws = wb.addWorksheet('BOQ');
  ws.addRow([b.project.name]).font = { bold: true, size: 14 };
  ws.addRow([`${b.project.client} · ${b.project.location} · ${b.project.doc_date}`]);
  ws.addRow([]);
  const head = ws.addRow(['ลำดับ', 'รหัส', 'รายการ', 'รุ่น', 'สเปค', 'จำนวน', 'หน่วย', 'ราคา/หน่วย', 'รวมเงิน', 'ซัพพลายเออร์', 'ห้อง']);
  head.font = { bold: true };
  let n = 0;
  for (const g of r.groups) {
    const gr = ws.addRow(['', g.category.prefix, `${g.category.name_th}${g.category.name_en ? ` / ${g.category.name_en}` : ''}`, '', '', '', '', 'รวมหมวด', g.sub]);
    gr.font = { bold: true };
    for (const row of g.rows) {
      const f = row.fixture;
      const spec = (isLighting(f) ? [lampText(f), f.kelvin ? `${f.kelvin}K` : ''] : [f.size, f.finish]).filter(Boolean).join(' ');
      ws.addRow([++n, f.code, f.name, f.model, spec, row.qty.total, unitTh(f.unit), row.price ?? 'รอราคา', row.price != null ? row.amount : null, f.supplier, f.room]);
    }
  }
  ws.addRow([]);
  const sum = (label: string, v: number) => {
    const x = ws.addRow(['', '', '', '', '', '', '', label, v]);
    x.getCell(9).numFmt = '#,##0.00';
  };
  sum('รวมเป็นเงิน', r.sub);
  if (r.discount) sum('ส่วนลด', -r.discount);
  if (r.install) sum('ค่าติดตั้ง', r.install);
  sum('ก่อนภาษี', r.base);
  sum(`VAT ${b.project.vat_rate}%`, r.vat);
  sum('ยอดรวมสุทธิ', r.grand);
  [8, 9].forEach((c) => ws.getColumn(c).numFmt = '#,##0.00');
  ws.columns.forEach((c, i) => (c.width = [7, 9, 28, 20, 24, 9, 7, 13, 14, 18, 16][i] ?? 12));

  const ls = loadSchedule(b);
  if (!ls.rows.length && !ls.unassigned) return Buffer.from(await wb.xlsx.writeBuffer());
  const w2 = wb.addWorksheet('Load Schedule');
  w2.addRow(['วงจร', 'พื้นที่', 'โคมในวงจร', 'ชุด', 'เมตร', 'วัตต์', 'แอมป์', 'เบรกเกอร์ (A)']).font = { bold: true };
  const row = (x: (typeof ls.rows)[number], name: string) =>
    w2.addRow([name, x.circuit?.area ?? '', x.items.map((i) => `${i.fixture.code}×${i.qty}`).join(', '), x.pieces, Math.round(x.meters * 10) / 10, Math.round(x.watts), x.amps, x.circuit?.breaker_a ?? null]);
  ls.rows.forEach((x) => row(x, x.circuit?.name ?? ''));
  if (ls.unassigned) row(ls.unassigned, 'ยังไม่ระบุวงจร');
  w2.addRow(['รวม', '', '', ls.totalPieces, Math.round(ls.totalMeters * 10) / 10, Math.round(ls.totalWatts), ls.totalAmps]).font = { bold: true };
  w2.columns.forEach((c, i) => (c.width = [14, 20, 50, 8, 8, 10, 10, 14][i] ?? 12));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
