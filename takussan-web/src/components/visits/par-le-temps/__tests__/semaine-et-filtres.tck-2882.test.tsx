/**
 * TCK-2882 — au bureau, « Liste · Semaine » (mode par le temps), le filtre « Statut » (par le temps)
 * et le filtre « Type » (« Toutes », la vue des statuts). Les vrais `VisitesParLeTemps`,
 * `VisitsList` et `SemaineDeLAgenda`, une URL qui change vraiment, le réseau doublé à `fetch` (`doublerLApi`, TCK-3010).
 *
 * Horloge : mardi 10 novembre 2026, 10:12 à Dakar ; la semaine va du lundi 9 au dimanche 15.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { doublerLApi } from '@/test/api-simulee';
import { navigationDeTest } from '@/test/navigation-url';
import { rendre } from '@/test/rendu';
import type { PropertyVisit } from '@/types/visit';

import { VisitesParLeTemps } from '../VisitesParLeTemps';

// Un fuseau qui n'est pas celui de Dakar : la semaine et ses heures doivent rester à l'heure de Dakar.
process.env.TZ = 'Europe/Paris';

const etat = vi.hoisted(() => ({ assigner: true }));

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: (requete: string) => requete.includes('64rem') }));
vi.mock('@/hooks/usePersonnelActif', () => ({ useAgenceDuPersonnelActif: () => 3, usePersonnelActif: () => true }));
vi.mock('@/hooks/useCan', () => ({ useCan: (c: string) => ({ can: c === 'crm.assign' ? etat.assigner : true, isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));

const COMPTES = { unassigned: 1, requested: 6, confirmed: 3, past: 3, cancelled: 1, today: 2, to_close: 1, later: 2, all: 13 };

const MERCREDI: PropertyVisit = {
  id: 41,
  property_id: 10,
  status: 'confirmed',
  type: 'virtual',
  scheduled_at: '2026-11-11T10:00:00Z',
  duration_minutes: 30,
  property: { id: 10, title: 'Studio Mermoz', slug: 'studio-mermoz' },
} as PropertyVisit;
const VENDREDI: PropertyVisit = { ...MERCREDI, id: 42, status: 'scheduled', type: 'in_person', scheduled_at: '2026-11-13T15:30:00Z', property: { id: 11, title: 'Villa Ngor', slug: 'villa-ngor' } } as PropertyVisit;
/** Des statuts que l'Agenda ne recevait pas (`/api/calendar` : demandées et confirmées seulement). */
const LUNDI_TERMINEE: PropertyVisit = { ...MERCREDI, id: 43, status: 'completed', scheduled_at: '2026-11-09T09:00:00Z', property: { id: 12, title: 'Appartement Fann', slug: 'fann' } } as PropertyVisit;
const MARDI_ABSENT: PropertyVisit = { ...MERCREDI, id: 44, status: 'no_show', scheduled_at: '2026-11-10T08:30:00Z', property: { id: 13, title: 'Studio Ouakam', slug: 'ouakam' } } as PropertyVisit;

const api = doublerLApi()
  .sur('GET', '/api/property-visits/counts', { data: COMPTES })
  .servir('visites', ({ requete: p }) => {
    const semaine = p.get('filter[scheduled_at_min]') === '2026-11-09T00:00:00Z';
    return semaine ? [MERCREDI, VENDREDI, LUNDI_TERMINEE, MARDI_ABSENT] : p.get('filter[type]') === 'virtual' ? [MERCREDI] : [MERCREDI, VENDREDI];
  })
  .parDefaut({ data: [], meta: { total: 0, per_page: 8, current_page: 1, last_page: 1 } });

function monter() {
  return rendre(<VisitesParLeTemps titre="Visites" />, { compte: { utilisateur: { id: 7, roles: ['agent'], agency_id: 3 }, jeton: 'jeton' } });
}

