/**
 * TCK-2596 — « Ma journée », l'accueil de l'agent. Le réseau est doublé au niveau d'`apiRequest` (les
 * hooks de requête et de mutation tournent pour de vrai, sur un `QueryClient` de test) : on lit les
 * requêtes émises avec leurs filtres et les corps envoyés, comme au relevé réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { lecturesHorsFields, oublierLesLectures } from '@/test/visites-comme-l-api';
import type { AgentTask } from '@/types/agent-crm';
import type { PropertyVisit } from '@/types/visit';

import { MaJournee } from '../MaJournee';

const etat = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  vide: false,
  /** r2 — chaque source rend un numéro qu'on ne peut pas joindre (masqué, ou hors E.164). */
  injoignable: false,
  /** TCK-2596 AC2 — le compte des prospects en panne : la case dit « — », jamais `pipeline_total`. */
  prospectsEnPanne: false,
  titre: null as string | null,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'], agency_id: 3 }, token: 'jeton' }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => false }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({
  DeclarerEnTete: ({ titre }: { titre?: string }) => {
    etat.titre = titre ?? null;
    return null;
  },
}));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: ({ jour }: { jour?: string }) => <div data-testid="planifier">{jour}</div> }));

const ADRESSE = { line: '12, rue Carnot', neighborhood: 'Dakar-Plateau', city: 'Dakar', latitude: 14.6681, longitude: -17.4318 };
const visite = (o: Partial<PropertyVisit> & { id: number }) =>
  ({
    status: 'confirmed',
    type: 'in_person',
    duration_minutes: 30,
    agent_id: 3,
    property: { id: 51, title: 'Local commercial', slug: 'l', cover_url: null, address: ADRESSE },
    ...o,
  }) as PropertyVisit;
const visiteur = (name: string) => ({ name, phone: '+221789429352', kind: 'customer', visits_on_property: 1 }) as PropertyVisit['visitor_display'];

