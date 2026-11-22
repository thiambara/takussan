/**
 * P230.05 (TCK-2236) — la replanification de l'agent ne propose pas un instant passé
 * (`UpdatePropertyVisitRequest` : `scheduled_at` `after:now`). Le champ se lit à l'heure de Dakar
 * (`instantADakar`) : son `min` est l'instant présent à Dakar, et non dans le fuseau du navigateur.
 * Navigateur à New York, 01:00 Z le 25 octobre : 21:00 le 24 au navigateur, 01:00 le 25 à Dakar.
 *
 * TCK-2587 (lot B) — sur une demande à confirmer, « Replanifier » vit sous « ⋯ » au bureau.
 */
process.env.TZ = 'America/New_York';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const mutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const visite: PropertyVisit = {
  id: 1,
  property_id: 10,
  visitor_id: null,
  customer_id: null,
  agent_id: 7,
  type: 'in_person',
  status: 'scheduled',
  scheduled_at: '2026-11-10T10:00:00Z',
  duration_minutes: 30,
  visitor_name: 'Awa Diop',
  visitor_phone: '+221771234567',
  property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
  abilities: { manage: true },
};

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'] } }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/visits/1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  apiFetch: () => Promise.resolve({ data: { slots: [] } }),
}));
vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({ data: { data: visite }, isLoading: false, isError: false }),
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

/** TCK-2587 (lot B) — la fiche lit le prix du bien et le profil actif : un client de requêtes. */
function rendreLeDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><VisitDetail id={1} /></QueryClientProvider>));
}

describe('<VisitDetail> — replanifier à partir de maintenant (P230.05)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('le nouveau créneau commence à l’instant présent, à Dakar', async () => {
    rendreLeDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    fireEvent.click(await screen.findByRole('button', { name: /^replanifier/i }));
    await screen.findByRole('dialog');

    expect(screen.getByLabelText(/nouveau créneau/i)).toHaveAttribute('min', '2026-10-25T01:00');
  });
});
