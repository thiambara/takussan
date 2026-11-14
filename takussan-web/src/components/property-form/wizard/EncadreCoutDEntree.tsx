'use client';

import { useEffect, useId, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Minus, Plus } from 'lucide-react';

import { FormAmountInput } from '@/components/forms';
import { coutDEntreeTotal } from '@/lib/cout-d-entree';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PropertyFormValues } from '@/lib/schemas/property';

import { isFieldRelevant } from '../field-matrix';

/**
 * TCK-2819 (lot 2) — le coût d'entrée de l'assistant, d'après la maquette `app-entree-publier` (écran
 * a-3) : un encadré « Coût d’entrée », des compteurs − / + pour les mois, les charges en F CFA, et au
 * pied le « Total à l’entrée ».
 *
 * L'encadré PORTE désormais ce que la carte d'aperçu disait seule jusqu'ici (TCK-633) : les composantes,
 * le total indicatif et la note « l'annonce publiée fait foi ». La carte n'en garde que « À l’entrée : … »,
 * comme la maquette. Le total se calcule donc à DEUX endroits du parcours — l'aperçu et l'étape du prix —
 * mais par UN seul code (`useCoutDEntree`, ci-dessous), lui-même jumeau de `CoutDEntree` côté API
 * (`lib/cout-d-entree.ts`) : l'exception à TCK-598 (« aucun écran ne refait l'addition ») s'étend à
 * l'étape du prix, avant que le bien existe, et la note le dit toujours.
 *
 * ⚠ La maquette écrit « 2 mois d’avance + 2 mois de caution + les charges du premier mois » et un total
 * de 1 015 000 F. La règle de l'API compte les charges de CHAQUE mois d'avance (`(loyer + charges) ×
 * avance`) : 1 030 000 F. La note se compose donc des composantes réelles, jamais de la phrase dessinée.
 *
 * La page d'édition (`PropertyForm`) garde `EntryCostFields` : la maquette ne la couvre pas.
 */

