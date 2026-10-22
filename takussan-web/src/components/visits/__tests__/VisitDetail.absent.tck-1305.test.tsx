/**
 * TCK-1305 (P115.05) — le geste « absent » : le personnel marque absente une visite planifiée ou
 * confirmée dont l'heure est passée (`POST property-visits/{id}/no-show`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { VisitDetail } from '../VisitDetail';
import type { PropertyVisit } from '@/types/visit';

const etat = vi.hoisted(() => ({
  visit: null as PropertyVisit | null,
  user: { id: 7, roles: ['agent'] as string[] },
}));
const mutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const noShow = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const toastAdd = vi.fn();

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: etat.user }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/lib/queries/visits', () => ({
  useVisit: () => ({ data: { data: etat.visit }, isLoading: false, isError: false }),
  useCancelVisit: () => mutation,
  useCompleteVisit: () => mutation,
  useConfirmVisit: () => mutation,
  useUpdateVisit: () => mutation,
  useClaimVisit: () => mutation,
  useProposeVisitSlot: () => mutation,
  useMarkVisitNoShow: () => noShow,
}));

const PASSEE = new Date(Date.now() - 2 * 3600_000).toISOString();
const A_VENIR = new Date(Date.now() + 2 * 3600_000).toISOString();

function visite(overrides: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    visitor_id: null,
    customer_id: null,
    agent_id: 7,
    type: 'in_person',
    status: 'confirmed',
    scheduled_at: PASSEE,
    duration_minutes: 30,
    property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
    ...overrides,
  };
}

describe('<VisitDetail> — absent (TCK-1305)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    etat.user = { id: 7, roles: ['agent'] };
  });

  it('propose « Marquer absent » au personnel sur une visite confirmée passée, et l’envoie', async () => {
    etat.visit = visite();
    render(withIntl(<VisitDetail id={1} />));

    await userEvent.click(screen.getByRole('button', { name: 'Marquer absent' }));

    expect(noShow.mutateAsync).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Visite marquée absente', type: 'success' }));
  });

  it('le propose aussi sur une visite planifiée passée', () => {
    etat.visit = visite({ status: 'scheduled' });
    render(withIntl(<VisitDetail id={1} />));
    expect(screen.getByRole('button', { name: 'Marquer absent' })).toBeInTheDocument();
  });

  it('ne le propose pas avant l’heure de la visite', () => {
    etat.visit = visite({ scheduled_at: A_VENIR });
    render(withIntl(<VisitDetail id={1} />));
    expect(screen.queryByRole('button', { name: 'Marquer absent' })).toBeNull();
  });

  it('ne le propose pas sur une visite terminée', () => {
    etat.visit = visite({ status: 'completed' });
    render(withIntl(<VisitDetail id={1} />));
    expect(screen.queryByRole('button', { name: 'Marquer absent' })).toBeNull();
  });

  it('ne le propose pas au visiteur', () => {
    etat.user = { id: 99, roles: ['customer'] };
    etat.visit = visite({ visitor_id: 99 });
    render(withIntl(<VisitDetail id={1} />));
    expect(screen.queryByRole('button', { name: 'Marquer absent' })).toBeNull();
  });
});
