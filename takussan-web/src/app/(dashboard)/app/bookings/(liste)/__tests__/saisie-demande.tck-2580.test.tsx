/**
 * TCK-2580 (vérification adverse, M1) — la PAGE Réservations porte l'entrée « Saisir une demande »
 * pour le personnel de l'agence, et seulement pour lui. La page est rendue entière (composant serveur
 * attendu, puis monté) : le test du composant `EntreeSaisieDemande` seul restait vert quand on
 * retirait l'entrée de l'en-tête, et « le bailleur ne la voit pas » était alors coché par la
 * régression qui l'ôte à tout le monde. Seule la liste, qui a ses propres tests, est simulée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import profilsAgent from '@/components/visits/__tests__/fixtures/r2-profils-agent.json';
import profilsBailleur from '@/components/visits/__tests__/fixtures/r2-profils-bailleur.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/bookings',
  useSearchParams: () => new URLSearchParams(''),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
const moi = vi.hoisted(() => ({ courant: { id: 3, roles: ['agent'], agency_id: 1 } as Record<string, unknown> }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => moi.courant }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3 }, token: 'jeton', isLoading: false }) }));
const profils = vi.hoisted(() => ({ courant: null as unknown }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: profils.courant }) }));
vi.mock('@/components/bookings/BookingsList', () => ({ BookingsList: () => <p>liste des réservations</p> }));

const { default: Page } = await import('../page');

async function monterLaPage() {
  const arbre = await Page();
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{arbre}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  moi.courant = { id: 3, roles: ['agent'], agency_id: 1 };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [], meta: { total: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => vi.unstubAllGlobals());

describe('TCK-2580 — l’entrée « Saisir une demande » de la page Réservations', () => {
  it('sous un profil agent actif, l’en-tête de la page offre « Saisir une demande »', async () => {
    profils.courant = profilsAgent;
    await monterLaPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Réservations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saisir une demande' })).toBeInTheDocument();
    expect(screen.getByText('liste des réservations')).toBeInTheDocument();
  });

  it('sous un profil bailleur, la même page n’offre l’entrée sous aucune forme', async () => {
    profils.courant = profilsBailleur;
    await monterLaPage();

    // La page est bien rendue (témoin) : l'absence de l'entrée n'est pas celle de la page.
    expect(screen.getByText('liste des réservations')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saisir une demande' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saisir une candidature ou une offre' })).not.toBeInTheDocument();
  });
});
