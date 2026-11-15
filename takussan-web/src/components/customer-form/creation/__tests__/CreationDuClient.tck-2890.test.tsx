/**
 * TCK-2890 — la création d'un client (maquette `app-clients` e3, e4) : le doublon dit l'étape ET le
 * référent de la fiche trouvée (AC4) ; choisir « Fann » propose les trois quartiers approuvés les plus
 * proches de Fann, et en toucher un l'ajoute (AC3).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/customers',
  useSearchParams: () => new URLSearchParams(),
}));
const api = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: api.lire,
}));
vi.mock('@/app/actions/dashboard-customers', () => ({ createCustomerAction: vi.fn(), updateCustomerAction: vi.fn() }));

import { CreationDuClient } from '../CreationDuClient';

/** Dakar (id 1) et ses quartiers : Fann et ses voisins, un lointain, une proposition non vérifiée, un sans coordonnées. */
const VILLES = [{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.69, longitude: -17.44 }];
const q = (id: number, name: string, latitude: number | null, longitude: number | null, status = 'approved') => ({ id, city_id: 1, name, slug: name, latitude, longitude, status });
const QUARTIERS = [
  q(1, 'Fann', 14.6905, -17.4655),
  q(2, 'Point E', 14.6960, -17.4600), // ~0,85 km
  q(3, 'Sacré-Cœur', 14.7120, -17.4600), // ~2,4 km
  q(4, 'Mermoz', 14.7050, -17.4750), // ~1,9 km
  q(5, 'Almadies', 14.7450, -17.5150), // ~8 km
  q(6, 'Amitié', 14.6920, -17.4620, 'pending'), // le plus proche, mais non vérifié
  q(7, 'Sans repère', null, null),
  q(8, 'Liberté 6', 14.7250, -17.4580), // ~3,8 km
];

function ouvrir() {
  return render(withIntl(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CreationDuClient open onClose={vi.fn()} />
  </QueryClientProvider>));
}

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((m: string) => ({
    matches: false, media: m, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as MediaQueryList);
  api.lire.mockReset().mockImplementation(async (chemin: string) => {
    const url = new URL(String(chemin), 'http://x');
    if (url.pathname === '/api/customers/duplicates') {
      return url.searchParams.get('phone') === '+221706482056'
        ? { data: [{ id: 41, name: 'Mariama Fall', stage: 'negotiating', referent: { id: 2, name: 'Khady Diallo' } }] }
        : { data: [] };
    }
    if (url.pathname === '/api/public/geo/cities') return { data: VILLES };
    if (url.pathname === '/api/public/geo/neighborhoods') return { data: url.searchParams.get('city') === '1' ? QUARTIERS : [] };
    return { data: [] };
  });
});
afterEach(() => vi.restoreAllMocks());

async function identite(user: ReturnType<typeof userEvent.setup>, telephone: string) {
  await user.type(screen.getByLabelText(/Prénom/), 'Astou');
  await user.type(screen.getByLabelText(/^Nom/), 'Mbengue');
  await user.type(screen.getByLabelText('Téléphone'), telephone);
}

describe('TCK-2890', () => {
  it('AC4 — le doublon dit « Négociation · … · suivi par Khady Diallo »', async () => {
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '70 648 20 56');
    const alerte = (await screen.findByText('Déjà dans vos clients')).closest('[role="status"]') as HTMLElement;
    expect(within(alerte).getByText(/^Négociation · .*suivi par Khady Diallo$/)).toBeInTheDocument();
  });

  it('AC3 — « Fann » propose Point E, Mermoz, Sacré-Cœur (approuvés, les plus proches) ; un toucher ajoute', async () => {
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '77 305 44 91');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.type(await screen.findByLabelText('Quartiers'), 'fann{Enter}');
    const proches = await screen.findByRole('list', { name: 'Quartiers proches' });
    expect(within(proches).getAllByRole('button').map((b) => b.textContent)).toEqual(['+ Point E', '+ Mermoz', '+ Sacré-Cœur']);

    await user.click(within(proches).getByRole('button', { name: 'Ajouter Point E' }));
    expect(screen.getByRole('button', { name: 'Retirer Point E' })).toBeInTheDocument();
    // Point E choisi : il quitte les suggestions, et la distance se prend au plus proche des DEUX
    // (Sacré-Cœur est voisin de Point E) ; Liberté 6 entre.
    const ensuite = screen.getByRole('list', { name: 'Quartiers proches' });
    expect(within(ensuite).getAllByRole('button').map((b) => b.textContent)).toEqual(['+ Sacré-Cœur', '+ Mermoz', '+ Liberté 6']);
  });

  it('un quartier inconnu du référentiel (sans repère) : aucune suggestion', async () => {
    const user = userEvent.setup();
    ouvrir();
    await identite(user, '77 305 44 91');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.type(await screen.findByLabelText('Quartiers'), 'Sans repère{Enter}');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('list', { name: 'Quartiers proches' })).toBeNull();
  });
});
