/**
 * TCK-2898 — redresser et recadrer une photo dans le navigateur, avant l'envoi (maquette
 * `app-documents` a, e1 : « Prendre une photo — Redressée et recadrée », puis « Photo nette, recadrée »).
 *
 * Module pur pour la géométrie (le cadre, ses coins, les dimensions du résultat), et UNE fonction qui
 * dessine ({@link recadrerLaPhoto}) : le seul point qui touche au canvas, doublé dans les tests.
 *
 * Le cadre est un rectangle exprimé en fractions (0 à 1) de l'image DÉJÀ TOURNÉE : un quart de tour
 * échange largeur et hauteur, et repart du cadre entier. Aucun redressement de perspective : la
 * rotation par quarts de tour et le recadrage par les coins.
 */

export interface Cadre {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
}

export type Coin = 'hautGauche' | 'hautDroit' | 'basGauche' | 'basDroit';

export const COINS: readonly Coin[] = ['hautGauche', 'hautDroit', 'basGauche', 'basDroit'];

/** Le cadre entier : rien n'est coupé. */
export const CADRE_ENTIER: Cadre = { x: 0, y: 0, largeur: 1, hauteur: 1 };

/** Le plus petit cadre, en fraction de chaque côté : un coin ne traverse jamais le coin opposé. */
export const CADRE_MINIMAL = 0.1;

/** Le pas d'une flèche du clavier sur un coin, en fraction du côté. */
export const PAS_DU_CLAVIER = 0.02;

/** Le JPEG produit : la qualité d'une photo de pièce lisible, sans grossir le fichier. */
export const QUALITE_JPEG = 0.9;

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** La position (fractions) d'un coin du cadre. */
export function positionDuCoin(cadre: Cadre, coin: Coin): { readonly x: number; readonly y: number } {
  return {
    x: coin === 'hautGauche' || coin === 'basGauche' ? cadre.x : cadre.x + cadre.largeur,
    y: coin === 'hautGauche' || coin === 'hautDroit' ? cadre.y : cadre.y + cadre.hauteur,
  };
}

/**
 * Le cadre dont `coin` est porté en (`x`, `y`) — fractions de l'image tournée —, le coin opposé fixe.
 * Borné à l'image, et jamais plus petit que {@link CADRE_MINIMAL}.
 */
export function placerLeCoin(cadre: Cadre, coin: Coin, x: number, y: number): Cadre {
  const gauche = coin === 'hautGauche' || coin === 'basGauche';
  const haut = coin === 'hautGauche' || coin === 'hautDroit';
  const droite = cadre.x + cadre.largeur;
  const bas = cadre.y + cadre.hauteur;
  const nx = gauche ? borne(x, 0, droite - CADRE_MINIMAL) : borne(x, cadre.x + CADRE_MINIMAL, 1);
  const ny = haut ? borne(y, 0, bas - CADRE_MINIMAL) : borne(y, cadre.y + CADRE_MINIMAL, 1);
  return gauche
    ? haut
      ? { x: nx, y: ny, largeur: droite - nx, hauteur: bas - ny }
      : { x: nx, y: cadre.y, largeur: droite - nx, hauteur: ny - cadre.y }
    : haut
      ? { x: cadre.x, y: ny, largeur: nx - cadre.x, hauteur: bas - ny }
      : { x: cadre.x, y: cadre.y, largeur: nx - cadre.x, hauteur: ny - cadre.y };
}

/** Déplace un coin de (`dx`, `dy`) fractions : le geste du clavier. */
export function deplacerLeCoin(cadre: Cadre, coin: Coin, dx: number, dy: number): Cadre {
  const p = positionDuCoin(cadre, coin);
  return placerLeCoin(cadre, coin, p.x + dx, p.y + dy);
}

/** Les dimensions de l'image après `quarts` quarts de tour (sens horaire). */
export function dimensionsTournees(largeur: number, hauteur: number, quarts: number): { readonly largeur: number; readonly hauteur: number } {
  return quarts % 2 === 0 ? { largeur, hauteur } : { largeur: hauteur, hauteur: largeur };
}

/** Le rectangle source, en pixels de l'image tournée, et donc les dimensions du fichier envoyé. */
export function rectangleDuRecadrage(
  largeur: number,
  hauteur: number,
  quarts: number,
  cadre: Cadre,
): { readonly x: number; readonly y: number; readonly largeur: number; readonly hauteur: number } {
  const t = dimensionsTournees(largeur, hauteur, quarts);
  const x = Math.round(cadre.x * t.largeur);
  const y = Math.round(cadre.y * t.hauteur);
  return {
    x,
    y,
    largeur: Math.max(1, Math.min(t.largeur - x, Math.round(cadre.largeur * t.largeur))),
    hauteur: Math.max(1, Math.min(t.hauteur - y, Math.round(cadre.hauteur * t.hauteur))),
  };
}

/** Rien à faire : ni rotation ni recadrage — le fichier d'origine part tel quel, sans réencodage. */
export function estIntact(quarts: number, cadre: Cadre): boolean {
  return quarts % 4 === 0 && cadre.x === 0 && cadre.y === 0 && cadre.largeur === 1 && cadre.hauteur === 1;
}

/** Le nom du fichier recadré : celui d'origine, en `.jpg`. */
export function nomDuRecadrage(nom: string): string {
  const base = nom.replace(/\.[^.]+$/, '');
  return `${base || 'photo'}.jpg`;
}

/** Le navigateur n'a rien dessiné (canvas absent, rendu vide) : l'appelant garde l'original. */
export class RecadrageImpossible extends Error {}

/**
 * Dessine la photo tournée de `quarts` quarts de tour et coupée au `cadre`, en JPEG. Le fichier
 * d'origine revient tel quel s'il n'y a rien à faire ({@link estIntact}).
 *
 * Lève si l'image ne se décode pas ou si le canvas ne rend rien : l'appelant garde alors l'original.
 */
export async function recadrerLaPhoto(fichier: File, quarts: number, cadre: Cadre): Promise<File> {
  if (estIntact(quarts, cadre)) return fichier;
  // L'orientation EXIF appliquée, comme l'<img> de l'éditeur : les dimensions et le cadre concordent.
  const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  try {
    const t = dimensionsTournees(image.width, image.height, quarts);
    const r = rectangleDuRecadrage(image.width, image.height, quarts, cadre);
    const canvas = document.createElement('canvas');
    canvas.width = r.largeur;
    canvas.height = r.hauteur;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new RecadrageImpossible();
    ctx.translate(-r.x, -r.y);
    const q = ((quarts % 4) + 4) % 4;
    if (q === 1) {
      ctx.translate(t.largeur, 0);
      ctx.rotate(Math.PI / 2);
    } else if (q === 2) {
      ctx.translate(t.largeur, t.hauteur);
      ctx.rotate(Math.PI);
    } else if (q === 3) {
      ctx.translate(0, t.hauteur);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITE_JPEG));
    if (!blob) throw new RecadrageImpossible();
    return new File([blob], nomDuRecadrage(fichier.name), { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    image.close();
  }
}
