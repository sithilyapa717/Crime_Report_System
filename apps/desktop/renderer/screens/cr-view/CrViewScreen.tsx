// C5: one CR, read-only (old `Detection search1`): every entry field plus the case details.
// Prints with the system print dialog (the print stylesheet hides the app's controls).
import type { CaseRecord, CrimeReport } from '@excise/schemas';
import { label } from '@excise/labels';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Actions,
  Alert,
  Button,
  FormSection,
  Spinner,
  formatDate,
  formatMoney,
} from '../../design-system/index.js';
import { allowed } from '../../shell/routes.js';
import { useNav } from '../../shell/navigation.js';
import { call, IpcError } from '../../src/ipc.js';
import { useRefNames } from '../../src/references.js';
import { DocumentsButton } from '../../documents-dialog/DocumentsDialog.js';
import { Pictures } from '../cr-entry/Pictures.js';
import { CrPicker } from '../shared/CrPicker.js';
import { SEIZED } from '../shared/cr-model.js';
import '../cr-entry/cr-entry.css';

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!shown.length) return <p className="ex-muted">—</p>;
  return (
    <dl>
      {shown.map(([k, v]) => (
        <div key={k} className="cr-view__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CrViewScreen() {
  const { route, replace, go, session } = useNav();
  const id = route.params?.id;
  const [cr, setCr] = useState<CrimeReport | null>(null);
  const [kase, setCase] = useState<CaseRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = useRefNames([
    'office',
    'offence',
    'police_area',
    'divisional_secretariat',
    'detecting_officer',
    'informant',
    'support_officer',
    'ac',
    'sc',
    'oic',
    'driver',
    'court',
    'prosecuting_officer',
  ]);

  useEffect(() => {
    if (!id) return;
    Promise.all([call('cr.get', id), call('case.getByCrimeReport', id)])
      .then(([c, k]) => {
        setCr(c);
        setCase(k);
        if (!c) setError(label('cr.notFound'));
      })
      .catch((e: unknown) => setError(e instanceof IpcError ? e.caption : label('error.unknown')));
  }, [id]);

  if (!id) {
    return (
      <>
        <h1>{label('menu.crView')}</h1>
        <CrPicker onFound={(c) => replace('crView', { id: c.id })} />
      </>
    );
  }
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!cr) return <Spinner />;

  const a = cr.accused;
  const outcomes = kase?.outcomes ?? [];
  const fine = outcomes.find((o) => o.outcomeType === 'fine');
  const prison = outcomes.find((o) => o.outcomeType === 'imprisonment');

  return (
    <div className="cr-view">
      <h1>
        {label('form.crEntry')} – {cr.crNumber}
      </h1>
      {cr.deleted && <Alert kind="warn">{label('cr.deleted')}</Alert>}
      <Actions>
        <Button onClick={() => window.print()}>{label('cr.print')}</Button>
        {!cr.deleted && <DocumentsButton crimeReportId={cr.id} role={session.role} />}
        {allowed(session.role, 'caseProgress') && (
          <Button onClick={() => go('caseProgress', { id: cr.id })}>
            {label('menu.caseProgress')}
          </Button>
        )}
        {allowed(session.role, 'crEntry') && (
          <Button variant="primary" onClick={() => go('crEntry', { id: cr.id })}>
            {label('cr.edit')}
          </Button>
        )}
      </Actions>

      <FormSection title={label('tab.detection')}>
        <Rows
          rows={[
            [label('cr.office'), name(cr.officeId)],
            [label('cr.number'), cr.crNumber],
            [label('cr.month'), label(`month.${cr.month}`)],
            [label('cr.halfYear'), label(`cr.halfYear.${cr.halfYear}`)],
            [label('cr.detectionDate'), formatDate(cr.detectionDate)],
            [label('cr.place'), cr.place],
            [label('cr.offence'), name(cr.offenceTypeId)],
            [label('cr.policeArea'), name(cr.policeAreaId)],
            [label('cr.divisionalSecretariat'), name(cr.divisionalSecretariatId)],
            [label('cr.detectingOfficer'), name(cr.detectingOfficerId)],
            [label('cr.informant'), name(cr.informantId)],
            ...cr.supportOfficers.map((s): [string, ReactNode] => [
              `${label('cr.supportOfficer')} ${s.position}`,
              name(s.officerId),
            ]),
            [label('cr.ac'), name(cr.acId)],
            [label('cr.sc'), name(cr.scId)],
            [label('cr.oic'), name(cr.oicId)],
            [label('cr.driver'), name(cr.driverId)],
            [label('cr.informantHelp'), cr.informantHelp],
            [label('cr.informantNote2'), cr.informantNote2],
            [label('cr.notes'), cr.notes],
          ]}
        />
      </FormSection>

      <FormSection title={label('tab.accused')}>
        <Rows
          rows={[
            [label('accused.name'), a.name],
            [label('accused.address'), a.address],
            [label('accused.nic'), a.nic],
            [label('accused.age'), a.age],
            [label('accused.height'), a.height],
            [label('accused.sex'), a.sex ? label(`accused.sex.${a.sex}`) : undefined],
            [label('accused.features'), a.features],
            [label('accused.phone'), a.phone],
            [label('accused.drivingLicence'), a.drivingLicenceNo],
            [label('accused.passport'), a.passportNo],
            [label('accused.note'), cr.accusedNote],
          ]}
        />
      </FormSection>

      <FormSection title={label('tab.surety')}>
        <Rows
          rows={[
            [label('surety.name'), cr.surety?.name],
            [label('surety.address'), cr.surety?.address],
            [label('surety.nic'), cr.surety?.nic],
            [label('surety.phone'), cr.surety?.phone],
          ]}
        />
      </FormSection>

      <FormSection title={label('tab.times')} tone="times">
        <Rows
          rows={[
            [label('times.arrival'), cr.times?.arrival],
            [label('times.bcLeaving'), cr.times?.bcLeaving],
            [label('times.iprLeaving'), cr.times?.iprLeaving],
            [label('times.detection'), cr.times?.detection],
            [label('times.afterDetection'), cr.times?.afterDetection],
          ]}
        />
      </FormSection>

      <FormSection title={label('tab.cash')} tone="cash">
        <Rows
          rows={[
            ...cr.cashNotes.map((n): [string, ReactNode] => [
              `${label(n.kind === 'used' ? 'cash.used' : 'cash.left')} Rs ${n.denomination}`,
              n.text,
            ]),
            [label('cash.foundPlace'), cr.cashFoundPlace],
            [label('cash.serials'), cr.cashSerials],
            [label('cash.serials1'), cr.cashSerials1],
          ]}
        />
      </FormSection>

      <FormSection title={label('tab.seized')} tone="seized">
        <Rows
          rows={[
            ...SEIZED.flatMap(({ type }): [string, ReactNode][] => {
              const s = cr.seizedItems.find((i) => i.itemType === type);
              return s ? [[label(`seized.${type}`), s.quantity]] : [];
            }),
            [label('cr.quantity'), cr.quantity],
            [label('cr.quantityExtra'), cr.quantityExtra],
            [label('cr.overQuantity'), cr.overQuantity],
            [label('cr.productions'), cr.productions[0]],
            [label('cr.production1'), cr.productions[1]],
            [label('cr.production2'), cr.productions[2]],
          ]}
        />
      </FormSection>

      <FormSection title={label('form.caseProgress')}>
        {!kase ? (
          <p className="ex-muted">{label('case.noCase')}</p>
        ) : (
          <Rows
            rows={[
              [label('case.court'), name(kase.courtId)],
              [label('case.number'), kase.caseNumber],
              [label('case.courtDate'), formatDate(kase.courtDate)],
              [label('case.prosecutor'), name(kase.prosecutingOfficerId)],
              [label('case.type'), kase.caseType ? label(`caseType.${kase.caseType}`) : undefined],
              [label('case.sithasi'), kase.sithasi ? '✓' : undefined],
              [label('case.permissionPending'), kase.permissionPending ? '✓' : undefined],
              [label('case.withdrawn'), kase.withdrawn ? '✓' : undefined],
              [label('case.accusedDied'), kase.accusedDied ? '✓' : undefined],
              ...kase.hearings.map((h, i): [string, ReactNode] => [
                `${label(h.kind === 'summons' ? 'case.summonsDate' : h.kind === 'warrant' ? 'case.warrantDate' : 'case.hearingDate')} ${h.kind === 'trial' ? i + 1 : ''}`.trim(),
                `${formatDate(h.date)}${h.memo ? ` – ${h.memo}` : ''}`,
              ]),
              [
                label('case.outcomes'),
                outcomes.map((o) => label(`outcome.${o.outcomeType}`)).join(', '),
              ],
              [
                label('case.fineAmount'),
                fine?.fineAmount !== undefined ? formatMoney(fine.fineAmount) : undefined,
              ],
              [
                label('case.convictedDate'),
                formatDate(outcomes.find((o) => o.convictedDate)?.convictedDate),
              ],
              [
                label('outcome.imprisonment'),
                prison ? `${prison.prisonMonths ?? 0} / ${prison.prisonDays ?? 0}` : undefined,
              ],
              [label('case.receiptNo'), fine?.receiptNo],
              [label('case.receiptDate'), formatDate(fine?.receiptDate)],
              [
                label('case.addToConvicts'),
                outcomes.some((o) => o.addToConvictRegister) ? '✓' : undefined,
              ],
              [
                label('case.rewardReceived'),
                kase.rewardVoucherReceived ? formatDate(kase.rewardVoucherDate) || '✓' : undefined,
              ],
              [label('case.volumeNo'), kase.register?.volumeNo],
              [label('case.volumePage'), kase.register?.volumePage],
              [label('case.indexPage'), kase.register?.indexPage],
              [label('case.indexSn'), kase.register?.indexSn],
              [label('case.handoverOfficer'), kase.handover?.officer],
              [label('case.handoverLocation'), kase.handover?.location],
              [label('case.handoverDate'), formatDate(kase.handover?.date)],
            ]}
          />
        )}
      </FormSection>

      <div className="no-print">
        <Pictures crimeReportId={cr.id} readOnly />
      </div>
    </div>
  );
}
