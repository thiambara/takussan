import { describe, expect, it } from 'vitest';

import { jsonLdRealEstateListing } from '@/lib/jsonld-property';
import type { PropertyDetail } from '@/types/property';

function bien(overrides: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    id: 1,
    reference_number: 'TK-2026-ABC',
    title: 'Villa Almadies',
    slug: 'villa-almadies',
    price: 120_000_000,
    currency: 'XOF',
    type: 'villa',
    contract_type: 'sale',
    rent_period: null,
    status: 'available',
    visibility: 'public',
    bedrooms: 4,
    bathrooms: 3,
    area: 220,
    furnished: true,
    featured: false,
    main_photo_url: null,
    published_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    type_label: 'Villa',
    contract_type_label: 'Vente',
    rent_period_label: null,
    status_label: 'Disponible',
    title_type: null,
    title_type_label: null,
    condition_label: null,
    floor_number: null,
    total_floors: null,
    year_built: 2020,
    parking_spaces: 2,
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
      full: 'Almadies, Dakar',
      street: null,
      quarter: 'Almadies',
      city: 'Dakar',
      region: null,
      country: null,
      postal_code: null,
      // ⚠️ NULLES PAR DÉFAUT, comme le catalogue : `types/property.ts` les déclare
      // `number | null` et la fiche mesurée en production les a nulles.
      latitude: null,
      longitude: null,
    },
    ...overrides,
  };
}

type Noeud = Record<string, unknown>;

/**
 * ⚠️ La fabrique prend désormais la LANGUE (TCK-435) : l'`url` du nœud était relative
 * (`/properties/<slug>`), donc résolue par un moteur contre l'URL du document — c'est-à-dire vers
 * `https://hôte/properties/<slug>`, qui rend **307** depuis TCK-434. Elle est absolue et préfixée.
 */
function mainEntity(p: PropertyDetail): Noeud {
  return jsonLdRealEstateListing(p, 'fr').mainEntity as Noeud;
}

function offer(p: PropertyDetail): Noeud {
  return jsonLdRealEstateListing(p, 'fr').offers as Noeud;
}

