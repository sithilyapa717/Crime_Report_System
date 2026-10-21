// Screens and the four role menus (REWRITE_PLAN §1.2, §1.3, §5). Captions are the old menu
// captions from the labels file, in the old order. Hiding an item is convenience only: every
// service checks the role again.
import type { LabelKey } from '@excise/labels';
import type { Role } from '@excise/schemas';

export type RouteName =
  | 'home'
  | 'crEntry'
  | 'crView'
  | 'caseProgress'
  | 'registerByYear'
  | 'byCourtDate'
  | 'byDetectionDate'
  | 'convicts'
  | 'convictsCheck'
  | 'previousOffences'
  | 'reports'
  | 'referenceLists'
  | 'users'
  | 'backup'
  | 'audit'
  | 'import'
  | 'changePassword'
  | 'caseNumberSearch'
  | 'nameNicSearch'
  | 'previousByCourt';

export interface Route {
  name: RouteName;
  params?: Record<string, string>;
}

export interface MenuItem {
  route: RouteName;
  label: LabelKey;
}

/** Screens opened from inside another screen; allowed when that screen is. */
const SUB_ROUTES: Partial<Record<RouteName, RouteName>> = {
  caseNumberSearch: 'reports',
  nameNicSearch: 'reports',
  previousByCourt: 'reports',
};

type MenuRoute = Exclude<
  RouteName,
  'home' | 'changePassword' | 'caseNumberSearch' | 'nameNicSearch' | 'previousByCourt'
>;

const ITEM: Record<MenuRoute, LabelKey> = {
  crEntry: 'menu.crEntry',
  crView: 'menu.crView',
  caseProgress: 'menu.caseProgress',
  registerByYear: 'menu.registerByYear',
  byCourtDate: 'menu.byCourtDate',
  byDetectionDate: 'menu.byDetectionDate',
  convicts: 'menu.convicts',
  convictsCheck: 'menu.convictsCheck',
  previousOffences: 'menu.previousOffences',
  reports: 'menu.reports',
  referenceLists: 'menu.referenceLists',
  users: 'admin.users',
  backup: 'admin.backup',
  audit: 'admin.audit',
  import: 'admin.import',
};

/** The screen title shown in the top bar: the menu caption that opened it. */
export function routeTitle(route: RouteName): LabelKey {
  if (route === 'home') return 'shell.home';
  if (route === 'changePassword') return 'admin.changePassword';
  if (route === 'caseNumberSearch') return 'reports.byCaseNumber';
  if (route === 'nameNicSearch') return 'reports.byNameNic';
  if (route === 'previousByCourt') return 'reports.previousByCourt';
  return ITEM[route];
}

const items = (...routes: (keyof typeof ITEM)[]): MenuItem[] =>
  routes.map((route) => ({ route, label: ITEM[route] }));

const SEARCHES = [
  'registerByYear',
  'byCourtDate',
  'byDetectionDate',
  'convicts',
  'convictsCheck',
  'previousOffences',
] as const;

/**
 * Main menu per role. The OIC list is `menu form` (§1.3). The other three follow §1.2: detecting
 * officers have everything except the list editor; observation and supervising officers have the
 * searches and reports only (no CR entry or case progress). Check the exact order of `menu form1`,
 * `menu form2` and `menu formAC` against docs/LEGACY_SCREEN_INVENTORY.md when it is available.
 */
export const MENUS: Record<Role, { main: MenuItem[]; admin: MenuItem[] }> = {
  oic: {
    main: items('crEntry', 'crView', 'caseProgress', ...SEARCHES, 'reports', 'referenceLists'),
    admin: items('users', 'backup', 'audit', 'import'),
  },
  detecting: {
    main: items('crEntry', 'crView', 'caseProgress', ...SEARCHES, 'reports'),
    admin: [],
  },
  observation: { main: items('crView', ...SEARCHES, 'reports'), admin: [] },
  supervising: { main: items('crView', ...SEARCHES, 'reports'), admin: [] },
};

/** May this role open the screen at all (also hides direct navigation to it)? */
export function allowed(role: Role, route: RouteName): boolean {
  if (route === 'home' || route === 'changePassword') return true;
  const parent = SUB_ROUTES[route];
  if (parent) return allowed(role, parent);
  const m = MENUS[role];
  return [...m.main, ...m.admin].some((i) => i.route === route);
}

/** Sign-in screen order of the four role cards (Figma "01 Start + Login"; number keys 1-4). */
export const START_ROLES: Role[] = ['oic', 'detecting', 'observation', 'supervising'];
