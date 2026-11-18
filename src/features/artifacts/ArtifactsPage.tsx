import { IconSparkle } from '@/ui/icons';
import s from './ArtifactsPage.module.css';

// Artifacts: lasting luck effects a player equips. None exist yet; this is the empty shelf.
const SLOTS = 3;

export function ArtifactsPage() {
  return (
    <div className="page">
      <p className="page-sub">Artefatos dão efeitos especiais de sorte enquanto estão equipados. Você vai poder usar até {SLOTS} ao mesmo tempo.</p>

      <section className={`panel ${s.equipped}`} aria-labelledby="equipped-title">
        <h2 id="equipped-title" className="section-title">
          Equipados
        </h2>
        <ul className={s.slots}>
          {Array.from({ length: SLOTS }, (_, i) => (
            <li key={i} className={s.slot}>
              <span className={s.slotNo}>{i + 1}</span>
              <span className={s.slotText}>Espaço vazio</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="mine-title">
        <h2 id="mine-title" className="section-title">
          Seus artefatos
        </h2>
        <div className={`panel ${s.empty}`}>
          <span className={s.emblem} aria-hidden="true">
            <IconSparkle size={32} />
          </span>
          <p className={s.emptyTitle}>Nenhum artefato ainda</p>
          <p className={s.emptyText}>Os primeiros artefatos estão chegando. Quando aparecerem, eles ficam guardados aqui.</p>
        </div>
      </section>
    </div>
  );
}
