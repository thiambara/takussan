/**
 * TCK-2786 — « Relancer le bailleur » sur la carte « Chez le bailleur » et sur la fiche, et le
 * journal de la fiche (AC6).
 *
 * Le réseau est un faux serveur derrière `apiRequest` : il rend la demande, son journal, et applique
 * la relance comme l'API (`owner_reminded_at` posé, `can_remind_owner` à faux), ou la refuse en 409.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import type { EntreeDuJournal } from '@/lib/queries/maintenance';
import type { MaintenanceAbilities } from '@/types/maintenance';

const R = fr.maintenance.relanceDuBailleur;
const J = fr.maintenance.journal;
const reseau = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string }[],
  demande: null as unknown as InterventionEnFile,
  journal: [] as unknown[],
  refus: null as null | { code: string; params?: Record<string, string> },
  attente: null as null | Promise<void>,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/maintenance/30',
}));
vi.mock('@/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/AuthContext')>()),
  useAuth: () => ({ token: 'jeton', user: { id: 1, agency_id: 1, roles: ['agency_admin'] } }),
}));
vi.mock('@/components/service-providers/InviteServiceProviderSheet', () => ({ InviteServiceProviderSheet: () => null }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode });
      const url = new URL(chemin, 'http://api.test');
      const d = reseau.demande;
      if (url.pathname === `/api/maintenance-requests/${d.id}` && methode === 'GET') return { data: d };
      if (url.pathname === `/api/maintenance-requests/${d.id}/journal`) {
        return { data: reseau.journal, meta: { current_page: 1, last_page: 1, per_page: 100, total: reseau.journal.length } };
      }
      if (url.pathname === `/api/maintenance-requests/${d.id}/owner-reminders` && methode === 'POST') {
        if (reseau.attente) await reseau.attente;
        if (reseau.refus) throw new reel.ApiError(409, { message: 'refus', ...reseau.refus });
        reseau.demande = { ...d, owner_reminded_at: new Date().toISOString(), abilities: { ...d.abilities!, can_remind_owner: false } };
        return { data: reseau.demande };
      }
      if (url.pathname === '/api/agencies/1/service-providers') return { data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { CarteDeFile, CarteDeColonne } = await import('@/components/maintenance/files/CartesDIntervention');
const { FicheDIntervention } = await import('@/components/maintenance/fiche/FicheDIntervention');

const MAINTENANT = new Date('2026-11-13T10:30:00Z');
const ABILITIES: MaintenanceAbilities = {
  can_manage_quotes: true,
  can_request_quote: false,
  can_decide_quote: false,
  can_view_quote_pdf: false,
  can_submit_quote: false,
  can_accept: false,
  can_decline: false,
  can_assign: true,
  can_complete: false,
  can_upload_before_photos: false,
  can_confirm_resolution: false,
  can_contest_resolution: false,
  can_remind_owner: true,
  can_view_journal: true,
  transitions: ['cancelled'],
};

function demande(extra: Partial<InterventionEnFile> = {}): InterventionEnFile {
  return {
    id: 30,
    property_id: 78,
    lease_id: null,
    requester_id: 10,
    assigned_to: 20,
    title: 'Étanchéité de la terrasse',
    description: 'L’eau passe par la terrasse.',
    category: 'plumbing',
    priority: 'normal',
    status: 'awaiting_owner',
    estimated_cost: null,
    actual_cost: null,
    quote_amount: 485_000,
    quote_currency: 'XOF',
    quote_submitted_at: '2026-11-09T10:00:00Z',
    quote_decision_at: null,
    quote_decision_by_id: null,
    quote_rejection_reason: null,
    owner_reminded_at: null,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    resolution_notes: null,
    created_at: '2026-11-08T10:12:00Z',
    property: { id: 78, title: 'Villa Sacré-Cœur', slug: null, agency: { id: 1, name: 'Dakar Immo' }, location: { quarter: 'Sacré-Cœur' } },
    requester: { id: 10, name: 'Ousmane Niang' },
    assignee: { id: 20, name: 'Astou Sy' },
    file: 'chez_le_bailleur',
    waiting_on: 'owner',
    waiting_since: '2026-11-09T10:00:00Z',
    slot_overdue_days: null,
    auto_close_at: null,
    abilities: ABILITIES,
    ...extra,
  } as InterventionEnFile;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: MAINTENANT });
  reseau.appels = [];
  reseau.demande = demande();
  reseau.journal = [];
  reseau.refus = null;
  reseau.attente = null;
});
afterEach(() => {
  vi.useRealTimers();
});

function rendre(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utilisateur = userEvent.setup();
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
  return utilisateur;
}
const posts = () => reseau.appels.filter((a) => a.methode === 'POST').map((a) => a.chemin);

describe('la carte « Chez le bailleur »', () => {
  it('relance en un geste, sans quitter la liste', async () => {
    const u = rendre(<CarteDeFile i={reseau.demande} maintenant={MAINTENANT} />);
    expect(screen.getByRole('link', { name: fr.maintenance.files.gestes.voirDevis })).toBeTruthy();
    await u.click(screen.getByRole('button', { name: R.relancer }));
    await waitFor(() => expect(posts()).toEqual(['/api/maintenance-requests/30/owner-reminders']));
  });

  it('après une relance, dit « Relancé il y a … » et le geste est inactif', () => {
    rendre(<CarteDeFile i={demande({ owner_reminded_at: '2026-11-13T08:30:00Z' })} maintenant={MAINTENANT} />);
    const bouton = screen.getByRole('button', { name: /Relancé il y a 2\s?h/ });
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: R.relancer })).toBeNull();
  });

  it('24 heures après, la relance redevient possible', () => {
    rendre(<CarteDeFile i={demande({ owner_reminded_at: '2026-11-12T10:30:00Z' })} maintenant={MAINTENANT} />);
    expect(screen.getByRole('button', { name: R.relancer })).toBeTruthy();
  });

  it('au bureau, la carte de colonne porte « Relancer le bailleur » seul (maquette)', () => {
    rendre(<CarteDeColonne i={reseau.demande} maintenant={MAINTENANT} />);
    const gestes = document.querySelector<HTMLElement>('[data-slot="gestes"]')!;
    expect(within(gestes).getByRole('button', { name: R.relancer })).toBeTruthy();
    expect(within(gestes).queryByRole('link')).toBeNull();
  });

  it('un refus de cadence dit le délai restant, tiré d’available_at, et quand la relance sera permise', async () => {
    reseau.refus = { code: 'maintenance.owner_reminder_too_soon', params: { available_at: '2026-11-14T08:30:00Z' } };
    const u = rendre(<CarteDeFile i={reseau.demande} maintenant={MAINTENANT} />);
    await u.click(screen.getByRole('button', { name: R.relancer }));
    const refus = (await screen.findByRole('alert')).textContent ?? '';
    // 10 h 30 → 8 h 30 le lendemain : 22 heures restent.
    expect(refus).toMatch(/dans 22\s?h\b/);
    expect(refus).toMatch(/demain.*08:30|14 nov.*08:30/i);
  });

  it('une relance réussie se voit et s’annonce : « Relance envoyée »', async () => {
    const u = rendre(<CarteDeFile i={reseau.demande} maintenant={MAINTENANT} />);
    // La région d'annonce existe AVANT l'envoi : un lecteur d'écran n'annonce pas une région qui naît pleine.
    const annonce = screen.getByRole('status');
    expect(annonce.getAttribute('aria-live')).toBe('polite');
    expect(annonce.textContent).toBe('');
    await u.click(screen.getByRole('button', { name: R.relancer }));
    await waitFor(() => expect(annonce.textContent).toBe(R.envoyee));
    // La ligne de la liste n'a pas encore été relue : c'est le geste lui-même qui le dit.
    const geste = screen.getByRole('button', { name: R.envoyee }) as HTMLButtonElement;
    expect(geste.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: R.relancer })).toBeNull();
  });

  it('un double clic ne relance qu’une fois, et le geste est inactif pendant l’envoi', async () => {
    let liberer!: () => void;
    reseau.attente = new Promise<void>((r) => {
      liberer = r;
    });
    rendre(<CarteDeFile i={reseau.demande} maintenant={MAINTENANT} />);
    const geste = screen.getByRole('button', { name: R.relancer }) as HTMLButtonElement;
    // Deux clics dans le même tour, avant que React n'ait rendu « en cours ».
    act(() => {
      fireEvent.click(geste);
      fireEvent.click(geste);
    });
    await waitFor(() => expect(geste.disabled).toBe(true));
    expect(geste.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(geste);
    await act(async () => liberer());
    await screen.findByRole('button', { name: R.envoyee });
    expect(posts()).toEqual(['/api/maintenance-requests/30/owner-reminders']);
  });

  it('un bailleur parti ou suspendu : le refus le dit', async () => {
    reseau.refus = { code: 'maintenance.owner_unavailable' };
    const u = rendre(<CarteDeFile i={reseau.demande} maintenant={MAINTENANT} />);
    await u.click(screen.getByRole('button', { name: R.relancer }));
    expect((await screen.findByRole('alert')).textContent).toBe(R.injoignable);
  });
});

describe('la fiche', () => {
  const JOURNAL: EntreeDuJournal[] = [
    { id: 1, at: '2026-11-08T10:12:00Z', code: 'created', actor: { id: 10, full_name: 'Ousmane Niang' }, from: null, to: 'open' },
    { id: 2, at: '2026-11-09T10:00:00Z', code: 'status.quote_awaiting_owner', actor: { id: 4, full_name: 'Awa Diop' }, from: 'quote_submitted', to: 'awaiting_owner' },
    { id: 3, at: '2026-11-10T09:00:00Z', code: 'owner_reminded', actor: { id: 4, full_name: 'Awa Diop' }, from: null, to: null },
    { id: 4, at: '2026-11-10T09:05:00Z', code: 'status.auto_closed', actor: null, from: 'completed', to: 'closed' },
  ];

  it('le geste principal relance le bailleur, puis dit « Relancé »', async () => {
    const u = rendre(<FicheDIntervention id={30} />);
    const geste = await waitFor(() => {
      const g = document.querySelector<HTMLElement>('[data-slot="panneau-du-geste"]');
      if (!g) throw new Error('pas encore rendue');
      return g;
    });
    await u.click(within(geste).getByRole('button', { name: R.relancer }));
    await waitFor(() => expect((within(geste).getByRole('button', { name: R.envoyee }) as HTMLButtonElement).disabled).toBe(true));
    expect(within(geste).getByRole('status').textContent).toBe(R.envoyee);
    expect(posts()).toEqual(['/api/maintenance-requests/30/owner-reminders']);
  });

  it('sans le droit de relancer, et sans relance récente, le geste n’est pas proposé', async () => {
    reseau.demande = demande({ abilities: { ...ABILITIES, can_remind_owner: false } });
    rendre(<FicheDIntervention id={30} />);
    await screen.findAllByText(fr.maintenance.fiche.geste.voirDevis);
    expect(screen.queryByRole('button', { name: R.relancer })).toBeNull();
  });

  it('montre le journal : l’heure, quoi, qui ; le système sans nom', async () => {
    reseau.journal = JOURNAL;
    rendre(<FicheDIntervention id={30} />);
    const [journal] = await waitFor(() => {
      const j = [...document.querySelectorAll<HTMLElement>('[data-slot="journal"]')];
      if (j.length === 0 || !j[0].querySelector('li')) throw new Error('pas encore de journal');
      return j;
    });
    const lignes = [...journal.querySelectorAll('li')].map((li) => li.textContent);
    expect(lignes[0]).toContain(J.codes.created);
    expect(lignes[0]).toContain('Par Ousmane Niang');
    expect(lignes[1]).toContain(J.codes.status_quote_awaiting_owner);
    expect(lignes[2]).toContain(J.codes.owner_reminded);
    expect(lignes[3]).toContain(J.systeme);
  });

  it('pas de journal pour qui ne peut pas le lire : aucune requête', async () => {
    reseau.demande = demande({ abilities: { ...ABILITIES, can_view_journal: false } });
    rendre(<FicheDIntervention id={30} />);
    await screen.findAllByText(fr.maintenance.fiche.geste.voirDevis);
    expect(document.querySelector('[data-slot="journal"]')).toBeNull();
    expect(reseau.appels.some((a) => a.chemin.includes('/journal'))).toBe(false);
  });
});
