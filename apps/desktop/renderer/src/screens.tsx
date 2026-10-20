// Which component shows each menu item. Screens not listed here show "built in a later phase".
import { label } from '@excise/labels';
import { useToast } from '../design-system/index.js';
import type { Screens } from '../shell/AppShell.js';
import { useNav } from '../shell/navigation.js';
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
};