const lectures = (route: string) => api.appels(route).filter((a) => a.methode === 'GET').map((a) => a.requete);
const url = () => new URLSearchParams(navigationDeTest.requete());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:12:00Z'));
  etat.assigner = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AC1 — « Liste · Semaine »', () => {
  it('« Semaine » montre la semaine en colonnes de jours, en UNE lecture bornée au lundi-dimanche de Dakar, aux filtres de la liste ; « Liste » y revient, filtres gardés', async () => {
    navigationDeTest.reinitialiser('agent=21&bien=10&q=Mermoz');
    const user = userEvent.setup();
    monter();

    const bascule = screen.getByRole('radiogroup', { name: 'Affichage' });
    expect(within(bascule).getByRole('radio', { name: 'Liste' })).toHaveAttribute('aria-checked', 'true');
    // La lecture de la liste part après les attentes d'`apiRequest` : on la laisse partir avant de compter.
    await waitFor(() => expect(lectures('/api/property-visits')).toHaveLength(1));
    api.oublierLesAppels();
    await user.click(within(bascule).getByRole('radio', { name: 'Semaine' }));

    expect(url().get('affichage')).toBe('semaine');
    const grille = await screen.findByRole('group', { name: /semaine/i });
    // Sept colonnes de jours, du lundi 9 au dimanche 15.
    expect(within(grille).getAllByRole('button', { pressed: false }).length + within(grille).getAllByRole('button', { pressed: true }).length).toBeGreaterThanOrEqual(7);
    expect(await within(grille).findByTestId('calendar-event-pill-visit-41')).toHaveTextContent('Studio Mermoz');
    expect(within(grille).getByTestId('calendar-event-pill-visit-42')).toBeInTheDocument();
    // Terminée et absente se posent comme les autres, sans planter la grille de l'Agenda.
    expect(within(grille).getByTestId('calendar-event-pill-visit-43')).toHaveTextContent('Appartement Fann');
    expect(within(grille).getByTestId('calendar-event-pill-visit-44')).toHaveTextContent('Studio Ouakam');

    const semaine = lectures('/api/property-visits');
    expect(semaine).toHaveLength(1);
    const p = semaine[0]!;
    expect(p.get('filter[scheduled_at_min]')).toBe('2026-11-09T00:00:00Z');
    expect(p.get('filter[scheduled_at_max]')).toBe('2026-11-15T23:59:59Z');
    expect(p.get('filter[status]')).toBe('scheduled,confirmed,completed,no_show');
    expect([p.get('filter[agent_id]'), p.get('filter[property_id]'), p.get('filter[search]')]).toEqual(['21', '10', 'Mermoz']);
    expect(p.get('fields[property_visits]')).toBeTruthy();

    await user.click(within(screen.getByRole('radiogroup', { name: 'Affichage' })).getByRole('radio', { name: 'Liste' }));
    expect(url().get('affichage')).toBeNull();
    expect([url().get('agent'), url().get('bien'), url().get('q')]).toEqual(['21', '10', 'Mermoz']);
    expect(await screen.findByRole('tablist', { name: 'Vues des visites' })).toBeInTheDocument();
  });

  it('« Suivant » lit la semaine d’après, une lecture de plus', async () => {
    navigationDeTest.reinitialiser('affichage=semaine');
    const user = userEvent.setup();
    monter();
    await screen.findByTestId('calendar-event-pill-visit-41');
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(url().get('semaine')).toBe('2026-11-17');
    await waitFor(() => expect(lectures('/api/property-visits').some((p) => p.get('filter[scheduled_at_min]') === '2026-11-16T00:00:00Z')).toBe(true));
  });

  it('sans `crm.assign`, la semaine n’offre pas le filtre « Agent » et ne lit pas les agents, comme la liste', async () => {
    etat.assigner = false;
    navigationDeTest.reinitialiser('affichage=semaine');
    monter();
    await screen.findByTestId('calendar-event-pill-visit-41');
    expect(screen.queryByRole('button', { name: /^Agent/ })).toBeNull();
    await api.auRepos();
    expect(api.appels().some((a) => a.chemin.startsWith('/api/agencies/'))).toBe(false);
  });

  it('le filtre « Statut » de la semaine part en `filter[status]`', async () => {
    navigationDeTest.reinitialiser('affichage=semaine&statut=requested');
    monter();
    await waitFor(() => expect(lectures('/api/property-visits').some((p) => p.get('filter[status]') === 'scheduled')).toBe(true));
  });
});

describe('le filtre « Statut » (mode par le temps)', () => {
  it('sous « À confirmer », il montre « Demandées », fixé par l’onglet, sans menu', async () => {
    navigationDeTest.reinitialiser('vue=to_confirm');
    monter();
    const fixe = await screen.findByText('Demandées', { selector: '[data-slot="statut-fixe"] span' });
    expect(fixe.closest('button')).toBeNull();
  });

  it('sous « Aujourd’hui », « Confirmées » ajoute `filter[status]=confirmed` à la borne du jour, et « Aujourd’hui » ne compte plus', async () => {
    navigationDeTest.reinitialiser('');
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: /Statut\s*Tous/ }));
    await user.click(await screen.findByRole('button', { name: 'Confirmées' }));
    expect(url().get('statut')).toBe('confirmed');
    await waitFor(() => expect(lectures('/api/property-visits').some((p) => p.get('filter[day]') === '2026-11-10' && p.get('filter[status]') === 'confirmed')).toBe(true));
    expect(within(screen.getByRole('tablist', { name: 'Vues des visites' })).getByRole('tab', { name: /Aujourd/ })).toHaveTextContent(/^Aujourd’hui$/);
  });
});

describe('AC2 — le filtre « Type » de « Toutes »', () => {
  it('« Type = Virtuelle » lit chaque onglet en `filter[type]=virtual`, et « Toutes » n’annonce plus son compte global', async () => {
    navigationDeTest.reinitialiser('vue=status&tab=all');
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: /Type\s*Tous/ }));
    await user.click(await screen.findByRole('button', { name: 'Virtuelle' }));

    expect(url().get('type')).toBe('virtual');
    await waitFor(() => expect(lectures('/api/property-visits').filter((p) => p.get('filter[type]') === 'virtual').length).toBeGreaterThanOrEqual(5));
    expect(within(screen.getByRole('tablist', { name: 'Vues des visites' })).getByRole('tab', { name: /Toutes/ })).toHaveTextContent(/^Toutes$/);
    // L'onglet ouvert ne garde que la visite virtuelle.
    expect(await screen.findByText('Studio Mermoz')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Villa Ngor')).toBeNull());
  });

  it('au téléphone, un `?type=` venu du bureau ne filtre pas (aucun contrôle ne le montrerait)', async () => {
    const media = await import('@/hooks/useMatchesMedia');
    const espion = vi.spyOn(media, 'useMatchesMedia').mockImplementation((q: string) => q.includes('48rem'));
    navigationDeTest.reinitialiser('vue=status&tab=all&type=virtual');
    monter();
    await screen.findByText('Villa Ngor');
    await api.auRepos();
    expect(lectures('/api/property-visits').some((p) => p.get('filter[type]'))).toBe(false);
    espion.mockRestore();
  });

  it('revenir à une vue par le temps retire le type de l’URL', async () => {
    navigationDeTest.reinitialiser('vue=status&tab=all&type=virtual');
    const user = userEvent.setup();
    monter();
    await user.click(within(screen.getByRole('tablist', { name: 'Vues des visites' })).getByRole('tab', { name: /Plus tard/ }));
    expect(url().get('type')).toBeNull();
  });
});
