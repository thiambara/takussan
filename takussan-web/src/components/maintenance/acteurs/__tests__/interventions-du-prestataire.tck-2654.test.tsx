import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InterventionsDuPrestataire } from '../InterventionsDuPrestataire';

/**
 * TCK-2654, lot 4 — « Mes interventions » du prestataire. La couche RÉSEAU est doublée (`apiRequest`),
 * pas les hooks : AC4 et AC5 se prouvent sur ce que l'API sert et sur les requêtes envoyées.
 */
const reseau = vi.hoisted(() => ({
  appels: [] as { path: string; method: string; body?: unknown }[],
  aAccepter: [] as unknown[],
  semaine: [] as unknown[],
  fiches: {} as Record<number, Record<string, unknown>>,
  factures: [] as unknown[],
  facturesTotal: null as number | null,
  aPercevoir: [] as unknown[],
  aPercevoirTotal: null as number | null,
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
      const page = (data: unknown[], total: number | null) => ({ data, meta: { total: total ?? data.length, per_page: 20, current_page: 1, last_page: 1 } });
      if (method !== 'GET') return { data: {} };
      if (lu.startsWith('/api/maintenance-requests?')) {
        if (lu.includes('filter[file]=a_accepter')) return page(reseau.aAccepter, null);
        if (lu.includes('filter[scheduled_from]=')) return page(reseau.semaine, null);
      }
      const fiche = lu.match(/^\/api\/maintenance-requests\/(\d+)(\?|$)/);
      if (fiche) return { data: reseau.fiches[Number(fiche[1])] };
      if (lu.startsWith('/api/service-provider-bills?')) {
        if (lu.includes('filter[status]=')) return page(reseau.aPercevoir, reseau.aPercevoirTotal);
        return page(reseau.factures, reseau.facturesTotal);
      }
      throw new Error(`requête inattendue : ${method} ${lu}`);
    }),
  };
});

const A_ACCEPTER = {
  id: 52,
  title: 'Fuite sous l’évier',
  status: 'assigned',
  priority: 'urgent',
  accepted_at: null,
  file: 'a_accepter',
  scheduled_at: null,
  property: { id: 7, title: 'Villa 4 chambres', slug: null, agency: { id: 1, name: 'Dakar Immo' }, location: { quarter: 'Sacré-Cœur 3' } },
};

function fiche(id: number, surcharge: Record<string, unknown> = {}) {
  return { id, status: 'assigned', media: { photos: [{ id: 1 }, { id: 2 }], before_photos: [], completion_photos: [] }, abilities: { can_accept: true, can_decline: true }, ...surcharge };
}

const FACTURES = [
  { id: 30, reference_number: 'SPB-202611-EJMRRUS0', amount: 283981, currency: 'XOF', status: 'pending_validation', created_at: '2026-11-07T10:00:00Z', validated_at: null, maintenance_request: { id: 41, title: 'Groupe de sécurité du chauffe-eau' }, property: { id: 144, title: 'Bureaux à Ngor' } },
  { id: 23, reference_number: 'SPB-202610-K2TQ81RA', amount: 268035, currency: 'XOF', status: 'validated', created_at: '2026-10-30T10:00:00Z', validated_at: '2026-11-02T10:00:00Z', maintenance_request: { id: 32, title: 'Débouchage de colonne' }, property: { id: 9, title: 'Appartement Liberté 6' } },
  { id: 6, reference_number: 'SPB-202610-7HVN03LD', amount: 46500, currency: 'XOF', status: 'paid', created_at: '2026-10-20T10:00:00Z', validated_at: '2026-10-22T10:00:00Z', maintenance_request: { id: 6, title: 'Robinet mitigeur de cuisine' }, property: { id: 3, title: 'Studio Mermoz' } },
];

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<InterventionsDuPrestataire />}</QueryClientProvider>));
}

async function carteAAccepter() {
  return (await waitFor(() => {
    const c = document.querySelector('[data-slot="carte-a-accepter"]');
    if (!c) throw new Error('carte absente');
    return c;
  })) as HTMLElement;
}

