import { useBundle } from '../api';
import { issues } from '../../../shared/calc';
import { InfoTab } from './InfoTab';
import { PlanTab } from './PlanTab';
import { SpecsTab } from './SpecsTab';
import { CircuitsTab } from './CircuitsTab';
import { QuoteTab } from './QuoteTab';
import { ExportTab } from './ExportTab';

const TABS: [string, string][] = [
  ['info', 'ข้อมูลโครงการ'],
  ['plan', 'แปลน'],
  ['specs', 'สเปคโคม'],
  ['circuits', 'วงจร / Load Schedule'],
  ['quote', 'ใบเสนอราคา'],
  ['export', 'Export'],
];

export function ProjectView({ pid, tab, toast }: { pid: number; tab: string; toast: (m: string) => void }) {
  const { bundle, setBundle, reload, error } = useBundle(pid);
  if (error) return <main className="page"><div className="error">{error}</div><a href="#/">← กลับ</a></main>;
  if (!bundle) return <div className="center muted">กำลังโหลดโปรเจกต์…</div>;
  const n = issues(bundle).filter((i) => i.level === 'crit').length;
  const props = { bundle, setBundle, reload, toast };
  return (
    <div className="project">
      <div className="ptabs">
        <a href="#/" className="back">←</a>
        <div className="ptitle">{bundle.project.name}</div>
        {TABS.map(([k, label]) => (
          <a key={k} href={`#/p/${pid}/${k}`} className={tab === k ? 'on' : ''}>
            {label}
            {k === 'export' && n > 0 && <span className="badge">{n}</span>}
          </a>
        ))}
      </div>
      {tab === 'info' && <InfoTab {...props} />}
      {tab === 'plan' && <PlanTab {...props} />}
      {tab === 'specs' && <SpecsTab {...props} />}
      {tab === 'circuits' && <CircuitsTab {...props} />}
      {tab === 'quote' && <QuoteTab {...props} />}
      {tab === 'export' && <ExportTab {...props} />}
    </div>
  );
}
