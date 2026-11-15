import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import type { AgentDto, ResultatFicheAgent } from '@/lib/queries/public-agent';
import type { PortefeuilleDeFiche } from '@/lib/queries/portefeuille-de-fiche';

import Page, { generateMetadata } from '../page';
import NotFound from '../not-found';

/**
 * La fiche d'agent — **l'introuvable n'est pas l'indisponible** (TCK-438, AC1 et AC2).
 *
 * ## Le défaut, observé et non supposé
 *
 * `agents/[slug]/page.tsx` faisait `try { … } catch { return null }` puis `notFound()` sur ce
 * `null`. Toute panne devenait donc « cet agent n'existe pas », **gravé dans le code HTTP**.
 *
 * Ce n'est pas resté théorique : le 2026-08-27, pendant la campagne de mesure de ce ticket, le
 * serveur d'API local s'est arrêté de lui-même. `/fr/agents/dakar-immo-agent-1` — un agent qui existe,
 * que l'API sert en 200 quand elle tourne — a rendu **404**, et une sonde posée dans le `catch` a
 * nommé le vrai coupable :
 *
 * ```
 * [SONDE-G9] [TypeError: fetch failed] { [cause]: connect ECONNREFUSED 127.0.0.1:8002 }
 * ```
 *
 * À la même seconde, la fiche de bien voisine rendait 200 « momentanément indisponible » : TCK-335
 * avait corrigé le défaut sur une fiche sur trois, et les deux autres l'ont porté jusqu'ici.
 *
 * ## Ce que ces tests ne peuvent pas faire, et qui le fait à leur place
 *
 * Le harnais du dépôt est vitest/jsdom : **aucun test ne peut lire un code HTTP**. Ces tests
 * gardent donc la DÉCISION (`notFound()` appelé, ou non, et sur quelle panne) ; le fait que cette
 * décision produise bien un 404 et non un soft-404 en 200 dépend d'une propriété structurelle du
 * routeur, gardée par `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts` et
 * mesurée au `curl` — les deux relevés sont dans son docblock.
 */

