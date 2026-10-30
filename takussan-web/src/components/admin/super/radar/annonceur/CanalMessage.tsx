'use client';

import { useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console';
import type { RadarOutreach } from '@/types/radar';
import { canalDuMessage, motifDeLEchec, remiseDuMessage, type RemiseDuMessage } from './reponses';

/** TCK-2437 — un simple « envoyé » n'alarme pas ; seul l'échec prend le ton destructif. */
const TON_DE_LA_REMISE: Record<RemiseDuMessage, StatusTone> = {
  sent: 'neutral',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
};

/**
 * TCK-2426 — par où un message envoyé est parti : à la main (lien `wa.me`), par l'API WhatsApp, ou par l'API sans que
 * Meta ait confirmé l'envoi (`provider_status = ambiguous` : il a pu partir, il compte comme envoyé). `avecExplication`
 * ajoute, pour ce dernier cas, la phrase qui le dit.
 *
 * TCK-2437 — un message envoyé par l'API porte à côté son état de remise (envoyé, remis, lu, non remis). Un message non
 * remis reste envoyé : `avecExplication` le dit, sans aucun geste — l'opérateur juge de la suite.
 *
 * TCK-2444 — un message non remis dont Meta a rendu un code connu en porte le motif juste après « Non remis » ; un code
 * inconnu, ou absent, n'en affiche aucun.
 */
export function CanalMessage({ message, avecExplication = false }: { readonly message: RadarOutreach; readonly avecExplication?: boolean }) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.history');
  const canal = canalDuMessage(message);
  const remise = remiseDuMessage(message);
  const motif = motifDeLEchec(message);

  return (
    <>
      <span data-testid="radar-message-canal" data-canal={canal}>{t(`channels.${canal}`)}</span>
      {remise !== null ? (
        <StatusBadge
          data-testid="radar-message-remise"
          tone={TON_DE_LA_REMISE[remise]}
          label={t(`delivery.${remise}`)}
          className="ms-2 align-middle"
        />
      ) : null}
      {motif !== null ? (
        <span data-testid="radar-message-motif-echec" className="ms-2 align-middle text-xs text-muted-foreground">
          {t(`deliveryFailure.${motif}`)}
        </span>
      ) : null}
      {avecExplication && canal === 'ambiguous' ? (
        <span className="block text-xs text-muted-foreground">{t('ambiguousHint')}</span>
      ) : null}
      {avecExplication && remise === 'failed' ? (
        <span className="block text-xs text-muted-foreground">{t('deliveryFailedHint')}</span>
      ) : null}
    </>
  );
}
