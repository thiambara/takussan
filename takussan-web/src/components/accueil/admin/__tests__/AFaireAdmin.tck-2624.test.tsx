/**
 * TCK-2624 — « À faire maintenant » et « Équipe aujourd'hui » de l'admin d'agence. Le réseau est
 * doublé au niveau d'`apiRequest` (les hooks de requête et de mutation tournent pour de vrai, sur un
 * `QueryClient` de test) : on lit les requêtes émises avec leurs filtres et les gestes envoyés, comme
 * au relevé réseau. Les compteurs de la colonne sont montés à côté, sur LE MÊME client : un geste qui
 * fait baisser la pastille sans rechargement se voit ici (AC1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { lecturesHorsFields, oublierLesLectures } from '@/test/visites-comme-l-api';
import { propertyModerationCountQueryOptions } from '@/lib/queries/agency-queues';
import { usePendingVisitsCount } from '@/lib/queries/visits';

import { AFaireAdmin } from '../AFaireAdmin';
import { EquipeDuJour } from '../EquipeDuJour';

type Reponse = unknown;

const etat = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  biens: 1,
  demandes: 3,
  visites: 12,
  avis: 5,
  invitations: 0,
  kyc: 'verified' as string,
  impayes: 16,
  peutAttribuer: true,
  /** La visite demandée en TRANCHE (« le matin ») plutôt qu'à heure fixée. */
  tranche: false,
  /** Les routes qui répondent en erreur, et leur statut. */
  pannes: new Map<string, number>(),
  /** Les gestes refusés par l'API (403). */
  refus: new Set<string>(),
  /** Les notifications émises (titre). */
  toasts: [] as string[],
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles: ['agency_admin'], agency_id: 7 }, token: 'jeton' }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: etat.peutAttribuer, isLoading: false }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => false }));
vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: ({ title }: { title: string }) => etat.toasts.push(title) }),
}));
vi.mock('@/lib/queries/kyc', () => ({ fetchAgencyKyc: async () => ({ data: { status: etat.kyc } }) }));
vi.mock('@/components/leads/boite/AttribuerDialog', () => ({
  AttribuerDialog: ({ leadId, agencyId }: { leadId: number; agencyId: number }) => <div data-testid="attribuer">{`${leadId}/${agencyId}`}</div>,
}));
// TCK-2775 — la relance (famille 6) vit sur l'écran Impayés, qui l'ouvre depuis son adresse
// (`relance-de-l-adresse.tck-2775.test.tsx`) : ici, l'accueil n'en est que le lien.

