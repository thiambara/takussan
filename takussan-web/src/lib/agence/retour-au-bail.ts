/**
 * TCK-2921 — l'aller-retour entre le nouveau bail et les réglages de bail de l'agence (maquette
 * `app-agence-reglages-bail` a, écrans « Venu du nouveau bail » et « Enregistré (venu du bail) »).
 *
 * « Modifier », dans l'encart « Réglages de l'agence appliqués » du nouveau bail, ouvre les réglages
 * dans le MÊME onglet ; la saisie du bail est gardée par son brouillon (TCK-2912, clé dérivée de
 * l'adresse du bail : `cleDuBrouillonDeBail`). « Reprendre le bail » ramène à cette même adresse, qui
 * relit le brouillon — et les valeurs par défaut, qui ont pu changer.
 *
 * L'adresse du bail ne voyage PAS telle quelle : un chemin libre en paramètre serait une redirection
 * ouverte. Ne voyagent que les identifiants qui la composent (`booking_id`, `property`, `customer`),
 * entiers positifs, et celui du locataire choisi (`locataire`, pour le nommer) ; l'adresse se
 * reconstruit ici, toujours sous `/app/leases/new`, dans l'ordre de `cleDuBrouillonDeBail`.
 */

export interface RetourAuBail {
  readonly bookingId?: number;
  readonly propertyId?: number;
  readonly customerId?: number;
  /** Le locataire choisi dans le bail, pour « Vous venez du nouveau bail de … ». */
  readonly locataireId?: number;
}

export const REGLAGES_DE_BAIL_HREF = '/app/agency/lease-settings';

/** Le marqueur de l'aller : sans lui, aucun encart de bail. */
const DEPUIS = 'depuis';
const VALEUR_DEPUIS = 'bail';

type Parametres = Readonly<Record<string, string | string[] | undefined>> | URLSearchParams;

function lire(parametres: Parametres, cle: string): string | undefined {
  if (parametres instanceof URLSearchParams) return parametres.get(cle) ?? undefined;
  const brut = parametres[cle];
  return Array.isArray(brut) ? brut[0] : brut;
}

function identifiant(brut: string | undefined): number | undefined {
  if (brut === undefined || !/^\d+$/.test(brut)) return undefined;
  const id = Number(brut);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function requete(paires: readonly (readonly [string, number | string | undefined])[]): string {
  const q = new URLSearchParams();
  for (const [cle, valeur] of paires) if (valeur !== undefined) q.set(cle, String(valeur));
  return q.toString();
}

/** L'adresse des réglages, venue du bail : `?depuis=bail` et les seuls identifiants du bail. */
export function lienVersLesReglagesDepuisLeBail(r: RetourAuBail): string {
  const q = requete([
    [DEPUIS, VALEUR_DEPUIS],
    ['booking_id', r.bookingId],
    ['property', r.propertyId],
    ['customer', r.customerId],
    ['locataire', r.locataireId],
  ]);
  return `${REGLAGES_DE_BAIL_HREF}?${q}`;
}

/** Le retour lu des paramètres des réglages ; `null` sans `?depuis=bail` (arrivé d'ailleurs). */
export function retourAuBailDepuis(parametres: Parametres | undefined | null): RetourAuBail | null {
  if (!parametres || lire(parametres, DEPUIS) !== VALEUR_DEPUIS) return null;
  return {
    bookingId: identifiant(lire(parametres, 'booking_id')),
    propertyId: identifiant(lire(parametres, 'property')),
    customerId: identifiant(lire(parametres, 'customer')),
    locataireId: identifiant(lire(parametres, 'locataire')),
  };
}

/** L'adresse du bail à reprendre : celle d'où l'on vient, donc la même clé de brouillon. */
export function lienDuBail(r: RetourAuBail): string {
  const q = requete([
    ['booking_id', r.bookingId],
    ['property', r.propertyId],
    ['customer', r.customerId],
  ]);
  return q === '' ? '/app/leases/new' : `/app/leases/new?${q}`;
}
