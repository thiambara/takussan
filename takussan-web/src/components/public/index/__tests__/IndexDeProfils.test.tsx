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
// La cale sous la barre monte aussi les bandeaux du site (TCK-572), clients et branchés sur
// React Query : du décor de page, comme la barre et le pied, hors du sujet de ces tests.
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));

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
const compter = vi.fn();
vi.mock('@/lib/queries/public-profiles', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/queries/public-profiles')>();
  return {
    ...vrai,
    listerProfilsPublics: (...args: unknown[]) => lister(...args),
    compterProfils: (...args: unknown[]) => compter(...args),
  };
});

// TCK-2568 — la règle qui ôte la barre du site au téléphone vit dans `barre-publique.ts`, et
// l'agent qui la tient y ajoute ou retire l'annuaire sans toucher à ce fichier : l'index doit être
// juste dans les DEUX états. Le double rend la vraie réponse, sauf quand un test impose l'autre.
const enTeteForce = vi.fn<(chemin: string) => string | undefined>(() => undefined);
vi.mock('@/lib/navigation/barre-publique', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/navigation/barre-publique')>();
  return {
    ...vrai,
    enTeteAuTelephone: (chemin: string) => enTeteForce(chemin) ?? vrai.enTeteAuTelephone(chemin),
  };
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
    median_response_minutes: null,
    cover: [],
    leases_signed_this_month: 0,
    languages: [],
    neighborhoods: [],
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
    vitrine: null,
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
  compter.mockReset();
  compter.mockResolvedValue(null);
  push.mockReset();
  enTeteForce.mockReset();
  enTeteForce.mockReturnValue(undefined);
});

