import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { StepPrix } from '../wizard/steps/StepPrix';

/**
 * TCK-633 — le prix se publie en francs CFA (ADR-0061) : la devise ne se choisit plus. Et un
 * indépendant (agence `individual`) ne facture pas de frais d'agence : le champ n'est pas rendu, et
 * une valeur déjà là est retirée — l'API la refuse pour lui (tâche 8).
 */
function monter(defauts: Partial<PropertyFormValues>, fraisDAgence?: boolean) {
  const sortie: { form?: UseFormReturn<PropertyFormValues> } = {};
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'apartment', contract_type: 'rent', rent_period: 'monthly', currency: 'XOF',
        city: 'Dakar', furnished: false, tag_ids: [],
        ...defauts,
      } as PropertyFormValues,
    });
    sortie.form = form;
    return <StepPrix form={form} fraisDAgence={fraisDAgence} />;
  }
  render(withIntl(<Harnais />));
  return () => sortie.form!;
}

describe('StepPrix — TCK-633', () => {
  it('ne demande plus la devise : le prix seul, saisi en francs CFA (sans décimales)', () => {
    monter({ contract_type: 'sale', rent_period: undefined });

    expect(screen.queryByRole('combobox', { name: /devise/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/devise/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^prix/i)).toHaveAttribute('inputmode', 'numeric');
  });

  it('une agence standard garde ses frais d’agence', () => {
    monter({});

    expect(screen.getByLabelText(/frais d.agence/i)).toBeInTheDocument();
  });

  it('un indépendant ne voit pas les frais d’agence — avance et caution restent', () => {
    monter({}, false);

    expect(screen.queryByLabelText(/frais d.agence/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/avance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/caution/i)).toBeInTheDocument();
  });

  it('chez un indépendant, des frais déjà saisis sont RETIRÉS, et le retrait compte comme une modification', async () => {
    const form = monter({ agency_fee_months: 1 }, false);

    await waitFor(() => expect(form().getValues('agency_fee_months')).toBeUndefined());
    // `withClearedFields` (payload.ts) n'envoie `null` à l'édition que pour un champ MODIFIÉ :
    // sans `shouldDirty`, la valeur en base survivrait au retrait.
    expect(form().getFieldState('agency_fee_months').isDirty).toBe(true);
  });
});
