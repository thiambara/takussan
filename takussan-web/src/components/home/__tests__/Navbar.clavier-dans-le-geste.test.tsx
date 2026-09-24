/**
 * TCK-563 (M3, décision du porteur du 2026-09-24) — la pastille reste dans la barre, et UN appui
 * ouvre la saisie clavier prêt.
 *
 * Le mécanisme gardé : base-ui focalise le champ de la feuille une image APRÈS le geste
 * (`FloatingFocusManager` → `queueMicrotask` → `enqueueFocus` → `requestAnimationFrame`). Safari
 * iOS n'ouvre le clavier que pour un focus posé PENDANT le gestionnaire du geste : sans relais,
 * le champ a le focus mais le clavier reste fermé, et il faut toucher le champ une seconde fois.
 * Mesuré au navigateur (Chrome, émulation tactile, 320 et 390 px, 2026-09-24) : à la fin du
 * gestionnaire de `click`, le focus était sur la PASTILLE (`BUTTON`) ; avec le relais, sur un
 * champ texte.
 *
 * Aucun navigateur de test n'a de clavier virtuel : ce qui est éprouvé est la condition dont iOS
 * dépend — un champ texte focalisé au moment où le gestionnaire du geste rend la main — puis le
 * passage du focus au vrai champ, sans reste.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('q=Dakar&page=2'),
  usePathname: () => '/fr/properties',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

function pastille(): HTMLElement {
  const candidates = screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-haspopup') === 'dialog' && !b.hasAttribute('aria-label'));
  expect(candidates).toHaveLength(1);
  return candidates[0]!;
}

describe('Pastille mobile — un appui, clavier prêt (TCK-563, M3)', () => {
  let focusDansLeGeste: Element | null = null;
  const surClic = () => {
    focusDansLeGeste = document.activeElement;
  };

  beforeEach(() => {
    push.mockReset();
    focusDansLeGeste = null;
    // Écouteur en phase de BULLE sur `window` : il s'exécute après celui de React (racine), donc
    // à la fin du traitement du geste — le moment où iOS décide d'ouvrir le clavier.
    window.addEventListener('click', surClic);
  });
  afterEach(() => {
    window.removeEventListener('click', surClic);
  });

  it('pendant le geste, un champ texte a déjà le focus ; puis le vrai champ, et le relais disparaît', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);

    fireEvent.click(pastille());

    expect(focusDansLeGeste).toBeInstanceOf(HTMLInputElement);
    expect((focusDansLeGeste as HTMLInputElement).type).toBe('text');

    const champ = within(await screen.findByRole('dialog')).getByRole('searchbox');
    await waitFor(() => expect(champ).toHaveFocus());
    expect(document.querySelector('[data-slot="relais-clavier"]')).toBeNull();
    // Ouvrir ne navigue toujours pas (TCK-549).
    expect(push).not.toHaveBeenCalled();
  });

  it('refermée, la saisie rend le focus à la pastille — pas au relais disparu', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
    const bouton = pastille();

    fireEvent.click(bouton);
    const dialogue = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialogue).getByRole('searchbox')).toHaveFocus());
    fireEvent.keyDown(within(dialogue).getByRole('searchbox'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(bouton).toHaveFocus());
  });
});
