// The station head's administration page (Figma main menu item "Users & backup"): the four admin
// screens (A's) as menu items, in the main-menu card style.
import { label } from '@excise/labels';
import { Icon, type IconName } from '../design-system/index.js';
import { useNav } from './navigation.js';
import { routeTitle, type RouteName } from './routes.js';
import './shell.css';

const ITEMS: { route: RouteName; icon: IconName }[] = [
  { route: 'users', icon: 'users' },
  { route: 'backup', icon: 'db' },
  { route: 'audit', icon: 'history' },
  { route: 'import', icon: 'upload' },
];

export function AdminHub() {
  const { go } = useNav();
  return (
    <nav className="home-group admin-hub" aria-label={label('menu.adminHub')}>
      {ITEMS.map(({ route, icon }) => (
        <button
          key={route}
          type="button"
          className="home-item"
          aria-labelledby={`name-${route}`}
          aria-describedby={`desc-${route}`}
          onClick={() => go(route)}
        >
          <span className="home-item__icon">
            <Icon name={icon} />
          </span>
          <span className="home-item__text">
            <span className="home-item__name" id={`name-${route}`}>
              {label(routeTitle(route))}
            </span>
            <span className="home-item__desc" id={`desc-${route}`}>
              {label(`menu.desc.${route}`)}
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}
