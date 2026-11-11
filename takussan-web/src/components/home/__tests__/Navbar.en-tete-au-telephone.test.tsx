/**
 * TCK-2568 (amendement d'ADR-0091 du 2026-11-09) — au téléphone, la barre du site n'est que là où la
 * maquette la montre. jsdom ne lit pas les media queries : on juge les classes qui portent le palier
 * (`max-lg:hidden`, la cale `h-0` sous `lg`), et le bureau par l'absence de toute classe `lg:` qui
 * masquerait la barre.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const etat = vi.hoisted(() => ({ chemin: '/fr' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => etat.chemin,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  apiRequest: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

vi.mock('@/components/announcements/BandeauxDuSite', () => ({ BandeauxDuSite: () => null }));

const { Navbar } = await import('@/components/home/Navbar');
const { NavbarSpacer } = await import('@/components/home/NavbarSpacer');

type Surcharge = React.ComponentProps<typeof Navbar>['auTelephone'];

function rendre(chemin: string, auTelephone?: Surcharge) {
  etat.chemin = chemin;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      {withIntl(
        <>
          <Navbar auTelephone={auTelephone} />
          <NavbarSpacer auTelephone={auTelephone} />
        </>,
      )}
    </QueryClientProvider>,
  );
  const nav = container.querySelector('nav')!;
  const cale = container.querySelector('[data-cale-navbar]')!;
  return { nav, cale, classesNav: nav.className.toString().split(/\s+/), classesCale: cale.className.toString().split(/\s+/) };
}

/** La barre est-elle masquée AU TÉLÉPHONE (sous `lg`) ? */
function masqueeAuTelephone(classes: readonly string[]): boolean {
  return classes.includes('max-lg:hidden') || classes.includes('hidden');
}

/** Le bureau n'a jamais de classe qui masque la barre (`hidden` sans palier la masquerait aussi). */
function masqueeEnBureau(classes: readonly string[]): boolean {
  return classes.some((c) => c === 'hidden' || /^(lg|xl|2xl):hidden$/.test(c));
}

beforeEach(() => {
  etat.chemin = '/fr';
});

describe('Navbar — la barre du site au téléphone suit la maquette (TCK-2568)', () => {
  it.each(['/fr', '/fr/legal/terms', '/fr/favorites/shared', '/fr/une-page-inconnue'])(
    '%s : la barre est là, la cale réserve sa hauteur',
    (chemin) => {
      const { classesNav, classesCale } = rendre(chemin);
      expect(masqueeAuTelephone(classesNav)).toBe(false);
      expect(classesCale).toContain('h-[69px]');
      expect(classesCale).not.toContain('h-0');
    },
  );

  // L'annuaire et les fiches d'agence et d'agent : depuis la vague 3 (TCK-2521 → TCK-2523).
  it.each(['/fr/favorites', '/fr/compare', '/fr/bookings', '/fr/account', '/fr/properties/un-bien', '/fr/agencies', '/fr/agencies/dakar-immo', '/fr/agents', '/fr/agents/sokhna-gueye'])(
    '%s : ni barre ni cale au téléphone, la barre reste en bureau',
    (chemin) => {
      const { nav, classesNav, classesCale } = rendre(chemin);
      expect(masqueeAuTelephone(classesNav)).toBe(true);
      // Le retour de la page est celui de SON en-tête : la barre n'en porte pas un second.
      expect(within(nav).queryByRole('link', { name: 'Retour' })).toBeNull();
      expect(masqueeEnBureau(classesNav)).toBe(false);
      expect(classesCale).toContain('h-0');
      expect(classesCale).not.toContain('h-[69px]');
      // La cale de bureau ne change pas.
      expect(classesCale).toContain('lg:h-[calc(var(--spacing)*6+53px)]');
    },
  );

  it('la liste : un retour remplace la marque au téléphone, la recherche reste', () => {
    const { nav, classesNav, classesCale } = rendre('/fr/properties');
    expect(masqueeAuTelephone(classesNav)).toBe(false);
    expect(classesCale).toContain('h-[69px]');
    const retour = within(nav).getByRole('link', { name: 'Retour' });
    expect(retour.className).toContain('lg:hidden');
    // La marque ne quitte que le téléphone : en bureau, elle ouvre toujours la barre.
    const marque = within(nav).getAllByRole('link').find((a) => a !== retour && a.getAttribute('href') === '/fr');
    expect(marque?.className).toContain('max-lg:hidden');
    expect(marque?.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('hors de la liste, pas de retour dans la barre : la marque reste au téléphone', () => {
    const { nav } = rendre('/fr');
    expect(within(nav).queryByRole('link', { name: 'Retour' })).toBeNull();
    const marque = within(nav).getAllByRole('link').find((a) => a.getAttribute('href') === '/fr');
    expect(marque?.className).not.toContain('max-lg:hidden');
  });

  it('« marque » (pages d’erreur) : le logo seul au téléphone, sur 56 px ; la cale réserve 57 ; le bureau ne change pas', () => {
    const { nav, classesNav, classesCale } = rendre('/fr/properties/un-bien-inconnu', 'marque');
    // La barre est là (elle n'est pas « sans barre »)…
    expect(masqueeAuTelephone(classesNav)).toBe(false);
    expect(masqueeEnBureau(classesNav)).toBe(false);
    // … mais sans la recherche au téléphone : le conteneur de la pastille est masqué à toute taille
    // sous `lg` (il l'est déjà en bureau), et la recherche de bureau, elle, n'est pas touchée.
    const pastille = within(nav).getByRole('button', { name: /Chercher/ });
    const conteneur = pastille.closest('div.min-w-0.flex-1')!;
    expect(conteneur.className.split(/\s+/)).toContain('hidden');
    expect(within(nav).getByRole('button', { name: 'Lancer la recherche' }).closest('.hidden.lg\\:flex')).not.toBeNull();
    // Le logo, nom compris dès 360 px, centré sur une rangée de 56 px.
    const marque = within(nav).getAllByRole('link').find((a) => a.getAttribute('href') === '/fr')!;
    expect(marque.className).toContain('max-lg:mt-0');
    expect(marque.querySelector('.max-sm\\:hidden')).toBeNull();
    expect((nav.querySelector('nav > div') as HTMLElement).className).toContain('max-lg:h-14');
    expect(classesCale).toContain('h-[57px]');
    expect(classesCale).not.toContain('h-[69px]');
    expect(classesCale).toContain('lg:h-[calc(var(--spacing)*6+53px)]');
    expect(within(nav).queryByRole('link', { name: 'Retour' })).toBeNull();
  });

  it.each(['/fr', '/fr/properties'])('sans « marque », la pastille de recherche reste au téléphone : %s', (chemin) => {
    // La liste surtout : son en-tête de maquette EST la recherche en vigueur (« ← Mermoz · à louer »).
    const { nav } = rendre(chemin);
    const conteneur = within(nav).getByRole('button', { name: /Chercher/ }).closest('div.min-w-0.flex-1')!;
    expect(conteneur.className.split(/\s+/)).not.toContain('hidden');
  });

  it('une page qui sait mieux que son chemin (404, bien retiré) force la barre — sur la barre ET la cale', () => {
    const { classesNav, classesCale } = rendre('/fr/properties/un-bien-retire', 'barre-du-site');
    expect(masqueeAuTelephone(classesNav)).toBe(false);
    expect(classesCale).toContain('h-[69px]');
    expect(screen.queryByRole('link', { name: 'Retour' })).toBeNull();
  });
});
