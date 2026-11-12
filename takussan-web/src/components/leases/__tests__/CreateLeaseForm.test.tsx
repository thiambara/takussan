import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * Des références STABLES, comme les vrais hooks : un objet neuf à chaque appel casserait le cache
 * du React Compiler et rendrait un FAUX VERT sous compilation (mesuré, TCK-564 E-repair-1). Hissées
 * (`vi.hoisted`) parce que les fabriques de `vi.mock` s'exécutent avant le corps du module.
 */
const { BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION } = vi.hoisted(() => ({
  BIENS: {
    data: [
      { id: 11, title: 'Villa Almadies', reference_number: 'REF-011', price: 250_000, currency: 'XOF' },
    ],
  },
  CLIENTS: {
    data: [{ id: 21, full_name: 'Awa Diop', first_name: 'Awa', last_name: 'Diop', email: 'awa@exemple.sn', phone: null }],
  },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
  ROUTEUR: { push: () => {}, back: () => {} },
  MUTATION: { mutateAsync: async () => ({ data: { id: 1 } }) },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/leases', () => ({
  useCreateLease: () => MUTATION,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: CLIENTS, isLoading: false }),
  // TCK-2643 — les défauts du bien, le locataire lu par son id, et l'envoi à la signature.
  useLeaseDefaults: () => ({ data: undefined }),
  useLeaseCustomer: () => ({ data: undefined }),
  useDemanderLaSignature: () => ({ mutateAsync: async () => ({ data: {} }) }),
}));

import { CreateLeaseForm } from '../CreateLeaseForm';

/**
 * TCK-571 — les champs du bail SUIVENT le type et les parties choisis.
 *
 * Le formulaire lisait `form.watch('type')`, `watch('property_id')` et `watch('tenant_id')` PENDANT
 * LE RENDU : compilé par le React Compiler (`reactCompiler: true`), un bail passé en « Vente »
 * gardait le champ « Loyer mensuel » au lieu du « Prix de vente », et le récapitulatif restait sur
 * « Aucun bien sélectionné » après le choix du bien. Mesuré en rejouant ce fichier sous le
 * compilateur (configuration de mesure hors dépôt, cf. le ticket) : rouge avec `watch()`, vert avec
 * `useWatch`.
 *
 * ⚠ Sans le compilateur, ce fichier est vert AVEC OU SANS le correctif : il décrit le comportement,
 * la garde du motif est `src/test/__tests__/watch-pendant-le-rendu.test.ts`.
 */
describe('CreateLeaseForm — les champs suivent le type et les parties (TCK-571)', () => {
  it('« Vente » remplace le loyer mensuel par le prix de vente', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm />));
    expect(screen.getByLabelText(/^Loyer/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /Type de bail/ }));
    await user.click(await screen.findByRole('option', { name: 'Vente' }));

    expect(screen.getByLabelText(/Prix de vente/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Loyer/)).toBeNull();
  });

  // TCK-2643 — un choix fait se montre en une ligne (« Changer » le défait), la liste se referme.
  it('le bien et le locataire choisis se montrent chacun en une ligne', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm />));
    expect(screen.queryByRole('button', { name: 'Changer le bien' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Changer le locataire' })).toBeNull();

    await user.click(screen.getByRole('combobox', { name: /^Bien/ }));
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));
    await user.click(document.getElementById('field-tenant_id')!);
    await user.click(await screen.findByRole('option', { name: /Awa Diop/ }));

    expect(screen.getByText('Villa Almadies')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changer le bien' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changer le locataire' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Bien/ })).toBeNull();
    expect(document.getElementById('field-tenant_id')).toBeNull();
  });
});

/** P08.06 (TCK-755) — quitter la page avertit seulement quand le formulaire est modifié. */
describe('CreateLeaseForm — avertissement de départ (TCK-755)', () => {
  const quitterLaPage = () => {
    const evenement = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evenement);
    return evenement.defaultPrevented;
  };

  it("n'avertit pas sur un formulaire intact, avertit dès qu'un champ est saisi", async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm />));
    expect(quitterLaPage()).toBe(false);

    await user.type(screen.getByLabelText(/^Loyer/), '5');

    expect(quitterLaPage()).toBe(true);
  });
});
