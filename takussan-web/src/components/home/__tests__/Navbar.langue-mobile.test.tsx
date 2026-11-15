/**
 * TCK-550 — le choix de langue est atteignable sous `lg`, dans le menu mobile.
 *
 * Avant ce ticket, le seul sélecteur de la barre publique vivait dans le bloc d'actions
 * `hidden lg:flex` : à 360 et 390 px il était dans le DOM mais invisible (`offsetParent === null`,
 * relevé du 2026-09-23), et le menu mobile n'en proposait aucun.
 *
 * TCK-2493 / TCK-2494 (ADR-0091) — le menu mobile a quitté la barre. Le choix de langue vit :
 *   - sous `lg`, sur l'écran « Compte » / « Moi » (`/account`, case 5 de la barre d'onglets) ;
 *   - en bureau, dans le menu « Mon espace » du connecté et dans le pied de page — l'en-tête tient
 *     sur une ligne (maquette `?p=navigation&a=a`), il n'y a plus de sélecteur dans la barre.
 * Ce fichier garde que le contrôle est sur l'écran « Compte », qu'aucun de ses ancêtres ne le cache
 * sous `lg`, et que la langue courante est la seule marquée.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
const { EcranDuCompte } = await import('@/components/navigation-publique/EcranDuCompte');

function monter(ui: React.ReactElement, locale: LocaleDeTest = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(ui, locale)}</QueryClientProvider>);
}

const classesDe = (el: Element | null) => (el?.className ?? '').toString().split(/\s+/);

describe('Site public — le choix de langue sous `lg` est sur l’écran « Compte » (TCK-550, TCK-2493)', () => {
  it('FR · EN · WO sont sur l’écran, et aucun ancêtre ne les cache sous `lg`', () => {
    const { container } = monter(<EcranDuCompte />);
    const groupe = screen.getByRole('group', { name: 'Langue' });
    const boutons = within(groupe).getAllByRole('button');
    expect(boutons.map((b) => b.textContent?.trim())).toEqual(['FR', 'EN', 'WO']);

    // Aucun `hidden` jusqu'à la racine de l'écran : c'est la forme exacte du défaut d'origine — un
    // sélecteur rendu mais masqué sous `lg`.
    for (let el: HTMLElement | null = groupe; el && el !== container; el = el.parentElement) {
      expect(classesDe(el), `ancêtre masqué : ${el.outerHTML.slice(0, 120)}`).not.toContain('hidden');
    }
  });

  it('la langue courante est la seule marquée', () => {
    monter(<EcranDuCompte />, 'wo');
    const groupe = screen.getByRole('group', { name: 'Làkk' });
    const marques = within(groupe).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');
    expect(marques).toHaveLength(1);
    expect(marques[0]).toHaveTextContent('WO');
  });

  it('la barre ne porte plus de sélecteur : l’en-tête de bureau tient sur une ligne (TCK-2494)', () => {
    monter(<Navbar />);
    expect(screen.queryByRole('button', { name: 'Langue' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Langue' })).toBeNull();
  });
});