const getAgentMock = vi.fn<() => Promise<ResultatFicheAgent>>();
const notFoundMock = vi.fn(() => {
  // `notFound()` de Next ne rend pas : il lève. Le mock fait pareil, sinon le composant
  // continuerait après l'appel et le test verrait un arbre que la production ne produit jamais.
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('next-intl/server', async () => {
  const fr = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  const resous = (chemin: string): string => {
    const valeur = chemin.split('.').reduce<unknown>(
      (noeud, cle) =>
        noeud && typeof noeud === 'object' ? (noeud as Record<string, unknown>)[cle] : undefined,
      fr,
    );
    return typeof valeur === 'string' ? valeur : chemin;
  };
  return {
    getLocale: async () => 'fr',
    getTranslations: async (espace?: string) =>
      (cle: string, params?: Record<string, string | number>) => {
        const gabarit = resous(espace ? `${espace}.${cle}` : cle);
        if (!params) return gabarit;
        return gabarit.replace(/\{(\w+)\}/g, (_, nom: string) =>
          nom in params ? String(params[nom]) : `{${nom}}`,
        );
      },
  };
});

const permanentRedirectMock = vi.fn((url: string) => {
  // Comme `notFound()`, `permanentRedirect()` lève (`NEXT_REDIRECT`) et ne rend rien après lui.
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  permanentRedirect: (url: string) => permanentRedirectMock(url),
  usePathname: () => '/fr/agents/dakar-immo-agent-1',
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/queries/public-agent', () => ({ getAgent: () => getAgentMock() }));

// TCK-2523 — la recherche dans ses biens (au-delà de six) : le chargeur et la recherche ont leurs
// propres tests ; ici, on garde QUAND la page les appelle, et ce qu'elle leur passe.
const chargerMock = vi.fn<(...args: unknown[]) => Promise<PortefeuilleDeFiche>>();
vi.mock('@/lib/queries/portefeuille-de-fiche', () => ({
  chargerPortefeuilleDeFiche: (...args: unknown[]) => chargerMock(...args),
}));
const rechercheProps = vi.fn();
vi.mock('@/components/public/fiche/RechercheDuPortefeuille', () => ({
  RechercheDuPortefeuille: (props: Record<string, unknown>) => {
    rechercheProps(props);
    return <div data-testid="recherche" />;
  },
}));
// L'en-tête de fiche (retour, partage, rappel au défilement) a son propre test ; il rend l'identité.
vi.mock('@/components/public/fiche/EnTeteDeFiche', () => ({
  EnTeteDeFiche: ({ children }: { children: ReactNode }) => <div data-testid="en-tete-de-fiche">{children}</div>,
}));

// La barre et sa cale rendent la surcharge qu'elles reçoivent (TCK-2568) : c'est elle qu'on juge.
vi.mock('@/components/home/Navbar', () => ({
  Navbar: ({ auTelephone }: { auTelephone?: string }) => <nav data-testid="navbar" data-au-telephone={auTelephone ?? 'selon-le-chemin'} />,
}));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
// La cale sous la barre monte aussi les bandeaux du site (TCK-572), clients et branchés sur
// React Query : du décor de page, comme la barre et le pied, hors du sujet de ces tests.
vi.mock('@/components/home/NavbarSpacer', () => ({
  NavbarSpacer: ({ auTelephone }: { auTelephone?: string } = {}) => <div data-testid="cale" data-au-telephone={auTelephone ?? 'selon-le-chemin'} />,
}));
vi.mock('@/components/shared/BoutonRetour', () => ({
  BoutonRetour: ({ repli, libelle }: { repli: string; libelle: string }) => <a href={repli}>{libelle}</a>,
}));
vi.mock('@/components/public/profile/PortfolioTabs', () => ({
  PortfolioTabs: () => <div data-testid="portefeuille" />,
}));
// Le double rend la qualité reçue : c'est la page qui la transmet au formulaire de contact
// (TCK-573), et c'est ce passage que le test garde — le texte lui-même est éprouvé par
// `ContactSheet.tck-573.test.tsx`.
// TCK-2523 — le contact de la fiche est `ContactDeFiche` (barre d'actions au téléphone, carte en
// bureau). Le double rend le CANAL de message reçu (formulaire de qui, ou renvoi à l'agence) et le
// numéro reçu : c'est la page qui décide des deux (TCK-573, TCK-633, décision 1b).
vi.mock('@/components/public/fiche/ContactDeFiche', () => ({
  ContactDeFiche: ({ telephone, message, nom }: { telephone: string | null; nom: string; message: { genre: string; role?: string; slug: string } | null }) => (
    <div
      data-testid="contact"
      data-nom={nom}
      data-canal={message?.genre ?? ''}
      data-role={message?.genre === 'formulaire' ? message.role : message?.genre === 'agence' ? `agence:${message.slug}` : ''}
      data-phone={telephone ?? ''}
    />
  ),
}));
vi.mock('@/components/public/profile/TeamStrip', () => ({
  TeamStrip: () => <div data-testid="equipe" />,
}));
vi.mock('@/components/public/profile/StatsBar', () => ({ StatsBar: () => <div /> }));
vi.mock('@/components/public/profile/ReviewsSection', () => ({
  ReviewsSection: () => <div data-testid="avis" />,
}));

function agent(overrides: Partial<AgentDto> = {}): AgentDto {
  return {
    id: 11,
    slug: 'dakar-immo-agent-1',
    full_name: 'Awa Ndiaye',
    public_role: 'agent',
    bio: 'Spécialiste de la location à Dakar.',
    phone: '+221 77 000 00 00',
    phone_verified: true,
    city: 'Dakar',
    specialty: 'Location',
    years_of_experience: 6,
    avatar_url: null,
    agency: { id: 3, name: 'Dakar Immo', slug: 'dakar-immo' },
    portfolio_count: 9,
    portfolio_total: 9,
    portfolio: [],
    stats: { rent_count: 6, sale_count: 3, cities: 2, years: 6 },
    ...overrides,
  };
}

const params = () => Promise.resolve({ slug: 'dakar-immo-agent-1' });

beforeEach(() => {
  chargerMock.mockReset();
  chargerMock.mockResolvedValue({ fixes: { agent: 'dakar-immo-agent-1' }, graine: null, total: 7 });
  rechercheProps.mockClear();
});

describe("fiche d'agent — l'introuvable et l'indisponible", () => {
  beforeEach(() => {
    getAgentMock.mockReset();
    notFoundMock.mockClear();
  });

  it('AC1 — un 404 amont produit un `notFound()`, dans la page ET dans les métadonnées', async () => {
    getAgentMock.mockResolvedValue({ etat: 'introuvable' });

    await expect(Page({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);

    // ⚠ **Cette seconde assertion ne garde PAS le code HTTP, et il faut le dire ici pour qu'elle ne
    // soit pas relue comme telle.** Désagrégé le 2026-08-28 : `notFound()` dans le seul
    // `generateMetadata` rend **200**, dans le seul corps de page **404**. Ce qui est gardé ici,
    // c'est que `generateMetadata` ne calcule pas de métadonnées pour une entité inexistante — et
    // que l'union reste narrow-ée, sans quoi `tsc` casse sur `resultat.agent`.
    await expect(generateMetadata({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(2);
  });

  it("AC2 — une API injoignable rend l'indisponibilité, JAMAIS « agent introuvable »", async () => {
    getAgentMock.mockResolvedValue({ etat: 'indisponible' });

    render(withIntl(await Page({ params: params() })));

    expect(screen.getByText('Agent momentanément indisponible')).toBeInTheDocument();
    expect(screen.queryByText('Agent introuvable')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // La panne n'accuse pas l'agent : aucun `notFound()`, donc aucun 404.
    expect(notFoundMock).not.toHaveBeenCalled();
    // L'écran appartient au site : il garde sa chrome et son chemin de retour.
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it("AC2 — l'indisponibilité se retire de l'index (`robots: { index: false }`)", async () => {
    getAgentMock.mockResolvedValue({ etat: 'indisponible' });

    const meta = await generateMetadata({ params: params() });

    expect(meta.robots).toEqual({ index: false });
    expect(meta.title).toBe('Agent momentanément indisponible');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("l'agent trouvé est rendu par le serveur, sans état d'erreur", async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: agent() });

    render(withIntl(await Page({ params: params() })));

    expect(screen.getByRole('heading', { level: 1, name: 'Awa Ndiaye' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Retour d'administration du 2026-09-16 : la fiche n'avait aucun retour.
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/agents');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("les métadonnées d'un agent trouvé ne se retirent PAS de l'index", async () => {
    // Non-vacuité : sans cette assertion, un `robots: { index: false }` posé sur TOUS les cas
    // ferait passer le test d'AC2 tout en désindexant le catalogue entier.
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: agent() });

    const meta = await generateMetadata({ params: params() });

    expect(meta.robots).toBeUndefined();
    expect(meta.title).toContain('Awa Ndiaye');
  });
});

describe('TCK-915 — la biographie résumée pour la méta', () => {
  it('une bio longue est coupée au mot, une bio vide prend le résumé', async () => {
    const bio = 'Belle villa lumineuse avec piscine et jardin arboré, proche de la plage et des commerces, ' .repeat(4);
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: { ...agent(), bio } });
    const meta = await generateMetadata({ params: params() });
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect(String(meta.description).endsWith('…')).toBe(true);
    // Coupé au mot : le corps est un début du texte, et le texte continue par un blanc ou une ponctuation.
    const corps = String(meta.description).slice(0, -1);
    expect(bio.startsWith(corps)).toBe(true);
    expect(bio[corps.length]).toMatch(/[\s,;:.!?]/);

    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: { ...agent(), bio: '' } });
    expect((await generateMetadata({ params: params() })).description).not.toBe('');
  });
});

/**
 * TCK-573 — un propriétaire garde sa fiche sous `/agents/…`, mais n'y est JAMAIS présenté comme agent
 * immobilier. Mesuré avant correctif, `curl /fr/agents/owner.agency4` : `<title>Property Owner —
 * Agent immobilier — Takussan</title>` et un nœud `RealEstateAgent`.
 */
describe('fiche d’un propriétaire sous /agents — TCK-573', () => {
  const proprietaire = () =>
    agent({
      slug: 'owner.agency4',
      full_name: 'Property Owner',
      public_role: 'owner',
      bio: null,
      specialty: null,
      years_of_experience: null,
      // Un propriétaire rattaché à une agence ne devient pas pour autant « Agent chez » elle.
      agency: { id: 3, name: 'Dakar Immo', slug: 'dakar-immo' },
    });

  beforeEach(() => {
    getAgentMock.mockReset();
    notFoundMock.mockClear();
  });

  it('le titre de la page dit « Propriétaire », jamais « Agent immobilier »', async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: proprietaire() });

    const meta = await generateMetadata({ params: params() });

    expect(meta.title).toBe('Property O. — Propriétaire');
    expect(JSON.stringify(meta)).not.toContain('Agent immobilier');
  });

  it('la page le présente comme propriétaire et le balise en `Person`', async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: proprietaire() });

    const { container } = render(withIntl(await Page({ params: params() })));

    expect(screen.getByText(/^Propriétaire · Dakar$/)).toBeInTheDocument();
    expect(screen.queryByText(/Agent immobilier/)).not.toBeInTheDocument();
    expect(screen.queryByText('Agent chez')).not.toBeInTheDocument();

    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (e) => JSON.parse(e.textContent ?? '{}') as Record<string, unknown>,
    );
    expect(ld.map((n) => n['@type'])).toEqual(['Person']);
    // TCK-2523 (1b) — l'agence qui gère ses biens est connue : le contact y est renvoyé.
    expect(screen.getByTestId('contact')).toHaveAttribute('data-role', 'agence:dakar-immo');
  });

  /**
   * Le REPLI : tout ce qui n'est pas explicitement `agent` est présenté comme propriétaire — une
   * API plus ancienne qui n'émet pas le champ, ou une valeur qu'on ne connaît pas encore. La
   * vérification a inversé les deux tests (`!== 'owner'` au titre, `=== 'owner'` au balisage) :
   * 43 verts. Ce cas-ci les fait rougir.
   */
  it.each([
    ['absent', undefined],
    ['inconnu', 'courtier-associe'],
  ])('un rôle %s est présenté en propriétaire, jamais en agent', async (_cas, role) => {
    const personne = proprietaire();
    getAgentMock.mockResolvedValue({
      etat: 'trouve',
      agent: { ...personne, public_role: role as unknown as AgentDto['public_role'] },
    });

    expect((await generateMetadata({ params: params() })).title).toBe('Property O. — Propriétaire');
    const { container } = render(withIntl(await Page({ params: params() })));

    expect(screen.getByText(/^Propriétaire · Dakar$/)).toBeInTheDocument();
    expect(screen.queryByText(/Agent immobilier/)).not.toBeInTheDocument();
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(ld?.textContent ?? '{}')['@type']).toBe('Person');
  });

  it('le contrôle : un agent reste « Agent immobilier », en titre, en libellé et en balisage', async () => {
    // Sans ce cas, une page qui présenterait TOUT LE MONDE comme propriétaire passerait les deux
    // tests ci-dessus.
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: agent() });

    expect((await generateMetadata({ params: params() })).title).toBe('Awa Ndiaye — Agent immobilier');
    const { container } = render(withIntl(await Page({ params: params() })));

    expect(screen.getByText(/^Agent immobilier · Dakar · Location/)).toBeInTheDocument();
    expect(screen.getByText('Agent chez', { exact: false })).toBeInTheDocument();
    const ld = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(ld?.textContent ?? '{}')['@type']).toBe('RealEstateAgent');
    expect(screen.getByTestId('contact')).toHaveAttribute('data-role', 'agent');
  });
});

