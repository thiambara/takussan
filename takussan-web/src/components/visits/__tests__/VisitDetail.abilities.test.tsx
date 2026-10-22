/**
 * P152.04 — confirmer, clore, déclarer manquée, replanifier et annuler se montrent sous
 * `abilities.manage` (`PropertyVisitPolicy::update` et `agitPourLeBien`), plus sous le rôle : le
 * bailleur d'un bien d'agence les voyait, et l'API rendait 403 `visit.staff_only`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const etat = vi.hoisted(() => ({ visit: null as PropertyVisit | null }));
const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['owner', 'customer'] } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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

const a = fr.visits.detail.actions;

beforeEach(() => {
  etat.visit = null;
});

describe('<VisitDetail> — gestes jugés par l’API (P152.04)', () => {
  it('le bailleur d’un bien d’agence (manage faux) ne voit aucun des gestes', () => {
    rendre(visite({ abilities: { manage: false } }));

    for (const nom of [a.confirm, a.complete, a.noShow, a.reschedule, fr.common.actions.cancel]) {
      expect(screen.queryByRole('button', { name: nom })).toBeNull();
    }
  });

  it('sans abilities, rien n’est offert', () => {
    rendre(visite());
    expect(screen.queryByRole('button', { name: a.confirm })).toBeNull();
  });

  it('celui que l’API laisse gérer voit les gestes', () => {
    rendre(visite({ abilities: { manage: true } }));

    expect(screen.getByRole('button', { name: a.confirm })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: a.complete })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: a.reschedule })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: fr.common.actions.cancel })).toBeInTheDocument();
  });
});
