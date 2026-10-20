// C6: case progress (old `Result` form, §1.5). The CR header shown read-only; court and case
// number; case type and flags; summons, warrant and up to 21 trial dates, each with a memo; the
// outcome grid (several outcomes may apply); receipt, reward voucher, register references and the
// CR hand-over. Saved with optimistic locking: a clash shows "someone else changed this".
import type { CaseInput, CaseRecord, CaseType, CrimeReport, OutcomeType } from '@excise/schemas';
import { label } from '@excise/labels';
import { useEffect, useMemo, useState } from 'react';
import {
  Actions,
  Alert,
  Button,
  Checkbox,
  DateField,
  FieldGrid,
  FormSection,
  NumberField,
  RadioGroup,
  Select,
  Spinner,
  TextField,
  formatDate,
  useToast,
} from '../../design-system/index.js';
import { useLeaveGuard, useNav } from '../../shell/navigation.js';
import { call, IpcError } from '../../src/ipc.js';
import { useRefNames, useRefOptions } from '../../src/references.js';
import { CrPicker } from '../shared/CrPicker.js';
import '../cr-entry/cr-entry.css';

/** The outcome grid in the old form's order (§1.5). */
export const OUTCOMES: OutcomeType[] = [
  'fine',
  'community_service',
  'imprisonment',
  'suspended_sentence',
  'admonished',
  'settlement',
  'probation',
  'rehabilitation',
  'government_fee',
  'released',
  'acquitted',
  'remanded',
  'handed_to_court',
  'ag_advice',
];

const MAX_TRIALS = 21;

interface Hearing {
  date?: string;
  memo: string;
}

export interface CaseDraft {
  courtId?: string;
  caseNumber: string;
  courtDate?: string;
  prosecutingOfficerId?: string;
  caseType: CaseType | '';
  sithasi: boolean;
  permissionPending: boolean;
  withdrawn: boolean;
  accusedDied: boolean;
  summons: Hearing;
  warrant: Hearing;
  trials: Hearing[];
  /** Hearings the form has no place for (a second summons date in old data): kept as they are. */
  otherHearings: CaseInput['hearings'];
  outcomes: OutcomeType[];
  fineRupees?: number;
  convictedDate?: string;
  prisonMonths?: number;
  prisonDays?: number;
  receiptNo: string;
  receiptDate?: string;
  addToConvictRegister: boolean;
  rewardVoucherReceived: boolean;
  rewardVoucherDate?: string;
  register: { volumeNo: string; volumePage: string; indexPage: string; indexSn: string };
  handover: { officer: string; location: string; date?: string };
}

export function caseDraft(c: CaseRecord | null): CaseDraft {
  const hearings = c?.hearings ?? [];
  const firstOf = (kind: CaseType) => hearings.find((h) => h.kind === kind);
  const summons = firstOf('summons');
  const warrant = firstOf('warrant');
  const outcomes = c?.outcomes ?? [];
  const fine = outcomes.find((o) => o.outcomeType === 'fine');
  const prison = outcomes.find((o) => o.outcomeType === 'imprisonment');
  return {
    courtId: c?.courtId,
    caseNumber: c?.caseNumber ?? '',
    courtDate: c?.courtDate,
    prosecutingOfficerId: c?.prosecutingOfficerId,
    caseType: c?.caseType ?? '',
    sithasi: c?.sithasi ?? false,
    permissionPending: c?.permissionPending ?? false,
    withdrawn: c?.withdrawn ?? false,
    accusedDied: c?.accusedDied ?? false,
    summons: { date: summons?.date, memo: summons?.memo ?? '' },
    warrant: { date: warrant?.date, memo: warrant?.memo ?? '' },
    trials: hearings
      .filter((h) => h.kind === 'trial')
      .map((h) => ({ date: h.date, memo: h.memo ?? '' })),
    otherHearings: hearings.filter((h) => h !== summons && h !== warrant && h.kind !== 'trial'),
    outcomes: [...new Set(outcomes.map((o) => o.outcomeType))],
    fineRupees: fine?.fineAmount !== undefined ? fine.fineAmount / 100 : undefined,
    convictedDate: outcomes.find((o) => o.convictedDate)?.convictedDate,
    prisonMonths: prison?.prisonMonths,
    prisonDays: prison?.prisonDays,
    receiptNo: fine?.receiptNo ?? '',
    receiptDate: fine?.receiptDate,
    addToConvictRegister: outcomes.some((o) => o.addToConvictRegister),
    rewardVoucherReceived: c?.rewardVoucherReceived ?? false,
    rewardVoucherDate: c?.rewardVoucherDate,
    register: {
      volumeNo: c?.register?.volumeNo ?? '',
      volumePage: c?.register?.volumePage ?? '',
      indexPage: c?.register?.indexPage ?? '',
      indexSn: c?.register?.indexSn ?? '',
    },
    handover: {
      officer: c?.handover?.officer ?? '',
      location: c?.handover?.location ?? '',
      date: c?.handover?.date,
    },
  };
}

