/**
 * TCK-2807 — la fiche d'un document distingue le refus (403), l'absence (404) et la panne : un 403 ne
 * se dit plus « introuvable », et ni le 403 ni le 404 ne proposent « Réessayer », qui n'y changerait
 * rien. Une panne garde sa reprise, comme dans `QueryBoundary` (TCK-2751).
 *
 * La lecture du document est la VRAIE (`useDocumentWithVersions` → `useApiQuery` → `apiRequest`) sur
 * un `fetch` doublé : l'`ApiError` naît de la réponse, et la relance se compte en requêtes.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { DocumentDetailClient } from '../DocumentDetailClient';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 11 }, token: 'jeton-du-lecteur' }) }));

const fetchMock = vi.fn();
const lecturesDuDocument = () => fetchMock.mock.calls.filter(([url]) => /\/api\/documents\/7(\?|$)/.test(String(url))).length;

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const avecClient = (ui: ReactNode) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
  return render(withIntl(avecClient(<DocumentDetailClient documentId={7} />)));
}

const reponse = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('<DocumentDetailClient> sur une lecture en erreur (TCK-2807)', () => {
  it('AC3 — un 403 dit le refus, sans « Réessayer » et sans « introuvable »', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reponse(403, { message: 'This action is unauthorized.' })));
    rendre();

    expect(await screen.findByText('Votre profil actif ne permet pas d\'ouvrir ce document.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    expect(screen.queryByText(/introuvable/i)).toBeNull();
  });

  it('AC3 — un 404 dit « introuvable », sans « Réessayer »', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reponse(404, { message: 'Not found.' })));
    rendre();

    expect(await screen.findByText('Document introuvable.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('AC3 — une panne (500) propose « Réessayer », et un clic relance la lecture', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reponse(500, { message: 'Server Error' })));
    rendre();

    const reessayer = await screen.findByRole('button', { name: 'Réessayer' });
    expect(screen.queryByText(/introuvable/i)).toBeNull();
    expect(lecturesDuDocument()).toBe(1);
    await userEvent.click(reessayer);
    await vi.waitFor(() => expect(lecturesDuDocument()).toBe(2));
  });
});
