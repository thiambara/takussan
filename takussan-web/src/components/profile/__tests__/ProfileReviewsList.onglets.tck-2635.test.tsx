import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ProfileReviewsList } from '../ProfileReviewsList';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { UserRole } from '@/types/user';

/**
 * TCK-2635 (AC5) — « Mes avis » en trois onglets « Reçus · À laisser · Publiés », chacun compté ;
 * l'agent ouvre sur « Reçus », la note de SA FICHE PUBLIQUE en tête ; « Signaler » reste sur chaque
 * avis reçu ; l'onglet suit `?onglet=` ; au téléphone, les filtres passent dans une feuille.
 */
const nav = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 } }) }));
vi.mock('@/app/actions/property', () => ({ submitPropertyReport: vi.fn(), submitReviewReport: vi.fn() }));

const pageDe = (data: unknown[]) => ({
  data,
  meta: { total: data.length, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
});

const recu = (id: number) => ({
  id,
  reviewable_type: 'App\\Models\\Property',
  reviewable_id: 7,
  target: { type: 'property', id: 7, title: 'Villa Ngor', slug: 'villa-ngor', subtitle: null },
  author_id: 5,
  author: { id: 5, name: `Auteur ${id}`, avatar_url: null },
  rating: 4,
  title: `Avis ${id}`,
  content: 'Très bien.',
  is_approved: true,
  status: 'approved',
  reported_count: 0,
  reply_content: null,
  replied_at: null,
  can_reply: true,
  created_at: '2026-11-02T10:00:00Z',
});

const OPPORTUNITES = [
  { type: 'property', subject: { id: 7, title: 'Villa Ngor', slug: null }, context: { type: 'visit', id: 1 } },
  { type: 'agent', subject: { id: 12, title: 'Sokhna Ba', slug: null }, context: { type: 'visit', id: 1 } },
  { type: 'service_provider', subject: { id: 3, title: 'Plomberie Sarr', slug: null }, context: { type: 'maintenance_request', id: 77 } },
];

function espionner() {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    urls.push(url);
    const payload = url.includes('/api/reviews/received')
      ? pageDe([recu(90), recu(91), recu(92)])
      : url.includes('/api/me/review-opportunities')
        ? { data: OPPORTUNITES }
        : pageDe([]);
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  }));
  return urls;
}

function monter(roles: UserRole[], note: { moyenne: number; nombre: number } | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProfileReviewsList roles={roles} note={note} />
      </ToastProvider>
    </QueryClientProvider>,
  ));
}

afterEach(() => {
  nav.query = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('« Mes avis » en onglets (TCK-2635)', () => {
  it('l’agent ouvre sur « Reçus », chaque onglet compté, la note de sa fiche en tête', async () => {
    espionner();
    monter(['agent', 'customer'], { moyenne: 4.1, nombre: 12 });

    const onglets = screen.getAllByRole('tab');
    expect(onglets.map((o) => o.textContent?.replace(/\d+/g, '').trim())).toEqual(['Reçus', 'À laisser', 'Publiés']);
    expect(screen.getByRole('tab', { name: /Reçus/ })).toHaveAttribute('aria-selected', 'true');
    // Les comptes : 3 reçus (total de l'API), 2 formulaires à laisser (visite, intervention).
    await waitFor(() => expect(screen.getByRole('tab', { name: /Reçus/ })).toHaveTextContent('Reçus3'));
    expect(screen.getByRole('tab', { name: /À laisser/ })).toHaveTextContent('À laisser2');

    // La note est celle de la fiche publique, telle quelle — pas une moyenne de la page chargée (4).
    const tete = screen.getByRole('img', { name: 'Note moyenne : 4,1 sur 5' });
    expect(tete).toBeInTheDocument();
    expect(screen.getByText('4,1')).toBeInTheDocument();
    expect(screen.getByText('12 avis reçus')).toBeInTheDocument();
  });

  it('« Signaler » reste sur chaque avis reçu', async () => {
    espionner();
    monter(['agent', 'customer']);
    for (const id of [90, 91, 92]) {
      const carte = await screen.findByTestId(`received-review-${id}`);
      expect(within(carte).getByRole('button', { name: /signaler cet avis/i })).toBeInTheDocument();
    }
  });

  it('sans note de fiche, aucune moyenne ne s’affiche', async () => {
    espionner();
    monter(['agent', 'customer'], null);
    await screen.findByTestId('received-review-90');
    expect(screen.queryByRole('img', { name: /Note moyenne/ })).toBeNull();
  });

  it('`?onglet=a-laisser` ouvre « À laisser », et changer d’onglet écrit l’adresse', async () => {
    nav.query = 'onglet=a-laisser';
    espionner();
    const user = userEvent.setup();
    monter(['agent', 'customer']);
    expect(screen.getByRole('tab', { name: /À laisser/ })).toHaveAttribute('aria-selected', 'true');
    // Une seule cible dans le formulaire de l'intervention : « Publier mon avis ».
    const intervention = await screen.findByRole('form', { name: 'Plomberie Sarr' });
    expect(within(intervention).getByRole('button', { name: 'Publier mon avis' })).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: 'Villa Ngor' })).getByRole('button', { name: 'Publier mes avis' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Publiés/ }));
    expect(window.location.search).toContain('onglet=publies');
  });

  it('un onglet inconnu, ou « Reçus » pour qui n’en reçoit pas, ouvre le premier onglet', () => {
    nav.query = 'onglet=recus';
    espionner();
    monter(['customer']);
    expect(screen.queryByRole('tab', { name: /Reçus/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /À laisser/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('au téléphone, les filtres des avis reçus sont dans une feuille', async () => {
    const telephone = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(width < 48rem)',
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList);
    espionner();
    const user = userEvent.setup();
    monter(['agent', 'customer']);
    await screen.findByTestId('received-review-90');
    expect(screen.queryByRole('combobox', { name: 'Filtrer par statut' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Filtres' }));
    expect(await screen.findByRole('combobox', { name: 'Filtrer par statut' })).toBeInTheDocument();
    telephone.mockRestore();
  });
});
