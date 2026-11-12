'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { OffreDePassage } from '@/types/agency-upgrade';

/**
 * TCK-2671 — « Pourquoi passer en pro ? » et ce que ça coûte, à côté du formulaire (maquette
 * `app-identite-agence`, écran 9 : `AvantagesPro`). L'hôte lit le prix AVANT de donner son RIB.
 *
 * Décision 14 : le prix est celui de `GET /api/me/upgrade-offer`, en F CFA ; sans offre lisible,
 * l'écran le dit — jamais un montant par défaut. Depuis TCK-2681, l'approbation pose l'abonnement :
 * « Votre abonnement commence à l'approbation » se tient. « Le premier mois n'est facturé qu'après
 * l'acceptation » de la maquette, non (ADR-0104 § 6).
 */
interface AvantagesDuPassageProps {
  /** `null` : aucune offre (404) ; `'illisible'` : la lecture a échoué. */
  readonly offre: OffreDePassage | null | 'illisible';
}

export function AvantagesDuPassage({ offre }: AvantagesDuPassageProps) {
  const t = useTranslations('agency.upgrade.page');
  const fmt = useFormatteurs();

  return (
    <section aria-labelledby="avantages-du-passage-titre" className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 id="avantages-du-passage-titre" className="truncate text-corps font-semibold">
          {t('benefits.title')}
        </h2>
      </div>
      <ul className="space-y-2 p-4 text-sm">
        {(['team', 'multi_admin', 'custom_roles'] as const).map((cle) => (
          <li key={cle} className="flex gap-2">
            <Check className="mt-0.5 size-4 flex-none text-success" strokeWidth={2.25} aria-hidden="true" />
            <span className="text-pretty">{t(`benefits.items.${cle}`)}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border/70 px-4 py-3 text-sm text-pretty">
        {offre && offre !== 'illisible' ? (
          <>
            <span className="font-semibold tabular-nums">{t('prix.parMois', { prix: fmt.montant(offre.monthly_price_xof, 'XOF') })}</span>{' '}
            <span className="text-muted-foreground">
              {t('prix.suite', { taux: fmt.nombre(offre.platform_fee_pct, { maximumFractionDigits: 2 }) })}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">{offre === 'illisible' ? t('prix.illisible') : t('prix.absent')}</span>
        )}
      </p>
    </section>
  );
}