/**
 * TCK-633 (lot C, tour 3) — décision de la session sur D10 : **aucun numéro principal non vérifié
 * n'est servi au public.** L'API ne le sert plus (`User::numeroPrincipalPublic()`,
 * `NumeroPublieVerifieTest`) ; la page le refuse AUSSI, sur le booléen `phone_verified` que l'API
 * sert à côté : ni bouton d'appel, ni `telephone` dans les données structurées — que le moteur de
 * recherche garderait après correction. Un champ absent (API plus ancienne) vaut « non vérifié ».
 */
describe('fiche publique — le numéro ne sort que vérifié (TCK-633, D10)', () => {
  beforeEach(() => {
    getAgentMock.mockReset();
    notFoundMock.mockClear();
  });

  const donneesStructurees = (container: HTMLElement) =>
    [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (e) => JSON.parse(e.textContent ?? '{}') as Record<string, unknown>,
    );

  it.each([
    ['non vérifié', false],
    ['vérification absente', undefined],
  ])('un numéro %s : ni appel, ni JSON-LD `telephone`, ni numéro dans la page', async (_cas, verifie) => {
    getAgentMock.mockResolvedValue({
      etat: 'trouve',
      agent: agent({ phone: '+221 77 000 00 00', phone_verified: verifie }),
    });

    const { container } = render(withIntl(await Page({ params: params() })));

    expect(screen.getByTestId('contact')).toHaveAttribute('data-phone', '');
    const ld = donneesStructurees(container);
    expect(ld.length).toBeGreaterThan(0);
    for (const noeud of ld) expect(noeud).not.toHaveProperty('telephone');
    expect(container.innerHTML).not.toMatch(/tel:|wa\.me|77 000 00 00/);
  });

  it('le contrôle : un numéro vérifié est transmis au contact et balisé', async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: agent({ phone_verified: true }) });

    const { container } = render(withIntl(await Page({ params: params() })));

    expect(screen.getByTestId('contact')).toHaveAttribute('data-phone', '+221 77 000 00 00');
    expect(donneesStructurees(container)[0]).toHaveProperty('telephone', '+221 77 000 00 00');
  });
});

