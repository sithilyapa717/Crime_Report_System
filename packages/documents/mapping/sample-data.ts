// Made-up sample CR used until the document-data service (B8) exists.
// Every value is fictional. Sinhala values are Unicode, as the new database will store them.
import type { DocumentData } from '../engine/fill.ts';

export const SAMPLE_CR: DocumentData = {
  CR_NO_2017: '12/2026',
  office: 'මීගමුව',
  Offence: 'PUDS',
  Case_no: '45678/26',
  Name_of_Court: 'මීගමුව මහේස්ත්‍රාත් අධිකරණය',
  Date_of_Court: '2026-02-03',
  court_officer: 'සුරාබදු පරීක්ෂක ආර්. පෙරේරා',
  Name_of_Accused: 'කේ. ඒ. සමන් කුමාර',
  Address_of_Accused: 'අංක 15, පල්ලිය පාර, මීගමුව',
  NIC_No_of_Accused: '198512345678',
  Name_of_Suerty: 'ඩබ්. එම්. නිමල් සිල්වා',
  Address_of_Suerty: 'අංක 22, මුහුදු පාර, මීගමුව',
  NIC_Suerty: '851234567V',

  Date_of_Detection: '2026-01-15',
  Place_of_Detection: 'පල්ලිය පාර, මීගමුව',
  Informan: 'සුරාබදු සැරයන් ජී. ප්‍රනාන්දු',
  detection_officer: 'සුරාබදු පරීක්ෂක ආර්. පෙරේරා',
  dh1: 'සුරාබදු නිලධාරී එස්. ජයසිංහ',
  dh2: 'සුරාබදු නිලධාරී කේ. රත්නායක',
  dh3: 'සුරාබදු නිලධාරී එම්. බණ්ඩාර',
  dh4: 'සුරාබදු නිලධාරී පී. දිසානායක',
  dh5: null,
  inh1: 'සුරාබදු නිලධාරී ඒ. කුමාරසිංහ',
  Ac: 'සහකාර සුරාබදු කොමසාරිස් එල්. වීරසිංහ',
  Sc: 'සුරාබදු අධිකාරී එන්. ගුණසේකර',
  oic: 'සුරාබදු ස්ථානාධිපති ටී. විජේසූරිය',
  Drive: 'රියදුරු බී. සෙනෙවිරත්න',
  infor_help: '',

  Time_of_Arraival: '14:10',
  Time_of_BC_leaving: '14:25',
  Time_of_IPR_leaving: '14:40',
  Time_of_Detection: '14:45',

  Quantity: 750,
  Quantity1: 180,
  Over_Quantity: 570,
  sp5: 0,
  Production1: 'මිලි ලීටර් 750 බෝතලයක්',
  Production2: '',

  Cash_1000: 1,
  Cash_500: 1,
  Cash_100: 2,
  Cash_Number: 'AB123456',
  Cash_Number_1: 'CD654321',
  Cash2_1000: 0,
  Cash3_500: 0,

  result: 2500000, // Rs 25,000 in cents
  fine_date: '2026-03-10',
  WT_date: '2026-04-01',
  type: '',
};
