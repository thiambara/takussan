/**
 * TCK-1375 (P115.05) — le geste « absent » : le personnel marque absente une visite planifiée ou
 * confirmée dont l'heure est passée (`POST property-visits/{id}/no-show`).
 *
 * TCK-2587 (lot B) — le geste s'appelle « Absent » sur la fiche ; commencée avant l'heure, la
 * visite le montre grisé (`?commencee=`), jamais actif.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/visits/1',
  useSearchParams: () => new URLSearchParams(),
}));
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
  useCreneauxDeVisite: () => ({ data: undefined, isError: false, dataUpdatedAt: 0 }),
  useAttribuerEnLot: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
    // P152.04 — le personnel de l'agence du bien : l'API le laisse gérer la visite.
    abilities: { manage: true },
    ...overrides,
  };
}

/** TCK-2587 (lot B) — la fiche lit le prix du bien et le profil actif : un client de requêtes. */
function rendreLeDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><VisitDetail id={1} /></QueryClientProvider>));
}

describe('<VisitDetail> — absent (TCK-1375)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    etat.user = { id: 7, roles: ['agent'] };
  });

  it('propose « Absent » au personnel sur une visite confirmée passée, et l’envoie', async () => {
    etat.visit = visite();
    rendreLeDetail();

    await userEvent.click(screen.getByRole('button', { name: 'Absent' }));

    expect(noShow.mutateAsync).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Visite marquée absente', type: 'success' }));
  });

  it('le propose aussi sur une visite planifiée passée', () => {
    etat.visit = visite({ status: 'scheduled' });
    rendreLeDetail();
    expect(screen.getByRole('button', { name: 'Absent' })).toBeInTheDocument();
  });

  it('ne le propose pas avant l’heure de la visite', () => {
    etat.visit = visite({ scheduled_at: A_VENIR });
    rendreLeDetail();
    expect(screen.queryByRole('button', { name: 'Absent' })).toBeNull();
  });

  it('ne le propose pas sur une visite terminée', () => {
    etat.visit = visite({ status: 'completed' });
    rendreLeDetail();
    expect(screen.queryByRole('button', { name: 'Absent' })).toBeNull();
  });

  it('ne le propose pas au visiteur', () => {
    etat.user = { id: 99, roles: ['customer'] };
    etat.visit = visite({ visitor_id: 99, abilities: { manage: false } });
    rendreLeDetail();
    expect(screen.queryByRole('button', { name: 'Absent' })).toBeNull();
  });
});
