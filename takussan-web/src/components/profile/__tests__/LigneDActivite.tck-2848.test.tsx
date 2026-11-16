/**
 * TCK-2848 — la ligne d'activité de chaque espace (`GET /api/me/profiles?include=activity`, TCK-2847) :
 * dans le menu du compte (bureau), la feuille du compte (téléphone) et les cartes du choix d'espace. Les
 * seuls compteurs non nuls ; aucun → pas de ligne ; erreur → pas de ligne.
 *
 * Les hooks sont les VRAIS, sur un `fetch` doublé qui sert la liste des profils (relais, sans inclusion)
 * et la liste AVEC l'activité (l'API, `include=activity`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { activiteDeLEspace, segmentsDActivite } from '@/lib/activite-des-espaces';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { withIntl } from '@/test/intl';
import { ChoixDEspace } from '../ChoixDEspace';
import { EspacesDeLaFeuille, EspacesDuMenu } from '../EspacesDuMenu';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', refreshUser: vi.fn(), setActiveProfileId: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const DAKAR = { id: 1, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard' as const, city: 'Dakar' };
const THIES = { id: 2, name: 'Thiès Properties', slug: 'thies-properties', kind: 'standard' as const, city: 'Thiès' };
const PROFILS: MyProfilesResponse = {
  data: [
    { id: 'agent:3', type: 'agent', numeric_id: 3, agency_id: 1, agency: DAKAR, status: 'active', created_at: null },
    { id: 'owner:8', type: 'owner', numeric_id: 8, agency_id: 2, agency: THIES, status: 'active', created_at: null },
  ],
  meta: { active_profile_id: 'agent:3', count: 2 },
};

function servir(activites: Record<string, object> | 'erreur') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('include=activity')) {
        if (activites === 'erreur') return new Response('{}', { status: 500 });
        const corps = { ...PROFILS, data: PROFILS.data.map((p) => ({ ...p, activity: activites[p.id] ?? [] })) };
        return new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(PROFILS), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => vi.unstubAllGlobals());

const AVEC_DAKAR_SEUL = { 'agent:3': { unhandled_leads: 4, visits_today: 2 }, 'owner:8': { properties: 0, rent_overdue: 0 } };

describe('TCK-2848 — la ligne d’activité des espaces', () => {
  it('AC3 — menu du compte (bureau) : « 4 demandes · 2 visites aujourd’hui » sous Dakar Immo ; Thiès, sans rien en cours, n’a pas de ligne', async () => {
    servir(AVEC_DAKAR_SEUL);
    render(
      withIntl(
        <QueryClientProvider client={client()}>
          <DropdownMenu>
            <DropdownMenuTrigger>compte</DropdownMenuTrigger>
            <DropdownMenuContent>
              <EspacesDuMenu titre="Vos espaces" />
            </DropdownMenuContent>
          </DropdownMenu>
        </QueryClientProvider>,
      ),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'compte' }));
    const dakar = await screen.findByTestId('espace-du-menu-agent:3');
    await waitFor(() => expect(dakar).toHaveTextContent('4 demandes · 2 visites aujourd’hui'));
    const thies = screen.getByTestId('espace-du-menu-owner:8');
    expect(thies.querySelector('[data-slot="ligne-d-activite"]')).toBeNull();
    expect(thies).not.toHaveTextContent(/0 bien|0 loyer/);
  });

  it('AC3 — feuille du compte (téléphone) : la même ligne, « 2 biens · 1 loyer en retard » chez le bailleur', async () => {
    servir({ 'agent:3': { unhandled_leads: 4, visits_today: 2 }, 'owner:8': { properties: 2, rent_overdue: 1 } });
    render(
      withIntl(
        <QueryClientProvider client={client()}>
          <EspacesDeLaFeuille titre="Vos espaces" />
        </QueryClientProvider>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('espace-de-la-feuille-owner:8')).toHaveTextContent('2 biens · 1 loyer en retard'));
    expect(screen.getByTestId('espace-de-la-feuille-agent:3')).toHaveTextContent('4 demandes · 2 visites aujourd’hui');
  });

  it('AC3 — cartes du choix d’espace : la ligne sur chaque carte qui a quelque chose en cours', async () => {
    servir(AVEC_DAKAR_SEUL);
    render(
      withIntl(
        <QueryClientProvider client={client()}>
          <ChoixDEspace espaces={PROFILS.data} prenom="Sokhna" userId={1} />
        </QueryClientProvider>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('choix-d-espace-agent:3')).toHaveTextContent('4 demandes · 2 visites aujourd’hui'));
    expect(screen.getByTestId('choix-d-espace-owner:8').querySelector('[data-slot="ligne-d-activite"]')).toBeNull();
  });

  it('une lecture en erreur : aucune ligne, et les espaces restent', async () => {
    servir('erreur');
    render(
      withIntl(
        <QueryClientProvider client={client()}>
          <EspacesDeLaFeuille titre="Vos espaces" />
        </QueryClientProvider>,
      ),
    );
    await screen.findByTestId('espace-de-la-feuille-agent:3');
    await new Promise((r) => setTimeout(r, 30));
    expect(document.querySelector('[data-slot="ligne-d-activite"]')).toBeNull();
  });
});

describe('TCK-2848 — les règles de la ligne', () => {
  it('ne garde que les compteurs non nuls, dans l’ordre ; aucun → rien', () => {
    expect(segmentsDActivite({ visits_today: 2, unhandled_leads: 0 })).toEqual([{ cle: 'visitesAujourdhui', nombre: 2 }]);
    expect(segmentsDActivite({ unhandled_leads: 0, visits_today: 0 })).toEqual([]);
    expect(segmentsDActivite(null)).toEqual([]);
  });

  it('l’espace personnel (agence `individual`, deux profils fusionnés) porte l’activité des DEUX', () => {
    const perso = { id: 9, name: 'Espace de Awa', slug: 'awa', kind: 'individual' as const };
    const admin: Profile = { id: 'agency_admin:5', type: 'agency_admin', numeric_id: 5, agency_id: 9, agency: perso, status: null, created_at: null };
    const bailleur: Profile = { ...admin, id: 'owner:6', type: 'owner', numeric_id: 6 };
    const activite = activiteDeLEspace(admin, [
      { ...admin, activity: { unhandled_leads: 1, visits_today: 0 } },
      { ...bailleur, activity: { properties: 3, rent_overdue: 1 } },
    ]);
    expect(segmentsDActivite(activite).map((s) => s.cle)).toEqual(['demandes', 'biens', 'loyersEnRetard']);
  });
});
