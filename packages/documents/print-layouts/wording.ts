// Fixed wording of the printed reports, copied character for character from the old Access
// reports and forms (docs/LEGACY_SCREEN_INVENTORY.md, section numbers below). Never retype or
// "correct" these: spelling differences between old screens are kept on purpose (REWRITE_PLAN §1.9).
// They belong with the document wording, like the Word templates; if the team moves print captions
// into packages/shared/labels, these strings move unchanged.

/** Certificate of previous conviction – report "CR Register name id no RID" (§98). */
export const E48 = {
  department: 'ශ්‍රී ලංකා සුරාබදු දෙපාර්තමේන්තුව',
  formNumber: 'සුරාබදු ඊ 48',
  reference: '( N 4* S & E.) 7/64',
  title: 'කලින් වරදකරු කරනු ලැබීම පිළිබඳ සහතිකය',
  name: 'වරදකරුගේ නම :-',
  address: 'වරදකරුගේ ලිපිනය :-',
  nic: 'හැදුනුම්පත් අංකය :-',
  court: 'මහෙස්ත්‍රාත් උසාවිය :-',
  convictedDate: 'වරදකරු කළ දිනය :-',
  caseNumber: 'නඩු අංකය :-',
  offence: 'වරද :-',
  sentence: 'දණ්ඩන නියමය :-',
  fine: 'දඩමුදල',
  communityService: 'ප්‍රජාසේවය',
  admonished: 'අවවාදකොට මුදා හැරීම',
  probation: 'පරිවාසයට යොමු කිරීම',
  rehabilitation: 'පුනුරුත්තාපනය කිරීම',
  imprisonment: 'සිරදඩුවම්',
  certify: 'ඉහත වාර්තාව නිවරදි බව සහතික කර ගෞරවයෙන් ඉදිරිපත් කරමි.',
} as const;

/** Monthly convicts list – report "CR Register month Year 2 fine crR" (§97). */
export const CONVICTS_LIST = {
  /** Title reads "<year> වර්ෂයේ <month> මාසයේ වැරදිකරුවන්ගේ ලේඛනය". */
  yearSuffix: 'වර්ෂයේ',
  monthSuffix: 'මාසයේ වැරදිකරුවන්ගේ ලේඛනය',
  /** Title of the convicts register screen (§56), used when the list is not for one month. */
  registerTitle: 'වරදකරුවන්ගේ ලේඛනය',
  nic: 'හැ.අ.',
  offence: 'වරද',
  quantity: 'ප්‍රමාණය',
  fine: 'දඩ මුදල',
  court: 'ම.උ',
  caseNumber: 'න.අ.',
  convictedDate: 'වරදකරු කර දිනය',
  communityService: 'ප්‍රජාසේවය',
  settlement: 'සමථය',
  probation: 'පරිවාස',
  rehabilitation: 'පුනුරුත්තාපනය',
  governmentFee: 'රජයේ ගාස්තු',
  imprisonment: 'සිරදඩුවම්',
  admonished: 'අවවාදකොට මුදා හැරීම',
  suspended: 'අත්හිටවු සිරදඩුවම්',
  // The old report had no captions over these three columns; these are the captions the old
  // screens use for the same fields (§56 convicts register form, CR forms).
  crNumber: 'අපරාධ වාර්තා අංකය',
  name: 'වරදකරුගේ නම',
  address: 'වරදකරුගේ ලිපිනය',
} as const;

/** Month names as the old combo box stored them (casenmonth, §97). */
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
