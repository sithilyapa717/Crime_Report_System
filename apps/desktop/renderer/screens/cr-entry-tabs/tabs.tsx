// A12: the Times, Cash and Seized-items tabs of CR entry, in the old colours (§1.8):
// orange = times, blue = cash, purple = seized quantities. Cash and seized items are tables.
import { label } from '@excise/labels';
import {
  FieldGrid,
  FormSection,
  NumberField,
  Table,
  TextArea,
  TextField,
  TimeField,
} from '../../design-system/index.js';
import { DENOMINATIONS, SEIZED, type CrDraft, type Denomination } from '../shared/cr-model.js';
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

/** One row per note, with the notes used and the notes left over side by side (Figma 06.5). */
export function CashTab({ draft, set, errors }: TabProps) {
  const cell = (kind: 'used' | 'left') => (n: Denomination) => (
    <TextField
      label={`Rs ${n}`}
      value={draft.cash[`${kind}:${n}`] ?? ''}
      onChange={(v) => set((d) => ({ ...d, cash: { ...d.cash, [`${kind}:${n}`]: v } }))}
    />
  );
  return (
    <FormSection title={label('tab.cash')} tone="cash">
      <div className="cr-tabs-table">
        <Table<Denomination>
          caption={label('tab.cash')}
          rows={DENOMINATIONS}
          rowKey={String}
          columns={[
            { key: 'note', title: label('tab.cash'), value: (n) => n, render: (n) => `Rs ${n}` },
            {
              key: 'used',
              title: label('cash.used'),
              value: (n) => draft.cash[`used:${n}`] ?? '',
              render: cell('used'),
            },
            {
              key: 'left',
              title: label('cash.left'),
              value: (n) => draft.cash[`left:${n}`] ?? '',
              render: cell('left'),
            },
          ]}
        />
      </div>
      <FieldGrid>
        <TextField
          label={label('cash.foundPlace')}
          value={draft.cashFoundPlace}
          error={errors.cashFoundPlace}
          onChange={(v) => set((d) => ({ ...d, cashFoundPlace: v }))}
        />
        <TextField
          label={label('cash.serials')}
          value={draft.cashSerials}
          onChange={(v) => set((d) => ({ ...d, cashSerials: v }))}
        />
        <TextField
          label={label('cash.serials1')}
          value={draft.cashSerials1}
          onChange={(v) => set((d) => ({ ...d, cashSerials1: v }))}
        />
      </FieldGrid>
    </FormSection>
  );
}

type SeizedRow = (typeof SEIZED)[number];

/** One row per item type with its quantity and unit, then the totals and productions (Figma 06.6). */
export function SeizedTab({ draft, set, errors }: TabProps) {
  return (
    <FormSection title={label('tab.seized')} tone="seized">
      <div className="cr-tabs-table">
        <Table<SeizedRow>
          caption={label('tab.seized')}
          rows={SEIZED}
          rowKey={(r) => r.type}
          columns={[
            { key: 'item', title: label('tab.seized'), value: (r) => label(`seized.${r.type}`) },
            {
              key: 'quantity',
              title: label('cr.quantity'),
              numeric: true,
              value: (r) => draft.seized[r.type]?.quantity ?? null,
              render: ({ type }) => (
                <NumberField
                  decimals
                  label={label(`seized.${type}`)}
                  value={draft.seized[type]?.quantity}
                  onChange={(q) =>
                    set((d) => ({
                      ...d,
                      seized: { ...d.seized, [type]: { ...d.seized[type], quantity: q } },
                    }))
                  }
                />
              ),
            },
            { key: 'unit', title: label('seized.unit'), value: (r) => r.unit },
          ]}
        />
      </div>
      <FieldGrid>
        <NumberField
          label={label('cr.quantity')}
          value={draft.quantity}
          error={errors.quantity}
          onChange={(v) => set((d) => ({ ...d, quantity: v }))}
        />
        <NumberField
          label={label('cr.quantityExtra')}
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
    </FormSection>
  );
}
