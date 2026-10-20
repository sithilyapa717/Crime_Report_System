-- 0002: views behind the reference lists and the reports (REMAINING_WORK A7).

-- All 14 lookup lists as one list: the reference service, drop-downs and name look-ups use it.
CREATE VIEW v_reference_items AS
SELECT id, 'office' AS kind, name AS value, NULL AS code, NULL AS rank, active, deleted_at FROM offices
UNION ALL
SELECT id, 'year', name, NULL, NULL, active, deleted_at FROM years
UNION ALL
SELECT id, 'offence', name_si, code, NULL, active, deleted_at FROM offence_types
UNION ALL
SELECT id, kind, name, NULL, rank, active, deleted_at FROM officers
UNION ALL
SELECT id, 'court', name, NULL, NULL, active, deleted_at FROM courts
UNION ALL
SELECT id, 'police_area', name, NULL, NULL, active, deleted_at FROM police_areas
UNION ALL
SELECT id, 'divisional_secretariat', name, NULL, NULL, active, deleted_at FROM divisional_secretariats;

-- One row per live CR with its case: what every report filter works on (§1.6). Outcome types
-- and seized items are many-per-CR and are read separately.
CREATE VIEW v_report_rows AS
SELECT
  cr.id AS crime_report_id,
  cr.office_id,
  cr.cr_number,
  cr.cr_year,
  cr.cr_seq,
  cr.month,
  cr.half_year,
  cr.detection_date,
  ot.code AS offence_code,
  ot.name_si AS offence_name,
  a.name AS accused_name,
  a.address AS accused_address,
  a.nic AS accused_nic,
  cr.detecting_officer_id,
  det.name AS detecting_officer_name,
  cr.informant_id,
  inf.name AS informant_name,
  ct.name AS court_name,
  c.id AS case_id,
  c.court_date,
  NULLIF(TRIM(c.case_number), '') AS case_number,
  c.case_type,
  COALESCE(c.permission_pending, 0) AS permission_pending,
  COALESCE(c.withdrawn, 0) AS withdrawn,
  COALESCE(c.accused_died, 0) AS accused_died,
  (SELECT o.convicted_date FROM outcomes o
     WHERE o.case_id = c.id AND o.convicted_date IS NOT NULL
     ORDER BY o.position LIMIT 1) AS convicted_date,
  (SELECT SUM(o.fine_amount) FROM outcomes o
     WHERE o.case_id = c.id AND o.outcome_type = 'fine' AND o.fine_amount IS NOT NULL) AS fine_amount,
  COALESCE(rv.received, 0) AS reward_voucher_received,
  COALESCE((SELECT MAX(o.add_to_convict_register) FROM outcomes o WHERE o.case_id = c.id), 0)
    AS add_to_convict_register,
  cr.quantity
FROM crime_reports cr
JOIN accused a ON a.crime_report_id = cr.id
JOIN offence_types ot ON ot.id = cr.offence_type_id
LEFT JOIN officers det ON det.id = cr.detecting_officer_id
LEFT JOIN officers inf ON inf.id = cr.informant_id
LEFT JOIN cases c ON c.crime_report_id = cr.id
LEFT JOIN courts ct ON ct.id = c.court_id
LEFT JOIN reward_vouchers rv ON rv.case_id = c.id
WHERE cr.deleted_at IS NULL;
