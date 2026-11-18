import { useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { formatCoins, formatLuck } from '@/lib/format';
import { ME, WALLET } from '@/design/sample';
import { isLive, useChallenges, useClaimDaily, useDailyStatus, playerChip, useFriends, useLevel, useTrades, useLuck, useMyProfile, useRole, useWallet } from '@/data/live';
import { Avatar } from '@/ui/Avatar';
import { LiveNotice } from '@/features/roll/Extras';
import { levelProgress } from '@/lib/level';
import {
  IconBag,
  IconBulb,
  IconCards,
  IconClover,
  IconCoin,
  IconGame,
  IconGift,
  IconMore,
  IconRoll,
  IconShield,
  IconSparkle,
  IconFriends,
  IconTrophy,
} from '@/ui/icons';
import s from './Shell.module.css';

interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Jogar',
    items: [
      { to: '/', label: 'Roletar', icon: IconRoll },
      { to: '/colecao', label: 'Coleção', icon: IconCards },
      { to: '/jogos', label: 'Jogos', icon: IconGame },
      { to: '/loja', label: 'Loja', icon: IconBag },
      { to: '/artefatos', label: 'Artefatos', icon: IconSparkle },
    ],
  },
  {
    label: 'Turma',
    items: [
      { to: '/amigos', label: 'Amigos', icon: IconFriends },
      { to: '/ranking', label: 'Ranking', icon: IconTrophy },
      { to: '/ideia', label: 'Dar ideia', icon: IconBulb },
    ],
  },
];

// Every album section is printed in its own color; the page buttons and bars take it too.
type Sec = { base: string; deep: string; ink: string };
const sec = (name: string, ink: "dark" | "light"): Sec => ({
  base: `var(--sec-${name})`,
  deep: `var(--sec-${name}-deep)`,
  ink: ink === "dark" ? "var(--color-ink)" : "var(--color-paper-3)",
});
const NEUTRAL: Sec = { base: "var(--color-paper-2)", deep: "var(--color-rule)", ink: "var(--color-ink)" };
const SECTION: Record<string, Sec> = {
  "/": sec("roll", "light"),
  "/colecao": sec("collection", "dark"),
  "/jogos": sec("games", "dark"),
  "/loja": sec("shop", "dark"),
  "/ranking": sec("ranking", "light"),
  "/ideia": sec("suggest", "dark"),
  "/artefatos": sec("artifacts", "light"),
  "/amigos": sec("friends", "dark"),
  "/perfil": sec("profile", "dark"),
  "/admin": NEUTRAL,
  "/mais": NEUTRAL,
};
const secStyle = (to: string) => ({ "--sec": (SECTION[to] ?? NEUTRAL).base }) as CSSProperties;
const pageStyle = (to: string) => {
  const s = SECTION[to] ?? SECTION["/"];
  const accent = s === NEUTRAL ? SECTION["/"] : s;
  return { "--color-accent": accent.base, "--color-accent-deep": accent.deep, "--color-accent-ink": accent.ink } as CSSProperties;
};

const TABS: NavItem[] = [
  { to: '/', label: 'Roletar', icon: IconRoll },
  { to: '/colecao', label: 'Coleção', icon: IconCards },
  { to: '/jogos', label: 'Jogos', icon: IconGame },
  { to: '/loja', label: 'Loja', icon: IconBag },
  { to: '/mais', label: 'Mais', icon: IconMore },
];

const TITLES: Record<string, string> = {
  '/': 'Roletar',
  '/colecao': 'Coleção',
  '/jogos': 'Jogos',
  '/loja': 'Loja',
  '/ranking': 'Ranking',
  '/ideia': 'Dar ideia',
  '/artefatos': 'Artefatos',
  '/amigos': 'Amigos',
  '/perfil': 'Perfil',
  '/admin': 'Admin',
  '/mais': 'Mais',
};

function Brand() {
  return (
    <NavLink to="/" className={s.brand} aria-label="SorteSenai, ir para Roletar">
      <img className={s.mark} src="/brand/mascote.webp" alt="" width={44} height={44} decoding="async" />
      <span className={s.word}>
        <span className={s.wordSorte}>Sorte</span>
        <span className={s.wordSenai}>Senai</span>
      </span>
    </NavLink>
  );
}

/** Once a day: gives the daily coins, then waits until tomorrow. */
function DailyButton() {
  const status = useDailyStatus();
  const claim = useClaimDaily();
  const [demoDone, setDemoDone] = useState(false);
  const claimed = isLive ? status.data?.claimed_today === true || claim.isSuccess : demoDone;
  const label = claim.isSuccess && claim.data ? 'Bônus pego!' : claimed ? 'Volte amanhã' : claim.isError ? 'Tente de novo' : 'Bônus diário';
  function take() {
    if (!isLive) return setDemoDone(true);
    claim.mutate();
  }
  return (
    <button
      type="button"
      className={`btn btn-secondary ${s.daily}`}
      onClick={take}
      disabled={claimed || claim.isPending || (isLive && status.isLoading)}
      title={claimed ? 'Você já pegou o bônus de hoje' : 'Pegar as moedas do dia'}
      aria-live="polite"
    >
      <IconGift size={18} />
      <span>{label}</span>
    </button>
  );
}

