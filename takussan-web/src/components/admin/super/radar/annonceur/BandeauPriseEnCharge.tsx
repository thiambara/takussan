'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { RadarClaim } from '@/types/radar';

interface BandeauPriseEnChargeProps {
  readonly claim: RadarClaim | null;
  /** Un geste est en vol, ou l'annonceur a dit STOP : rien ne se prend ni ne se rend. */
  readonly desactive: boolean;
  readonly enPrise: boolean;
  readonly enRestitution: boolean;
  readonly onPrendre: () => void;
  readonly onRendre: () => void;
}

/**
 * TCK-2388 — qui tient l'annonceur, et jusqu'à quelle heure (`claim.until`, formaté — jamais une durée écrite
 * dans un dictionnaire : elle est celle de l'API). À personne : « Prendre en charge ». À moi : « Rendre ». À un
 * autre : le bandeau le dit et n'offre rien.
 */
export function BandeauPriseEnCharge({ claim, desactive, enPrise, enRestitution, onPrendre, onRendre }: BandeauPriseEnChargeProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.claim');
  const fmt = useFormatteurs();

  return (
    <section
      aria-label={t('heading')}
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
      data-testid="radar-annonceur-prise"
      data-etat={claim === null ? 'libre' : claim.mine ? 'moi' : 'autre'}
    >
      <p className="min-w-0 text-foreground">
        {claim === null
          ? t('none')
          : claim.mine
            ? t('mine', { until: fmt.dateTime(claim.until) })
            : t('other', { name: claim.by.name, until: fmt.dateTime(claim.until) })}
      </p>
      {claim === null ? (
        <Button type="button" size="sm" disabled={desactive || enPrise} onClick={onPrendre}>
          {enPrise ? t('taking') : t('take')}
        </Button>
      ) : claim.mine ? (
        <Button type="button" size="sm" variant="outline" disabled={desactive || enRestitution} onClick={onRendre}>
          {enRestitution ? t('releasing') : t('release')}
        </Button>
      ) : null}
    </section>
  );
}
