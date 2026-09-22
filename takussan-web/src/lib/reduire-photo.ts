/**
 * Réduction des photos dans le navigateur, avant l'envoi (TCK-542, ADR-0029 §4-5).
 *
 * Une photo de téléphone pèse 3 à 8 Mo pour 12 Mpx ; la conversion `full` servie plafonne à
 * 1 600 px (TCK-356). Envoyer le reste sur réseau mobile ne rend rien à l'affichage. On plafonne
 * donc le GRAND CÔTÉ à 2 560 px — la marge du filigrane et d'un DPR 2 — et on s'arrête là :
 *
 *  - **le format ne change pas.** Un JPEG reste un JPEG (qualité 0,9), un PNG un PNG, un WebP un
 *    WebP. Le format servi se décide à la LIVRAISON (Transformations, `format=auto`) : convertir
 *    ici ajouterait une compression avec perte sans rien alléger à l'écran. Un navigateur qui rend
 *    un autre type que celui demandé (Safari sans encodeur WebP rend du PNG) → l'original part ;
 *  - **une image déjà sous le plafond part octet pour octet** : ni agrandie, ni réencodée ;
 *  - **l'orientation EXIF est appliquée aux pixels** (`imageOrientation: 'from-image'`), puisque
 *    le réencodage efface l'EXIF. Un navigateur qui refuse l'option → l'original part, plutôt
 *    qu'un risque de photo couchée ;
 *  - **tout échec rend l'original** — HEIC illisible, fichier corrompu, mémoire insuffisante — et
 *    un résultat plus lourd que l'original aussi. C'est une optimisation, jamais une garde : la
 *    validation de l'API reste la seule.
 *
 * Les photos passent UNE À LA FOIS, en rendant la main entre deux : vingt bitmaps de 12 Mpx
 * décodés d'un coup, c'est ~1 Go de mémoire, et l'interface gelée le temps du lot.
 */

export const COTE_MAX = 2560;
export const QUALITE = 0.9;

/** Les seuls types réencodés : ceux que l'API accepte en photo (`mimes:jpg,jpeg,png,webp`). */
const TYPES_REDUITS: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface ImageDecodee {
  readonly width: number;
  readonly height: number;
  readonly source: CanvasImageSource;
  close(): void;
}

/** Les deux opérations du navigateur, injectables pour les tests (jsdom n'en a aucune). */
export interface OutilsImage {
  decoder(fichier: Blob): Promise<ImageDecodee>;
  encoder(
    image: ImageDecodee,
    largeur: number,
    hauteur: number,
    type: string,
    qualite: number,
  ): Promise<Blob | null>;
}

/** Dimensions cibles, ou `null` quand l'image tient déjà sous le plafond. */
export function dimensionsPlafonnees(
  largeur: number,
  hauteur: number,
  coteMax: number = COTE_MAX,
): { readonly width: number; readonly height: number } | null {
  const grand = Math.max(largeur, hauteur);
  if (!(grand > coteMax)) return null;
  const ratio = coteMax / grand;
  return {
    width: Math.max(1, Math.round(largeur * ratio)),
    height: Math.max(1, Math.round(hauteur * ratio)),
  };
}

export const outilsNavigateur: OutilsImage = {
  async decoder(fichier) {
    if (typeof createImageBitmap !== 'function')
      throw new Error('createImageBitmap absent');
    const bitmap = await createImageBitmap(fichier, {
      imageOrientation: 'from-image',
    });
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  },
  async encoder(image, largeur, hauteur, type, qualite) {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(largeur, hauteur);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image.source, 0, 0, largeur, hauteur);
      return canvas.convertToBlob({ type, quality: qualite });
    }
    const canvas = document.createElement('canvas');
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, largeur, hauteur);
    return new Promise((resolve) => canvas.toBlob(resolve, type, qualite));
  },
};

/** Réduit une photo ; rend l'original dès que la réduction ne serait pas un gain sûr. */
export async function reduirePhoto(
  fichier: File,
  outils: OutilsImage = outilsNavigateur,
): Promise<File> {
  if (!TYPES_REDUITS.has(fichier.type)) return fichier;

  let image: ImageDecodee | null = null;
  try {
    image = await outils.decoder(fichier);
    const cible = dimensionsPlafonnees(image.width, image.height);
    if (!cible) return fichier;

    const blob = await outils.encoder(
      image,
      cible.width,
      cible.height,
      fichier.type,
      QUALITE,
    );
    if (!blob || blob.type !== fichier.type || blob.size >= fichier.size)
      return fichier;

    return new File([blob], fichier.name, {
      type: fichier.type,
      lastModified: fichier.lastModified,
    });
  } catch {
    return fichier;
  } finally {
    image?.close();
  }
}

/** Réduit un lot, une photo à la fois, en rendant la main à l'interface entre deux. */
export async function reduirePhotos(
  fichiers: readonly File[],
  outils: OutilsImage = outilsNavigateur,
): Promise<File[]> {
  const reduites: File[] = [];
  for (const fichier of fichiers) {
    reduites.push(await reduirePhoto(fichier, outils));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return reduites;
}
