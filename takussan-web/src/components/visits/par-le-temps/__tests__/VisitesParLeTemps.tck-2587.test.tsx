/**
 * TCK-2587 — les Visites « par le temps ». Le réseau est doublé au niveau d'`apiRequest` (les hooks
 * de requête et de mutation tournent pour de vrai, sur un `QueryClient` de test) : on compte les
 * lectures et on lit les corps postés, comme au relevé réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { VisitesParLeTemps } from '../VisitesParLeTemps';

const etat = vi.hoisted(() => ({
  recherche: '',
  large: false,
  agence: 3 as number | null,
  capacites: ['crm.assign'] as string[],
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  lot: null as unknown,
}));

const remplacer = vi.hoisted(() => vi.fn());
const pousser = vi.hoisted(() => vi.fn());
const toastAdd = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.recherche),
  useRouter: () => ({ replace: remplacer, push: pousser }),
  usePathname: () => '/app/visits',
}));
vi.mock('@/hooks/useMatchesMedia', () => ({
  useMatchesMedia: (requete: string) => (requete.includes('64rem') ? etat.large : requete.includes('48rem') ? !etat.large : false),
}));
vi.mock('@/hooks/usePersonnelActif', () => ({
  useAgenceDuPersonnelActif: () => etat.agence,
  usePersonnelActif: () => etat.agence !== null,
}));
vi.mock('@/hooks/useCan', () => ({ useCan: (c: string) => ({ can: etat.capacites.includes(c), isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'], agency_id: 3 }, token: 'jeton' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => <div data-testid="planifier" /> }));
vi.mock('@/components/visits/VisitsList', () => ({ VisitsList: () => <div data-testid="liste-par-statut" /> }));

/* ───────────────────────────── les données (maquette `app-visites-donnees.ts`) ───────────────────────────── */

const ADRESSE_PLATEAU = { line: '12, rue Carnot', neighborhood: 'Dakar-Plateau', city: 'Dakar', latitude: 14.6681, longitude: -17.4318 };

function visite(o: Partial<PropertyVisit> & { id: number }): PropertyVisit {
  return {
    property_id: 51,
    status: 'confirmed',
    type: 'in_person',
    duration_minutes: 30,
    agent_id: 3,
    agent: { id: 3, first_name: 'Sokhna', last_name: 'Sène' },
    property: { id: 51, title: 'Local commercial', slug: 'local-commercial', cover_url: null, address: ADRESSE_PLATEAU },
    ...o,
  } as PropertyVisit;
}

const visiteur = (name: string, n = 1) => ({ name, phone: '+221789429352', kind: 'customer', visits_on_property: n }) as PropertyVisit['visitor_display'];

const PLATEAU = visite({ id: 2291, scheduled_at: '2026-11-10T10:57:00Z', visitor_display: visiteur('Abdoulaye Cissé') });
const TERRAIN = visite({
  id: 2294,
  scheduled_at: '2026-11-10T16:55:00Z',
  duration_minutes: 45,
  property: { id: 52, title: 'Terrain 300 m²', slug: 't', cover_url: null, address: { ...ADRESSE_PLATEAU, line: 'Av. Lamine Guèye, lot 14' } },
  property_id: 52,
  visitor_display: visiteur('Rokhaya Mbaye', 2),
});
const YOFF = visite({
  id: 2301,
  property_id: 53,
  status: 'scheduled',
  preferred_window: 'afternoon',
  scheduled_at: '2026-11-11T14:00:00Z',
  notes: 'Je suis dispo après 15 h.',
  property: { id: 53, title: 'Local commercial', slug: 'yoff', cover_url: null, address: { ...ADRESSE_PLATEAU, neighborhood: 'Yoff' } },
  visitor_display: visiteur('Abdoulaye Cissé', 2),
});
const MERMOZ = visite({ id: 2303, status: 'scheduled', scheduled_at: '2026-11-12T10:00:00Z', visitor_display: visiteur('Mariama Fall') });
const SANS_AGENT = visite({ id: 2310, status: 'scheduled', scheduled_at: '2026-11-13T10:00:00Z', agent_id: null, agent: null, visitor_display: visiteur('Lamine Badji') });
const LIBERTE = visite({
  id: 2280,
  scheduled_at: '2026-11-09T16:00:00Z',
  customer: { id: 9, first_name: 'Yacine', last_name: 'Diouf' } as PropertyVisit['customer'],
  visitor_display: visiteur('Yacine Diouf'),
});
const PLUS_TARD = visite({ id: 2320, scheduled_at: '2026-11-12T15:30:00Z', visitor_display: visiteur('Fatou Kane', 2) });

