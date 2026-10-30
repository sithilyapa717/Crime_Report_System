// A12: the Times, Cash and Seized-items tabs of CR entry, in the old colours (§1.8):
// orange = times, blue = cash, purple = seized quantities. Cash and seized items are tables.
import type { ReactNode } from 'react';
import { label } from '@excise/labels';
import {
  ChipListField,
  FieldGrid,
  FormSection,
  NumberField,
  formatMoney,
  TextArea,
  TextField,
  TimeField,
} from '../../design-system/index.js';
import {
  DENOMINATIONS,
  SEIZED,
  cashTotal,
  splitSerials,
  type CrDraft,
  type Denomination,
} from '../shared/cr-model.js';
import './tabs.css';

export interface TabProps {
  draft: CrDraft;
  set: (change: (d: CrDraft) => CrDraft) => void;
  errors: Record<string, string>;
}

const TIMES = [
  ['arrival', 'times.arrival'],
  ['bcLeaving', 'times.bcLeaving'],
  ['iprLeaving', 'times.iprLeaving'],
  ['detection', 'times.detection'],
  ['afterDetection', 'times.afterDetection'],
] as const;

export function TimesTab({ draft, set, errors }: TabProps) {
  return (
    <FormSection title={label('tab.times')} tone="times">
      <FieldGrid>
        {TIMES.map(([key, caption]) => (
          <TimeField
            key={key}
            label={label(caption)}
            value={draft.times[key]}
            error={errors[`times.${key}`]}
            onChange={(v) => set((d) => ({ ...d, times: { ...d.times, [key]: v } }))}
          />
        ))}
      </FieldGrid>
    </FormSection>
  );
}

/** Fixed rows for data entry, styled as the design-system table but without sorting (Figma 06.5/06.6). */
function EntryTable<R>({
  caption,
  narrow,
  headings,
  rows,
  rowKey,
  cells,
  foot,
}: {
  caption: string;
  narrow?: boolean;
  headings: { title: string; numeric?: boolean }[];
  rows: readonly R[];
  rowKey: (row: R) => string;
  cells: (row: R) => ReactNode[];
  /** A totals row under the table, one cell per heading. */
  foot?: ReactNode[];
}) {
  return (
    <div className={narrow ? 'cr-tabs-table cr-tabs-table--narrow' : 'cr-tabs-table'}>
      <div className="ex-table-wrap">
        <table className="ex-table">
          <caption className="ex-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {headings.map((h) => (
                <th key={h.title} className={h.numeric ? 'num' : undefined}>
                  {h.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)}>
                {cells(r).map((c, i) => (
                  <td key={i} className={headings[i]?.numeric ? 'num' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {foot && (
            <tfoot>
              <tr>
                {foot.map((c, i) => (
                  <td key={i} className={headings[i]?.numeric ? 'num' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** One row per note, with the notes used and the notes left over side by side (Figma 06.5). */
export function CashTab({ draft, set, errors }: TabProps) {
  // The inputs keep the old "Rs 1000" names that the e2e CR flow looks for.
  const cell = (kind: 'used' | 'left', n: Denomination) => (
    <TextField
      label={`Rs ${n}`}
      value={draft.cash[`${kind}:${n}`] ?? ''}
      onChange={(v) => set((d) => ({ ...d, cash: { ...d.cash, [`${kind}:${n}`]: v } }))}
    />
  );
  return (
    <>
      <EntryTable
        caption={label('tab.cash')}
        narrow
        headings={[
          { title: label('cash.note') },
          { title: label('cash.used'), numeric: true },
          { title: label('cash.left'), numeric: true },
        ]}
        rows={DENOMINATIONS}
        rowKey={String}
        cells={(n) => [`${label('cash.rupees')} ${n}`, cell('used', n), cell('left', n)]}
        foot={[
          label('cash.total'),
          <output key="used" aria-label={`${label('cash.used')}: ${label('cash.total')}`}>
            {label('cash.rupees')} {formatMoney(cashTotal(draft.cash, 'used') * 100)}
          </output>,
          <output key="left" aria-label={`${label('cash.left')}: ${label('cash.total')}`}>
            {label('cash.rupees')} {formatMoney(cashTotal(draft.cash, 'left') * 100)}
          </output>,
        ]}
      />
      <FieldGrid>
        <TextField
          label={label('cash.foundPlace')}
          value={draft.cashFoundPlace}
          error={errors.cashFoundPlace}
          onChange={(v) => set((d) => ({ ...d, cashFoundPlace: v }))}
        />
      </FieldGrid>
      {/* One list for all the serial numbers. Older records kept them in two boxes; both are shown
          here and saved together in the first. */}
      <ChipListField
        label={label('cash.serials')}
        hint={label('cash.serialsHint')}
        placeholder={label('cash.serialsPlaceholder')}
        addLabel={label('chips.add')}
        removeLabel={label('cr.remove')}
        countLabel={label('cash.serialsCount')}
        values={[...splitSerials(draft.cashSerials), ...splitSerials(draft.cashSerials1)]}
        onChange={(values) =>
          set((d) => ({ ...d, cashSerials: values.join(', '), cashSerials1: '' }))
        }
      />
    </>
  );
}

/** One row per item type with its quantity and unit, then the totals and productions (Figma 06.6). */
export function SeizedTab({ draft, set, errors }: TabProps) {
  return (
    <>
      <EntryTable
        caption={label('tab.seized')}
        headings={[
          { title: label('seized.item') },
          { title: label('cr.quantity'), numeric: true },
          { title: label('seized.unit') },
        ]}
        rows={SEIZED}
        rowKey={(r) => r.type}
        cells={({ type, unit }) => [
          label(`seized.${type}`),
          <NumberField
            key="quantity"
            decimals
            label={label(`seized.${type}`)}
            value={draft.seized[type]?.quantity}
            onChange={(q) =>
              set((d) => ({
                ...d,
                seized: { ...d.seized, [type]: { ...d.seized[type], quantity: q } },
              }))
            }
          />,
          unit,
        ]}
      />
      <FieldGrid>
        <NumberField
          label={label('cr.quantity')}
          hint={label('cr.quantityHint')}
          value={draft.quantity}
          error={errors.quantity}
          onChange={(v) => set((d) => ({ ...d, quantity: v }))}
        />
        <NumberField
          label={label('cr.quantityExtra')}
          hint={label('cr.quantityExtraHint')}
          value={draft.quantityExtra}
          error={errors.quantityExtra}
          onChange={(v) => set((d) => ({ ...d, quantityExtra: v }))}
        />
        <NumberField
          label={label('cr.overQuantity')}
          value={draft.overQuantity}
          error={errors.overQuantity}
          onChange={(v) => set((d) => ({ ...d, overQuantity: v }))}
        />
      </FieldGrid>
      {(['cr.productions', 'cr.production1', 'cr.production2'] as const).map((caption, i) => (
        <TextArea
          key={caption}
          label={label(caption)}
          value={draft.productions[i]!}
          onChange={(v) =>
            set((d) => {
              const productions = [...d.productions] as CrDraft['productions'];
              productions[i] = v;
              return { ...d, productions };
            })
          }
        />
      ))}
    </>
  );
}