describe('InterventionsDuPrestataire — TCK-2654, lot 4', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // La semaine se calcule depuis « maintenant » : on le fige un mardi (seule l'horloge `Date`, les
  // minuteurs restent réels pour React Query).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T08:00:00Z'));
    reseau.appels = [];
    reseau.aAccepter = [A_ACCEPTER];
    reseau.semaine = [];
    reseau.fiches = { 52: fiche(52) };
    reseau.factures = FACTURES;
    reseau.facturesTotal = null;
    reseau.aPercevoir = FACTURES.filter((f) => f.status !== 'paid');
    reseau.aPercevoirTotal = null;
  });

  it('« À accepter » vient de la file a_accepter ; la semaine est bornée lundi → dimanche et limitée à SES interventions', async () => {
    monter();
    const c = await carteAAccepter();
    expect(within(c).getByText('Fuite sous l’évier')).toBeTruthy();
    expect(within(c).getByText('Urgente')).toBeTruthy();
    expect(await within(c).findByText('Dakar Immo · 2 photos')).toBeTruthy();
    expect(within(c).getByText('Adresse et contact du locataire visibles après acceptation')).toBeTruthy();
    const semaine = reseau.appels.find((a) => a.path.includes('filter[scheduled_from]='));
    expect(semaine?.path).toMatch(/filter\[assigned_to\]=18/);
    expect(semaine?.path).toContain('filter[scheduled_from]=2026-11-09');
    expect(semaine?.path).toContain('filter[scheduled_to]=2026-11-15');
  });

  it('AC4 — la fiche ne sert pas `can_accept` (demande terminée) : ni « J’accepte » ni « Je refuse »', async () => {
    reseau.fiches = { 52: fiche(52, { status: 'completed', abilities: { can_accept: false, can_decline: false } }) };
    monter();
    const c = await carteAAccepter();
    await waitFor(() => expect(reseau.appels.some((a) => a.path.startsWith('/api/maintenance-requests/52'))).toBe(true));
    await within(c).findByText('Dakar Immo · 2 photos');
    expect(within(c).queryByRole('button', { name: 'J’accepte' })).toBeNull();
    expect(within(c).queryByRole('button', { name: "J'accepte" })).toBeNull();
    expect(within(c).queryByRole('button', { name: 'Je refuse' })).toBeNull();
  });

  it('« J’accepte » envoie POST …/accept, puis les listes sont relues : la carte acceptée disparaît', async () => {
    monter();
    const c = await carteAAccepter();
    const bouton = await within(c).findByRole('button', { name: /^J.accepte$/ });
    reseau.aAccepter = [];
    fireEvent.click(bouton);
    await waitFor(() => expect(reseau.appels).toContainEqual(expect.objectContaining({ path: '/api/maintenance-requests/52/accept', method: 'POST' })));
    await waitFor(() => expect(document.querySelector('[data-slot="carte-a-accepter"]')).toBeNull());
  });

  it('« Je refuse » exige un motif de trois caractères, puis envoie POST …/decline', async () => {
    monter();
    const c = await carteAAccepter();
    fireEvent.click(await within(c).findByRole('button', { name: 'Je refuse' }));
    const champ = within(c).getByLabelText('Pourquoi refusez-vous ?');
    fireEvent.change(champ, { target: { value: 'no' } });
    const confirmer = within(c).getByRole('button', { name: 'Confirmer le refus' });
    expect((confirmer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(champ, { target: { value: 'Hors de ma zone' } });
    fireEvent.click(confirmer);
    await waitFor(() =>
      expect(reseau.appels).toContainEqual(expect.objectContaining({ path: '/api/maintenance-requests/52/decline', method: 'POST' })),
    );
  });

  it('AC5 — chaque carte de facture porte son montant et son statut ; « À percevoir » est la somme à valider + validées, FILTRÉE par l’API', async () => {
    monter();
    const cartes = await waitFor(() => {
      const l = document.querySelectorAll('[data-slot="carte-de-facture"]');
      if (l.length !== 3) throw new Error('factures absentes');
      return [...l] as HTMLElement[];
    });
    const attendu = [
      ['Groupe de sécurité du chauffe-eau', '283981', 'À valider'],
      ['Débouchage de colonne', '268035', 'Validée'],
      ['Robinet mitigeur de cuisine', '46500', 'Payée'],
    ];
    cartes.forEach((carte, k) => {
      expect(carte.textContent).toContain(attendu[k][0]);
      expect(carte.textContent?.replace(/\D/g, '')).toContain(attendu[k][1]);
      expect(within(carte).getByText(attendu[k][2])).toBeTruthy();
    });
    expect(within(cartes[0]).getByText('SPB-202611-EJMRRUS0 · Bureaux à Ngor')).toBeTruthy();

    const total = await waitFor(() => {
      const el = document.querySelector('[data-slot="a-percevoir"]');
      if (!el) throw new Error('total absent');
      return el as HTMLElement;
    });
    expect(total.textContent?.replace(/\D/g, '')).toBe('552016');
    const requete = reseau.appels.find((a) => a.path.startsWith('/api/service-provider-bills?') && a.path.includes('filter[status]='));
    expect(requete?.path).toContain('filter[status]=pending_validation,validated');
    expect(requete?.path).toContain('filter[provider_id]=18');
  });

  it('101 factures à percevoir pour 100 lues : aucun montant (il serait faux), le compte reste', async () => {
    reseau.aPercevoirTotal = 101;
    monter();
    await waitFor(() => expect(document.querySelectorAll('[data-slot="carte-de-facture"]')).toHaveLength(3));
    const ligne = await waitFor(() => {
      const l = document.querySelector<HTMLElement>('[data-slot="a-percevoir"]');
      expect(l).not.toBeNull();
      return l as HTMLElement;
    });
    expect(within(ligne).getByText('101 factures')).toBeTruthy();
    expect(ligne.textContent).not.toMatch(/F\sCFA|\d\s?\d{3}/);
  });

  it('« Cette semaine » : un passage accepté montre l’adresse et « Itinéraire » servis par la fiche', async () => {
    reseau.aAccepter = [];
    reseau.semaine = [
      { id: 61, title: 'Robinet d’arrêt à remplacer', status: 'assigned', accepted_at: '2026-11-01T00:00:00Z', file: 'en_cours', scheduled_at: '2026-11-12T09:00:00Z', property: { id: 9, title: 'Bureaux', slug: null, location: { quarter: 'Hann Maristes' } } },
    ];
    reseau.fiches = {
      61: fiche(61, { access: { street: 'Route du Front de Terre', quarter: 'Hann Maristes', city: 'Dakar', latitude: 14.72, longitude: -17.44, requester_phone: null, instructions: 'Gardien au portail' } }),
    };
    monter();
    const passage = (await waitFor(() => {
      const p = document.querySelector('[data-slot="passage"]');
      if (!p) throw new Error('passage absent');
      return p;
    })) as HTMLElement;
    expect(within(passage).getByText('Bureaux · Hann Maristes')).toBeTruthy();
    // La rue seule : le quartier est déjà sur la ligne du bien.
    expect(await within(passage).findByText('Route du Front de Terre')).toBeTruthy();
    expect(within(passage).getByText('Bureaux · Hann Maristes')).toBeTruthy();
    expect(screen.getByText(/^Semaine du 9 au 14 novembre — /)).toBeTruthy();
    expect(within(passage).getByRole('link', { name: /Itinéraire/ }).getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=14.72,-17.44');
    expect(within(passage).getByRole('link', { name: /Kit d’accès/ }).getAttribute('href')).toBe('/app/maintenance/61');
  });

  it('sans facture : un état vide qui dit d’où naît une facture', async () => {
    reseau.factures = [];
    reseau.aPercevoir = [];
    monter();
    expect(await screen.findByText('Aucune facture pour l’instant')).toBeTruthy();
  });
});
