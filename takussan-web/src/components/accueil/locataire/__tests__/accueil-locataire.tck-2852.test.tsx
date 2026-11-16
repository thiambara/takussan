import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { withIntl } from '@/test/intl';
import type { ResumeDuLoyer } from '@/types/invoice';

import { CarteDuLogement } from '../CarteDuLogement';
import { CarteDuLoyer } from '../CarteDuLoyer';
import { DerniersPaiements } from '../DerniersPaiements';
import { EntreeDansLesLieux } from '../EntreeDansLesLieux';
import { InterventionsEnCours } from '../InterventionsEnCours';
import { MonLogement } from '../MonLogement';

/**
 * TCK-2852 — l'accueil du locataire : « Mon logement » avec photo et fin de bail, « À finir », la ligne
 * des moyens en ligne, et au bureau « Derniers paiements », la carte du logement (l'agent, « Écrire ») et
 * « Interventions en cours ». La couche RÉSEAU est doublée par chemin.
 */
const reseau = vi.hoisted(() => ({
  appels: [] as string[],
  resume: null as unknown,
  payes: [] as unknown[],
  dus: [] as unknown[],
  checklist: null as unknown,
  demandes: [] as unknown[],
  filsDirects: [] as unknown[],
  pousse: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9, roles: ['customer', 'tenant'] }, token: 'jeton' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: reseau.pousse, refresh: vi.fn() }), usePathname: () => '/app' }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string) => {
      const lu = decodeURIComponent(path);
      reseau.appels.push(lu);
      if (lu === '/api/me/rent-summary') return { data: reseau.resume };
      if (lu.startsWith('/api/payments/history?') && lu.includes('filter[status]=paid')) {
        return { data: reseau.payes, meta: { total: reseau.payes.length, current_page: 1, last_page: 1, per_page: 10 } };
      }
      if (lu.startsWith('/api/payments/history?')) return { data: reseau.dus, meta: { total: reseau.dus.length, current_page: 1, last_page: 1, per_page: 50 } };
      if (lu === '/api/me/leases/40/onboarding-checklist') return { data: reseau.checklist };
      if (lu.startsWith('/api/maintenance-requests?')) return { data: reseau.demandes, meta: { total: reseau.demandes.length, current_page: 1, last_page: 1, per_page: 50 } };
      if (lu.startsWith('/api/conversations?')) return { data: reseau.filsDirects, meta: { total: reseau.filsDirects.length, current_page: 1, last_page: 1, per_page: 30 } };
      throw new Error(`requête inattendue : ${lu}`);
    }),
  };
});

const BAIL = {
  id: 40,
  reference_number: 'BAIL-40',
  status: 'active',
  monthly_rent: 250_000,
  monthly_charges: 0,
  currency: 'XOF',
  end_date: '2027-08-31',
  property: { id: 7, title: 'F3 à Sacré-Cœur 3', cover_url: 'http://127.0.0.1:8002/storage/salon.webp', address_line: 'Sacré-Cœur 3, Dakar' },
  agent: { user_id: 31, name: 'Sokhna Sène', avatar_url: null },
  agency: { id: 1, name: 'Dakar Immo', phone: '+221338201234' },
};

const ligneDue = { kind: 'rent', lease_payment_id: 501, lease_id: 40, payment_type: 'rent', due_date: '2026-12-05', period_start: '2026-12-01', period_end: '2026-12-31', amount: 250_000, currency: 'XOF', days_late: 0, payable_online: true };

function resume(surcharge: Partial<ResumeDuLoyer> = {}): ResumeDuLoyer {
  return {
    currency: 'XOF',
    total_due: 250_000,
    parts: { payable_online: 250_000, payable_at_agency: 0 },
    items: [ligneDue],
    next_rent: null,
    schedule_state: 'due',
    lease: BAIL,
    offline_payment: null,
    online_means: ['wave', 'orange_money', 'free_money'],
    ...surcharge,
  };
}