const t = (s: string) => (s.trim() === '' ? undefined : s.trim());

export function caseInput(crimeReportId: string, d: CaseDraft): CaseInput {
  const hearing = (kind: CaseType, h: Hearing) =>
    h.date ? [{ kind, date: h.date, ...(t(h.memo) ? { memo: t(h.memo) } : {}) }] : [];
  const register = {
    volumeNo: t(d.register.volumeNo),
    volumePage: t(d.register.volumePage),
    indexPage: t(d.register.indexPage),
    indexSn: t(d.register.indexSn),
  };
  const handover = {
    officer: t(d.handover.officer),
    location: t(d.handover.location),
    date: d.handover.date,
  };
  return {
    crimeReportId,
    courtId: d.courtId as string,
    courtDate: d.courtDate,
    prosecutingOfficerId: d.prosecutingOfficerId,
    caseNumber: t(d.caseNumber),
    caseType: d.caseType || undefined,
    sithasi: d.sithasi,
    permissionPending: d.permissionPending,
    withdrawn: d.withdrawn,
    accusedDied: d.accusedDied,
    hearings: [
      ...hearing('summons', d.summons),
      ...hearing('warrant', d.warrant),
      ...d.otherHearings,
      ...d.trials.flatMap((h) => hearing('trial', h)),
    ],
    outcomes: OUTCOMES.filter((o) => d.outcomes.includes(o)).map((outcomeType) => ({
      outcomeType,
      ...(d.convictedDate ? { convictedDate: d.convictedDate } : {}),
      ...(outcomeType === 'fine'
        ? {
            ...(d.fineRupees !== undefined ? { fineAmount: Math.round(d.fineRupees * 100) } : {}),
            ...(t(d.receiptNo) ? { receiptNo: t(d.receiptNo) } : {}),
            ...(d.receiptDate ? { receiptDate: d.receiptDate } : {}),
          }
        : {}),
      ...(outcomeType === 'imprisonment'
        ? {
            ...(d.prisonMonths !== undefined ? { prisonMonths: d.prisonMonths } : {}),
            ...(d.prisonDays !== undefined ? { prisonDays: d.prisonDays } : {}),
          }
        : {}),
      addToConvictRegister: d.addToConvictRegister,
    })),
    rewardVoucherReceived: d.rewardVoucherReceived,
    rewardVoucherDate: d.rewardVoucherDate,
    register: Object.values(register).some(Boolean) ? register : undefined,
    handover: Object.values(handover).some(Boolean) ? handover : undefined,
  };
}

