/**
 * TCK-2918 (e5, AC6) — la carte « En cours » du locataire : « Écrire à l'agence » vers le fil de
 * l'intervention, « Changer le créneau » qui envoie une DEMANDE (`POST …/reschedule-requests`) et dit
 * qu'elle attend la réponse de l'agence ; la note « … selon votre bail … » sous les demandes.
 *
 * Le réseau est un faux serveur derrière `apiRequest` : la liste vient de son module (mocké), la fiche
 * de chaque demande et l'envoi passent par les vrais hooks, relevés comme dans l'onglet Réseau.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import type { MaintenanceRequest } from '@/types/maintenance';

const G = fr.maintenance.locataire.demandes.gestes;
const reseau = vi.hoisted(() => ({
  liste: [] as unknown[],
  fiches: {} as Record<number, unknown>,
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
}));

vi.mock('@/lib/queries/maintenance-signalement', () => ({
  DEMANDES_DU_LOCATAIRE_PAR_PAGE: 50,
  useDemandesDuLocataire: () => ({ isPending: false, isError: false, data: { data: reseau.liste, meta: { total: reseau.liste.length } }, refetch: vi.fn() }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode, corps: options.body });
      const url = new URL(chemin, 'http://api.test');
      const m = url.pathname.match(/^\/api\/maintenance-requests\/(\d+)(\/reschedule-requests)?$/);
      if (m && methode === 'GET' && !m[2]) return { data: reseau.fiches[Number(m[1])] };
      if (m && methode === 'POST' && m[2]) return { data: { id: 1, proposed_slots: (options.body as { proposed_slots: string[] }).proposed_slots, note: null, requested_at: new Date().toISOString() } };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});
// Le sélecteur de date ouvre un calendrier : un champ suffit à éprouver ce qui part.
vi.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({ id, value, onValueChange }: { id?: string; value?: string; onValueChange: (v: string) => void }) => (
    <input id={id} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

const { MesDemandesDuLocataire } = await import('../MesDemandesDuLocataire');

const HIER = new Date(Date.now() - 86_400_000).toISOString();

function ligne(id: number, surcharge: Partial<InterventionEnFile> = {}): InterventionEnFile {
  return {
    id,
    property_id: 44,
    lease_id: 5,
    requester_id: 78,
    assigned_to: 12,
    title: `Demande ${id}`,
    category: 'plumbing',
    priority: 'urgent',
    status: 'assigned',
    scheduled_at: null,
    completed_at: null,
    created_at: HIER,
    property: { id: 44, title: 'Villa 4 chambres', slug: null },
    assignee: { id: 12, name: 'Astou Sy' },
    ...surcharge,
  } as unknown as InterventionEnFile;
}

function detail(l: InterventionEnFile, surcharge: Partial<MaintenanceRequest> = {}) {
  return { ...l, conversation_id: 31, abilities: { transitions: [], can_request_reschedule: true }, pending_reschedule_request: null, ...surcharge };
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const u = userEvent.setup();
  render(withIntl(<QueryClientProvider client={client}><MesDemandesDuLocataire /></QueryClientProvider>));
  return u;
}

const carte = (id: number) => document.querySelector<HTMLElement>(`[data-slot="demande-en-cours"][data-id="${id}"]`);
const ecritures = () => reseau.appels.filter((a) => a.methode !== 'GET');

/** Demain 10:00 à l'heure du poste, au format du sélecteur (`YYYY-MM-DDTHH:mm`). */
function demainA(h: number): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(h, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:00`;
}

describe('MesDemandesDuLocataire — gestes de la carte « En cours » (TCK-2918)', () => {
  beforeEach(() => {
    const l = ligne(4);
    reseau.liste = [l];
    reseau.fiches = { 4: detail(l) };
    reseau.appels = [];
  });

  it('« Écrire à l’agence » mène au fil de l’intervention ; la note du bail est rendue sous les demandes', async () => {
    monter();
    const lien = await waitFor(() => within(carte(4)!).getByRole('link', { name: G.ecrire }));
    expect(lien.getAttribute('href')).toBe('/app/messages?conversation=31');
    expect(screen.getByText(fr.maintenance.locataire.demandes.noteDuBail)).toBeInTheDocument();
  });

  it('sans conversation (pas encore assignée) ni droit de demander, aucun des deux gestes', async () => {
    const l = ligne(4, { assigned_to: null, status: 'open' });
    reseau.liste = [l];
    reseau.fiches = { 4: detail(l, { conversation_id: null, abilities: { transitions: [], can_request_reschedule: false } as unknown as MaintenanceRequest['abilities'] }) };
    monter();
    await waitFor(() => expect(reseau.appels.some((a) => a.chemin.startsWith('/api/maintenance-requests/4'))).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(within(carte(4)!).queryByRole('link', { name: G.ecrire })).toBeNull();
    expect(within(carte(4)!).queryByRole('button', { name: G.changer })).toBeNull();
  });

  it('« Changer le créneau » envoie deux créneaux et un mot en POST …/reschedule-requests, sans toucher au créneau', async () => {
    const u = monter();
    await u.click(await waitFor(() => within(carte(4)!).getByRole('button', { name: G.changer })));
    const dialogue = await screen.findByRole('dialog', { name: G.creneau.titre });
    const envoyer = within(dialogue).getByRole('button', { name: G.creneau.envoyer });
    expect(envoyer).toBeDisabled();
    await u.type(within(dialogue).getByLabelText('Créneau 1'), demainA(10));
    await u.click(within(dialogue).getByRole('button', { name: G.creneau.ajouter }));
    await u.type(within(dialogue).getByLabelText('Créneau 2'), demainA(15));
    await u.type(within(dialogue).getByLabelText(G.creneau.note), 'Je travaille le matin');
    await u.click(envoyer);
    await waitFor(() => expect(ecritures()).toHaveLength(1));
    const [appel] = ecritures();
    expect(appel.chemin).toBe('/api/maintenance-requests/4/reschedule-requests');
    expect(appel.methode).toBe('POST');
    expect(appel.corps).toEqual({ proposed_slots: [new Date(demainA(10)).toISOString(), new Date(demainA(15)).toISOString()], note: 'Je travaille le matin' });
  });

  it('une demande de créneau en attente se dit en attente de l’agence, jamais comme un créneau changé', async () => {
    const l = ligne(4);
    reseau.fiches = { 4: detail(l, { pending_reschedule_request: { id: 2, proposed_slots: ['2026-11-20T10:00:00Z', '2026-11-21T15:00:00Z'], note: null, requested_at: HIER } }) };
    monter();
    const attente = await waitFor(() => {
      const e = carte(4)!.querySelector<HTMLElement>('[data-slot="creneau-demande"]');
      if (!e) throw new Error('pas encore rendue');
      return e;
    });
    expect(attente.textContent).toMatch(/2 autres créneaux/);
    expect(attente.textContent).toMatch(/attend la réponse de l’agence/);
  });
});