const PLATEAU = visite({ id: 2291, scheduled_at: '2026-11-10T10:57:00Z', visitor_display: visiteur('Abdoulaye Cissé') });
const TERRAIN = visite({
  id: 2294,
  scheduled_at: '2026-11-10T16:55:00Z',
  duration_minutes: 45,
  property: { id: 52, title: 'Terrain 300 m² à Dakar-Plateau', slug: 't', cover_url: null, address: ADRESSE },
  visitor_display: visiteur('Rokhaya Mbaye'),
});
const LIBERTE = visite({
  id: 2280,
  status: 'completed',
  scheduled_at: '2026-11-09T17:00:00Z',
  property: { id: 32, title: 'Belle villa avec piscine', slug: 'v', cover_url: null, address: { ...ADRESSE, neighborhood: 'Liberté 6' } },
  visitor_display: visiteur('Yacine Diouf'),
});
const tache = (o: Partial<AgentTask> & { id: number; title: string }) => ({ status: 'open', priority: 'medium', assignee: null, taskable: null, due_at: null, ...o }) as AgentTask;
const TACHES: AgentTask[] = [
  tache({ id: 1, title: 'Vérifier le titre foncier', due_at: '2026-10-14T09:00:00Z', taskable: { type: 'property', id: 9, label: 'Terrain · Diourbel', phone: null } }),
  tache({ id: 2, title: 'Faire signer l’état des lieux d’entrée', due_at: '2026-10-17T09:00:00Z', taskable: { type: 'property', id: 8, label: 'F2 Grand Yoff', phone: null } }),
  tache({ id: 3, title: 'Relancer Yacine (offre villa)', due_at: '2026-11-10T18:00:00Z', taskable: { type: 'customer', id: 4, label: 'Yacine Diouf', phone: '+221706190713' } }),
];
/** La semaine de la bande (r1) : une visite faite le 11, une annulée le 13, une demande par tranche le 14. */
const FAITE_LE_11 = visite({ id: 2300, status: 'completed', scheduled_at: '2026-11-11T11:00:00Z', visitor_display: visiteur('Awa Ndiaye') });
const ANNULEE_LE_13 = visite({ id: 2301, status: 'cancelled', scheduled_at: '2026-11-13T09:00:00Z' });
const TRANCHE_LE_14 = visite({ id: 2302, status: 'scheduled', scheduled_at: '2026-11-14T09:00:00Z', preferred_window: 'morning' });
/** r2 — un numéro masqué par `visitor_display` (`VisitorDisplay`), et deux numéros hors E.164. */
const MASQUE = '+221 77 *** ** 52';
const injoignable = (v: PropertyVisit) => ({ ...v, visitor_display: { ...v.visitor_display!, phone: MASQUE } });
const MOUHAMED = { id: 41, name: 'Mouhamed Dieng', phone: '+221770000001', created_at: '2026-11-02T09:00:00Z', property: { id: 7, title: 'Pièce indépendante', slug: 'p' } };

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      etat.appels.push({ chemin, methode, corps: options.body });
      if (methode !== 'GET') return { data: {} };
      const [route, qs] = chemin.split('?');
      const p = new URLSearchParams(qs ?? '');
      // TCK-2797 — les visites servies comme l'API : les seules clés de `fields[property_visits]`.
      const { commeLApi: servir } = await import('@/test/visites-comme-l-api');
      const page = (data: unknown[], total = data.length) => servir(chemin, { data, meta: { total, per_page: 30, current_page: 1, last_page: 1 } });
      if (route === '/api/property-visits') {
        if (etat.vide) return page([]);
        if (p.get('filter[to_close]')) return page([LIBERTE]);
        if (p.get('filter[scheduled_at_min]')) return page([PLATEAU, TERRAIN, FAITE_LE_11, ANNULEE_LE_13, TRANCHE_LE_14]);
        const duJour = p.get('filter[day]') === '2026-11-10' ? [TERRAIN, PLATEAU] : [];
        return page(etat.injoignable ? duJour.map(injoignable) : duJour);
      }
      if (route === '/api/tasks') {
        if (etat.vide) return page([]);
        return page(etat.injoignable ? TACHES.map((t) => (t.taskable?.type === 'customer' ? { ...t, taskable: { ...t.taskable, phone: '706190713' } } : t)) : TACHES);
      }
      if (route === '/api/contact-leads') return page(etat.vide ? [] : [etat.injoignable ? { ...MOUHAMED, phone: '77 000 00 01' } : MOUHAMED]);
      // TCK-2596 AC2 — « Prospects » compte sa liste (référent = moi, étapes vivantes) : 7, pas les 38 de `pipeline_total`.
      if (route === '/api/customers') {
        if (p.get('filter[stage_group]') !== 'active') return page([{ id: 1 }], 6);
        if (etat.prospectsEnPanne) throw new Error('panne');
        return page([{ id: 1 }], 7);
      }
      if (route === '/api/calendar') {
        return {
          data: etat.vide
            ? []
            : [
                { id: 2291, type: 'visit', title: 'v', start: '2026-11-10 10:57:00', end: null, status: 'confirmed', all_day: false, resource_url: '' },
                { id: 3, type: 'task', title: 'Relancer Yacine', start: '2026-11-10 18:00:00', end: null, status: 'open', all_day: false, resource_url: '' },
                { id: 5, type: 'task', title: 'Préparer le bail de Mariama', start: '2026-11-12 14:00:00', end: null, status: 'open', all_day: false, resource_url: '' },
                // L'agenda rendrait aussi des visites : la bande ne les compte plus (r1), elles ne s'ajoutent pas.
                { id: 2299, type: 'visit', title: 'v', start: '2026-11-13 15:00:00', end: null, status: 'confirmed', all_day: false, resource_url: '' },
              ],
        };
      }
      return page([]);
    }),
  };
});

/** Mardi 10 novembre 2026, 10:12 à Dakar. */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');
const CHIFFRES = { properties_managed: 25, pipeline_total: 38, tasks_open: 10, tasks_overdue: 2, commissions_month: 0 };

function monter(bandeau?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<MaJournee chiffres={CHIFFRES} bandeau={bandeau} />)}</QueryClientProvider>);
}

const lectures = (route: string) =>
  etat.appels.filter((a) => a.methode === 'GET' && a.chemin.split('?')[0] === route).map((a) => new URLSearchParams(a.chemin.split('?')[1] ?? ''));
