import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * Des mocks à IDENTITÉ STABLE, comme les vrais hooks : un objet neuf à chaque appel casserait le
 * cache du React Compiler et rendrait un FAUX VERT sous compilation (mesuré, TCK-564 E-repair-1).
 */
const MUTATION = vi.hoisted(() => ({ mutateAsync: async () => ({ data: { id: 1 } }) }));
vi.mock('@/lib/queries/payments', () => ({
  useCreateInvoice: () => MUTATION,
}));

import { CreateInvoiceDialog } from '../CreateInvoiceDialog';

/**
 * TCK-571 — les totaux de la facture SUIVENT les lignes, la TVA et la devise.
 *
 * Le dialogue lisait `form.watch('items')`, `watch('tax_rate')` et `watch('currency')` PENDANT LE
 * RENDU — le motif que le React Compiler (`reactCompiler: true`) fige ailleurs. Ici, le défaut
 * N'A PAS ÉTÉ REPRODUIT : le composant est bien compilé, mais la sortie laisse ces trois lectures
 * HORS de tout bloc mis en cache (`const items = form.watch("items")` sans `$[n]`), parce que le
 * `onSuccess` de la mutation capture `form` (`form.reset`). Ce fichier, rejoué sous le compilateur
 * sur la version `watch()`, était vert 3 sur 3. Le risque est latent, et mesuré : sans
 * `form.reset` dans `onSuccess`, le test de la ligne ajoutée rougit sous compilation. `useWatch`
 * retire cette dépendance à un accident de la sortie du compilateur.
 *
 * ⚠ Ce fichier est donc vert AVEC OU SANS le correctif tel que le code est écrit : il décrit le
 * comportement, la garde du motif est `src/test/__tests__/watch-pendant-le-rendu.test.ts`.
 */

function recap(intitule: string): string {
  const dt = screen.getAllByText(intitule).find((el) => el.tagName === 'DT');
  if (!dt) throw new Error(`intitulé de récapitulatif introuvable : ${intitule}`);
  return dt.nextElementSibling?.textContent ?? '';
}

const sansEspaces = (s: string) => s.replace(/[\s  ]/g, '');

async function saisir(champ: HTMLElement, valeur: string) {
  const user = userEvent.setup();
  await user.clear(champ);
  await user.type(champ, valeur);
}

describe('CreateInvoiceDialog — les totaux suivent la saisie (TCK-571)', () => {
  it('le sous-total et le total suivent la quantité et le prix unitaire, et le bouton s’active', async () => {
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));
    expect(screen.getByRole('button', { name: 'Créer la facture' })).toBeDisabled();

    await saisir(screen.getByPlaceholderText('Qté'), '3');
    await saisir(screen.getByPlaceholderText('Prix unitaire'), '10000');

    expect(sansEspaces(recap('Sous-total'))).toBe('30000FCFA');
    expect(sansEspaces(recap('Total'))).toBe('30000FCFA');
    expect(screen.getByRole('button', { name: 'Créer la facture' })).toBeEnabled();
  });

  it('une ligne ajoutée entre dans le total, et la TVA s’y ajoute', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await saisir(screen.getByPlaceholderText('Prix unitaire'), '10000');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await saisir(screen.getAllByPlaceholderText('Prix unitaire')[1]!, '5000');
    await saisir(screen.getByLabelText('TVA (%)'), '18');

    expect(sansEspaces(recap('Sous-total'))).toBe('15000FCFA');
    expect(sansEspaces(recap('TVA'))).toBe('2700FCFA');
    expect(sansEspaces(recap('Total'))).toBe('17700FCFA');
  });

  it('la devise choisie s’applique aux totaux', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateInvoiceDialog open onOpenChange={() => {}} />));

    await saisir(screen.getByPlaceholderText('Prix unitaire'), '1500');
    await user.click(screen.getByRole('combobox', { name: 'Devise' }));
    await user.click(await screen.findByRole('option', { name: 'EUR (€)' }));

    expect(sansEspaces(recap('Total'))).toBe('1500,00€');
  });
});
