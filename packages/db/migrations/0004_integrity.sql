-- 0004: reject states the application already treats as impossible.
-- SQLite cannot add a check or a foreign key to an existing table, so these are triggers
-- and partial unique indexes. A normal save still inserts the crime report before its accused.

-- cr_number, cr_seq and cr_year are one value: n/yyyy, with no leading zero on n.
-- printf('%d', n) equals the text before the slash, so '012' and '12abc' both fail.

CREATE TRIGGER crime_reports_integrity_insert
BEFORE INSERT ON crime_reports
BEGIN
  SELECT RAISE(ABORT, 'cr_number must match cr_seq and cr_year')
  WHERE NOT (
    instr(NEW.cr_number, '/') > 1
    AND instr(substr(NEW.cr_number, instr(NEW.cr_number, '/') + 1), '/') = 0
    AND printf('%d', NEW.cr_seq) = substr(NEW.cr_number, 1, instr(NEW.cr_number, '/') - 1)
    AND length(substr(NEW.cr_number, instr(NEW.cr_number, '/') + 1)) = 4
    AND printf('%d', NEW.cr_year) = substr(NEW.cr_number, instr(NEW.cr_number, '/') + 1)
  );
  SELECT RAISE(ABORT, 'detecting_officer_id must be a detecting_officer')
  WHERE NEW.detecting_officer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers
      WHERE id = NEW.detecting_officer_id AND kind = 'detecting_officer'
    );
  SELECT RAISE(ABORT, 'informant_id must be an informant')
  WHERE NEW.informant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.informant_id AND kind = 'informant'
    );
  SELECT RAISE(ABORT, 'ac_id must be an ac')
  WHERE NEW.ac_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.ac_id AND kind = 'ac'
    );
  SELECT RAISE(ABORT, 'sc_id must be an sc')
  WHERE NEW.sc_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.sc_id AND kind = 'sc'
    );
  SELECT RAISE(ABORT, 'oic_id must be an oic')
  WHERE NEW.oic_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.oic_id AND kind = 'oic'
    );
  SELECT RAISE(ABORT, 'driver_id must be a driver')
  WHERE NEW.driver_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.driver_id AND kind = 'driver'
    );
END;

CREATE TRIGGER crime_reports_integrity_update
BEFORE UPDATE ON crime_reports
BEGIN
  SELECT RAISE(ABORT, 'cr_number must match cr_seq and cr_year')
  WHERE NOT (
    instr(NEW.cr_number, '/') > 1
    AND instr(substr(NEW.cr_number, instr(NEW.cr_number, '/') + 1), '/') = 0
    AND printf('%d', NEW.cr_seq) = substr(NEW.cr_number, 1, instr(NEW.cr_number, '/') - 1)
    AND length(substr(NEW.cr_number, instr(NEW.cr_number, '/') + 1)) = 4
    AND printf('%d', NEW.cr_year) = substr(NEW.cr_number, instr(NEW.cr_number, '/') + 1)
  );
  SELECT RAISE(ABORT, 'detecting_officer_id must be a detecting_officer')
  WHERE NEW.detecting_officer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers
      WHERE id = NEW.detecting_officer_id AND kind = 'detecting_officer'
    );
  SELECT RAISE(ABORT, 'informant_id must be an informant')
  WHERE NEW.informant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.informant_id AND kind = 'informant'
    );
  SELECT RAISE(ABORT, 'ac_id must be an ac')
  WHERE NEW.ac_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.ac_id AND kind = 'ac'
    );
  SELECT RAISE(ABORT, 'sc_id must be an sc')
  WHERE NEW.sc_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.sc_id AND kind = 'sc'
    );
  SELECT RAISE(ABORT, 'oic_id must be an oic')
  WHERE NEW.oic_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.oic_id AND kind = 'oic'
    );
  SELECT RAISE(ABORT, 'driver_id must be a driver')
  WHERE NEW.driver_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers WHERE id = NEW.driver_id AND kind = 'driver'
    );
END;

-- Kind is the list the person belongs to. The same person in two lists is two rows.
CREATE TRIGGER officers_kind_immutable
BEFORE UPDATE ON officers
BEGIN
  SELECT RAISE(ABORT, 'officer kind is immutable')
  WHERE NEW.kind <> OLD.kind;
END;

CREATE TRIGGER cases_officer_kind_insert
BEFORE INSERT ON cases
BEGIN
  SELECT RAISE(ABORT, 'prosecuting_officer_id must be a prosecuting_officer')
  WHERE NEW.prosecuting_officer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers
      WHERE id = NEW.prosecuting_officer_id AND kind = 'prosecuting_officer'
    );
END;

CREATE TRIGGER cases_officer_kind_update
BEFORE UPDATE ON cases
BEGIN
  SELECT RAISE(ABORT, 'prosecuting_officer_id must be a prosecuting_officer')
  WHERE NEW.prosecuting_officer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM officers
      WHERE id = NEW.prosecuting_officer_id AND kind = 'prosecuting_officer'
    );
END;

CREATE TRIGGER cr_support_officers_kind_insert
BEFORE INSERT ON cr_support_officers
BEGIN
  SELECT RAISE(ABORT, 'officer_id must be a support_officer')
  WHERE NOT EXISTS (
    SELECT 1 FROM officers WHERE id = NEW.officer_id AND kind = 'support_officer'
  );
END;

CREATE TRIGGER cr_support_officers_kind_update
BEFORE UPDATE ON cr_support_officers
BEGIN
  SELECT RAISE(ABORT, 'officer_id must be a support_officer')
  WHERE NOT EXISTS (
    SELECT 1 FROM officers WHERE id = NEW.officer_id AND kind = 'support_officer'
  );
END;

CREATE TRIGGER outcomes_type_insert
BEFORE INSERT ON outcomes
BEGIN
  SELECT RAISE(ABORT, 'outcome_type is not a known outcome')
  WHERE NEW.outcome_type NOT IN (
    'fine', 'community_service', 'imprisonment', 'suspended_sentence', 'admonished',
    'settlement', 'probation', 'rehabilitation', 'government_fee', 'released',
    'acquitted', 'remanded', 'handed_to_court', 'ag_advice'
  );
END;

CREATE TRIGGER outcomes_type_update
BEFORE UPDATE ON outcomes
BEGIN
  SELECT RAISE(ABORT, 'outcome_type is not a known outcome')
  WHERE NEW.outcome_type NOT IN (
    'fine', 'community_service', 'imprisonment', 'suspended_sentence', 'admonished',
    'settlement', 'probation', 'rehabilitation', 'government_fee', 'released',
    'acquitted', 'remanded', 'handed_to_court', 'ag_advice'
  );
END;

CREATE TRIGGER generated_documents_template_insert
BEFORE INSERT ON generated_documents
BEGIN
  SELECT RAISE(ABORT, 'template_id must exist in document_templates')
  WHERE NOT EXISTS (SELECT 1 FROM document_templates WHERE id = NEW.template_id);
END;

CREATE TRIGGER generated_documents_template_update
BEFORE UPDATE ON generated_documents
BEGIN
  SELECT RAISE(ABORT, 'template_id must exist in document_templates')
  WHERE NOT EXISTS (SELECT 1 FROM document_templates WHERE id = NEW.template_id);
END;

-- Live child rows keep the order the repositories write (0, 1, 2, …).
-- cash_notes.position is not unique: migration 0003 defaulted every existing note to 0.
CREATE UNIQUE INDEX seized_items_position ON seized_items (crime_report_id, position)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX hearings_position ON hearings (case_id, position)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX outcomes_position ON outcomes (case_id, position)
  WHERE deleted_at IS NULL;