const COMPTES = { unassigned: 1, requested: 6, confirmed: 11, past: 31, cancelled: 4, today: 2, to_close: 1, later: 9, all: 58 };

function liste(filtre: URLSearchParams): PropertyVisit[] {
  if (filtre.get('filter[day]')) return [TERRAIN, PLATEAU];
  if (filtre.get('filter[to_close]')) return [LIBERTE];
  if (filtre.get('filter[status]') === 'scheduled') return [YOFF, MERMOZ, SANS_AGENT];
  if (filtre.get('filter[status]') === 'confirmed') return [PLUS_TARD];
  return [];
}

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      etat.appels.push({ chemin, methode, corps: options.body });
      const [route, qs] = chemin.split('?');
      const p = new URLSearchParams(qs ?? '');
      if (route === '/api/property-visits/counts') return { data: COMPTES };
      if (route === '/api/property-visits/slots') {
        const jour = p.get('date');
        return {
          data: {
            date: jour,
            timezone: 'Africa/Dakar',
            slots: ['14:00', '15:00', '15:30', '17:00'].map((h) => ({ start: `${jour}T${h}:00Z`, label: h, available: h !== '14:00' })),
          },
        };
      }
      if (route === '/api/property-visits') {
        const data = liste(p);
        return { data, meta: { total: data.length, per_page: 30, current_page: 1, last_page: 1 } };
      }
      if (route === '/api/property-visits/bulk-confirm') return etat.lot;
      if (route.endsWith('/report')) return { data: LIBERTE, customer_note: null, suggested_stage: null };
      if (route.startsWith('/api/agencies/')) return { data: [{ id: 21, first_name: 'Moussa', last_name: 'Fall' }], meta: { total: 1 } };
      if (methode === 'POST') return { data: {} };
      return { data: [], meta: { total: 0, per_page: 8, current_page: 1, last_page: 1 } };
    }),
  };
});

/** Mardi 10 novembre 2026, 10:12 à Dakar : la visite de 10:57 part « dans 45 min ». */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<VisitesParLeTemps titre="Visites" />)}</QueryClientProvider>);
}

