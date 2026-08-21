import type { PropertyDetail, PropertyType } from '@/types/property';

/**
 * Le sous-type schema.org du `mainEntity` d'une annonce, par type de bien.
 *
 * `Record<PropertyType, …>` **exhaustif à dessein** : ajouter un cas à `PropertyType` sans le
 * traduire ici fait rougir `tsc --noEmit`, ce qui vaut mieux qu'un repli muet vers un type faux.
 *
 * Les types qui ne logent personne (terrain, entrepôt, boutique, garage…) sortent en `Place` et
 * non en `Accommodation` : *« an accommodation is a place that can accommodate human beings »*.
 * Annoncer un terrain nu comme un logement serait exactement le genre d'affirmation que le
 * balisage ne doit pas porter.
 */
const SOUS_TYPE_SCHEMA: Record<PropertyType, string> = {
  apartment: 'Apartment',
  studio: 'Apartment',
  house: 'House',
  villa: 'House',
  room: 'Room',
  hotel: 'Accommodation',
  resort: 'Accommodation',
  office: 'Place',
  shop: 'Place',
  warehouse: 'Place',
  factory: 'Place',
  farm: 'Place',
  land: 'Place',
  garage: 'Place',
  parking: 'Place',
  other: 'Accommodation',
};

type Noeud = Record<string, unknown>;

/** Retire les clés `undefined` — un JSON-LD ne doit porter que ce qu'on sait vraiment. */
function sansVides(noeud: Noeud): Noeud {
  return Object.fromEntries(Object.entries(noeud).filter(([, v]) => v !== undefined));
}

/**
 * Données structurées d'une fiche de bien — `RealEstateListing` (TCK-335, étape 6).
 *
 * ⚠️ **Jamais `Product` ni `Offer`, et ce n'est pas une préférence de style.** Les règles Google
 * réservent le balisage produit aux produits vendus ; l'employer sur une annonce immobilière
 * expose le domaine entier à une action manuelle « balisage trompeur ». `RealEstateListing` est
 * un sous-type de page (`SearchResultsPage` → `WebPage`), et c'est son `mainEntity` qui porte le
 * bien lui-même.
 *
 * Le prix voyage donc en `PriceSpecification` attachée au `mainEntity`, et non en `Offer` :
 * on décrit un montant affiché, on n'ouvre pas de transaction.
 *
 * ### Trois pièges, tous déjà payés ailleurs dans ce dépôt
 *
 * 1. **`price` reste DÉCIMAL — jamais ×100.** Le facteur 100 est le principe non négociable n°3
 *    du dépôt, et il vit *à la frontière du driver de paiement*, nulle part ailleurs : le XOF n'a
 *    pas de sous-unité. Un prix de 45 000 000 F multiplié ici afficherait 4,5 milliards.
 * 2. **`geo` est OMIS quand une coordonnée manque.** `latitude`/`longitude` sont
 *    `number | null` (`types/property.ts`), et la fiche en production les a nulles. Le réflexe
 *    `String(null)` a déjà produit littéralement « null » dans la `<meta description>` de cette
 *    même page (dette signalée dans l'ancien `layout.tsx`) ; on ne le recommet pas en JSON-LD, où
 *    une coordonnée fausse est pire qu'une coordonnée absente.
 * 3. **`priceCurrency` par défaut `XOF`**, la devise du catalogue, quand l'API ne la précise pas.
 */
export function jsonLdRealEstateListing(property: PropertyDetail): Noeud {
  const url = `/properties/${property.slug}`;
  const { latitude, longitude } = property.location;

  const geo =
    latitude !== null && longitude !== null
      ? { '@type': 'GeoCoordinates', latitude, longitude }
      : undefined;

  const bien = sansVides({
    '@type': SOUS_TYPE_SCHEMA[property.type],
    name: property.title,
    description: property.description ?? undefined,
    url,
    image: property.main_photo_url ?? undefined,
    address: sansVides({
      '@type': 'PostalAddress',
      streetAddress: property.location.street ?? undefined,
      addressLocality: property.location.city ?? undefined,
      addressRegion: property.location.region ?? undefined,
      postalCode: property.location.postal_code ?? undefined,
      addressCountry: property.location.country ?? undefined,
    }),
    geo,
    numberOfBedrooms: property.bedrooms ?? undefined,
    numberOfBathroomsTotal: property.bathrooms ?? undefined,
    floorSize:
      property.area !== null
        ? { '@type': 'QuantitativeValue', value: property.area, unitCode: 'MTK' }
        : undefined,
    yearBuilt: property.year_built ?? undefined,
    priceSpecification: {
      '@type': 'PriceSpecification',
      // Décimal, tel que l'API l'émet. Cf. le piège n°1 du docblock.
      price: property.price,
      priceCurrency: property.currency ?? 'XOF',
    },
  });

  return sansVides({
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.title,
    url,
    datePosted: property.published_at ?? undefined,
    mainEntity: bien,
  });
}
