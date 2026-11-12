/**
 * TCK-2587 (lot C) — « Mes visites », la vue du client (maquette a-7). Le réseau est doublé au niveau
 * d'`apiRequest` : les hooks tournent pour de vrai sur un `QueryClient` de test, on lit les filtres
 * demandés et les corps postés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { MesVisites } from '../MesVisites';

const etat = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  confirmees: [] as PropertyVisit[],
  demandees: [] as PropertyVisit[],
  terminees: [] as PropertyVisit[],
  closesAVenir: [] as PropertyVisit[],
  passees: [] as PropertyVisit[],
  /** La seconde page des passées (`page=2`) ; vide : une seule page. */
  passeesPage2: [] as PropertyVisit[],
}));
const toastAdd = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/visits',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 30, roles: ['customer'] }, token: 'jeton' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));

vi.mock('@/lib/api', async (original) => {
  const vrai = await original<typeof import('@/lib/api')>();
  return {
    ...vrai,
    apiRequest: vi.fn(async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      etat.appels.push({ chemin, methode, corps: options.body });
      const [route, qs] = chemin.split('?');
      const p = new URLSearchParams(qs ?? '');
      if (route === '/api/property-visits' && methode === 'GET') {
        const statut = p.get('filter[status]');
        const min = p.get('filter[scheduled_at_min]');
        const data =
          statut === 'confirmed' && min
            ? etat.confirmees
            : statut === 'scheduled' && min
              ? etat.demandees
              : statut === 'completed' && !min
                ? etat.terminees
                : statut === 'completed,cancelled,no_show' && min
                  ? etat.closesAVenir
                  : !statut && p.get('filter[scheduled_at_max]')
                    ? etat.passees
                    : [];
        if (!statut && p.get('filter[scheduled_at_max]') && etat.passeesPage2.length > 0) {
          const page = Number(p.get('page') ?? '1');
          const lignes = page === 2 ? etat.passeesPage2 : etat.passees;
          return { data: lignes, meta: { total: etat.passees.length + etat.passeesPage2.length, per_page: 20, current_page: page, last_page: 2 } };
        }
        return { data, meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 } };
      }
      if (methode === 'POST') return { data: {} };
      return { data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } };
    }),
  };
});

/** Mardi 10 novembre 2026, 10:12 à Dakar. */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

function visite(o: Partial<PropertyVisit> & { id: number }): PropertyVisit {
  return {
    property_id: 51,
    visitor_id: 30,
    status: 'confirmed',
    type: 'in_person',
    duration_minutes: 30,
    agent_id: 3,
    agent: { id: 3, first_name: 'Sokhna', last_name: 'Sène' },
    rating: null,
    property: { id: 51, title: 'Appartement neuf', slug: 'appartement-neuf', cover_url: null },
    ...o,
  } as PropertyVisit;
}

/** La persona d'AC6 : terminée il y a 3 h 30, et une autre il y a neuf jours ; aucune à venir. */
const RECENTE = visite({ id: 901, status: 'completed', scheduled_at: '2026-11-10T06:00:00Z', completed_at: '2026-11-10T06:42:00Z' });
const ANCIENNE = visite({
  id: 902,
  status: 'completed',
  scheduled_at: '2026-11-01T10:00:00Z',
  completed_at: '2026-11-01T10:40:00Z',
  property: { id: 52, title: 'Chambre dans villa partagée', slug: 'chambre', cover_url: null },
});

const STUDIO = visite({
  id: 910,
  scheduled_at: '2026-11-12T10:00:00Z',
  property: {
    id: 53,
    title: 'Studio meublé près de la VDN',
    slug: 'studio-vdn',
    cover_url: null,
    address: { line: 'Rue SC-41, immeuble Ndoye', neighborhood: 'Sacré-Cœur', city: 'Dakar', latitude: 14.71, longitude: -17.46 },
  },
});
const DEMANDE = visite({
  id: 911,
  status: 'scheduled',
  preferred_window: 'morning',
  scheduled_at: '2026-11-14T08:00:00Z',
  property: { id: 54, title: 'Deux-pièces rénové', slug: 'deux-pieces', cover_url: null },
});

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<MesVisites titre="Mes visites" />)}</QueryClientProvider>);
}

