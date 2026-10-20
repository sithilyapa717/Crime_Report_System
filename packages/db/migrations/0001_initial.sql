-- 0001: the whole schema (REWRITE_PLAN §4, REMAINING_WORK A1).
--
-- Rules for every table (§3 "built for later hosting"):
--   id          TEXT UUID primary key (records made on different PCs never collide)
--   created_at, updated_at   ISO-8601 UTC timestamps
--   updated_by  user id of the last change (NULL for system changes)
--   version     optimistic locking: bumped on every change
--   deleted_at  soft delete (NULL = live)
-- Dates are ISO `YYYY-MM-DD` text, checked with date(); money is integer cents; flags are 0/1.
-- PostgreSQL differences are listed in docs/database-design/DATABASE.md.

PRAGMA foreign_keys = ON;

-- ============================ Reference lists (§4.1) ============================

CREATE TABLE offices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE years (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) = 4),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE offence_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name_si TEXT NOT NULL,
  -- Default template folder (PUDS, UPG, …); documents use the code today.
  template_group TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX offence_types_code ON offence_types (code) WHERE deleted_at IS NULL;

-- One table for every kind of officer (§4.1); the same person in two lists is two rows,
-- as in the old system's separate tables.
CREATE TABLE officers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('detecting_officer', 'informant', 'prosecuting_officer',
    'support_officer', 'ac', 'sc', 'oic', 'driver')),
  name TEXT NOT NULL,
  rank TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX officers_kind ON officers (kind, name);

CREATE TABLE courts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE police_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE divisional_secretariats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

-- ============================ Users and audit ============================

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('oic', 'detecting', 'observation', 'supervising')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX users_username ON users (username);

-- Append-only. Never holds password hashes (the auth service leaves them out).
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  user_id TEXT REFERENCES users (id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT,
  before_json TEXT,
  after_json TEXT
);
CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX audit_log_row ON audit_log (table_name, row_id);
CREATE INDEX audit_log_user ON audit_log (user_id, at);

-- ============================ Crime reports (§4.2) ============================