describe('AC4 — la page rend du contenu, et un profil mène à sa fiche', () => {
  it('rend un titre, le nombre de profils, et une carte par profil', async () => {
    lister.mockResolvedValue(pageDe([profil(), profil({ id: 8, slug: 'etoile', nom: 'Étoile Immobilier' })]));
    await monter();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Professionnels');
    expect(screen.getByRole('heading', { level: 2, name: '2 agences' })).toBeInTheDocument();
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

  it('la ligne dit le volume, les villes, et la répartition à louer / à vendre', async () => {
    // 13 au total pour 8 + 4 : un bien sans type de contrat compte dans le total seulement
    // (`PublicProfileFacts::portefeuilles()`) — les trois nombres restent donc affichés.
    lister.mockResolvedValue(pageDe([profil({ portfolio_count: 13 })]));
    await monter();

    const ligne = screen.getByRole('listitem');
    expect(ligne).toHaveTextContent('13 biens · Dakar, Thiès');
    expect(within(ligne).getByText('8 à louer · 4 à vendre')).toBeInTheDocument();
  });

  it('la note n’est rendue QUE lorsqu’elle existe — sinon « Pas encore d’avis », jamais « 0 avis »', async () => {
    lister.mockResolvedValue(pageDe([profil({ reviews: { average: null, count: 0 } })]));
    const { unmount } = await monter();
    expect(screen.getByRole('listitem')).toHaveTextContent('Pas encore d’avis');
    expect(screen.getByRole('listitem')).not.toHaveTextContent('0 avis');
    unmount();

    lister.mockResolvedValue(pageDe([profil({ reviews: { average: 4.5, count: 6 } })]));
    await monter();
    // Virgule décimale en français : la note passe par le formateur de la langue.
    expect(screen.getByLabelText('Note moyenne de 4.5 sur 5')).toHaveTextContent('4,5');
    expect(screen.getByText('(6 avis)')).toBeInTheDocument();
    expect(screen.queryByText('Pas encore d’avis')).toBeNull();
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

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Professionnels');
    expect(screen.getByRole('listitem')).toHaveTextContent('Sahel Homes');
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

/**
 * TCK-573 — l'index `/agents` liste aussi des PROPRIÉTAIRES (en développement : les 44 profils).
 * Avant, la carte d'un propriétaire affichait son nom puis « Thiès Properties », sous le titre
 * « Les professionnels derrière les annonces » : un agent de cette agence, à la lecture.
 */
describe('TCK-573 — chaque personne est présentée pour ce qu’elle est', () => {
  it('un propriétaire se lit « Propriétaire », un agent « Agent immobilier », avant l’enseigne', async () => {
    lister.mockResolvedValue(
      pageDe([
        profil({
          id: 1,
          slug: 'oumy-sow',
          nom: 'Oumy Sow',
          public_role: 'owner',
          agency: { slug: 'thies-properties', name: 'Thiès Properties' },
        }),
        profil({ id: 2, slug: 'awa-diop', nom: 'Awa Diop', public_role: 'agent', specialty: 'Location' }),
      ]),
    );
    await monter({ ressource: 'agents' });

    const [proprietaire, agent] = screen.getAllByRole('listitem');
    expect(proprietaire).toHaveTextContent('Propriétaire · Thiès Properties');
    expect(proprietaire).not.toHaveTextContent('Agent immobilier');
    expect(agent).toHaveTextContent('Agent immobilier · Location');
  });

  it('une agence n’affiche aucune qualité de personne', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter();

    const carte = screen.getByRole('listitem');
    expect(carte).not.toHaveTextContent('Propriétaire');
    expect(carte).not.toHaveTextContent('Agent immobilier');
  });
});

/**
 * TCK-2521 — l'annuaire « Professionnels » : deux URL, deux onglets, une vitrine en tête.
 */
describe('TCK-2521 — l’URL choisit l’onglet', () => {
  function onglets() {
    const nav = screen.getByRole('navigation', { name: 'Agences ou agents' });
    return {
      agences: within(nav).getByRole('link', { name: /Agences/ }),
      agents: within(nav).getByRole('link', { name: /Agents/ }),
    };
  }

  it('/agencies : l’onglet Agences est la page courante, Agents mène à /agents', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter({ ressource: 'agencies' });

    const { agences, agents } = onglets();
    expect(agences).toHaveAttribute('aria-current', 'page');
    expect(agents).not.toHaveAttribute('aria-current');
    expect(agences).toHaveAttribute('href', '/fr/agencies');
    expect(agents).toHaveAttribute('href', '/fr/agents');
  });

  it('/agents : l’onglet Agents est la page courante — et non toujours le premier', async () => {
    lister.mockResolvedValue(pageDe([profil({ slug: 'awa-diop', nom: 'Awa Diop' })]));
    await monter({ ressource: 'agents' });

    const { agences, agents } = onglets();
    expect(agents).toHaveAttribute('aria-current', 'page');
    expect(agences).not.toHaveAttribute('aria-current');
  });

  it('la ville passe d’un onglet à l’autre, la recherche par nom et la page non', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter({ ressource: 'agencies', params: 'city=Thi%C3%A8s&q=sahel&page=2', page: 2 });

    expect(onglets().agents).toHaveAttribute('href', '/fr/agents?city=Thi%C3%A8s');
    expect(onglets().agences).toHaveAttribute('href', '/fr/agencies?city=Thi%C3%A8s');
  });

  it('chaque onglet porte son compte pour la ville ; sans recherche, celui de l’onglet actif est le total de la liste', async () => {
    lister.mockResolvedValue(pageDe([profil()], { total: 5 }));
    compter.mockResolvedValue(38);
    await monter({ ressource: 'agencies', params: 'city=Dakar' });

    expect(onglets().agences).toHaveTextContent('Agences5');
    expect(onglets().agents).toHaveTextContent('Agents38');
    // Une seule requête de compte : celle de l'autre onglet, à la ville demandée.
    expect(compter).toHaveBeenCalledTimes(1);
    expect(compter).toHaveBeenCalledWith('agents', 'Dakar', 'fr');
  });

  it('avec une recherche par nom, le compte de l’onglet actif reste celui de la ville, recherche ignorée', async () => {
    lister.mockResolvedValue(pageDe([profil()], { total: 1 }));
    compter.mockImplementation(async (ressource: string) => (ressource === 'agencies' ? 5 : 38));
    await monter({ ressource: 'agencies', params: 'q=sahel' });

    expect(onglets().agences).toHaveTextContent('Agences5');
    expect(compter).toHaveBeenCalledWith('agencies', undefined, 'fr');
  });

  it('un compte indisponible ne s’affiche pas — ni « 0 », ni trou dans la page', async () => {
    lister.mockResolvedValue(pageDe([profil()], { total: 3 }));
    compter.mockResolvedValue(null);
    await monter({ ressource: 'agencies' });

    expect(onglets().agents).toHaveTextContent(/^Agents$/);
    expect(onglets().agences).toHaveTextContent('Agences3');
  });
});

describe('TCK-2521 — la vitrine « Mise en avant » (TCK-2520)', () => {
  const VEDETTE = profil({
    id: 9,
    slug: 'teranga',
    nom: 'Teranga Immobilier',
    portfolio_count: 31,
    leases_signed_this_month: 12,
    cover: [
      { property_id: 1, slug: 'a', photo_url: 'https://media.test/1.webp' },
      { property_id: 2, slug: 'b', photo_url: 'https://media.test/2.webp' },
      { property_id: 3, slug: 'c', photo_url: 'https://media.test/3.webp' },
    ],
  });

  it('sans `spotlight`, aucune vitrine : la liste commence directement', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    const { container } = await monter();

    expect(screen.queryByText('Mise en avant')).toBeNull();
    expect(container.querySelector('article')).toBeNull();
  });

  it('avec `spotlight`, UNE carte signalée en tête — et l’agence aussi à son rang', async () => {
    lister.mockResolvedValue(pageDe([profil(), VEDETTE, profil({ id: 10, slug: 'etoile', nom: 'Étoile' })], { vitrine: VEDETTE }));
    const { container } = await monter();

    expect(screen.getAllByText('Mise en avant')).toHaveLength(1);
    const vitrine = container.querySelector('article')!;
    expect(within(vitrine).getByRole('heading', { level: 2, name: /Teranga Immobilier/ })).toBeInTheDocument();
    expect(within(vitrine).getByRole('link')).toHaveAttribute('href', '/fr/agencies/teranga');
    expect(vitrine).toHaveTextContent('31 biens');
    expect(vitrine).toHaveTextContent('12 baux signés ce mois-ci');
    expect(vitrine.querySelectorAll('img')).toHaveLength(3);

    // À son rang : la deuxième ligne, comme sans la place (décision 1a).
    const lignes = screen.getAllByRole('listitem');
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toHaveTextContent('Teranga Immobilier');
    // La vitrine précède la liste dans le document.
    expect(vitrine.compareDocumentPosition(lignes[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('au téléphone, badge et monogramme posés SUR la couverture (maquette D) — une seule fois chacun', async () => {
    lister.mockResolvedValue(pageDe([VEDETTE], { vitrine: VEDETTE }));
    const { container } = await monter();

    const vitrine = container.querySelector('article')!;
    const badges = within(vitrine).getAllByText('Mise en avant');
    expect(badges).toHaveLength(1);
    expect(badges[0]!.className.split(/\s+/)).toEqual(expect.arrayContaining(['max-lg:absolute', 'max-lg:bg-card']));
    // Le badge n'est pas sous `aria-hidden` : la place payante est signalée aussi aux lecteurs d'écran.
    expect(badges[0]!.closest('[aria-hidden="true"]')).toBeNull();
    expect(within(vitrine).getAllByText('TI')).toHaveLength(1);
    expect(within(vitrine).getByText('TI').closest('span.max-lg\\:absolute')).not.toBeNull();
  });

  it('aucun bail signé ce mois-ci : le compte ne s’affiche pas (zéro n’est pas un argument)', async () => {
    const sansBail = { ...VEDETTE, leases_signed_this_month: 0 };
    lister.mockResolvedValue(pageDe([sansBail], { vitrine: sansBail }));
    const { container } = await monter();

    expect(container.querySelector('article')).not.toHaveTextContent('ce mois-ci');
  });

  it('une vitrine sans photo publique reste une carte, sans cadre vide', async () => {
    const sansPhoto = { ...VEDETTE, cover: [] };
    lister.mockResolvedValue(pageDe([sansPhoto], { vitrine: sansPhoto }));
    const { container } = await monter();

    const vitrine = container.querySelector('article')!;
    expect(vitrine.querySelectorAll('img')).toHaveLength(0);
    expect(vitrine.querySelector('.bg-muted')).toBeNull();
    expect(vitrine).toHaveTextContent('Teranga Immobilier');
    // Sans couverture, rien à chevaucher : badge et monogramme restent dans le corps.
    expect(vitrine.querySelector('.max-lg\\:absolute')).toBeNull();
  });

  // Revue du 2026-11-09 — l'API sert `spotlight` à toute page et toute recherche (elle ne regarde que la
  // ville) : c'est la page qui ne la montre qu'en tête de la liste parcourue. Les trois formes reproduites.
  it('une recherche par nom sans résultat : l’état vide seul, pas de carte payante au-dessus', async () => {
    lister.mockResolvedValue(pageDe([], { vitrine: VEDETTE }));
    const { container } = await monter({ params: 'q=zzz' });

    expect(screen.queryByText('Mise en avant')).toBeNull();
    expect(container.querySelector('article')).toBeNull();
    expect(screen.getByText('Aucune agence ne correspond')).toBeInTheDocument();
  });

  it('une recherche par nom avec résultat : le résultat cherché ouvre la page, aucune autre agence devant', async () => {
    lister.mockResolvedValue(pageDe([profil()], { vitrine: VEDETTE }));
    await monter({ params: 'q=sahel' });

    expect(screen.queryByText('Mise en avant')).toBeNull();
    expect(screen.queryByText('Teranga Immobilier')).toBeNull();
  });

  it('page 2 et suivantes : pas de vitrine, elle n’est qu’en tête de la première page', async () => {
    lister.mockResolvedValue(pageDe([profil()], { vitrine: VEDETTE, page: 2, dernierePage: 3 }));
    await monter({ params: 'page=2', page: 2 });

    expect(screen.queryByText('Mise en avant')).toBeNull();
  });

  it('un état vide sans recherche (ville sans agence) : pas de vitrine non plus', async () => {
    lister.mockResolvedValue(pageDe([], { vitrine: VEDETTE }));
    await monter({ params: 'city=Saly' });

    expect(screen.queryByText('Mise en avant')).toBeNull();
  });

  it('l’onglet Agents n’a jamais de vitrine, même si la couche réseau en rendait une', async () => {
    lister.mockResolvedValue(pageDe([profil()], { vitrine: VEDETTE }));
    await monter({ ressource: 'agents' });

    expect(screen.queryByText('Mise en avant')).toBeNull();
  });

  it('API en panne : ni vitrine, ni « Rejoindre », seulement le bandeau', async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    lister.mockRejectedValue(new Error('503'));
    await monter();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Mise en avant')).toBeNull();
    expect(screen.queryByText('Rejoindre Takussan')).toBeNull();
    journal.mockRestore();
  });
});

describe('TCK-2521 — un fait absent ne laisse ni trou ni « — »', () => {
  it('délai, langues et quartiers absents : rien de rendu à leur place', async () => {
    lister.mockResolvedValue(pageDe([profil({ public_role: 'agent', reviews: { average: null, count: 0 } })]));
    await monter({ ressource: 'agents' });

    const ligne = screen.getByRole('listitem');
    expect(ligne).not.toHaveTextContent('Répond');
    expect(ligne).not.toHaveTextContent('Langues');
    expect(ligne).not.toHaveTextContent('Quartiers');
    expect(ligne.textContent).not.toMatch(/—|undefined|null|NaN/);
    expect(ligne.textContent).not.toMatch(/·\s*·|·\s*$/);
  });

  it('délai connu : « Répond en ~2 h » pour une médiane de 90 minutes', async () => {
    lister.mockResolvedValue(pageDe([profil({ median_response_minutes: 90 })]));
    await monter();
    expect(screen.getByRole('listitem')).toHaveTextContent('Répond en ~2 h');
  });

  it('langues et quartiers d’un agent : libellés du front, code inconnu écarté', async () => {
    lister.mockResolvedValue(
      pageDe([
        profil({
          public_role: 'agent',
          languages: ['fr', 'wo', 'xx'],
          neighborhoods: [
            { id: 1, name: 'Mermoz' },
            { id: 2, name: 'Point E' },
          ],
        }),
      ]),
    );
    await monter({ ressource: 'agents' });

    const ligne = screen.getByRole('listitem');
    expect(ligne).toHaveTextContent('Français · Wolof');
    expect(ligne).toHaveTextContent('Mermoz, Point E');
    expect(ligne).not.toHaveTextContent('xx');
    expect(ligne).not.toHaveTextContent('publicProfileIndex');
  });

  it('la note et le délai d’une agence sont visibles d’emblée, sur la ligne', async () => {
    lister.mockResolvedValue(pageDe([profil({ reviews: { average: 4.6, count: 38 }, median_response_minutes: 55 })]));
    await monter();

    const ligne = screen.getByRole('listitem');
    expect(ligne).toHaveTextContent('4,6(38 avis)');
    expect(ligne).toHaveTextContent('Répond en ~55 min');
  });
});

describe('TCK-2521 — AC4 : aucun numéro sur une ligne d’annuaire', () => {
  it('même si un numéro se glissait dans la réponse, il n’est pas rendu', async () => {
    const fuite = { ...profil(), phone: '+221 77 123 45 67', whatsapp: '771234567', email: 'a@b.sn' } as ProfilPublic;
    lister.mockResolvedValue(pageDe([fuite], { vitrine: fuite }));
    const { container } = await monter();

    const html = container.innerHTML;
    expect(html).not.toMatch(/(?:\+?221[\s.]?)?7[0-8][\s.]?\d{3}[\s.]?\d{2}[\s.]?\d{2}/);
    expect(container.querySelector('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]')).toBeNull();
  });
});

describe('TCK-2521 — AC3 : /agents?city=dakar est rendu côté serveur', () => {
  it('le HTML rendu par le serveur porte les résultats et l’onglet Agents', async () => {
    const { renderToString } = await import('react-dom/server');
    lister.mockResolvedValue(
      pageDe([profil({ slug: 'awa-diop', nom: 'Awa Diop', public_role: 'agent' })], { total: 1 }),
    );
    const element = await IndexDeProfils({
      ressource: 'agents',
      locale: 'fr',
      params: new URLSearchParams('city=dakar'),
      page: 1,
      forme: 'rond',
    });
    const html = renderToString(withIntl(element));

    expect(lister).toHaveBeenCalledWith('agents', { page: 1, ville: 'dakar', recherche: undefined }, 'fr');
    expect(html).toContain('Awa Diop');
    expect(html).toContain('href="/fr/agents/awa-diop"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/fr\/agents\?city=dakar"|href="\/fr\/agents\?city=dakar"[^>]*aria-current="page"/);
  });
});

describe('TCK-2521 — « Rejoindre Takussan » ferme l’onglet Agences', () => {
  it('Agences : un lien vers /publish, l’entrée des professionnels', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter();
    expect(screen.getByRole('link', { name: 'Rejoindre Takussan' })).toHaveAttribute('href', '/publish');
  });

  it('Agents : pas d’appel aux agences', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter({ ressource: 'agents' });
    expect(screen.queryByRole('link', { name: 'Rejoindre Takussan' })).toBeNull();
  });

  it('état vide : les filtres et l’appel restent, aucun bandeau d’erreur', async () => {
    lister.mockResolvedValue(pageDe([]));
    await monter({ params: 'city=Saly' });
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rejoindre Takussan' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TCK-2521 — un logo qui ne se charge pas devient un monogramme', () => {
  it('l’erreur de chargement remplace l’image cassée par les initiales', async () => {
    const { fireEvent } = await import('@testing-library/react');
    lister.mockResolvedValue(pageDe([profil({ logo_url: 'https://media.test/logo-403.png' })]));
    const { container } = await monter();

    const ligne = screen.getByRole('listitem');
    const logo = ligne.querySelector('img')!;
    expect(logo).not.toBeNull();
    expect(within(ligne).queryByText('SH')).toBeNull();

    fireEvent.error(logo);

    expect(container.querySelector('li img')).toBeNull();
    expect(within(ligne).getByText('SH')).toBeInTheDocument();
  });
});

describe('TCK-2568 — l’en-tête collant est juste avec ou sans la barre du site', () => {
  function enTeteCollant(container: HTMLElement) {
    const titre = within(container).getByRole('heading', { level: 1, name: 'Professionnels' });
    return titre.closest('.sticky') as HTMLElement;
  }

  it('sans la barre au téléphone : l’en-tête colle au bord, son titre à `pt-5`', async () => {
    enTeteForce.mockReturnValue('en-tete-de-page');
    lister.mockResolvedValue(pageDe([profil()]));
    const { container } = await monter({ ressource: 'agents' });

    expect(enTeteForce).toHaveBeenCalledWith('/fr/agents');
    const collant = enTeteCollant(container);
    expect(collant.className).toMatch(/(^| )top-0( |$)/);
    expect(collant.className).not.toContain('top-[69px]');
    expect(collant.className).toMatch(/(^| )pt-5( |$)/);
    expect(collant.className).not.toMatch(/(^| )pt-3( |$)/);
  });

  it('avec la barre du site (fixe, 69 px sous `lg`) : l’en-tête colle DESSOUS, pas sous elle', async () => {
    enTeteForce.mockReturnValue('barre-du-site');
    lister.mockResolvedValue(pageDe([profil()]));
    const { container } = await monter();

    expect(enTeteForce).toHaveBeenCalledWith('/fr/agencies');
    const collant = enTeteCollant(container);
    expect(collant.className).toContain('top-[69px]');
    expect(collant.className).not.toMatch(/(^| )top-0( |$)/);
    expect(collant.className).toMatch(/(^| )pt-3( |$)/);
    expect(collant.className).not.toMatch(/(^| )pt-5( |$)/);
  });
});

describe('TCK-2521 (revue) — dès `lg`, l’en-tête redevient statique', () => {
  it('collant au téléphone, STATIQUE en bureau : sinon il collerait à top-0, sous la Navbar fixe', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    const { container } = await monter();

    const titre = within(container).getByRole('heading', { level: 1, name: 'Professionnels' });
    const enTete = titre.closest('.sticky') as HTMLElement;
    const classes = enTete.className.split(/\s+/);
    expect(classes).toContain('sticky');
    expect(classes).toContain('lg:static');
    // Aucune variante de bureau qui le rendrait collant de nouveau.
    expect(classes.filter((c) => /^(xl|2xl|lg):(sticky|fixed)$/.test(c))).toEqual([]);
  });
});

describe('TCK-2521 (revue) — « triées / triés » s’accorde au compte', () => {
  it('une agence : « 1 agence, triée par nombre de biens »', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter();
    expect(screen.getByText(/triée par nombre de biens/).closest('div')).toHaveTextContent(
      '1 agence, triée par nombre de biens',
    );
  });

  it('trois agences : « 3 agences, triées par nombre de biens »', async () => {
    lister.mockResolvedValue(pageDe([profil(), profil({ id: 8, slug: 'b' }), profil({ id: 9, slug: 'c' })]));
    await monter();
    expect(screen.getByText(/triées par nombre de biens/).closest('div')).toHaveTextContent(
      '3 agences, triées par nombre de biens',
    );
  });

  it('un profil : « 1 profil, trié par nombre de biens. »', async () => {
    lister.mockResolvedValue(pageDe([profil()]));
    await monter({ ressource: 'agents' });
    expect(screen.getByText(/trié par nombre de biens/).closest('div')).toHaveTextContent(
      '1 profil, trié par nombre de biens.',
    );
  });
});

describe('TCK-2521 (revue) — changer d’onglet se voit avant la page suivante', () => {
  it('un clic simple : navigation en transition, indicateur sur l’onglet demandé, liste estompée', async () => {
    const { fireEvent } = await import('@testing-library/react');
    // Une navigation qui ne se termine pas : la transition reste en cours, comme pendant les trois
    // appels à l'API de la page suivante.
    push.mockReturnValue(new Promise(() => {}));
    lister.mockResolvedValue(pageDe([profil()]));
    compter.mockResolvedValue(4);
    const { container } = await monter({ params: 'city=Dakar' });

    const nav = screen.getByRole('navigation', { name: 'Agences ou agents' });
    const agents = within(nav).getByRole('link', { name: /Agents/ });
    const pasEmpeche = fireEvent.click(agents);

    expect(pasEmpeche).toBe(false); // le lien n'a pas navigué tout seul : la transition s'en charge
    expect(push).toHaveBeenCalledWith('/fr/agents?city=Dakar');
    await vi.waitFor(() => expect(nav).toHaveAttribute('data-en-cours'));
    expect(agents.querySelector('[data-attente="onglet"]')).not.toBeNull();
    expect(container.querySelector('main')!.querySelector('[data-en-cours]')).toBe(nav);
  });

  it('un ⌘-clic ou l’onglet déjà actif : le navigateur fait ce qu’on lui demande, aucune transition', async () => {
    const { fireEvent } = await import('@testing-library/react');
    lister.mockResolvedValue(pageDe([profil()]));
    await monter();

    const nav = screen.getByRole('navigation', { name: 'Agences ou agents' });
    expect(fireEvent.click(within(nav).getByRole('link', { name: /Agents/ }), { metaKey: true })).toBe(true);
    expect(fireEvent.click(within(nav).getByRole('link', { name: /Agences/ }))).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(nav).not.toHaveAttribute('data-en-cours');
  });
});
