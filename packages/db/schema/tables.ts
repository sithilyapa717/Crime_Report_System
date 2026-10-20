// Kysely table types for migrations/0001_initial.sql. Flags are 0/1 integers, dates ISO text,
// money integer cents. Keep in step with the SQL.

interface Sync {
  id: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  version: number;
  deleted_at: string | null;
}

export interface NamedListTable extends Sync {
  name: string;
  active: number;
}

export interface OffenceTypesTable extends Sync {
  code: string;
  name_si: string;
  template_group: string | null;
  active: number;
}

export interface OfficersTable extends NamedListTable {
  kind: string;
  rank: string | null;
}

export interface UsersTable extends Sync {
  username: string;
  password_hash: string;
  role: string;
  active: number;
  failed_attempts: number;
  must_change_password: number;
}

export interface AuditLogTable {
  id: string;
  at: string;
  user_id: string | null;
  action: string;
  table_name: string;
  row_id: string | null;
  before_json: string | null;
  after_json: string | null;
}

export interface CrimeReportsTable extends Sync {
  office_id: string;
  cr_year: number;
  cr_seq: number;
  cr_number: string;
  month: number;
  half_year: string;
  offence_type_id: string;
  detection_date: string;
  place: string | null;
  police_area_id: string | null;
  divisional_secretariat_id: string | null;
  detecting_officer_id: string | null;
  informant_id: string | null;
  ac_id: string | null;
  sc_id: string | null;
  oic_id: string | null;
  driver_id: string | null;
  notes: string | null;
  quantity: number | null;
  quantity_extra: number | null;
  over_quantity: number | null;
  cash_found_place: string | null;
  cash_serials: string | null;
  cash_serials1: string | null;
  informant_help: string | null;
  informant_note2: string | null;
  accused_note: string | null;
}

export interface AccusedTable extends Sync {
  crime_report_id: string;
  name: string;
  address: string | null;
  nic: string | null;
  age: number | null;
  height: string | null;
  sex: string | null;
  features: string | null;
  phone: string | null;
  driving_licence_no: string | null;
  passport_no: string | null;
}

export interface SuretiesTable extends Sync {
  crime_report_id: string;
  name: string;
  address: string | null;
  nic: string | null;
  phone: string | null;
}

export interface DetectionTimesTable extends Sync {
  crime_report_id: string;
  arrival: string | null;
  bc_leaving: string | null;
  ipr_leaving: string | null;
  detection: string | null;
  after_detection: string | null;
}

export interface SupportOfficersTable extends Sync {
  crime_report_id: string;
  officer_id: string;
  position: number;
}

export interface SeizedItemsTable extends Sync {
  crime_report_id: string;
  position: number;
  item_type: string;
  quantity: number;
  unit: string;
  over_quantity: number | null;
}

export interface CashNotesTable extends Sync {
  crime_report_id: string;
  kind: string;
  denomination: number;
  text: string;
}

export interface ProductionsTable extends Sync {
  crime_report_id: string;
  position: number;
  description: string;
}

export interface CasesTable extends Sync {
  crime_report_id: string;
  court_id: string;
  court_date: string | null;
  prosecuting_officer_id: string | null;
  case_number: string | null;
  case_type: string | null;
  sithasi: number;
  permission_pending: number;
  withdrawn: number;
  accused_died: number;
  register_volume_no: string | null;
  register_volume_page: string | null;
  register_index_page: string | null;
  register_index_sn: string | null;
}

export interface HearingsTable extends Sync {
  case_id: string;
  position: number;
  kind: string;
  date: string;
  memo: string | null;
}

export interface OutcomesTable extends Sync {
  case_id: string;
  position: number;
  outcome_type: string;
  convicted_date: string | null;
  fine_amount: number | null;
  prison_months: number | null;
  prison_days: number | null;
  receipt_no: string | null;
  receipt_date: string | null;
  add_to_convict_register: number;
}

export interface RewardVouchersTable extends Sync {
  case_id: string;
  received: number;
  date: string | null;
}

export interface HandoverTable extends Sync {
  crime_report_id: string;
  officer: string | null;
  location: string | null;
  date: string | null;
}

export interface FilesTable extends Sync {
  crime_report_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  stored_name: string;
}

export interface DocumentTemplatesTable extends Sync {
  title: string;
  family: string;
  offence_codes_json: string;
  variant_json: string;
  status: string;
  notes: string | null;
}

export interface GeneratedDocumentsTable extends Sync {
  crime_report_id: string;
  cr_number: string;
  template_id: string;
  template_sha256: string;
  file_name: string;
  file_path: string;
  sha256: string;
  pdf_path: string | null;
  empty_fields_json: string;
  generated_by: string;
  generated_at: string;
}

export interface SchemaMigrationsTable {
  name: string;
  applied_at: string;
}

export interface DB {
  offices: NamedListTable;
  years: NamedListTable;
  offence_types: OffenceTypesTable;
  officers: OfficersTable;
  courts: NamedListTable;
  police_areas: NamedListTable;
  divisional_secretariats: NamedListTable;
  users: UsersTable;
  audit_log: AuditLogTable;
  crime_reports: CrimeReportsTable;
  accused: AccusedTable;
  sureties: SuretiesTable;
  detection_times: DetectionTimesTable;
  cr_support_officers: SupportOfficersTable;
  seized_items: SeizedItemsTable;
  cash_notes: CashNotesTable;
  productions: ProductionsTable;
  cases: CasesTable;
  hearings: HearingsTable;
  outcomes: OutcomesTable;
  reward_vouchers: RewardVouchersTable;
  cr_handover: HandoverTable;
  files: FilesTable;
  document_templates: DocumentTemplatesTable;
  generated_documents: GeneratedDocumentsTable;
  schema_migrations: SchemaMigrationsTable;
}
