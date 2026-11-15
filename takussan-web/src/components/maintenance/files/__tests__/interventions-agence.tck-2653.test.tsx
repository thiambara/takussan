/**
 * TCK-2653 — « Interventions » de l'agence : les files d'attente, comptées par UN appel au résumé,
 * avec l'attente sur chaque carte et un geste par file.
 *
 * Le réseau est un faux serveur derrière `apiRequest` : chaque requête est relevée comme on la lirait
 * dans l'onglet Réseau (AC1, AC2). Le serveur range lui-même chaque demande dans sa file
 * (`filter[file]`) : ce faux serveur rend, pour chaque file, les demandes qu'on lui a données.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { FileDIntervention, InterventionEnFile } from '@/lib/maintenance/files';

const F = fr.maintenance.files;
const reseau = vi.hoisted(() => ({ appels: [] as { chemin: string; methode: string }[] }));
const nav = vi.hoisted(() => {
  let query = '';
  const abonnes = new Set<() => void>();
  return {
    get query() {
      return query;
    },
    poser(q: string) {
      query = q.replace(/^\?/, '');
      abonnes.forEach((f) => f());
    },
    abonner(f: () => void) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.abonner, () => nav.query, () => nav.query)),
  useRouter: () => ({ replace: (url: string) => nav.poser(url.split('?')[1] ?? ''), push: vi.fn() }),
  usePathname: () => '/app/maintenance',
}));
vi.mock('@/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/AuthContext')>()),
  useAuth: () => ({ token: 'jeton', user: { id: 1, agency_id: 1, roles: ['agency_admin'] } }),
}));

const RESUME = { a_dispatcher: 4, en_retard: 1, chez_le_bailleur: 1, en_cours: 2, a_confirmer: 1, terminees: 40, a_accepter: 0 };
const J = 86_400_000;
const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString();
const dans = (ms: number) => new Date(Date.now() + ms).toISOString();

function demande(id: number, file: FileDIntervention, extra: Partial<InterventionEnFile> = {}): InterventionEnFile {
  return {
    id,
    property_id: 70 + id,
    lease_id: null,
    requester_id: 10,
    assigned_to: null,
    title: `Demande ${id}`,
    description: '',
    category: 'plumbing',
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
    created_at: ilYA(J),
    property: { id: 70 + id, title: `Bien ${id}`, slug: null, location: { quarter: 'Almadies' } },
    requester: { id: 10, name: 'Astou Seck' },
    assignee: null,
    file,
    waiting_on: 'agency',
    waiting_since: ilYA(J),
    slot_overdue_days: null,
    auto_close_at: null,
    ...extra,
  };
}

const PRESTATAIRE = { id: 20, name: 'Oumy Samb' };
const FILES: Record<string, InterventionEnFile[]> = {};
function poserLesFiles() {
  FILES.a_dispatcher = [
    demande(8, 'a_dispatcher', { title: 'Nettoyage de la cage d’escalier', category: 'cleaning', created_at: ilYA(57 * J), waiting_since: ilYA(57 * J) }),
    demande(110, 'a_dispatcher', { priority: 'urgent', title: 'Fuite sous l’évier', waiting_since: ilYA(2 * 3_600_000) }),
  ];
  FILES.en_retard = [demande(28, 'en_retard', { status: 'assigned', assigned_to: 20, assignee: PRESTATAIRE, scheduled_at: ilYA(15 * J), slot_overdue_days: 15, waiting_on: 'provider', title: 'Souris dans le magasin' })];
  FILES.chez_le_bailleur = [demande(30, 'chez_le_bailleur', { status: 'awaiting_owner', assigned_to: 20, assignee: PRESTATAIRE, quote_amount: 485_000, quote_currency: 'XOF', waiting_on: 'owner', waiting_since: ilYA(4 * J), title: 'Étanchéité de la terrasse' })];
  FILES.en_cours = [demande(40, 'en_cours', { status: 'assigned', assigned_to: 20, assignee: PRESTATAIRE, scheduled_at: dans(J), waiting_on: 'provider', title: 'Peinture du séjour' })];
  FILES.a_confirmer = [demande(50, 'a_confirmer', { status: 'completed', assigned_to: 20, assignee: PRESTATAIRE, completed_at: ilYA(J), auto_close_at: dans(6 * J), waiting_on: 'tenant', title: 'Chasse d’eau qui fuit' })];
  FILES.terminees = [demande(60, 'terminees', { status: 'closed', assigned_to: 20, assignee: PRESTATAIRE, waiting_on: 'none', title: 'Prise du salon' })];
}

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode });
      const url = new URL(chemin, 'http://api.test');
      if (url.pathname === '/api/maintenance-requests/summary') return { data: RESUME };
      if (url.pathname === '/api/maintenance-requests') {
        const file = url.searchParams.get('filter[file]');
        // Sans file : l'ancienne liste (vue « Liste »), tous statuts confondus.
        const lignes = file ? (FILES[file] ?? []) : Object.values(FILES).flat();
        return { data: lignes, meta: { current_page: 1, last_page: 1, per_page: 10, total: lignes.length, abilities: { can_create: true } } };
      }
      if (url.pathname === '/api/properties') return { data: [], meta: { current_page: 1, last_page: 1, per_page: 8, total: 0 } };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { InterventionsDeLAgence } = await import('@/components/maintenance/files/InterventionsDeLAgence');

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utilisateur = userEvent.setup();
  render(withIntl(<QueryClientProvider client={client}>{<InterventionsDeLAgence />}</QueryClientProvider>));
  return utilisateur;
}

const requetes = (chemin: string) =>
  reseau.appels.filter((a) => new URL(a.chemin, 'http://api.test').pathname === chemin).map((a) => new URL(a.chemin, 'http://api.test').searchParams);
const telephone = () => document.querySelector<HTMLElement>('[data-slot="files-du-telephone"]')!;
const bureau = () => document.querySelector<HTMLElement>('[data-slot="files-du-bureau"]')!;
const section = (racine: HTMLElement, file: FileDIntervention) => racine.querySelector<HTMLElement>(`[data-file="${file}"]`)!;

beforeEach(() => {
  reseau.appels.length = 0;
  nav.poser('');
  poserLesFiles();
});

describe('TCK-2653 — les files de l’agence', () => {
  it('AC2 — les pastilles et les colonnes portent les comptes du résumé, lu en UN appel', async () => {
    rendre();
    const puces = await screen.findByRole('group', { name: F.pastilles });
    await waitFor(() => expect(within(puces).getByRole('button', { name: new RegExp(`${F.noms.a_dispatcher}\\s*4`) })).toBeInTheDocument());
    expect(within(puces).getByRole('button', { name: new RegExp(`${F.noms.en_retard}\\s*1`) })).toBeInTheDocument();
    expect(within(puces).getByRole('button', { name: new RegExp(`${F.noms.en_cours}\\s*2`) })).toBeInTheDocument();
    expect(within(bureau()).getByRole('heading', { name: new RegExp(`${F.noms.a_dispatcher}\\s*4`) })).toBeInTheDocument();
    expect(within(bureau()).getByRole('heading', { name: new RegExp(`${F.noms.a_confirmer}\\s*1`) })).toBeInTheDocument();
    // Le sous-titre : 4 + 1 + 1 + 2 + 1 = 9 en attente d'un geste, 40 terminées.
    expect(screen.getByText('9 en attente d’un geste · 40 terminées')).toBeInTheDocument();
    expect(requetes('/api/maintenance-requests/summary')).toHaveLength(1);
  });

  it('AC1 — « À dispatcher » vient en premier, avec #8 et « Ouverte depuis 57 j » en ambre', async () => {
    rendre();
    const puces = await screen.findByRole('group', { name: F.pastilles });
    expect(within(puces).getAllByRole('button')[0]).toHaveTextContent(F.noms.a_dispatcher);
    const premiere = telephone().querySelector<HTMLElement>('section')!;
    expect(premiere.dataset.file).toBe('a_dispatcher');
    const carte = await waitFor(() => {
      const c = premiere.querySelector<HTMLElement>('[data-id="8"]');
      expect(c).not.toBeNull();
      return c!;
    });
    const attente = carte.querySelector<HTMLElement>('[data-slot="attente"]')!;
    expect(attente).toHaveTextContent(/^Ouverte depuis 57\s?j$/);
    expect(attente.dataset.ton).toBe('ambre');
  });

  it('AC1 — aucune demande terminée avant « Terminées » : les cinq files seules sont lues, pas la liste', async () => {
    rendre();
    await within(telephone()).findByText('Chasse d’eau qui fuit');
    const lues = requetes('/api/maintenance-requests').map((p) => p.get('filter[file]'));
    expect(new Set(lues)).toEqual(new Set(['a_dispatcher', 'en_retard', 'chez_le_bailleur', 'en_cours', 'a_confirmer']));
    expect(screen.queryByText('Prise du salon')).not.toBeInTheDocument();
    // Chaque lecture porte les colonnes sans lesquelles l'API ne range pas la demande.
    for (const p of requetes('/api/maintenance-requests')) {
      expect(p.get('fields[maintenance_requests]')?.split(',')).toEqual(expect.arrayContaining(['status', 'assigned_to', 'scheduled_at']));
      expect(p.get('include')).toBe('property,requester,assignee');
    }
  });

  it('« Terminées » ouvre la file des terminées, avec leur statut', async () => {
    const utilisateur = rendre();
    const puces = await screen.findByRole('group', { name: F.pastilles });
    await utilisateur.click(within(puces).getByRole('button', { name: F.noms.terminees }));
    expect(await screen.findByText('Prise du salon')).toBeInTheDocument();
    expect(requetes('/api/maintenance-requests').some((p) => p.get('filter[file]') === 'terminees')).toBe(true);
    expect(nav.query).toBe('vue=terminees');
  });

  it('un geste par file : « Choisir un prestataire » à dispatcher, « Relancer » et « Réassigner » en retard', async () => {
    rendre();
    const dispatcher = section(telephone(), 'a_dispatcher');
    const choisir = await within(dispatcher).findAllByRole('link', { name: F.gestes.choisir });
    expect(choisir).toHaveLength(2);
    expect(choisir[0]).toHaveAttribute('href', '/app/maintenance/8?geste=choisir');
    const retard = section(telephone(), 'en_retard');
    await within(retard).findByText('Souris dans le magasin');
    expect(within(retard).getByRole('link', { name: F.gestes.relancer })).toHaveAttribute('href', '/app/maintenance/28?geste=relancer');
    expect(within(retard).getByRole('link', { name: F.gestes.reassigner })).toHaveAttribute('href', '/app/maintenance/28?geste=reassigner');
    expect(within(retard).getByText('Confiée à Oumy Samb')).toBeInTheDocument();
    const attente = retard.querySelector<HTMLElement>('[data-slot="attente"]')!;
    expect(attente).toHaveTextContent(/dépassé de 15\s?j$/);
    expect(attente.dataset.ton).toBe('rouge');
    const bailleur = section(telephone(), 'chez_le_bailleur');
    await within(bailleur).findByText('Étanchéité de la terrasse');
    expect(within(bailleur).getByRole('link', { name: F.gestes.voirDevis })).toBeInTheDocument();
    expect(bailleur.querySelector('[data-slot="attente"]')).toHaveAttribute('data-ton', 'ambre');
    // « En cours » et « À confirmer » : des lignes compactes, sans geste.
    for (const f of ['en_cours', 'a_confirmer'] as const) {
      const s = section(telephone(), f);
      await waitFor(() => expect(s.querySelector('[data-slot="ligne-de-file"]')).not.toBeNull());
      expect(s.querySelector('[data-slot="gestes"]')).toBeNull();
    }
    expect(within(section(telephone(), 'a_confirmer')).getByText(/clôture dans 6\s?j$/)).toBeInTheDocument();
  });

  it('la priorité se lit en pastille ; la section « Urgences prioritaires » n’existe plus', async () => {
    rendre();
    const carte = await waitFor(() => {
      const c = section(telephone(), 'a_dispatcher').querySelector<HTMLElement>('[data-id="110"]');
      expect(c).not.toBeNull();
      return c!;
    });
    expect(within(carte).getByText(fr.maintenance.priority.urgent)).toBeInTheDocument();
    expect(screen.queryByText(fr.maintenance.list.urgent_heading)).not.toBeInTheDocument();
  });

  it('AC6 — au bureau, les cinq colonnes dans l’ordre, en une grille de cinq pistes', async () => {
    rendre();
    const grille = bureau().firstElementChild as HTMLElement;
    expect(grille.className).toContain('grid-cols-5');
    expect(grille.className).toContain('xl:min-w-0');
    expect([...grille.querySelectorAll<HTMLElement>(':scope > section')].map((s) => s.dataset.file)).toEqual(['a_dispatcher', 'en_retard', 'chez_le_bailleur', 'en_cours', 'a_confirmer']);
    await within(section(bureau(), 'a_dispatcher')).findByText('Nettoyage de la cage d’escalier');
  });

  it('les filtres de l’URL s’appliquent au résumé ET à chaque file', async () => {
    nav.poser('priorite=urgent&metier=plumbing');
    rendre();
    await waitFor(() => expect(requetes('/api/maintenance-requests/summary')).toHaveLength(1));
    const resume = requetes('/api/maintenance-requests/summary')[0];
    expect(resume.get('filter[priority]')).toBe('urgent');
    expect(resume.get('filter[category]')).toBe('plumbing');
    expect(resume.get('filter[file]')).toBeNull();
    await waitFor(() => expect(requetes('/api/maintenance-requests').length).toBeGreaterThanOrEqual(5));
    for (const p of requetes('/api/maintenance-requests')) expect(p.get('filter[priority]')).toBe('urgent');
  });

  it('`?status=` (TCK-1727) ouvre la vue « Liste » sur ce statut, sans la section des urgences', async () => {
    nav.poser('status=open');
    rendre();
    await screen.findByText('Fuite sous l’évier');
    const liste = requetes('/api/maintenance-requests').find((p) => p.get('filter[file]') === null);
    expect(liste?.get('filter[status]')).toBe('open');
    expect(screen.queryByText(fr.maintenance.list.urgent_heading)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: F.vues.liste })).toHaveAttribute('aria-pressed', 'true');
  });

  it('le quartier se tait quand le titre du bien le nomme déjà', async () => {
    FILES.a_dispatcher = [demande(8, 'a_dispatcher', { property: { id: 78, title: 'Bureaux à Hann Maristes 1', slug: null, location: { quarter: 'Hann Maristes 1' } } }), demande(9, 'a_dispatcher')];
    rendre();
    const dispatcher = section(telephone(), 'a_dispatcher');
    expect(await within(dispatcher).findByText('Bureaux à Hann Maristes 1 · Astou Seck')).toBeInTheDocument();
    expect(within(dispatcher).getByText('Bien 9 · Almadies · Astou Seck')).toBeInTheDocument();
  });

  it('« Signaler une intervention » suit `meta.abilities.can_create`', async () => {
    rendre();
    expect(await screen.findByRole('link', { name: F.signaler })).toHaveAttribute('href', '/app/maintenance/new');
    expect(screen.getAllByRole('link', { name: F.prestataires })[0]).toHaveAttribute('href', '/app/maintenance/providers');
  });
});