describe("TCK-1321 (P117.03) — les zones d'intervention de l'agent", () => {
  it('sont affichées à côté de la spécialité', async () => {
    getAgentMock.mockResolvedValue({
      etat: 'trouve',
      agent: agent({ intervention_zones: ['Plateau', 'Almadies'] }),
    });

    render(withIntl(await Page({ params: params() })));

    expect(screen.getByText(/Location · Plateau, Almadies/)).toBeInTheDocument();
  });

  it("sans zone, l'eyebrow ne change pas", async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: agent({ intervention_zones: [] }) });

    render(withIntl(await Page({ params: params() })));

    expect(screen.getByText(/Dakar · Location · /)).toBeInTheDocument();
    expect(screen.queryByText(/Plateau/)).not.toBeInTheDocument();
  });
});

/**
 * TCK-2506 — la fiche d'un propriétaire qui n'a pas choisi l'annuaire reste servie (une de ses
 * annonces y mène) mais en `noindex`, et sans données structurées `Person` : le sitemap et le
 * balisage suivent la règle de l'annuaire. Chaque test porte son contrôle : une page qui
 * désindexerait tout le monde rougit sur le second.
 */
describe("TCK-2506 — la fiche d'un propriétaire hors annuaire n'est pas indexée", () => {
  beforeEach(() => {
    getAgentMock.mockReset();
    notFoundMock.mockClear();
  });

  const horsAnnuaire = () =>
    agent({ slug: 'awa-d', full_name: 'Awa Diop', public_role: 'owner', indexable: false });

  it('`indexable: false` → `noindex` (liens suivis), et la page est quand même rendue', async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: horsAnnuaire() });

    const meta = await generateMetadata({ params: params() });
    expect(meta.robots).toEqual({ index: false, follow: true });

    const { container } = render(withIntl(await Page({ params: params() })));
    // TCK-2523 (1b) — un propriétaire n'est jamais nommé en entier.
    expect(screen.getByRole('heading', { level: 1, name: 'Awa D.' })).toBeInTheDocument();
    expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it.each([
    ['indexable', true],
    ['champ absent (API plus ancienne)', undefined],
  ])('le contrôle : %s → indexée et balisée', async (_cas, indexable) => {
    getAgentMock.mockResolvedValue({
      etat: 'trouve',
      agent: { ...horsAnnuaire(), indexable },
    });

    expect((await generateMetadata({ params: params() })).robots).toBeUndefined();
    const { container } = render(withIntl(await Page({ params: params() })));
    expect(container.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  });
});

