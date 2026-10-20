// A12: the Times, Cash and Seized-items tabs of CR entry, in the old colours (§1.8):
// orange = times, blue = cash, purple = seized quantities.
import { label } from '@excise/labels';
import {
  FieldGrid,
  FormSection,
  NumberField,
  TextArea,
  TextField,
  TimeField,
} from '../../design-system/index.js';
import { DENOMINATIONS, SEIZED, type CrDraft } from '../shared/cr-model.js';

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

export function CashTab({ draft, set, errors }: TabProps) {
  const box = (kind: 'used' | 'left') => (
    <FormSection title={label(kind === 'used' ? 'cash.used' : 'cash.left')} tone="cash">
      <FieldGrid>
        {DENOMINATIONS.map((n) => (
          <TextField
            key={n}
            label={`Rs ${n}`}
            value={draft.cash[`${kind}:${n}`] ?? ''}
            onChange={(v) => set((d) => ({ ...d, cash: { ...d.cash, [`${kind}:${n}`]: v } }))}
          />
        ))}
      </FieldGrid>
    </FormSection>
  );
  return (
    <>
      {box('used')}
      {box('left')}
      <FormSection title={label('cash.foundPlace')} tone="cash">
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
    </>
  );
}

export function SeizedTab({ draft, set, errors }: TabProps) {
  return (
    <>
      <FormSection title={label('tab.seized')} tone="seized">
        <FieldGrid>
          {SEIZED.map(({ type }) => {
            const item = draft.seized[type] ?? {};
            return (
              <NumberField
                key={type}
                decimals
                label={label(`seized.${type}`)}
                value={item.quantity}
                onChange={(q) =>
                  set((d) => ({
                    ...d,
                    seized: { ...d.seized, [type]: { ...d.seized[type], quantity: q } },
                  }))
                }
              />
            );
          })}
        </FieldGrid>
      </FormSection>
      <FormSection title={label('cr.quantity')} tone="seized">
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
      </FormSection>
      <FormSection title={label('cr.productions')} tone="seized">
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
    </>
  );
}