const lectures = () =>
  etat.appels.filter((a) => a.methode === 'GET' && a.chemin.startsWith('/api/property-visits?')).map((a) => new URLSearchParams(a.chemin.split('?')[1]));
const ecritures = (fin: string) => etat.appels.filter((a) => a.methode === 'POST' && a.chemin.split('?')[0].endsWith(fin));

/** Les gestes du personnel, qu'aucune vue du client ne montre. */
const GESTES_DU_PERSONNEL = /^(Confirmer|Terminer|Absent|Replanifier|Attribuer|Réattribuer|Prendre en charge|Commencer|Je suis en route)/;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MAINTENANT);
  Object.assign(etat, { appels: [], confirmees: [], demandees: [], terminees: [], closesAVenir: [], passees: [], passeesPage2: [] });
  toastAdd.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('AC6 — un client sans visite à venir', () => {
  beforeEach(() => {
    etat.terminees = [RECENTE, ANCIENNE];
    etat.passees = [RECENTE, ANCIENNE];
  });

  it('ouvre sur ses visites passées, avec l’avis 1-5 proposé pour la seule visite des dernières 24 h', async () => {
    monter();
    // La visite à noter est dans « Votre avis », pas en double dans « Passées ».
    const passees = (await screen.findByRole('heading', { name: 'Passées' })).closest('section') as HTMLElement;
    expect(passees.querySelector('h2')?.parentElement).toHaveTextContent(/^Passées1$/);
    expect(within(passees).getAllByRole('listitem')).toHaveLength(1);
    expect(within(passees).getByText('Chambre dans villa partagée')).toBeInTheDocument();

    // Aucune section vide : ni « Prochaine visite », ni « En attente », ni l'onglet « Demandées 0 ».
    expect(screen.queryByRole('heading', { name: 'Prochaine visite' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'En attente de confirmation' })).toBeNull();
    expect(screen.queryByText(/Demandées/)).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();

    // Une carte d'avis, une seule : celle d'il y a 3 h 30 ; neuf jours, c'est hors fenêtre.
    const cartes = document.querySelectorAll('[data-slot="avis-du-client"]');
    expect(cartes).toHaveLength(1);
    const carte = cartes[0] as HTMLElement;
    expect(within(carte).getByText('Appartement neuf')).toBeInTheDocument();
    expect(within(carte).getByText('Visité aujourd’hui à 06:00 avec Sokhna')).toBeInTheDocument();
    expect(within(carte).getAllByRole('button', { name: /sur 5$/ })).toHaveLength(5);
    expect(within(carte).getByText('encore 21 h')).toBeInTheDocument();
    expect(screen.getByText('1 avis à donner')).toBeInTheDocument();
  });

  it('ne montre aucun geste du personnel', async () => {
    monter();
    await screen.findByRole('heading', { name: /Passées/ });
    const gestes = screen.queryAllByRole('button').filter((b) => GESTES_DU_PERSONNEL.test(b.textContent?.trim() ?? ''));
    expect(gestes).toEqual([]);
  });

  it('l’avis : rien ne part sans note ; quatre étoiles disent « Très bien » et postent `role: customer`', async () => {
    const user = userEvent.setup();
    monter();
    const carte = (await screen.findByText('Visité aujourd’hui à 06:00 avec Sokhna')).closest('[data-slot="avis-du-client"]') as HTMLElement;
    const envoyer = within(carte).getByRole('button', { name: 'Envoyer mon avis' });
    expect(envoyer).toBeDisabled();

    await user.click(within(carte).getByRole('button', { name: '4 étoiles sur 5' }));
    expect(within(carte).getByText('Très bien')).toBeInTheDocument();
    await user.type(within(carte).getByRole('textbox'), 'Agent ponctuel');
    await user.click(envoyer);

    await waitFor(() => expect(ecritures('/property-visits/901/feedback')).toHaveLength(1));
    expect(ecritures('/property-visits/901/feedback')[0].corps).toEqual({ role: 'customer', rating: 4, comment: 'Agent ponctuel' });
  });

  it('une visite déjà notée n’a plus de carte d’avis, et sa note se lit dans « Passées »', async () => {
    const notee = { ...RECENTE, rating: 3 };
    etat.terminees = [notee, ANCIENNE];
    etat.passees = [notee, ANCIENNE];
    monter();
    await screen.findByRole('heading', { name: /Passées/ });
    expect(document.querySelector('[data-slot="avis-du-client"]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Votre note : 3 sur 5' })).toBeInTheDocument();
  });
});

