/**
 * TCK-2653 — la fiche d'une intervention pour l'agence : UN geste principal selon la file, « Autre
 * action » pour le reste.
 *
 * Le réseau est un faux serveur derrière `apiRequest` : il rend la demande, ses suggestions, le carnet,
 * et applique le `PATCH` d'assignation comme le ferait l'API (la demande passe « En cours »). Les
 * requêtes sont relevées comme on les lirait dans l'onglet Réseau (AC4).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import type { MaintenanceAbilities } from '@/types/maintenance';

const FI = fr.maintenance.fiche;
const reseau = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  demande: null as unknown as InterventionEnFile,
  suggestions: [] as unknown[],
  carnet: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/maintenance/8',
}));
vi.mock('@/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/AuthContext')>()),
  useAuth: () => ({ token: 'jeton', user: { id: 1, agency_id: 1, roles: ['agency_admin'] } }),
}));
// L'invitation monte sa propre mutation : hors sujet ici.
vi.mock('@/components/service-providers/InviteServiceProviderSheet', () => ({ InviteServiceProviderSheet: () => null }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode, corps: options.body });
      const url = new URL(chemin, 'http://api.test');
      const d = reseau.demande;
      if (url.pathname === `/api/maintenance-requests/${d.id}` && methode === 'GET') return { data: d };
      if (url.pathname === `/api/maintenance-requests/${d.id}` && methode === 'PATCH') {
        const corps = options.body as { assigned_to: number; scheduled_at: string | null };
        // Ce que fait l'API (`MaintenanceRequestService::assign()`) : la demande quitte « À dispatcher ».
        reseau.demande = {
          ...d,
          ...corps,
          status: 'assigned',
          file: 'en_cours',
          waiting_on: 'provider',
          assignee: { id: corps.assigned_to, name: 'Cheikh Gueye' },
          abilities: { ...d.abilities!, transitions: ['in_progress', 'cancelled'] },
        };
        return { data: reseau.demande };
      }
      if (url.pathname === `/api/maintenance-requests/${d.id}/status` && methode === 'PUT') return { data: d };
      if (url.pathname === `/api/maintenance-requests/${d.id}/suggested-providers`) return { data: reseau.suggestions };
      if (url.pathname === '/api/agencies/1/service-providers') return { data: reseau.carnet, meta: { current_page: 1, last_page: 1, per_page: 100, total: reseau.carnet.length } };
      if (url.pathname === '/api/agencies/1/members') return { data: [] };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { FicheDIntervention } = await import('@/components/maintenance/fiche/FicheDIntervention');
const { FournisseurDEnTete, useDeclarationDEnTete } = await import('@/components/layout/en-tete-de-la-coque');
const { FeuilleDuBas } = await import('@/components/ui/feuille-du-bas');

/** La coque du téléphone, réduite à « ⋯ » : la feuille rend ce que la page déclare (`actions`), comme `EnTeteMobile`. */
function PlusDActions() {
  const { actions } = useDeclarationDEnTete();
  return actions ? (
    <FeuilleDuBas titre="Intervention" declencheur={<button type="button" aria-label="Plus d’actions" />}>
      {actions}
    </FeuilleDuBas>
  ) : null;
}

const ABILITIES: MaintenanceAbilities = {
  can_manage_quotes: true,
  can_request_quote: true,
  can_decide_quote: false,
  can_view_quote_pdf: false,
  can_submit_quote: false,
  can_accept: false,
  can_decline: false,
  can_assign: true,
  can_complete: true,
  can_upload_before_photos: false,
  can_confirm_resolution: false,
  can_contest_resolution: false,
  // Les abilities de #8 dans la démo, relevées le 2026-11-13.
  transitions: ['acknowledged', 'assigned', 'in_progress', 'cancelled'],
};

// 10 h 30 à Dakar (UTC+0) : « Demain 9 h » est le 14 à 09:00 Z.
const MAINTENANT = new Date('2026-11-13T10:30:00Z');