const lectures = (route: string) => etat.appels.filter((a) => a.methode === 'GET' && a.chemin.split('?')[0] === route);
const ecritures = (fin: string) => etat.appels.filter((a) => a.methode === 'POST' && a.chemin.endsWith(fin));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { recherche: '', large: false, agence: 3, capacites: ['crm.assign'], appels: [], lot: null });
  remplacer.mockClear();
  pousser.mockClear();
  toastAdd.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('les pastilles', () => {
  it('AC2 — une seule lecture de comptes au montage, et chaque pastille dit le nombre exact', async () => {
    monter();
    const rangee = screen.getByLabelText('Vues des visites');
    await waitFor(() => expect(within(rangee).getByRole('button', { name: /À confirmer\s*6/ })).toBeInTheDocument());
    expect(within(rangee).getByRole('button', { name: /Aujourd’hui\s*2/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rangee).getByRole('button', { name: /À clore\s*1/ })).toBeInTheDocument();
    expect(within(rangee).getByRole('button', { name: /Plus tard\s*9/ })).toBeInTheDocument();
    expect(lectures('/api/property-visits/counts')).toHaveLength(1);
    // Les onglets de statut (cinq lectures) ne sont pas montés sur « Aujourd'hui ».
    expect(screen.queryByTestId('liste-par-statut')).toBeNull();
  });

  it('`?tab=requested` (pastille « À traiter » du menu) ouvre « À confirmer », sur le périmètre de « Demandées »', async () => {
    etat.recherche = 'tab=requested';
    monter();
    const rangee = screen.getByLabelText('Vues des visites');
    expect(within(rangee).getByRole('button', { name: /À confirmer/ })).toHaveAttribute('aria-pressed', 'true');
    await screen.findAllByText(/Mariama Fall/);
    const liste = lectures('/api/property-visits').map((a) => new URLSearchParams(a.chemin.split('?')[1]));
    expect(liste.some((p) => p.get('filter[status]') === 'scheduled' && p.get('filter[scheduled_at_min]') === '2026-11-10T10:12:00.000Z')).toBe(true);
  });

  it('« Par statut » rend les onglets de statut d’avant (`VisitsList`)', () => {
    etat.recherche = 'vue=status';
    monter();
    expect(screen.getByTestId('liste-par-statut')).toBeInTheDocument();
  });
});

describe('Aujourd’hui au téléphone', () => {
  it('AC1 — la prochaine visite : l’heure, le bien, l’adresse, le visiteur et Itinéraire ; « dans 45 min » ; le temps libre', async () => {
    monter();
    const carte = (await screen.findByText('10:57')).closest('[data-slot="carte-prochaine"]') as HTMLElement;
    expect(carte).not.toBeNull();
    expect(within(carte).getByText('dans 45 min')).toBeInTheDocument();
    expect(within(carte).getByText('Local commercial')).toBeInTheDocument();
    expect(within(carte).getByText(/12, rue Carnot/)).toBeInTheDocument();
    expect(within(carte).getByText('Abdoulaye Cissé')).toBeInTheDocument();
    expect(within(carte).getByRole('link', { name: 'Itinéraire' })).toHaveAttribute('href', expect.stringContaining('destination=14.6681,-17.4318'));
    expect(screen.getByText('Libre de 11:30 à 16:55')).toBeInTheDocument();
    expect(screen.getByText('16:55').closest('[data-slot="carte-du-jour"]')).not.toBeNull();
  });
});

describe('À confirmer : confirmer sans ouvrir la fiche', () => {
  it('AC3 — « Confirmer 15:00 » d’une demande « mer. 11, l’après-midi » poste l’heure libre proposée', async () => {
    etat.recherche = 'vue=to_confirm';
    const user = userEvent.setup();
    monter();
    const carte = (await screen.findByText('L’après-midi · heure à fixer')).closest('[data-slot="carte-demande"]') as HTMLElement;
    const bouton = await within(carte).findByRole('button', { name: 'Confirmer 15:00' });
    await user.click(bouton);
    await waitFor(() => expect(ecritures('/api/property-visits/2301/confirm')).toHaveLength(1));
    expect(ecritures('/api/property-visits/2301/confirm')[0].corps).toEqual({ scheduled_at: '2026-11-11T15:00:00Z' });
    // Les créneaux sont lus pour CE bien et CE jour.
    expect(lectures('/api/property-visits/slots').some((a) => a.chemin.includes('property_id=53') && a.chemin.includes('date=2026-11-11'))).toBe(true);
  });

  it('une demande à heure fixée se confirme à son heure, sans `scheduled_at`', async () => {
    etat.recherche = 'vue=to_confirm';
    const user = userEvent.setup();
    monter();
    const carte = (await screen.findByText('Mariama Fall', { exact: false })).closest('[data-slot="carte-demande"]') as HTMLElement;
    await user.click(within(carte).getByRole('button', { name: 'Confirmer 10:00' }));
    await waitFor(() => expect(ecritures('/api/property-visits/2303/confirm')).toHaveLength(1));
    expect(ecritures('/api/property-visits/2303/confirm')[0].corps).toEqual({});
  });

  it('« Autre heure » mène à la fiche, où se choisit une autre heure', async () => {
    etat.recherche = 'vue=to_confirm';
    monter();
    const carte = (await screen.findByText('L’après-midi · heure à fixer')).closest('[data-slot="carte-demande"]') as HTMLElement;
    expect(within(carte).getByRole('link', { name: 'Autre heure' })).toHaveAttribute('href', '/app/visits/2301?heure=autre');
  });
});

describe('À clore : le verdict depuis la liste', () => {
  it('AC4 — « Intéressé » enregistre le verdict puis ouvre « Et maintenant ? »', async () => {
    etat.recherche = 'vue=to_close';
    const user = userEvent.setup();
    monter();
    const carte = (await screen.findByText(/Yacine Diouf/)).closest('[data-slot="carte-a-clore"]') as HTMLElement;
    expect(within(carte).getByText(/hier à 16:00/)).toBeInTheDocument();
    await user.click(within(carte).getByRole('button', { name: /Intéressé/ }));
    await waitFor(() => expect(ecritures('/api/property-visits/2280/report')).toHaveLength(1));
    expect(ecritures('/api/property-visits/2280/report')[0].corps).toEqual({ outcome: 'interested' });
    await waitFor(() => expect(pousser).toHaveBeenCalledWith('/app/visits/2280?etape=et-maintenant'));
  });

  it('AC4 — « Yacine n’est pas venu » marque Absent', async () => {
    etat.recherche = 'vue=to_close';
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: 'Yacine n’est pas venu' }));
    await waitFor(() => expect(ecritures('/api/property-visits/2280/no-show')).toHaveLength(1));
  });
});

