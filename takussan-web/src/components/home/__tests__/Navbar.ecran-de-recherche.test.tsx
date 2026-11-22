/**
 * TCK-2497 — la saisie mobile de la barre est l'écran « Riche et complet » : Louer · Acheter et
 * « Rechercher » sous le champ, la liste dessous, jamais par-dessus (AC1) ; et « Retirer » les filtres
 * gardés vaut aussi pour le bouton « Rechercher », qui construit son URL dans la barre.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const push = vi.fn();
let parametresUrl = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => parametresUrl,
  usePathname: () => '/fr/properties',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  apiRequest: vi.fn().mockResolvedValue({ data: [] }),
  buildQueryString: () => '',
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

async function ouvrirLaSaisie() {
  // La pastille : celle qui ouvre un dialogue et se nomme par son texte (les favoris ont un aria-label).
  const declencheur = screen
    .getAllByRole('button')
    .find((b) => b.getAttribute('aria-haspopup') === 'dialog' && !b.hasAttribute('aria-label'));
  if (!declencheur) throw new Error('pastille mobile introuvable');
  await userEvent.click(declencheur);
  return screen.findByRole('dialog');
}

const parametres = (href: string) => Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));

beforeEach(() => {
  push.mockReset();
  parametresUrl = new URLSearchParams();
  window.localStorage.clear();
});

describe('Navbar — l’écran de recherche du téléphone (TCK-2497)', () => {
  it('Louer · Acheter et « Rechercher » sont sous le champ, et la liste vient APRÈS eux, dans le flux', async () => {
    monter();
    const ecran = await ouvrirLaSaisie();
    const champ = within(ecran).getByRole('combobox');
    const transaction = within(ecran).getByRole('group', { name: 'Louer / Acheter' });
    const rechercher = within(ecran).getByRole('button', { name: 'Rechercher' });
    const liste = within(ecran).getByRole('listbox');

    const suit = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(suit(champ, transaction)).toBe(true);
    expect(suit(transaction, rechercher)).toBe(true);
    expect(suit(rechercher, liste)).toBe(true);
    for (let n: HTMLElement | null = liste; n && n !== ecran; n = n.parentElement) {
      expect(n.className).not.toMatch(/(^|\s)absolute(\s|$)/);
    }
  });

  it('« Retirer » les filtres gardés : « Rechercher » repart d’une URL vide (la transaction choisie reste)', async () => {
    parametresUrl = new URLSearchParams('contract_type=rent&type=villa&bedrooms=3');
    monter();
    const ecran = await ouvrirLaSaisie();
    const gardes = within(ecran).getByRole('option', { name: /Vos filtres restent/ });
    expect(gardes).toHaveTextContent('Villa');
    fireEvent.mouseDown(gardes);

    await userEvent.click(within(ecran).getByRole('button', { name: 'Rechercher' }));
    expect(parametres(String(push.mock.calls.at(-1)?.[0]))).toEqual({ contract_type: 'rent' });
  });

  it('sans retrait, « Rechercher » garde les filtres de la liste (témoin)', async () => {
    parametresUrl = new URLSearchParams('contract_type=rent&type=villa&bedrooms=3');
    monter();
    const ecran = await ouvrirLaSaisie();
    await userEvent.click(within(ecran).getByRole('button', { name: 'Rechercher' }));
    expect(parametres(String(push.mock.calls.at(-1)?.[0]))).toEqual({ contract_type: 'rent', type: 'villa', bedrooms: '3' });
  });

  it('refermer puis rouvrir rend les filtres : le retrait ne survit pas à la saisie', async () => {
    parametresUrl = new URLSearchParams('type=villa');
    monter();
    let ecran = await ouvrirLaSaisie();
    fireEvent.mouseDown(within(ecran).getByRole('option', { name: /Vos filtres restent/ }));
    await userEvent.keyboard('{Escape}');
    ecran = await ouvrirLaSaisie();
    expect(within(ecran).getByRole('option', { name: /Vos filtres restent/ })).toBeInTheDocument();
    await userEvent.click(within(ecran).getByRole('button', { name: 'Rechercher' }));
    expect(parametres(String(push.mock.calls.at(-1)?.[0]))).toEqual({ type: 'villa' });
  });
});
