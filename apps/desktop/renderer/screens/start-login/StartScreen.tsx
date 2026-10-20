// Start screen (§1.8, 01_start.png): department title in Sinhala / Tamil / English, the four
// yellow role buttons in the old order, and Quit. The attribution line waits for open question 10.
import { label } from '@excise/labels';
import type { Role } from '@excise/schemas';
import { BigMenuButton, Button } from '../../design-system/index.js';
import { START_ROLES } from '../../shell/routes.js';

export function StartScreen({ onRole }: { onRole: (role: Role) => void }) {
  return (
    <div className="start">
      <div className="start__banner">
        <h1>{label('start.title')}</h1>
        <p>{label('start.titleTamil')}</p>
        <p>Department of Excise</p>
        <p>{label('start.subtitle')}</p>
      </div>
      <nav className="start__roles" aria-label={label('start.chooseRole')}>
        {START_ROLES.map((role) => (
          <BigMenuButton key={role} yellow onClick={() => onRole(role)}>
            {label(`role.${role}`)}
          </BigMenuButton>
        ))}
      </nav>
      <div className="start__footer">
        <Button onClick={() => window.close()}>{label('start.quit')}</Button>
      </div>
    </div>
  );
}
