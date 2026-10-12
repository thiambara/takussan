import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import { propertyFormSchema, type PropertyFormValues } from '@/lib/schemas/property';
import { isFieldRelevant } from '../field-matrix';
import { toCreatePayload, toUpdatePayload, withClearedFields } from '../payload';
import { StepPrix } from '../wizard/steps/StepPrix';

/**
 * TCK-598 (V9, V19) — la saisie du coût d'entrée et de la visite virtuelle.
 *
 * Le contrat de l'API : les quatre champs ne s'acceptent que sur une location MENSUELLE (sinon
 * 422). Le formulaire doit donc (1) ne les montrer que dans ce cas, (2) ne pas les envoyer à la
 * création hors de ce cas, (3) les effacer (`null`, qui passe le `prohibitedIf`) à l'édition quand
 * le bien quitte ce cas, et (4) effacer un champ qu'on VIDE — omis, l'API garderait l'ancienne valeur.
 */
const BASE = { title: 'Appartement à Mermoz', type: 'apartment', price: 300_000, city: 'Dakar' };
const COUT = { deposit_months: 2, advance_months: 2, agency_fee_months: 1, monthly_charges: 10_000 };

describe('matrice — le coût d’entrée ne concerne que la location mensuelle', () => {
  it.each([
    [{ contract: 'rent', rentPeriod: 'monthly' }, true],
    [{ contract: 'rent', rentPeriod: undefined }, true],
    [{ contract: 'rent', rentPeriod: null }, true],
    [{ contract: 'rent', rentPeriod: 'weekly' }, false],
    [{ contract: 'rent', rentPeriod: 'daily' }, false],
    [{ contract: 'rent', rentPeriod: 'yearly' }, false],
    [{ contract: 'sale', rentPeriod: undefined }, false],
  ] as const)('%o → %s', (ctx, attendu) => {
    for (const cle of ['deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges'] as const) {
      expect(isFieldRelevant(cle, { type: 'apartment', ...ctx })).toBe(attendu);
    }
  });
});

describe('schéma — bornes de l’API', () => {
  it('accepte un coût d’entrée courant, et un champ vide est ABSENT (pas 0)', () => {
    const v = propertyFormSchema.parse({ ...BASE, contract_type: 'rent', ...COUT, agency_fee_months: '0,5', advance_months: '' });
    expect(v.agency_fee_months).toBe(0.5);
    expect(v.advance_months).toBeUndefined();
  });

  it.each([
    ['deposit_months', 25],
    ['deposit_months', 1.5],
    ['advance_months', -1],
    ['agency_fee_months', 0.555],
    ['monthly_charges', -10],
  ])('refuse %s = %s', (cle, valeur) => {
    expect(propertyFormSchema.safeParse({ ...BASE, contract_type: 'rent', [cle]: valeur }).success).toBe(false);
  });

  it('la visite virtuelle : `https` seulement, vide accepté', () => {
    const ok = (url: string) => propertyFormSchema.safeParse({ ...BASE, contract_type: 'sale', virtual_tour_url: url }).success;
    expect(ok('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(ok('')).toBe(true);
    expect(ok('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(ok('javascript:alert(1)')).toBe(false);
  });
});

describe('corps de requête', () => {
  it('création, location mensuelle : les quatre champs partent', () => {
    const v = propertyFormSchema.parse({ ...BASE, contract_type: 'rent', rent_period: 'monthly', ...COUT });
    expect(toCreatePayload(v)).toMatchObject(COUT);
  });

  it.each([
    ['vente', { contract_type: 'sale' }],
    ['location à la semaine', { contract_type: 'rent', rent_period: 'weekly' }],
  ])('création, %s : aucun des quatre ne part (sinon 422)', (_cas, contrat) => {
    const v = propertyFormSchema.parse({ ...BASE, ...contrat, ...COUT });
    const corps = toCreatePayload(v);
    for (const cle of Object.keys(COUT)) expect(corps).not.toHaveProperty(cle);
  });

  it('édition, bien passé en vente : les quatre partent à `null` (effacés)', () => {
    const v = propertyFormSchema.parse({ ...BASE, contract_type: 'sale', ...COUT });
    const corps = toUpdatePayload(v);
    for (const cle of Object.keys(COUT)) expect(corps).toHaveProperty(cle, null);
  });

  it('édition : un champ VIDÉ part à `null`, un champ jamais touché reste omis', () => {
    const v = propertyFormSchema.parse({ ...BASE, contract_type: 'rent', deposit_months: '', virtual_tour_url: '' });
    const corps = withClearedFields(toUpdatePayload(v), v, { deposit_months: true, virtual_tour_url: true });
    expect(corps).toHaveProperty('deposit_months', null);
    expect(corps).toHaveProperty('virtual_tour_url', null);
    expect(corps).not.toHaveProperty('advance_months');
  });
});

function Harnais({ contrat, periode }: { contrat: 'rent' | 'sale'; periode?: 'monthly' | 'weekly' }) {
  const form = useForm<PropertyFormValues>({
    defaultValues: { ...BASE, contract_type: contrat, rent_period: periode, currency: 'XOF', furnished: false, tag_ids: [] } as PropertyFormValues,
  });
  return <StepPrix form={form} />;
}

describe('<StepPrix> — le bloc du coût d’entrée', () => {
  it.each([
    ['location mensuelle', 'rent', 'monthly', 'false'],
    ['location sans période (mensuelle)', 'rent', undefined, 'false'],
    ['location à la semaine', 'rent', 'weekly', 'true'],
    ['vente', 'sale', undefined, 'true'],
  ] as const)('%s → bloc replié = %s', (_cas, contrat, periode, replie) => {
    render(withIntl(<Harnais contrat={contrat} periode={periode} />));
    const bloc = screen.getByTestId('bloc-cout-d-entree');
    expect(bloc).toHaveAttribute('aria-hidden', replie);
    expect(bloc.querySelector('input[name="deposit_months"], #field-deposit_months')).not.toBeNull();
  });
});