const BIEN = {
  id: 9,
  reference_number: 'TK-0009',
  title: 'Appartement F3 à Sacré-Cœur',
  slug: 'f3',
  status: 'pending_review',
  main_photo_url: null,
  price: 350_000,
  currency: 'XOF',
  type: 'apartment',
  submitted_at: '2026-11-09T09:00:00Z',
  rejection_reason: null,
  owner: { id: 3, name: 'Oumy Samb', avatar_url: null },
  agency: { id: 7, name: 'Agence' },
  location: { city: 'Dakar', region: null, country: 'SN' },
};
const DEMANDES = [
  { id: 41, agency_id: 9, name: 'Moussa Diallo', message: 'Est-elle toujours disponible ?', created_at: '2026-11-10T08:12:00Z', property: { id: 1, title: 'Villa 4 chambres à Ngor', slug: 'v' } },
  { id: 42, agency_id: 7, name: 'Rokhaya Mbaye', message: null, created_at: '2026-11-10T05:12:00Z', property: { id: 2, title: 'Bureau 80 m² au Plateau', slug: 'b' } },
];
const VISITE = {
  id: 501,
  property_id: 1,
  agent_id: 5,
  status: 'scheduled',
  type: 'in_person',
  scheduled_at: '2026-11-11T09:30:00Z',
  preferred_window: null,
  duration_minutes: 30,
  property: { id: 1, title: 'Villa contemporaine', slug: 'vc', address: { neighborhood: 'Almadies' } },
  visitor_display: { name: 'Pape Gueye', phone: null, kind: 'customer', visits_on_property: 1 },
  agent: { id: 5, first_name: 'Khady', last_name: 'Faye' },
};
const ECHEANCE = {
  id: 77,
  source: 'lease',
  lease_id: 31,
  payment_type: 'rent',
  status: 'late',
  days_late: 94,
  due_date: '2026-08-05',
  period_start: '2026-08-01',
  amount_due: 4_200_000,
  remaining_amount: 4_200_000,
  currency: 'XOF',
  payer: { id: 8, name: 'Seydou Camara', phone: '+221770000002' },
  property: { id: 4, title: 'Villa blanche, Yoff' },
};
const EQUIPE = {
  date: '2026-11-10',
  agents: [
    { user_id: 11, name: 'Sokhna Sène', avatar_url: null, visits_today_count: 2, first_visit_at: '2026-11-10T11:00:00Z', open_leads_count: 4, current_absence: null },
    { user_id: 12, name: 'Babacar Ndour', avatar_url: null, visits_today_count: 0, first_visit_at: null, open_leads_count: 0, current_absence: { ends_at: '2026-11-13', substitute: null } },
    { user_id: 13, name: 'Modou Thiam', avatar_url: null, visits_today_count: 1, first_visit_at: null, open_leads_count: 2, current_absence: null },
  ],
};

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string, options: { method?: string; body?: unknown } = {}): Promise<Reponse> => {
      const methode = options.method ?? 'GET';
      etat.appels.push({ chemin, methode, corps: options.body });
      const [route] = chemin.split('?');
      const panne = etat.pannes.get(route!);
      if (panne) throw new vrai.ApiError(panne, {});
      if (methode !== 'GET') {
        if (etat.refus.has(route!)) throw new vrai.ApiError(403, { message: 'Refusé' });
        if (route === '/api/properties/9/approve') etat.biens = 0;
        if (route === '/api/property-visits/501/confirm') etat.visites -= 1;
        return { data: {} };
      }
      // TCK-2797 — les visites servies comme l'API : les seules clés de `fields[property_visits]`.
      const { commeLApi: servir } = await import('@/test/visites-comme-l-api');
      const page = (data: unknown[], total: number) => servir(chemin, { data: total > 0 ? data : [], meta: { total, per_page: 20, current_page: 1, last_page: 1, pending_count: total } });
      switch (route) {
        case '/api/properties/moderation':
          return page([BIEN], etat.biens);
        case '/api/contact-leads':
          return page(DEMANDES, etat.demandes);
        case '/api/property-visits':
          return page([etat.tranche ? { ...VISITE, preferred_window: 'morning' } : VISITE], etat.visites);
        case '/api/property-visits/slots':
          return {
            data: {
              date: '2026-11-11',
              timezone: 'Africa/Dakar',
              slots: [
                { start: '2026-11-11T09:00:00Z', label: '09:00', available: false },
                { start: '2026-11-11T10:30:00Z', label: '10:30', available: true },
              ],
            },
          };
        case '/api/reviews':
          return page([{ id: 1, created_at: '2026-11-07T10:12:00Z' }], etat.avis);
        case '/api/invitations':
          return page([{ id: 1 }], etat.invitations);
        case '/api/agencies/7/finance/aging': {
          const cellule = (count: number) => ({ count, amount: count * 1_000_000 });
          return {
            data: {
              as_of: '2026-11-10',
              group_by: 'tenant',
              buckets: etat.impayes > 0 ? { '1_30': cellule(9), '31_60': cellule(3), '61_90': cellule(0), '90_plus': cellule(4) } : { '1_30': cellule(0), '31_60': cellule(0), '61_90': cellule(0), '90_plus': cellule(0) },
              total: { count: etat.impayes, amount: etat.impayes > 0 ? 33_715_000 : 0 },
              rows: [],
              deposits_held: { total: 0, by_landlord: [] },
            },
          };
        }
        case '/api/payments/history':
          return page([ECHEANCE, { ...ECHEANCE, id: 78, days_late: 12 }, { ...ECHEANCE, id: 79, source: 'booking' }], etat.impayes);
        case '/api/agencies/7/team-today':
          return { data: EQUIPE };
        default:
          return page([], 0);
      }
    }),
  };
});

/** La pastille « Biens à valider » et « Visites à confirmer » de la colonne : leurs VRAIES options. */
function Compteurs() {
  const biens = useQuery(propertyModerationCountQueryOptions('jeton', true));
  const visites = usePendingVisitsCount();
  return (
    <p>
      <span data-testid="pastille-biens">{biens.data ?? '…'}</span>
      <span data-testid="pastille-visites">{visites.data?.meta.total ?? '…'}</span>
    </p>
  );
}

function monter(contenu: React.ReactNode = <AFaireAdmin agencyId={7} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {withIntl(
        <>
          <Compteurs />
          {contenu}
        </>,
      )}
    </QueryClientProvider>,
  );
}

const lectures = (route: string) =>
  etat.appels.filter((a) => a.methode === 'GET' && a.chemin.split('?')[0] === route).map((a) => new URLSearchParams(a.chemin.split('?')[1] ?? ''));
