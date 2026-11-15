import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';

import type { AgencyDto, ResultatFicheAgence } from '@/lib/queries/public-agency';
import type { PortefeuilleDeFiche } from '@/lib/queries/portefeuille-de-fiche';
import type { PropertyListItem } from '@/types/property';
import { withIntl } from '@/test/intl';
import frMessages from '@/messages/fr.json';

import Page, { generateMetadata } from '../page';
import NotFound from '../not-found';

/**
 * La fiche d'agence — **l'introuvable n'est pas l'indisponible** (TCK-438, AC1 et AC2).
 *
 * ## Le défaut, observé et non supposé
 *
 * `agencies/[slug]/page.tsx` faisait `try { … } catch { return null }` puis `notFound()` sur ce
 * `null`. Toute panne devenait donc « cette agence n'existe pas », **gravé dans le code HTTP**.
 *
 * Ce n'est pas resté théorique : le 2026-08-27, pendant la campagne de mesure de ce ticket, le
 * serveur d'API local s'est arrêté de lui-même. `/fr/agencies/dakar-immo` — une agence qui existe,
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

const getAgencyMock = vi.fn<() => Promise<ResultatFicheAgence>>();
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

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  usePathname: () => '/fr/agencies/dakar-immo',
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/queries/public-agency', () => ({ getAgency: () => getAgencyMock() }));

// TCK-2522 — la première page du portefeuille, filtrée par l'URL : le chargeur a ses propres tests
// (`lib/queries/__tests__/portefeuille-de-fiche.test.ts`) ; ici, on garde ce que la page lui passe.
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
const contactProps = vi.fn();
vi.mock('@/components/public/fiche/ContactDeFiche', () => ({
  ContactDeFiche: (props: Record<string, unknown>) => {
    contactProps(props);
    return <div data-testid="contact" />;
  },
}));
// L'en-tête de fiche (IntersectionObserver, retour, partage) a son propre test ; il rend la couverture.
vi.mock('@/components/public/fiche/EnTeteDeFiche', () => ({
  EnTeteDeFiche: ({ children }: { children: ReactNode }) => <div data-testid="en-tete-de-fiche">{children}</div>,
}));
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: { title: string } }) => <article>{property.title}</article>,
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
vi.mock('@/components/public/profile/ContactSheet', () => ({
  ContactSheet: () => <div data-testid="contact" />,
}));
vi.mock('@/components/public/profile/TeamStrip', () => ({
  TeamStrip: () => <div data-testid="equipe" />,
}));
vi.mock('@/components/public/profile/StatsBar', () => ({ StatsBar: () => <div /> }));
vi.mock('@/components/public/profile/ReviewsSection', () => ({
  ReviewsSection: () => <div data-testid="avis" />,
}));

function agence(overrides: Partial<AgencyDto> = {}): AgencyDto {
  return {
    id: 3,
    slug: 'dakar-immo',
    name: 'Dakar Immo',
    description: 'Agence généraliste à Dakar.',
    license_number: 'SN-2026-0042',
    email: 'contact@dakar-immo.sn',
    phone: '+221 33 000 00 00',
    city: 'Dakar',
    logo_url: null,
    agents: [],
    portfolio_count: 12,
    portfolio_total: 12,
    portfolio: [],
    stats: { rent_count: 7, sale_count: 5, cities: 2, agents: 4 },
    ...overrides,
  };
}

const params = () => Promise.resolve({ slug: 'dakar-immo' });

// Le libellé français d'une clé, lu dans le vrai dictionnaire (le texte peut changer sans casser ce test).
const fr = (chemin: string): string =>
  chemin.split('.').reduce<unknown>((n, c) => (n as Record<string, unknown>)[c], frMessages) as string;

function portefeuille(overrides: Partial<PortefeuilleDeFiche> = {}): PortefeuilleDeFiche {
  return { fixes: { agency: 'dakar-immo' }, graine: null, total: 12, ...overrides };
}

async function rendre(a: AgencyDto, searchParams: Record<string, string> = {}) {
  getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: a });
  return render(withIntl(await Page({ params: params(), searchParams: Promise.resolve(searchParams) })));
}

beforeEach(() => {
  chargerMock.mockReset();
  chargerMock.mockResolvedValue(portefeuille());
  rechercheProps.mockClear();
  contactProps.mockClear();
});

describe("fiche d'agence — l'introuvable et l'indisponible", () => {
  beforeEach(() => {
    getAgencyMock.mockReset();
    notFoundMock.mockClear();
  });

  it('AC1 — un 404 amont produit un `notFound()`, dans la page ET dans les métadonnées', async () => {
    getAgencyMock.mockResolvedValue({ etat: 'introuvable' });

    await expect(Page({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);

    // ⚠ **Cette seconde assertion ne garde PAS le code HTTP, et il faut le dire ici pour qu'elle ne
    // soit pas relue comme telle.** Désagrégé le 2026-08-28 : `notFound()` dans le seul
    // `generateMetadata` rend **200**, dans le seul corps de page **404**. Ce qui est gardé ici,
    // c'est que `generateMetadata` ne calcule pas de métadonnées pour une entité inexistante — et
    // que l'union reste narrow-ée, sans quoi `tsc` casse sur `resultat.agence`.
    await expect(generateMetadata({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(2);
  });

  it("AC2 — une API injoignable rend l'indisponibilité, JAMAIS « agence introuvable »", async () => {
    getAgencyMock.mockResolvedValue({ etat: 'indisponible' });

    render(withIntl(await Page({ params: params() })));

    expect(screen.getByText('Agence momentanément indisponible')).toBeInTheDocument();
    expect(screen.queryByText('Agence introuvable')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // La panne n'accuse pas l'agence : aucun `notFound()`, donc aucun 404.
    expect(notFoundMock).not.toHaveBeenCalled();
    // L'écran appartient au site : il garde sa chrome et son chemin de retour.
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it("AC2 — l'indisponibilité se retire de l'index (`robots: { index: false }`)", async () => {
    getAgencyMock.mockResolvedValue({ etat: 'indisponible' });

    const meta = await generateMetadata({ params: params() });

    expect(meta.robots).toEqual({ index: false });
    expect(meta.title).toBe('Agence momentanément indisponible');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("l'agence trouvée est rendue par le serveur, sans état d'erreur", async () => {
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: agence() });

    render(withIntl(await Page({ params: params() })));

    expect(screen.getByRole('heading', { level: 1, name: 'Dakar Immo' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Retour d'administration du 2026-09-16 : la fiche n'avait aucun retour.
    // TCK-2522 : en bureau ; au téléphone, le retour est celui de l'en-tête de fiche (sur la couverture).
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/agencies');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("les métadonnées d'une agence trouvée ne se retirent PAS de l'index", async () => {
    // Non-vacuité : sans cette assertion, un `robots: { index: false }` posé sur TOUS les cas
    // ferait passer le test d'AC2 tout en désindexant le catalogue entier.
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: agence() });

    const meta = await generateMetadata({ params: params() });

    expect(meta.robots).toBeUndefined();
    expect(meta.title).toContain('Dakar Immo');
  });
});

describe('TCK-915 — la description d’agence résumée pour la méta', () => {
  it('une description longue est coupée au mot, à l’écran comme au partage', async () => {
    const description = 'Belle villa lumineuse avec piscine et jardin arboré, proche de la plage et des commerces, ' .repeat(4);
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: { ...agence(), description } });
    const meta = await generateMetadata({ params: params() });
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect(String(meta.description).endsWith('…')).toBe(true);
    // Coupé au mot : le corps est un début du texte, et le texte continue par un blanc ou une ponctuation.
    const corps = String(meta.description).slice(0, -1);
    expect(description.startsWith(corps)).toBe(true);
    expect(description[corps.length]).toMatch(/[\s,;:.!?]/);
    expect(meta.openGraph?.description).toBe(meta.description);
  });

  it('une description vide prend le résumé', async () => {
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: { ...agence(), description: '' } });
    expect((await generateMetadata({ params: params() })).description).not.toBe('');
  });
});

describe('TCK-1079 — le badge vérifié de la fiche d’agence', () => {
  it('une agence vérifiée porte le badge, à côté du nom et hors du titre', async () => {
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: agence({ is_verified: true }) });

    render(withIntl(await Page({ params: params() })));

    expect(screen.getByRole('img', { name: 'Profil vérifié' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dakar Immo' })).toBeInTheDocument();
  });

  it('une agence non vérifiée ne le porte pas', async () => {
    getAgencyMock.mockResolvedValue({ etat: 'trouve', agence: agence({ is_verified: false }) });

    render(withIntl(await Page({ params: params() })));

    expect(screen.queryByRole('img', { name: 'Profil vérifié' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dakar Immo' })).toBeInTheDocument();
  });
});

function bien(id: number, title: string): PropertyListItem {
  return { id, slug: `bien-${id}`, title } as unknown as PropertyListItem;
}

describe('TCK-2522 — la vitrine à onglets', () => {
  it('AC1 — les filtres de l’URL partent au chargeur, avec le périmètre de l’agence ; la recherche reçoit sa graine et le « sur M »', async () => {
    const graine = { resultat: { data: [], meta: { total: 7 } }, clef: 'agency=dakar-immo&contract_type=rent' } as unknown as PortefeuilleDeFiche['graine'];
    chargerMock.mockResolvedValue(portefeuille({ graine, total: 68 }));

    await rendre(agence(), { contract_type: 'rent', bedrooms: '2', price_max: '1000000' });

    expect(chargerMock).toHaveBeenCalledWith(
      { agency: 'dakar-immo' },
      { contract_type: 'rent', bedrooms: '2', price_max: '1000000' },
      'fr',
    );
    const props = rechercheProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(props.graine).toBe(graine);
    expect(props.total).toBe(68);
    expect(props.fixes).toEqual({ agency: 'dakar-immo' });
    // Revue du 2026-11-09 — la recherche colle sous les onglets (maquette D, `top-[49px]`).
    expect(props.collerSous).toBe('onglets');
    // L'onglet Biens compte le portefeuille cherchable, celui du « sur M ».
    expect(screen.getByRole('tab', { name: /Biens\s*68/ })).toBeInTheDocument();
  });

  it('AC4 — sans accroche, sans « Pourquoi nous » ni sélection : couverture, identité et biens, sans bloc vide', async () => {
    const { container } = await rendre(agence({ tagline: null, highlights: [], showcase: [], cover: [] }));

    expect(container.querySelector('[data-couverture]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Dakar Immo' })).toBeInTheDocument();
    expect(screen.getByTestId('recherche')).toBeInTheDocument();
    expect(container.querySelector('[data-selection-de-fiche]')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Pourquoi nous' })).not.toBeInTheDocument();
    expect(screen.queryByText(fr('agency.publicPage.selection'))).not.toBeInTheDocument();
    // Aucun élément vide laissé dans la colonne principale (ni <ul> sans <li>, ni <p> sans texte).
    for (const el of container.querySelectorAll('main ul, main p')) {
      expect(el.textContent?.trim() ?? '', el.outerHTML.slice(0, 80)).not.toBe('');
    }
  });

  it('la vitrine remplie rend accroche, « Pourquoi nous » et la sélection, dans son ordre', async () => {
    await rendre(
      agence({
        tagline: 'On loue et on vend à Dakar depuis 2014.',
        highlights: ['Visites sous 48 h', '  ', 'Équipe wolof et français'],
        showcase: [bien(839, 'Villa Ngor'), bien(108, 'Studio Mermoz')],
      }),
    );

    expect(screen.getByText('On loue et on vend à Dakar depuis 2014.')).toBeInTheDocument();
    const pourquoi = screen.getByRole('list', { name: 'Pourquoi nous' });
    // Une ligne blanche n'est pas un argument : elle ne fait pas une puce vide.
    expect(within(pourquoi).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Visites sous 48 h', 'Équipe wolof et français']);
    const selection = screen.getByRole('region', { name: fr('agency.publicPage.selection') });
    expect(within(selection).getAllByRole('article').map((a) => a.textContent)).toEqual(['Villa Ngor', 'Studio Mermoz']);
    // Avec une sélection, la liste complète s'intitule « Tous ses biens ».
    expect((rechercheProps.mock.calls.at(-1)?.[0] as { titre: { props: { children: string } } }).titre.props.children).toBe('Tous ses biens');
  });

  it('une agence sans aucun bien garde l’état vide, sans champ de recherche', async () => {
    chargerMock.mockResolvedValue(portefeuille({ total: 0 }));
    await rendre(agence({ portfolio_total: 0, portfolio_count: 0 }));

    expect(screen.getByText(fr('agency.publicPage.emptyTitle'))).toBeInTheDocument();
    expect(screen.queryByTestId('recherche')).not.toBeInTheDocument();
  });

  it('une agence dont la recherche est en panne garde son champ (le client redemande), sans « sur M »', async () => {
    chargerMock.mockResolvedValue(portefeuille({ total: null, graine: null }));
    await rendre(agence({ portfolio_total: 12 }));

    expect(screen.getByTestId('recherche')).toBeInTheDocument();
    expect((rechercheProps.mock.calls.at(-1)?.[0] as { total: unknown }).total).toBeNull();
  });

  it('TCK-2506 — l’équipe ne montre que des agents, et l’onglet les compte', async () => {
    await rendre(
      agence({
        agents: [
          { id: 1, slug: 'awa-diop', full_name: 'Awa Diop', public_role: 'agent', avatar_url: null },
          { id: 2, slug: 'sokhna-g', full_name: 'Sokhna Gueye', public_role: 'owner', avatar_url: null },
        ] as unknown as AgencyDto['agents'],
      }),
    );

    expect(screen.getByRole('tab', { name: /Équipe\s*1/ })).toBeInTheDocument();
    // Le panneau Équipe est monté mais masqué tant que son onglet n'est pas choisi (`keepMounted`) :
    // l'équipe reste dans le HTML servi.
    expect(screen.getByRole('link', { name: /Awa Diop/, hidden: true })).toHaveAttribute('href', '/fr/agents/awa-diop');
    expect(screen.queryByText('Sokhna Gueye')).not.toBeInTheDocument();
  });

  it('sans agent, pas d’onglet Équipe ; sans avis, pas d’onglet Avis', async () => {
    await rendre(agence({ agents: [], reviews: undefined }));

    expect(screen.queryByRole('tab', { name: /Équipe/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Avis/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Infos' })).toBeInTheDocument();
  });

  it('TCK-2518 — une médiane absente n’affiche aucun délai ; une médiane servie l’affiche', async () => {
    await rendre(agence({ median_response_minutes: null }));
    expect(screen.queryByText(/Répond en/)).not.toBeInTheDocument();
    expect((contactProps.mock.calls.at(-1)?.[0] as { sousTitre: unknown }).sousTitre).toBeNull();
  });

  it('TCK-2518 — 90 minutes : « Répond en ~2 h », sur la fiche et sur la carte de contact', async () => {
    await rendre(agence({ median_response_minutes: 90 }));
    expect(screen.getAllByText(/Répond en ~2 h/).length).toBeGreaterThan(0);
    expect((contactProps.mock.calls.at(-1)?.[0] as { sousTitre: unknown }).sousTitre).toBe('Répond en ~2 h');
  });

  it('le contact de l’agence : son numéro et son adresse d’entreprise', async () => {
    await rendre(agence());
    const props = contactProps.mock.calls.at(-1)?.[0] as { telephone: unknown; message: { genre: string; adresse: string } };
    expect(props.telephone).toBe('+221 33 000 00 00');
    expect(props.message).toMatchObject({ genre: 'courriel', adresse: 'contact@dakar-immo.sn' });
  });
});

describe('TCK-2568 — le haut de l’écran au téléphone, branché par la fiche d’agence', () => {
  const surcharges = () => [
    screen.getByTestId('navbar').getAttribute('data-au-telephone'),
    screen.getByTestId('cale').getAttribute('data-au-telephone'),
  ];

  it('la fiche servie n’a pas de barre du site au téléphone — barre ET cale : retour et partager sont sur la couverture', async () => {
    await rendre(agence());
    expect(surcharges()).toEqual(['en-tete-de-page', 'en-tete-de-page']);
    expect(screen.getByTestId('en-tete-de-fiche')).toBeInTheDocument();
  });

  it('la panne de l’API ouvre sur la barre de marque — barre ET cale', async () => {
    getAgencyMock.mockResolvedValue({ etat: 'indisponible' });
    render(withIntl(await Page({ params: params() })));
    expect(surcharges()).toEqual(['marque', 'marque']);
  });

  it('l’agence inconnue (404) ouvre sur la barre de marque', () => {
    render(withIntl(<NotFound />));
    expect(surcharges()).toEqual(['marque', 'marque']);
  });
});