export function CaseProgressScreen() {
  const { route, replace } = useNav();
  const id = route.params?.id;
  const [cr, setCr] = useState<CrimeReport | null>(null);
  const [saved, setSaved] = useState<CaseRecord | null>(null);
  const [draft, setDraft] = useState<CaseDraft>(caseDraft(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const toast = useToast();
  const courts = useRefOptions('court');
  const prosecutors = useRefOptions('prosecuting_officer');
  const name = useRefNames(['offence', 'office']);

  const baseline = useMemo(() => caseDraft(saved), [saved]);
  const dirty = !!cr && JSON.stringify(baseline) !== JSON.stringify(draft);
  useLeaveGuard(dirty);

  useEffect(() => {
    if (!id) return;
    Promise.all([call('cr.get', id), call('case.getByCrimeReport', id)])
      .then(([c, k]) => {
        setCr(c);
        setSaved(k);
        setDraft(caseDraft(k));
        if (!c) setMessage(label('cr.notFound'));
      })
      .catch((e: unknown) => setMessage(e instanceof IpcError ? e.caption : label('error.unknown')))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) {
    return (
      <>
        <h1>{label('form.caseProgress')}</h1>
        <CrPicker onFound={(c) => replace('caseProgress', { id: c.id })} />
      </>
    );
  }
  if (loading) return <Spinner />;
  if (!cr) return <Alert kind="error">{message}</Alert>;

  const set = (change: Partial<CaseDraft>) => setDraft((d) => ({ ...d, ...change }));
  const toggle = (o: OutcomeType, on: boolean) =>
    setDraft((d) => ({
      ...d,
      outcomes: on ? [...d.outcomes, o] : d.outcomes.filter((x) => x !== o),
    }));

  const save = async () => {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      const next = await call('case.save', caseInput(cr.id, draft), saved?.version ?? null);
      setSaved(next);
      setDraft(caseDraft(next));
      toast(label('cr.saved'));
    } catch (err) {
      if (err instanceof IpcError) {
        setErrors(err.fieldErrors());
        setMessage(err.caption);
      } else setMessage(label('error.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const hearingRow = (
    caption: string,
    h: Hearing,
    change: (h: Hearing) => void,
    remove?: () => void,
  ) => (
    <div className="case-hearing" key={caption}>
      <DateField label={caption} value={h.date} onChange={(date) => change({ ...h, date })} />
      <TextField
        label={label('case.memo')}
        value={h.memo}
        onChange={(memo) => change({ ...h, memo })}
      />
      {remove ? (
        <Button variant="ghost" onClick={remove} aria-label={`${label('cr.remove')} ${caption}`}>
          ✕
        </Button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <div>
      <h1>{label('form.caseProgress')}</h1>
      <FormSection title={label('form.crEntry')}>
        <p>
          <strong>{cr.crNumber}</strong> · {name(cr.officeId)} · {label(`month.${cr.month}`)} ·{' '}
          {name(cr.offenceTypeId)} · {cr.accused.name} · {formatDate(cr.detectionDate)}
        </p>
      </FormSection>
      {message && <Alert kind="error">{message}</Alert>}

      <FormSection title={label('tab.court')}>
        <FieldGrid>
          <Select
            label={label('case.court')}
            value={draft.courtId}
            error={errors.courtId}
            options={courts}
            onChange={(courtId) => set({ courtId })}
          />
          <TextField
            label={label('case.number')}
            value={draft.caseNumber}
            error={errors.caseNumber}
            onChange={(caseNumber) => set({ caseNumber })}
          />
          <DateField
            label={label('case.courtDate')}
            value={draft.courtDate}
            error={errors.courtDate}
            onChange={(courtDate) => set({ courtDate })}
          />
          <Select
            label={label('case.prosecutor')}
            value={draft.prosecutingOfficerId}
            options={prosecutors}
            onChange={(prosecutingOfficerId) => set({ prosecutingOfficerId })}
          />
        </FieldGrid>
        <RadioGroup
          label={label('case.type')}
          name="caseType"
          value={draft.caseType}
          onChange={(caseType) => set({ caseType })}
          options={[
            { value: 'trial', label: label('caseType.trial') },
            { value: 'warrant', label: label('caseType.warrant') },
            { value: 'summons', label: label('caseType.summons') },
            { value: '', label: '—' },
          ]}
        />
        <FieldGrid>
          <Checkbox
            label={label('case.sithasi')}
            checked={draft.sithasi}
            onChange={(sithasi) => set({ sithasi })}
          />
          <Checkbox
            label={label('case.permissionPending')}
            checked={draft.permissionPending}
            onChange={(permissionPending) => set({ permissionPending })}
          />
          <Checkbox
            label={label('case.withdrawn')}
            checked={draft.withdrawn}
            onChange={(withdrawn) => set({ withdrawn })}
          />
          <Checkbox
            label={label('case.accusedDied')}
            checked={draft.accusedDied}
            onChange={(accusedDied) => set({ accusedDied })}
          />
        </FieldGrid>
      </FormSection>

      <FormSection title={label('case.hearingDate')}>
        {errors.hearingDates && <Alert kind="error">{errors.hearingDates}</Alert>}
        {hearingRow(label('case.summonsDate'), draft.summons, (summons) => set({ summons }))}
        {hearingRow(label('case.warrantDate'), draft.warrant, (warrant) => set({ warrant }))}
        {draft.trials.map((h, i) =>
          hearingRow(
            `${label('case.hearingDate')} ${i + 1}`,
            h,
            (next) => set({ trials: draft.trials.map((x, j) => (j === i ? next : x)) }),
            () => set({ trials: draft.trials.filter((_, j) => j !== i) }),
          ),
        )}
        <Button
          disabled={draft.trials.length >= MAX_TRIALS}
          onClick={() => set({ trials: [...draft.trials, { memo: '' }] })}
        >
          {label('case.addHearing')}
        </Button>
      </FormSection>

      <FormSection title={label('case.outcomes')}>
        <div className="case-outcomes">
          {OUTCOMES.map((o) => (
            <Checkbox
              key={o}
              label={label(`outcome.${o}`)}
              checked={draft.outcomes.includes(o)}
              onChange={(on) => toggle(o, on)}
            />
          ))}
        </div>
        {errors.caseNumber && <Alert kind="error">{errors.caseNumber}</Alert>}
        <FieldGrid>
          <DateField
            label={label('case.convictedDate')}
            value={draft.convictedDate}
            onChange={(convictedDate) => set({ convictedDate })}
          />
          {draft.outcomes.includes('fine') && (
            <>
              <NumberField
                decimals
                label={label('case.fineAmount')}
                value={draft.fineRupees}
                onChange={(fineRupees) => set({ fineRupees })}
              />
              <TextField
                label={label('case.receiptNo')}
                value={draft.receiptNo}
                onChange={(receiptNo) => set({ receiptNo })}
              />
              <DateField
                label={label('case.receiptDate')}
                value={draft.receiptDate}
                onChange={(receiptDate) => set({ receiptDate })}
              />
            </>
          )}
          {draft.outcomes.includes('imprisonment') && (
            <>
              <NumberField
                label={`${label('outcome.imprisonment')} – ${label('case.prisonMonths')}`}
                value={draft.prisonMonths}
                onChange={(prisonMonths) => set({ prisonMonths })}
              />
              <NumberField
                label={`${label('outcome.imprisonment')} – ${label('case.prisonDays')}`}
                value={draft.prisonDays}
                onChange={(prisonDays) => set({ prisonDays })}
              />
            </>
          )}
        </FieldGrid>
        <FieldGrid>
          <Checkbox
            label={label('case.addToConvicts')}
            checked={draft.addToConvictRegister}
            onChange={(addToConvictRegister) => set({ addToConvictRegister })}
          />
          <Checkbox
            label={label('case.rewardReceived')}
            checked={draft.rewardVoucherReceived}
            onChange={(rewardVoucherReceived) => set({ rewardVoucherReceived })}
          />
          <DateField
            label={label('case.rewardDate')}
            value={draft.rewardVoucherDate}
            onChange={(rewardVoucherDate) => set({ rewardVoucherDate })}
          />
        </FieldGrid>
      </FormSection>

      <FormSection title={label('case.register')}>
        <FieldGrid>
          {(['volumeNo', 'volumePage', 'indexPage', 'indexSn'] as const).map((k) => (
            <TextField
              key={k}
              label={label(`case.${k}`)}
              value={draft.register[k]}
              onChange={(v) => set({ register: { ...draft.register, [k]: v } })}
            />
          ))}
        </FieldGrid>
      </FormSection>

      <FormSection title={label('case.handover')}>
        <FieldGrid>
          <TextField
            label={label('case.handoverOfficer')}
            value={draft.handover.officer}
            onChange={(officer) => set({ handover: { ...draft.handover, officer } })}
          />
          <TextField
            label={label('case.handoverLocation')}
            value={draft.handover.location}
            onChange={(location) => set({ handover: { ...draft.handover, location } })}
          />
          <DateField
            label={label('case.handoverDate')}
            value={draft.handover.date}
            onChange={(date) => set({ handover: { ...draft.handover, date } })}
          />
        </FieldGrid>
      </FormSection>

      <Actions>
        <Button onClick={() => setDraft(baseline)} disabled={!dirty}>
          {label('cr.undo')}
        </Button>
        <Button variant="primary" onClick={save} busy={busy} disabled={!dirty || !draft.courtId}>
          {label('common.save')}
        </Button>
      </Actions>
    </div>
  );
}
