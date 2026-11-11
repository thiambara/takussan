/**
 * P152.04 — confirmer, clore, déclarer manquée, replanifier et annuler se montrent sous
 * `abilities.manage` (`PropertyVisitPolicy::update` et `agitPourLeBien`), plus sous le rôle : le
 * bailleur d'un bien d'agence les voyait, et l'API rendait 403 `visit.staff_only`.
 *
 * TCK-2587 (lot B) — la fiche nomme ses gestes autrement (« Absent », « Terminer la visite ») et range
 * les moins fréquents sous « ⋯ » au bureau ; la règle épinglée ne change pas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const etat = vi.hoisted(() => ({ visit: null as PropertyVisit | null }));
const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['owner', 'customer'] } }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/visits/1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({
    data: etat.visit ? { data: etat.visit } : undefined,
    isLoading: false,
    isError: !etat.visit,
    error: null,
    refetch: vi.fn(),
  }),
  useCancelVisit: () => mutation,
  useCompleteVisit: () => mutation,
  useConfirmVisit: () => mutation,
  useUpdateVisit: () => mutation,
  useClaimVisit: () => mutation,
  useProposeVisitSlot: () => mutation,
  useMarkVisitNoShow: () => mutation,
  useCreneauxDeVisite: () => ({ data: undefined, isError: false, dataUpdatedAt: 0 }),
  useAttribuerEnLot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function rendre(visit: PropertyVisit) {
  etat.visit = visit;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><VisitDetail id={1} /></QueryClientProvider>));
}

function visite(overrides: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    visitor_id: 50,
    customer_id: null,
    agent_id: null,
    type: 'in_person',
    status: 'scheduled',
    scheduled_at: '2026-05-10T10:00:00Z',
    duration_minutes: 30,
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    ...overrides,
  };
}

const f = fr.visits.fiche;
/** Tous les gestes de gestion, sous leurs noms de la fiche (le menu « ⋯ » compris). */
const GESTES = [f.bureau.plusDActions, f.barre.absent, f.barre.terminer, f.autres.replanifier];

beforeEach(() => {
  etat.visit = null;
});

describe('<VisitDetail> — gestes jugés par l’API (P152.04)', () => {
  it('le bailleur d’un bien d’agence (manage faux) ne voit aucun des gestes', () => {
    rendre(visite({ abilities: { manage: false } }));

    for (const nom of GESTES) {
      expect(screen.queryByRole('button', { name: nom })).toBeNull();
    }
  });

  it('sans abilities, rien n’est offert', () => {
    rendre(visite());
    for (const nom of GESTES) expect(screen.queryByRole('button', { name: nom })).toBeNull();
  });

  it('celui que l’API laisse gérer voit les gestes', async () => {
    rendre(visite({ abilities: { manage: true } }));

    expect(screen.getByRole('button', { name: f.barre.terminer })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: f.barre.absent })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: f.autres.replanifier })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: f.bureau.plusDActions }));
    expect(await screen.findByRole('button', { name: f.autres.confirmer })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`^${f.autres.annuler}`) })).toBeInTheDocument();
  });
});