CREATE TABLE crime_reports (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES offices (id),
  cr_year INTEGER NOT NULL CHECK (cr_year BETWEEN 1990 AND 2100),
  -- Running number of `n/yyyy` (the old `snocr`), derived, for sorting.
  cr_seq INTEGER NOT NULL CHECK (cr_seq > 0),
  cr_number TEXT NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  half_year TEXT NOT NULL CHECK (half_year IN ('first', 'second')),
  offence_type_id TEXT NOT NULL REFERENCES offence_types (id),
  detection_date TEXT NOT NULL CHECK (date(detection_date) = detection_date),
  place TEXT,
  police_area_id TEXT REFERENCES police_areas (id),
  divisional_secretariat_id TEXT REFERENCES divisional_secretariats (id),
  detecting_officer_id TEXT REFERENCES officers (id),
  informant_id TEXT REFERENCES officers (id),
  ac_id TEXT REFERENCES officers (id),
  sc_id TEXT REFERENCES officers (id),
  oic_id TEXT REFERENCES officers (id),
  driver_id TEXT REFERENCES officers (id),
  notes TEXT,
  -- `Quantity`, `Quantity1`, `Over Quantity` (Long Integer in Access).
  quantity INTEGER CHECK (quantity >= 0),
  quantity_extra INTEGER CHECK (quantity_extra >= 0),
  over_quantity INTEGER CHECK (over_quantity >= 0),
  cash_found_place TEXT,
  cash_serials TEXT,
  cash_serials1 TEXT,
  informant_help TEXT,
  informant_note2 TEXT,
  accused_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
-- §4.3: a CR number is unique per office and year among live CRs (a deleted one can be reused).
CREATE UNIQUE INDEX crime_reports_number ON crime_reports (office_id, cr_year, cr_number)
  WHERE deleted_at IS NULL;
CREATE INDEX crime_reports_year ON crime_reports (office_id, cr_year, month);
CREATE INDEX crime_reports_detection ON crime_reports (office_id, detection_date);
CREATE INDEX crime_reports_offence ON crime_reports (offence_type_id);
CREATE INDEX crime_reports_detecting ON crime_reports (detecting_officer_id);
CREATE INDEX crime_reports_informant ON crime_reports (informant_id);

CREATE TABLE accused (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  name TEXT NOT NULL,
  address TEXT,
  nic TEXT,
  age INTEGER CHECK (age BETWEEN 0 AND 130),
  height TEXT,
  sex TEXT CHECK (sex IN ('male', 'female')),
  features TEXT,
  phone TEXT,
  driving_licence_no TEXT,
  passport_no TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX accused_cr ON accused (crime_report_id);
CREATE INDEX accused_name ON accused (name COLLATE NOCASE);
CREATE INDEX accused_nic ON accused (nic);

CREATE TABLE sureties (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  name TEXT NOT NULL,
  address TEXT,
  nic TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX sureties_cr ON sureties (crime_report_id);

-- Free text in Access with no agreed format (14.45 or 14:45), so kept as typed.
CREATE TABLE detection_times (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  arrival TEXT,
  bc_leaving TEXT,
  ipr_leaving TEXT,
  detection TEXT,
  after_detection TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX detection_times_cr ON detection_times (crime_report_id);

-- dh1-dh5 = positions 1-5, inh1-inh5 = positions 6-10.
CREATE TABLE cr_support_officers (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  officer_id TEXT NOT NULL REFERENCES officers (id),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX cr_support_officers_pos ON cr_support_officers (crime_report_id, position);

-- sp1-sp15: one row per item type found.
CREATE TABLE seized_items (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  position INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  over_quantity REAL CHECK (over_quantity >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX seized_items_cr ON seized_items (crime_report_id);

-- `Cash 5000`…`Cash 10` (used) and `Cash1 5000`…`Cash7 10` (left): note serials as typed.
CREATE TABLE cash_notes (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  kind TEXT NOT NULL CHECK (kind IN ('used', 'left')),
  denomination INTEGER NOT NULL CHECK (denomination IN (5000, 1000, 500, 100, 50, 20, 10)),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX cash_notes_box ON cash_notes (crime_report_id, kind, denomination);

-- `Production list`, `Production1`, `Production2` = positions 0, 1, 2.
CREATE TABLE productions (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 2),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX productions_pos ON productions (crime_report_id, position);

-- ============================ Cases (§1.5) ============================

CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  court_id TEXT NOT NULL REFERENCES courts (id),
  court_date TEXT CHECK (court_date IS NULL OR date(court_date) = court_date),
  prosecuting_officer_id TEXT REFERENCES officers (id),
  case_number TEXT,
  case_type TEXT CHECK (case_type IN ('trial', 'warrant', 'summons')),
  sithasi INTEGER NOT NULL DEFAULT 0 CHECK (sithasi IN (0, 1)),
  permission_pending INTEGER NOT NULL DEFAULT 0 CHECK (permission_pending IN (0, 1)),
  withdrawn INTEGER NOT NULL DEFAULT 0 CHECK (withdrawn IN (0, 1)),
  accused_died INTEGER NOT NULL DEFAULT 0 CHECK (accused_died IN (0, 1)),
  -- Physical register references (`volum no`, `volum p`, `index p`, `index sn`).
  register_volume_no TEXT,
  register_volume_page TEXT,
  register_index_page TEXT,
  register_index_sn TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX cases_cr ON cases (crime_report_id);
CREATE INDEX cases_court_date ON cases (court_date);
CREATE INDEX cases_court_number ON cases (court_id, case_number);

-- Summons, warrant and the 21 trial dates, each with its memo.
CREATE TABLE hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases (id),
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('trial', 'warrant', 'summons')),
  date TEXT NOT NULL CHECK (date(date) = date),
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX hearings_case ON hearings (case_id, position);

-- One-to-many: an accused may get a fine and imprisonment (§4.2).
CREATE TABLE outcomes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases (id),
  position INTEGER NOT NULL,
  outcome_type TEXT NOT NULL,
  convicted_date TEXT CHECK (convicted_date IS NULL OR date(convicted_date) = convicted_date),
  fine_amount INTEGER CHECK (fine_amount >= 0),
  prison_months INTEGER CHECK (prison_months >= 0),
  prison_days INTEGER CHECK (prison_days >= 0),
  receipt_no TEXT,
  receipt_date TEXT CHECK (receipt_date IS NULL OR date(receipt_date) = receipt_date),
  add_to_convict_register INTEGER NOT NULL DEFAULT 0 CHECK (add_to_convict_register IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX outcomes_case ON outcomes (case_id, position);
CREATE INDEX outcomes_convicts ON outcomes (add_to_convict_register, case_id);

CREATE TABLE reward_vouchers (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases (id),
  received INTEGER NOT NULL DEFAULT 0 CHECK (received IN (0, 1)),
  date TEXT CHECK (date IS NULL OR date(date) = date),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX reward_vouchers_case ON reward_vouchers (case_id);

-- `newcr` (officer who took over), `crpersan` (where the file is), `crhdate`.
CREATE TABLE cr_handover (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  officer TEXT,
  location TEXT,
  date TEXT CHECK (date IS NULL OR date(date) = date),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE UNIQUE INDEX cr_handover_cr ON cr_handover (crime_report_id);

-- ============================ Files and documents ============================

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  stored_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX files_cr ON files (crime_report_id);
CREATE UNIQUE INDEX files_stored ON files (stored_name);

-- D's template registry (registry/templates.json is the seed). `id` is the path under
-- templates/original, so it is not a UUID.
CREATE TABLE document_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  family TEXT NOT NULL,
  offence_codes_json TEXT NOT NULL DEFAULT '[]',
  variant_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('unconfirmed', 'current', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

-- D's generation log: append-only.
CREATE TABLE generated_documents (
  id TEXT PRIMARY KEY,
  crime_report_id TEXT NOT NULL REFERENCES crime_reports (id),
  cr_number TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_sha256 TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  pdf_path TEXT,
  empty_fields_json TEXT NOT NULL DEFAULT '[]',
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX generated_documents_cr ON generated_documents (crime_report_id, generated_at);
