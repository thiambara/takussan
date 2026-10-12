/**
 * TCK-633 (lot E) — une puce de catégorie de la barre n'ÉCRASE plus une sélection multiple.
 *
 * Le panneau de filtres pose `type=house,villa` ; un clic sur « Appartement » dans la barre
 * remplaçait le tout par `type=apartment`, et le visiteur perdait sa sélection sans un mot. Avec
 * deux types ou plus, la puce AJOUTE ou RETIRE le sien ; seule ou sans sélection, elle reste
 * mono-sélection (remplace, ou retire si elle était la seule) — le comportement de TCK-439.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
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

const { Navbar, prochaineSelectionDeTypes } = await import('@/components/home/Navbar');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

const puce = (nom: string) => screen.getAllByRole('button', { name: nom })[0]!;

function typesDeLaDerniereUrl(): string | null {
  const url = String(push.mock.calls.at(-1)?.[0] ?? '');
  return new URLSearchParams(url.split('?')[1] ?? '').get('type');
}

describe('prochaineSelectionDeTypes', () => {
  it.each([
    [[], 'villa', ['villa']],
    [['villa'], 'house', ['house']],
    [['villa'], 'villa', []],
    [['house', 'villa'], 'apartment', ['house', 'villa', 'apartment']],
    [['house', 'villa'], 'villa', ['house']],
    [['house', 'villa', 'land'], 'land', ['house', 'villa']],
  ] as const)('%j + %s → %j', (selection, type, attendu) => {
    expect(prochaineSelectionDeTypes(selection, type)).toEqual(attendu);
  });
});

describe('Navbar — une sélection multiple n’est pas écrasée (TCK-633)', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('les puces de la sélection multiple sont allumées', () => {
    parametresUrl = new URLSearchParams('type=house,villa');
    monter();
    expect(puce('Maison')).toHaveAttribute('aria-pressed', 'true');
    expect(puce('Villa')).toHaveAttribute('aria-pressed', 'true');
    expect(puce('Appartement')).toHaveAttribute('aria-pressed', 'false');
  });

  it('une puce hors de la sélection s’y AJOUTE', async () => {
    parametresUrl = new URLSearchParams('type=house,villa');
    monter();
    await userEvent.click(puce('Appartement'));
    expect(typesDeLaDerniereUrl()).toBe('house,villa,apartment');
  });

  it('une puce de la sélection en est RETIRÉE, les autres restent', async () => {
    parametresUrl = new URLSearchParams('type=house,villa');
    monter();
    await userEvent.click(puce('Villa'));
    expect(typesDeLaDerniereUrl()).toBe('house');
  });

  it('un seul type : la puce le remplace (mono-sélection inchangée)', async () => {
    parametresUrl = new URLSearchParams('type=villa');
    monter();
    await userEvent.click(puce('Maison'));
    expect(typesDeLaDerniereUrl()).toBe('house');
  });

  it('un seul type : sa propre puce le retire', async () => {
    parametresUrl = new URLSearchParams('type=villa');
    monter();
    await userEvent.click(puce('Villa'));
    expect(typesDeLaDerniereUrl()).toBeNull();
  });
});