export function Shell() {
  const { pathname: path } = useLocation();
  // Another player's page borrows the profile section color and title.
  const pathname = path.startsWith('/jogador/') ? '/perfil' : path;
  const title = path.startsWith('/jogador/') ? 'Jogador' : TITLES[pathname] ?? 'SorteSenai';
  const friends = useFriends();
  const trades = useTrades();
  const duels = useChallenges();
  const incoming = (friends.data?.incoming.length ?? 0) + (trades.data?.incoming.length ?? 0) + (duels.data?.incoming.length ?? 0);
  const wallet = useWallet();
  const coins = wallet.data?.coins ?? (isLive ? 0 : WALLET.coins);
  const myName = wallet.data?.nickname ?? ME.name;
  const luck = useLuck();
  const profile = useMyProfile();
  const chip = isLive ? playerChip('me', myName, profile.data?.profile.avatar_url ?? null) : { ...ME, avatar: null };
  const level = useLevel();
  const lv = isLive ? level.data : { xp: 450, level: 3, level_start: 300, next_at: 600, reward: 0 };
  const myTitle = isLive ? profile.data?.profile.title_name ?? 'Sem título' : ME.title;
  const role = useRole();
  const showAdmin = !isLive || role.data === 'admin';
  const luckValue = isLive ? Number(luck.data?.effective ?? 1) : WALLET.luck;

  return (
    <div className={s.shell} style={pageStyle(pathname)}>
      {isLive && <LiveNotice />}
      <aside className={`panel ${s.sidebar}`} aria-label="Navegação principal">
        <Brand />
        <nav className={s.nav}>
          {GROUPS.map((g) => (
            <div key={g.label} className={s.group}>
              <p className={s.groupLabel}>{g.label}</p>
              <ul>
                {g.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === '/'} style={secStyle(to)} className={({ isActive }) => `${s.link} ${isActive ? s.active : ''}`}>
                      <span className={s.linkIcon}>
                        <Icon size={18} />
                      </span>
                      <span>{label}</span>
                      {to === '/amigos' && incoming > 0 && (
                        <span className={s.navCount} aria-label={`${incoming} coisas esperando você em Amigos`}>
                          {incoming}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={s.sideFoot}>
          {showAdmin && (
          <NavLink to="/admin" style={secStyle('/admin')} className={({ isActive }) => `${s.link} ${s.adminLink} ${isActive ? s.active : ''}`}>
            <span className={s.linkIcon}>
              <IconShield size={18} />
            </span>
            <span>Admin</span>
          </NavLink>
          )}
          <NavLink to="/perfil" aria-label="Seu perfil" className={({ isActive }) => `${s.me} ${isActive ? s.meActive : ""}`}>
            <span className={s.meAvatar}>
              <Avatar initials={chip.initials} hue={chip.hue} size="40px" url={chip.avatar} />
              {lv && <span className={s.meLevel} aria-label={`Nível ${lv.level}`}>{lv.level}</span>}
            </span>
            <span className={s.meText}>
              <strong>{myName}</strong>
              <span>{myTitle}</span>
              {lv && (
                <span className={s.meXp} aria-hidden="true">
                  <span style={{ inlineSize: `${levelProgress(lv)}%` }} />
                </span>
              )}
            </span>
            {lv && lv.reward > 0 && <span className={s.meDot} title="Prêmio de nível para pegar" />}
          </NavLink>
        </div>
      </aside>

      <div className={s.main}>
        <header className={s.topbar}>
          <div className={s.mobileBrand}>
            <Brand />
          </div>
          <h1 className={s.title} style={secStyle(pathname)}>
            <span className={s.titleChip} aria-hidden="true" />
            {title}
          </h1>
          <div className={s.status}>
            <span className={s.sample}>
              <span className={s.sampleLong}>{isLive ? 'Online' : 'Dados de exemplo'}</span>
              <span className={s.sampleShort}>{isLive ? 'Online' : 'Exemplo'}</span>
            </span>
            <span className="capsule capsule-coin" title="Seu saldo">
              <span className="capsule-icon">
                <IconCoin size={18} />
              </span>
              {formatCoins(coins)}
              <span className="visually-hidden">moedas</span>
            </span>
            <span className={`capsule capsule-luck ${s.luck}`} title="Sorte ativa">
              <span className="capsule-icon">
                <IconClover size={18} />
              </span>
              {formatLuck(luckValue)}
              {!isLive && <small>{WALLET.luckLeft}</small>}
            </span>
            <DailyButton />
          </div>
        </header>
        <main className={s.content}>
          <Outlet />
        </main>
      </div>

      <nav className={`panel ${s.tabbar}`} aria-label="Navegação">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} style={secStyle(to)} className={({ isActive }) => `${s.tab} ${isActive ? s.tabActive : ''}`}>
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
