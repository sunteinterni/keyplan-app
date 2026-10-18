import { LIGHT_TYPES, lightExtra, unitPrice, unitWatt } from '../../../shared/calc';
import { isLengthUnit, unitTh } from '../../../shared/categories';
import type { Fixture, LibraryItem } from '../../../shared/types';
import { Field, Txt, money, qty } from '../ui';

type Spec = Pick<Fixture, 'cat' | 'unit' | 'price' | 'light_type' | 'socket' | 'bulbs' | 'watt_per_lamp' | 'watt_total' | 'kelvin' | 'ip' | 'lamp_type' | 'lamp_price' | 'driver_type' | 'driver_price'> & Partial<Pick<Fixture, 'spec_qty'>>;
type Set = (k: string, v: string | number | null) => void;

/**
 * Lighting spec (category L) for an item or a library item. Three types, each with its own fields:
 * Built-in (integrated LED, one price) · Retrofit (lamp type + price per lamp) · Driver (driver type + price).
 */
export function LightSpec({ v, set, showSpecQty }: { v: Spec | LibraryItem; set: Set; showSpecQty?: boolean }) {
  const t = v.light_type ?? 'builtin';
  const perM = isLengthUnit(v.unit);
  const u = unitTh(v.unit);
  const F = ({ k, label, type, ph }: { k: keyof Spec; label: string; type?: string; ph?: string }) => (
    <Field label={label}>
      <Txt value={(v as Spec)[k] as string | number | null} type={type} placeholder={ph} onCommit={(x) => set(k, type === 'number' ? (x === '' ? null : Number(x)) : x)} />
    </Field>
  );
  const extra = lightExtra(v);
  const total = unitPrice(v);
  return (
    <>
      <div className="section-label">สเปคไฟ (เฉพาะหมวด L)</div>
      <div className="wide">
        <div className="field"><span>ประเภทโคม</span></div>
        <div className="seg lighttype" role="radiogroup" aria-label="ประเภทโคม">
          {LIGHT_TYPES.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={t === x.key} className={t === x.key ? 'on' : ''} title={x.en} onClick={() => t !== x.key && set('light_type', x.key)}>
              {x.th}
            </button>
          ))}
        </div>
        <div className="muted small">{LIGHT_TYPES.find((x) => x.key === t)?.note}</div>
      </div>

      {t === 'retrofit' && (
        <>
          {F({ k: 'socket', label: 'ขั้วหลอด', ph: 'E27, G9, GU10…' })}
          {F({ k: 'bulbs', label: 'จำนวนหลอดต่อชุด', type: 'number' })}
          {F({ k: 'lamp_type', label: 'ประเภทหลอด', ph: 'เช่น LED GU10 7W 3000K' })}
          {F({ k: 'watt_per_lamp', label: 'วัตต์ต่อหลอด (W)', type: 'number' })}
          {F({ k: 'lamp_price', label: 'ราคาหลอด (ต่อหลอด ก่อน VAT)', type: 'number', ph: 'เว้นว่าง = รอราคา' })}
        </>
      )}
      {t === 'driver' && (
        <>
          {perM ? F({ k: 'watt_per_lamp', label: 'วัตต์ต่อเมตร (W/m)', type: 'number' }) : F({ k: 'watt_total', label: 'วัตต์รวมต่อชุด (W)', type: 'number' })}
          {F({ k: 'driver_type', label: 'ประเภท Driver', ph: 'เช่น Constant voltage 24V 60W' })}
          {F({ k: 'driver_price', label: `ราคา Driver (ต่อ${u} ก่อน VAT)`, type: 'number', ph: 'เว้นว่าง = รอราคา' })}
        </>
      )}
      {t === 'builtin' && (perM ? F({ k: 'watt_per_lamp', label: 'วัตต์ต่อเมตร (W/m)', type: 'number' }) : F({ k: 'watt_total', label: 'วัตต์รวมต่อชุด (W)', type: 'number' }))}
      {F({ k: 'kelvin', label: 'อุณหภูมิสี (K)', type: 'number' })}
      {F({ k: 'ip', label: 'IP' })}
      {showSpecQty && F({ k: 'spec_qty', label: 'จำนวนตามสเปคชีท (ไว้เทียบกับแปลน)', type: 'number' })}
      <div className="muted wide">
        กำลังไฟ: <b className="mono">{qty(unitWatt(v as Fixture))} W{perM ? '/m' : ' ต่อชุด'}</b>
        {t !== 'builtin' && (
          <> · ราคาต่อ{u}ใน BOQ: <b className="mono">{v.price == null ? 'รอราคา' : `${money(v.price)} + ${money(extra)} = ${money(total ?? 0)}`}</b> <span className="small">(โคม + {t === 'retrofit' ? `หลอด ${v.bulbs && v.bulbs > 1 ? `${v.bulbs} หลอด` : ''}` : 'Driver'})</span></>
        )}
      </div>
    </>
  );
}
