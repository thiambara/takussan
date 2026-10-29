'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { RadarClaim } from '@/types/radar';

interface BandeauPriseEnChargeProps {
  readonly claim: RadarClaim | null;
  /** Un geste est en vol, ou l'annonceur a dit STOP : rien ne se prend. */
  readonly prendreFerme: boolean;
  /** Un geste est en vol : rien ne se rend. Rendre reste possible sous STOP — restituer une prise est sans danger. */
  readonly rendreFerme: boolean;
  readonly enPrise: boolean;
  readonly enRestitution: boolean;
  /** TCK-2389 — le texte « à personne » propre à l'écran qui l'affiche (la fiche prépare un message, la publication dépose des photos et publie). */
  readonly texteLibre?: string;
  readonly onPrendre: () => void;
  readonly onRendre: () => void;
}

/**
 * TCK-2388 — qui tient l'annonceur, et jusqu'à quelle heure (`claim.until`, formaté — jamais une durée écrite
 * dans un dictionnaire : elle est celle de l'API). À personne : « Prendre en charge ». À moi : « Rendre ». À un
 * autre : le bandeau le dit et n'offre rien.
 *
 * Pas de région `role="status"` : la prise se renouvelle d'elle-même, et chaque renouvellement changerait
 * « jusqu'à HH:MM » — un lecteur d'écran l'annoncerait toutes les quelques minutes à qui écrit. Les refus
 * (prise perdue, prise d'un autre) s'annoncent par l'alerte de la fiche.
 */
export function BandeauPriseEnCharge({ claim, prendreFerme, rendreFerme, enPrise, enRestitution, texteLibre, onPrendre, onRendre }: BandeauPriseEnChargeProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.claim');
  const fmt = useFormatteurs();

  return (
    <section
      aria-label={t('heading')}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
      data-testid="radar-annonceur-prise"
      data-etat={claim === null ? 'libre' : claim.mine ? 'moi' : 'autre'}
    >
      <p className="min-w-0 text-foreground">
        {claim === null
          ? (texteLibre ?? t('none'))
          : claim.mine
            ? t('mine', { until: fmt.dateTime(claim.until) })
            : t('other', { name: claim.by.name, until: fmt.dateTime(claim.until) })}
      </p>
      {claim === null ? (
        <Button type="button" size="sm" disabled={prendreFerme || enPrise} onClick={onPrendre}>
          {enPrise ? t('taking') : t('take')}
        </Button>
      ) : claim.mine ? (
        <Button type="button" size="sm" variant="outline" disabled={rendreFerme || enRestitution} onClick={onRendre}>
          {enRestitution ? t('releasing') : t('release')}
        </Button>
      ) : null}
    </section>
  );
}
