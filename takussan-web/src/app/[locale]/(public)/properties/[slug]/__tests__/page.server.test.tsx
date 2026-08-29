import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { PropertyDetail } from '@/types/property';
import type { ResultatFichePublique } from '@/lib/queries/public-property';

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
    floor_number: null,
    total_floors: null,
    available_from: null,
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
});
