'use client';

import { useTranslations } from 'next-intl';

import type { RadarPublishedProperty } from '@/types/radar';
import { LiensPublics, SecondMessage } from './RecapitulatifPublication';

interface DejapublieesProps {
  readonly advertiserId: number;
  readonly biens: readonly RadarPublishedProperty[];
  /** L'annonceur a dit STOP : l'API refuse de composer le message (422 `do_not_contact`), on ne le demande pas. */
  readonly stoppe: boolean;
  /** L'environnement refuse le second message (connexion par téléphone éteinte, aperçu des codes actif : 422 de l'API) : idem. */
  readonly messageRefuse: boolean;
  /** TCK-2394 — publié sous mandat, sans compte : le message ne porte aucun lien d'activation. */
  readonly sousMandat?: boolean;
}

/**
 * TCK-2389 — ce que le Radar a DÉJÀ publié pour cet annonceur, et le second message qui s'en compose. Il vit ici, hors de
 * la réponse d'un `publish`, parce qu'une réponse se perd (délai du relais, onglet fermé ou rechargé) alors que les biens,
 * eux, sont en ligne : sans cette section, plus aucun écran ne dirait à l'annonceur où sont ses annonces ni comment ouvrir
 * son compte. Sous STOP (ADR-0077 §8), ou quand l'environnement refuse le message, la liste des liens reste, le message ne se
 * compose plus : une phrase fixe le dit, au lieu d'une erreur à réessayer.
 */
export function DejaPubliees({ advertiserId, biens, stoppe, messageRefuse, sousMandat = false }: DejapublieesProps) {
  const t = useTranslations('superAdmin.pages.radar.publication.alreadyPublished');

  return (
    <div className="space-y-4" data-testid="radar-publication-deja">
      <section aria-label={t('heading')} className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-display text-base font-semibold text-foreground">{t('heading')}</h2>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
        <LiensPublics biens={biens} />
      </section>
      {stoppe ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="radar-publication-deja-stop">{t('stopped')}</p>
      ) : messageRefuse ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid="radar-publication-deja-indisponible">{t('unavailable')}</p>
      ) : (
        <SecondMessage advertiserId={advertiserId} sousMandat={sousMandat} />
      )}
    </div>
  );
}
