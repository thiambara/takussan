'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { equivalentXofIa, formaterMontantIa } from '@/lib/format/montant-ia';

/** TCK-2448 (ADR-0086) — un montant du socle IA : le dollar d'abord, l'équivalent XOF à côté, marqué « ≈ ». */
export function useMontantIa(): (usd: string | null | undefined, taux: string | null | undefined) => string {
  const t = useTranslations('superAdmin.pages.ai');
  return useCallback((usd, taux) => {
    const xof = equivalentXofIa(usd, taux);
    return xof === null ? formaterMontantIa(usd) : t('amount', { usd: formaterMontantIa(usd), xof });
  }, [t]);
}