const paye = (id: number, mois: string, moyen: string, type = 'rent') => ({
  source: 'lease',
  id,
  lease_id: 40,
  payment_type: type,
  payment_method: moyen,
  status: 'paid',
  amount: 250_000,
  currency: 'XOF',
  paid_at: `${mois}-05T10:00:00Z`,
  date: `${mois}-05`,
  period_start: `${mois}-01`,
  reference_number: `LOY-${id}`,
});

function monter(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

beforeEach(() => {
  reseau.appels = [];
  reseau.resume = resume();
  reseau.payes = [paye(711, '2026-11', 'wave'), paye(710, '2026-10', 'orange_money'), paye(709, '2026-09', 'wave'), paye(708, '2026-08', 'wave')];
  reseau.dus = [];
  reseau.checklist = {
    id: 3,
    lease_id: 40,
    welcome_seen_at: '2026-09-01T10:00:00Z',
    inventory_completed_at: null,
    first_payment_at: '2026-09-05T10:00:00Z',
    documents_acknowledged_at: null,
    completed_at: null,
  };
  reseau.demandes = [];
  reseau.filsDirects = [];
  reseau.pousse.mockReset();
});

describe('TCK-2852 — « Mon logement » au téléphone (AC1)', () => {
  it('la photo du bien et « Bail jusqu’au 31 août 2027 » à la place du loyer ; « Contacter l’agence » nomme l’agent', async () => {
    const { container } = monter(<MonLogement />);
    expect(await screen.findByText('Bail jusqu’au 31 août 2027')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="photo-du-logement"]')).not.toBeNull();
    expect(screen.queryByText(/par mois/)).toBeNull();
    expect(screen.getByRole('link', { name: /F3 à Sacré-Cœur 3/ }).getAttribute('href')).toBe('/app/leases/40');
    expect(screen.getByRole('link', { name: /Contacter l’agence/ })).toHaveTextContent('Dakar Immo · Sokhna Sène');
  });

  it('sans date de fin, le loyer mensuel reste ; sans photo, aucune image', async () => {
    reseau.resume = resume({ lease: { ...BAIL, end_date: null, property: { id: 7, title: 'F3 à Sacré-Cœur 3', cover_url: null, address_line: null } } });
    const { container } = monter(<MonLogement />);
    expect(await screen.findByText(/250\s000\sF par mois/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('TCK-2852 — « À finir » / « Votre entrée dans les lieux »', () => {
  it('au téléphone : l’intertitre « À finir », la carte, « 2 étapes restantes », les étapes cochées et à faire', async () => {
    monter(<EntreeDansLesLieux forme="telephone" />);
    const carte = await screen.findByRole('region', { name: 'À finir' });
    expect(within(carte).getByText('Votre entrée dans les lieux')).toBeInTheDocument();
    expect(within(carte).getByText('2 étapes restantes')).toBeInTheDocument();
    expect(carte.querySelectorAll('[data-fait="oui"]')).toHaveLength(2);
    expect(carte.querySelectorAll('[data-fait="non"]')).toHaveLength(2);
    expect(within(carte).getByRole('link', { name: /état des lieux/ }).getAttribute('href')).toBe('/app/inventories/new?lease=40');
  });

  it('au bureau : le titre est l’en-tête de la carte ; la check-list finie, rien ne se rend (intertitre compris)', async () => {
    const { unmount } = monter(<EntreeDansLesLieux forme="bureau" />);
    expect(await screen.findByRole('heading', { name: 'Votre entrée dans les lieux' })).toBeInTheDocument();
    unmount();

    reseau.checklist = { ...(reseau.checklist as object), completed_at: '2026-09-10T10:00:00Z' };
    const { container } = monter(<EntreeDansLesLieux forme="telephone" />);
    await waitFor(() => expect(reseau.appels).toContain('/api/me/leases/40/onboarding-checklist'));
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('À finir')).toBeNull();
  });
});

describe('TCK-2852 — « Derniers paiements » (AC2)', () => {
  it('trois rangées, chacune « Payé » et « Quittance » ; « Tous les paiements » mène à /app/payments ; une seule lecture partagée', async () => {
    monter(
      <>
        <DerniersPaiements />
        <MonLogement />
      </>,
    );
    const bloc = await screen.findByRole('region', { name: 'Derniers paiements' });
    const rangees = bloc.querySelectorAll('[data-slot="paiement"]');
    expect(rangees).toHaveLength(3);
    for (const r of rangees) {
      expect(within(r as HTMLElement).getByText('Payé')).toBeInTheDocument();
      expect(within(r as HTMLElement).getByRole('button', { name: /^Quittance/ })).toBeInTheDocument();
    }
    expect(within(rangees[0] as HTMLElement).getByText('Loyer de novembre')).toBeInTheDocument();
    expect(within(rangees[0] as HTMLElement).getByText('Wave')).toBeInTheDocument();
    expect(within(rangees[1] as HTMLElement).getByText('Orange Money')).toBeInTheDocument();
    expect(within(bloc).getByRole('link', { name: /Tous les paiements/ }).getAttribute('href')).toBe('/app/payments');
    await screen.findByText('Bail jusqu’au 31 août 2027');
    expect(reseau.appels.filter((a) => a.startsWith('/api/payments/history?'))).toHaveLength(1);
  });

  it('« Quittance » seulement pour un loyer ou des charges soldés : ni la caution, ni une pénalité', async () => {
    reseau.payes = [paye(720, '2026-11', 'cash', 'deposit'), paye(721, '2026-11', 'wave', 'late_fee'), paye(711, '2026-11', 'wave')];
    monter(<DerniersPaiements />);
    const bloc = await screen.findByRole('region', { name: 'Derniers paiements' });
    expect(within(bloc).getAllByRole('button', { name: /^Quittance/ })).toHaveLength(1);
    expect(within(bloc).getByText('Caution')).toBeInTheDocument();
    expect(within(bloc).getByText('Pénalité de retard')).toBeInTheDocument();
  });
});

describe('TCK-2852 — la carte du logement (AC3)', () => {
  it('nomme l’agent du bail ; « Écrire » ouvre /app/messages sur le fil direct avec lui', async () => {
    reseau.filsDirects = [{ id: 55, type: 'direct', participants: [{ user_id: 9, left_at: null }, { user_id: 31, left_at: null }] }];
    monter(<CarteDuLogement />);
    const carte = await screen.findByRole('region', { name: 'F3 à Sacré-Cœur 3' });
    expect(within(carte).getByText('Sokhna Sène')).toBeInTheDocument();
    expect(within(carte).getByText('Dakar Immo · votre agent')).toBeInTheDocument();
    expect(within(carte).getByText('Sacré-Cœur 3, Dakar')).toBeInTheDocument();
    expect(within(carte).getByText(/Bail jusqu’au 31 août 2027 · 250\s000\sF par mois/)).toBeInTheDocument();
    fireEvent.click(within(carte).getByRole('button', { name: 'Écrire' }));
    await waitFor(() => expect(reseau.pousse).toHaveBeenCalledWith('/app/messages?conversation=55'));
    const recherche = reseau.appels.find((a) => a.startsWith('/api/conversations?'));
    expect(recherche).toContain('filter[participant]=31');
    expect(recherche).toContain('filter[type]=direct');
  });

  it('un avatar servi par un hôte quelconque ne casse pas la carte (la primitive Avatar, pas next/image)', async () => {
    reseau.resume = resume({ lease: { ...BAIL, agent: { user_id: 31, name: 'Sokhna Sène', avatar_url: 'https://cdn.exemple.test/avatars/31.jpg' } } });
    const { container } = monter(<CarteDuLogement />);
    const carte = await screen.findByRole('region', { name: 'F3 à Sacré-Cœur 3' });
    expect(within(carte).getByText('Sokhna Sène')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="avatar-de-l-agent"]')).toHaveTextContent('SS');
  });

  it('sans agent : « Géré par Dakar Immo », pas de « Écrire », « Appeler » l’agence', async () => {
    reseau.resume = resume({ lease: { ...BAIL, agent: null } });
    monter(<CarteDuLogement />);
    const carte = await screen.findByRole('region', { name: 'F3 à Sacré-Cœur 3' });
    expect(within(carte).getByText('Géré par Dakar Immo')).toBeInTheDocument();
    expect(within(carte).queryByRole('button', { name: 'Écrire' })).toBeNull();
    expect(within(carte).getByRole('link', { name: /Appeler/ }).getAttribute('href')).toBe('tel:+221338201234');
  });

  it('sans agent ni téléphone joignable : aucun geste', async () => {
    reseau.resume = resume({ lease: { ...BAIL, agent: null, agency: { id: 1, name: 'Dakar Immo', phone: null } } });
    monter(<CarteDuLogement />);
    const carte = await screen.findByRole('region', { name: 'F3 à Sacré-Cœur 3' });
    expect(within(carte).queryByRole('button')).toBeNull();
    expect(within(carte).queryByRole('link')).toBeNull();
  });
});

describe('TCK-2852 — « Interventions en cours » (AC4)', () => {
  it('sans intervention ouverte : « Aucune intervention en cours dans votre logement. » et « Signaler un problème »', async () => {
    reseau.demandes = [{ id: 3, title: 'Robinet', status: 'closed', category: 'plumbing', priority: 'normal', created_at: '2026-10-01T10:00:00Z' }];
    monter(<InterventionsEnCours />);
    const bloc = await screen.findByRole('region', { name: 'Interventions en cours' });
    expect(within(bloc).getByText('Aucune intervention en cours dans votre logement.')).toBeInTheDocument();
    expect(within(bloc).getByRole('link', { name: /Signaler un problème/ }).getAttribute('href')).toBe('/app/maintenance/new');
  });

  it('avec une intervention ouverte : sa rangée et son statut ; la close n’y est pas', async () => {
    reseau.demandes = [
      { id: 4, title: 'Fuite sous l’évier', status: 'in_progress', category: 'plumbing', priority: 'normal', created_at: '2026-11-10T10:00:00Z' },
      { id: 3, title: 'Robinet', status: 'closed', category: 'plumbing', priority: 'normal', created_at: '2026-10-01T10:00:00Z' },
    ];
    monter(<InterventionsEnCours />);
    const bloc = await screen.findByRole('region', { name: 'Interventions en cours' });
    const rangee = await within(bloc).findByRole('link', { name: /Fuite sous l’évier/ });
    expect(rangee.getAttribute('href')).toBe('/app/maintenance/4');
    expect(within(rangee).getByText('En cours')).toBeInTheDocument();
    expect(within(bloc).queryByText('Robinet')).toBeNull();
    expect(within(bloc).queryByText(/Aucune intervention/)).toBeNull();
  });
});

describe('TCK-2852 — la ligne des moyens sous « Payer » (AC5)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T08:00:00Z'));
  });

  it('les moyens ouverts, dans l’ordre servi : « Wave · Orange Money · Free Money »', async () => {
    const { container } = monter(<CarteDuLoyer />);
    await waitFor(() => expect(container.querySelector('[data-slot="moyens-en-ligne"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="moyens-en-ligne"]')).toHaveTextContent('Wave · Orange Money · Free Money');
  });

  it('agence sans Free Money ouvert : la ligne ne le cite pas', async () => {
    reseau.resume = resume({ online_means: ['wave', 'orange_money'] });
    const { container } = monter(<CarteDuLoyer />);
    await waitFor(() => expect(container.querySelector('[data-slot="moyens-en-ligne"]')).not.toBeNull());
    const ligne = container.querySelector('[data-slot="moyens-en-ligne"]')!;
    expect(ligne).toHaveTextContent('Wave · Orange Money');
    expect(ligne.textContent).not.toContain('Free Money');
  });

  it('aucun moyen en ligne ouvert : pas de ligne', async () => {
    reseau.resume = resume({ online_means: [] });
    const { container } = monter(<CarteDuLoyer />);
    await waitFor(() => expect(container.querySelector('[data-slot="carte-du-loyer"]:not([data-etat="chargement"])')).not.toBeNull());
    expect(container.querySelector('[data-slot="moyens-en-ligne"]')).toBeNull();
  });
});
