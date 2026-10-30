// C4: CR entry and edit (old `Detection` form, §1.4). Header strip (office, year, CR n/year,
// month, half-year), then the old sections as tabs: Detection · Accused · Surety · Times · Cash ·
// Seized items · Court. Save is explicit; leaving with unsaved changes asks first; delete is soft
// and can be restored. The Court tab is saved to the CR's case.
import type { CaseRecord, CrimeReport } from '@excise/schemas';
import { label } from '@excise/labels';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  ConfirmDialog,
  DateField,
  FieldGrid,
  FormSection,
  Icon,
  NumberField,
  RadioGroup,
  Select,
  Spinner,
  Tabs,
  TextArea,
  TextField,
  useToast,
} from '../../design-system/index.js';
import { useLeaveGuard, useNav } from '../../shell/navigation.js';
import { call, IpcError } from '../../src/ipc.js';
import { useSaveFailure } from '../../src/save-failure.js';
import { useRefOptions } from '../../src/references.js';
import { CashTab, SeizedTab, TimesTab, type TabProps } from '../cr-entry-tabs/tabs.js';
import { FindBar, lastOffice, rememberOffice } from '../shared/CrPicker.js';
import {
  caseBody,
  emptyDraft,
  fromReport,
  newCase,
  tabOf,
  toInput,
  type CrDraft,
} from '../shared/cr-model.js';
import { DocumentsButton } from '../../documents-dialog/DocumentsDialog.js';
import { Pictures } from './Pictures.js';
import './cr-entry.css';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: label(`month.${i + 1}`),
}));

interface Loaded {
  cr: CrimeReport;
  case: CaseRecord | null;
}

