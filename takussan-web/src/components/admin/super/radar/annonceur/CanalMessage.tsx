'use client';

import { useTranslations } from 'next-intl';

import type { RadarOutreach } from '@/types/radar';
import { canalDuMessage } from './reponses';

/**
 * TCK-2426 — par où un message envoyé est parti : à la main (lien `wa.me`), par l'API WhatsApp, ou par l'API sans que
 * Meta ait confirmé l'envoi (`provider_status = ambiguous` : il a pu partir, il compte comme envoyé). `avecExplication`
 * ajoute, pour ce dernier cas, la phrase qui le dit.
 */
export function CanalMessage({ message, avecExplication = false }: { readonly message: RadarOutreach; readonly avecExplication?: boolean }) {
  const t = useTranslations('superAdmin.pages.radar.advertiser.history');
  const canal = canalDuMessage(message);

  return (
    <>
      <span data-testid="radar-message-canal" data-canal={canal}>{t(`channels.${canal}`)}</span>
      {avecExplication && canal === 'ambiguous' ? (
        <span className="block text-xs text-muted-foreground">{t('ambiguousHint')}</span>
      ) : null}
    </>
  );
}
