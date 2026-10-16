// DRAFT by B. Every caption the UI, reports and exports show. Changes need approval from
// A, B, C and D (TEAM_WORK_SPLIT.md, rule 4: Sinhala text comes only from here or the templates).
//
// `si` is copied word for word from REWRITE_PLAN.md §1.2-§1.6, which quotes the old screens.
// `si: null` means the plan does not quote the old caption; fill it from
// docs/LEGACY_SCREEN_INVENTORY.md (not in the repo yet). Until then the English text shows.

export interface Label {
  si: string | null;
  en: string;
}

const l = (si: string | null, en: string): Label => ({ si, en });

export const LABELS = {
  // Roles and start screen (§1.2)
  'role.oic': l('සුරාබදු ස්ථානාධිපති', 'Station head (OIC)'),
  'role.detecting': l('ග්‍රහණ නිළධාරීන්', 'Detecting officers'),
  'role.observation': l('නිරික්ෂණ නිළධාරීන්', 'Observation officers'),
  'role.supervising': l('අධික්ෂණ නිළධාරීන්', 'Supervising (AC) officers'),

  // Main menu (§1.3)
  'menu.crEntry': l('නව අපරාධ වාර්තා / සංස්කරණය', 'New CR / edit'),
  'menu.crView': l('අපරාධ වාර්තාව සොයා බැලීම', 'View a CR'),
  'menu.caseProgress': l('නඩු පවරන ලද අපරාධ වාර්තා', 'CRs with cases filed'),
  'menu.registerByYear': l('අපරාධ වාර්තා ලේඛනය', 'CR register'),
  'menu.byCourtDate': l('උසාවි දිනයට අදාල අපරාධ වාර්තා', 'CRs by court date'),
  'menu.byDetectionDate': l('වැටලීම් දිනයට අදාල අපරාධ වාර්තා', 'CRs by detection date'),
  'menu.convicts': l('වරදකරුවන්ගේ ලේඛනය', 'Convicts register'),
  'menu.convictsCheck': l('වරදකරුවන්ගේ ලේඛනය පරික්ෂා කිරීම', 'Search convicts'),
  'menu.previousOffences': l('පෙර වැරදි පරික්ෂා කිරීම', 'Previous-offence check'),
  'menu.reports': l('වාර්තා', 'Reports'),
  'menu.referenceLists': l('සංස්කරණය', 'Edit lists'),
  'menu.back': l('Back To Menu', 'Back to menu'),

  // Reports menu (§1.3)
  'reports.halfYear': l('අඩවසර', 'Half-year'),
  'reports.monthly': l('මාසික', 'Monthly'),
  'reports.yearly': l('වාර්ෂික', 'Yearly'),
  'reports.byYearMonth': l('වර්ෂය හා මාසයට අදාලව', 'By year and month'),
  'reports.byDetectingOfficer': l('ග්‍රහණ නිළධාරියා', 'By detecting officer'),
  'reports.byInformant': l('තොරතුර සැපයු නිළධාරියා', 'By informant'),
  'reports.halfYearCheck': l('අඩවසර දත්තයන් පරික්ෂා කිරීම', 'Check half-year data'),
  'reports.byCaseNumber': l('නඩු අංකයකට අදාළ විස්තර', 'Details by case number'),
  'reports.byNameNic': l('නම හා හැදුනුම්පත් අංකය අනුව අපරාධ වාර්තා', 'CRs by name / NIC'),
  'reports.previousByCourt': l(
    'උසාවියට අදාළව පෙරවැරදි පරික්ෂා කිරීම',
    'Previous offences by court',
  ),

  // Report types (§1.6)
  'reportType.register': l('අපරාධ වාර්තා ලේඛනය', 'Full register'),
  'reportType.warrant': l('වරෙන්තු', 'Warrant cases'),
  'reportType.trial': l('විභාග', 'Trial cases'),
  'reportType.summons': l('කැදවීම්', 'Summons cases'),
  'reportType.not_filed': l(null, 'Not yet filed in court'),
  'reportType.fines_not_collected': l(null, 'Fines not collected'),
  'reportType.rewards_due': l(null, 'Reward vouchers due'),
  'reportType.resolved': l('විසදුනු', 'Resolved cases'),
  'reportType.fines_earned': l('උපයාගත් දඩ ආදායම', 'Fines earned'),
  'reportType.convicts': l('වරදකරුවන්ගේ ලේඛනය', 'Convicts register'),

  // Reference lists (§1.3, lookup-list editor)
  'list.office': l('සුරාබදු ස්ථානය හෝ වැටලීම් ඒකකය', 'Office / unit'),
  'list.year': l('අපරාධ වාර්තා වර්ෂය', 'CR year'),
  'list.detectingOfficer': l('ග්‍රහන නිළධාරින්', 'Detecting officers'),
  'list.informant': l('ඔත්තු සපයන නිළධාරින්', 'Informants'),
  'list.court': l('නඩු පවරන උසාවිය', 'Courts'),
  'list.prosecutingOfficer': l('නඩු පවරන නිළධාරින්', 'Prosecuting officers'),
  'list.offence': l('සිදු කරන ලද වරද', 'Offences'),
  'list.divisionalSecretariat': l('ප්‍රාදේශිය ලේකම් කොට්ඨාශය', 'Divisional secretariats'),
  'list.supportStaff': l('ග්‍රහනයකට සම්බන්ධ විය හැකි නිළධාරීන්', 'Support staff'),
  'list.ac': l('සහකාර සුරාබදු කොමසාරිස්', 'Assistant Commissioner (AC)'),
  'list.sc': l('සුරාබදු අධිකාරි', 'Superintendent (SC)'),
  'list.oic': l('සුරාබදු ස්ථානාධිපති', 'Station head (OIC)'),
  'list.driver': l('සුරාබදු රියදුරු', 'Driver'),
  'list.policeArea': l('අදාළ පොලිස් බල ප්‍රදේශය', 'Police area'),

  // Case types (§1.5)
  'caseType.trial': l('විභාගය', 'Trial'),
  'caseType.warrant': l('වරෙන්තු', 'Warrant'),
  'caseType.summons': l('කැදවීම්', 'Summons'),
  'case.sithasi': l('සිතාසි', 'Sithasi'),

  // Outcomes (§1.5, case-progress form wording)
  'outcome.fine': l('දඩ මුදල', 'Fine'),
  'outcome.community_service': l('ප්‍රජාසේවය', 'Community service'),
  'outcome.imprisonment': l('සිරදඩුවම්', 'Imprisonment'),
  'outcome.suspended_sentence': l('අත්හිටවු සිරදඩුවම්', 'Suspended sentence'),
  'outcome.admonished': l('අවවාදකර මුදාහැරීම', 'Admonished and released'),
  'outcome.settlement': l('සමථය', 'Settlement'),
  'outcome.probation': l('පරිවාසයට යොමුකිරීම', 'Probation'),
  'outcome.rehabilitation': l('පුනුරුත්තාපනය', 'Rehabilitation'),
  'outcome.government_fee': l('රජයේ ගාස්තු', 'Government fee'),
  'outcome.released': l('නිදහස් කිරීම', 'Released'),
  'outcome.acquitted': l('නිදොස්කොට නිදහස්', 'Acquitted and released'),
  'outcome.remanded': l('බහා තැබීම', 'Remanded'),
  'outcome.handed_to_court': l('අධිකරණයට බාර දීම', 'Handed to court'),
  'outcome.ag_advice': l('නීතිපති උපදෙස්', "Attorney General's advice"),
  'case.convictedDate': l('වරදකරු කර දිනය', 'Date convicted'),
  'case.addToConvicts': l('වරදකරුවන්ගේ ලේඛණයට ඇතුලත් කරන්න', 'Add to convicts register'),
  'case.rewardReceived': l('තෑගි වවුචරය ලැබි ඇත', 'Reward voucher received'),

  // Report columns (used by reports.run and exports)
  'report.col.crNumber': l(null, 'CR number'),
  'report.col.detectionDate': l(null, 'Detection date'),
  'report.col.offenceCode': l(null, 'Offence'),
  'report.col.accusedName': l(null, 'Name'),
  'report.col.accusedAddress': l(null, 'Address'),
  'report.col.accusedNic': l(null, 'NIC'),
  'report.col.quantity': l(null, 'Quantity'),
  'report.col.detectingOfficerName': l(null, 'Detecting officer'),
  'report.col.informantName': l(null, 'Informant'),
  'report.col.courtName': l(null, 'Court'),
  'report.col.courtDate': l(null, 'Court date'),
  'report.col.caseNumber': l(null, 'Case number'),
  'report.col.convictedDate': l('වරදකරු කර දිනය', 'Date convicted'),
  'report.col.fineAmount': l('දඩ මුදල', 'Fine'),
  'report.col.communityService': l('ප්‍රජාසේවය', 'Community service'),
  'report.col.settlement': l('සමථය', 'Settlement'),
  'report.col.probation': l('පරිවාසයට යොමුකිරීම', 'Probation'),
  'report.col.rehabilitation': l('පුනුරුත්තාපනය', 'Rehabilitation'),
  'report.col.governmentFee': l('රජයේ ගාස්තු', 'Government fee'),
  'report.col.imprisonment': l('සිරදඩුවම්', 'Imprisonment'),
  // The convicts register words these differently from the case form (§1.9 item 9); check the inventory.
  'report.col.admonished': l(null, 'Admonished and released'),
  'report.col.suspendedSentence': l('අත්හිටවු සිරදඩුවම්', 'Suspended sentence'),
} satisfies Record<string, Label>;

export type LabelKey = keyof typeof LABELS;

/** The caption to show: Sinhala when known, otherwise English; unknown keys show the key. */
export function label(key: string): string {
  const entry = (LABELS as Record<string, Label>)[key];
  return entry ? (entry.si ?? entry.en) : key;
}
