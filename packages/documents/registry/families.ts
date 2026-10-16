// Display order and titles of the document families, shared by the review pack, the family audit
// and the catalogue. The Sinhala titles are working titles for D's documentation; the app's own
// captions come from packages/shared/labels.
import type { TemplateFamily } from './registry.ts';

export const FAMILY_ORDER: TemplateFamily[] = [
  'plaint',
  'charge-sheet',
  'reward-voucher',
  'motion-sheet',
  'warrant-extension',
  'previous-record',
  'production',
  'other',
];

export const FAMILY_TITLES: Record<TemplateFamily, { en: string; si: string }> = {
  plaint: { en: 'Plaints by offence', si: 'පැමිණිලි' },
  'charge-sheet': { en: 'Charge sheets', si: 'චෝදනා පත්‍ර' },
  'reward-voucher': { en: 'Reward and fine vouchers (REWARDS)', si: 'ත්‍යාග හා දඩ වවුචර' },
  'motion-sheet': { en: 'Motion sheets', si: 'මෝෂන් කොළ' },
  'warrant-extension': { en: 'Warrant extension', si: 'වරෙන්තු දිර්ග කිරීම' },
  'previous-record': { en: 'Previous-record notes', si: 'පෙර වැරදි' },
  production: { en: 'Productions', si: 'සාක්ෂි භාණ්ඩ' },
  other: { en: 'Other', si: 'වෙනත්' },
};

export const familyTitle = (f: TemplateFamily) => `${FAMILY_TITLES[f].en} – ${FAMILY_TITLES[f].si}`;
