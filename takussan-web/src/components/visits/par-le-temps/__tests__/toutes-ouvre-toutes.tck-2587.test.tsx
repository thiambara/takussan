/**
 * TCK-2587 (q1, décision de session) — « une pastille qui annonce N ouvre N », pour « Toutes N » du
 * bureau : elle compte `counts.all` (la portée entière), et ouvre la vue des statuts sur l'onglet
 * « Toutes », dont la lecture ne porte AUCUN `filter[status]` — la même portée que le compte. Avant,
 * elle ouvrait « Demandées » (6 sur 13).
 *
 * Les vrais `VisitesParLeTemps` et `VisitsList`, une URL qui change vraiment (`navigationDeTest`), le
 * réseau doublé au niveau d'`apiRequest`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { navigationDeTest } from '@/test/navigation-url';
import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { VisitesParLeTemps } from '../VisitesParLeTemps';

const etat = vi.hoisted(() => ({ large: true, appels: [] as string[] }));

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/hooks/useMatchesMedia', () => ({
  useMatchesMedia: (requete: string) => (requete.includes('64rem') ? etat.large : requete.includes('48rem') ? !etat.large : false),
}));
vi.mock('@/hooks/usePersonnelActif', () => ({ useAgenceDuPersonnelActif: () => 3, usePersonnelActif: () => true }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'], agency_id: 3 }, token: 'jeton' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));

/** Le périmètre de l'agence : 13 visites, dont 6 demandées à venir. */
const COMPTES = { unassigned: 1, requested: 6, confirmed: 3, past: 3, cancelled: 1, today: 2, to_close: 1, later: 2, all: 13 };

const filtresDe = (p: URLSearchParams) => [...p.keys()].filter((k) => k.startsWith('filter[')).sort();

function totalDe(p: URLSearchParams): number {
  if (filtresDe(p).length === 0) return COMPTES.all;
  if (p.get('filter[unassigned]')) return COMPTES.unassigned;
  if (p.get('filter[status]') === 'scheduled') return COMPTES.requested;
  if (p.get('filter[status]') === 'confirmed') return COMPTES.confirmed;
  if (p.get('filter[status]') === 'cancelled') return COMPTES.cancelled;
  if (p.get('filter[scheduled_at_max]')) return COMPTES.past;
  return 0;
}

const UNE: PropertyVisit = {
  id: 1,
  property_id: 10,
  status: 'confirmed',
  type: 'in_person',
  scheduled_at: '2026-11-12T10:00:00Z',
  property: { id: 10, title: 'Studio Mermoz', slug: 'studio-mermoz' },
} as PropertyVisit;

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string, options: { method?: string } = {}) => {
      if ((options.method ?? 'GET') === 'GET') etat.appels.push(chemin);
      const [route, qs] = chemin.split('?');
      const p = new URLSearchParams(qs ?? '');
      if (route === '/api/property-visits/counts') return { data: COMPTES };
      if (route === '/api/property-visits') {
        return { data: [UNE], meta: { total: totalDe(p), per_page: 30, current_page: 1, last_page: 1 } };
      }
      return { data: [], meta: { total: 0, per_page: 8, current_page: 1, last_page: 1 } };
    }),
  };
});

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<VisitesParLeTemps titre="Visites" />)}</QueryClientProvider>);
}

const lectures = (route: string) =>
  etat.appels.filter((c) => c.split('?')[0] === route).map((c) => new URLSearchParams(c.split('?')[1] ?? ''));

/** La rangée d'onglets de `VisitsList` (celle qui n'est pas « Vues des visites »). */
const ongletsDeStatut = () => screen.getAllByRole('tablist').find((l) => l.getAttribute('aria-label') !== 'Vues des visites') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:12:00Z'));
  etat.large = true;
  etat.appels = [];
});
afterEach(() => vi.useRealTimers());

describe('« Toutes N » ouvre N (TCK-2587, q1)', () => {
  it('au bureau, « Toutes 13 » ouvre l’onglet « Toutes » : 13, lu sans filter[status], sur la portée du compte', async () => {
    navigationDeTest.reinitialiser('');
    const user = userEvent.setup();
    monter();

    const vues = screen.getByRole('tablist', { name: 'Vues des visites' });
    await user.click(await within(vues).findByRole('tab', { name: /Toutes\s*13/ }));

    expect(new URLSearchParams(navigationDeTest.requete()).get('tab')).toBe('all');
    const actif = await waitFor(() => within(ongletsDeStatut()).getByRole('tab', { selected: true }));
    expect(actif).toHaveTextContent(/^Toutes\s*13$/);

    // Le 13 de l'onglet ouvert est le `meta.total` de SA lecture, et le double ne rend 13 qu'à une
    // lecture sans aucun filter[...] : celle qui porte exactement les filtres du compte (aucun).
    const compte = lectures('/api/property-visits/counts')[0];
    expect(filtresDe(compte)).toEqual([]);
    expect(lectures('/api/property-visits').some((p) => filtresDe(p).length === 0 && p.get('sort') === '-scheduled_at')).toBe(true);
  });

  it('sous un filtre du bureau, « Toutes » n’annonce pas un compte que la vue des statuts ne rendrait pas', async () => {
    navigationDeTest.reinitialiser('agent=21');
    monter();

    const vues = screen.getByRole('tablist', { name: 'Vues des visites' });
    await within(vues).findByRole('tab', { name: /Plus tard\s*2/ });
    expect(within(vues).getByRole('tab', { name: /Toutes/ })).toHaveTextContent(/^Toutes$/);
  });

  it('au téléphone, « Par statut » (sans compte) ouvre le défaut, « Demandées »', async () => {
    etat.large = false;
    navigationDeTest.reinitialiser('');
    const user = userEvent.setup();
    monter();

    await user.click(within(screen.getByLabelText('Vues des visites')).getByRole('button', { name: 'Par statut' }));

    expect(new URLSearchParams(navigationDeTest.requete()).get('tab')).toBeNull();
    expect(within(ongletsDeStatut()).getByRole('tab', { selected: true })).toHaveTextContent(/^Demandées/);
  });
});
