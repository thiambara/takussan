/**
 * P230.01 (TCK-2228) — « Proposer un autre créneau » ne laisse choisir que les jours que
 * `VisitSlotsPublicPropertyRequest` accepte : du jour UTC (`after_or_equal:today`) à J+60
 * (`before_or_equal:+60 days`). Sans borne, un jour passé ou au-delà de 60 jours rendait
 * « L'action n'a pas abouti. », un échec et non une borne.
 *
 * Le navigateur est à New York, à 01:00 Z le 25 octobre : le jour local est encore le 24, le
 * jour de l'API est le 25.
 */
process.env.TZ = 'America/New_York';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const mutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const visite: PropertyVisit = {
  id: 1,
  property_id: 10,
  visitor_id: 30,
  customer_id: null,
  agent_id: 7,
  type: 'in_person',
  status: 'confirmed',
  scheduled_at: '2026-11-10T10:00:00Z',
  duration_minutes: 30,
  visitor_name: 'Awa Diop',
  visitor_phone: '+221771234567',
  property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
  abilities: { manage: false },
};

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 30, roles: ['customer'] } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
}));

describe('<VisitDetail> — proposer un créneau dans la fenêtre de l’API (P230.01)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('le champ du jour va du jour UTC à J+60, et non du jour local sans borne', () => {
    render(withIntl(<VisitDetail id={1} />));
    fireEvent.click(screen.getByRole('button', { name: 'Proposer un autre créneau' }));

    const champ = screen.getByLabelText('Date');
    expect(champ).toHaveAttribute('min', '2026-10-25');
    expect(champ).toHaveAttribute('max', '2026-12-24');
  });
});