const telephone = () => document.querySelector<HTMLElement>('[data-slot="journee-telephone"]')!;
const bureau = () => document.querySelector<HTMLElement>('[data-slot="journee-bureau"]')!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { appels: [], vide: false, injoignable: false, prospectsEnPanne: false, titre: null });
  oublierLesLectures();
});
afterEach(() => {
  vi.useRealTimers();
  // TCK-2797 — l'écran ne lit aucune clé de visite qu'il ne demande pas.
  expect(lecturesHorsFields()).toEqual([]);
});

describe('les sources composées', () => {
  it('chaque lecture part avec ses filtres côté serveur', async () => {
    monter();
    await waitFor(() => expect(lectures('/api/calendar')).toHaveLength(1));

    const visites = lectures('/api/property-visits');
    const duJour = visites.find((p) => p.get('filter[day]'));
    expect(duJour?.get('filter[day]')).toBe('2026-11-10');
    expect(duJour?.get('filter[mine]')).toBe('1');
    expect(duJour?.get('include')).toContain('customer');
    const aClore = visites.find((p) => p.get('filter[to_close]'));
    expect(aClore?.get('filter[mine]')).toBe('1');

    const [taches] = lectures('/api/tasks');
    expect(taches?.get('filter[assigned_to]')).toBe('me');
    expect(taches?.get('filter[due]')).toBe('overdue,today');
    expect(taches?.get('fields[tasks]')).toBeTruthy();

    const [demandes] = lectures('/api/contact-leads');
    expect(demandes?.get('filter[mine]')).toBe('1');
    expect(demandes?.get('filter[handled]')).toBe('0');
    // L'heure pleine moins 24 h : la borne ne change pas à chaque minute.
    expect(demandes?.get('filter[created_at_max]')).toBe('2026-11-09T10:00:00Z');

    const relances = lectures('/api/customers').find((q) => q.get('filter[follow_up]') === '1');
    expect(relances?.get('filter[follow_up]')).toBe('1');
    expect(relances?.get('filter[referent]')).toBe('me');

    const [agenda] = lectures('/api/calendar');
    expect([agenda?.get('start_date'), agenda?.get('end_date'), agenda?.get('mine')]).toEqual(['2026-11-09', '2026-11-15', '1']);
    // r1 de faf3f10da — l'agenda ne sert plus que les tâches ; les visites de la semaine viennent de
    // la source de la chronologie, mes visites bornées à la semaine de Dakar, colonnes de la bande seules.
    expect(agenda?.getAll('types[]')).toEqual(['task']);
    await waitFor(() => expect(lectures('/api/property-visits').some((p) => p.get('filter[scheduled_at_min]'))).toBe(true));
    const semaine = lectures('/api/property-visits').find((p) => p.get('filter[scheduled_at_min]'))!;
    expect([semaine.get('filter[scheduled_at_min]'), semaine.get('filter[scheduled_at_max]'), semaine.get('filter[mine]')]).toEqual(['2026-11-09T00:00:00Z', '2026-11-15T23:59:59Z', '1']);
    expect(semaine.get('fields[property_visits]')).toBe('id,scheduled_at,status,preferred_window');
    expect(semaine.get('include')).toBeNull();
  });
});

describe('r1 de faf3f10da — la bande dit ce que la chronologie montre', () => {
  it('une visite faite le 11 compte dans la bande ; une annulée et une demande par tranche non ; les visites de l’agenda ne s’ajoutent pas', async () => {
    monter();
    const bande = within(telephone().querySelector<HTMLElement>('[data-slot="bande-de-semaine"]')!);
    await waitFor(() => expect(bande.getByRole('button', { name: 'Mercredi 11 novembre : 1 visite' })).toBeInTheDocument());
    expect(bande.getByRole('button', { name: 'Mardi 10 novembre : 2 visites · 1 tâche' })).toBeInTheDocument();
    expect(bande.getByRole('button', { name: 'Vendredi 13 novembre : Libre' })).toBeInTheDocument();
    expect(bande.getByRole('button', { name: 'Samedi 14 novembre : Libre' })).toBeInTheDocument();
    // Le bureau lit le même résumé.
    expect(within(bureau()).getByRole('button', { name: 'Mercredi 11 novembre : 1 visite' })).toBeInTheDocument();
  });
});

