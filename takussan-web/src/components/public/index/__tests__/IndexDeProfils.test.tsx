/**
 * `/agencies` et `/agents` rendent du contenu, et un clic mène à la fiche — TCK-436 · AC4.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EST MOQUÉ, ET POURQUOI CHAQUE MOCK EST LÉGITIME
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * · `listerProfilsPublics` — c'est la frontière réseau. Ce que l'API rend réellement est éprouvé
 *   par `takussan-api/tests/Feature/Public/PublicProfileIndexTest.php`, sur la vraie base ; le
 *   feindre ici est ce qui permet d'éprouver les TROIS états (données, vide, panne), dont deux
 *   sont impossibles à provoquer autrement.
 * · `Navbar` / `Footer` — la chrome publique a ses propres tests (TCK-437, TCK-439) et ses propres
 *   dépendances (routeur, `localStorage`, capacités). La monter ici ferait rougir ce fichier pour
 *   des raisons qui ne le concernent pas.
 * · `next-intl/server` — `getTranslations` résout la locale par `next/headers`, qui n'existe pas
 *   sous jsdom. Le double utilise `createTranslator` sur le VRAI `fr.json` : l'ICU est réellement
 *   interprété, donc un pluriel manquant ou une clé absente fait rougir au lieu de rendre une
 *   chaîne vide.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { PageDeProfils, ProfilPublic } from '@/lib/queries/public-profiles';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr/agencies',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const fr = (await import('@/messages/fr.json')).default;
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'fr', messages: fr as never, namespace: namespace as never }),
    getLocale: async () => 'fr',
  };
});

const lister = vi.fn();
vi.mock('@/lib/queries/public-profiles', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/queries/public-profiles')>();
  return { ...vrai, listerProfilsPublics: (...args: unknown[]) => lister(...args) };
});

const { IndexDeProfils } = await import('../IndexDeProfils');

function profil(patch: Partial<ProfilPublic> = {}): ProfilPublic {
  return {
    id: 7,
    slug: 'sahel-homes',
    nom: 'Sahel Homes',
    logo_url: null,
    is_verified: true,
    city: 'Dakar',
    cities: ['Dakar', 'Thiès'],
    portfolio_count: 12,
    rent_count: 8,
    sale_count: 4,
    reviews: { average: 4.5, count: 6 },
    ...patch,
  };
}

function pageDe(profils: readonly ProfilPublic[], patch: Partial<PageDeProfils> = {}): PageDeProfils {
  return {
    profils,
    page: 1,
    dernierePage: 1,
    total: profils.length,
    villes: ['Dakar', 'Thiès'],
    ...patch,
  };
}

async function monter(options: {
  ressource?: 'agencies' | 'agents';
  params?: string;
  page?: number;
} = {}) {
  const element = await IndexDeProfils({
    ressource: options.ressource ?? 'agencies',
    locale: 'fr',
    params: new URLSearchParams(options.params ?? ''),
    page: options.page ?? 1,
    forme: 'carre',
  });
  return render(withIntl(element));
}

beforeEach(() => {
  lister.mockReset();
  push.mockReset();
});

describe('AC4 — la page rend du contenu, et un profil mène à sa fiche', () => {
  it('rend un titre, le nombre de profils, et une carte par profil', async () => {
    lister.mockResolvedValue(pageDe([profil(), profil({ id: 8, slug: 'etoile', nom: 'Étoile Immobilier' })]));
    await monter();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Les agences qui opèrent près de chez toi',
    );
    expect(screen.getByText('2 agences')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('chaque carte est un LIEN vers la fiche du profil, préfixé de la langue', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter();

    const lien = screen.getByRole('link', { name: /Sahel Homes/ });
    expect(lien).toHaveAttribute('href', '/fr/agencies/sahel-homes');
  });

  it('encode le slug dans le lien — un slug est une chaîne, pas un identifiant sûr', async () => {
    lister.mockResolvedValue(pageDe([profil({ slug: 'a b&c' })]));
    await monter();

    expect(screen.getByRole('link', { name: /Sahel Homes/ })).toHaveAttribute(
      'href',
      '/fr/agencies/a%20b%26c',
    );
  });

  it('la carte affiche la ville et le volume de portefeuille — les deux priorités du ticket', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter();

    const carte = screen.getByRole('listitem');
    expect(within(carte).getByText('Dakar · Thiès')).toBeInTheDocument();
    expect(within(carte).getByText('12')).toBeInTheDocument();
    expect(within(carte).getByText('8 à louer · 4 à vendre')).toBeInTheDocument();
  });

  it('la note n’est rendue QUE lorsqu’elle existe — zéro n’est pas « absent »', async () => {
    lister.mockResolvedValue(pageDe([profil({ reviews: { average: null, count: 0 } })]));
    const { unmount } = await monter();
    expect(screen.queryByText('· 0 avis')).toBeNull();
    unmount();

    lister.mockResolvedValue(pageDe([profil({ reviews: { average: 4.5, count: 6 } })]));
    await monter();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('· 6 avis')).toBeInTheDocument();
  });

  it('n’expose AUCUNE coordonnée dans le rendu — la carte mène à la fiche, elle ne la remplace pas', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    const { container } = await monter();

    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});

describe('l’état VIDE et l’état d’ERREUR ne s’affichent jamais ensemble — la leçon de TCK-335', () => {
  it('zéro profil : état vide, filtres conservés, AUCUN bandeau d’erreur', async () => {
    lister.mockResolvedValue(pageDe([]));
    await monter({ params: 'city=Saly' });

    expect(screen.getByText('Aucune agence ne correspond')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    // Le filtre reste à l'écran : sans lui, un visiteur qui a trop filtré n'a plus de retour.
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('API en panne : bandeau d’erreur, AUCUN « aucun résultat », et pas de filtre orphelin', async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    lister.mockRejectedValue(new Error('503'));
    await monter();

    expect(screen.getByRole('alert')).toHaveTextContent('Annuaire momentanément indisponible');
    expect(screen.queryByText('Aucune agence ne correspond')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    // La panne est NOMMÉE dans le journal : « la page est vide » n'apprend rien.
    expect(journal.mock.calls[0]?.[0]).toContain('agencies');
    journal.mockRestore();
  });
});

describe('la pagination est faite de vraies URL', () => {
  it('« suivants » garde les filtres et écrit `page`', async () => {
    lister.mockResolvedValue(pageDe([profil()], { page: 2, dernierePage: 4, total: 60 }));
    await monter({ params: 'city=Dakar&page=2', page: 2 });

    expect(screen.getByRole('link', { name: /Suivants/ })).toHaveAttribute(
      'href',
      '/fr/agencies?city=Dakar&page=3',
    );
    expect(screen.getByRole('link', { name: /Précédents/ })).toHaveAttribute(
      'href',
      // Retour à la page 1 : `page` est RETIRÉE, pas mise à 1 — une seule URL par page, ce que la
      // règle de canonique suppose.
      '/fr/agencies?city=Dakar',
    );
    expect(screen.getByText('Page 2 sur 4')).toBeInTheDocument();
  });

  it('une seule page : aucune navigation rendue', async () => {
    lister.mockResolvedValue(pageDe([profil()], { dernierePage: 1 }));
    await monter();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });
});

describe('les deux ressources partagent le corps sans partager leurs libellés', () => {
  it('`agents` rend son propre titre et l’enseigne de rattachement', async () => {
    lister.mockResolvedValue(
      pageDe([
        profil({
          slug: 'awa-diop',
          nom: 'Awa Diop',
          agency: { slug: 'sahel-homes', name: 'Sahel Homes' },
        }),
      ]),
    );
    await monter({ ressource: 'agents' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Les professionnels derrière les annonces',
    );
    expect(screen.getByText('Sahel Homes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Awa Diop/ })).toHaveAttribute(
      'href',
      '/fr/agents/awa-diop',
    );
  });

  it('transmet la ville et la recherche de l’URL à la couche réseau — filtrage SERVEUR', async () => {
    lister.mockResolvedValue(pageDe([]));
    await monter({ ressource: 'agents', params: 'city=Thi%C3%A8s&q=awa&page=3', page: 3 });

    expect(lister).toHaveBeenCalledWith(
      'agents',
      { page: 3, ville: 'Thiès', recherche: 'awa' },
      'fr',
    );
  });
});