/** `useWatch` rend ces champs en `unknown` (schéma à coercition) ; zéro et vide valent « absent ». */
function nombre(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface CoutDEntree {
  /** La matrice demande le coût d'entrée : une location au mois. */
  readonly pertinent: boolean;
  /** « 2 mois d’avance », « 1 mois de caution »… — ce qui est renseigné, dans l'ordre de la loi. */
  readonly composantes: readonly string[];
  /** Le total, mis en forme ; `null` sans composante ou à zéro. */
  readonly total: string | null;
  /** Le loyer en nombre, pour le montant de chaque compteur. */
  readonly loyer: number | undefined;
}

/** Le coût d'entrée tel que le formulaire le décrit — partagé par l'aperçu et l'étape du prix. */
export function useCoutDEntree(form: UseFormReturn<PropertyFormValues>): CoutDEntree {
  const t = useTranslations('property.wizard');
  const fmt = useFormatteurs();
  const [type, contrat, periode, prix, devise, avance, caution, frais, charges] = useWatch({
    control: form.control,
    name: [
      'type', 'contract_type', 'rent_period', 'price', 'currency', 'advance_months', 'deposit_months',
      'agency_fee_months', 'monthly_charges',
    ],
  });
  const pertinent = isFieldRelevant('deposit_months', { type, contract: contrat, rentPeriod: periode });
  const composantes: string[] = [];
  let total: string | null = null;
  if (pertinent) {
    if (nombre(avance)) composantes.push(t('preview.entryAdvance', { count: nombre(avance)! }));
    if (nombre(caution)) composantes.push(t('preview.entryDeposit', { count: nombre(caution)! }));
    if (nombre(frais)) composantes.push(t('preview.entryFee', { count: nombre(frais)! }));
    if (nombre(charges)) {
      composantes.push(t('preview.entryCharges', { amount: fmt.montant(nombre(charges)!, devise) }));
    }
    const brut = coutDEntreeTotal({
      price: nombre(prix), currency: devise, contract_type: contrat, rent_period: periode,
      advance_months: nombre(avance), deposit_months: nombre(caution),
      agency_fee_months: nombre(frais), monthly_charges: nombre(charges),
    });
    if (brut !== null && brut > 0) total = fmt.montant(brut, devise);
  }
  return { pertinent, composantes, total, loyer: nombre(prix) };
}

/**
 * TCK-633 — un indépendant (agence `individual`) ne facture pas de frais d'agence, et l'API les refuse
 * pour lui : une valeur déjà là (brouillon, bien existant) est RETIRÉE, marquée modifiée pour que
 * l'édition envoie `null` (`withClearedFields`). Un seul code pour l'encadré et `EntryCostFields`.
 */
export function useRetirerLesFraisDAgence(form: UseFormReturn<PropertyFormValues>, fraisDAgence: boolean) {
  const { control, setValue } = form;
  const frais = useWatch({ control, name: 'agency_fee_months' });
  useEffect(() => {
    if (fraisDAgence || frais === undefined || frais === null) return;
    setValue('agency_fee_months', undefined, { shouldDirty: true });
  }, [fraisDAgence, frais, setValue]);
}

type ChampDeMois = 'advance_months' | 'deposit_months' | 'agency_fee_months';

const MAX_MOIS = 24;

/**
 * Un compteur de mois (maquette `Compteur`) : le libellé, le montant que ces mois représentent, et
 * − / + de 44 px. La valeur est un `spinbutton` (flèches haut / bas au clavier) : c'est ce que les
 * lecteurs d'écran annoncent pour un nombre qu'on augmente ou diminue.
 */
function Compteur({
  form,
  name,
  libelle,
  pas,
  loyer,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly name: ChampDeMois;
  readonly libelle: string;
  readonly pas: 1 | 0.5;
  readonly loyer: number | undefined;
}) {
  const t = useTranslations('property.wizard.entryCost');
  const fmt = useFormatteurs();
  const idLibelle = useId();
  const [brut, devise] = useWatch({ control: form.control, name: [name, 'currency'] });
  const valeur = nombre(brut) ?? 0;
  const poser = (n: number) => {
    const borne = Math.min(MAX_MOIS, Math.max(0, Math.round(n / pas) * pas));
    // Zéro s'écrit comme l'absence (`undefined`), ce que lisaient les champs d'avant : le corps envoyé
    // et l'aperçu ne distinguent pas un mois d'avance « 0 » d'un champ laissé vide.
    form.setValue(name, borne === 0 ? undefined : borne, { shouldDirty: true });
  };
  const auClavier = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') poser(valeur + pas);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') poser(valeur - pas);
    else return;
    e.preventDefault();
  };
  const bouton =
    'inline-flex size-11 flex-none items-center justify-center rounded-full border border-input bg-card text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div data-compteur className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1 leading-tight">
        <p id={idLibelle} className="text-sm font-medium text-foreground">{libelle}</p>
        {loyer && valeur > 0 ? (
          <p className="mt-0.5 text-ui text-muted-foreground tabular-nums">{fmt.montant(loyer * valeur, devise)}</p>
        ) : null}
      </div>
      <button
        type="button"
        className={bouton}
        aria-label={pas === 1 ? t('decrease') : t('decreaseHalf')}
        aria-describedby={idLibelle}
        disabled={valeur <= 0}
        onClick={() => poser(valeur - pas)}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span
        id={`field-${name}`}
        role="spinbutton"
        tabIndex={0}
        aria-labelledby={idLibelle}
        aria-valuenow={valeur}
        aria-valuemin={0}
        aria-valuemax={MAX_MOIS}
        onKeyDown={auClavier}
        className="min-w-6 rounded-sm text-center font-display text-xl font-semibold tabular-nums focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        {fmt.nombre(valeur)}
      </span>
      <button
        type="button"
        className={bouton}
        aria-label={pas === 1 ? t('increase') : t('increaseHalf')}
        aria-describedby={idLibelle}
        disabled={valeur >= MAX_MOIS}
        onClick={() => poser(valeur + pas)}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function EncadreCoutDEntree({
  form,
  fraisDAgence = true,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /** TCK-633 — faux pour un indépendant : ni compteur, ni valeur gardée. */
  readonly fraisDAgence?: boolean;
}) {
  const t = useTranslations('property.wizard');
  const devise = useWatch({ control: form.control, name: 'currency' });
  const cout = useCoutDEntree(form);
  const idTitre = useId();
  useRetirerLesFraisDAgence(form, fraisDAgence);

  return (
    <section aria-labelledby={idTitre} data-testid="encadre-cout-d-entree" className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 leading-tight">
        <h2 id={idTitre} className="text-corps font-semibold text-foreground">{t('entryCost.legend')}</h2>
        <p className="mt-0.5 text-ui text-muted-foreground">{t('entryCost.boxHint')}</p>
      </div>
      <div className="divide-y divide-border border-t border-border px-4 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
        <Compteur form={form} name="advance_months" libelle={t('entryCost.advance')} pas={1} loyer={cout.loyer} />
        <Compteur form={form} name="deposit_months" libelle={t('entryCost.deposit')} pas={1} loyer={cout.loyer} />
        {fraisDAgence ? (
          <Compteur form={form} name="agency_fee_months" libelle={t('entryCost.agencyFee')} pas={0.5} loyer={cout.loyer} />
        ) : null}
        <div className="py-3 lg:col-span-2 lg:border-t lg:border-border">
          <FormAmountInput
            control={form.control}
            name="monthly_charges"
            label={t('entryCost.monthlyCharges')}
            currency={devise}
            unite={t('currencyUnit')}
            example={10_000}
          />
        </div>
      </div>
      <div className="rounded-b-xl border-t border-border bg-secondary px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{t('entryCost.total')}</p>
          <p className="font-display text-xl font-semibold text-foreground tabular-nums" data-testid="total-a-l-entree">
            {cout.total ?? '—'}
          </p>
        </div>
        {cout.composantes.length > 0 ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{cout.composantes.join(', ')}</p>
        ) : null}
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t('preview.entryNote')}</p>
      </div>
    </section>
  );
}