describe('r2 de faf3f10da — WhatsApp seulement vers un numéro joignable (E.164)', () => {
  const liensWhatsApp = (racine: HTMLElement) => [...racine.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"]')];

  it('témoin — numéros joignables : la demande, la visite et la tâche ont chacune leur WhatsApp', async () => {
    monter();
    const t = telephone();
    await waitFor(() => expect(within(t).getByRole('link', { name: 'Écrire à Mouhamed Dieng sur WhatsApp' })).toBeInTheDocument());
    expect(within(t).getByRole('link', { name: 'Écrire à Abdoulaye Cissé sur WhatsApp' })).toBeInTheDocument();
    expect(within(t).getByRole('link', { name: 'Écrire à Yacine Diouf sur WhatsApp' })).toBeInTheDocument();
    // Le sélecteur des cas injoignables voit bien ces liens : son « aucun » n'est pas vide par construction.
    expect(liensWhatsApp(t).length).toBeGreaterThanOrEqual(3);
  });

  it('la demande dont le numéro n’est pas E.164 : pas de WhatsApp, « Ouvrir » mène à la demande', async () => {
    etat.injoignable = true;
    monter();
    const bloc = await waitFor(() => {
      const b = telephone().querySelector<HTMLElement>('[data-slot="a-regler"]');
      expect(b).not.toBeNull();
      return b!;
    });
    await waitFor(() => expect(within(bloc).getByText('Mouhamed Dieng attend depuis 8 j')).toBeInTheDocument());
    expect(within(bloc).queryByRole('link', { name: /Mouhamed Dieng sur WhatsApp/ })).toBeNull();
    expect(within(bloc).getByRole('link', { name: 'Ouvrir' })).toHaveAttribute('href', '/app/leads?lead=41');
  });

  it('la visite au numéro masqué et la tâche d’un client hors E.164 : ni WhatsApp ni Appeler dans la chronologie', async () => {
    etat.injoignable = true;
    monter();
    const chrono = await waitFor(() => {
      const c = telephone().querySelector<HTMLElement>('[data-slot="chronologie"]');
      expect(c?.querySelectorAll('[data-slot="carte-visite"]')).toHaveLength(2);
      expect(c?.querySelector('[data-slot="carte-tache"]')).not.toBeNull();
      return c!;
    });
    expect(liensWhatsApp(chrono)).toEqual([]);
    expect(chrono.querySelector('a[href^="tel:"]')).toBeNull();
    // Et nulle part ailleurs à l'écran, au téléphone comme au bureau.
    expect(liensWhatsApp(telephone())).toEqual([]);
    expect(liensWhatsApp(bureau())).toEqual([]);
  });
});

describe('le téléphone', () => {
  it('AC1 — « À régler » d’abord (compte rendu, demande qui attend, deux tâches en retard), puis la visite de 10:57 et son adresse', async () => {
    monter();
    const t = telephone();
    const bloc = await waitFor(() => {
      const b = t.querySelector<HTMLElement>('[data-slot="a-regler"]');
      expect(b).not.toBeNull();
      return b!;
    });
    await waitFor(() => expect(within(bloc).getByText('Mouhamed Dieng attend depuis 8 j')).toBeInTheDocument());
    expect(within(bloc).getByText('Compte rendu à faire')).toBeInTheDocument();
    expect(within(bloc).getByText(/Belle villa avec piscine · Yacine Diouf, hier 17:00/)).toBeInTheDocument();
    expect(within(bloc).getByRole('link', { name: 'Faire' })).toHaveAttribute('href', '/app/visits/2280');
    // AC3 — la tâche nomme son bien, et son retard sur sa propre ligne.
    expect(within(bloc).getByText('F2 Grand Yoff')).toBeInTheDocument();
    expect(within(bloc).getByText('En retard depuis le 17 oct.')).toBeInTheDocument();
    expect(within(t).getByText('À régler').nextElementSibling).toHaveTextContent('4');

    // « À régler » précède la chronologie dans le document.
    const chrono = t.querySelector('[data-slot="chronologie"]')!;
    expect(bloc.compareDocumentPosition(chrono) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(chrono as HTMLElement).getByText('12, rue Carnot · Abdoulaye Cissé')).toBeInTheDocument();
  });

  it('la chronologie : « maintenant », puis 10:57, le temps libre, 16:55, la tâche de 18:00', async () => {
    monter();
    const chrono = await waitFor(() => {
      const c = telephone().querySelector<HTMLElement>('[data-slot="chronologie"]');
      expect(c?.querySelectorAll('[data-slot="carte-visite"]')).toHaveLength(2);
      return c!;
    });
    const lignes = [...chrono.children].map((li) => li.textContent);
    expect(lignes[0]).toMatch(/^10:12.*maintenant$/);
    expect(lignes[1]).toMatch(/^10:57/);
    expect(lignes[2]).toMatch(/^11:30.*Libre jusqu’à 16:55/);
    expect(lignes[3]).toMatch(/^16:55/);
    expect(lignes[4]).toMatch(/^18:00.*Relancer Yacine/);
    // Le quartier suit le titre, sauf quand le titre le dit déjà.
    expect(within(chrono).getByRole('link', { name: 'Local commercial · Dakar-Plateau' })).toHaveAttribute('href', '/app/visits/2291');
    expect(within(chrono).getByRole('link', { name: 'Terrain 300 m² à Dakar-Plateau' })).toBeInTheDocument();
    expect(within(chrono).getAllByRole('link', { name: 'Itinéraire' })[0]).toHaveAttribute('href', expect.stringContaining('14.6681,-17.4318'));
    expect(within(chrono).getByRole('link', { name: 'Appeler Abdoulaye Cissé' })).toHaveAttribute('href', 'tel:+221789429352');
  });

  it('« Reporter · Demain » envoie le lendemain 09:00 de Dakar ; cocher envoie « done »', async () => {
    monter();
    const bloc = await waitFor(() => {
      const b = telephone().querySelector<HTMLElement>('[data-slot="a-regler"]');
      expect(b).not.toBeNull();
      return b!;
    });
    await waitFor(() => expect(within(bloc).getByText('Vérifier le titre foncier')).toBeInTheDocument());

    fireEvent.click(within(bloc).getByRole('button', { name: 'Reporter : Vérifier le titre foncier' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Demain' }));
    await waitFor(() => expect(etat.appels.some((a) => a.methode === 'PATCH')).toBe(true));
    expect(etat.appels.find((a) => a.methode === 'PATCH')).toMatchObject({ chemin: '/api/tasks/1', corps: { due_at: '2026-11-11T09:00:00Z' } });

    fireEvent.click(within(bloc).getByRole('checkbox', { name: 'Marquer faite : Faire signer l’état des lieux d’entrée' }));
    await waitFor(() => expect(etat.appels.filter((a) => a.methode === 'PATCH')).toHaveLength(2));
    expect(etat.appels.filter((a) => a.methode === 'PATCH')[1]).toMatchObject({ chemin: '/api/tasks/2', corps: { status: 'done' } });
  });

  it('AC4 — toucher le jour suivant relit la chronologie de ce jour (`filter[day]`) et y montre ses tâches de l’agenda', async () => {
    monter();
    await waitFor(() => expect(lectures('/api/calendar')).toHaveLength(1));
    fireEvent.click(within(telephone()).getByRole('button', { name: /^Jeudi 12 novembre/ }));
    await waitFor(() => expect(lectures('/api/property-visits').some((p) => p.get('filter[day]') === '2026-11-12')).toBe(true));
    await waitFor(() => expect(within(telephone()).getByText('Préparer le bail de Mariama')).toBeInTheDocument());
    // Un autre jour : ni « maintenant », ni « À régler ».
    expect(telephone().querySelector('[data-slot="maintenant"]')).toBeNull();
    expect(telephone().querySelector('[data-slot="a-regler"]')).toBeNull();
    expect(etat.titre).toBe('Jeudi 12 novembre');
  });

  it('AC2 — les quatre chiffres en liens vers leur liste, et le rapport du mois', async () => {
    monter();
    const chiffres = telephone().querySelector<HTMLElement>('[data-slot="mes-chiffres"]')!;
    const liens = within(chiffres).getAllByRole('link');
    expect(liens.map((l) => l.getAttribute('href'))).toEqual([
      '/app/properties?only_mine=1',
      '/app/customers?vue=mes-clients&stage_group=active',
      '/app/tasks?filter[due]=overdue,today,upcoming,none&filter[assigned_to]=me',
      '/app/commissions',
      '/app/reports',
    ]);
    expect(liens[0]).toHaveAccessibleName('Biens gérés : 25, ouvrir Mes biens');
    await waitFor(() => expect(within(chiffres).getByText('6 à relancer')).toBeInTheDocument());
    // Le chiffre est celui de la liste qu'il ouvre : `meta.total` de filter[referent]=me&filter[stage_group]=active.
    await waitFor(() => expect(liens[1]).toHaveAccessibleName('Prospects : 7, ouvrir Mes prospects actifs'));
    const compte = lectures('/api/customers').find((q) => q.get('filter[stage_group]') === 'active');
    expect(compte?.get('filter[referent]')).toBe('me');
    expect(compte?.get('per_page')).toBe('1');
  });

  it('AC2 — pipeline_total (38) n’est jamais rendu : ni au chargement, ni en panne de la lecture', async () => {
    etat.prospectsEnPanne = true;
    monter();
    const chiffres = telephone().querySelector<HTMLElement>('[data-slot="mes-chiffres"]')!;
    const prospects = () => within(chiffres).getAllByRole('link')[1];
    // Au chargement : la valeur absente de la case, comme ses voisines sans donnée.
    expect(prospects()).toHaveAccessibleName('Prospects : —, ouvrir Mes prospects actifs');
    // La lecture a échoué (comme « à relancer » en panne : rien d'inventé).
    await waitFor(() => expect(lectures('/api/customers').some((q) => q.get('filter[stage_group]') === 'active')).toBe(true));
    await waitFor(() => expect(within(chiffres).getByText('6 à relancer')).toBeInTheDocument());
    expect(prospects()).toHaveAccessibleName('Prospects : —, ouvrir Mes prospects actifs');
    expect(chiffres.textContent).not.toContain('38');
    expect(within(chiffres).getByText('dont 2 en retard')).toBeInTheDocument();
  });

  it('le bandeau des brouillons reste en tête', () => {
    monter(<p>Brouillon repris</p>);
    expect(screen.getByText('Brouillon repris')).toBeInTheDocument();
  });

  it('journée libre : « Rien de prévu aujourd’hui. » et les prospects à relancer', async () => {
    etat.vide = true;
    monter();
    await waitFor(() => expect(within(telephone()).getByText('Rien de prévu aujourd’hui.')).toBeInTheDocument());
    expect(within(telephone()).getByRole('link', { name: /6 prospects à relancer/ })).toHaveAttribute('href', '/app/customers?vue=a-relancer');
  });
});

describe('le bureau', () => {
  it('AC5 — la chronologie et « À régler » côte à côte dès xl ; le sous-titre compte la journée', async () => {
    monter();
    const b = bureau();
    await waitFor(() => expect(b.querySelector('[data-slot="a-regler"]')).not.toBeNull());
    const grille = b.querySelector('[data-slot="chronologie"]')!.closest('.grid')!;
    expect(grille.className).toContain('xl:grid-cols-');
    expect(within(b).getByText('2 visites · 1 tâche · 4 choses à régler')).toBeInTheDocument();
    // Un autre jour sans tâche : le compte nul se tait (« 1 tâche », pas « 0 visite »).
    fireEvent.click(within(b).getByRole('button', { name: /^Jeudi 12 novembre/ }));
    await waitFor(() => expect(within(b).getAllByText('1 tâche').some((e) => e.tagName === 'P')).toBe(true));
    expect(within(b).getByRole('link', { name: 'Voir le rapport du mois' })).toHaveAttribute('href', '/app/reports');
  });

  it('« Jour suivant » relit les visites du lendemain', async () => {
    monter();
    fireEvent.click(within(bureau()).getByRole('button', { name: 'Jour suivant' }));
    await waitFor(() => expect(lectures('/api/property-visits').some((p) => p.get('filter[day]') === '2026-11-11')).toBe(true));
  });
});
