/**
 * P201.04 (TCK-2039) — le formulaire d'invitation dépose un avis par cible, en série : quand un
 * dépôt échoue après d'autres, l'erreur dit quelles cibles sont déjà enregistrées.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileReviewsList } from '../ProfileReviewsList';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { UserRole } from '@/types/user';

// TCK-1515 — la boîte des avis reçus lit `?reply=` et `?subject=` ; ici, aucune URL.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 1 } }),
}));
vi.mock('@/app/actions/property', () => ({
  submitPropertyReport: vi.fn(),
  submitReviewReport: vi.fn(),
}));

const emptyPage = {
  data: [],
  meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
};

function page(data: unknown[], meta: Partial<typeof emptyPage.meta> = {}) {
  return { ...emptyPage, data, meta: { ...emptyPage.meta, total: data.length, ...meta } };
}

function renderList(roles: UserRole[] = ['customer']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ProfileReviewsList roles={roles} />
      </ToastProvider>
    </QueryClientProvider>,
  ));
}

type Appel = { url: string; method: string };

/** Le dépôt de l'avis d'agent échoue en 422 ; tout le reste réussit. */
function mockFetch(opportunities: unknown[]) {
  const appels: Appel[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = decodeURIComponent(String(input));
    const method = init?.method ?? 'GET';
    appels.push({ url, method });
    if (method === 'POST' && url.includes('/api/agents/')) {
      const payload = { message: 'Vous avez déjà noté cet agent.' };
      return { ok: false, status: 422, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
    const payload = method === 'POST'
      ? { data: { id: 1 } }
      : url.includes('/api/me/review-opportunities')
        ? { data: opportunities }
        : emptyPage;
    return {
      ok: true,
      status: method === 'POST' ? 201 : 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  });
  vi.stubGlobal('fetch', spy);
  return appels;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<ProfileReviewsList> — envoi partiel (P201.04)', () => {
  const bail = { type: 'lease', id: 5 };
  const opportunites = [
    { type: 'agent', subject: { id: 12, title: 'Moussa Fall', slug: 'moussa' }, context: bail },
    { type: 'property', subject: { id: 7, title: 'Villa Ngor', slug: 'villa-ngor' }, context: bail },
  ];

  it("l'erreur nomme les cibles déjà enregistrées", async () => {
    const appels = mockFetch(opportunites);
    const user = userEvent.setup();
    renderList();

    const formulaire = await screen.findByRole('form', { name: 'Villa Ngor' });
    const [bien, agent] = within(formulaire).getAllByRole('group');
    await user.click(within(bien!).getByLabelText('4 étoiles'));
    await user.click(within(agent!).getByLabelText('5 étoiles'));
    await user.click(within(formulaire).getByRole('button', { name: /publier mes avis/i }));

    const alerte = await within(formulaire).findByRole('alert');
    expect(appels.filter((a) => a.method === 'POST').map((a) => a.url)).toEqual([
      expect.stringContaining('/api/properties/7/reviews'),
      expect.stringContaining('/api/agents/12/reviews'),
    ]);
    expect(alerte).toHaveTextContent('Vous avez déjà noté cet agent.');
    expect(alerte).toHaveTextContent('Déjà enregistré : Le bien · Villa Ngor.');
    expect(alerte).not.toHaveTextContent("L'agent · Moussa Fall");
  });

  it("sans dépôt réussi avant l'erreur, l'erreur seule", async () => {
    mockFetch(opportunites);
    const user = userEvent.setup();
    renderList();

    const formulaire = await screen.findByRole('form', { name: 'Villa Ngor' });
    const [, agent] = within(formulaire).getAllByRole('group');
    await user.click(within(agent!).getByLabelText('5 étoiles'));
    await user.click(within(formulaire).getByRole('button', { name: /publier mes avis/i }));

    const alerte = await within(formulaire).findByRole('alert');
    expect(alerte).toHaveTextContent('Vous avez déjà noté cet agent.');
    expect(alerte).not.toHaveTextContent('Déjà enregistré');
  });
});
