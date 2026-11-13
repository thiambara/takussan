/**
 * TCK-2624 (lot 2) — « À faire maintenant » du bailleur et de l'hôte, « En cours sur vos biens »,
 * « Loyers du mois » et la ligne du jour. Le réseau est doublé au niveau d'`apiRequest` : les hooks
 * de requête et de mutation tournent pour de vrai sur un `QueryClient` de test, et l'on lit les
 * requêtes émises (filtres compris) et les gestes envoyés, comme au relevé réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { lireLoyersDuMois } from '@/lib/accueil/loyers-du-mois';

import { AFaireBailleur, type FilesDeLHote } from '../AFaireBailleur';
import { EnCoursSurVosBiens } from '../EnCoursSurVosBiens';
import { LoyersDuMois } from '../LoyersDuMois';
import { ResumeDuBailleur } from '../ResumeDuBailleur';

const etat = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  visites: 2,
  devis: 1,
  loyers: 4,
  enCours: 1,
  peutDecider: true,
  plafond: null as number | null,
  pannes: new Map<string, number>(),
  refus: new Set<string>(),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 21, roles: ['owner'] }, token: 'jeton' }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => false }));
vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
}));

const VISITE = {
  id: 601,
  property_id: 3,
  agent_id: 5,
  status: 'scheduled',
  type: 'in_person',
  scheduled_at: '2026-11-14T11:00:00Z',
  preferred_window: null,
  duration_minutes: 30,
  property: { id: 3, title: 'Maison familiale avec jardin', slug: 'm', address: { neighborhood: 'Ouakam' } },
  visitor_display: { name: 'Pape Gueye', phone: null, kind: 'customer', visits_on_property: 1 },
  agent: { id: 5, first_name: 'Sokhna', last_name: 'Sène' },
};
const DEVIS = {
  id: 71,
  property_id: 3,
  title: 'Remplacement d’un chauffe-eau',
  status: 'awaiting_owner',
  quote_amount: 85_000,
  quote_currency: 'XOF',
  scheduled_at: null,
  assigned_to: 9,
  property: { id: 3, title: 'Appartement F3, Liberté 6', slug: 'f3' },
  assignee: { id: 9, name: 'Astou Sy' },
};
const EN_COURS = {
  id: 72,
  property_id: 4,
  title: 'Fuite sous évier',
  status: 'scheduled',
  scheduled_at: '2026-11-10T09:30:00Z',
  assigned_to: 9,
  quote_amount: null,
  property: { id: 4, title: 'F2, Grand Yoff', slug: 'f2' },
  assignee: { id: 9, name: 'Astou Sy' },
};
const LOYER = {
  id: 88,
  source: 'lease',
  payment_type: 'rent',
  status: 'late',
  days_late: 5,
  due_date: '2026-11-05',
  amount_due: 1_400_000,
  remaining_amount: 1_400_000,
  currency: 'XOF',
  lease_id: 31,
  payer: { id: 8, name: 'Seydou Camara' },
  property: { id: 4, title: 'Villa blanche, Yoff' },
};

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      etat.appels.push({ chemin, methode, corps: options.body });
      const [route, qs] = chemin.split('?') as [string, string | undefined];
      const params = new URLSearchParams(qs ?? '');
      const panne = etat.pannes.get(route);
      if (panne) throw new vrai.ApiError(panne, {});
      if (methode !== 'GET') {
        if (etat.refus.has(route)) throw new vrai.ApiError(403, { message: 'Refusé' });
        if (route === '/api/maintenance-requests/71/quote/approve') etat.devis = 0;
        if (route === '/api/property-visits/601/confirm') etat.visites -= 1;
        return { data: {} };
      }
      const page = (data: unknown[], total: number) => ({ data: total > 0 ? data : [], meta: { total, per_page: 20, current_page: 1, last_page: 1 } });
      switch (route) {
        case '/api/property-visits':
          return page([VISITE, { ...VISITE, id: 602, scheduled_at: '2026-11-16T17:00:00Z' }].slice(0, etat.visites), etat.visites);
        case '/api/maintenance-requests':
          return params.get('filter[status]') === 'awaiting_owner' ? page([DEVIS], etat.devis) : page([EN_COURS, { ...EN_COURS, id: 73, title: 'Peinture du salon', scheduled_at: null }, { ...EN_COURS, id: 74, title: 'Peinture écaillée', scheduled_at: '2026-11-07T14:25:00Z' }, { ...EN_COURS, id: 75, title: 'Serrure', scheduled_at: '2026-11-09T09:00:00Z' }], etat.enCours);
        case '/api/maintenance-requests/71':
          return { data: { ...DEVIS, quote_lines: [{ label: 'Chauffe-eau 100 L', total: 70_000 }, { label: 'Main-d’œuvre', total: 15_000 }], owner_approval_threshold: etat.plafond, abilities: { can_decide_quote: etat.peutDecider } } };
        case '/api/payments/history':
          return page([LOYER, { ...LOYER, id: 89, payer: { id: 9, name: 'Ndeye Wade' } }], etat.loyers);
        default:
          return page([], 0);
      }
    }),
  };
});

function monter(contenu: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(contenu)}</QueryClientProvider>);
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
  Object.assign(etat, { appels: [], visites: 2, devis: 1, loyers: 4, enCours: 1, peutDecider: true, plafond: null, pannes: new Map(), refus: new Set() });
});
afterEach(() => vi.useRealTimers());

describe('les files du bailleur', () => {
  it('« Loyers en retard » ne lit que les échéances DONT IL EST LE BAILLEUR, sans la relance de l’agence', async () => {
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    await waitFor(() => expect(groupe('Loyers en retard')).toBeTruthy());
    const p = lectures('/api/payments/history')[0]!;
    expect(p.get('filter[landlord_id]')).toBe('21');
    expect(p.get('filter[days_late_min]')).toBe('1');
    expect(p.get('sort')).toBe('-days_late');
    expect(p.get('include')).toBe('payer,property');
    // Les devis : la file `awaiting_owner` de l'écran « Interventions » du bailleur, filtrée par l'API.
    expect(lectures('/api/maintenance-requests').map((q) => q.get('filter[status]'))).toContain('awaiting_owner');
  });

  it('bureau : les trois groupes, leurs comptes, la rangée d’un loyer en retard et « Voir les N autres »', async () => {
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    const loyers = await waitFor(() => groupe('Loyers en retard'));
    expect(within(loyers).getByText('Seydou Camara · Villa blanche, Yoff')).toBeTruthy();
    expect(within(loyers).getAllByText('1 400 000 F · échu le 5 nov.')).toHaveLength(2);
    expect(within(loyers).getAllByText('5 jours')).toHaveLength(2);
    expect(within(loyers).getAllByRole('link', { name: 'Voir' })[0]!.getAttribute('href')).toBe('/app/leases/31');
    expect(within(loyers).getByRole('link', { name: 'Voir les 2 autres loyers en retard' })).toBeTruthy();
    const devis = groupe('Devis à valider');
    expect(within(devis).getByText('Appartement F3, Liberté 6 · Astou Sy')).toBeTruthy();
    expect(within(devis).getByText('85 000 F')).toBeTruthy();
  });

  it('décision 7 — le bailleur d’un bien d’agence ne confirme pas : « Voir » seul, sans « Confirmer » ni « Autre créneau »', async () => {
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    const visites = await waitFor(() => groupe('Visites à confirmer'));
    expect(within(visites).queryByRole('button', { name: 'Confirmer' })).toBeNull();
    expect(within(visites).getAllByRole('link', { name: 'Voir' })[0]!.getAttribute('href')).toBe('/app/visits/601');
    expect(within(telephone()).queryByRole('button', { name: 'Confirmer' })).toBeNull();
  });

  it('l’hôte confirme : « Confirmer » envoie la confirmation et la ligne quitte l’accueil', async () => {
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites />);
    await waitFor(() => expect(within(telephone()).getAllByRole('button', { name: 'Confirmer' })).toHaveLength(2));
    fireEvent.click(within(telephone()).getAllByRole('button', { name: 'Confirmer' })[0]!);
    await waitFor(() => expect(gestes().map((g) => `${g.methode} ${g.chemin}`)).toEqual(['POST /api/property-visits/601/confirm']));
    await waitFor(() => expect(within(telephone()).getAllByRole('button', { name: 'Confirmer' })).toHaveLength(1));
  });

  it('téléphone : une carte par visite (« proposée par » l’agent) et par devis ; pas de loyers en retard (la maquette)', async () => {
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    await waitFor(() => expect(within(telephone()).getAllByText('Visite à confirmer')).toHaveLength(2));
    expect(within(telephone()).getAllByText('Maison familiale avec jardin · Ouakam · proposée par Sokhna Sène')).toHaveLength(2);
    expect(within(telephone()).getByText('Devis à valider')).toBeTruthy();
    expect(within(telephone()).queryByText(/Seydou Camara/)).toBeNull();
    // Tout tient sur l'écran : pas de « Voir les N autres ».
    expect(document.querySelector('[data-slot="autres-du-telephone"]')).toBeNull();
  });

  it('téléphone : ce que le plafond de la file ne montre pas se dit — « Voir les 6 autres visites à confirmer »', async () => {
    Object.assign(etat, { visites: 8, devis: 3 });
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    await waitFor(() => expect(within(telephone()).getAllByText('Visite à confirmer')).toHaveLength(2));
    const autres = document.querySelector<HTMLElement>('[data-slot="autres-du-telephone"]')!;
    expect(within(autres).getByRole('link', { name: 'Voir les 6 autres visites à confirmer' }).getAttribute('href')).toBe('/app/visits?vue=to_confirm');
    expect(within(autres).getByRole('link', { name: 'Voir les 2 autres devis à valider' }).getAttribute('href')).toBe('/app/maintenance');
  });
});

describe('AC5 — valider un devis sans quitter l’accueil', () => {
  it('« Valider » ouvre la feuille du devis ; « Approuver 85 000 F » envoie `quote/approve` et la ligne disparaît', async () => {
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    await waitFor(() => expect(within(telephone()).getByRole('button', { name: 'Valider' })).toBeTruthy());
    fireEvent.click(within(telephone()).getByRole('button', { name: 'Valider' }));
    const feuille = await screen.findByRole('dialog');
    expect(await within(feuille).findByText('Chauffe-eau 100 L')).toBeTruthy();
    fireEvent.click(await within(feuille).findByRole('button', { name: /^Approuver 85\s000\sF CFA$/u }));

    await waitFor(() => expect(gestes().map((g) => `${g.methode} ${g.chemin}`)).toEqual(['POST /api/maintenance-requests/71/quote/approve']));
    await waitFor(() => expect(screen.queryByText('Remplacement d’un chauffe-eau', { exact: false })).toBeNull());
  });

  it('sans `can_decide_quote` sur la fiche, la feuille n’a pas de geste : « Voir le devis » seul', async () => {
    etat.peutDecider = false;
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    await waitFor(() => expect(within(telephone()).getByRole('button', { name: 'Valider' })).toBeTruthy());
    fireEvent.click(within(telephone()).getByRole('button', { name: 'Valider' }));
    const feuille = await screen.findByRole('dialog');
    expect(await within(feuille).findByText('Chauffe-eau 100 L')).toBeTruthy();
    expect(within(feuille).queryByRole('button', { name: /Approuver/ })).toBeNull();
    expect(within(feuille).queryByRole('button', { name: 'Refuser' })).toBeNull();
    expect(within(feuille).getByRole('link', { name: 'Voir le devis' }).getAttribute('href')).toBe('/app/maintenance/71');
  });

  it('la feuille monte la décision de l’écran « Interventions » (TCK-2654) : même rappel du plafond, même « Refuser »', async () => {
    etat.plafond = 50_000;
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    await waitFor(() => expect(within(telephone()).getByRole('button', { name: 'Valider' })).toBeTruthy());
    fireEvent.click(within(telephone()).getByRole('button', { name: 'Valider' }));
    const feuille = await screen.findByRole('dialog');
    expect(await within(feuille).findByText(/^Au-dessus de 50\s000\sF CFA, votre mandat prévoit votre accord\.$/u)).toBeTruthy();
    expect(feuille.querySelector('[data-slot="decision-du-devis"]')).not.toBeNull();
    expect(within(feuille).getByRole('button', { name: 'Refuser' })).toBeTruthy();
  });

  it('un refus de l’API (403) retire « Valider » : la carte mène au devis', async () => {
    etat.refus.add('/api/maintenance-requests/71/quote/approve');
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    await waitFor(() => expect(within(telephone()).getByRole('button', { name: 'Valider' })).toBeTruthy());
    fireEvent.click(within(telephone()).getByRole('button', { name: 'Valider' }));
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /^Approuver 85\s000\sF CFA$/u }));
    await waitFor(() => expect(within(telephone()).queryByRole('button', { name: 'Valider' })).toBeNull());
    expect(within(telephone()).getAllByRole('link', { name: 'Voir le devis' })[0]!.getAttribute('href')).toBe('/app/maintenance/71');
  });
});

describe('« À faire » ne liste que l’inachevé', () => {
  it('bailleur sans rien en attente : « Tout est à jour », et « Proposer un bien à mon agence »', async () => {
    Object.assign(etat, { visites: 0, devis: 0, loyers: 0 });
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    expect(await screen.findByText('Tout est à jour')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Proposer un bien à mon agence' }).getAttribute('href')).toBe('/app/properties/new');
  });

  it('l’hôte garde ses réservations à traiter et ses avis sans réponse (la Vue bailleur) ; une file à zéro n’a pas de ligne', async () => {
    Object.assign(etat, { visites: 0, devis: 0, loyers: 0 });
    const hote: FilesDeLHote = { reservations: { etat: 'pret', total: 2 }, avis: { etat: 'pret', total: 0 } };
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites hote={hote} />);
    await waitFor(() => expect(groupe('Réservations à traiter')).toBeTruthy());
    expect(within(telephone()).getByText('2 réservations à traiter')).toBeTruthy();
    expect(within(telephone()).getByRole('link', { name: 'Voir' }).getAttribute('href')).toBe('/app/bookings?status=pending');
    expect(screen.queryByText(/avis sans réponse/)).toBeNull();
    expect(screen.queryByText('Tout est à jour')).toBeNull();
  });

  it('une file en panne n’est pas une file vide : pas de « Tout est à jour »', async () => {
    Object.assign(etat, { visites: 0, devis: 0 });
    etat.pannes.set('/api/payments/history', 500);
    monter(<AFaireBailleur landlordId={21} confirmeLesVisites={false} />);
    expect(await screen.findByText(/Impossible de charger ce qui vous attend/)).toBeTruthy();
    expect(screen.queryByText('Tout est à jour')).toBeNull();
  });
});

describe('« En cours sur vos biens »', () => {
  it('l’intervention, son bien, et qui passe quand ; rien en cours : pas de bloc', async () => {
    const { unmount } = monter(<EnCoursSurVosBiens />);
    expect(await screen.findByText('Fuite sous évier · F2, Grand Yoff')).toBeTruthy();
    expect(screen.getByText('Astou Sy intervient aujourd’hui à 09:30')).toBeTruthy();
    // Sans passage fixé : « passage à fixer », jamais un statut technique.
    expect(screen.getByText('Astou Sy · passage à fixer')).toBeTruthy();
    // Un passage daté du passé : l'intervention est toujours en cours, jamais « intervient le 7 nov. ».
    expect(screen.getByText('Astou Sy · passage prévu le 7 nov. à 14:25')).toBeTruthy();
    expect(screen.getByText('Astou Sy · passage prévu hier à 09:00')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fuite sous évier · F2, Grand Yoff' }).getAttribute('href')).toBe('/app/maintenance/72');
    unmount();
    etat.enCours = 0;
    monter(<EnCoursSurVosBiens />);
    await waitFor(() => expect(lectures('/api/maintenance-requests').length).toBeGreaterThan(1));
    expect(document.querySelector('[data-slot="en-cours-sur-vos-biens"]')).toBeNull();
  });
});

describe('AC4 — « Loyers de novembre : 8 reçus sur 14 »', () => {
  const loyers = lireLoyersDuMois({ rent_month: { received_count: 8, expected_count: 14, received_amount: 11_400_000 } })!;

  it('lu depuis `rent_month`, le lien mène à ses paiements filtrés sur le mois, sans segment inventé', () => {
    monter(<LoyersDuMois loyers={loyers} jour="2026-11-10" />);
    const bloc = screen.getByRole('region', { name: 'Loyers de novembre' });
    expect(bloc.textContent).toContain('8 reçus sur 14');
    expect(within(bloc).getByText('11,4 M F')).toBeTruthy();
    expect(within(bloc).getByRole('link', { name: 'Voir les loyers' }).getAttribute('href')).toBe('/app/payments?tab=history&date_from=2026-11-01&date_to=2026-11-30');
    expect(within(bloc).queryByText(/en retard/)).toBeNull();
    expect(within(bloc).queryByText(/à venir/)).toBeNull();
  });

  it('« Loyers d’octobre » : l’élision devant une voyelle', () => {
    monter(<LoyersDuMois loyers={loyers} jour="2026-10-02" />);
    expect(screen.getByRole('region', { name: 'Loyers d’octobre' })).toBeTruthy();
  });

  it('les segments servis par l’API (TCK-2774) sont rendus', () => {
    const servis = lireLoyersDuMois({
      rent_month: { received_count: 8, expected_count: 14, received_amount: 11_400_000, overdue_count: 3, overdue_amount: 4_100_000, upcoming_count: 3, upcoming_amount: 3_200_000 },
    })!;
    monter(<LoyersDuMois loyers={servis} jour="2026-11-10" />);
    expect(screen.getByText('3 en retard')).toBeTruthy();
    expect(screen.getByText('4,1 M F')).toBeTruthy();
    expect(screen.getByText('3 à venir')).toBeTruthy();
  });
});

describe('la ligne du jour', () => {
  it('« · 8 loyers reçus sur 14, 2 visites à confirmer »', async () => {
    const loyers = lireLoyersDuMois({ rent_month: { received_count: 8, expected_count: 14, received_amount: 0 } });
    const { container } = monter(<p>{<ResumeDuBailleur jour="Mardi 10 novembre" landlordId={21} loyers={loyers} />}</p>);
    await waitFor(() => expect(container.textContent).toContain('2 visites à confirmer'));
    expect(container.textContent).toContain('8 loyers reçus sur 14');
  });

  it('chaque file à zéro : « rien n’attend votre réponse »', async () => {
    Object.assign(etat, { visites: 0, devis: 0, loyers: 0 });
    const { container } = monter(<p>{<ResumeDuBailleur jour="Mardi 10 novembre" landlordId={21} loyers={null} />}</p>);
    await waitFor(() => expect(container.textContent).toBe('Mardi 10 novembre · rien n’attend votre réponse'));
  });
});
