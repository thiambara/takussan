import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AuditTrail } from '../AuditTrail';

/**
 * TCK-376 — le journal d'audit : recherche temporisée, objet cliquable, menu d'export accessible.
 *
 * Les trois défauts, mesurés le 2026-08-27 sur `origin/dev` :
 * chaque frappe changeait la clé de requête sur des pages de 50 lignes (dix caractères = dix
 * requêtes) ; la colonne « Objet » affichait `Property #12` en texte mort ; et le menu d'export
 * était un `<div>` piloté par un `useState`, sans `Escape`, sans clic extérieur, sans
 * `aria-expanded`.
 */

const mockFetchLogs = vi.fn();

vi.mock('@/lib/queries/audit-logs', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/queries/audit-logs')>();
  return { ...reel, fetchAuditLogs: (...args: unknown[]) => mockFetchLogs(...args) };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'fake-token', isLoading: false }),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeLog(overrides: Partial<{
  id: number;
  event: string;
  subject_type: string | null;
  subject_id: number | null;
  description: string;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    log_name: 'default',
    event: overrides.event ?? 'updated',
    description: overrides.description ?? 'Mise à jour',
    causer_id: 3,
    causer_type: 'App\\Models\\User',
    causer: { id: 3, name: 'Awa Diop', email: 'awa@example.test' },
    subject_type: overrides.subject_type === undefined ? 'App\\Models\\Property' : overrides.subject_type,
    subject_id: overrides.subject_id === undefined ? 12 : overrides.subject_id,
    properties: null,
    created_at: '2026-08-01T10:00:00Z',
  };
}

function reponse(data = [makeLog()]) {
  return {
    data,
    meta: { total: data.length, current_page: 1, last_page: 1, per_page: 50 },
    links: { first: null, last: null, prev: null, next: null },
  };
}

/** Les filtres du dernier appel réellement parti au serveur. */
function derniersFiltres() {
  const appel = mockFetchLogs.mock.calls.at(-1);
  if (!appel) throw new Error('fetchAuditLogs n’a pas été appelé');
  return appel[1] as Record<string, unknown>;
}

/** Les appels dont le `search` n'est pas vide — les seuls que la frappe produit. */
function requetesDeRecherche() {
  return mockFetchLogs.mock.calls.filter(([, filtres]) => (filtres as { search?: string }).search);
}

/**
 * La cellule « Objet » de la première ligne du tableau.
 *
 * ⚠ Asynchrone : `DataState` rend un squelette tant que la requête est en vol, et il ne contient
 * aucun `role="row"`. Attendre le seul `fetchAuditLogs` ne suffit donc pas — c'est le rendu qui
 * suit qu'il faut attendre.
 */
async function celluleObjet() {
  const lignes = await screen.findAllByRole('row');
  // `row[0]` est l'en-tête ; les colonnes sont Date, Utilisateur, Action, Objet, Description.
  return within(lignes[1]).getAllByRole('cell')[3];
}