/**
 * TCK-2519 — une ancienne adresse (`/agents/dakar-immo-owner-4`, un ancien slug, une autre casse)
 * redirige de façon permanente vers la fiche au nom. L'API ne sert `canonical_slug` que quand
 * l'adresse demandée n'est pas la canonique ; la page compare en plus au segment, pour qu'aucune
 * réponse ne puisse la faire boucler.
 */
describe('TCK-2519 — l’ancienne adresse redirige vers la fiche au nom', () => {
  beforeEach(() => {
    getAgentMock.mockReset();
    notFoundMock.mockClear();
    permanentRedirectMock.mockClear();
  });

  it('`canonical_slug` différent du segment → redirection permanente, locale comprise', async () => {
    getAgentMock.mockResolvedValue({
      etat: 'trouve',
      agent: agent({ slug: 'awa-ndiaye', canonical_slug: 'awa-ndiaye' }),
    });

    await expect(Page({ params: params() })).rejects.toThrow('NEXT_REDIRECT /fr/agents/awa-ndiaye');
    expect(permanentRedirectMock).toHaveBeenCalledTimes(1);
  });

  it('le contrôle : sans `canonical_slug`, ou égal au segment, la fiche est rendue', async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: agent() });
    render(withIntl(await Page({ params: params() })));

    getAgentMock.mockResolvedValue({
      etat: 'trouve',
      agent: agent({ canonical_slug: 'dakar-immo-agent-1' }),
    });
    render(withIntl(await Page({ params: params() })));

    expect(permanentRedirectMock).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Awa Ndiaye' })).toHaveLength(2);
  });

  it('les métadonnées déclarent canonique le slug servi par l’API, jamais le segment demandé', async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: agent({ slug: 'awa-ndiaye' }) });

    const meta = await generateMetadata({ params: params() });
    const canonique = 'alternates' in meta ? String(meta.alternates.canonical) : '';

    expect(canonique).toContain('/fr/agents/awa-ndiaye');
    expect(canonique).not.toContain('dakar-immo-agent-1');
  });
});

