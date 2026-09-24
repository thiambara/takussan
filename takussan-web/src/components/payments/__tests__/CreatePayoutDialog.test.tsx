import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * Des mocks à IDENTITÉ STABLE, comme les vrais hooks : un objet neuf à chaque appel casserait le
 * cache du React Compiler et rendrait un FAUX VERT sous compilation (mesuré, TCK-564 E-repair-1).
 */
const MUTATION = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => ({ data: { id: 1 } })) }));
vi.mock('@/lib/queries/payments', () => ({
  useCreatePayout: () => MUTATION,
}));

import { CreatePayoutDialog } from '../CreatePayoutDialog';

/**
 * TCK-571 — le récapitulatif du reversement SUIT la saisie.
 *
 * Le dialogue lisait `form.watch('gross_amount')` (et quatre autres) PENDANT LE RENDU — le motif
 * que le React Compiler (`next.config.ts`, `reactCompiler: true`) fige ailleurs. Ici, le défaut
 * N'A PAS ÉTÉ REPRODUIT : le compilateur REFUSE de compiler ce composant (« React Compiler has
 * skipped optimizing this component because one or more React ESLint rules were disabled » — le
 * `eslint-disable react-hooks/exhaustive-deps` de son effet de commission), et le récapitulatif
 * suivait la saisie avant comme après le passage à `useWatch` (sur la pile de dev comme sous
 * vitest). Et la suppression n'était pas le seul rempart — mesuré sous vitest compilé le
 * 2026-09-24, avec `watch()` remis en place : sans l'`eslint-disable`, le composant COMPILE et les
 * 4 tests restent verts, parce que le `form.reset` d'`onSuccess` capture `form` et que le
 * compilateur ne met plus en cache ce qui en dépend ; c'est seulement sans l'`eslint-disable` ET
 * sans ce `form.reset` que `form.watch("gross_amount")` sort gardé par `$[…] !== form` et que les
 * 4 tests rougissent. `useWatch` est une précaution contre ce double hasard.
 *
 * ⚠ Ce fichier est donc vert AVEC OU SANS le correctif, tant que l'un des deux tient : il décrit le
 * comportement attendu, il ne garde pas le motif. La garde du motif est
 * `src/test/__tests__/watch-pendant-le-rendu.test.ts`.
 */

/** La valeur affichée sous un intitulé du récapitulatif (`<dt>` → `<dd>`). */
function recap(intitule: string): string {
  const dt = screen.getAllByText(intitule).find((el) => el.tagName === 'DT');
  if (!dt) throw new Error(`intitulé de récapitulatif introuvable : ${intitule}`);
  return dt.nextElementSibling?.textContent ?? '';
}

const sansEspaces = (s: string) => s.replace(/[\s  ]/g, '');

function monter(defaultCommissionRate?: number) {
  render(
    withIntl(
      <CreatePayoutDialog open onOpenChange={() => {}} defaultCommissionRate={defaultCommissionRate} />,
    ),
  );
}

describe('CreatePayoutDialog — le récapitulatif suit la saisie (TCK-571)', () => {
  it('le brut et le net suivent le montant brut, et le bouton s’active', async () => {
    const user = userEvent.setup();
    monter();

    expect(screen.getByRole('button', { name: 'Créer le reversement' })).toBeDisabled();

    await user.type(screen.getByLabelText(/Montant brut/), '50000');

    expect(sansEspaces(recap('Brut'))).toBe('50000FCFA');
    expect(sansEspaces(recap('Net'))).toBe('50000FCFA');
    expect(screen.getByRole('button', { name: 'Créer le reversement' })).toBeEnabled();
  });

  it('la commission et les frais saisis se retranchent du net', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText(/Montant brut/), '50000');
    const commission = screen.getByLabelText('Commission');
    await user.clear(commission);
    await user.type(commission, '5000');
    const frais = screen.getByLabelText('Frais');
    await user.clear(frais);
    await user.type(frais, '1000');

    expect(sansEspaces(recap('Commission'))).toBe('5000FCFA');
    expect(sansEspaces(recap('Frais'))).toBe('1000FCFA');
    expect(sansEspaces(recap('Net'))).toBe('44000FCFA');
  });

  it('la devise choisie s’applique au récapitulatif', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByLabelText(/Montant brut/), '1500');
    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'EUR (€)' }));

    expect(sansEspaces(recap('Brut'))).toBe('1500,00€');
    expect(sansEspaces(recap('Net'))).toBe('1500,00€');
  });

  // Vérification adverse de TCK-571 : `FormInput type="number"` remettait une CHAÎNE au formulaire.
  // La commission automatique ne se calculait jamais (`Number.isFinite("50000")` est faux), et
  // l'envoi échouait sur « Montant brut requis. », montant pourtant saisi.
  it('le taux de l’agence calcule la commission, et le reversement part avec des nombres', async () => {
    MUTATION.mutateAsync.mockClear();
    const user = userEvent.setup();
    monter(10);

    await user.type(screen.getByLabelText(/ID bailleur/), '7');
    await user.type(screen.getByLabelText(/Montant brut/), '50000');

    expect(sansEspaces(recap('Commission'))).toBe('5000FCFA');
    expect(sansEspaces(recap('Net'))).toBe('45000FCFA');

    await user.click(screen.getByRole('button', { name: 'Créer le reversement' }));
    await waitFor(() => expect(MUTATION.mutateAsync).toHaveBeenCalledTimes(1));
    expect(MUTATION.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ landlord_id: 7, gross_amount: 50000, commission_amount: 5000 }),
    );
    expect(screen.queryByText('Montant brut requis.')).toBeNull();
  });
});
