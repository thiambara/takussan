'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { ecartAffichable } from '@/lib/favoris-suivi';
import { cn } from '@/lib/utils';

export interface PastilleDEcartProps {
  /** Prix courant − prix de référence ; `null` ou `0` : aucune pastille. */
  readonly ecart: number | null | undefined;
  readonly currency?: string | null;
  /**
   * D'où part l'écart : `ajout` (l'appareil de l'anonyme a gardé le prix vu au cœur) ou `compte`
   * (`price_change` de l'API, pris à l'enregistrement du favori dans le compte — pour un favori
   * versé depuis l'appareil à la connexion, c'est le prix de la connexion, TCK-2507).
   */
  readonly depuis: 'ajout' | 'compte';
  readonly className?: string;
}

/**
 * TCK-2508 — ce qui a changé depuis l'ajout : « −50 000 F CFA ». Une baisse en vert (la raison de
 * revenir), une hausse en neutre. Rien pour un écart inconnu ou nul — jamais « 0 F » (AC1).
 */
export function PastilleDEcart({ ecart, currency, depuis, className }: PastilleDEcartProps) {
  const t = useTranslations('favorites.suivi.ecart');
  const { montant } = useFormatteurs();
  if (!ecartAffichable(ecart)) return null;

  const baisse = ecart < 0;
  const valeur = montant(Math.abs(ecart), currency ?? 'XOF');
  const Icone = baisse ? TrendingDown : TrendingUp;
  const phrase = t(`${baisse ? 'baisse' : 'hausse'}.${depuis}`, { montant: valeur });

  return (
    <span
      data-testid="pastille-ecart"
      data-sens={baisse ? 'baisse' : 'hausse'}
      title={phrase}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums',
        baisse ? 'bg-muted text-success' : 'bg-muted text-foreground',
        className,
      )}
    >
      <Icone className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true">{t(baisse ? 'moins' : 'plus', { montant: valeur })}</span>
      <span className="sr-only">{phrase}</span>
    </span>
  );
}