const rendreFiche = async (a: AgentDto, searchParams: Record<string, string> = {}) => {
  getAgentMock.mockResolvedValue({ etat: 'trouve', agent: a });
  return render(withIntl(await Page({ params: params(), searchParams: Promise.resolve(searchParams) })));
};

describe('TCK-2523 · AC1 — la recherche dans ses biens, au-delà de six seulement', () => {
  it('six biens : le portefeuille d’avant, aucune requête de recherche', async () => {
    await rendreFiche(agent({ portfolio_total: 6, portfolio_count: 6, portfolio: [{ id: 1 } as unknown as AgentDto['portfolio'][number]] }));

    expect(screen.queryByTestId('recherche')).not.toBeInTheDocument();
    expect(screen.getByTestId('portefeuille')).toBeInTheDocument();
    expect(chargerMock).not.toHaveBeenCalled();
  });

  it('sept biens : la recherche, avec les filtres de l’URL et le périmètre de la personne', async () => {
    await rendreFiche(agent({ portfolio_total: 7 }), { contract_type: 'rent', location: 'Mermoz' });

    expect(screen.getByTestId('recherche')).toBeInTheDocument();
    expect(screen.queryByTestId('portefeuille')).not.toBeInTheDocument();
    expect(chargerMock).toHaveBeenCalledWith({ agent: 'dakar-immo-agent-1' }, { contract_type: 'rent', location: 'Mermoz' }, 'fr');
    // Revue du 2026-11-09 — la recherche colle sous la rangée « ← · partager » (maquette D, `TeteFiltreeAgent`).
    expect((rechercheProps.mock.calls.at(-1)?.[0] as { collerSous: unknown }).collerSous).toBe('en-tete');
  });
});