describe('<AuditTrail> (TCK-376)', () => {
  beforeEach(() => {
    mockFetchLogs.mockReset();
    toastAdd.mockReset();
    mockFetchLogs.mockResolvedValue(reponse());
  });

  // ─── AC3 — dix caractères, au plus deux requêtes ───────────────────────────────────────────
  it('AC3 — dix caractères saisis déclenchent au plus 2 requêtes de recherche', async () => {
    render(wrap(<AuditTrail />));
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'Ziguinchor');

    // Pendant la frappe, RIEN n'est parti — et l'attente se voit. Les deux ensemble : la
    // pastille seule serait verte avec une temporisation de 0 ms.
    expect(requetesDeRecherche()).toHaveLength(0);
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();

    await waitFor(() => expect(requetesDeRecherche().length).toBeGreaterThanOrEqual(1));
    expect(requetesDeRecherche().length).toBeLessThanOrEqual(2);
    expect(derniersFiltres().search).toBe('Ziguinchor');
  });

  it('AC3 — le résultat pour une même saisie est identique : la temporisation ne change QUE le quand', async () => {
    render(wrap(<AuditTrail />));
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'Ziguinchor');
    await waitFor(() => expect(requetesDeRecherche().length).toBeGreaterThanOrEqual(1));

    const filtres = derniersFiltres();
    expect(filtres.search).toBe('Ziguinchor');
    expect(filtres.per_page).toBe(50);
    expect(filtres.page).toBe(1);
  });

  it('AC3 — chercher depuis la page 3 ramène à la page 1', async () => {
    mockFetchLogs.mockResolvedValue({
      data: [makeLog()],
      meta: { total: 200, current_page: 1, last_page: 4, per_page: 50 },
      links: { first: null, last: null, prev: null, next: null },
    });
    render(wrap(<AuditTrail />));
    await screen.findAllByRole('row');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    await waitFor(() => expect(derniersFiltres().page).toBe(2));

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' }), 'Saly');
    await waitFor(() => expect(requetesDeRecherche().length).toBeGreaterThanOrEqual(1));
    expect(derniersFiltres().page).toBe(1);
  });

  // ─── AC4 — la colonne « Objet » mène quelque part, ou ne promet rien ───────────────────────
  it('AC4 — un objet doté d’un écran devient un lien vers cet écran', async () => {
    mockFetchLogs.mockResolvedValue(reponse([
      makeLog({ subject_type: 'App\\Models\\Property', subject_id: 12 }),
    ]));
    render(wrap(<AuditTrail />));
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());

    const lien = await within(await celluleObjet()).findByRole('link');
    expect(lien).toHaveAttribute('href', '/app/properties/12');
    expect(lien).toHaveTextContent('Property');
    expect(lien).toHaveTextContent('#12');
  });

  it.each([
    ['App\\Models\\Booking', 7, '/app/bookings/7'],
    ['App\\Models\\Lease', 3, '/app/leases/3'],
    ['App\\Models\\Customer', 88, '/app/customers/88'],
  ])('AC4 — %s #%i mène à %s', async (subject_type, subject_id, href) => {
    mockFetchLogs.mockResolvedValue(reponse([makeLog({ subject_type, subject_id })]));
    render(wrap(<AuditTrail />));
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());

    expect(await within(await celluleObjet()).findByRole('link')).toHaveAttribute('href', href);
  });

  // Les deux types SANS écran sont dans le sélecteur de filtre du journal lui-même : c'est
  // exactement le cas qu'une résolution par convention (`Property` → `/properties`) aurait
  // envoyé sur un 404.
  it.each([
    ['App\\Models\\Invoice', 9, 'Invoice'],
    ['App\\Models\\User', 4, 'User'],
  ])('AC4 — %s n’a pas d’écran : la cellule reste du texte', async (subject_type, subject_id, court) => {
    mockFetchLogs.mockResolvedValue(reponse([makeLog({ subject_type, subject_id })]));
    render(wrap(<AuditTrail />));
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());

    const cellule = await celluleObjet();
    expect(within(cellule).queryByRole('link')).not.toBeInTheDocument();
    // Le libellé, lui, ne disparaît PAS : le journal continue de dire de quoi il parle.
    expect(cellule).toHaveTextContent(court);
    expect(cellule).toHaveTextContent(`#${subject_id}`);
  });

  it('AC4 — une ligne sans objet rend un tiret, jamais un lien', async () => {
    mockFetchLogs.mockResolvedValue(reponse([
      makeLog({ subject_type: null, subject_id: null }),
    ]));
    render(wrap(<AuditTrail />));
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());

    const cellule = await celluleObjet();
    expect(within(cellule).queryByRole('link')).not.toBeInTheDocument();
    expect(cellule).toHaveTextContent('—');
  });

  it('AC4 — un type connu SANS identifiant ne rend pas de lien', async () => {
    mockFetchLogs.mockResolvedValue(reponse([
      makeLog({ subject_type: 'App\\Models\\Property', subject_id: null }),
    ]));
    render(wrap(<AuditTrail />));
    await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());

    const cellule = await celluleObjet();
    expect(within(cellule).queryByRole('link')).not.toBeInTheDocument();
    expect(cellule).toHaveTextContent('Property');
  });

  // ─── AC5 — le menu d'export passe par la primitive du dépôt ────────────────────────────────
  describe('AC5 — menu d’export', () => {
    async function ouvre() {
      const user = userEvent.setup();
      render(wrap(<AuditTrail />));
      await waitFor(() => expect(mockFetchLogs).toHaveBeenCalled());
      const declencheur = screen.getByRole('button', { name: 'Exporter' });
      await user.click(declencheur);
      await screen.findByRole('menu');
      return { user, declencheur };
    }

    it('porte un nom accessible et annonce son état', async () => {
      const { declencheur } = await ouvre();
      // `aria-expanded` : ce que le `<div>` piloté par `useState` ne pouvait pas dire.
      expect(declencheur).toHaveAttribute('aria-expanded', 'true');
      expect(declencheur).toHaveAttribute('aria-haspopup');
    });

    it('propose CSV et XLSX, et rien d’autre', async () => {
      await ouvre();
      const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
      expect(items.map((i) => i.textContent)).toEqual(['CSV', 'Excel (XLSX)']);
    });

    it('se ferme à Escape', async () => {
      const { user, declencheur } = await ouvre();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(declencheur).toHaveAttribute('aria-expanded', 'false');
    });

    it('se ferme au clic extérieur', async () => {
      const { user, declencheur } = await ouvre();
      await user.click(document.body);
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(declencheur).toHaveAttribute('aria-expanded', 'false');
    });

    it('déclenche l’export au clic sur un élément', async () => {
      const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
        void input;
        return new Response('col1,col2', {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="audit.csv"' },
        });
      });
      vi.stubGlobal('fetch', fetchSpy);
      // jsdom ne fournit pas `createObjectURL`.
      vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: () => 'blob:fake',
        revokeObjectURL: () => {},
      }));

      const { user } = await ouvre();
      await user.click(screen.getByRole('menuitem', { name: 'CSV' }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      expect(String(fetchSpy.mock.calls[0][0])).toContain('format=csv');
      vi.unstubAllGlobals();
    });
  });

  /**
   * Ce fichier ne doit plus contenir de `useState` d'ouverture écrit à la main — c'est la
   * seconde moitié de l'AC5, et elle ne se lit pas depuis le DOM : un menu conforme rendu par
   * un état maison cocherait tous les tests ci-dessus.
   */
  it('AC5 — le fichier ne réimplémente plus l’ouverture du menu', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const source = await readFile(
      resolve(process.cwd(), 'src/components/admin/AuditTrail.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/showExportMenu|setShowExportMenu|useState\([^)]*\)[^;]*Menu/);
    expect(source).toContain('DropdownMenuTrigger');
  });
});