const gestes = () => etat.appels.filter((a) => a.methode !== 'GET');
const telephone = () => document.querySelector<HTMLElement>('[data-slot="a-faire-telephone"]')!;
const bureau = () => document.querySelector<HTMLElement>('[data-slot="a-faire-bureau"]')!;
const groupe = (nom: string) => within(bureau()).getByRole('region', { name: nom });

/** Mardi 10 novembre 2026, 10:12 à Dakar. */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { appels: [], biens: 1, demandes: 3, visites: 12, avis: 5, invitations: 0, kyc: 'verified', impayes: 16, peutAttribuer: true, tranche: false, pannes: new Map(), refus: new Set(), toasts: [] });
  oublierLesLectures();
});
afterEach(() => {
  vi.useRealTimers();
  // TCK-2797 — l'écran ne lit aucune clé de visite qu'il ne demande pas.
  expect(lecturesHorsFields()).toEqual([]);
});

describe('les files lues', () => {
  it('chaque file part avec le filtre de sa pastille, en `per_page` court', async () => {
    monter();
    await screen.findAllByText('3 demandes à attribuer');

    const [demandes] = lectures('/api/contact-leads');
    expect([demandes?.get('filter[handled]'), demandes?.get('filter[unassigned]'), demandes?.get('per_page'), demandes?.get('sort')]).toEqual(['0', '1', '3', 'created_at']);
    expect(demandes?.get('fields[property_contact_leads]')).toBeTruthy();

    const visites = lectures('/api/property-visits').find((p) => p.get('per_page') === '2')!;
    // Le filtre de la pastille, au même instant (début de la minute) : la carte compte ce qu'elle compte.
    const pastille = lectures('/api/property-visits').find((p) => p.get('per_page') === '1')!;
    expect(visites.get('filter[status]')).toBe('scheduled');
    expect(visites.get('filter[scheduled_at_min]')).toBe(pastille.get('filter[scheduled_at_min]'));
    expect(visites.get('sort')).toBe('scheduled_at');
    expect(visites.get('fields[property_visits]')).toBeTruthy();

    const avis = lectures('/api/reviews').find((p) => p.get('sort') === 'created_at')!;
    expect([avis.get('filter[moderation_status]'), avis.get('per_page')]).toEqual(['pending', '1']);

    const echeance = lectures('/api/payments/history').find((p) => p.get('per_page') === '1')!;
    expect([echeance.get('filter[days_late_min]'), echeance.get('sort')]).toEqual(['1', '-days_late']);
  });

  it('téléphone : une carte par file, chacune avec son compte et son verbe — dans l’ordre de la maquette', async () => {
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    const cartes = within(telephone()).getAllByRole('listitem');
    expect(cartes.map((c) => c.querySelector('p span, p.text-corps')?.textContent)).toEqual([
      '1 bien à valider',
      '3 demandes à attribuer',
      '12 visites à confirmer',
      '5 avis à modérer',
      'Impayés · 16 échéances',
    ]);
    expect(within(cartes[0]!).getByRole('button', { name: 'Valider' })).toBeTruthy();
    expect(within(cartes[0]!).getByText('Appartement F3 à Sacré-Cœur · par Oumy Samb')).toBeTruthy();
    expect(within(cartes[0]!).getByText('depuis hier')).toBeTruthy();
    expect(within(cartes[1]!).getByText('Plus ancienne : il y a 2 h')).toBeTruthy();
    expect(within(cartes[2]!).getByRole('link', { name: 'Voir' }).getAttribute('href')).toBe('/app/visits?vue=to_confirm');
    expect(within(cartes[3]!).getByText('Le plus ancien : 3 jours')).toBeTruthy();
    expect(within(cartes[4]!).getByText('33 715 000 F')).toBeTruthy();
    expect(within(cartes[4]!).getByRole('link', { name: 'Relancer' }).getAttribute('href')).toBe('/app/agency/finances?tab=impayes&relance=file');
  });

  it('bureau : les groupes, leurs comptes, les tranches des impayés et « Voir les N autres »', async () => {
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    expect(within(groupe('Demandes non attribuées')).getAllByRole('listitem')).toHaveLength(2);
    expect(within(groupe('Demandes non attribuées')).getByRole('link', { name: /Voir l’autre demande non attribuée/ }).getAttribute('href')).toBe('/app/leads?filtre=unassigned');
    expect(within(groupe('Visites à confirmer')).getByText('mer. 11 nov. · 09:30 — Villa contemporaine · Almadies')).toBeTruthy();
    expect(within(groupe('Visites à confirmer')).getByText('Pape Gueye · agent : Khady Faye')).toBeTruthy();
    expect(within(groupe('Visites à confirmer')).getByRole('link', { name: /Voir les 11 autres visites à confirmer/ })).toBeTruthy();
    const impayes = groupe('Impayés');
    expect(within(impayes).getByText('16 échéances · 33 715 000 F')).toBeTruthy();
    expect(within(impayes).getByText('9 de moins de 30 jours · 3 entre 31 et 60 · 4 de plus de 90')).toBeTruthy();
    expect(within(impayes).getByText('Seydou Camara · Villa blanche, Yoff')).toBeTruthy();
    expect(within(impayes).getByText('94 jours')).toBeTruthy();
  });
});

