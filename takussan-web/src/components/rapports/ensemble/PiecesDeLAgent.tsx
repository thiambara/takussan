import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { hrefDeLOnglet } from '@/lib/navigation/rapports';

import { BlocVide } from '../vues/pieces';

/** Les étapes du pipeline que le front sait nommer (`dashboard.pipelineStages`), dans l'ordre du suivi. */
export const ETAPES_DU_PIPELINE = ['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost'] as const;

/**
 * TCK-2628 — la portée « Mes chiffres / Agence » de l'agent (sous `reports.view_agency`) : deux liens, une
 * URL chacun, qui restent sur l'onglet où l'on est (vue d'ensemble, Commissions, Pipeline).
 */
export function BasculePortee({
  agence,
  t,
  onglet: id = 'ensemble',
}: {
  readonly agence: boolean;
  readonly t: (cle: string) => string;
  readonly onglet?: 'ensemble' | 'commissions' | 'pipeline';
}) {
  const onglet =
    'inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring';
  const actif = 'bg-card text-foreground shadow-sm';
  const inactif = 'text-muted-foreground hover:text-foreground';
  return (
    <nav aria-label={t('scopeLabel')} className="inline-flex gap-1 rounded-xl bg-muted p-1">
      <Link href={hrefDeLOnglet(id)} aria-current={agence ? undefined : 'page'} className={`${onglet} ${agence ? inactif : actif}`}>
        {t('scopeMine')}
      </Link>
      <Link href={hrefDeLOnglet(id, 'agency')} aria-current={agence ? 'page' : undefined} className={`${onglet} ${agence ? actif : inactif}`}>
        {t('scopeAgency')}
      </Link>
    </nav>
  );
}

/**
 * TCK-2628 — « Prospects par étape » (maquette `BlocPipeline`) : le total, puis une barre par étape, UNE
 * série d'une couleur, le nombre écrit à côté de chaque barre. Les étapes inconnues du front ne sont pas
 * rendues (elles ne sauraient pas se nommer) mais restent comptées dans le total.
 */
export function BlocPipeline({
  pipeline,
  titre,
  total,
  vide,
  ouvrir,
  nomDeLEtape,
  className,
}: {
  readonly pipeline: Readonly<Record<string, number>>;
  readonly titre: string;
  readonly total: string;
  readonly vide: string;
  readonly ouvrir: string;
  readonly nomDeLEtape: (etape: (typeof ETAPES_DU_PIPELINE)[number]) => string;
  readonly className?: string;
}) {
  const etapes = ETAPES_DU_PIPELINE.filter((e) => typeof pipeline[e] === 'number').map((e) => [e, pipeline[e]] as const);
  const max = Math.max(1, ...etapes.map(([, n]) => n));
  return (
    <section data-slot="bloc-pipeline" className={`rounded-xl border border-border bg-card p-4 ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-ui text-muted-foreground">{titre}</h3>
          <p className="mt-0.5 font-display text-affiche-22 font-semibold tracking-titre tabular-nums">{total}</p>
        </div>
        <Link
          href="/app/leads"
          className="inline-flex min-h-11 flex-none items-center gap-0.5 rounded-sm text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {ouvrir}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {etapes.length === 0 ? (
        <BlocVide message={vide} />
      ) : (
        // TCK-2801 (fiche TCK-2628, O5) — la barre PLEINE de la maquette (`BarresEtapes`), proportionnelle au
        // compte de l'étape, le compte écrit au bout de la barre ; la plus longue prend les trois quarts de la
        // place, le reste est pour le nombre.
        <ul className="mt-5 space-y-2.5">
          {etapes.map(([etape, n]) => (
            <li key={etape} data-etape={etape} className="flex items-center gap-3 text-ui">
              <span className="w-24 flex-none truncate text-foreground">{nomDeLEtape(etape)}</span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  data-slot="barre-d-etape"
                  className={`h-5 rounded-r-[0.25rem] bg-chart-1 ${n > 0 ? 'min-w-0.5' : ''}`}
                  style={{ width: `${(n / max) * 75}%` }}
                  aria-hidden="true"
                />
                <span className="flex-none font-semibold tabular-nums">{n}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
