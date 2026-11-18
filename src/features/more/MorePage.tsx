import { NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authDeps } from '@/data/client';
import { SignOutButton } from '@/app/SignOutButton';
import { IconBulb, IconFriends, IconShield, IconSparkle, IconTrophy, IconUser } from '@/ui/icons';

const LINKS = [
  { to: '/artefatos', label: 'Artefatos', icon: IconSparkle },
  { to: '/amigos', label: 'Amigos', icon: IconFriends },
  { to: '/ranking', label: 'Ranking', icon: IconTrophy },
  { to: '/ideia', label: 'Dar ideia', icon: IconBulb },
  { to: '/perfil', label: 'Perfil', icon: IconUser },
  { to: '/admin', label: 'Admin', icon: IconShield },
];

export function MorePage() {
  const qc = useQueryClient();
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
      {authDeps && (
        <div style={{ marginBlockStart: 'var(--space-md)' }}>
          <SignOutButton signOut={authDeps.signOut} forget={() => qc.clear()} className="btn btn-secondary" />
        </div>
      )}
    </div>
  );
}
