/**
 * TCK-2494 (ADR-0091 §5) — l'en-tête public de bureau tient sur une ligne : Louer · Acheter ·
 * Agences, recherche, favoris, compte, « Publier un bien ». La rangée de catégories ne reste que sur
 * les pages de DÉCOUVERTE (accueil, liste), et la cale sous la barre suit la même règle.
 *
 * jsdom ne pose aucune feuille de style : le débordement (AC4, 1024 → 1440) et la hauteur réelle de
 * la barre se mesurent au navigateur — cf. les Notes du ticket.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

const etat = vi.hoisted(() => ({ chemin: '/fr', requete: '', user: null as User | null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(etat.requete),
  usePathname: () => etat.chemin,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: etat.user, activeProfileId: null, token: etat.user ? 'jeton' : null, isLoading: false, logout: vi.fn() }),
}));

vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: [] } } }),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');
const { NavbarSpacer } = await import('@/components/home/NavbarSpacer');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(
    <QueryClientProvider client={client}>
      {withIntl(
        <>
          <Navbar />
          <NavbarSpacer />
        </>,
      )}
    </QueryClientProvider>,
  );
}

const rangeeDeCategories = () => screen.queryByRole('button', { name: 'Plus de types' });
const cale = (container: HTMLElement) => container.querySelector('[data-cale-navbar]')!;

beforeEach(() => {
  etat.chemin = '/fr';
  etat.requete = '';
  etat.user = null;
});

describe('TCK-2494 — Louer · Acheter · Agences dans l’en-tête (AC1)', () => {
  it('les trois liens, localisés ; Agences mène à l’annuaire', () => {
    monter();
    const barre = screen.getByRole('navigation');
    expect(within(barre).getByRole('link', { name: 'Louer' })).toHaveAttribute('href', '/fr/properties?contract_type=rent');
    expect(within(barre).getByRole('link', { name: 'Acheter' })).toHaveAttribute('href', '/fr/properties?contract_type=sale');
    expect(within(barre).getByRole('link', { name: 'Agences' })).toHaveAttribute('href', '/fr/agencies');
  });

  it.each([
    ['/fr/agencies', '', 'Agences'],
    ['/fr/agencies/dakar-immo', '', 'Agences'],
    ['/fr/properties', 'contract_type=rent', 'Louer'],
    ['/fr/properties', 'contract_type=sale', 'Acheter'],
  ])('%s?%s : « %s » porte `aria-current`, et lui seul', (chemin, requete, attendu) => {
    etat.chemin = chemin;
    etat.requete = requete;
    monter();
    const courants = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(courants.map((a) => a.textContent?.trim())).toEqual([attendu]);
  });

  it('un seul repère de navigation : la liste de liens n’est pas un second `<nav>`', () => {
    monter();
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('le repère est NOMMÉ : au téléphone, il côtoie la barre « Navigation principale »', () => {
    monter();
    expect(screen.getByRole('navigation', { name: 'Navigation du site' })).toBeInTheDocument();
  });
});

describe('TCK-2494 — la rangée de catégories ne reste que sur les pages de découverte (AC3)', () => {
  it.each(['/fr', '/fr/properties'])('%s : la rangée, et la cale haute', (chemin) => {
    etat.chemin = chemin;
    const { container } = monter();
    expect(rangeeDeCategories()).not.toBeNull();
    expect(cale(container)).toHaveAttribute('data-decouverte');
  });

  it.each(['/fr/properties/villa-ngor', '/fr/agencies', '/fr/account', '/fr/legal/terms'])(
    '%s : ni rangée, ni cale haute',
    (chemin) => {
      etat.chemin = chemin;
      const { container } = monter();
      expect(rangeeDeCategories()).toBeNull();
      expect(cale(container)).not.toHaveAttribute('data-decouverte');
    },
  );
});

describe('TCK-2494 — la cale tire sa hauteur de `data-decouverte` (revue)', () => {
  // jsdom ne calcule aucune hauteur : on garde la CLASSE qui lit l'attribut. Sans elle, l'accueil et
  // la liste passeraient sous la rangée de catégories en bureau, l'attribut posé et sans effet.
  // Valeurs mesurées au navigateur (Notes de TCK-2494) : 74,6 px hors découverte, 136 px sur
  // l'accueil (barre 127 px).
  it('une classe de bureau dédiée aux pages de découverte, et une hauteur de base hors découverte', () => {
    etat.chemin = '/fr';
    const { container } = monter();
    const classes = cale(container).className.split(/\s+/);
    expect(classes).toContain('lg:data-decouverte:h-[136px]');
    expect(classes).toContain('lg:h-[calc(1.5rem+53px)]');
  });
});

describe('TCK-2494 — le compte dans l’en-tête', () => {
  it('anonyme : « Connexion » et « Publier un bien », pas de « Mon espace »', () => {
    monter();
    expect(screen.getByRole('link', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publier un bien' })).toHaveAttribute('href', '/publish');
    expect(screen.queryByRole('button', { name: /Mon espace/ })).toBeNull();
  });

  it('connecté : « Mon espace » à la place de « Connexion », « Publier un bien » reste', () => {
    etat.user = { id: 3, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', roles: ['customer'] } as unknown as User;
    monter();
    expect(screen.getByRole('button', { name: /Mon espace/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connexion' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Publier un bien' })).toBeInTheDocument();
  });

  it('plus de menu burger : la barre d’onglets du bas le remplace (TCK-2493)', () => {
    monter();
    expect(screen.queryByRole('button', { name: 'Ouvrir le menu' })).toBeNull();
  });
});
