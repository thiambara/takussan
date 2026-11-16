/**
 * TCK-2918 (e0, AC1-AC3) — le kanban du bureau qu'on manipule.
 *
 *  · AC1 — chaque carte porte une poignée ; déposer une carte « À dispatcher » dans « En cours » ouvre
 *    le choix du prestataire, confirmer envoie l'assignation, fermer la laisse dans sa colonne.
 *  · AC2 — un dépôt que la transition ne sert pas n'envoie AUCUNE requête, et le dit.
 *  · AC3 — au clavier seul : poignée, Espace, →, Entrée.
 *
 * Le réseau est un faux serveur derrière `apiRequest`. jsdom n'a pas de mise en page : le dépôt au
 * pointeur s'éprouve par le `onDragEnd` que reçoit `DndContext` (la couture), et le parcours au clavier
 * sur des colonnes auxquelles on donne une géométrie (`getBoundingClientRect`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { FileDIntervention, InterventionEnFile } from '@/lib/maintenance/files';
import type { MaintenanceAbilities } from '@/types/maintenance';

const K = fr.maintenance.files.kanban;
const reseau = vi.hoisted(() => ({
  appels: [] as { chemin: string; methode: string; corps: unknown }[],
  files: {} as Record<string, unknown[]>,
  fiches: {} as Record<number, unknown>,
}));
const couture = vi.hoisted(() => ({ onDragEnd: null as null | ((e: unknown) => void) }));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...reel,
    DndContext: (props: ComponentProps<typeof reel.DndContext>) => {
      couture.onDragEnd = props.onDragEnd as (e: unknown) => void;
      return <reel.DndContext {...props} />;
    },
  };
});
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/maintenance',
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
    apiRequest: async (chemin: string, options: { method?: string; body?: unknown } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode, corps: options.body });
      const url = new URL(chemin, 'http://api.test');
      if (url.pathname === '/api/maintenance-requests' && methode === 'GET') {
        const lignes = reseau.files[url.searchParams.get('filter[file]') ?? ''] ?? [];
        return { data: lignes, meta: { current_page: 1, last_page: 1, per_page: 10, total: lignes.length } };
      }
      const fiche = url.pathname.match(/^\/api\/maintenance-requests\/(\d+)$/);
      if (fiche && methode === 'GET') return { data: reseau.fiches[Number(fiche[1])] };
      if (fiche && methode === 'PATCH') return { data: reseau.fiches[Number(fiche[1])] };
      if (url.pathname.endsWith('/suggested-providers')) return { data: [SUGGESTION] };
      if (url.pathname === '/api/agencies/1/service-providers') return { data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } };
      if (url.pathname === '/api/agencies/1/members') return { data: [] };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { KanbanDesFiles } = await import('../KanbanDesFiles');

const ABILITIES = { can_assign: true, transitions: ['acknowledged', 'cancelled'] } as unknown as MaintenanceAbilities;
const SUGGESTION = {
  id: 7,
  user_id: 181,
  name: 'Cheikh Gueye',
  phone: null,
  matching_trade: 'plumbing',
  matching_zone: 'Mermoz',
  service_areas: ['Mermoz'],
  average_rating: 4.6,
  reviews_count: 12,
  completed_interventions_count: 23,
  overdue_slots_count: 0,
};

function demande(id: number, file: FileDIntervention, titre: string): InterventionEnFile {
  return {
    id,
    property_id: 70,
    lease_id: null,
    requester_id: 10,
    assigned_to: null,
    title: titre,
    description: '',
    category: 'plumbing',
    priority: 'normal',
    status: 'open',
    created_at: '2026-11-10T10:00:00Z',
    property: { id: 70, title: 'Bien 70', slug: null, agency: { id: 1, name: 'Dakar Immo' }, location: { quarter: 'Mermoz' } },
    requester: { id: 10, name: 'Astou Seck' },
    assignee: null,
    file,
    waiting_on: 'agency',
    waiting_since: '2026-11-10T10:00:00Z',
    slot_overdue_days: null,
    auto_close_at: null,
  } as unknown as InterventionEnFile;
}

const FUITE = demande(110, 'a_dispatcher', 'Fuite sous l’évier');
const TERRASSE = demande(30, 'chez_le_bailleur', 'Étanchéité de la terrasse');

const ecritures = () => reseau.appels.filter((a) => a.methode !== 'GET');

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const u = userEvent.setup();
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <KanbanDesFiles filtres={{ search: null, priority: null, category: null, propertyId: null }} comptes={null} parPage={() => 10} voirPlus={vi.fn()} maintenant={new Date('2026-11-13T10:30:00Z')} />
      </QueryClientProvider>,
    ),
  );
  return u;
}

const carte = (id: number) => document.querySelector<HTMLElement>(`[data-slot="carte-de-colonne"][data-id="${id}"]`);
const deposer = (c: InterventionEnFile, source: FileDIntervention, cible: string | null) =>
  act(() => couture.onDragEnd!({ active: { id: c.id, data: { current: { carte: c, file: source } } }, over: cible ? { id: cible } : null }));

beforeEach(() => {
  reseau.appels = [];
  reseau.files = { a_dispatcher: [FUITE], chez_le_bailleur: [TERRASSE] };
  reseau.fiches = { 110: { ...FUITE, abilities: ABILITIES }, 30: { ...TERRASSE, abilities: ABILITIES } };
  couture.onDragEnd = null;
});

describe('Kanban — poignées et zones de dépôt (AC1)', () => {
  it('chaque carte porte une poignée ; chaque colonne finit par sa zone de dépôt', async () => {
    rendre();
    await waitFor(() => expect(carte(110)).not.toBeNull());
    for (const id of [110, 30]) expect(within(carte(id)!).getByRole('button', { name: K.saisir.replace('{titre}', id === 110 ? FUITE.title : TERRASSE.title) })).toBeInTheDocument();
    const zones = [...document.querySelectorAll('[data-slot="zone-de-depot"]')].map((z) => z.textContent);
    expect(zones).toEqual([K.glissez, K.deposez, K.deposez, K.deposez, K.deposez]);
  });
});

describe('Kanban — déposer dans « En cours » (AC1)', () => {
  it('ouvre le choix du prestataire ; confirmer envoie l’assignation', async () => {
    const u = rendre();
    await waitFor(() => expect(carte(110)).not.toBeNull());
    deposer(FUITE, 'a_dispatcher', 'en_cours');
    const feuille = await screen.findByRole('dialog', { name: K.confier.titre.replace('{titre}', FUITE.title) });
    expect(ecritures()).toEqual([]);
    await u.click(await within(feuille).findByRole('button', { name: /Choisir\s*Cheikh Gueye/ }));
    await u.click(within(feuille).getByRole('button', { name: 'Envoyer à Cheikh Gueye' }));
    await waitFor(() => expect(ecritures()).toEqual([{ chemin: '/api/maintenance-requests/110', methode: 'PATCH', corps: { assigned_to: 181, scheduled_at: null } }]));
  });

  it('fermer le choix sans envoyer laisse la carte dans sa colonne, sans requête', async () => {
    const u = rendre();
    await waitFor(() => expect(carte(110)).not.toBeNull());
    deposer(FUITE, 'a_dispatcher', 'en_cours');
    await screen.findByRole('dialog', { name: K.confier.titre.replace('{titre}', FUITE.title) });
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ecritures()).toEqual([]);
    expect(carte(110)!.closest('[data-file]')!.getAttribute('data-file')).toBe('a_dispatcher');
  });

  it('sans `can_assign` à la fiche, la feuille le dit et n’offre aucun envoi', async () => {
    reseau.fiches[110] = { ...FUITE, abilities: { ...ABILITIES, can_assign: false } };
    rendre();
    await waitFor(() => expect(carte(110)).not.toBeNull());
    deposer(FUITE, 'a_dispatcher', 'en_cours');
    const feuille = await screen.findByRole('dialog');
    expect(await within(feuille).findByText(new RegExp(K.confier.interdit))).toBeInTheDocument();
    expect(within(feuille).queryByRole('button', { name: /Envoyer/ })).toBeNull();
  });
});

describe('Kanban — un dépôt que la transition ne sert pas (AC2)', () => {
  it.each([
    ['chez_le_bailleur', 'en_cours'],
    ['a_dispatcher', 'a_confirmer'],
    ['a_dispatcher', 'chez_le_bailleur'],
  ] as const)('%s → %s : aucune requête, aucun choix, et le refus est dit', async (source, cible) => {
    rendre();
    await waitFor(() => expect(carte(110)).not.toBeNull());
    const c = source === 'chez_le_bailleur' ? TERRASSE : FUITE;
    deposer(c, source, cible);
    const refus = await screen.findByRole('alert');
    expect(refus.textContent).toContain(`« ${c.title} »`);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ecritures()).toEqual([]);
    expect(carte(c.id)!.closest('[data-file]')!.getAttribute('data-file')).toBe(source);
  });

  it('lâchée hors des colonnes, ou sur la sienne : rien', async () => {
    rendre();
    await waitFor(() => expect(carte(110)).not.toBeNull());
    deposer(FUITE, 'a_dispatcher', null);
    deposer(FUITE, 'a_dispatcher', 'a_dispatcher');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ecritures()).toEqual([]);
  });
});

describe('Kanban — au clavier seul (AC3)', () => {
  // Cinq colonnes de 200 px côte à côte ; une carte occupe le haut de sa colonne.
  const ORDRE = ['a_dispatcher', 'en_retard', 'chez_le_bailleur', 'en_cours', 'a_confirmer'];
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
  const original = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const colonne = this.closest('[data-file]');
      if (!colonne) {
        // L'aperçu (`DragOverlay`) : placé en `left`/`top` sur la carte saisie, puis déplacé par `transform`.
        const apercu = (this as HTMLElement).closest<HTMLElement>('[style*="left"]');
        if (!apercu) return rect(0, 0, 0, 0);
        const [tx, ty] = (apercu.style.transform.match(/-?[\d.]+(?=px)/g) ?? ['0', '0']).map(Number);
        return rect(parseFloat(apercu.style.left) + tx, parseFloat(apercu.style.top) + ty, parseFloat(apercu.style.width), parseFloat(apercu.style.height));
      }
      const x = ORDRE.indexOf(colonne.getAttribute('data-file')!) * 210;
      return this === colonne ? rect(x, 0, 200, 600) : rect(x + 8, 40, 184, 120);
    };
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = original;
  });

  it('poignée, Espace, → trois fois, Entrée : la carte arrive sur « En cours » et le choix s’ouvre', async () => {
    rendre();
    await waitFor(() => expect(carte(110)).not.toBeNull());
    const poignee = within(carte(110)!).getByRole('button', { name: K.saisir.replace('{titre}', FUITE.title) });
    poignee.focus();
    const annonce = () => [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent).join(' ');
    // Le capteur du clavier n'écoute qu'après sa saisie (`setTimeout`) : chaque touche attend la précédente.
    const touche = async (code: string, key: string) =>
      act(async () => {
        fireEvent.keyDown(document, { code, key });
        await new Promise((r) => setTimeout(r, 30));
      });
    await act(async () => {
      fireEvent.keyDown(poignee, { code: 'Space', key: ' ' });
      await new Promise((r) => setTimeout(r, 30));
    });
    await waitFor(() => expect(annonce()).toContain('est au-dessus de « À dispatcher »'));
    for (const file of ['En retard', 'Chez le bailleur', 'En cours']) {
      await touche('ArrowRight', 'ArrowRight');
      await waitFor(() => expect(annonce()).toContain(`est au-dessus de « ${file} »`));
    }
    await touche('Enter', 'Enter');
    expect(await screen.findByRole('dialog', { name: K.confier.titre.replace('{titre}', FUITE.title) })).toBeInTheDocument();
    expect(ecritures()).toEqual([]);
  });
});
