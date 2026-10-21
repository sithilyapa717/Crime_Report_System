// The logged-in app (Figma "02 Main menu" and the inner screens): a light top bar with the
// screen title (and a round back button inside a screen), then the screen. The main menu shows
// the role with the log-out button, then the role's items in four group cards. Screens register
// in SCREENS; the ones not built yet show a placeholder.
import { label } from '@excise/labels';
import { useEffect, useState, type ComponentType } from 'react';
import { Alert, Icon, type IconName } from '../design-system/index.js';
import { call } from '../src/ipc.js';
import { lastOffice } from '../screens/shared/CrPicker.js';
import { useNav } from './navigation.js';
import { MENUS, routeTitle, type MenuItem, type RouteName } from './routes.js';
import './shell.css';

export type Screens = Partial<Record<RouteName, ComponentType>>;

/** "role · office" as in the Figma top bar; the office is the one last used on this computer.
 *  Looked up directly, not through the shared list cache, so logging in does not freeze the
 *  drop-down lists before anyone has used them. */
function useWhere(): string {
  const { session } = useNav();
  const [officeName, setOfficeName] = useState<string | null>(null);
  useEffect(() => {
    const id = lastOffice();
    if (!id) return;
    let live = true;
    call('reference.list', 'office')
      .then((list) => live && setOfficeName(list.find((o) => o.id === id)?.value ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const role = label(`role.${session.role}`);
  return officeName ? `${role} · ${officeName}` : role;
}

export function AppShell({ screens, onLogout }: { screens: Screens; onLogout: () => void }) {
  const { route, depth, session, back, home, go } = useNav();
  const where = useWhere();
  const atHome = route.name === 'home';
  const Screen = screens[route.name] ?? NotBuilt;
  return (
    <div className="shell">
      <header className="topbar">
        {!atHome && (
          <button
            type="button"
            className="topbar__back"
            aria-label={label('login.back')}
            title={label('login.back')}
            onClick={back}
          >
            <Icon name="chevronLeft" size={20} />
          </button>
        )}
        <h1 className="topbar__title">{label(routeTitle(route.name))}</h1>
        <span className="topbar__where" title={session.username}>
          {where}
        </span>
        {!atHome && (
          <button
            type="button"
            className="topbar__icon"
            aria-label={label('shell.home')}
            title={label('shell.home')}
            onClick={home}
          >
            <Icon name="home" size={18} />
          </button>
        )}
        <button
          type="button"
          className="topbar__icon"
          aria-label={label('admin.changePassword')}
          title={label('admin.changePassword')}
          onClick={() => go('changePassword')}
        >
          <Icon name="key" size={18} />
        </button>
      </header>
      <main className="ex-page">
        {atHome ? (
          <HomeMenu onLogout={onLogout} />
        ) : (
          <Screen key={`${depth}:${route.name}:${JSON.stringify(route.params ?? {})}`} />
        )}
      </main>
    </div>
  );
}

/** The four menu columns of the Figma design, in order; each role sees only its own items. */
const GROUPS: { title: string; routes: RouteName[] }[] = [
  { title: 'menu.group.cr', routes: ['crEntry', 'crView', 'caseProgress'] },
  { title: 'menu.group.registers', routes: ['registerByYear', 'byCourtDate', 'byDetectionDate'] },
  { title: 'menu.group.convicts', routes: ['convicts', 'convictsCheck', 'previousOffences'] },
  {
    title: 'menu.group.reportsAdmin',
    routes: ['reports', 'referenceLists', 'users', 'backup', 'audit', 'import'],
  },
];

const ICONS: Partial<Record<RouteName, IconName>> = {
  crEntry: 'filePlus',
  crView: 'search',
  caseProgress: 'scale',
  registerByYear: 'list',
  byCourtDate: 'calendar',
  byDetectionDate: 'calendarCheck',
  convicts: 'users',
  convictsCheck: 'userSearch',
  previousOffences: 'history',
  reports: 'chart',
  referenceLists: 'pencil',
  users: 'users',
  backup: 'db',
  audit: 'history',
  import: 'upload',
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

/** Items only the station head has (Figma "OIC only" badge). */
const OIC_ONLY = new Set<RouteName>(['referenceLists', 'users', 'backup', 'audit', 'import']);

function HomeMenu({ onLogout }: { onLogout: () => void }) {
  const { session, go } = useNav();
  const menu = MENUS[session.role];
  const mine = new Map<RouteName, MenuItem>([...menu.main, ...menu.admin].map((i) => [i.route, i]));
  return (
    <>
      <section className="home-head">
        <h2 className="home-head__role">{label(`role.${session.role}`)}</h2>
        <button type="button" className="ex-button ex-button--primary" onClick={onLogout}>
          <Icon name="back" size={18} />
          {label('shell.logout')}
        </button>
      </section>
      {session.role === 'oic' && <FontWarning />}
      <div className="home-groups">
        {GROUPS.map((g) => {
          const items = g.routes.flatMap((r) => mine.get(r) ?? []);
          if (!items.length) return null;
          return (
            <nav key={g.title} className="home-group" aria-label={label(g.title)}>
              <h3 className="home-group__title">{label(g.title)}</h3>
              {items.map((i) => (
                <button
                  key={i.route}
                  type="button"
                  className="home-item"
                  aria-labelledby={`name-${i.route}`}
                  aria-describedby={`desc-${i.route}`}
                  onClick={() => go(i.route)}
                >
                  <span className="home-item__icon">
                    <Icon name={ICONS[i.route] ?? 'list'} />
                  </span>
                  <span className="home-item__text">
                    <span className="home-item__name" id={`name-${i.route}`}>
                      {label(i.label)}
                    </span>
                    <span className="home-item__desc" id={`desc-${i.route}`}>
                      {label(`menu.desc.${i.route}`)}
                    </span>
                    {OIC_ONLY.has(i.route) && (
                      <span className="ex-badge">{label('menu.oicOnly')}</span>
                    )}
                  </span>
                </button>
              ))}
            </nav>
          );
        })}
      </div>
    </>
  );
}

function NotBuilt() {
  return <p className="ex-card ex-empty">{label('menu.notBuilt')}</p>;
}