describe('jsonLdRealEstateListing', () => {
  it("ne balise JAMAIS l'annonce en Product ; l'Offer ne vit que sous `offers` (P09.04, TCK-758)", () => {
    const listing = jsonLdRealEstateListing(bien(), 'fr');
    const brut = JSON.stringify(listing);

    expect(listing['@type']).toBe('RealEstateListing');
    // Les règles Google réservent le balisage produit aux produits vendus.
    expect(brut).not.toContain('"Product"');
    // Décision du porteur (P09.04) : le prix passe par une `Offer` de la page, jamais par le bien.
    expect((listing.offers as Noeud)['@type']).toBe('Offer');
    expect(mainEntity(bien())).not.toHaveProperty('priceSpecification');
    expect(mainEntity(bien())).not.toHaveProperty('offers');
  });

  it('émet le prix DÉCIMAL, jamais multiplié par 100', () => {
    const offre = offer(bien({ price: 45_000_000 }));

    // Le facteur 100 est la frontière du driver de paiement (principe non négociable n°3), et
    // il n'a rien à faire ici : le XOF n'a pas de sous-unité. 45 000 000 F ×100 afficherait
    // 4,5 milliards à un moteur de recherche.
    expect(offre.price).toBe(45_000_000);
    expect(offre.price).not.toBe(4_500_000_000);
  });

  it('émet priceCurrency « XOF », y compris quand l\'API ne dit rien', () => {
    expect(offer(bien()).priceCurrency).toBe('XOF');
    expect(offer(bien({ currency: null })).priceCurrency).toBe('XOF');
  });

  it('une vente est une Offer « Sell », sans prix unitaire', () => {
    const offre = offer(bien({ contract_type: 'sale' }));

    expect(offre.businessFunction).toBe('http://purl.org/goodrelations/v1#Sell');
    expect(offre).not.toHaveProperty('priceSpecification');
  });

  it('une location est une Offer « LeaseOut », au prix unitaire de sa période', () => {
    const unites = { daily: 'DAY', weekly: 'WEE', monthly: 'MON', yearly: 'ANN' } as const;
    for (const [periode, unitCode] of Object.entries(unites)) {
      const offre = offer(bien({ contract_type: 'rent', rent_period: periode as keyof typeof unites, price: 350_000 }));

      expect(offre.businessFunction).toBe('http://purl.org/goodrelations/v1#LeaseOut');
      expect(offre.priceSpecification).toEqual({
        '@type': 'UnitPriceSpecification',
        price: 350_000,
        priceCurrency: 'XOF',
        unitCode,
      });
    }
  });

  it('sans contrat ni période connus, ni businessFunction ni prix unitaire', () => {
    const offre = offer(bien({ contract_type: null, rent_period: null }));
    expect(offre).not.toHaveProperty('businessFunction');
    expect(offre).not.toHaveProperty('priceSpecification');

    expect(offer(bien({ contract_type: 'rent', rent_period: null }))).not.toHaveProperty('priceSpecification');
  });

  it('un `Place` (terrain, bureau, parking) ne porte aucun champ de logement', () => {
    for (const type of ['land', 'office', 'parking'] as const) {
      const entite = mainEntity(bien({ type, bedrooms: 2, bathrooms: 1, area: 500, year_built: 2010 }));

      expect(entite['@type']).toBe('Place');
      // schema.org ne définit ces propriétés que sur `Accommodation`.
      expect(entite).not.toHaveProperty('floorSize');
      expect(entite).not.toHaveProperty('numberOfBedrooms');
      expect(entite).not.toHaveProperty('numberOfBathroomsTotal');
      expect(entite).not.toHaveProperty('yearBuilt');
    }
    // Un logement les garde.
    expect(mainEntity(bien({ type: 'villa' }))).toHaveProperty('floorSize');
    expect(mainEntity(bien({ type: 'villa' }))).toHaveProperty('yearBuilt');
  });

  it('OMET `geo` quand latitude ou longitude est nulle', () => {
    // Les trois combinaisons partielles, pas seulement les deux nulles : une seule coordonnée
    // ne localise rien, et `String(null)` a déjà écrit littéralement « null » dans la
    // `<meta description>` de cette même page.
    expect(mainEntity(bien())).not.toHaveProperty('geo');
    expect(mainEntity(bien({
      location: { ...bien().location, latitude: 14.7, longitude: null },
    }))).not.toHaveProperty('geo');
    expect(mainEntity(bien({
      location: { ...bien().location, latitude: null, longitude: -17.5 },
    }))).not.toHaveProperty('geo');
  });

  it('émet `geo` quand les deux coordonnées sont connues', () => {
    const geo = mainEntity(bien({
      location: { ...bien().location, latitude: 14.7167, longitude: -17.4677 },
    })).geo;

    expect(geo).toEqual({ '@type': 'GeoCoordinates', latitude: 14.7167, longitude: -17.4677 });
  });

  it('dérive le sous-type schema.org du type de bien', () => {
    expect(mainEntity(bien({ type: 'villa' }))['@type']).toBe('House');
    expect(mainEntity(bien({ type: 'apartment' }))['@type']).toBe('Apartment');
    expect(mainEntity(bien({ type: 'studio' }))['@type']).toBe('Apartment');
    expect(mainEntity(bien({ type: 'room' }))['@type']).toBe('Room');
    // Un terrain nu ne loge personne : `Place`, jamais `Accommodation`.
    expect(mainEntity(bien({ type: 'land' }))['@type']).toBe('Place');
  });

  it('ne porte aucune clé dont la valeur est inconnue', () => {
    const entite = mainEntity(bien({ description: null, area: null, bedrooms: null }));

    expect(entite).not.toHaveProperty('description');
    expect(entite).not.toHaveProperty('floorSize');
    expect(entite).not.toHaveProperty('numberOfBedrooms');
  });
});
