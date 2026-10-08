'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * TCK-600 (ADR-0048 §3) — l'agence du profil actif est suspendue : son équipe lit et exporte, et
 * n'écrit plus (l'API répond 423 `agency_suspended`). Le bandeau le dit AVANT le clic, sur toutes
 * les pages de l'espace, et ne se masque pas : la suspension dure jusqu'à sa levée.
 */
export function AgencySuspendedBanner() {
  const t = useTranslations('agencySuspension.banner');

  return (
    <div
      role="status"
      data-testid="agency-suspended-banner"
      className="flex items-start gap-2 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="text-pretty">
        <span className="font-semibold">{t('title')}</span> {t('body')}
      </p>
    </div>
  );
}