describe('la prochaine visite et les demandes', () => {
  beforeEach(() => {
    etat.confirmees = [STUDIO];
    etat.demandees = [DEMANDE];
  });

  it('la carte : le jour et l’heure, le bien, l’adresse, l’agent, Itinéraire, Proposer, Annuler ; la demande et sa tranche', async () => {
    monter();
    const carte = (await screen.findByText('Jeudi 12 nov. · 10:00')).closest('[data-slot="prochaine-visite-client"]') as HTMLElement;
    expect(within(carte).getByText('Studio meublé près de la VDN · Sacré-Cœur')).toBeInTheDocument();
    expect(within(carte).getByText('Rue SC-41, immeuble Ndoye · 30 min, en personne')).toBeInTheDocument();
    expect(within(carte).getByText('Sokhna Sène')).toBeInTheDocument();
    expect(within(carte).getByRole('link', { name: 'Itinéraire' })).toHaveAttribute('href', expect.stringContaining('14.71,-17.46'));
    expect(within(carte).getByRole('button', { name: 'Proposer un autre créneau' })).toBeInTheDocument();
    expect(within(carte).getByRole('button', { name: 'Annuler la visite' })).toBeInTheDocument();

    const attente = screen.getByRole('heading', { name: 'En attente de confirmation' }).closest('section') as HTMLElement;
    expect(within(attente).getByText('le matin, heure à fixer')).toBeInTheDocument();
    expect(within(attente).getByText(/Sam\. 14 nov\./)).toBeInTheDocument();
    expect(screen.getByText('1 visite confirmée · 1 en attente')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Passées/ })).toBeNull();
  });

  it('ne montre aucun geste du personnel, la prochaine visite et la demande rendues', async () => {
    monter();
    await screen.findByText('Jeudi 12 nov. · 10:00');
    expect(screen.getByRole('button', { name: 'Proposer un autre créneau' })).toBeInTheDocument();
    const gestes = screen.queryAllByRole('button').filter((b) => GESTES_DU_PERSONNEL.test(b.textContent?.trim() ?? ''));
    expect(gestes).toEqual([]);
    expect(screen.queryByRole('link', { name: /WhatsApp|Appeler/ })).toBeNull();
  });

  it('chaque section est un filtre du serveur, borné à la minute du montage', async () => {
    monter();
    await screen.findByText('Jeudi 12 nov. · 10:00');
    const borne = '2026-11-10T10:12:00.000Z';
    const l = lectures();
    expect(l.some((p) => p.get('filter[status]') === 'confirmed' && p.get('filter[scheduled_at_min]') === borne)).toBe(true);
    expect(l.some((p) => p.get('filter[status]') === 'scheduled' && p.get('filter[scheduled_at_min]') === borne)).toBe(true);
    expect(l.some((p) => !p.get('filter[status]') && p.get('filter[scheduled_at_max]') === borne)).toBe(true);
    expect(l.every((p) => p.get('fields[property_visits]')?.includes('rating'))).toBe(true);
  });

  it('« Annuler la visite » demande le motif et le poste', async () => {
    const user = userEvent.setup();
    monter();
    const carte = (await screen.findByText('Jeudi 12 nov. · 10:00')).closest('[data-slot="prochaine-visite-client"]') as HTMLElement;
    await user.click(within(carte).getByRole('button', { name: 'Annuler la visite' }));
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByRole('textbox'), 'empêchement');
    await user.click(within(dialogue).getByRole('button', { name: /Annuler la visite|Confirmer l’annulation/ }));
    await waitFor(() => expect(ecritures('/property-visits/910/cancel')).toHaveLength(1));
    expect(ecritures('/property-visits/910/cancel')[0].corps).toEqual({ reason: 'empêchement' });
  });
});

