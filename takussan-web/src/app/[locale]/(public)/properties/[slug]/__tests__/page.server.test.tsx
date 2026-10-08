import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { PropertyDetail } from '@/types/property';
import type { EtatPublicDuBien, ResultatFichePublique } from '@/lib/queries/public-property';

import { ORIGINE_SITE } from '@/lib/alternates';
import { LOCALES_INDEXABLES } from '@/i18n/routing';

import Page, { generateMetadata } from '../page';

/**
 * La fiche de bien EN RENDU SERVEUR (TCK-335, étape 6).
 *
 * ⚠️ **Ce que ce fichier garde n'est pas « le HTML contient le titre ».** Un composant
 * `'use client'` était déjà rendu en HTML par le serveur ; ce qui manquait, c'était la donnée,
 * qui arrivait par `useEffect`. Elle arrive maintenant en prop, et ce point-là est tenu par le
 * typage.
 *
 * Ce qui n'est tenu par rien, en revanche, c'est **la distinction entre les deux pannes** — et
 * c'est elle qui a coûté. Mesuré en production le 2026-08-21 :
 *
 * ```
 * $ curl -si https://www.takussan.com/properties/studio-meuble-a-parcelles-assainies-5Kyslt
 * HTTP/2 200
 * <title>Bien introuvable — Takussan</title>     ← aucun <h1>, aucun ld+json
 * ```
 *
 * Un `try { … } catch { return null }` dans l'ancien `layout.tsx` faisait de TOUTE panne un
 * « ce bien n'existe pas », servi en **HTTP 200** à l'indexation, sur toute la surface du
 * catalogue. Les deux premiers tests ci-dessous existent pour que ce soft-404 ne puisse pas
 * revenir sous un autre nom.
 */

const getPropertyMock = vi.fn<() => Promise<ResultatFichePublique>>();
const getEtatDuBienMock = vi.fn<() => Promise<EtatPublicDuBien | null>>();
const notFoundMock = vi.fn(() => {
  // `notFound()` de Next ne rend pas : il lève. Le mock fait pareil, sinon le composant
  // continuerait après l'appel et le test verrait un arbre que la production ne produit jamais.
  throw new Error('NEXT_NOT_FOUND');
});

/**
 * `next-intl/server` — mock LOCAL, et non `mockTraductionsServeur` de `@/test/intl`.
 *
 * Ce dernier ignore les paramètres d'interpolation : `t('descriptionFallback', { city })` y rend
 * le gabarit brut `« {type} à {quarter}, {city}. »`. Un test du repli de `<meta description>`
 * écrit contre lui serait **vert quoi qu'il arrive** — y compris avec le `String(null)` qu'il
 * prétend garder. Celui-ci interpole, donc il voit ce que le visiteur verrait.
 */
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
}));

