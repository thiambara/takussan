'use client';

import { useTranslations } from 'next-intl';

import type { RadarPublishedProperty } from '@/types/radar';
import { LiensPublics, SecondMessage } from './RecapitulatifPublication';

interface DejapublieesProps {
  readonly advertiserId: number;
  readonly biens: readonly RadarPublishedProperty[];
}

/**
 * TCK-2389 — ce que le Radar a DÉJÀ publié pour cet annonceur, et le second message qui s'en compose. Il vit ici, hors de
 * la réponse d'un `publish`, parce qu'une réponse se perd (délai du relais, onglet fermé ou rechargé) alors que les biens,
 * eux, sont en ligne : sans cette section, plus aucun écran ne dirait à l'annonceur où sont ses annonces ni comment ouvrir
 * son compte.
 */
export function DejaPubliees({ advertiserId, biens }: DejapublieesProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.alreadyPublished');

  return (
    <div className="space-y-4" data-testid="radar-publication-deja">
      <section aria-label={t('heading')} className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
        <LiensPublics biens={biens} />
      </section>
      <SecondMessage advertiserId={advertiserId} />
    </div>
  );
}
