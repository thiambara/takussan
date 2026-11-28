/**
 * TCK-2797 — chaque lecture de `/api/property-visits` demande toutes les clés qu'elle lit.
 *
 * L'API ne rend plus que `id`, les clés de `fields[property_visits]` et les blocs de `include=`
 * (`PropertyVisitResource::toArray`). Ici, le réseau est doublé au niveau de `fetch` par
 * `doublerLApi` (`src/test/api-simulee.ts`, TCK-3010) : la visite servie est réduite aux clés demandées,
 * et toute lecture d'une autre clé de visite fait échouer le test. Une liste qui lit sans demander rend
 * alors un écran vide ET un test rouge qui nomme la clé. Le double lui-même (ses clés, gardées contre
 * `PropertyVisitResource`) est éprouvé dans `src/test/__tests__/api-simulee.test.tsx`.
 *
 * Les autres listes sont gardées là où leurs écrans sont déjà rendus sur ce double :
 *  - `VISIT_TIME_FIELDS` : `VisitesParLeTemps`, `toutes-ouvre-toutes`, `MaJournee`, et
 *    `parametresDesVisitesAConfirmer` (`AFaireAdmin`, `AFaireBailleur`) ;
 *  - `VISITE_DE_LA_SEMAINE_FIELDS` : `MaJournee` (la bande de la semaine) ;
 *  - `VISIT_CLIENT_FIELDS` : `mes-visites`.
 * « Ses visites » de la fiche (`FicheDeLaVisite`) lit une `VisiteDuClient`, typée sur ses seules clés
 * demandées : `tsc` refuse toute autre lecture.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { doublerLApi } from '@/test/api-simulee';
import { rendre, rendreLeHook } from '@/test/rendu';
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

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

const api = doublerLApi()
  .servir('visites', [VISITE_ENTIERE])
  .parDefaut({ data: [], meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 } });

const COMPTE = { utilisateur: { id: 3, roles: ['agent'], agency_id: 1 }, jeton: 'jeton' } as const;

describe('chaque lecture de visites demande ce qu’elle lit', () => {
  it('`VISIT_LIST_FIELDS` — la liste par statut rend le bien, l’heure et la durée', async () => {
    rendre(<VisitsList />, { compte: COMPTE });

    expect(await screen.findByText('Villa à Almadies')).toBeInTheDocument();
    expect(screen.getByText(/45/)).toBeInTheDocument();
    expect(api.appels('/api/property-visits').some((a) => a.requete.has('fields[property_visits]'))).toBe(true);
  });

  it('`useRappelDuPersona` — la prochaine visite : son heure et son bien', async () => {
    const { result } = rendreLeHook(() => useRappelDuPersona('agent'), { compte: COMPTE });

    await waitFor(() => expect(result.current.visite).toEqual({ date: '2026-11-20T10:00:00Z', bien: 'Villa à Almadies' }));
  });

  it('`fetchCustomerLinked` — les visites de la fiche : statut, date, bien', async () => {
    const lignes = await fetchCustomerLinked('jeton', 12, 'visits');

    expect(lignes).toEqual([
      { id: 41, status: 'scheduled', date: '2026-11-20T10:00:00Z', end_date: null, reference_number: null, property: { id: 10, title: 'Villa à Almadies' } },
    ]);
  });
});
