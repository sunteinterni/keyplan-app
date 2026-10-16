import { useBundle } from '../api';
import { issues } from '../../../shared/calc';
import { LIGHTING } from '../../../shared/categories';
import { InfoTab } from './InfoTab';
import { PlanTab } from './PlanTab';
import { ItemsTab } from './ItemsTab';
import { CircuitsTab } from './CircuitsTab';
import { QuoteTab } from './QuoteTab';
import { ExportTab } from './ExportTab';

// product map codes from the guideline: PRJ, PLN, ITM, BOQ …
const TABS: [string, string, string][] = [
  ['info', 'PRJ', 'ข้อมูลโครงการ'],
  ['plan', 'PLN', 'แปลน'],
  ['items', 'ITM', 'รายการ'],
  ['circuits', 'LV', 'วงจรไฟ'],
  ['quote', 'BOQ', 'BOQ / ใบเสนอราคา'],
  ['export', 'OUT', 'Export'],
];

export function ProjectView({ pid, tab, toast }: { pid: number; tab: string; toast: (m: string) => void }) {
  const { bundle, setBundle, reload, error } = useBundle(pid);
  if (error) return <main className="page"><div className="error">{error}</div><a href="#/">← กลับ</a></main>;
  if (!bundle) return <div className="center muted">กำลังโหลดโปรเจกต์…</div>;
  const n = issues(bundle).filter((i) => i.level === 'crit').length;
  const props = { bundle, setBundle, reload, toast };
  const t = tab === 'specs' ? 'items' : tab; // old Light Theory links
  // the circuits tab only matters once the project has lighting items (or circuits from before)
  const lighting = bundle.fixtures.some((f) => f.cat === LIGHTING) || bundle.circuits.length > 0;
  return (
    <div className="project">
      <div className="ptabs">
        <a href="#/" className="back" aria-label="กลับไปหน้าโปรเจกต์">←</a>
        <div className="ptitle" title={bundle.project.name}>{bundle.project.name}</div>
        {TABS.filter(([k]) => k !== 'circuits' || lighting || t === 'circuits').map(([k, code, label]) => (
          <a key={k} href={`#/p/${pid}/${k}`} className={t === k ? 'on' : ''}>
            <span className="tcode">{code}</span>{label}
            {k === 'export' && n > 0 && <span className="badge">{n}</span>}
          </a>
        ))}
      </div>
      {t === 'info' && <InfoTab {...props} />}
      {t === 'plan' && <PlanTab {...props} />}
      {t === 'items' && <ItemsTab {...props} />}
      {t === 'circuits' && <CircuitsTab {...props} />}
      {t === 'quote' && <QuoteTab {...props} />}
      {t === 'export' && <ExportTab {...props} />}
    </div>
  );
}
