/**
 * TCK-2638 (P3 de l'audit, famille 4) — la feuille « Filtres et tri » du téléphone disait « Chaque
 * choix s'applique aussitôt à la liste » tout en portant « Voir les résultats » : l'un des deux était
 * faux. Les choix (listes, cases, dates) s'appliquent aussitôt ; la saisie libre (ville, prix)
 * attend le bouton collé du pied. La consigne dit les deux, et le bouton applique bien la saisie.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { withIntl } from '@/test/intl';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => nav.params,
}));

beforeEach(() => {
  nav.params = new URLSearchParams('mode=gestion');
  nav.replace.mockClear();
});

async function ouvrirFeuille() {
  render(withIntl(<PropertyListFilters currentUserId={1} agentOptions={[{ id: 1, name: 'Moi Même' }]} mode="gestion" />));
  await userEvent.click(screen.getByRole('button', { name: /^Filtres et tri/ }));
  return within(await screen.findByRole('dialog', { name: 'Filtres et tri' }));
}

describe('La feuille « Filtres et tri » ne contredit plus son bouton (P3)', () => {
  it('la consigne ne promet plus que TOUT s’applique aussitôt, et nomme le bouton de la saisie', async () => {
    const feuille = await ouvrirFeuille();
    expect(feuille.queryByText('Chaque choix s’applique aussitôt à la liste.')).toBeNull();
    expect(
      feuille.getByText('Chaque choix s’applique aussitôt ; la ville et les prix saisis, avec « Voir les résultats ».'),
    ).toBeInTheDocument();
    expect(feuille.getByRole('button', { name: 'Voir les résultats' })).toBeInTheDocument();
  });

  it('la ville saisie ne part qu’avec « Voir les résultats »', async () => {
    const feuille = await ouvrirFeuille();
    await userEvent.type(feuille.getByRole('textbox', { name: /Ville/ }), 'Mermoz');
    expect(nav.replace).not.toHaveBeenCalled();
    await userEvent.click(feuille.getByRole('button', { name: 'Voir les résultats' }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(String(nav.replace.mock.calls[0][0])).toContain('city=Mermoz');
  });
});
