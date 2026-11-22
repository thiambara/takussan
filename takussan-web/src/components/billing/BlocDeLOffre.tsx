'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { Jauge, QuotaDeLAgence } from '@/lib/queries/offre';
import type { AgencySubscription } from '@/types/super-admin';

/**
 * TCK-2671 — ce que l'agence paie et ce qu'elle consomme : le prix de son offre, la commission sur
 * les paiements encaissés en ligne, et ses jauges. Rendu en tête de l'Abonnement
 * (`/app/agency/billing`) et dans l'écran « Offre » d'une agence déjà professionnelle (maquette
 * `app-identite-agence`, `BlocOffre`).
 *
 * - Décision 14 : le prix est `subscription.plan.monthly_price_xof`, tel que l'API le rend — aucun
 *   montant ne s'écrit ici. Sans plan chargé, aucune ligne de prix (jamais un prix par défaut).
 * - Les jauges sont celles de `GET /api/me/quota` (AC5) ; une limite `null` est « Illimité », sans
 *   barre. Les succursales n'ont que leur limite, sans jauge : aucun compte n'existe (décision du
 *   porteur du 2026-11-10, point 13 a).
 * - Ce que la maquette écrit et que le produit ne tient pas (« Sans engagement ») n'est pas repris.
 */
interface BlocDeLOffreProps {
  readonly abonnement: AgencySubscription;
  /** `null` : la consommation n'a pas pu être lue — le bloc le dit au lieu de tracer des jauges vides. */
  readonly quota: QuotaDeLAgence | null;
  /** Le lien « Abonnement et factures » de l'en-tête : absent sur la page Abonnement elle-même. */
  readonly lienFactures?: boolean;
}

export function BlocDeLOffre({ abonnement, quota, lienFactures = false }: BlocDeLOffreProps) {
  const t = useTranslations('billing.offre');
  const fmt = useFormatteurs();
  const plan = abonnement.plan;
  const succursales = abonnement.effective_limits.max_branches;

  return (
    <section aria-labelledby="bloc-de-l-offre-titre" className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 id="bloc-de-l-offre-titre" className="min-w-0 flex-1 truncate text-corps font-semibold">
          {plan?.label ?? t('titre')}
        </h2>
        {lienFactures ? (
          <Link
            href="/app/agency/billing"
            className="flex-none rounded-sm text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('factures')}
          </Link>
        ) : null}
      </div>
      <div className="p-4">
        {plan ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-affiche-26 font-semibold tracking-titre tabular-nums">
                {fmt.montant(plan.monthly_price_xof, 'XOF')}
              </span>{' '}
              <span className="text-sm text-muted-foreground">{t('parMois')}</span>
            </p>
            <p className="mt-0.5 text-ui text-pretty text-muted-foreground">
              {t('commission', { taux: fmt.nombre(abonnement.effective_platform_fee_pct, { maximumFractionDigits: 2 }) })}
            </p>
          </>
        ) : null}
        {quota ? (
          <dl className={plan ? 'mt-4 space-y-3' : 'space-y-3'}>
            <LigneDeJauge libelle={t('biens')} jauge={quota.biens} illimite={t('illimite')} />
            {quota.agents ? <LigneDeJauge libelle={t('agents')} jauge={quota.agents} illimite={t('illimite')} /> : null}
            <div className="flex items-baseline text-sm">
              <dt className="flex-1 font-medium">{t('succursales')}</dt>
              <dd className="text-muted-foreground tabular-nums">
                {typeof succursales === 'number' ? t('jusquA', { limite: fmt.nombre(succursales) }) : t('illimite')}
              </dd>
            </div>
          </dl>
        ) : (
          <p className={plan ? 'mt-4 text-sm text-muted-foreground' : 'text-sm text-muted-foreground'}>{t('consommationIndisponible')}</p>
        )}
      </div>
    </section>
  );
}

function LigneDeJauge({ libelle, jauge, illimite }: { readonly libelle: string; readonly jauge: Jauge; readonly illimite: string }) {
  const t = useTranslations('billing.offre');
  const fmt = useFormatteurs();
  const limite = jauge.limit;
  const pourcent = limite && limite > 0 ? Math.min(100, Math.round((jauge.used / limite) * 100)) : 0;

  // ⚠ Un `<div>` de `<dl>` ne porte que des `<dt>`/`<dd>` : la barre est un `<dd>` de plus, sur
  // toute la largeur de la grille.
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline text-sm">
      <dt className="font-medium">{libelle}</dt>
      <dd className="text-muted-foreground tabular-nums">
        {limite === null
          ? t.rich('utiliseSansLimite', {
              used: fmt.nombre(jauge.used),
              illimite,
              b: (c) => <span className="font-medium text-foreground">{c}</span>,
            })
          : t.rich('utiliseSur', {
              used: fmt.nombre(jauge.used),
              limit: fmt.nombre(limite),
              b: (c) => <span className="font-medium text-foreground">{c}</span>,
            })}
      </dd>
      {limite === null ? null : (
        <dd className="col-span-2 mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${pourcent}%` }} />
        </dd>
      )}
    </div>
  );
}