vi.mock('@/lib/queries/public-property', () => ({
  getProperty: () => getPropertyMock(),
  getEtatDuBien: () => getEtatDuBienMock(),
}));
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: { id: number; title: string } }) => (
    <article data-testid="similaire">{property.title}</article>
  ),
}));
vi.mock('@/components/shared/LienLocalise', () => ({
  LienLocalise: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={`/fr${href}`} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('../components/CompteurDeVue', () => ({
  CompteurDeVue: ({ slug }: { slug: string }) => <i data-testid="compteur-de-vue" data-slug={slug} />,
}));

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock('../PropertyDetailContent', () => ({
  PropertyDetailContent: ({ property }: { property: PropertyDetail }) => (
    <h1 data-testid="fiche">{property.title}</h1>
  ),
}));

function bien(overrides: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    id: 7,
    reference_number: 'TK-2026-XYZ',
    title: 'Studio meublé à Parcelles Assainies',
    slug: 'studio-meuble-a-parcelles-assainies-5Kyslt',
    price: 250_000,
    currency: 'XOF',
    type: 'studio',
    contract_type: 'rent',
    rent_period: 'monthly',
    status: 'available',
    visibility: 'public',
    bedrooms: 1,
    bathrooms: 1,
    area: 35,
    furnished: true,
    featured: false,
    main_photo_url: null,
    published_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    type_label: 'Studio',
    contract_type_label: 'À louer',
    rent_period_label: 'Mensuel',
    status_label: 'Disponible',
    title_type: null,
    title_type_label: null,
    condition_label: null,
    floor_number: null,
    total_floors: null,
    year_built: null,
    parking_spaces: null,
    views_count: 0,
    favorites_count: 0,
    average_rating: null,
    reviews_count: 0,
    description: null,
    photos: [],
    media_extra: { videos: [], plans: [], virtual_tour_url: null },
    tags: [],
    owner: { id: 1, name: 'Fatou', avatar_url: null, is_agent: true, member_since: null },
    primary_contact: null,
    agency: null,
    documents: [],
    price_history: [],
    rejection_reason: null,
    submitted_at: null,
    approved_at: null,
    rejected_at: null,
    location: {
      full: 'Parcelles Assainies, Dakar',
      street: null,
      quarter: 'Parcelles Assainies',
      city: 'Dakar',
      region: null,
      country: null,
      postal_code: null,
      latitude: null,
      longitude: null,
    },
    ...overrides,
  };
}

const params = () => Promise.resolve({ slug: 'studio-meuble-a-parcelles-assainies-5Kyslt' });

describe('fiche de bien — rendu serveur', () => {
  beforeEach(() => {
    getPropertyMock.mockReset();
    getEtatDuBienMock.mockReset();
    // Par défaut, `/status` rend 404 lui aussi : le bien n'a jamais été une annonce publique.
    getEtatDuBienMock.mockResolvedValue(null);
    notFoundMock.mockClear();
  });

  it('un 404 amont produit un VRAI 404 — `notFound()`, pas une page de repli', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'introuvable' });

    await expect(Page({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("une panne 500 rend l'indisponibilité — JAMAIS « Bien introuvable » en 200", async () => {
    getPropertyMock.mockResolvedValue({ etat: 'indisponible' });

    render(await Page({ params: params() }));

    // Le libellé du soft-404 mesuré en production. S'il réapparaît sur ce chemin, c'est que la
    // panne s'est remise à mentir : elle affirme l'absence du bien alors qu'elle l'ignore.
    expect(screen.queryByText('Bien introuvable')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Bien momentanément indisponible' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Et surtout : ce n'est PAS un 404. Le bien existe peut-être.
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("l'indisponibilité se retire de l'index (`robots: { index: false }`)", async () => {
    getPropertyMock.mockResolvedValue({ etat: 'indisponible' });

    const meta = await generateMetadata({ params: params() });

    expect(meta.robots).toEqual({ index: false });
    expect(meta.title).toBe('Bien momentanément indisponible');
  });

  it('le bien trouvé est rendu par le SERVEUR, avec son JSON-LD', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'trouve', bien: bien() });

    const { container } = render(await Page({ params: params() }));

    // Le titre est dans l'arbre rendu par la page serveur — pas après un `useEffect`.
    expect(screen.getByTestId('fiche')).toHaveTextContent('Studio meublé à Parcelles Assainies');

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const donnees = JSON.parse(script!.textContent ?? '{}');
    expect(donnees['@type']).toBe('RealEstateListing');
    expect(donnees.mainEntity.priceSpecification.price).toBe(250_000);
  });

  it("le repli de `<meta description>` n'écrit jamais littéralement « null »", async () => {
    getPropertyMock.mockResolvedValue({
      etat: 'trouve',
      bien: bien({
        description: null,
        location: { ...bien().location, quarter: null, city: null },
      }),
    });

    const meta = await generateMetadata({ params: params() });

    expect(String(meta.description)).not.toContain('null');
  });
  /**
   * D3 de TCK-461 — **la canonique lue là où elle est PRODUITE, pas là où elle est calculée.**
   *
   * `alternatesPubliques` est éprouvée à ce chemin exact par `src/lib/__tests__/metadata-base.test.ts`.
   * Ce qui ne l'était pas, c'est que la PAGE l'appelle : retirer la ligne `alternates:` de
   * `page.tsx` ne faisait rougir personne — les deux extrémités de la chaîne étaient tenues, le
   * maillon central non.
   *
   * ⚠ Rien n'est écrit en dur ici : l'origine vient de `ORIGINE_SITE`, la langue de la locale que
   * `getLocale` sert au-dessus, le slug de `params()`, et l'ensemble des `hreflang` de
   * `LOCALES_INDEXABLES`. Une valeur recopiée serait vraie le jour où on l'écrit.
   */
  it('la canonique et les hreflang sortent RÉELLEMENT de generateMetadata (D3)', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'trouve', bien: bien() });

    const { slug } = await params();
    const meta = await generateMetadata({ params: params() });
    const alternates = meta.alternates;

    expect(alternates, 'la page ne déclare AUCUN alternates : ni canonique, ni hreflang').toBeDefined();
    expect(alternates!.canonical).toBe(`${ORIGINE_SITE}/fr/properties/${slug}`);

    const languages = alternates!.languages ?? {};
    // Plancher de non-vacuité DÉRIVÉ : les langues indexables, plus `x-default`.
    expect(Object.keys(languages).sort()).toEqual(
      [...LOCALES_INDEXABLES, 'x-default'].sort(),
    );
    for (const locale of LOCALES_INDEXABLES) {
      expect(languages[locale]).toBe(`${ORIGINE_SITE}/${locale}/properties/${slug}`);
    }
  });
  /*
   * TCK-598 (V10, contrainte 11) — un bien loué, vendu ou retiré. Le lien circule encore sur
   * WhatsApp : la page dit ce qu'il est devenu, montre des similaires et la recherche du quartier.
   */
  const loue: EtatPublicDuBien = {
    state: 'rented',
    contract_type: 'rent',
    type: 'apartment',
    location: { city: 'Dakar', quarter: 'Mermoz' },
    similar: [{ id: 41, title: 'F3 à Mermoz' } as EtatPublicDuBien['similar'][number]],
  };

  it("un bien LOUÉ rend sa page : le message, les similaires, la recherche du quartier — pas un 404", async () => {
    getPropertyMock.mockResolvedValue({ etat: 'introuvable' });
    getEtatDuBienMock.mockResolvedValue(loue);

    const { container } = render(await Page({ params: params() }));

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Ce bien a été loué' })).toBeInTheDocument();
    expect(screen.getByTestId('similaire')).toHaveTextContent('F3 à Mermoz');
    const lien = screen.getByRole('link', { name: 'Voir les biens à Mermoz, Dakar' });
    expect(lien.getAttribute('href')).toContain('/properties?contract_type=rent&city=Dakar&location=Mermoz');
    // Jamais « introuvable » d'un bien qui existe ; jamais d'annonce balisée pour un moteur.
    expect(container.textContent).not.toMatch(/introuvable/i);
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(screen.queryByTestId('compteur-de-vue')).toBeNull();
  });

  it("la page d'un bien retiré n'est jamais indexable", async () => {
    getPropertyMock.mockResolvedValue({ etat: 'introuvable' });
    for (const [state, titre] of [
      ['rented', 'Ce bien a été loué'],
      ['sold', 'Ce bien a été vendu'],
      ['withdrawn', "Ce bien n'est plus proposé"],
    ] as const) {
      getEtatDuBienMock.mockResolvedValue({ ...loue, state });

      const meta = await generateMetadata({ params: params() });

      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.title).toBe(titre);
      expect(meta.alternates).toBeUndefined();
    }
  });

  it("`/status` en 404 : le VRAI 404, aux deux endroits", async () => {
    getPropertyMock.mockResolvedValue({ etat: 'introuvable' });

    await expect(generateMetadata({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(Page({ params: params() })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it("`/status` dit le bien SERVI alors que la fiche a rendu 404 : indisponible, jamais introuvable", async () => {
    getPropertyMock.mockResolvedValue({ etat: 'introuvable' });
    getEtatDuBienMock.mockResolvedValue({ ...loue, state: 'available' });

    render(await Page({ params: params() }));
    const meta = await generateMetadata({ params: params() });

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Bien momentanément indisponible' })).toBeInTheDocument();
    expect(meta.robots).toEqual({ index: false });
  });

  it('la fiche trouvée monte le compteur de vue, pour son slug', async () => {
    getPropertyMock.mockResolvedValue({ etat: 'trouve', bien: bien() });

    render(await Page({ params: params() }));

    expect(screen.getByTestId('compteur-de-vue').dataset.slug).toBe(bien().slug);
  });
});
