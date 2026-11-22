'use client';

import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { AGING_BUCKETS, useAgingBalance } from '@/lib/queries/agency-reporting';
import { cn } from '@/lib/utils';

import { TRANCHE_DU_BUCKET, type CleDeTranche } from './tranches';

/** Du plus clair au plus soutenu : l'ancienneté se lit à l'intensité (maquette `TRANCHES.fond`). */
const FOND: Record<(typeof AGING_BUCKETS)[number], string> = {
  '1_30': 'bg-destructive/30',
  '31_60': 'bg-destructive/55',
  '61_90': 'bg-destructive/75',
  '90_plus': 'bg-destructive',
};

/**
 * TCK-2629 — la balance âgée en tête de l'onglet « Impayés » de Rapports (maquette `app-rapports`,
 * « Impayés (balance âgée) ») : les quatre tranches de `finance/aging` — la même lecture que le résumé
 * au-dessus —, chacune avec son compte, son montant et sa part du total.
 *
 * Au bureau, une carte par tranche, qui FILTRE la liste en dessous (`filter[days_late_min/max]` de la
 * tranche : `TRANCHE_DU_BUCKET`) et dit qu'elle est active (`aria-pressed`). Au téléphone, la barre
 * seule : les pastilles juste en dessous portent les comptes et le filtre (maquette).
 */
export function BalanceAgee({
  agencyId,
  active,
  onChoisir,
}: {
  readonly agencyId: number | undefined;
  readonly active: CleDeTranche;
  readonly onChoisir: (cle: CleDeTranche) => void;
}) {
  const t = useTranslations('admin.finances.impayes');
  const f = useFormatteurs();
  const aging = useAgingBalance(agencyId, 'tenant');
  const data = aging.data?.data;

  if (!data) {
    return aging.isError ? null : <Skeleton className="mt-4 h-2.5 w-full rounded-full lg:h-28 lg:rounded-xl" aria-hidden="true" />;
  }

  const total = data.total.amount;
  const part = (montant: number) => (total > 0 ? (montant / total) * 100 : 0);

  return (
    <div data-slot="balance-agee">
      <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full lg:hidden" aria-hidden="true">
        {AGING_BUCKETS.filter((b) => data.buckets[b].amount > 0).map((b) => (
          <span key={b} className={FOND[b]} style={{ width: `${part(data.buckets[b].amount)}%` }} />
        ))}
      </div>
      <ul aria-label={t('anciennete.label')} className="mt-4 grid grid-cols-2 gap-3 max-lg:hidden xl:grid-cols-4">
        {AGING_BUCKETS.map((b) => {
          const cle = TRANCHE_DU_BUCKET[b];
          const cellule = data.buckets[b];
          const estActive = active === cle;
          return (
            <li key={b} className="min-w-0">
              <button
                type="button"
                aria-pressed={estActive}
                data-tranche={cle}
                onClick={() => onChoisir(estActive ? 'tous' : cle)}
                className={cn(
                  'block w-full rounded-xl border bg-card p-4 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring',
                  estActive ? 'border-foreground' : 'border-border',
                )}
              >
                <span className="flex items-center justify-between gap-2 text-ui text-muted-foreground">
                  <span className="truncate">{t('anciennete.carte', { tranche: t(`tranches.${cle}`) })}</span>
                  <span className="flex-none tabular-nums">{t('anciennete.echeances', { count: cellule.count })}</span>
                </span>
                <span className="mt-1 block font-display text-affiche-22 font-semibold tracking-titre tabular-nums">
                  {f.montantCourt(cellule.amount)}
                </span>
                <span className="mt-3 block h-1.5 rounded-full bg-muted" aria-hidden="true">
                  <span className={cn('block h-full rounded-full', FOND[b])} style={{ width: `${part(cellule.amount)}%` }} />
                </span>
                <span className="mt-1.5 block text-xs tabular-nums text-muted-foreground">
                  {t('anciennete.part', { pourcent: f.nombre(Math.round(part(cellule.amount))), total: f.montantCourt(total) })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
