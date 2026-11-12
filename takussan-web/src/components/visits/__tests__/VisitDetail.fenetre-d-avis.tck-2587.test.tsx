/**
 * TCK-2587 (lot C) — la fiche et « Mes visites » lisent UNE règle de fenêtre d'avis
 * (`@/lib/visites/fenetre-d-avis`) : le client note dans les 24 h qui suivent la clôture, la fiche
 * se dit fermée au-delà.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const etat = vi.hoisted(() => ({ visit: null as PropertyVisit | null }));
const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 50, roles: ['customer'] } }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/visits/1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({ data: etat.visit ? { data: etat.visit } : undefined, isLoading: false, isError: !etat.visit, error: null, refetch: vi.fn() }),
  useCancelVisit: () => mutation,
  useCompleteVisit: () => mutation,
  useConfirmVisit: () => mutation,
  useUpdateVisit: () => mutation,
  useClaimVisit: () => mutation,
  useProposeVisitSlot: () => mutation,
  useMarkVisitNoShow: () => mutation,
  useSubmitVisitFeedback: () => mutation,
  useCreneauxDeVisite: () => ({ data: undefined, isError: false, dataUpdatedAt: 0 }),
  useAttribuerEnLot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const MAINTENANT = new Date('2026-11-10T10:12:00Z');

function rendre(completedAt: string) {
  etat.visit = {
    id: 1,
    property_id: 10,
    visitor_id: 50,
    customer_id: null,
    agent_id: 3,
    type: 'in_person',
    status: 'completed',
    scheduled_at: '2026-11-08T10:00:00Z',
    completed_at: completedAt,
    duration_minutes: 30,
    abilities: { manage: false, feedback_customer: true },
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
  } as PropertyVisit;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><VisitDetail id={1} /></QueryClientProvider>));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
});
afterEach(() => vi.useRealTimers());

describe('<VisitDetail> — la fenêtre d’avis du client', () => {
  it('clôturée il y a 3 h 30 : le client note la visite', () => {
    rendre('2026-11-10T06:42:00Z');
    expect(screen.queryByText(fr.visits.detail.feedback.locked)).toBeNull();
    expect(screen.getByText(fr.visits.feedbackForm.titleCustomer)).toBeInTheDocument();
  });

  it('clôturée il y a 25 h : la fenêtre est fermée', () => {
    rendre('2026-11-09T09:00:00Z');
    expect(screen.getByText(fr.visits.detail.feedback.locked)).toBeInTheDocument();
    expect(screen.queryByText(fr.visits.feedbackForm.titleCustomer)).toBeNull();
  });
});
