/**
 * TCK-2632 — une pièce jointe du fil, AVANT l'envoi (TCK-2631 côté API).
 *
 * L'API accepte un fichier par message, dans `file` : une image `jpeg`/`png`/`webp` de 8 Mo au plus,
 * ou un PDF de 10 Mo au plus ; elle refuse en 422 une image de plus de **20 Mpx** (lue sur l'en-tête,
 * `PixelsAuPlus`). Un capteur de téléphone de 48 Mpx dépasse cette borne en pleine définition : le
 * front RÉDUIT donc l'image avant l'envoi, au lieu de laisser l'agent découvrir un refus.
 *
 * Le refus de type ou de taille se dit avant l'envoi (critère du ticket : un PDF de 11 Mo ne part
 * pas). Une image n'est jugée sur son poids qu'APRÈS réduction : une photo de 9 Mo qui se réduit
 * à 3 Mo part.
 */

export const PLAFOND_IMAGE_OCTETS = 8 * 1024 * 1024;
export const PLAFOND_PDF_OCTETS = 10 * 1024 * 1024;
/** La borne de l'API (`PixelsAuPlus`). */
export const PLAFOND_PIXELS = 20_000_000;
/**
 * La définition visée quand on réduit : 12 Mpx (4000 × 3000), sous la borne avec de la marge, et
 * un JPEG de 2 à 4 Mo à la qualité ci-dessous.
 */
export const PIXELS_APRES_REDUCTION = 12_000_000;
const QUALITE_JPEG = 0.85;

export const TYPES_D_IMAGE = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Ce que le sélecteur de fichiers propose (`accept`). */
export const ACCEPTE_IMAGE = TYPES_D_IMAGE.join(',');
export const ACCEPTE_PDF = 'application/pdf';

export type NatureDePiece = 'image' | 'document';
export type RefusDePiece = 'type' | 'image-trop-lourde' | 'pdf-trop-lourd';

export function natureDeLaPiece(fichier: Pick<File, 'type'>): NatureDePiece | null {
  if ((TYPES_D_IMAGE as readonly string[]).includes(fichier.type)) return 'image';
  if (fichier.type === ACCEPTE_PDF) return 'document';
  return null;
}

/** Le refus qui se juge sans lire l'image : le type, et le poids d'un PDF. */
export function refusAvantReduction(fichier: Pick<File, 'type' | 'size'>): RefusDePiece | null {
  const nature = natureDeLaPiece(fichier);
  if (nature === null) return 'type';
  if (nature === 'document' && fichier.size > PLAFOND_PDF_OCTETS) return 'pdf-trop-lourd';
  return null;
}

/** Les dimensions à viser pour tenir sous `PIXELS_APRES_REDUCTION`, proportions gardées. */
export function dimensionsReduites(largeur: number, hauteur: number): { largeur: number; hauteur: number } {
  const pixels = largeur * hauteur;
  if (pixels <= PIXELS_APRES_REDUCTION) return { largeur, hauteur };
  const k = Math.sqrt(PIXELS_APRES_REDUCTION / pixels);
  return { largeur: Math.floor(largeur * k), hauteur: Math.floor(hauteur * k) };
}

export interface OutilsDImage {
  /** Lit les dimensions et rend de quoi dessiner ; rejette une image illisible. */
  readonly decoder: (fichier: Blob) => Promise<{ width: number; height: number; source: CanvasImageSource; fermer?: () => void }>;
  /** Dessine `source` à la taille donnée et l'encode en JPEG. */
  readonly encoder: (source: CanvasImageSource, largeur: number, hauteur: number, qualite: number) => Promise<Blob>;
}

const outilsDuNavigateur: OutilsDImage = {
  decoder: async (fichier) => {
    const bitmap = await createImageBitmap(fichier);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, fermer: () => bitmap.close() };
  },
  encoder: (source, largeur, hauteur, qualite) =>
    new Promise((resoudre, rejeter) => {
      const toile = document.createElement('canvas');
      toile.width = largeur;
      toile.height = hauteur;
      const ctx = toile.getContext('2d');
      if (!ctx) return rejeter(new Error('canvas-2d'));
      ctx.drawImage(source, 0, 0, largeur, hauteur);
      toile.toBlob((b) => (b ? resoudre(b) : rejeter(new Error('toBlob'))), 'image/jpeg', qualite);
    }),
};

/**
 * Rend l'image à envoyer : telle quelle si elle tient sous 20 Mpx et 8 Mo, sinon réduite à 12 Mpx
 * en JPEG. Une image que le navigateur ne sait pas lire part telle quelle : l'API tranchera
 * (`media.file_rejected`), et son poids reste jugé par `refusApresReduction`.
 */
export async function preparerImage(fichier: File, outils: OutilsDImage = outilsDuNavigateur): Promise<File> {
  let image: Awaited<ReturnType<OutilsDImage['decoder']>>;
  try {
    image = await outils.decoder(fichier);
  } catch {
    return fichier;
  }
  try {
    if (image.width * image.height <= PLAFOND_PIXELS && fichier.size <= PLAFOND_IMAGE_OCTETS) return fichier;
    const cible = dimensionsReduites(image.width, image.height);
    const blob = await outils.encoder(image.source, cible.largeur, cible.hauteur, QUALITE_JPEG);
    const nom = fichier.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nom, { type: 'image/jpeg', lastModified: fichier.lastModified });
  } catch {
    return fichier;
  } finally {
    image.fermer?.();
  }
}

/** Le poids d'une image se juge APRÈS réduction. */
export function refusApresReduction(fichier: Pick<File, 'type' | 'size'>): RefusDePiece | null {
  return natureDeLaPiece(fichier) === 'image' && fichier.size > PLAFOND_IMAGE_OCTETS ? 'image-trop-lourde' : null;
}

/**
 * « 2,4 Mo » en français, « 2.4 MB » en anglais : le poids d'un PDF sur sa carte. L'unité vient
 * d'`Intl` (`style: 'unit'`), pas d'un libellé écrit ici.
 */
export function tailleLisible(octets: number | null | undefined, locale: string): string {
  if (octets == null || !Number.isFinite(octets)) return '';
  const mega = octets >= 1024 * 1024;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: mega ? 'megabyte' : 'kilobyte',
    unitDisplay: 'short',
    maximumFractionDigits: mega ? 1 : 0,
  }).format(mega ? octets / (1024 * 1024) : Math.max(1, Math.round(octets / 1024)));
}
