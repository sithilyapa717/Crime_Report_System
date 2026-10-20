// The logged-in app: header (title, user, role, log out) and the current screen. Screens register
// in SCREENS; the ones not built yet show a placeholder.
import { label } from '@excise/labels';
import { useEffect, useState, type ComponentType } from 'react';
import { Alert, BigMenuButton, Button, MenuGrid } from '../design-system/index.js';
import { call } from '../src/ipc.js';
import { useNav } from './navigation.js';
import { MENUS, type RouteName } from './routes.js';
import './shell.css';

export type Screens = Partial<Record<RouteName, ComponentType>>;

export function AppShell({ screens, onLogout }: { screens: Screens; onLogout: () => void }) {
  const { route, depth, session, back, home, go } = useNav();
  const Screen = route.name === 'home' ? HomeMenu : (screens[route.name] ?? NotBuilt);
  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__title">
          <strong>{label('start.title')}</strong>
          <span className="ex-muted">{label('start.subtitle')}</span>
        </div>
        <div className="shell__user">
          <span>
            {session.username} · {label(`role.${session.role}`)}
          </span>
          <Button variant="ghost" onClick={() => go('changePassword')}>
            {label('admin.changePassword')}
          </Button>
          <Button variant="ghost" onClick={onLogout}>
            {label('shell.logout')}
          </Button>
        </div>
      </header>
      {route.name !== 'home' && (
        <div className="shell__crumbs">
          <Button variant="ghost" onClick={back}>
            ← {label('login.back')}
          </Button>
          <Button variant="ghost" onClick={home}>
            {label('shell.home')}
          </Button>
        </div>
      )}
      <main className="ex-page">
        <Screen key={`${depth}:${route.name}:${JSON.stringify(route.params ?? {})}`} />
      </main>
    </div>
  );
}

/** Reports and list editing sit apart on the right, as on the old main menu. */
const SIDE = new Set(['reports', 'referenceLists']);
/** Colour groups: CR work, searches, convicts, admin. */
const TONE: Partial<Record<string, number>> = {
  crEntry: 0,
  crView: 0,
  caseProgress: 0,
  registerByYear: 1,
  byCourtDate: 1,
  byDetectionDate: 1,
  convicts: 2,
  convictsCheck: 2,
  previousOffences: 2,
  reports: 3,
  referenceLists: 3,
};

/** The station head is told once per start when the templates' fonts are missing here. */
function FontWarning() {
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    call('support.fontCheck')
      .then((list) => setMissing((list ?? []).filter((f) => !f.installed).map((f) => f.font)))
      .catch(() => undefined);
  }, []);
  if (!missing.length) return null;
  return (
    <Alert kind="warn">
      {label('fonts.missing')} {missing.join(', ')}
    </Alert>
  );
}

function HomeMenu() {
  const { session, go } = useNav();
  const menu = MENUS[session.role];
  const button = (i: (typeof menu.main)[number]) => (
    <BigMenuButton
      key={i.route}
      className={`tone-${TONE[i.route] ?? 0}`}
      onClick={() => go(i.route)}
    >
      {label(i.label)}
    </BigMenuButton>
  );
  return (
    <>
      <h1>{label(`role.${session.role}`)}</h1>
      {session.role === 'oic' && <FontWarning />}
      <div className="home">
        <MenuGrid label={label('shell.home')}>
          {menu.main.filter((i) => !SIDE.has(i.route)).map(button)}
        </MenuGrid>
        <div className="home__side">
          <MenuGrid label={label('menu.reports')}>
            {menu.main.filter((i) => SIDE.has(i.route)).map(button)}
          </MenuGrid>
          {menu.admin.length > 0 && (
            <>
              <h2 className="shell__section">{label('menu.admin')}</h2>
              <MenuGrid label={label('menu.admin')}>{menu.admin.map(button)}</MenuGrid>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function NotBuilt() {
  return <p className="ex-empty">{label('menu.notBuilt')}</p>;
}
