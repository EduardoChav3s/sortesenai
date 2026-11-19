import { useState } from 'react';
import { LEGEND_POTION, POTIONS, WALLET } from '@/design/sample';
import { formatCoins, formatLuck } from '@/lib/format';
import { IconCoin } from '@/ui/icons';
import { isLive, useMyProfile, useShop, useShopActions, useUpdateProfile, useWallet } from '@/data/live';
import { isApiError } from '@/data/errors';
import s from './ShopPage.module.css';

const dur = (m: number | null, n: number | null) => (m ? `${m} minutos` : n === 1 ? '1 roletada' : `${n} roletadas`);

// [exemplo] Títulos à venda. O jogador escolhe um para aparecer ao lado do nome.
const TITLES = [
  { id: 't1', name: 'Mão de ouro', note: 'Para quem jura que não é sorte.', price: 2_000, owned: true },
  { id: 't2', name: 'Rei do caça-níquel', note: 'Aparece no ranking e no mural.', price: 3_500, owned: false },
  { id: 't3', name: 'Lenda da turma', note: 'O título mais caro da loja.', price: 20_000, owned: false },
];

type Tab = 'sorte' | 'titulos';

function Price({ value }: { value: number }) {
  return (
    <span className={s.price}>
      <IconCoin size={18} />
      {formatCoins(value)}
    </span>
  );
}

function ComingSoon() {
  return (
    <li className={s.soon}>
      <span className={s.soonMark} aria-hidden="true">
        ?
      </span>
      <p className={s.soonText}>Mais itens em breve</p>
    </li>
  );
}

const ATTR: Record<string, string> = { luck: 'Sorte', xp: 'XP', money: 'Moedas' };
const pictureOf = (x: object): string | null => ('image' in x && typeof x.image === 'string' ? x.image : null);

/** The item's picture in a fixed frame: shown whole, never stretched; hidden if the link stops working. */
function ItemPicture({ src, className }: { src: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <span className={`${s.pic} ${className}`}>
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </span>
  );
}

export function ShopPage() {
  const [tab, setTab] = useState<Tab>('sorte');
  const shop = useShop();
  const act = useShopActions();
  const wallet = useWallet();
  const profile = useMyProfile();
  const setTitle = useUpdateProfile();
  const [demoTitle, setDemoTitle] = useState('Mão de ouro');
  const titleInUse = isLive ? profile.data?.profile.title_name ?? null : demoTitle;
  const wear = (t: { id: string; name: string }) => (isLive ? setTitle.mutate({ title_id: t.id }) : setDemoTitle(t.name));
  const coins = isLive ? wallet.data?.coins ?? 0 : WALLET.coins;
  const liveItems = (shop.data?.items ?? []).map((i) => ({
    id: i.id, name: i.name, mult: Number(i.multiplier), duration: dur(i.duration_minutes, i.duration_pulls), price: Number(i.price), owned: i.owned, image: i.image_url as string | null, attr: ATTR[i.attribute ?? 'luck'],
  }));
  const legendLive = [...liveItems].sort((a, b) => b.mult - a.mult)[0];
  const legend = isLive ? legendLive : { ...LEGEND_POTION, owned: 0 };
  const potions = isLive ? liveItems.filter((i) => i !== legendLive) : POTIONS;
  const titles = isLive ? (shop.data?.titles ?? []).map((t) => ({ id: t.id, name: t.name, note: t.description, price: Number(t.price), owned: t.owned })) : TITLES;
  const missing = legend ? legend.price - coins : 0;
  const err = act.buyItem.error ?? act.usePotion.error ?? act.buyTitle.error ?? setTitle.error;
  const errText = err ? (isApiError(err) && err.code === 'insufficient_coins' ? 'Moedas insuficientes.' : 'Não deu certo. Tente de novo.') : null;
  const buyItem = (id: string) => isLive && act.buyItem.mutate(id);
  const usePotion = (id: string) => isLive && act.usePotion.mutate(id);
  const buyTitle = (id: string) => isLive && act.buyTitle.mutate(id);

  return (
    <div className="page">
      <div className="segmented" role="group" aria-label="Seção da loja">
        <button type="button" aria-pressed={tab === 'sorte'} onClick={() => setTab('sorte')}>
          Poções de sorte
        </button>
        <button type="button" aria-pressed={tab === 'titulos'} onClick={() => setTab('titulos')}>
          Títulos
        </button>
      </div>

      {errText && <p role="alert" className="page-sub" style={{ color: 'var(--color-error)', fontWeight: 600 }}>{errText}</p>}
      {tab === 'sorte' ? (
        <>
          {legend && <section className={`panel ${s.legend}`} aria-labelledby="legend-name">
            {pictureOf(legend) && <ItemPicture src={pictureOf(legend)!} className={s.legendPic} />}
            <div>
              <p className={s.legendMult}>{formatLuck(legend.mult)}</p>
              <h2 id="legend-name" className={s.legendName}>
                {legend.name}
              </h2>
              <p className={s.legendNote}>Vale por {legend.duration}. É o caminho até as cartas míticas.</p>
            </div>
            <div className={s.legendBuy}>
              <Price value={legend.price} />
              <button type="button" className="btn btn-primary" disabled={missing > 0} onClick={() => buyItem(legend.id)}>
                Comprar
              </button>
              {missing > 0 && <span className={s.short}>Faltam {formatCoins(missing)} moedas</span>}
            </div>
          </section>}

          <ul className={s.grid}>
            {potions.map((p) => (
              <li key={p.id} className={`panel ${s.item}`}>
                {pictureOf(p) && <ItemPicture src={pictureOf(p)!} className={s.itemPic} />}
                <span className={s.flask}>{formatLuck(p.mult)}</span>
                <h3 className={s.itemName}>{p.name}</h3>
                <p className={s.itemMeta}>
                  {'attr' in p ? String(p.attr) : 'Sorte'} {formatLuck(p.mult)} por {p.duration}
                </p>
                {p.owned > 0 && <span className={s.owned}>Você tem {p.owned}</span>}
                <div className={s.itemFoot}>
                  <Price value={p.price} />
                  <span style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    {p.owned > 0 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => usePotion(p.id)}>
                        Usar
                      </button>
                    )}
                    <button type="button" className="btn btn-primary btn-sm" disabled={p.price > coins} onClick={() => buyItem(p.id)}>
                      Comprar
                    </button>
                  </span>
                </div>
              </li>
            ))}
            <ComingSoon />
          </ul>
        </>
      ) : (
        <ul className={s.grid}>
          {titles.map((t) => (
            <li key={t.id} className={`panel ${s.item}`}>
              <span className={s.titleTag}>{t.name}</span>
              <p className={s.itemMeta}>{t.note}</p>
              {t.owned && <span className={s.owned}>Você já tem</span>}
              <div className={s.itemFoot}>
                <Price value={t.price} />
                {t.owned ? (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={titleInUse === t.name || setTitle.isPending} onClick={() => wear(t)}>
                    {titleInUse === t.name ? 'No seu perfil' : 'Usar no perfil'}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" disabled={t.price > coins} onClick={() => buyTitle(t.id)}>
                    Comprar
                  </button>
                )}
              </div>
            </li>
          ))}
          <ComingSoon />
        </ul>
      )}
    </div>
  );
}
