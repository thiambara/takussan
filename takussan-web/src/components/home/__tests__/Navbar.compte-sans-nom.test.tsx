/**
 * TCK-623 — un compte ouvert par téléphone n'a pas encore de nom (`first_name = ''`).
 *
 * La navbar construisait les initiales par `first_name[0]` : `''[0]` vaut `undefined`, et le
 * gabarit l'écrivait en toutes lettres — « UNDEFINED » dans la pastille, en majuscules, débordant
 * sur le bouton « Publier » (relevé en préproduction le 2026-10-10).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/lib/auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { AuthProvider } = await import('@/context/AuthContext');
const { createQueryClient } = await import('@/lib/query-client');
const { Navbar } = await import('@/components/home/Navbar');

const PAR_TELEPHONE = {
  id: 11, first_name: '', last_name: '', full_name: '',
  email: null, phone: '+221770000623', roles: [],
} as unknown as User;

function rendre(user: User) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      {withIntl(
        <AuthProvider initialUser={user} initialToken="jeton">
          <Navbar />
        </AuthProvider>,
      )}
    </QueryClientProvider>,
  );
}

describe('Navbar — compte sans nom (TCK-623)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ ok: true, data: [], meta: { requested_ids: [], returned_ids: [] } }),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("n'écrit jamais « undefined », ni dans la barre ni dans le menu", async () => {
    const user = userEvent.setup();
    const { container } = rendre(PAR_TELEPHONE);

    expect(container.textContent?.toLowerCase()).not.toContain('undefined');
    expect(screen.getByText('Mon compte')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu utilisateur' }));
    expect(container.textContent?.toLowerCase()).not.toContain('undefined');
    expect(container.textContent?.toLowerCase()).not.toContain('null');
    // Le numéro désigne le compte, lisible.
    expect(screen.getAllByText('+221 77 000 06 23').length).toBeGreaterThan(0);
  });
});
