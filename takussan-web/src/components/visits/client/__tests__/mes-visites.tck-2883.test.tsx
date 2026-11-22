/**
 * TCK-2883 — « Mes visites » du client (maquette `app-visites` a-7) : le quartier dès la demande, « L'agence
 * vous répond d'ordinaire en N h » (rien sur 204), « Annulée par vous » / « Annulée par l'agence ». Le
 * réseau est doublé au niveau d'`apiRequest`, comme TCK-2587 ; les visites servies comme l'API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { lecturesHorsFields, oublierLesLectures } from '@/test/visites-comme-l-api';
import type { PropertyVisit } from '@/types/visit';

import { MesVisites } from '../MesVisites';

const etat = vi.hoisted(() => ({
  appels: [] as string[],
  demandees: [] as PropertyVisit[],
  passees: [] as PropertyVisit[],
  /** Le corps de `response-time` ; `null` = 204. */
  delai: null as { median_hours: number; sample: number } | null,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/visits',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 30, roles: ['customer'] }, token: 'jeton' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string) => {
      etat.appels.push(chemin);
      const [route, qs] = chemin.split('?');
      const p = new URLSearchParams(qs ?? '');
      if (route === '/api/property-visits') {
        const { commeLApi } = await import('@/test/visites-comme-l-api');
        const statut = p.get('filter[status]');
        const data = statut === 'scheduled' ? etat.demandees : !statut && p.get('filter[scheduled_at_max]') ? etat.passees : [];
        return commeLApi(chemin, { data, meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 } });
      }
      // 204 : `apiRequest` rend `null` (corps vide).
      if (/^\/api\/agencies\/\d+\/response-time$/.test(route)) return etat.delai ? { data: etat.delai } : null;
      return { data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } };
    }),
  };
});

const MAINTENANT = new Date('2026-11-10T10:12:00Z');

function visite(o: Partial<PropertyVisit> & { id: number }): PropertyVisit {
  return {
    property_id: 51,
    visitor_id: 30,
    status: 'scheduled',
    type: 'in_person',
    duration_minutes: 30,
    agent_id: 3,
    agent: { id: 3, first_name: 'Sokhna', last_name: 'Sène' },
    rating: null,
    ...o,
  } as PropertyVisit;
}

/** Une demande : le quartier servi, l'adresse NON (clé absente avant confirmation). */
const DEMANDE = visite({
  id: 911,
  scheduled_at: '2026-11-14T10:00:00Z',
  property: { id: 54, title: 'Studio meublé', slug: 'studio', cover_url: null, neighborhood: 'Ouakam', agency_id: 7 },
});

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<MesVisites titre="Mes visites" />)}</QueryClientProvider>);
}

async function ligneEnAttente() {
  const section = (await screen.findByRole('heading', { name: 'En attente de confirmation' })).closest('section') as HTMLElement;
  return within(section).getByRole('listitem');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { appels: [], demandees: [], passees: [], delai: null });
  oublierLesLectures();
});
afterEach(() => {
  vi.useRealTimers();
  expect(lecturesHorsFields()).toEqual([]);
});

describe('AC1 — le quartier dès la demande', () => {
  it('« Studio meublé · Ouakam », sans adresse', async () => {
    etat.demandees = [DEMANDE];
    monter();
    const ligne = await ligneEnAttente();
    expect(within(ligne).getByText('Studio meublé · Ouakam')).toBeInTheDocument();
    expect(ligne.querySelector('svg.lucide-map-pin')).toBeNull();
  });
});

describe('AC2 — le délai de réponse de l’agence', () => {
  it('median_hours = 2 : « L’agence vous répond d’ordinaire en 2 h », lu sur l’agence du bien', async () => {
    etat.demandees = [DEMANDE];
    etat.delai = { median_hours: 2, sample: 14 };
    monter();
    const ligne = await ligneEnAttente();
    expect(await within(ligne).findByText('L’agence vous répond d’ordinaire en 2 h')).toBeInTheDocument();
    expect(etat.appels).toContain('/api/agencies/7/response-time');
  });

  it('204 : la ligne n’existe pas', async () => {
    etat.demandees = [DEMANDE];
    monter();
    const ligne = await ligneEnAttente();
    await waitFor(() => expect(etat.appels).toContain('/api/agencies/7/response-time'));
    expect(ligne.querySelector('[data-slot="delai-de-reponse"]')).toBeNull();
    expect(within(ligne).queryByText(/répond d’ordinaire/)).toBeNull();
  });

  it('un bien sans agence : aucune lecture, aucune ligne', async () => {
    etat.demandees = [visite({ ...DEMANDE, id: 912, property: { ...DEMANDE.property!, agency_id: null } })];
    etat.delai = { median_hours: 2, sample: 14 };
    monter();
    const ligne = await ligneEnAttente();
    expect(ligne.querySelector('[data-slot="delai-de-reponse"]')).toBeNull();
    expect(etat.appels.some((c) => c.includes('response-time'))).toBe(false);
    // Ni sur un chemin vide : la lecture n'est pas armée sans agence.
    expect(etat.appels.filter((c) => !c.startsWith('/api/property-visits?'))).toEqual([]);
  });
});

describe('AC3 — qui a annulé', () => {
  const annulee = (id: number, o: Partial<PropertyVisit>) =>
    visite({ id, status: 'cancelled', scheduled_at: '2026-11-01T10:00:00Z', property: { id: 60 + id, title: `Bien ${id}`, slug: `b${id}`, cover_url: null }, ...o });

  it('« Annulée par vous », « Annulée par l’agence » avec son motif ; sans auteur, le seul motif', async () => {
    etat.passees = [
      annulee(1, { cancelled_by: 'visitor', cancellation_reason: 'empêchement' }),
      annulee(2, { cancelled_by: 'agency', cancellation_reason: 'bien loué' }),
      annulee(3, { cancelled_by: 'visitor', cancellation_reason: null }),
      annulee(4, { cancelled_by: null, cancellation_reason: 'grève' }),
    ];
    monter();
    const passees = (await screen.findByRole('heading', { name: 'Passées' })).closest('section') as HTMLElement;
    const lignes = within(passees).getAllByRole('listitem');
    const texte = (i: number) => lignes[i].querySelector('[data-slot="ligne-d-annulation"]')?.textContent;
    expect(texte(0)).toBe('Annulée par vous : « empêchement »');
    expect(texte(1)).toBe('Annulée par l’agence : « bien loué »');
    expect(texte(2)).toBe('Annulée par vous');
    expect(texte(3)).toBe('Motif : « grève »');
  });

  it('« Annulée par vous » seulement pour `cancelled_by = visitor`', async () => {
    etat.passees = [annulee(5, { cancelled_by: 'agency', cancellation_reason: null })];
    monter();
    await screen.findByRole('heading', { name: 'Passées' });
    expect(screen.queryByText(/Annulée par vous/)).toBeNull();
    expect(screen.getByText('Annulée par l’agence')).toBeInTheDocument();
  });
});
