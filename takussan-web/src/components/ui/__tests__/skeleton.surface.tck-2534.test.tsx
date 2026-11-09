/**
 * TCK-2534 — un squelette se distingue de la surface sur laquelle il est posé.
 *
 * Relevé de la revue de TCK-2520 : sur `/super-admin/*`, les squelettes de `DataState` étaient
 * `bg-muted` sur le `<main>` `bg-muted` de la coque — rgb(241, 236, 224) sur rgb(241, 236, 224).
 *
 * ⚠ jsdom ne calcule ni Tailwind ni `color-mix()` : ce test garde le BRANCHEMENT (le squelette lit
 * `--skeleton`, la coque super-admin le pose, rien d'autre ne le pose), et la différence des couleurs
 * calculées est relevée au navigateur (Notes d'implémentation du ticket, AC1 et AC2).
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { SUPER_ADMIN } from '@/test/habilitations';
import type { User } from '@/types/user';
import { SuperAdminShell } from '@/components/layout/SuperAdminShell';
import { Skeleton } from '../skeleton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/super-admin/boosts/agences',
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationCourante: () => ({ data: null }),
  useQuitterImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const user = { id: 1, first_name: 'Awa', last_name: 'Diop', email: 'awa@example.test', roles: ['super_admin'] } as unknown as User;

/** La déclaration `[--skeleton:…]` portée par un élément, ou `null`. */
function declarationSkeleton(el: Element): string | null {
  return [...el.classList].find((c) => c.startsWith('[--skeleton:')) ?? null;
}

describe('Skeleton — contraste sur sa surface (TCK-2534)', () => {
  it('lit `--skeleton`, avec `--muted` pour repli : hors de la console, la couleur ne change pas', () => {
    render(<Skeleton data-testid="squelette" />);
    const squelette = screen.getByTestId('squelette');
    expect(squelette).toHaveClass('bg-[var(--skeleton,var(--muted))]', 'animate-pulse');
    // Un `bg-muted` resté à côté gagnerait ou perdrait selon l'ordre des feuilles : il n'y en a pas.
    expect(squelette).not.toHaveClass('bg-muted');
  });

  it('la zone `main` de la console super-admin, fond `--muted`, pose un `--skeleton` qui n’est pas `--muted`', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <SuperAdminShell user={user} abilities={SUPER_ADMIN}>
            <Skeleton data-testid="squelette" />
          </SuperAdminShell>
        </QueryClientProvider>,
      ),
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass('bg-muted');
    const declaration = declarationSkeleton(main);
    expect(declaration).not.toBeNull();
    // Un mélange vers le texte, qui suit le thème — jamais `--muted` lui-même (le défaut corrigé).
    expect(declaration).toContain('var(--foreground)');
    expect(declaration).not.toBe('[--skeleton:var(--muted)]');

    // Le squelette de la page hérite de CETTE déclaration : aucun ancêtre plus proche ne la redéfinit.
    let ancetre = screen.getByTestId('squelette').parentElement;
    while (ancetre !== null && declarationSkeleton(ancetre) === null) ancetre = ancetre.parentElement;
    expect(ancetre).toBe(main);
  });
});
