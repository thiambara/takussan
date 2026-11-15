import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ProfileReviewsList } from '../ProfileReviewsList';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { UserRole } from '@/types/user';

/**
 * TCK-2864 (AC1 à AC3, maquette `app-profil` e4) — la répartition 5 → 1 sous la note, « N avis en
 * attente de validation » au-dessus des reçus, et la carte « Bail clôturé le … · Noter ».
 */
const nav = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 } }) }));
vi.mock('@/app/actions/property', () => ({ submitPropertyReport: vi.fn(), submitReviewReport: vi.fn() }));

const recu = (id: number) => ({
  id,
  reviewable_type: 'App\\Models\\User',
  reviewable_id: 7,
  target: { type: 'user', id: 7, title: 'Sokhna Ba', slug: null, subtitle: null },
  author_id: 5,
  author: { id: 5, name: `Auteur ${id}`, avatar_url: null },
  rating: 5,
  title: null,
  content: 'Très bien.',
  is_approved: true,
  status: 'approved',
  reply_content: null,
  replied_at: null,
  can_reply: true,
  created_at: '2026-11-02T10:00:00Z',
});

interface Scenario {
  readonly distribution?: Record<string, number>;
  readonly pending?: number;
  readonly opportunites?: unknown;
}

function espionner({ distribution, pending, opportunites = { data: [] } }: Scenario) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    urls.push(url);
    const payload = url.includes('/api/reviews/received')
      ? {
          data: [recu(90)],
          meta: {
            total: 1, current_page: 1, last_page: 1, per_page: 20,
            ...(distribution ? { distribution } : {}),
            ...(pending !== undefined ? { pending_count: pending } : {}),
          },
        }
      : url.includes('/api/me/review-opportunities')
        ? opportunites
        : { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 } };
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

describe('« Mes avis » — la répartition des notes (TCK-2864, AC1)', () => {
  it('cinq lignes 5 → 1, chacune avec son compte ; la moyenne et le nombre sur le même ensemble', async () => {
    const urls = espionner({ distribution: { 5: 4, 4: 0, 3: 1, 2: 0, 1: 0 } });
    monter(['agent', 'customer'], { moyenne: 4.1, nombre: 12 });

    const repartition = await screen.findByRole('list', { name: 'Répartition des notes' });
    const lignes = within(repartition).getAllByRole('listitem');
    expect(lignes.map((l) => l.getAttribute('data-note'))).toEqual(['5', '4', '3', '2', '1']);
    expect(lignes[0]).toHaveTextContent('5 étoiles : 4 avis');
    expect(lignes[1]).toHaveTextContent('4 étoiles : 0 avis');
    expect(lignes[2]).toHaveTextContent('3 étoiles : 1 avis');
    // La somme des barres est le nombre affiché : (4×5 + 3) / 5 = 4,6.
    expect(screen.getByText('5 avis reçus')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Note moyenne : 4,6 sur 5' })).toBeInTheDocument();
    // L'agent : les avis qui LE visent, l'ensemble de sa fiche publique.
    expect(urls.some((u) => u.includes('/api/reviews/received') && u.includes('filter[subject_type]=agent'))).toBe(true);
  });

  it('sans répartition (API d’avant), la note de la fiche seule, sans barres', async () => {
    espionner({});
    monter(['agent', 'customer'], { moyenne: 4.1, nombre: 12 });
    await screen.findByTestId('received-review-90');
    expect(screen.getByText('12 avis reçus')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Répartition des notes' })).toBeNull();
  });
});

describe('« Mes avis » — les avis en attente de validation (TCK-2864, AC2)', () => {
  it('pending_count = 1 : « 1 avis en attente de validation » au-dessus de la liste', async () => {
    espionner({ pending: 1 });
    monter(['agent', 'customer']);
    const ligne = await screen.findByText('1 avis en attente de validation');
    const carte = await screen.findByTestId('received-review-90');
    // Au-dessus de la liste : la ligne précède la première carte dans le document.
    expect(ligne.compareDocumentPosition(carte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pending_count = 0 : rien', async () => {
    espionner({ pending: 0 });
    monter(['agent', 'customer']);
    await screen.findByTestId('received-review-90');
    expect(screen.queryByText(/en attente de validation/)).toBeNull();
  });
});

describe('« Mes avis » — le bail clôturé (TCK-2864, AC3)', () => {
  const bail = {
    kind: 'lease_closed',
    lease: { id: 31, end_date: '2026-10-31', property_title: 'F3, Sacré-Cœur 3' },
    target: { type: 'property', subject: { id: 7, title: 'F3, Sacré-Cœur 3', slug: null }, context: { type: 'lease', id: 31 } },
  };

  it('la carte « Bail clôturé le 31 oct. · … » et « Noter », qui ouvre le formulaire de ce bail', async () => {
    nav.query = 'onglet=a-laisser';
    espionner({
      opportunites: {
        // `data` propose déjà le bien (et l'agent) sous ce bail : une seule carte, pas deux.
        data: [
          { type: 'property', subject: { id: 7, title: 'F3, Sacré-Cœur 3', slug: null }, context: { type: 'lease', id: 31 } },
          { type: 'agent', subject: { id: 12, title: 'Sokhna Ba', slug: null }, context: { type: 'lease', id: 31 } },
        ],
        lease_closed: [bail],
      },
    });
    const user = userEvent.setup();
    monter(['tenant', 'customer']);

    const carte = await screen.findByText('Bail clôturé le 31 oct. · F3, Sacré-Cœur 3');
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('tab', { name: /À laisser/ })).toHaveTextContent('À laisser1');

    await user.click(screen.getByRole('button', { name: 'Noter' }));
    const formulaire = await screen.findByRole('form', { name: 'F3, Sacré-Cœur 3' });
    expect(within(formulaire).getByRole('button', { name: 'Publier mes avis' })).toBeInTheDocument();
    expect(carte).not.toBeInTheDocument();
  });

  it('au téléphone, pas de carte compacte (la maquette ne la dessine pas) : le formulaire d’emblée', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(width < 48rem)',
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList);
    nav.query = 'onglet=a-laisser';
    espionner({ opportunites: { data: [], lease_closed: [bail] } });
    monter(['tenant', 'customer']);
    expect(await screen.findByRole('form', { name: 'F3, Sacré-Cœur 3' })).toBeInTheDocument();
    expect(screen.queryByText(/Bail clôturé le/)).toBeNull();
  });

  it('un bail clôturé que `data` ne propose pas forme sa propre carte', async () => {
    nav.query = 'onglet=a-laisser';
    espionner({ opportunites: { data: [], lease_closed: [bail] } });
    const user = userEvent.setup();
    monter(['tenant', 'customer']);
    await screen.findByText('Bail clôturé le 31 oct. · F3, Sacré-Cœur 3');
    await user.click(screen.getByRole('button', { name: 'Noter' }));
    const formulaire = await screen.findByRole('form', { name: 'F3, Sacré-Cœur 3' });
    expect(within(formulaire).getByRole('button', { name: 'Publier mon avis' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tab', { name: /À laisser/ })).toHaveTextContent('À laisser1'));
  });
});
