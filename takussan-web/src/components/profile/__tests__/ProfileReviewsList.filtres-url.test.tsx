/**
 * TCK-1515 (P167.02) — la boîte des avis reçus lit `?reply=` et `?subject=` à l'ouverture, bornés
 * aux options de ses filtres « Réponse » et « Sujet » : « Avis sans réponse » de l'aperçu du
 * bailleur y mène avec `?reply=unreplied&subject=property`. Une valeur inconnue est ignorée.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ProfileReviewsList } from '../ProfileReviewsList';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import fr from '@/messages/fr.json';

const nav = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 1 } }),
}));
vi.mock('@/app/actions/property', () => ({
  submitPropertyReport: vi.fn(),
  submitReviewReport: vi.fn(),
}));

const pageVide = {
  data: [],
  meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
};

function espionnerFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    urls.push(url);
    const payload = url.includes('/api/me/review-opportunities') ? { data: [] } : pageVide;
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  }));
  return urls;
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProfileReviewsList roles={['owner']} />
      </ToastProvider>
    </QueryClientProvider>,
  ));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Boîte des avis reçus — filtres portés par l’URL (TCK-1515)', () => {
  it('ouvre sur « Sans réponse » et « Bien » quand l’URL les nomme', async () => {
    nav.query = 'reply=unreplied&subject=property';
    const urls = espionnerFetch();
    monter();

    // TCK-2635 — le compte de l'onglet « Reçus » est une requête sans filtre ; la liste, elle, part
    // avec les filtres de l'URL.
    await waitFor(() => {
      const recus = urls.filter((u) => u.includes('/api/reviews/received'));
      expect(recus.some((u) => u.includes('filter[replied]=0') && u.includes('filter[subject_type]=property'))).toBe(true);
    });
    expect(screen.getByRole('combobox', { name: fr.profile.reviews.filterByReply })).toHaveTextContent(
      fr.profile.reviews.unreplied,
    );
  });

  it('ignore une valeur hors des options', async () => {
    nav.query = 'reply=peut-etre&subject=planete';
    const urls = espionnerFetch();
    monter();

    await waitFor(() => {
      expect(urls.some((u) => u.includes('/api/reviews/received'))).toBe(true);
    });
    for (const recu of urls.filter((u) => u.includes('/api/reviews/received'))) {
      expect(recu).not.toContain('filter[replied]');
      expect(recu).not.toContain('filter[subject_type]');
    }
  });
});
