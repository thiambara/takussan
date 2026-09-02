/**
 * TCK-505 (#2, #3) — la barre publique tient dans le viewport, sur tablette comme sur téléphone.
 *
 * Mesuré par la campagne du 2026-09-02, sur les 14 pages publiques :
 *
 *   #2 — à 768 px, la mise en page de BUREAU (`md:flex`) s'affichait alors que son contenu mesure
 *        **869 px** : le cluster droit (« FR / Connexion / Publier ») dépassait de 101 px, « Publier »
 *        était invisible. Entre 768 et 1023 la barre doit rester la barre MOBILE, qui tient.
 *   #3 — à 390 px, le bouton menu avait son bord droit à **400 px** : la pastille de recherche
 *        (`flex-1` sans `min-w-0`) imposait la largeur de son contenu au lieu de rétrécir.
 *
 * Les assertions portent sur les classes — jsdom ne pose aucune feuille de style — et exigent
 * l'ABSENCE de l'ancienne classe : `md:flex lg:flex` cocherait un `toContain('lg:flex')` en laissant
 * le défaut intact. La mesure réelle est faite par le banc CDP (`docs/qa/responsive-2026-09-02.md`).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>,
  );
}

const classesDe = (el: Element | null) => (el?.className ?? '').split(/\s+/);

describe('Navbar publique — la mise en page de bureau attend `lg` (TCK-505 #2)', () => {
  it('la colonne centrale de bureau (recherche + catégories) est `hidden lg:flex`', () => {
    monter();
    const colonne = screen.getByRole('searchbox').closest('.max-w-xl');
    expect(colonne, 'la colonne centrale porte max-w-xl').not.toBeNull();
    expect(classesDe(colonne)).toContain('hidden');
    expect(classesDe(colonne)).toContain('lg:flex');
    expect(classesDe(colonne)).not.toContain('md:flex');
  });

  it('le cluster droit de bureau (« Connexion / Publier ») est `hidden lg:flex` — il mesure 869 px', () => {
    monter();
    const cluster = screen.getByRole('link', { name: 'Connexion' }).parentElement;
    expect(classesDe(cluster)).toContain('hidden');
    expect(classesDe(cluster)).toContain('lg:flex');
    expect(classesDe(cluster)).not.toContain('md:flex');
  });

  it('la rangée mobile (pastille + favoris + menu) reste visible jusqu’à `lg` exclu', () => {
    monter();
    const rangee = screen.getByRole('button', { name: 'Ouvrir le menu' }).parentElement;
    expect(classesDe(rangee)).toContain('flex');
    expect(classesDe(rangee)).toContain('lg:hidden');
    expect(classesDe(rangee)).not.toContain('md:hidden');
  });

  it('le panneau du menu mobile suit le même seuil (`lg:hidden`)', async () => {
    const user = userEvent.setup();
    const { container } = monter();
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    const panneau = container.querySelector('nav > div.absolute');
    expect(panneau, 'le panneau est le <div class="… absolute top-full …"> enfant du <nav>').not.toBeNull();
    expect(classesDe(panneau)).toContain('lg:hidden');
    expect(classesDe(panneau)).not.toContain('md:hidden');
  });
});

describe('Navbar publique — le bouton menu est entier à 390 px (TCK-505 #3)', () => {
  it('la rangée mobile peut être compressée par la barre : `flex-1` ET `min-w-0`', () => {
    monter();
    // C'est ELLE que la sonde mesurait à 400 px : un enfant flex garde `min-width: auto`, la
    // largeur de son contenu. `min-w-0` sur la pastille seule ne change rien (mesuré) — la
    // rangée doit d'abord pouvoir rétrécir pour que ses enfants aient à le faire.
    const rangee = screen.getByRole('button', { name: 'Ouvrir le menu' }).parentElement;
    expect(classesDe(rangee)).toContain('flex-1');
    expect(classesDe(rangee)).toContain('min-w-0');
  });

  it('la pastille de recherche peut rétrécir dans la rangée : `flex-1` ET `min-w-0`', () => {
    monter();
    // Le seul « Où cherchez-vous ? » rendu en TEXTE : celui de la pastille (le champ de bureau
    // le porte en placeholder, pas en contenu).
    const pastille = screen.getByText('Où cherchez-vous ?').closest('button');
    expect(pastille).not.toBeNull();
    expect(classesDe(pastille)).toContain('flex-1');
    // Son `overflow` est visible : sans `min-w-0`, son minimum flex reste sa largeur de contenu.
    expect(classesDe(pastille)).toContain('min-w-0');
  });
});
