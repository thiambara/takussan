import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { VisitsList } from '../VisitsList';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

const role = vi.hoisted(() => ({ roles: ['tenant'] as string[] }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 1, roles: role.roles } }),
}));
vi.mock('@/lib/queries/visits', () => ({
  useVisits: () => ({ data: { data: [], meta: { total: 0 } }, isLoading: false, isError: false }),
}));

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><VisitsList /></QueryClientProvider>));
}

function ongletActif() {
  return screen.getAllByRole('tab').find((o) => o.getAttribute('aria-selected') === 'true');
}

/**
 * TCK-1736 (P168.03) — l'onglet des visites vit dans `?tab=`. Tenu en `useState`, il revenait à
 * « Demandées » au retour de la fiche ouverte d'un clic, au rechargement et au lien copié.
 */
describe('VisitsList — l’onglet dans l’URL (TCK-1736)', () => {
  beforeEach(() => {
    role.roles = ['tenant'];
    navigationDeTest.reinitialiser();
  });

  it('ouvre l’onglet que porte l’URL', () => {
    navigationDeTest.reinitialiser('tab=past');
    monte();

    expect(ongletActif()).toHaveTextContent('Passées');
  });

  it('rend « Demandées » pour un onglet inconnu, ou « Non attribuées » hors du personnel', () => {
    navigationDeTest.reinitialiser('tab=unassigned');
    monte();

    expect(ongletActif()).toHaveTextContent('Demandées');
  });

  it('écrit l’onglet choisi dans l’URL, et retire le défaut', async () => {
    const user = userEvent.setup();
    monte();

    await user.click(screen.getByRole('tab', { name: /Annulées/ }));
    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?tab=cancelled', { scroll: false });

    await user.click(screen.getByRole('tab', { name: /Demandées/ }));
    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?', { scroll: false });
  });
});
