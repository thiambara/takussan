/**
 * P152.04 — confirmer, clore, déclarer manquée, replanifier et annuler se montrent sous
 * `abilities.manage` (`PropertyVisitPolicy::update` et `agitPourLeBien`), plus sous le rôle : le
 * bailleur d'un bien d'agence les voyait, et l'API rendait 403 `visit.staff_only`.
 *
 * TCK-2587 (lot B) — la fiche nomme ses gestes autrement (« Absent », « Terminer la visite ») et range
 * les moins fréquents sous « ⋯ » au bureau ; la règle épinglée ne change pas.
 *
 * Reprise (vérification du lot B, g1) : au bureau, un second garde de la fiche (`personnel`) masque
 * tout, si bien que l'épingle restait verte quand `canComplete`, `canMarkNoShow`, `canReschedule` ou
 * `canCancel` perdaient leur condition. Le bailleur est donc rendu AUSSI au téléphone, où les gestes
 * ne dépendent que de ces quatre conditions, et l'annulation est comptée parmi les gestes absents.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
/** « Annuler la visite » et « Replanifier » portent un complément au menu : ils se cherchent par leur début. */
const ANNULER = new RegExp(`^${f.autres.annuler}`);
const REPLANIFIER = new RegExp(`^${f.autres.replanifier}`);
/** Au téléphone, les gestes de gestion : ceux de la barre, et ceux des « Autres gestes » par leur début. */
const GESTES_AU_TELEPHONE = [f.barre.absent, f.barre.terminer, REPLANIFIER, ANNULER];

/** Le téléphone se reconnaît à la requête `48rem` de la fiche, comme dans fiche.tck-2587. */
function ecrans(telephone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: telephone && query.includes('48rem'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  etat.visit = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<VisitDetail> — gestes jugés par l’API (P152.04)', () => {
  it('le bailleur d’un bien d’agence (manage faux) ne voit aucun des gestes', () => {
    rendre(visite({ abilities: { manage: false } }));

    for (const nom of GESTES) {
      expect(screen.queryByRole('button', { name: nom })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: ANNULER })).toBeNull();
  });

  it.each(['scheduled', 'confirmed'] as const)(
    'au téléphone non plus, le bailleur ne voit aucun geste (visite %s)',
    (status) => {
      ecrans(true);
      rendre(visite({ status, abilities: { manage: false } }));

      for (const nom of GESTES_AU_TELEPHONE) {
        expect(screen.queryByRole('button', { name: nom })).toBeNull();
      }
    },
  );

  it('au téléphone, celui que l’API laisse gérer voit les mêmes gestes (le témoin)', () => {
    ecrans(true);
    rendre(visite({ status: 'confirmed', abilities: { manage: true } }));

    expect(screen.getByRole('button', { name: f.barre.terminer })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: f.barre.absent })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: REPLANIFIER })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ANNULER })).toBeInTheDocument();
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
