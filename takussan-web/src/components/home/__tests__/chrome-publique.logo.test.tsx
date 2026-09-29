/**
 * TCK-583 — le logo « lever de toit » sur la chrome publique : la barre, l'en-tête de son menu
 * mobile, le pied de page. Chacun montre le symbole ET garde le nom lu « Takussan » — le symbole ne
 * remplace pas le nom, il s'y ajoute, muet.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
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
const { Footer } = await import('@/components/home/Footer');

function monterBarre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

/** Le lien d'accueil porte le symbole muet, et se lit « Takussan ». */
function attendreLeLogo(lien: HTMLElement) {
  expect(lien.getAttribute('href')).toMatch(/^\/(fr)?$/);
  const symbole = lien.querySelector('svg');
  expect(symbole, 'le lien d’accueil doit porter le symbole').not.toBeNull();
  expect(symbole!.getAttribute('aria-hidden')).toBe('true');
  expect(symbole!.getAttribute('viewBox')).toBe('2.6 11.6 42.8 30');
  // Chrome applique `text-transform` au nom accessible : rien de mis en capitales n'est exposé.
  for (const el of lien.querySelectorAll('.uppercase')) expect(el.closest('[aria-hidden="true"]')).not.toBeNull();
}

describe('le logo sur la chrome publique', () => {
  it('la barre : le lien d’accueil montre le symbole et se lit « Takussan »', () => {
    monterBarre();
    attendreLeLogo(screen.getByRole('link', { name: 'Takussan' }));
  });

  it('l’en-tête du menu mobile redessine le même logo', async () => {
    const user = userEvent.setup();
    monterBarre();
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    const panneau = await screen.findByRole('dialog', { name: 'Menu' });
    attendreLeLogo(within(panneau).getByRole('link', { name: 'Takussan' }));
  });

  it('le pied de page : la signature porte le symbole et le nom', () => {
    render(withIntl(<Footer />));
    const pied = screen.getAllByRole('contentinfo').at(-1)!;
    const signature = within(pied).getByText('Takussan', { selector: '.sr-only' });
    const logo = signature.parentElement!;
    const symbole = logo.querySelector('svg');
    expect(symbole).not.toBeNull();
    expect(symbole!.getAttribute('aria-hidden')).toBe('true');
    expect(symbole!.getAttribute('viewBox')).toBe('2.6 11.6 42.8 30');
  });
});
