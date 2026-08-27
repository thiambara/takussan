import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { PropertyModerationWorkspace } from '../PropertyModerationWorkspace';

/**
 * TCK-376 — la file de validation des biens : état partageable, pagination, recherche temporisée.
 *
 * L'écran n'avait aucun test. Trois défauts mesurés le 2026-08-27 sur `origin/dev` :
 * la requête ne portait pas de `page` (une file longue avait une fin inatteignable), la
 * recherche vivait en `useState` (perdue au rechargement, absente d'un lien partagé), et elle
 * partait à chaque frappe.
 */

const mockFetchQueue = vi.fn();

vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: (...args: unknown[]) => mockFetchQueue(...args),
  approveProperty: vi.fn(),
  rejectProperty: vi.fn(),
  resubmitProperty: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'fake-token', isLoading: false }),
}));

let urlCourante = '';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(urlCourante),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeProperty(overrides: Partial<{ id: number; title: string }> = {}) {
  return {
    id: overrides.id ?? 1,
    reference_number: `REF-${overrides.id ?? 1}`,
    title: overrides.title ?? 'Villa à Saly',
    slug: 'villa-saly',
    status: 'pending',
    main_photo_url: null,
    price: 45_000_000,
    currency: 'XOF',
    type: 'villa',
    submitted_at: '2026-08-01T10:00:00Z',
    rejection_reason: null,
    owner: { id: 3, name: 'Awa Diop', avatar_url: null },
    agency: { id: 7, name: 'Teranga Immo' },
    location: { city: 'Saly', region: 'Thiès', country: 'SN' },
  };
}

function reponse(overrides: Partial<{ last_page: number; current_page: number }> = {}, data = [
  makeProperty({ id: 1, title: 'Villa à Saly' }),
  makeProperty({ id: 2, title: 'Duplex à Dakar' }),
]) {
  return {
    data,
    meta: {
      total: 2,
      current_page: overrides.current_page ?? 1,
      last_page: overrides.last_page ?? 1,
      per_page: 20,
      pending_count: 2,
    },
    links: { first: null, last: null, prev: null, next: null },
  };
}

function derniereUrl(): URLSearchParams {
  const appel = replace.mock.calls.at(-1);
  if (!appel) throw new Error('router.replace n’a pas été appelé');
  return new URLSearchParams(String(appel[0]).replace(/^\?/, ''));
}

function derniersParams() {
  const appel = mockFetchQueue.mock.calls.at(-1);
  if (!appel) throw new Error('fetchPropertyModerationQueue n’a pas été appelé');
  return appel[1] as Record<string, unknown>;
}

describe('<PropertyModerationWorkspace> (TCK-376)', () => {
  beforeEach(() => {
    urlCourante = '';
    replace.mockReset();
    mockFetchQueue.mockReset();
    mockFetchQueue.mockResolvedValue(reponse({ last_page: 3 }));
  });

  // ─── AC1 — un lien copié rouvre LA MÊME file ───────────────────────────────────────────────
  it('AC1 — rejoue la recherche et la page portées par l’URL', async () => {
    urlCourante = 'filter[search]=Saly&page=2';
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    expect(derniersParams()).toEqual({ search: 'Saly', page: 2, perPage: 20 });
    // Le champ affiche ce que l'URL porte — un lien collé n'ouvre pas une barre vide.
    expect(screen.getByRole('searchbox')).toHaveValue('Saly');
  });

  it('AC1 — n’envoie aucune recherche quand l’URL est nue', async () => {
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');
    expect(derniersParams()).toEqual({ search: undefined, page: 1, perPage: 20 });
  });

  it('AC1 — la sélection est portée par l’URL, et le clic l’y écrit', async () => {
    urlCourante = 'selected=2';
    render(wrap(<PropertyModerationWorkspace />));

    // Le panneau de détail ouvre le bien DÉSIGNÉ, pas le premier de la file.
    expect(await screen.findByTestId('property-moderation-detail')).toHaveTextContent('Duplex à Dakar');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('property-queue-item-1').querySelector('button')!);
    expect(derniereUrl().get('selected')).toBe('1');
  });

  // ─── AC2 — parcourable jusqu'à la dernière page ────────────────────────────────────────────
  it('AC2 — « Suivant » avance d’une page, et la page part au serveur', async () => {
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(derniereUrl().get('page')).toBe('2');

    urlCourante = 'page=2';
    mockFetchQueue.mockClear();
    render(wrap(<PropertyModerationWorkspace />));
    await waitFor(() => expect(mockFetchQueue).toHaveBeenCalled());
    expect(derniersParams().page).toBe(2);
  });

  it('AC2 — la dernière page est atteignable, et « Suivant » y est inerte', async () => {
    urlCourante = 'page=3';
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    expect(screen.getByText('Page 3 sur 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
  });

  it('AC2 — une file d’une seule page ne rend aucune pagination', async () => {
    mockFetchQueue.mockResolvedValue(reponse({ last_page: 1 }));
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  // ─── AC3 — la recherche est temporisée, et le filtre est SERVEUR ───────────────────────────
  it('AC3 — dix caractères saisis n’écrivent l’URL qu’une fois', async () => {
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'Ziguinchor'); // 10 caractères

    // Rien n'est encore parti, et l'attente se voit — les deux ensemble : la seconde assertion
    // seule serait verte avec une temporisation de 0 ms.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledTimes(1);
    expect(derniereUrl().get('filter[search]')).toBe('Ziguinchor');
  });

  it('AC3 — chercher depuis la page 7 retourne à la page 1', async () => {
    urlCourante = 'page=7';
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'Saly');
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(derniereUrl().has('page')).toBe(false);
  });

  it('le filtre part au SERVEUR — la liste rendue n’est jamais filtrée en mémoire', async () => {
    // Le serveur rend délibérément un bien qui ne contient PAS le mot cherché : si l'écran
    // filtrait la liste rapatriée, il l'aurait masqué.
    urlCourante = 'filter[search]=introuvable';
    render(wrap(<PropertyModerationWorkspace />));

    expect(await screen.findByTestId('property-queue-item-1')).toHaveTextContent('Villa à Saly');
    expect(derniersParams().search).toBe('introuvable');
  });
});
