// Top level: decides between first-run set-up, the start screen, login, a forced password change
// and the app itself, and returns to the right one when the main process says the session ended.
import type { Session } from '@excise/contract';
import type { Role } from '@excise/schemas';
import { useEffect, useState } from 'react';
import { Spinner, ToastProvider } from '../design-system/index.js';
import { AppShell } from '../shell/AppShell.js';
import { NavigationProvider } from '../shell/navigation.js';
import { LoginScreen } from '../screens/start-login/LoginScreen.js';
import { ChangePasswordScreen, FirstRunScreen } from '../screens/start-login/PasswordScreens.js';
import { StartScreen } from '../screens/start-login/StartScreen.js';
import { call, onSessionLost } from './ipc.js';
import { SCREENS } from './screens.js';

type State =
  | { at: 'loading' }
  | { at: 'firstRun' }
  | { at: 'start' }
  | { at: 'login'; role: Role }
  | { at: 'changePassword'; session: Session }
  | { at: 'app'; session: Session };

function afterLogin(session: Session): State {
  return session.mustChangePassword ? { at: 'changePassword', session } : { at: 'app', session };
}

export function App() {
  const [state, setState] = useState<State>({ at: 'loading' });

  useEffect(() => {
    (async () => {
      if (await call('auth.needsFirstUser')) return setState({ at: 'firstRun' });
      const session = await call('auth.currentSession');
      setState(session ? afterLogin(session) : { at: 'start' });
    })().catch(() => setState({ at: 'start' }));
  }, []);

  useEffect(
    () =>
      onSessionLost((reason) =>
        setState((s) =>
          reason === 'password_change_required' && 'session' in s
            ? { at: 'changePassword', session: { ...s.session, mustChangePassword: true } }
            : { at: 'start' },
        ),
      ),
    [],
  );

  const logout = () => {
    void call('auth.logout').finally(() => setState({ at: 'start' }));
  };

  let body;
  switch (state.at) {
    case 'loading':
      body = (
        <div className="ex-empty">
          <Spinner />
        </div>
      );
      break;
    case 'firstRun':
      body = <FirstRunScreen onDone={(s) => setState(afterLogin(s))} />;
      break;
    case 'start':
      body = <StartScreen onRole={(role) => setState({ at: 'login', role })} />;
      break;
    case 'login':
      body = (
        <LoginScreen
          role={state.role}
          onBack={() => setState({ at: 'start' })}
          onLoggedIn={(s) => setState(afterLogin(s))}
        />
      );
      break;
    case 'changePassword':
      body = (
        <ChangePasswordScreen
          forced={state.session.mustChangePassword}
          onDone={() =>
            setState({ at: 'app', session: { ...state.session, mustChangePassword: false } })
          }
          onCancel={
            state.session.mustChangePassword
              ? logout
              : () => setState({ at: 'app', session: state.session })
          }
        />
      );
      break;
    case 'app':
      body = (
        <NavigationProvider session={state.session}>
          <AppShell screens={SCREENS} onLogout={logout} />
        </NavigationProvider>
      );
      break;
  }
  return <ToastProvider>{body}</ToastProvider>;
}
