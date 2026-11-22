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
 * TCK-2919 (ADR-0120 § 3) — suivi, quand l'agence a consulté d'autres artisans, de « {agence} a
 * consulté deux autres artisans (520 000 F et 610 000 F) et recommande ce devis. » : les montants
 * servis (`quote_alternatives`, au détail, aux seuls donneurs d'ordre), jamais recalculés. La
 * « recommandation » est le devis en place : aucune autre donnée. Sans devis concurrent, la phrase
 * s'arrête au seuil du mandat.
 *
 * Rien ne se rend quand la fiche ne sert ni le plafond (il n'est servi qu'au détail, et au seul
 * donneur d'ordre, et peut ne pas être fixé) ni devis concurrent. Le dépassement n'est jamais
 * recalculé ici : c'est l'API qui met le devis en `awaiting_owner`.
 */
export function RappelDuSeuil({ fiche, className }: { readonly fiche: FicheDuBailleur | undefined; readonly className?: string }) {
  const t = useTranslations('maintenance.bailleur.devis');
  const f = useFormatteurs();
  const plafond = plafondARappeler(fiche);
  const concurrents = fiche?.quote_alternatives ?? [];
  if (plafond === null && concurrents.length === 0) return null;

  const agence = fiche?.property?.agency?.name ?? null;
  const montants = new Intl.ListFormat(f.locale, { type: 'conjunction' }).format(
    concurrents.map((c) => f.montant(c.amount, c.currency)),
  );
  const phrases = [
    plafond !== null ? t('plafond', { seuil: f.montant(plafond, fiche?.quote_currency ?? undefined) }) : null,
    concurrents.length > 0
      ? agence
        ? t('concurrents', { agence, n: concurrents.length, montants })
        : t('concurrentsSansAgence', { n: concurrents.length, montants })
      : null,
  ].filter((p): p is string => p !== null);

  return (
    <p className={cn('text-ui leading-snug text-encre-douce', className)} data-slot="rappel-du-plafond">
      {phrases.join(' ')}
    </p>
  );
}
