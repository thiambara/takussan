'use client';
import { useTranslations } from 'next-intl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PropertyEntryCost as CoutDEntree } from '@/types/property';

interface PropertyEntryCostProps {
  readonly entryCost: CoutDEntree | null | undefined;
  readonly currency: string | null;
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
export function PropertyEntryCost({ entryCost, currency }: PropertyEntryCostProps) {
  const t = useTranslations('property.detail.entryCost');
  const fmt = useFormatteurs();
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

  return (
    <section aria-labelledby="cout-d-entree" className="rounded-lg bg-muted p-3 text-sm">
      <h2 id="cout-d-entree" className="font-medium text-foreground">{t('title')}</h2>
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