describe('TCK-2523 · AC2 — « aucun bien » renvoie vers son agence', () => {
  it('un agent rattaché : la recherche reçoit son agence (le compte est demandé par elle)', async () => {
    await rendreFiche(agent({ portfolio_total: 9 }));
    expect((rechercheProps.mock.calls.at(-1)?.[0] as { agence: unknown }).agence).toEqual({ nom: 'Dakar Immo', slug: 'dakar-immo' });
  });

  it('un propriétaire : pas de renvoi « chez son agence » (il n’en est pas l’agent)', async () => {
    await rendreFiche(agent({ public_role: 'owner', portfolio_total: 9 }));
    expect((rechercheProps.mock.calls.at(-1)?.[0] as { agence: unknown }).agence).toBeNull();
  });
});

describe('TCK-2523 · AC3 — la fiche d’un propriétaire sur option (décision 1b)', () => {
  const sokhna = (overrides: Partial<AgentDto> = {}) =>
    agent({
      slug: 'sokhna-g',
      first_name: 'Sokhna',
      last_name: 'Gueye',
      full_name: 'Sokhna Gueye',
      public_role: 'owner',
      indexable: true,
      // Un numéro VÉRIFIÉ : c'est le cas que la règle doit refuser quand même.
      phone: '+221 77 123 45 67',
      phone_verified: true,
      agency: null,
      bio: null,
      ...overrides,
    });

  it('aucun numéro dans le HTML (balayage), ni dans le contact, ni dans les données structurées', async () => {
    const { container } = await rendreFiche(sokhna());

    expect(screen.getByTestId('contact')).toHaveAttribute('data-phone', '');
    expect(container.innerHTML).not.toMatch(/tel:|wa\.me|77 123 45 67|771234567|\+221/);
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}') as Record<string, unknown>;
    expect(ld).not.toHaveProperty('telephone');
  });

  it('le nom est abrégé partout — titre, `<h1>`, contact, données structurées — et le nom de famille n’apparaît pas', async () => {
    getAgentMock.mockResolvedValue({ etat: 'trouve', agent: sokhna() });
    expect((await generateMetadata({ params: params() })).title).toBe('Sokhna G. — Propriétaire');

    const { container } = await rendreFiche(sokhna());
    expect(screen.getByRole('heading', { level: 1, name: 'Sokhna G.' })).toBeInTheDocument();
    expect(screen.getByTestId('contact')).toHaveAttribute('data-nom', 'Sokhna G.');
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}') as Record<string, unknown>;
    expect(ld.name).toBe('Sokhna G.');
    expect(container.innerHTML).not.toContain('Gueye');
    expect(screen.getByText(/Nom abrégé, aucun numéro personnel/)).toBeInTheDocument();
  });

  it('l’agence qui gère ses biens connue : le contact vise l’agence, et l’encart y mène', async () => {
    await rendreFiche(sokhna({ agency: { id: 3, name: 'Dakar Immo', slug: 'dakar-immo' } }));

    expect(screen.getByTestId('contact')).toHaveAttribute('data-role', 'agence:dakar-immo');
    expect(screen.getAllByText(/Ses biens sont gérés par Dakar Immo/).length).toBeGreaterThan(0);
    for (const lien of screen.getAllByRole('link', { name: /Voir l'agence/ })) expect(lien).toHaveAttribute('href', '/fr/agencies/dakar-immo');
  });

  it('agence inconnue (l’API ne la sert pas encore, TCK-2574) : le formulaire anonyme du propriétaire, sans encart', async () => {
    await rendreFiche(sokhna());

    expect(screen.getByTestId('contact')).toHaveAttribute('data-role', 'owner');
    expect(screen.queryByText(/Ses biens sont gérés par/)).not.toBeInTheDocument();
  });

  it('le contrôle : un agent garde son nom entier et son numéro vérifié', async () => {
    await rendreFiche(agent({ first_name: 'Awa', last_name: 'Ndiaye' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Awa Ndiaye' })).toBeInTheDocument();
    expect(screen.getByTestId('contact')).toHaveAttribute('data-phone', '+221 77 000 00 00');
    expect(screen.getByTestId('contact')).toHaveAttribute('data-role', 'agent');
  });
});

describe('TCK-2523 · AC4 — langues, quartiers et délai', () => {
  it('servis : les langues dans la langue de la page, les quartiers, « Répond en ~2 h »', async () => {
    await rendreFiche(
      agent({ languages: ['fr', 'wo'], neighborhoods: [{ id: 1, name: 'Mermoz' }, { id: 2, name: 'Sacré-Cœur' }], median_response_minutes: 120 }),
    );

    const langues = screen.getByRole('list', { name: 'Langues parlées' });
    expect([...langues.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Français', 'Wolof']);
    expect(screen.getByText('Mermoz, Sacré-Cœur')).toBeInTheDocument();
    expect(screen.getByText(/Répond en ~2 h/)).toBeInTheDocument();
  });

  it('absents : aucune ligne vide, aucun « — », aucun délai inventé', async () => {
    const { container } = await rendreFiche(
      agent({ languages: [], neighborhoods: [], median_response_minutes: null, bio: null, reviews: undefined }),
    );

    expect(screen.queryByRole('list', { name: 'Langues parlées' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Répond en/)).not.toBeInTheDocument();
    const section = container.querySelector('section[aria-labelledby="identite-heading"]')!;
    expect(section.textContent).not.toMatch(/—|–/);
    for (const el of section.querySelectorAll('p, ul, li')) {
      expect(el.textContent?.trim() ?? '', el.outerHTML.slice(0, 80)).not.toBe('');
    }
    // Aucun conteneur vide non plus (revue du 2026-11-09) : un bloc sans texte ni image ne laisse
    // qu'une marge — la ligne vide que l'AC interdit.
    for (const el of section.querySelectorAll('div, span')) {
      const vide = (el.textContent?.trim() ?? '') === '' && el.querySelector('svg, img') === null && el.getAttribute('aria-hidden') !== 'true';
      expect(vide, el.outerHTML.slice(0, 120)).toBe(false);
    }
  });
});

describe('TCK-2568 — le haut de l’écran au téléphone, branché par la fiche de personne', () => {
  const surcharges = () => [
    screen.getByTestId('navbar').getAttribute('data-au-telephone'),
    screen.getByTestId('cale').getAttribute('data-au-telephone'),
  ];

  it('la fiche servie n’a pas de barre du site au téléphone (elle a sa rangée « ← [partager] »)', async () => {
    await rendreFiche(agent());
    expect(surcharges()).toEqual(['en-tete-de-page', 'en-tete-de-page']);
    expect(screen.getByTestId('en-tete-de-fiche')).toBeInTheDocument();
  });

  it('la panne de l’API ouvre sur la barre de marque', async () => {
    getAgentMock.mockResolvedValue({ etat: 'indisponible' });
    render(withIntl(await Page({ params: params() })));
    expect(surcharges()).toEqual(['marque', 'marque']);
  });

  it('la personne inconnue (404) ouvre sur la barre de marque', () => {
    render(withIntl(<NotFound />));
    expect(surcharges()).toEqual(['marque', 'marque']);
  });
});