describe('« À faire » ne liste que l’inachevé', () => {
  it('une file vide n’a aucune ligne, ni au téléphone ni au bureau', async () => {
    Object.assign(etat, { biens: 0, avis: 0 });
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    expect(screen.queryByText(/bien à valider/)).toBeNull();
    expect(screen.queryByText(/avis à modérer/)).toBeNull();
    expect(within(bureau()).queryByRole('region', { name: 'À valider' })).toBeNull();
  });

  it('AC2 — un dossier KYC vérifié n’a aucune ligne ; un dossier à compléter en a une', async () => {
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    expect(screen.queryByText('Dossier KYC de l’agence')).toBeNull();
  });

  it('… un dossier KYC à compléter, des invitations sans réponse : chacun sa ligne (aucune régression d’« À traiter »)', async () => {
    Object.assign(etat, { kyc: 'pending', invitations: 2 });
    monter();
    expect(await screen.findAllByText('Dossier KYC de l’agence')).toHaveLength(2);
    expect(screen.getAllByText('2 invitations sans réponse')).toHaveLength(2);
  });

  it('« Tout est à jour » quand chaque file a répondu à zéro — y compris quand une file ne s’applique pas (sans `crm.assign`)', async () => {
    Object.assign(etat, { biens: 0, demandes: 0, visites: 0, avis: 0, impayes: 0, peutAttribuer: false });
    monter();
    expect(await screen.findByText('Tout est à jour')).toBeTruthy();
    // La file qui ne s'applique pas n'est même pas lue.
    expect(lectures('/api/contact-leads')).toHaveLength(0);
  });

  it('une file en panne n’est pas une file vide : pas de « Tout est à jour », l’erreur est dite', async () => {
    Object.assign(etat, { biens: 0, demandes: 0, visites: 0, impayes: 0 });
    etat.pannes.set('/api/reviews', 500);
    monter();
    expect(await screen.findByText(/Impossible de charger ce qui vous attend/)).toBeTruthy();
    expect(screen.queryByText('Tout est à jour')).toBeNull();
  });
});