describe('joindre l’agent de la prochaine visite (contact servi par l’API au seul demandeur)', () => {
  const AGENT = { id: 3, first_name: 'Sokhna', last_name: 'Sène', agency_name: 'Dakar Immo' };
  const carte = async () => (await screen.findByText('Jeudi 12 nov. · 10:00')).closest('[data-slot="prochaine-visite-client"]') as HTMLElement;

  it('« Agent · Dakar Immo », Appeler (tel:) et WhatsApp (wa.me, son prénom et le bien), sans aucune écriture', async () => {
    etat.confirmees = [{ ...STUDIO, agent: { ...AGENT, phone: '+221771112233', phone_whatsapp: true } }];
    monter();
    const c = await carte();
    expect(within(c).getByText('Agent · Dakar Immo')).toBeInTheDocument();
    const appeler = within(c).getByRole('link', { name: 'Appeler Sokhna Sène' });
    expect(appeler).toHaveAttribute('href', 'tel:+221771112233');
    const whatsapp = within(c).getByRole('link', { name: 'Écrire à Sokhna Sène sur WhatsApp' });
    expect(whatsapp.getAttribute('href')).toBe(
      `https://wa.me/221771112233?text=${encodeURIComponent('Bonjour Sokhna, je vous écris au sujet de ma visite : Studio meublé près de la VDN.')}`,
    );
    expect(whatsapp).toHaveAttribute('target', '_blank');
    fireEvent.click(appeler);
    fireEvent.click(whatsapp);
    expect(ecritures('')).toEqual([]);
  });

  it('un numéro sans WhatsApp : Appeler seul', async () => {
    etat.confirmees = [{ ...STUDIO, agent: { ...AGENT, phone: '+221771112233', phone_whatsapp: false } }];
    monter();
    const c = await carte();
    expect(within(c).getByRole('link', { name: 'Appeler Sokhna Sène' })).toBeInTheDocument();
    expect(within(c).queryByRole('link', { name: /WhatsApp/ })).toBeNull();
  });

  it('aucun numéro servi : ni Appeler ni WhatsApp, l’agence reste dite', async () => {
    etat.confirmees = [{ ...STUDIO, agent: { ...AGENT, phone: null, phone_whatsapp: false } }];
    monter();
    const c = await carte();
    expect(within(c).getByText('Agent · Dakar Immo')).toBeInTheDocument();
    expect(within(c).queryByRole('link', { name: /Appeler|WhatsApp/ })).toBeNull();
  });

  it('sans le contact (clés absentes) : « Votre agent », aucun geste', async () => {
    etat.confirmees = [STUDIO];
    monter();
    const c = await carte();
    expect(within(c).getByText('Votre agent')).toBeInTheDocument();
    expect(within(c).queryByRole('link', { name: /Appeler|WhatsApp/ })).toBeNull();
  });
});