function demande(extra: Partial<InterventionEnFile> = {}): InterventionEnFile {
  return {
    id: 8,
    property_id: 78,
    lease_id: null,
    requester_id: 10,
    assigned_to: null,
    title: 'Nettoyage de la cage d’escalier',
    description: 'La cage d’escalier n’a pas été nettoyée depuis un mois.',
    category: 'cleaning',
    priority: 'normal',
    status: 'open',
    estimated_cost: null,
    actual_cost: null,
    quote_amount: null,
    quote_currency: null,
    quote_submitted_at: null,
    quote_decision_at: null,
    quote_decision_by_id: null,
    quote_rejection_reason: null,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    resolution_notes: null,
    created_at: '2026-09-14T20:56:29Z',
    property: { id: 78, title: 'Immeuble Mermoz', slug: null, agency: { id: 1, name: 'Dakar Immo' }, location: { quarter: 'Mermoz' } },
    requester: { id: 10, name: 'Astou Seck' },
    assignee: null,
    file: 'a_dispatcher',
    waiting_on: 'agency',
    waiting_since: '2026-09-14T20:56:29Z',
    slot_overdue_days: null,
    auto_close_at: null,
    abilities: ABILITIES,
    ...extra,
  } as InterventionEnFile;
}

const SUGGESTION = {
  id: 7,
  user_id: 181,
  name: 'Cheikh Gueye',
  phone: null,
  matching_trade: 'cleaning',
  matching_zone: 'Mermoz',
  service_areas: ['Mermoz'],
  average_rating: 4.6,
  reviews_count: 12,
  completed_interventions_count: 23,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: MAINTENANT });
  reseau.appels = [];
  reseau.demande = demande();
  reseau.suggestions = [SUGGESTION];
  reseau.carnet = [];
});
afterEach(() => {
  vi.useRealTimers();
});

