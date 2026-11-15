import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AChiffrer, JourneeDuPrestataire, ResumeDuPrestataire } from '../AccueilDuPrestataire';

/**
 * TCK-2625 — l'accueil du prestataire. La couche RÉSEAU est doublée (`apiRequest`), pas les hooks :
 * AC5 se prouve sur ce que la fiche sert et sur les requêtes envoyées.
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { path: string; method: string; body?: unknown }[],
  aAccepter: [] as unknown[],
  semaine: [] as unknown[],
  aChiffrer: [] as unknown[],
  fiches: {} as Record<number, Record<string, unknown>>,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 18, roles: ['service_provider'] } }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string, options: { method?: string; body?: unknown } = {}) => {
      const method = options.method ?? 'GET';
      const lu = decodeURIComponent(path);
      reseau.appels.push({ path: lu, method, body: options.body });
      const page = (data: unknown[]) => ({ data, meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 } });
      if (method !== 'GET') return { data: {} };
      if (lu.startsWith('/api/maintenance-requests?')) {
        if (lu.includes('filter[file]=a_accepter')) return page(reseau.aAccepter);
        if (lu.includes('filter[scheduled_from]=')) return page(reseau.semaine);
        if (lu.includes('filter[status]=quote_requested')) return page(reseau.aChiffrer);
      }
      const fiche = lu.match(/^\/api\/maintenance-requests\/(\d+)(\?|$)/);
      if (fiche) return { data: reseau.fiches[Number(fiche[1])] };
      throw new Error(`requête inattendue : ${method} ${lu}`);
    }),
  };
});

const BIEN = { id: 7, title: 'Appartement F2', slug: null, location: { quarter: 'Grand Yoff' } };

/** Acceptée, planifiée aujourd'hui (mardi 10 novembre) à 09:30 à Dakar. */
const ACCEPTEE = { id: 61, title: 'Fuite sous évier', status: 'assigned', accepted_at: '2026-11-09T10:00:00Z', file: 'en_cours', scheduled_at: '2026-11-10T09:30:00Z', property: BIEN };
/** Seulement assignée, aujourd'hui à 14:00 : la file `a_accepter`. */
const ASSIGNEE = { id: 62, title: 'Prise électrique à remplacer', status: 'assigned', accepted_at: null, file: 'a_accepter', scheduled_at: '2026-11-10T14:00:00Z', property: { ...BIEN, id: 8, title: 'Studio meublé', location: { quarter: 'Mermoz' } } };
/** Jeudi, acceptée. */
const JEUDI = { id: 63, title: 'Robinet de cuisine', status: 'assigned', accepted_at: '2026-11-09T10:00:00Z', file: 'en_cours', scheduled_at: '2026-11-12T08:30:00Z', property: { ...BIEN, id: 9, title: 'Villa blanche', location: { quarter: 'Yoff' } } };
/** Rendue ce matin : ni aujourd'hui ni à venir. */
const RENDUE = { id: 64, title: 'Serrure changée', status: 'completed', accepted_at: '2026-11-09T10:00:00Z', file: 'a_confirmer', scheduled_at: '2026-11-10T07:00:00Z', property: BIEN };

const ACCES = { street: 'Rue GY-112', quarter: 'Grand Yoff', city: 'Dakar', latitude: null, longitude: null, requester_phone: '77 123 45 67', instructions: null };

function fiche(id: number, surcharge: Record<string, unknown> = {}) {
  return { id, status: 'assigned', abilities: { transitions: ['in_progress', 'cancelled'], can_complete: false }, access: ACCES, ...surcharge };
}

