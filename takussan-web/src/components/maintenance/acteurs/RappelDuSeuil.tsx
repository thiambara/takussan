'use client';

import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { plafondARappeler, type FicheDuBailleur } from '@/lib/maintenance/devis-du-bailleur';
import { cn } from '@/lib/utils';

/**
 * TCK-2654 — « Au-dessus de {seuil}, votre mandat prévoit votre accord. » : le plafond de travaux que
 * le bailleur a fixé (ADR-0037), rappelé là où il décide d'un devis — la décision du devis
 * (`DecisionDuDevis`, liste du bailleur et accueil) et la fiche (`QuoteActions`).
 *
 * Rien ne se rend quand la fiche ne sert pas le plafond (il n'est servi qu'au détail, et au seul
 * donneur d'ordre) ou qu'il n'est pas fixé. Le dépassement n'est jamais recalculé ici : c'est l'API
 * qui met le devis en `awaiting_owner`.
 */
export function RappelDuSeuil({ fiche, className }: { readonly fiche: FicheDuBailleur | undefined; readonly className?: string }) {
  const t = useTranslations('maintenance.bailleur.devis');
  const f = useFormatteurs();
  const plafond = plafondARappeler(fiche);
  if (plafond === null) return null;
  return (
    <p className={cn('text-ui leading-snug text-encre-douce', className)} data-slot="rappel-du-plafond">
      {t('plafond', { seuil: f.montant(plafond, fiche?.quote_currency ?? undefined) })}
    </p>
  );
}
