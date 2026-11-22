/**
 * TCK-2580 (vérification adverse, M1) — la PAGE Réservations porte l'entrée « Saisir une demande »
 * pour le personnel de l'agence, et seulement pour lui. La page est rendue entière (composant serveur
 * attendu, puis monté) : le test du composant `EntreeSaisieDemande` seul restait vert quand on
 * retirait l'entrée de l'en-tête, et « le bailleur ne la voit pas » était alors coché par la
 * régression qui l'ôte à tout le monde. Seules les lectures de la liste sont simulées : depuis
 * TCK-2594, l'en-tête (et l'entrée) est celui de `BookingsList`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
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
// TCK-2594 : l'en-tête vit dans la liste (`BookingsList`), rendue pour de vrai ; seules ses lectures
// sont simulées — aucune réservation, des compteurs à zéro.
vi.mock('@/lib/queries/bookings', async (original) => {
  const zero = { pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 };
  return {
    ...(await original<typeof import('@/lib/queries/bookings')>()),
    useBookings: () => ({ data: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }, isPending: false, isError: false, refetch: vi.fn() }),
    useBookingCounts: () => ({ data: { data: { stay: zero, application: zero, offer: zero } }, isError: false }),
  };
});

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
    expect(screen.getAllByRole('radiogroup', { name: fr.bookings.liste.natures.label }).length).toBeGreaterThan(0);
  });

  it('sous un profil bailleur, la même page n’offre l’entrée sous aucune forme', async () => {
    profils.courant = profilsBailleur;
    await monterLaPage();

    // La page est bien rendue (témoin) : l'absence de l'entrée n'est pas celle de la page.
    expect(screen.getAllByRole('radiogroup', { name: fr.bookings.liste.natures.label }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Saisir une demande' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saisir une candidature ou une offre' })).not.toBeInTheDocument();
  });
});
