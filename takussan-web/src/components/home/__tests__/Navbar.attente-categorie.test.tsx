/**
 * TCK-580 — la catégorie cliquée dans la bande de la barre dit qu'elle charge, et elle seule.
 *
 * Le `push` simulé SUSPEND (comme l'aller-retour RSC de Next) : un `push` qui rendrait la main
 * terminerait la transition dans le même battement, et l'attente ne serait jamais observable.
 */
import { Suspense, use, useEffect, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

let suspendre: (attente: Promise<void>) => void = () => {};
let terminer: () => void = () => {};

const push = vi.fn(() => {
  suspendre(new Promise<void>((r) => { terminer = r; }));
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push, refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

const { Navbar } = await import('@/components/home/Navbar');

function Routeur({ children }: { children: ReactNode }) {
  const [attente, setAttente] = useState<Promise<void> | null>(null);
  // Dans un effet : l'écrire pendant le rendu serait un effet de bord (`react-hooks/globals`).
  useEffect(() => {
    suspendre = setAttente;
  }, []);
  if (attente) use(attente);
  return children;
}

describe('TCK-580 — bande des catégories : la catégorie cliquée porte le chargement', () => {
  it('du clic à l’arrivée de la page, seule « Villa » tourne', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <Routeur>{withIntl(<Navbar />)}</Routeur>
        </Suspense>
      </QueryClientProvider>,
    );

    const villa = screen.getByRole('button', { name: 'Villa' });
    expect(document.querySelector('[data-attente="categorie"]')).toBeNull();

    await act(async () => villa.click());
    expect(push).toHaveBeenCalledTimes(1);
    expect(villa).toHaveAttribute('aria-busy', 'true');
    expect(villa.querySelector('[data-attente="categorie"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-attente="categorie"]')).toHaveLength(1);

    await act(async () => terminer());
    expect(document.querySelector('[data-attente="categorie"]')).toBeNull();
    expect(villa).not.toHaveAttribute('aria-busy');
  });
});