describe('le bureau', () => {
  it('AC5 — « Confirmer (3) » rend un résultat par ligne ; la ligne refusée reste cochée, avec sa raison', async () => {
    etat.large = true;
    etat.recherche = 'vue=to_confirm';
    etat.lot = {
      data: [
        { id: 2301, ok: true, sms_sent: true },
        { id: 2303, ok: true },
        { id: 2310, ok: false, code: 'visit.slot_overlap', status: 422 },
      ],
      meta: { ok: 2, failed: 1 },
    };
    const user = userEvent.setup();
    monter();
    // L'heure proposée de la tranche est lue avant de cocher (la barre la redit).
    await screen.findByRole('button', { name: 'Confirmer 15:00' });
    await user.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
    const barre = await screen.findByText('3 visites sélectionnées');
    expect(barre.parentElement).toHaveTextContent('1 heure à fixer : 15:00 proposée d’après les créneaux libres');
    await user.click(screen.getByRole('button', { name: 'Confirmer (3)' }));
    await waitFor(() => expect(ecritures('/api/property-visits/bulk-confirm')).toHaveLength(1));
    expect(ecritures('/api/property-visits/bulk-confirm')[0].corps).toEqual({
      visits: [{ id: 2301, scheduled_at: '2026-11-11T15:00:00Z' }, { id: 2303 }, { id: 2310 }],
    });
    await screen.findByText('1 visite sélectionnée');
    const lignes = screen.getAllByRole('row').filter((r) => r.getAttribute('data-slot') === 'ligne-de-visite');
    const refusee = lignes.find((r) => within(r).queryByText('Lamine Badji')) as HTMLElement;
    expect(refusee).toHaveAttribute('data-coche', 'true');
    expect(within(refusee).getByText('L’heure chevauche une autre visite.')).toBeInTheDocument();
    expect(lignes.filter((r) => r.getAttribute('data-coche') === 'true')).toHaveLength(1);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: '2 visites traitées · 1 refus', type: 'warning' }));
  });

  it('les onglets du bureau se comptent sur la même lecture : « Toutes 58 »', async () => {
    etat.large = true;
    monter();
    await screen.findByRole('tab', { name: /Toutes\s*58/ });
    expect(lectures('/api/property-visits/counts')).toHaveLength(1);
  });
});

describe('le bailleur', () => {
  it('lit ses visites sans les gestes du personnel ni « À clore »', async () => {
    etat.agence = null;
    etat.recherche = 'vue=to_confirm';
    monter();
    await screen.findAllByText(/Mariama Fall/);
    const rangee = screen.getByLabelText('Vues des visites');
    expect(within(rangee).queryByRole('button', { name: /À clore/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Confirmer/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Autre heure' })).toBeNull();
    expect(lectures('/api/property-visits/slots')).toHaveLength(0);
  });

  it('`?vue=to_close` ne s’ouvre pas pour lui : « Aujourd’hui »', () => {
    etat.agence = null;
    etat.recherche = 'vue=to_close';
    monter();
    expect(within(screen.getByLabelText('Vues des visites')).getByRole('button', { name: /Aujourd’hui/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('l’hydratation', () => {
  it('le HTML du serveur (profils inconnus) s’hydrate sans écart quand le navigateur connaît déjà le personnel', async () => {
    const { renderToString } = await import('react-dom/server');
    const { hydrateRoot } = await import('react-dom/client');
    const { act } = await import('react');
    const arbre = () => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {withIntl(<VisitesParLeTemps titre="Visites" />)}
      </QueryClientProvider>
    );
    // Le serveur rend sans les profils (le cache du serveur ne les a pas lus)…
    etat.agence = null;
    const html = renderToString(arbre());
    // … la coque, hydratée avant cette frontière, les a lus dans le cache du navigateur.
    etat.agence = 3;
    const hote = document.createElement('div');
    hote.innerHTML = html;
    document.body.appendChild(hote);
    const ecarts: unknown[] = [];
    let racine: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      racine = hydrateRoot(hote, arbre(), { onRecoverableError: (e) => ecarts.push(e) });
    });
    expect(ecarts).toEqual([]);
    // Après l'hydratation, l'en-tête du personnel est bien là.
    expect(within(hote).getByRole('button', { name: /Planifier une visite/ })).toBeInTheDocument();
    act(() => racine?.unmount());
    hote.remove();
  });
});
