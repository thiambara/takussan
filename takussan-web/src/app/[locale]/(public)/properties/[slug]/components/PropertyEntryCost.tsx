'use client';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PropertyEntryCost as CoutDEntree } from '@/types/property';

interface PropertyEntryCostProps {
  readonly entryCost: CoutDEntree | null | undefined;
  readonly currency: string | null;
  /**
   * TCK-2501 — le premier écran mobile : le TOTAL d'abord, sous le titre, et le détail replié
   * derrière un bouton (`aria-expanded`). Sans lui, le bloc déplié de la carte de réservation.
   */
  readonly repliable?: boolean;
}

/**
 * TCK-598 (V9) — ce qu'il faut verser pour emménager, sous le prix.
 *
 * ⚠ **Le front n'additionne rien.** Le total vient de l'API (`CoutDEntree`), qui seule connaît la
 * formule et l'arrondi de la devise ; une ligne ne montre que sa durée (ou le montant des charges),
 * jamais un produit recalculé ici qui pourrait diverger du total affiché sous elle.
 *
 * Absent — pas « 0 F » — quand l'API rend `null` : hors location mensuelle, ou rien de renseigné.
 */
export function PropertyEntryCost({ entryCost, currency, repliable = false }: PropertyEntryCostProps) {
  const t = useTranslations('propertyDetail.entryCost');
  const fmt = useFormatteurs();
  // TCK-2501 — rendu deux fois (bloc mobile, carte de bureau) : un identifiant par instance.
  const id = useId();
  const [deplie, setDeplie] = useState(false);
  if (!entryCost) return null;

  const lignes: { cle: string; libelle: string; valeur: string }[] = [];
  if (entryCost.advance_months !== null) {
    lignes.push({ cle: 'advance', libelle: t('advance'), valeur: t('months', { count: entryCost.advance_months }) });
  }
  if (entryCost.deposit_months !== null) {
    lignes.push({ cle: 'deposit', libelle: t('deposit'), valeur: t('months', { count: entryCost.deposit_months }) });
  }
  if (entryCost.agency_fee_months !== null) {
    lignes.push({ cle: 'fee', libelle: t('agencyFee'), valeur: t('months', { count: entryCost.agency_fee_months }) });
  }
  if (entryCost.monthly_charges !== null) {
    lignes.push({ cle: 'charges', libelle: t('monthlyCharges'), valeur: fmt.montant(entryCost.monthly_charges, currency) });
  }

  const titreId = `${id}-titre`;

  if (repliable) {
    const detailId = `${id}-detail`;
    return (
      <section aria-labelledby={titreId} className="rounded-xl border border-border bg-card p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titreId} className="bg-card text-muted-foreground">{t('title')}</h2>
            <p
              className="font-display text-xl font-semibold text-foreground tabular-nums"
              data-testid="cout-d-entree-total"
            >
              {fmt.montant(entryCost.total, currency)}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={deplie}
            aria-controls={detailId}
            onClick={() => setDeplie((v) => !v)}
            className="-mr-1 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground underline underline-offset-4"
          >
            {deplie ? t('hideDetails') : t('showDetails')}
            <ChevronDown className={`size-4 transition-transform ${deplie ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        </div>
        {deplie ? (
          <dl id={detailId} className="mt-2 space-y-1 border-t border-border pt-2 tabular-nums">
            {lignes.map((ligne) => (
              <div key={ligne.cle} className="flex items-baseline justify-between gap-3">
                <dt className="bg-card text-muted-foreground">{ligne.libelle}</dt>
                <dd className="text-foreground">{ligne.valeur}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p id={detailId} className="mt-0.5 text-pretty bg-card text-muted-foreground">
            {lignes.map((ligne) => `${ligne.libelle} ${ligne.valeur}`).join(' · ')}
          </p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby={titreId} className="rounded-lg bg-muted p-3 text-sm">
      <h2 id={titreId} className="font-medium text-foreground">{t('title')}</h2>
      <dl className="mt-2 space-y-1 tabular-nums">
        {lignes.map((ligne) => (
          <div key={ligne.cle} className="flex items-baseline justify-between gap-3">
            <dt className="bg-muted text-muted-foreground">{ligne.libelle}</dt>
            <dd className="text-foreground">{ligne.valeur}</dd>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <dt className="font-semibold text-foreground">{t('total')}</dt>
          <dd className="font-semibold text-foreground" data-testid="cout-d-entree-total">
            {fmt.montant(entryCost.total, currency)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
