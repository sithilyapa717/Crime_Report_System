// The logged-in app: one wallpaper behind everything, the dark glass sidebar on the left (it is
// the main menu: the role's items in the four groups of the Figma "02 Main menu", then log out),
// and on the right a glass top bar with the screen title (and a round back button inside a
// screen), then the screen. The main menu page itself greets the role. Screens register in
// SCREENS; the ones not built yet show a placeholder.
import { label } from '@excise/labels';
import { useEffect, useState, type ComponentType } from 'react';
import {
  Alert,
  Icon,
  applyTextSize,
  nextTextSize,
  storedTextSize,
  type IconName,
} from '../design-system/index.js';
import { call } from '../src/ipc.js';
import { lastOffice } from '../screens/shared/CrPicker.js';
import { useNav } from './navigation.js';
import { MENUS, menuRoute, routeTitle, type MenuItem, type RouteName } from './routes.js';
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
  const [textSize, setTextSize] = useState(storedTextSize);
  const textSizeTitle = `${label('shell.textSize')}: ${label(`shell.textSize.${textSize}`)}`;
  return (
    <div className="shell ex-backdrop">
      <Sidebar current={atHome ? null : menuRoute(route.name)} onLogout={onLogout} />
      <div className="shell__main">
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
            aria-label={textSizeTitle}
            title={textSizeTitle}
            onClick={() => {
              const next = nextTextSize(textSize);
              applyTextSize(next);
              setTextSize(next);
            }}
          >
            <Icon name="type" size={18} />
          </button>
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
            <HomePage />
          ) : (
            <Screen key={`${depth}:${route.name}:${JSON.stringify(route.params ?? {})}`} />
          )}
        </main>
      </div>
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
    routes: ['reports', 'referenceLists', 'adminHub'],
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
  adminHub: 'db',
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

/** The sidebar: the main menu. Each role sees only its own items, in the four groups. The item
 *  of the screen shown (or of the screen that opened it) is marked as the current page. */
function Sidebar({ current, onLogout }: { current: RouteName | null; onLogout: () => void }) {
  const { session, open, home } = useNav();
  const menu = MENUS[session.role];
  const mine = new Map<RouteName, MenuItem>([...menu.main, ...menu.admin].map((i) => [i.route, i]));
  return (
    <aside className="ex-sidebar">
      <button type="button" className="ex-sidebar__brand" onClick={home}>
        <span className="ex-sidebar__mark" aria-hidden="true">
          ස
        </span>
        <span className="ex-sidebar__text">{label('start.subtitle')}</span>
      </button>
      <nav className="ex-sidebar__nav" aria-label={label('shell.home')}>
        {GROUPS.map((g) => {
          const items = g.routes.flatMap((r) => mine.get(r) ?? []);
          if (!items.length) return null;
          return (
            <div key={g.title} className="ex-sidebar__group">
              <p className="ex-sidebar__label">{label(g.title)}</p>
              {items.map((i) => (
                <button
                  key={i.route}
                  type="button"
                  className="ex-sidebar__item"
                  aria-current={i.route === current ? 'page' : undefined}
                  title={label(`menu.desc.${i.route}`)}
                  onClick={() => open(i.route)}
                >
                  <Icon name={ICONS[i.route] ?? 'list'} size={20} />
                  <span className="ex-sidebar__text">{label(i.label)}</span>
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="ex-sidebar__foot">
        <p className="ex-sidebar__who" title={session.username}>
          {label(`role.${session.role}`)}
        </p>
        <button type="button" className="ex-sidebar__item" onClick={onLogout}>
          <Icon name="logOut" size={20} />
          <span className="ex-sidebar__text">{label('shell.logout')}</span>
        </button>
      </div>
    </aside>
  );
}

/** The main menu page: the department and the role, on glass over the wallpaper. What else it
 *  shows is still to be decided; the menu itself is the sidebar. */
function HomePage() {
  const { session } = useNav();
  return (
    <>
      <section className="home-welcome">
        <p className="home-welcome__dept">{label('start.title')}</p>
        <h2 className="home-welcome__role">{label(`role.${session.role}`)}</h2>
        <p className="home-welcome__system">{label('start.subtitle')}</p>
      </section>
      {session.role === 'oic' && <FontWarning />}
    </>
  );
}

function NotBuilt() {
  return <p className="ex-card ex-empty">{label('menu.notBuilt')}</p>;
}