export function CrEntryScreen() {
  const { route, replace, session } = useNav();
  const id = route.params?.id;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<CrDraft>(() => emptyDraft({ officeId: lastOffice() }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState('detection');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();
  const saveFailure = useSaveFailure();

  const baseline = useMemo(() => (loaded ? fromReport(loaded.cr, loaded.case) : null), [loaded]);
  const dirty = baseline
    ? JSON.stringify(baseline) !== JSON.stringify(draft)
    : JSON.stringify(draft) !== JSON.stringify(emptyDraft({ officeId: draft.officeId }));
  useLeaveGuard(dirty);

  const load = async (crId: string) => {
    const [cr, c] = await Promise.all([call('cr.get', crId), call('case.getByCrimeReport', crId)]);
    if (!cr) return setMessage(label('cr.notFound'));
    setLoaded({ cr, case: c });
    setDraft(fromReport(cr, c));
    setErrors({});
  };

  useEffect(() => {
    if (id)
      void load(id).catch((e: unknown) =>
        setMessage(e instanceof IpcError ? e.caption : String(e)),
      );
  }, [id]);

  const set = (change: (d: CrDraft) => CrDraft) => setDraft(change);

  const save = async () => {
    setBusy(true);
    setErrors({});
    setMessage(null);
    let courtRejected = false;
    try {
      const input = toInput(draft);
      const saved = loaded
        ? await call('cr.update', loaded.cr.id, loaded.cr.version, input)
        : await call('cr.create', input);
      rememberOffice(saved.officeId);
      let savedCase = loaded?.case ?? null;
      const courtChanged =
        draft.courtId !== savedCase?.courtId ||
        draft.courtDate !== savedCase?.courtDate ||
        draft.prosecutingOfficerId !== savedCase?.prosecutingOfficerId;
      if (draft.courtId && courtChanged) {
        const current = await call('case.getByCrimeReport', saved.id);
        const base = current ? caseBody(current) : newCase(saved.id, draft.courtId);
        try {
          savedCase = await call(
            'case.save',
            {
              ...base,
              courtId: draft.courtId,
              courtDate: draft.courtDate,
              prosecutingOfficerId: draft.prosecutingOfficerId,
            },
            current?.version ?? null,
          );
        } catch (err) {
          // The CR itself is saved; show the court problem on the Court tab.
          if (saveFailure.report(err)) courtRejected = true;
          else if (err instanceof IpcError) {
            setErrors(
              Object.fromEntries(
                Object.entries(err.fieldErrors()).map(([k, v]) => [
                  k === 'courtDate' ? k : 'courtId',
                  v,
                ]),
              ),
            );
            setTab('court');
            setMessage(err.caption);
          }
        }
      }
      setLoaded({ cr: saved, case: savedCase });
      setDraft(fromReport(saved, savedCase));
      if (!courtRejected) toast(label('cr.saved'));
      if (!loaded) replace('crEntry', { id: saved.id });
    } catch (err) {
      if (saveFailure.report(err)) return;
      if (err instanceof IpcError) {
        const fields = err.fieldErrors();
        setErrors(fields);
        setMessage(Object.keys(fields).length ? label('error.checkFields') : err.caption);
        const first = Object.keys(fields)[0];
        if (first && tabOf(first) !== 'header') setTab(tabOf(first));
      } else setMessage(label('error.unknown'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    if (!loaded) return;
    try {
      await call('cr.softDelete', loaded.cr.id);
      await load(loaded.cr.id);
    } catch (err) {
      if (!saveFailure.report(err))
        setMessage(err instanceof IpcError ? err.caption : label('error.unknown'));
    }
  };

  const restore = async () => {
    if (!loaded) return;
    try {
      await call('cr.restore', loaded.cr.id);
      await load(loaded.cr.id);
    } catch (err) {
      if (!saveFailure.report(err))
        setMessage(err instanceof IpcError ? err.caption : label('error.unknown'));
    }
  };

  if (id && !loaded && !message) return <Spinner />;
  const deleted = loaded?.cr.deleted ?? false;
  const invalid = new Set(Object.keys(errors).map(tabOf));
  const props: TabProps = { draft, set, errors };

  return (
    <div className="cr-entry">
      <section className="ex-card cr-head">
        <FindBar onFound={(cr) => replace('crEntry', { id: cr.id })}>
          {loaded && <Button onClick={() => replace('crEntry')}>{label('cr.new')}</Button>}
        </FindBar>
        <fieldset className="cr-head__fields" disabled={deleted}>
          <legend className="ex-visually-hidden">
            {loaded ? loaded.cr.crNumber : label('cr.new')}
          </legend>
          <HeaderFields {...props} />
          {loaded && <Pictures crimeReportId={loaded.cr.id} compact readOnly={deleted} />}
        </fieldset>
      </section>
      {message && <Alert kind="error">{message}</Alert>}
      {deleted && (
        <Alert kind="warn">
          {label('cr.deleted')} <Button onClick={restore}>{label('cr.restore')}</Button>
        </Alert>
      )}

      <fieldset className="cr-entry__body" disabled={deleted}>
        <Tabs
          label={label('form.crEntry')}
          active={tab}
          onChange={setTab}
          tabs={[
            {
              key: 'detection',
              title: label('tab.detection'),
              content: <DetectionTab {...props} />,
              invalid: invalid.has('detection'),
            },
            {
              key: 'accused',
              title: label('tab.accused'),
              content: <AccusedTab {...props} />,
              invalid: invalid.has('accused'),
            },
            {
              key: 'surety',
              title: label('tab.surety'),
              content: <SuretyTab {...props} />,
              invalid: invalid.has('surety'),
            },
            {
              key: 'times',
              title: label('tab.times'),
              content: <TimesTab {...props} />,
              invalid: invalid.has('times'),
            },
            {
              key: 'cash',
              title: label('tab.cash'),
              content: <CashTab {...props} />,
              invalid: invalid.has('cash'),
            },
            {
              key: 'seized',
              title: label('tab.seized'),
              content: <SeizedTab {...props} />,
              invalid: invalid.has('seized'),
            },
            {
              key: 'court',
              title: label('tab.court'),
              content: <CourtTab {...props} />,
              invalid: invalid.has('court'),
            },
          ]}
        />
      </fieldset>

      <div className="cr-foot">
        {loaded && !deleted && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            {label('cr.delete')}
          </Button>
        )}
        <span className="cr-foot__dirty" aria-live="polite">
          {dirty ? label('cr.dirty') : ''}
        </span>
        {loaded && !deleted && <DocumentsButton crimeReportId={loaded.cr.id} role={session.role} />}
        <Button
          onClick={() =>
            baseline ? setDraft(baseline) : setDraft(emptyDraft({ officeId: draft.officeId }))
          }
          disabled={!dirty}
        >
          {label('cr.undo')}
        </Button>
        <Button variant="primary" onClick={save} busy={busy} disabled={deleted || !dirty}>
          {label('common.save')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={label('cr.delete')}
        message={label('cr.confirmDelete')}
        danger
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
      {saveFailure.dialog}
    </div>
  );
}

function HeaderFields({ draft, set, errors }: TabProps) {
  const offices = useRefOptions('office');
  return (
    <FieldGrid>
      <Select
        label={label('cr.office')}
        tag="pink"
        value={draft.officeId}
        error={errors.officeId}
        options={offices}
        onChange={(v) => set((d) => ({ ...d, officeId: v }))}
      />
      <NumberField
        label={label('cr.year')}
        tag="pink"
        value={draft.crYear}
        error={errors.crYear}
        onChange={(v) => set((d) => ({ ...d, crYear: v }))}
      />
      <NumberField
        label={label('cr.number')}
        tag="pink"
        value={draft.crSeq}
        error={errors.crNumber}
        placeholder="n/yyyy"
        onChange={(v) => set((d) => ({ ...d, crSeq: v }))}
      />
      <Select
        label={label('cr.month')}
        tag="pink"
        value={draft.month ? String(draft.month) : undefined}
        error={errors.month}
        options={MONTHS}
        onChange={(v) =>
          set((d) => ({
            ...d,
            month: v ? Number(v) : undefined,
            // A new CR starts with both empty; choosing the month suggests its half-year.
            ...(v && !d.halfYear ? { halfYear: Number(v) <= 6 ? 'first' : 'second' } : {}),
          }))
        }
      />
      <Select
        label={label('cr.halfYear')}
        value={draft.halfYear}
        options={[
          { value: 'first', label: label('cr.halfYear.first') },
          { value: 'second', label: label('cr.halfYear.second') },
        ]}
        onChange={(v) => set((d) => ({ ...d, halfYear: v as CrDraft['halfYear'] }))}
      />
    </FieldGrid>
  );
}

const MAX_SUPPORT = 10;

function DetectionTab({ draft, set, errors }: TabProps) {
  const offences = useRefOptions('offence');
  const police = useRefOptions('police_area');
  const secretariats = useRefOptions('divisional_secretariat');
  const detecting = useRefOptions('detecting_officer');
  const informants = useRefOptions('informant');
  const support = useRefOptions('support_officer');
  const ac = useRefOptions('ac');
  const sc = useRefOptions('sc');
  const oic = useRefOptions('oic');
  const drivers = useRefOptions('driver');
  const pick = (key: keyof CrDraft) => (v: string | undefined) => set((d) => ({ ...d, [key]: v }));
  // Support officers: up to 10, but only as many boxes as are filled (at least one); "add" opens
  // the next one.
  const filled = Math.max(
    0,
    ...Object.keys(draft.support)
      .map(Number)
      .filter((p) => draft.support[p]),
  );
  const [wanted, setWanted] = useState(1);
  const shown = Math.min(MAX_SUPPORT, Math.max(wanted, filled));
  // Removing a box moves the officers below it up one, so the numbering stays without gaps.
  const removeSupport = (pos: number) => {
    set((d) => {
      const next: CrDraft['support'] = {};
      for (const [p, id] of Object.entries(d.support)) {
        const n = Number(p);
        if (n < pos) next[n] = id;
        else if (n > pos) next[n - 1] = id;
      }
      return { ...d, support: next };
    });
    setWanted(Math.max(1, shown - 1));
  };
  return (
    <>
      <FormSection title={label('cr.detectionDetails')}>
        <FieldGrid>
          <DateField
            label={label('cr.detectionDate')}
            value={draft.detectionDate}
            error={errors.detectionDate}
            onChange={pick('detectionDate')}
          />
          <TextField
            label={label('cr.place')}
            value={draft.place}
            error={errors.place}
            onChange={(v) => set((d) => ({ ...d, place: v }))}
          />
          <Select
            label={label('cr.offence')}
            value={draft.offenceTypeId}
            error={errors.offenceTypeId}
            options={offences}
            onChange={pick('offenceTypeId')}
          />
          <Select
            label={label('cr.policeArea')}
            value={draft.policeAreaId}
            options={police}
            onChange={pick('policeAreaId')}
          />
          <Select
            label={label('cr.divisionalSecretariat')}
            value={draft.divisionalSecretariatId}
            options={secretariats}
            onChange={pick('divisionalSecretariatId')}
          />
          <Select
            label={label('cr.detectingOfficer')}
            value={draft.detectingOfficerId}
            options={detecting}
            onChange={pick('detectingOfficerId')}
          />
          <Select
            label={label('cr.informant')}
            value={draft.informantId}
            options={informants}
            onChange={pick('informantId')}
          />
          <Select label={label('cr.ac')} value={draft.acId} options={ac} onChange={pick('acId')} />
          <Select label={label('cr.sc')} value={draft.scId} options={sc} onChange={pick('scId')} />
          <Select
            label={label('cr.oic')}
            value={draft.oicId}
            options={oic}
            onChange={pick('oicId')}
          />
          <Select
            label={label('cr.driver')}
            value={draft.driverId}
            options={drivers}
            onChange={pick('driverId')}
          />
        </FieldGrid>
      </FormSection>
      <FormSection
        title={label('cr.supportOfficer')}
        action={
          shown < MAX_SUPPORT && (
            <Button
              className="ex-button--icon"
              onClick={() => setWanted(shown + 1)}
              aria-label={label('cr.addSupportOfficer')}
              title={label('cr.addSupportOfficer')}
            >
              <Icon name="plus" size={18} />
            </Button>
          )
        }
      >
        <FieldGrid>
          {Array.from({ length: shown }, (_, i) => i + 1).map((pos) => {
            const caption = `${label('cr.supportOfficer')} ${pos}`;
            return (
              <div className="cr-support-slot" key={pos}>
                <Select
                  label={caption}
                  value={draft.support[pos]}
                  options={support}
                  onChange={(v) => set((d) => ({ ...d, support: { ...d.support, [pos]: v } }))}
                />
                {(shown > 1 || draft.support[pos]) && (
                  <Button
                    variant="ghost"
                    onClick={() => removeSupport(pos)}
                    aria-label={`${label('cr.remove')} ${caption}`}
                    title={label('cr.remove')}
                  >
                    ✕
                  </Button>
                )}
              </div>
            );
          })}
        </FieldGrid>
      </FormSection>
      <FormSection title={label('cr.notes')}>
        <TextArea
          label={label('cr.informantHelp')}
          value={draft.informantHelp}
          onChange={(v) => set((d) => ({ ...d, informantHelp: v }))}
        />
        <TextArea
          label={label('cr.informantNote2')}
          value={draft.informantNote2}
          onChange={(v) => set((d) => ({ ...d, informantNote2: v }))}
        />
        <TextArea
          label={label('cr.notes')}
          value={draft.notes}
          onChange={(v) => set((d) => ({ ...d, notes: v }))}
        />
      </FormSection>
    </>
  );
}

function AccusedTab({ draft, set, errors }: TabProps) {
  const a = draft.accused;
  const text = (key: Exclude<keyof CrDraft['accused'], 'age' | 'sex'>, caption: string) => (
    <TextField
      label={label(caption)}
      value={a[key]}
      error={errors[`accused.${key}`]}
      onChange={(v) => set((d) => ({ ...d, accused: { ...d.accused, [key]: v } }))}
    />
  );
  return (
    <>
      <FieldGrid>
        {text('name', 'accused.name')}
        {text('address', 'accused.address')}
        {text('nic', 'accused.nic')}
        <NumberField
          label={label('accused.age')}
          value={a.age}
          error={errors['accused.age']}
          onChange={(v) => set((d) => ({ ...d, accused: { ...d.accused, age: v } }))}
        />
        {text('height', 'accused.height')}
        <RadioGroup
          label={label('accused.sex')}
          name="sex"
          value={a.sex}
          onChange={(v) => set((d) => ({ ...d, accused: { ...d.accused, sex: v } }))}
          options={[
            { value: 'male', label: label('accused.sex.male') },
            { value: 'female', label: label('accused.sex.female') },
          ]}
        />
        {text('phone', 'accused.phone')}
        {text('drivingLicenceNo', 'accused.drivingLicence')}
        {text('passportNo', 'accused.passport')}
      </FieldGrid>
      <TextArea
        label={label('accused.features')}
        value={a.features}
        onChange={(v) => set((d) => ({ ...d, accused: { ...d.accused, features: v } }))}
      />
      <TextArea
        label={label('accused.note')}
        value={draft.accusedNote}
        onChange={(v) => set((d) => ({ ...d, accusedNote: v }))}
      />
    </>
  );
}

function SuretyTab({ draft, set, errors }: TabProps) {
  const field = (key: keyof CrDraft['surety'], caption: string) => (
    <TextField
      label={label(caption)}
      value={draft.surety[key]}
      error={errors[`surety.${key}`]}
      onChange={(v) => set((d) => ({ ...d, surety: { ...d.surety, [key]: v } }))}
    />
  );
  return (
    <FieldGrid>
      {field('name', 'surety.name')}
      {field('address', 'surety.address')}
      {field('nic', 'surety.nic')}
      {field('phone', 'surety.phone')}
    </FieldGrid>
  );
}

function CourtTab({ draft, set, errors }: TabProps) {
  const courts = useRefOptions('court');
  const prosecutors = useRefOptions('prosecuting_officer');
  return (
    <FieldGrid>
      <Select
        label={label('case.court')}
        value={draft.courtId}
        error={errors.courtId}
        options={courts}
        onChange={(v) => set((d) => ({ ...d, courtId: v }))}
      />
      <DateField
        label={label('case.courtDate')}
        value={draft.courtDate}
        error={errors.courtDate}
        onChange={(v) => set((d) => ({ ...d, courtDate: v }))}
      />
      <Select
        label={label('case.prosecutor')}
        value={draft.prosecutingOfficerId}
        options={prosecutors}
        onChange={(v) => set((d) => ({ ...d, prosecutingOfficerId: v }))}
      />
    </FieldGrid>
  );
}
