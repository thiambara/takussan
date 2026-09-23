/**
 * TCK-550 — le choix de langue est atteignable sous `lg`, dans le menu mobile.
 *
 * Avant ce ticket, le seul sélecteur de la barre publique vivait dans le bloc d'actions
 * `hidden lg:flex` : à 360 et 390 px il était dans le DOM mais invisible (`offsetParent === null`,
 * relevé du 2026-09-23), et le menu mobile n'en proposait aucun.
 *
 * jsdom ne pose aucune feuille de style : la VISIBILITÉ réelle (boîte non nulle, dans le viewport
 * sans défilement du panneau) est mesurée au navigateur et consignée dans le ticket. Ce fichier
 * garde ce que le DOM peut trancher : le contrôle est DANS le panneau mobile, aucun de ses
 * ancêtres jusqu'au panneau ne le cache sous `lg`, et le sélecteur de bureau n'a pas bougé.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl, type LocaleDeTest } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
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

vi.mock('@/app/actions/locale', () => ({ setLocaleAction: vi.fn(async () => {}) }));

const { Navbar } = await import('@/components/home/Navbar');

function monter(locale: LocaleDeTest = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>{withIntl(<Navbar />, locale)}</QueryClientProvider>,
  );
}

const classesDe = (el: Element | null) => (el?.className ?? '').toString().split(/\s+/);

async function ouvrirLeMenu(locale: LocaleDeTest = 'fr', nom = 'Ouvrir le menu') {
  const user = userEvent.setup();
  monter(locale);
  await user.click(screen.getByRole('button', { name: nom }));
  // TCK-551 — le panneau est la boîte de dialogue du `Sheet` (portail hors du <nav>).
  return screen.findByRole('dialog');
}

describe('Navbar publique — le choix de langue dans le menu mobile (TCK-550)', () => {
  it('menu fermé : aucun choix de langue segmenté (le panneau n’existe pas)', () => {
    monter();
    expect(screen.queryByRole('group', { name: 'Langue' })).toBeNull();
  });

  it('menu ouvert : FR · EN · WO sont dans le panneau, et aucun ancêtre ne les cache sous `lg`', async () => {
    const panneau = await ouvrirLeMenu();
    const groupe = within(panneau).getByRole('group', { name: 'Langue' });
    const boutons = within(groupe).getAllByRole('button');
    expect(boutons.map((b) => b.textContent?.trim())).toEqual(['FR', 'EN', 'WO']);

    // Entre le contrôle et le panneau (lui-même `lg:hidden`, c'est voulu), aucun `hidden` : c'est
    // la forme exacte du défaut d'origine — un sélecteur rendu mais masqué sous `lg`.
    for (let el: HTMLElement | null = groupe; el && el !== panneau; el = el.parentElement) {
      expect(classesDe(el), `ancêtre masqué : ${el.outerHTML.slice(0, 120)}`).not.toContain('hidden');
    }
  });

  it('la langue courante est la seule marquée dans le menu', async () => {
    const panneau = await ouvrirLeMenu('wo', 'Ubbil menu bi');
    const groupe = within(panneau).getByRole('group', { name: 'Làkk' });
    const marques = within(groupe).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');
    expect(marques).toHaveLength(1);
    expect(marques[0]).toHaveTextContent('WO');
  });

  it('le sélecteur de bureau reste celui d’avant, dans le bloc `hidden lg:flex`', () => {
    monter();
    const bureau = screen.getByRole('button', { name: 'Langue' });
    expect(bureau).toHaveAttribute('aria-haspopup');
    const bloc = bureau.parentElement;
    expect(classesDe(bloc)).toContain('hidden');
    expect(classesDe(bloc)).toContain('lg:flex');
  });
});
