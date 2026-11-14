import type { RentPeriod } from '@/types/property';

import { getProperty } from './public-property';

/**
 * TCK-2604 — le bien que le visiteur quittait quand on lui a demandé un compte, réduit à ce que
 * l'écran de connexion en montre : la photo, le titre, le quartier, le prix et sa période.
 *
 * ⚠ **Lu par `getProperty`, la lecture PARTAGÉE de la fiche, et sans `fields[properties]`.**
 * `PublicPropertyController::show()` l'ignore, et l'y ajouter divergerait l'URL de celle de la fiche
 * (donc le cache) — cf. `public-property.ts`. La réduction se fait ICI, côté serveur : la page de
 * connexion ne sérialise vers le navigateur que ces huit champs, jamais le `PropertyDetail` entier.
 *
 * `null` pour tout ce qui n'est pas un bien public trouvé : l'écran reprend alors sa forme directe.
 */
export interface BienQuitte {
  readonly slug: string;
  readonly titre: string;
  readonly quartier: string | null;
  readonly photo: string | null;
  readonly prix: number | null;
  readonly devise: string;
  /** La période d'une location (au mois par défaut, comme la vitrine de TCK-2670) ; `null` à la vente. */
  readonly periode: RentPeriod | null;
  /** L'agence qui publie le bien (« Avec Dakar Immo », « part chez Dakar Immo ») ; `null` sans agence. */
  readonly agence: string | null;
}

export async function bienQuitte(slug: string, locale: string): Promise<BienQuitte | null> {
  const resultat = await getProperty(slug, locale);
  if (resultat.etat !== 'trouve') return null;
  const bien = resultat.bien;
  return {
    slug: bien.slug,
    titre: bien.title,
    quartier: bien.location?.quarter ?? bien.location?.city ?? null,
    photo: bien.main_photo_url ?? null,
    prix: typeof bien.price === 'number' && bien.price > 0 ? bien.price : null,
    devise: bien.currency ?? 'XOF',
    periode: bien.contract_type === 'rent' ? (bien.rent_period ?? 'monthly') : null,
    agence: bien.agency?.name?.trim() || null,
  };
}
