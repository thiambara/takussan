import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import type { AgentDto, ResultatFicheAgent } from '@/lib/queries/public-agent';

import Page, { generateMetadata } from '../page';

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

vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));
vi.mock('@/lib/queries/public-agent', () => ({ getAgent: () => getAgentMock() }));

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
// La cale sous la barre monte aussi les bandeaux du site (TCK-572), clients et branchés sur
// React Query : du décor de page, comme la barre et le pied, hors du sujet de ces tests.
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/shared/BoutonRetour', () => ({
  BoutonRetour: ({ repli, libelle }: { repli: string; libelle: string }) => <a href={repli}>{libelle}</a>,
}));
vi.mock('@/components/public/profile/PortfolioTabs', () => ({
  PortfolioTabs: () => <div data-testid="portefeuille" />,
}));
// Le double rend la qualité reçue : c'est la page qui la transmet au formulaire de contact
// (TCK-573), et c'est ce passage que le test garde — le texte lui-même est éprouvé par
// `ContactSheet.tck-573.test.tsx`.
vi.mock('@/components/public/profile/ContactSheet', () => ({
  ContactSheet: ({ recipientRole }: { recipientRole?: string | null }) => (
    <div data-testid="contact" data-role={recipientRole ?? ''} />
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

    expect(meta.title).toBe('Property Owner — Propriétaire');
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
    // Le formulaire de contact reçoit la qualité : sans elle, il disait « l'agent du bien ».
    expect(screen.getByTestId('contact')).toHaveAttribute('data-role', 'owner');
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

    expect((await generateMetadata({ params: params() })).title).toBe('Property Owner — Propriétaire');
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
