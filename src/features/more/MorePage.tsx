import { NavLink } from 'react-router-dom';
import { IconBulb, IconShield, IconTrophy, IconUser } from '@/ui/icons';

const LINKS = [
  { to: '/ranking', label: 'Ranking', icon: IconTrophy },
  { to: '/sugerir', label: 'Sugerir piada', icon: IconBulb },
  { to: '/perfil', label: 'Perfil', icon: IconUser },
  { to: '/admin', label: 'Admin', icon: IconShield },
];

export function MorePage() {
  return (
    <div className="page">
      <ul className="panel" style={{ listStyle: 'none', margin: 0, padding: 'var(--space-xs)', display: 'grid', gap: '2px' }}>
        {LINKS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className="btn btn-secondary"
              style={{ inlineSize: '100%', justifyContent: 'flex-start', borderRadius: 'var(--radius-well)', boxShadow: 'none', background: 'transparent' }}
            >
              <Icon size={20} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