function monter(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

const telephone = () => document.querySelector('[data-slot="aujourdhui-telephone"]') as HTMLElement | null;
const bureau = () => document.querySelector('[data-slot="aujourdhui-bureau"]') as HTMLElement | null;

async function cartes() {
  return waitFor(() => {
    const l = [...document.querySelectorAll<HTMLElement>('[data-slot="aujourdhui-telephone"] [data-slot="carte-du-creneau"]')];
    if (l.length === 0) throw new Error('aucune carte');
    return l;
  });
}

describe('Accueil du prestataire — TCK-2625', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    reseau.appels = [];
    reseau.aAccepter = [];
    reseau.semaine = [ACCEPTEE, ASSIGNEE, JEUDI, RENDUE];
    reseau.aChiffrer = [];
    // La fiche du créneau NON accepté porte quand même une adresse et un téléphone : la garde est celle
    // du front (la fiche n'est pas lue), pas l'absence de donnée.
    reseau.fiches = { 61: fiche(61), 62: fiche(62, { access: { ...ACCES, street: 'Rue MZ-9', requester_phone: '76 540 22 18' } }), 63: fiche(63) };
  });

  it('AC5 — acceptée à 09:30 : l’heure, l’adresse, le téléphone et « Commencer » ; seulement assignée : ni adresse ni téléphone dans le DOM', async () => {
    monter(<JourneeDuPrestataire />);
    const [premiere, seconde] = await cartes();
    expect(within(premiere).getByText('09:30')).toBeTruthy();
    expect(await within(premiere).findByText(/Rue GY-112/)).toBeTruthy();
    expect(within(premiere).getByText('77 123 45 67')).toBeTruthy();
    expect(within(premiere).getByRole('button', { name: 'Commencer' })).toBeTruthy();

    expect(within(seconde).getByText('14:00')).toBeTruthy();
    expect(within(seconde).getByText('Adresse et contact du locataire visibles après acceptation')).toBeTruthy();
    expect(within(seconde).queryByRole('button', { name: 'Commencer' })).toBeNull();
    expect(within(seconde).getByRole('link', { name: 'Répondre' }).getAttribute('href')).toBe('/app/maintenance');
    expect(document.body.textContent).not.toContain('Rue MZ-9');
    expect(document.body.textContent).not.toContain('76 540 22 18');
    expect(reseau.appels.some((a) => /^\/api\/maintenance-requests\/62(\?|$)/.test(a.path))).toBe(false);
  });

  it('« Aujourd’hui » ne porte que le jour, sans ce qui est rendu ; « À venir » le reste de la semaine', async () => {
    monter(<JourneeDuPrestataire />);
    await cartes();
    expect(within(telephone()!).queryByText('Serrure changée')).toBeNull();
    expect(within(telephone()!).queryByText('Robinet de cuisine')).toBeNull();
    const aVenir = document.querySelector('[data-slot="a-venir"]') as HTMLElement;
    expect(within(aVenir).getByText('Robinet de cuisine')).toBeTruthy();
    expect(within(aVenir).getByText(/jeu\. 12 nov\. · 08:30/i)).toBeTruthy();
    expect(within(aVenir).queryByText('Fuite sous évier')).toBeNull();
    expect(document.body.textContent).not.toContain('Serrure changée');
  });

  it('« Commencer » passe la demande en cours par le geste de la fiche (PUT …/status in_progress)', async () => {
    monter(<JourneeDuPrestataire />);
    const [premiere] = await cartes();
    fireEvent.click(await within(premiere).findByRole('button', { name: 'Commencer' }));
    await waitFor(() => expect(reseau.appels.some((a) => a.method === 'PUT' && a.path === '/api/maintenance-requests/61/status')).toBe(true));
    const appel = reseau.appels.find((a) => a.method === 'PUT');
    expect(JSON.stringify(appel?.body)).toContain('in_progress');
  });

  it('un geste interdit n’est pas proposé : sans `in_progress` dans la fiche, pas de « Commencer »', async () => {
    reseau.fiches[61] = fiche(61, { abilities: { transitions: ['cancelled'], can_complete: false } });
    monter(<JourneeDuPrestataire />);
    const [premiere] = await cartes();
    await within(premiere).findByText(/Rue GY-112/);
    expect(within(premiere).queryByRole('button', { name: 'Commencer' })).toBeNull();
  });

  it('en cours et `can_complete` : « Terminé » mène à la fiche (le rapport de fin), sans « Commencer »', async () => {
    reseau.semaine = [{ ...ACCEPTEE, status: 'in_progress' }];
    reseau.fiches[61] = fiche(61, { status: 'in_progress', abilities: { transitions: ['completed'], can_complete: true } });
    monter(<JourneeDuPrestataire />);
    const [premiere] = await cartes();
    const termine = await within(premiere).findByRole('link', { name: 'Terminé' });
    expect(termine.getAttribute('href')).toBe('/app/maintenance/61');
    expect(within(premiere).queryByRole('button', { name: 'Commencer' })).toBeNull();
  });

  it('au bureau, une rangée par passage avec son statut ; l’adresse seulement pour l’acceptée', async () => {
    monter(<JourneeDuPrestataire />);
    await cartes();
    const rangees = await waitFor(() => {
      const l = [...bureau()!.querySelectorAll<HTMLElement>('[data-slot="rangee-du-creneau"]')];
      if (l.length !== 2) throw new Error('rangées');
      return l;
    });
    expect(await within(rangees[0]).findByText(/Rue GY-112/)).toBeTruthy();
    expect(within(rangees[0]).getByText('À commencer')).toBeTruthy();
    expect(within(rangees[1]).getByText('À accepter')).toBeTruthy();
    expect(rangees[1].textContent).not.toContain('Rue MZ-9');
  });

  it('la semaine est SA semaine (assigned_to) ; « N interventions à accepter » mène à la file', async () => {
    reseau.aAccepter = [ASSIGNEE, { ...ASSIGNEE, id: 70, scheduled_at: null }];
    monter(<JourneeDuPrestataire />);
    await cartes();
    const lien = await screen.findByRole('link', { name: '2 interventions à accepter' });
    expect(lien.getAttribute('href')).toBe('/app/maintenance');
    const semaine = reseau.appels.find((a) => a.path.includes('filter[scheduled_from]='));
    expect(semaine?.path).toMatch(/filter\[assigned_to\]=18/);
  });

  it('rien aujourd’hui : « Rien de prévu aujourd’hui », jamais « Explorez les biens » (AC6)', async () => {
    reseau.semaine = [JEUDI];
    monter(<JourneeDuPrestataire />);
    expect(await screen.findByText('Rien de prévu aujourd’hui')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Explorez les biens/);
  });

  it('le résumé compte aujourd’hui et la suite de la semaine', async () => {
    monter(<ResumeDuPrestataire jour="Mardi 10 novembre" />);
    expect(await screen.findByText('Mardi 10 novembre · 2 interventions aujourd’hui, 1 à venir cette semaine')).toBeTruthy();
  });

  it('« À chiffrer » : SES devis demandés, filtrés par l’API ; « Chiffrer » mène à la fiche', async () => {
    reseau.aChiffrer = [{ id: 80, title: 'Infiltration au plafond', status: 'quote_requested', accepted_at: null, waiting_since: '2026-11-09T09:00:00Z', created_at: '2026-11-08T09:00:00Z', scheduled_at: null, property: { ...BIEN, title: 'Appartement standing', location: { quarter: 'Plateau' } } }];
    monter(<AChiffrer />);
    expect(await screen.findByText('Infiltration au plafond')).toBeTruthy();
    expect(screen.getByText('Appartement standing · Plateau · demandé hier')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chiffrer' }).getAttribute('href')).toBe('/app/maintenance/80');
    const lu = reseau.appels.find((a) => a.path.includes('filter[status]=quote_requested'));
    expect(lu?.path).toMatch(/filter\[assigned_to\]=18/);
    expect(lu?.path).toContain('fields[maintenance_requests]=');
  });

  it('« À chiffrer » vide : le bloc ne rend rien', async () => {
    const { container } = monter(<AChiffrer />);
    await waitFor(() => expect(reseau.appels.some((a) => a.path.includes('quote_requested'))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-slot="a-chiffrer"]')).toBeNull();
  });
});
