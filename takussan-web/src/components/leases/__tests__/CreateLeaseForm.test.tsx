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
    expect(screen.getByLabelText(/Loyer mensuel/)).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /Type de contrat/ }));
    await user.click(await screen.findByRole('option', { name: 'Vente' }));

    expect(screen.getByLabelText(/Prix de vente/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Loyer mensuel/)).toBeNull();
  });

  it('le récapitulatif nomme le bien et le locataire choisis', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm />));
    expect(screen.getByText('Aucun bien sélectionné')).toBeInTheDocument();
    expect(screen.getByText('Aucun locataire sélectionné')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /^Bien/ }));
    await user.click(await screen.findByRole('option', { name: /Villa Almadies/ }));
    await user.click(document.getElementById('field-tenant_id')!);
    await user.click(await screen.findByRole('option', { name: /Awa Diop/ }));

    expect(screen.getByText('Villa Almadies · REF-011')).toBeInTheDocument();
    expect(screen.queryByText('Aucun bien sélectionné')).toBeNull();
    expect(screen.queryByText('Aucun locataire sélectionné')).toBeNull();
  });
});