describe('les gestes, sans quitter l’accueil', () => {
  it('AC1 — « Valider » ouvre la feuille ; le geste envoie l’approbation, la carte disparaît et la pastille « Biens à valider » passe à 0', async () => {
    monter();
    await waitFor(() => expect(screen.getByTestId('pastille-biens').textContent).toBe('1'));
    fireEvent.click(within(telephone()).getByRole('button', { name: 'Valider' }));
    const feuille = await screen.findByRole('dialog');
    expect(within(feuille).getByText('Appartement F3 à Sacré-Cœur')).toBeTruthy();
    fireEvent.click(within(feuille).getByRole('button', { name: 'Valider le bien' }));

    await waitFor(() => expect(gestes().map((g) => `${g.methode} ${g.chemin}`)).toEqual(['POST /api/properties/9/approve']));
    await waitFor(() => expect(screen.getByTestId('pastille-biens').textContent).toBe('0'));
    expect(screen.queryByText(/bien à valider/)).toBeNull();
  });

  it('« Confirmer » envoie la confirmation, retire la ligne et fait baisser la pastille « Visites à confirmer »', async () => {
    etat.visites = 1;
    monter();
    await waitFor(() => expect(screen.getByTestId('pastille-visites').textContent).toBe('1'));
    fireEvent.click(within(groupe('Visites à confirmer')).getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(gestes().map((g) => `${g.methode} ${g.chemin}`)).toEqual(['POST /api/property-visits/501/confirm']));
    await waitFor(() => expect(screen.getByTestId('pastille-visites').textContent).toBe('0'));
    expect(within(bureau()).queryByRole('region', { name: 'Visites à confirmer' })).toBeNull();
  });

  it('une visite en tranche se confirme à la première heure libre de son agent : l’heure part dans `scheduled_at`', async () => {
    etat.tranche = true;
    etat.visites = 1;
    monter();
    const bouton = await waitFor(() => within(groupe('Visites à confirmer')).getByRole('button', { name: 'Confirmer 10:30' }));
    expect(lectures('/api/property-visits/slots')[0]?.get('agent_id')).toBe('5');
    fireEvent.click(bouton);

    await waitFor(() => expect(gestes().map((g) => `${g.methode} ${g.chemin}`)).toEqual(['POST /api/property-visits/501/confirm']));
    expect(gestes()[0]!.corps).toEqual({ scheduled_at: '2026-11-11T10:30:00Z' });
  });

  it('un geste que l’API refuse (403) devient « Voir » : la ligne mène à la visite', async () => {
    etat.refus.add('/api/property-visits/501/confirm');
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    fireEvent.click(within(groupe('Visites à confirmer')).getByRole('button', { name: 'Confirmer' }));

    const rangee = await waitFor(() => {
      const r = within(groupe('Visites à confirmer')).getAllByRole('listitem')[0]!;
      expect(within(r).queryByRole('button', { name: 'Confirmer' })).toBeNull();
      return r;
    });
    expect(within(rangee).getByRole('link', { name: 'Voir' }).getAttribute('href')).toBe('/app/visits/501');
    expect(within(rangee).queryByRole('link', { name: 'Autre créneau' })).toBeNull();
  });

  it('« Attribuer » ouvre l’attribution de la demande, dans L’AGENCE DE LA DEMANDE', async () => {
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    fireEvent.click(within(telephone()).getByRole('button', { name: 'Attribuer' }));
    // L'agence de la demande (9), pas celle du profil actif (7) : un même admin peut lire deux agences.
    expect(screen.getByTestId('attribuer').textContent).toBe('41/9');
  });

  it('AC6 / TCK-2775 AC5 — « Relancer » MÈNE à l’écran Impayés, qui ouvre la relance : la file pour « Relancer tout », l’échéance pour sa rangée ; rien n’est lu ni envoyé d’ici', async () => {
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    const impayes = groupe('Impayés');
    expect(within(impayes).getByRole('link', { name: 'Relancer tout' }).getAttribute('href')).toBe('/app/agency/finances?tab=impayes&relance=file');
    expect(within(impayes).getByRole('link', { name: 'Relancer' }).getAttribute('href')).toBe('/app/agency/finances?tab=impayes&relance=77&bail=31');
    expect(within(telephone()).getByRole('link', { name: 'Relancer' }).getAttribute('href')).toBe('/app/agency/finances?tab=impayes&relance=file');
    // Aucun bouton de relance : le geste n'est plus monté sur l'accueil.
    expect(screen.queryByRole('button', { name: /Relancer/ })).toBeNull();
    fireEvent.click(within(impayes).getByRole('link', { name: 'Relancer tout' }));
    // L'accueil ne lit pas les 100 échéances (c'est l'écran Impayés qui les lit), et n'écrit rien.
    expect(lectures('/api/payments/history').some((p) => p.get('per_page') === '100')).toBe(false);
    expect(gestes()).toEqual([]);
  });

  it('l’échéance d’exemple dit le payeur, le reste dû et la période — sous les clés de l’accueil', async () => {
    monter();
    await screen.findAllByText('3 demandes à attribuer');
    expect(within(groupe('Impayés')).getByText('4 200 000 F · Loyer d’août')).toBeTruthy();
  });
});

describe('« Équipe aujourd’hui »', () => {
  it('AC3 — les agents de `team-today`, dans le même ordre et le même nombre ; l’absence et son terme', async () => {
    monter(<EquipeDuJour agencyId={7} />);
    const lignes = await screen.findAllByRole('listitem');
    expect(lignes.map((l) => l.querySelector('p')?.textContent)).toEqual(['Sokhna Sène', 'Babacar Ndour', 'Modou Thiam']);
    expect(within(lignes[0]!).getByText('Première visite à 11:00')).toBeTruthy();
    expect(within(lignes[0]!).getByText('2 visites · 4 demandes')).toBeTruthy();
    expect(within(lignes[1]!).getByText('En congé jusqu’au 13 nov.')).toBeTruthy();
    expect(within(lignes[1]!).getByText('Aucune visite')).toBeTruthy();
    // Ni « Au bureau » ni « Sur le terrain » : l'API ne les sait pas.
    expect(lignes[2]!.querySelectorAll('p')).toHaveLength(1);
  });

  it('une panne de `team-today` se dit dans le bloc, avec « Réessayer »', async () => {
    etat.pannes.set('/api/agencies/7/team-today', 500);
    monter(<EquipeDuJour agencyId={7} />);
    expect(await screen.findByText(/Impossible de charger l’équipe du jour/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });
});