function rendre({ coque = false }: { coque?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utilisateur = userEvent.setup();
  const fiche = <FicheDIntervention id={8} />;
  render(
    withIntl(
      <QueryClientProvider client={client}>
        {coque ? (
          <FournisseurDEnTete>
            <PlusDActions />
            {fiche}
          </FournisseurDEnTete>
        ) : (
          fiche
        )}
      </QueryClientProvider>,
    ),
  );
  return utilisateur;
}

const fiche = () => document.querySelector<HTMLElement>('[data-slot="fiche-d-intervention"]');
const geste = () => {
  const g = document.querySelector<HTMLElement>('[data-slot="geste-principal"]');
  if (!g) throw new Error('la fiche n’est pas encore rendue');
  return g;
};
/** Attend la carte de la suggestion (le nom figure deux fois : en clair et dans le bouton, pour les lecteurs d'écran). */
const suggestion = () => waitFor(() => {
  const s = geste().querySelector<HTMLElement>('[data-slot="suggestion"]');
  if (!s) throw new Error('pas encore de suggestion');
  return s;
});
const ecritures = () => reseau.appels.filter((a) => a.methode !== 'GET');

describe('Fiche — à dispatcher (AC3)', () => {
  it('le geste principal est « Prestataire et créneau », avec la suggestion de l’API', async () => {
    rendre();
    await waitFor(() => expect(fiche()).toHaveAttribute('data-geste', 'choisir'));
    expect(within(geste()).getByRole('heading', { name: new RegExp(FI.choix.titre) })).toBeInTheDocument();
    expect(await suggestion()).toHaveTextContent('Cheikh Gueye');
    // Aucun envoi tant que rien n'est choisi.
    for (const b of screen.getAllByRole('button', { name: FI.choix.choisirDAbord })) expect(b).toBeDisabled();
  });

  it('« Autre action » ne propose que les transitions permises, sans « Assignée » ni « Terminée »', async () => {
    const u = rendre();
    await waitFor(() => expect(fiche()).not.toBeNull());
    // Le menu du bureau (le premier « Autre action » ; le second est la feuille du téléphone).
    await u.click(screen.getAllByRole('button', { name: new RegExp(FI.autre.bouton) })[0]);
    const menu = await screen.findByRole('menu');
    const actions = [...menu.querySelectorAll('[data-action]')].map((e) => e.getAttribute('data-action'));
    expect(actions).toEqual(['devis', 'transition-acknowledged', 'transition-in_progress', 'priorite', 'annuler']);
    expect(within(menu).queryByText(fr.maintenance.status.completed)).toBeNull();
    expect(within(menu).queryByText(fr.maintenance.status.assigned)).toBeNull();
    expect(within(menu).getByText(FI.autre.transitions.acknowledged.titre)).toBeInTheDocument();
  });

  it('annuler se confirme avant d’écrire', async () => {
    const u = rendre();
    await waitFor(() => expect(fiche()).not.toBeNull());
    await u.click(screen.getAllByRole('button', { name: new RegExp(FI.autre.bouton) })[0]);
    await u.click(await screen.findByText(FI.autre.annuler.texte));
    expect(ecritures()).toEqual([]);
    const dialogue = await screen.findByRole('dialog', { name: FI.autre.annuler.confirmerTitre });
    await u.click(within(dialogue).getByRole('button', { name: FI.autre.annuler.confirmer }));
    await waitFor(() => expect(ecritures()).toEqual([{ chemin: '/api/maintenance-requests/8/status', methode: 'PUT', corps: { status: 'cancelled' } }]));
  });
});

describe('Fiche — « Autre action » au téléphone, dans « ⋯ »', () => {
  it('la page déclare ses entrées à l’en-tête ; « Prendre en compte » écrit la transition', async () => {
    const u = rendre({ coque: true });
    await waitFor(() => expect(fiche()).not.toBeNull());
    await u.click(await screen.findByRole('button', { name: 'Plus d’actions' }));
    const liste = await waitFor(() => document.querySelector<HTMLElement>('[data-slot="autre-action-liste"]')!);
    expect([...liste.querySelectorAll('[data-action]')].map((e) => e.getAttribute('data-action'))).toEqual(['devis', 'transition-acknowledged', 'transition-in_progress', 'priorite', 'annuler']);
    await u.click(within(liste).getByText(FI.autre.transitions.acknowledged.titre));
    await waitFor(() => expect(ecritures()).toEqual([{ chemin: '/api/maintenance-requests/8/status', methode: 'PUT', corps: { status: 'acknowledged' } }]));
  });

  it('« Annuler la demande » ferme « ⋯ » et ouvre la confirmation, qui reste montée', async () => {
    const u = rendre({ coque: true });
    await waitFor(() => expect(fiche()).not.toBeNull());
    await u.click(await screen.findByRole('button', { name: 'Plus d’actions' }));
    const liste = await waitFor(() => document.querySelector<HTMLElement>('[data-slot="autre-action-liste"]')!);
    await u.click(within(liste).getByText(FI.autre.annuler.texte));
    const dialogue = await screen.findByRole('dialog', { name: FI.autre.annuler.confirmerTitre });
    expect(ecritures()).toEqual([]);
    await u.click(within(dialogue).getByRole('button', { name: FI.autre.annuler.confirmer }));
    await waitFor(() => expect(ecritures()).toEqual([{ chemin: '/api/maintenance-requests/8/status', methode: 'PUT', corps: { status: 'cancelled' } }]));
  });
});

describe('Fiche — envoyer au prestataire (AC4)', () => {
  it('choisir Cheikh Gueye et « Demain 9 h » envoie le compte et le créneau, puis la fiche passe au suivi', async () => {
    const u = rendre();
    await suggestion();
    await u.click(within(geste()).getByRole('button', { name: /Cheikh Gueye/ }));
    await u.click(within(geste()).getByRole('button', { name: FI.choix.creneaux.demain9 }));
    const envoyer = within(geste()).getByRole('button', { name: 'Envoyer à Cheikh Gueye' });
    expect(envoyer).toBeEnabled();
    await u.click(envoyer);

    await waitFor(() =>
      expect(ecritures()).toEqual([{ chemin: '/api/maintenance-requests/8', methode: 'PATCH', corps: { assigned_to: 181, scheduled_at: '2026-11-14T09:00:00Z' } }]),
    );
    // La fiche relue : la demande est confiée, le geste devient le suivi.
    await waitFor(() => expect(fiche()).toHaveAttribute('data-geste', 'suivi'));
    expect(within(geste()).getByText('Confiée à Cheikh Gueye')).toBeInTheDocument();
  });

  it('sans créneau choisi, l’assignation part sans `scheduled_at`', async () => {
    const u = rendre();
    await suggestion();
    await u.click(within(geste()).getByRole('button', { name: /Cheikh Gueye/ }));
    await u.click(within(geste()).getByRole('button', { name: 'Envoyer à Cheikh Gueye' }));
    await waitFor(() => expect(ecritures()[0]?.corps).toEqual({ assigned_to: 181, scheduled_at: null }));
  });

  it('sans suggestion, le carnet s’ouvre de lui-même', async () => {
    reseau.suggestions = [];
    reseau.carnet = [{ id: 3, user_id: 103, status: 'active', specialties: null, service_areas: ['Ouakam'], metadata: null, created_at: null, phone: null, user: { id: 103, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' } }];
    rendre();
    expect(await waitFor(() => within(geste()).getByRole('button', { name: /Fatou Sarr/ }))).toBeInTheDocument();
    expect(within(geste()).getByText(new RegExp('Aucun prestataire du carnet'))).toBeInTheDocument();
  });
});

describe('Fiche — en retard : relancer', () => {
  const enRetard = (extra: Partial<InterventionEnFile> = {}) =>
    demande({
      id: 8,
      status: 'assigned',
      file: 'en_retard',
      assigned_to: 20,
      assignee: { id: 20, name: 'Oumy Samb' },
      scheduled_at: '2026-10-29T09:00:00Z',
      slot_overdue_days: 15,
      waiting_on: 'provider',
      abilities: { ...ABILITIES, transitions: ['in_progress', 'cancelled'] },
      ...extra,
    });

  it('WhatsApp au numéro du carnet, message prérempli', async () => {
    reseau.demande = enRetard();
    reseau.carnet = [{ id: 4, user_id: 20, status: 'active', specialties: null, service_areas: null, metadata: null, created_at: null, phone: '+221770000001', user: { id: 20, first_name: 'Oumy', last_name: 'Samb', email: 'o@example.test' } }];
    rendre();
    await waitFor(() => expect(fiche()).toHaveAttribute('data-geste', 'relancer'));
    const lien = await within(geste()).findByRole('link', { name: FI.geste.relancer });
    const href = new URL(lien.getAttribute('href')!);
    expect(href.host).toBe('wa.me');
    expect(href.pathname).toBe('/221770000001');
    expect(href.searchParams.get('text')).toContain('Nettoyage de la cage d’escalier');
    expect(within(geste()).getByRole('link', { name: FI.geste.appeler })).toHaveAttribute('href', expect.stringMatching(/^tel:/));
  });

  it('sans numéro joignable, la fiche dit pourquoi au lieu d’un lien mort', async () => {
    reseau.demande = enRetard();
    reseau.carnet = [];
    rendre();
    await waitFor(() => expect(fiche()).toHaveAttribute('data-geste', 'relancer'));
    expect(await within(geste()).findByText(/Oumy Samb n’est pas dans le carnet actif/)).toBeInTheDocument();
    expect(within(geste()).queryByRole('link', { name: FI.geste.relancer })).toBeNull();
  });

  it('« Réassigner » ouvre le choix du prestataire', async () => {
    reseau.demande = enRetard();
    const u = rendre();
    await waitFor(() => expect(fiche()).toHaveAttribute('data-geste', 'relancer'));
    await u.click(within(geste()).getByRole('button', { name: FI.geste.reassigner }));
    expect(within(geste()).getByRole('heading', { name: new RegExp(FI.choix.titreReassigner) })).toBeInTheDocument();
  });
});