describe('les passées', () => {
  it('une visite annulée avant son heure n’échappe pas à la liste : elle est en tête des passées, avec son motif', async () => {
    etat.closesAVenir = [visite({ id: 920, status: 'cancelled', scheduled_at: '2026-11-20T10:00:00Z', cancellation_reason: 'empêchement' })];
    etat.passees = [ANCIENNE];
    monter();
    const passees = (await screen.findByRole('heading', { name: 'Passées' })).closest('section') as HTMLElement;
    expect(passees.querySelector('h2')?.parentElement).toHaveTextContent(/^Passées2$/);
    const lignes = within(passees).getAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    expect(within(lignes[0]).getByText('Motif : « empêchement »')).toBeInTheDocument();
    // Les tons de la maquette a-7 : l'annulée en rouge, la terminée neutre.
    expect(within(lignes[0]).getByText('Annulée').closest('[data-tone]')).toHaveAttribute('data-tone', 'danger');
    expect(within(lignes[1]).getByText('Terminée').closest('[data-tone]')).toHaveAttribute('data-tone', 'neutral');
  });

  it('la page suivante des passées ne vide pas la vue : l’avis en cours de saisie reste', async () => {
    const user = userEvent.setup();
    etat.terminees = [RECENTE];
    etat.passees = [RECENTE, ANCIENNE];
    etat.passeesPage2 = [visite({ id: 930, status: 'completed', scheduled_at: '2026-10-01T10:00:00Z', completed_at: '2026-10-01T10:30:00Z', rating: 5, property: { id: 60, title: 'Villa des Almadies', slug: 'villa', cover_url: null } })];
    monter();
    const carte = (await screen.findByText('Visité aujourd’hui à 06:00 avec Sokhna')).closest('[data-slot="avis-du-client"]') as HTMLElement;
    await user.type(within(carte).getByRole('textbox'), 'Très bon accueil');
    await user.click(screen.getByRole('button', { name: /Suivant/ }));
    expect(await screen.findByText('Villa des Almadies')).toBeInTheDocument();
    expect(screen.getByText('Page 2 sur 2')).toBeInTheDocument();
    expect(within(document.querySelector('[data-slot="avis-du-client"]') as HTMLElement).getByRole('textbox')).toHaveValue('Très bon accueil');
  });

  it('aucune visite : un état vide, pas trois sections vides', async () => {
    monter();
    expect(await screen.findByText('Aucune visite pour l’instant')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Passées/ })).toBeNull();
  });
});

// Contre-vérification de TCK-2587 — le plafond de 24 h n'était épinglé que par la fonction
// (`heuresRestantesPourLAvis`) : la CARTE est jugée ici, aux deux bords de la fenêtre.
describe('TCK-2587 — la fenêtre d’avis, sur la carte', () => {
  it('une visite close il y a 25 h n’a plus de carte d’avis : elle se lit dans « Passées »', async () => {
    const VINGT_CINQ_H = visite({ id: 940, status: 'completed', scheduled_at: '2026-11-09T08:30:00Z', completed_at: '2026-11-09T09:12:00Z' });
    etat.terminees = [VINGT_CINQ_H];
    etat.passees = [VINGT_CINQ_H];
    monter();
    const passees = (await screen.findByRole('heading', { name: 'Passées' })).closest('section') as HTMLElement;
    expect(within(passees).getByText('Appartement neuf')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="avis-du-client"]')).toBeNull();
    expect(screen.queryByText(/avis à donner/)).toBeNull();
  });

  it('une clôture datée dans le futur ouvre la carte, sans jamais promettre plus de 24 h', async () => {
    const FUTURE = visite({ id: 941, status: 'completed', scheduled_at: '2026-11-10T06:00:00Z', completed_at: '2026-11-11T16:12:00Z' });
    etat.terminees = [FUTURE];
    etat.passees = [FUTURE];
    monter();
    const carte = (await screen.findByText('encore 24 h')).closest('[data-slot="avis-du-client"]');
    expect(carte).not.toBeNull();
    expect(screen.queryByText('encore 54 h')).toBeNull();
  });
});
