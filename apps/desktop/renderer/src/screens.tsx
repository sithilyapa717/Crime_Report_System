// Which component shows each menu item. Screens not listed here show "built in a later phase".
import { label } from '@excise/labels';
import { useToast } from '../design-system/index.js';
import type { Screens } from '../shell/AppShell.js';
import { useNav } from '../shell/navigation.js';
import { AuditScreen } from '../screens/admin/AuditScreen.js';
import { BackupScreen } from '../screens/admin/BackupScreen.js';
import { ImportScreen } from '../screens/admin/ImportScreen.js';
import { UsersScreen } from '../screens/admin/UsersScreen.js';
import { ReferenceListsScreen } from '../screens/reference-lists/ReferenceListsScreen.js';
import {
  ConvictsCheckScreen,
  ConvictsRegisterScreen,
} from '../screens/convicts/ConvictsScreens.js';
import {
  PreviousByCourtScreen,
  PreviousOffencesScreen,
} from '../screens/previous-offences/PreviousOffencesScreen.js';
import { ReportsScreen } from '../screens/reports/ReportsScreen.js';
import {
  ByCourtDateScreen,
  ByDetectionDateScreen,
  CaseNumberScreen,
  NameNicScreen,
  RegisterByYearScreen,
} from '../screens/searches/SearchScreens.js';
import { CaseProgressScreen } from '../screens/case-progress/CaseProgressScreen.js';
import { CrEntryScreen } from '../screens/cr-entry/CrEntryScreen.js';
import { CrViewScreen } from '../screens/cr-view/CrViewScreen.js';
import { ChangePasswordScreen } from '../screens/start-login/PasswordScreens.js';

function ChangeOwnPassword() {
  const { home, back } = useNav();
  const toast = useToast();
  return (
    <ChangePasswordScreen
      forced={false}
      onCancel={back}
      onDone={() => {
        toast(label('password.changed'));
        home();
      }}
    />
  );
}

export const SCREENS: Screens = {
  changePassword: ChangeOwnPassword,
  crEntry: CrEntryScreen,
  crView: CrViewScreen,
  caseProgress: CaseProgressScreen,
  registerByYear: RegisterByYearScreen,
  byCourtDate: ByCourtDateScreen,
  byDetectionDate: ByDetectionDateScreen,
  convicts: ConvictsRegisterScreen,
  convictsCheck: ConvictsCheckScreen,
  previousOffences: () => <PreviousOffencesScreen />,
  reports: ReportsScreen,
  caseNumberSearch: CaseNumberScreen,
  nameNicSearch: NameNicScreen,
  previousByCourt: PreviousByCourtScreen,
  referenceLists: ReferenceListsScreen,
  users: UsersScreen,
  backup: BackupScreen,
  audit: AuditScreen,
  import: ImportScreen,
};
