/**
 * TCK-2883 — « Mes visites » du client (maquette `app-visites` a-7) : le quartier dès la demande, « L'agence
 * vous répond d'ordinaire en N h » (rien sur 204), « Annulée par vous » / « Annulée par l'agence ». Le
 * réseau est doublé au niveau de `fetch` (`doublerLApi`, TCK-3010) ; les visites servies comme l'API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

import { doublerLApi } from '@/test/api-simulee';
import { rendre } from '@/test/rendu';
import type { PropertyVisit } from '@/types/visit';

import { MesVisites } from '../MesVisites';

const etat = {
  demandees: [] as PropertyVisit[],
  passees: [] as PropertyVisit[],
};

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/visits',
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));

const api = doublerLApi()
  .servir('visites', ({ requete }) => {
    const statut = requete.get('filter[status]');
    return statut === 'scheduled' ? etat.demandees : !statut && requete.get('filter[scheduled_at_max]') ? etat.passees : [];
    // TCK-3010 — la doublure ne filtre pas : ces filter[…] ne se jugent ici que sur la requête envoyée.
  }, { filtres: ['scheduled_at_min'] })
  .parDefaut({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } });

const DELAI_DE_REPONSE = /^\/api\/agencies\/\d+\/response-time$/;
/** Le délai de réponse de l'agence ; sans lui, 204 (`apiRequest` rend `null`). */
const servirLeDelai = (delai: { median_hours: number; sample: number }) => api.sur('GET', DELAI_DE_REPONSE, { data: delai });

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
  return rendre(<MesVisites titre="Mes visites" />, { compte: { utilisateur: { id: 30, roles: ['customer'] }, jeton: 'jeton' } });
}

async function ligneEnAttente() {
  const section = (await screen.findByRole('heading', { name: 'En attente de confirmation' })).closest('section') as HTMLElement;
  return within(section).getByRole('listitem');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { demandees: [], passees: [] });
  api.sur('GET', DELAI_DE_REPONSE, null, 204);
});
afterEach(() => {
  vi.useRealTimers();
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
    servirLeDelai({ median_hours: 2, sample: 14 });
    monter();
    const ligne = await ligneEnAttente();
    expect(await within(ligne).findByText('L’agence vous répond d’ordinaire en 2 h')).toBeInTheDocument();
    expect(api.appels('/api/agencies/7/response-time')).toHaveLength(1);
  });

  it('204 : la ligne n’existe pas', async () => {
    etat.demandees = [DEMANDE];
    monter();
    const ligne = await ligneEnAttente();
    await waitFor(() => expect(api.appels('/api/agencies/7/response-time')).toHaveLength(1));
    expect(ligne.querySelector('[data-slot="delai-de-reponse"]')).toBeNull();
    expect(within(ligne).queryByText(/répond d’ordinaire/)).toBeNull();
  });

  it('un bien sans agence : aucune lecture, aucune ligne', async () => {
    etat.demandees = [visite({ ...DEMANDE, id: 912, property: { ...DEMANDE.property!, agency_id: null } })];
    servirLeDelai({ median_hours: 2, sample: 14 });
    monter();
    const ligne = await ligneEnAttente();
    expect(ligne.querySelector('[data-slot="delai-de-reponse"]')).toBeNull();
    await api.auRepos();
    // Ni sur un chemin vide : la lecture n'est pas armée sans agence.
    expect(api.appels().filter((a) => a.chemin !== '/api/property-visits')).toEqual([]);
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
