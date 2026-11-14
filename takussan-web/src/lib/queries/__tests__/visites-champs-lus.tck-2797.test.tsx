/**
 * TCK-2797 — chaque lecture de `/api/property-visits` demande toutes les clés qu'elle lit.
 *
 * L'API ne rend plus que `id`, les clés de `fields[property_visits]` et les blocs de `include=`
 * (`PropertyVisitResource::toArray`). Ici, le réseau est doublé au niveau d'`apiRequest` par
 * `commeLApi` (`src/test/visites-comme-l-api.ts`) : la visite servie est réduite aux clés demandées,
 * et toute lecture d'une autre clé de visite est notée. Une liste qui lit sans demander rend alors
 * un écran vide ET une lecture notée.
 *
 * Les autres listes sont gardées là où leurs écrans sont déjà rendus sur ce double :
 *  - `VISIT_TIME_FIELDS` : `VisitesParLeTemps`, `toutes-ouvre-toutes`, `MaJournee`, et
 *    `parametresDesVisitesAConfirmer` (`AFaireAdmin`, `AFaireBailleur`) ;
 *  - `VISITE_DE_LA_SEMAINE_FIELDS` : `MaJournee` (la bande de la semaine) ;
 *  - `VISIT_CLIENT_FIELDS` : `mes-visites`.
 * « Ses visites » de la fiche (`FicheDeLaVisite`) lit une `VisiteDuClient`, typée sur ses seules clés
 * demandées : `tsc` refuse toute autre lecture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { withIntl } from '@/test/intl';
import { CLES_D_UNE_VISITE, lecturesHorsFields, oublierLesLectures } from '@/test/visites-comme-l-api';
import { RACINE_DU_DEPOT } from './attributs-calcules-de-l-api';
import type { PropertyVisit } from '@/types/visit';

import { VisitsList } from '@/components/visits/VisitsList';
import { useRappelDuPersona } from '@/components/navigation-publique/useRappelDuPersona';
import { fetchCustomerLinked } from '@/lib/queries/agent-crm';

/** Une visite telle que l'API la rendrait SANS `fields` : toutes les clés, pour qu'aucune ne manque au fixture. */
const VISITE_ENTIERE: PropertyVisit = {
  id: 41,
  property_id: 10,
  visitor_id: 7,
  customer_id: 12,
  agent_id: null,
  visitor_name: 'Mariama Fall',
  visitor_phone: '+221771112233',
  visitor_email: 'mariama@example.test',
  type: 'in_person',
  status: 'scheduled',
  scheduled_at: '2026-11-20T10:00:00Z',
  preferred_window: null,
  completed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  duration_minutes: 45,
  feedback: null,
  rating: null,
  notes: 'Code du portail',
  metadata: null,
  property: { id: 10, title: 'Villa à Almadies', slug: 'villa-almadies' },
  visitor_display: { name: 'Mariama Fall', phone: '+221771112233', kind: 'customer', visits_on_property: 2 },
  visitor: { id: 7, first_name: 'Mariama', last_name: 'Fall' },
  agent: null,
  customer: { id: 12, first_name: 'Mariama', last_name: 'Fall' },
  report: null,
  created_at: '2026-11-10T09:00:00Z',
};

const etat = vi.hoisted(() => ({ chemins: [] as string[] }));

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3, roles: ['agent'], agency_id: 1 }, token: 'jeton' }) }));
vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string) => {
      etat.chemins.push(chemin);
      const { commeLApi } = await import('@/test/visites-comme-l-api');
      const route = chemin.split('?')[0];
      if (route === '/api/property-visits') {
        return commeLApi(chemin, { data: [VISITE_ENTIERE], meta: { total: 1, per_page: 30, current_page: 1, last_page: 1 } });
      }
      return { data: [], meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 } };
    }),
  };
});

function avecClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  etat.chemins = [];
  oublierLesLectures();
});
afterEach(() => {
  expect(lecturesHorsFields()).toEqual([]);
});

describe('chaque lecture de visites demande ce qu’elle lit', () => {
  it('`VISIT_LIST_FIELDS` — la liste par statut rend le bien, l’heure et la durée', async () => {
    render(avecClient(<VisitsList />));

    expect(await screen.findByText('Villa à Almadies')).toBeInTheDocument();
    expect(screen.getByText(/45/)).toBeInTheDocument();
    expect(etat.chemins.some((c) => decodeURIComponent(c).includes('fields[property_visits]='))).toBe(true);
  });

  it('`useRappelDuPersona` — la prochaine visite : son heure et son bien', async () => {
    const { result } = renderHook(() => useRappelDuPersona('agent'), { wrapper: ({ children }) => avecClient(children) });

    await waitFor(() => expect(result.current.visite).toEqual({ date: '2026-11-20T10:00:00Z', bien: 'Villa à Almadies' }));
  });

  it('`fetchCustomerLinked` — les visites de la fiche : statut, date, bien', async () => {
    const lignes = await fetchCustomerLinked('jeton', 12, 'visits');

    expect(lignes).toEqual([
      { id: 41, status: 'scheduled', date: '2026-11-20T10:00:00Z', end_date: null, reference_number: null, property: { id: 10, title: 'Villa à Almadies' } },
    ]);
  });
});

describe('le double', () => {
  it('connaît exactement les clés que `PropertyVisitResource` peut rendre', () => {
    const php = readFileSync(join(RACINE_DU_DEPOT, 'takussan-api', 'app', 'Http', 'Resources', 'PropertyVisitResource.php'), 'utf8');
    const corps = /private function toutesLesCles\(Request \$request\): array\n    \{([\s\S]*?)\n    \}\n/.exec(php)?.[1] ?? '';
    const cles = [...corps.matchAll(/^ {12}'([a-z_]+)' =>/gm)].map((m) => m[1]);

    expect(cles).toEqual([...CLES_D_UNE_VISITE]);
  });

  it('note la lecture d’une clé non demandée, pas celle d’une clé demandée', async () => {
    const { commeLApi } = await import('@/test/visites-comme-l-api');
    const reponse = commeLApi('/api/property-visits?fields%5Bproperty_visits%5D=id%2Cstatus&include=property', { data: [VISITE_ENTIERE] });
    const v = reponse.data[0];

    expect(Object.keys(v)).toEqual(['id', 'status', 'property']);
    expect(v.status).toBe('scheduled');
    expect(lecturesHorsFields()).toEqual([]);
    expect(v.visitor_display).toBeUndefined();
    expect(lecturesHorsFields()).toEqual(['visitor_display (/api/property-visits)']);
    oublierLesLectures();
  });
});
