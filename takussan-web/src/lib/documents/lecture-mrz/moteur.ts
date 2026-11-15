/**
 * TCK-2899 — lire la date d'expiration sur la photo d'une pièce, DANS le navigateur.
 *
 * Une pièce d'identité est une donnée de classe `sensible` : elle ne part jamais vers un fournisseur
 * d'IA (ADR-0076 § 4). La lecture se fait donc ici, par tesseract.js (WebAssembly) :
 *
 * - **chargé à la demande** : `tesseract.js` n'est importé que par `import()` au premier appel, jamais
 *   statiquement — il reste hors du bundle de `/app/documents` ;
 * - **servi depuis notre origine** : le worker, le cœur WebAssembly et le modèle de langue sont copiés
 *   sous `public/ocr/` par `scripts/copier-moteur-ocr.mjs` (prebuild/predev). Sans les trois chemins,
 *   tesseract.js irait les chercher sur jsdelivr : {@link optionsDuMoteur} les pose TOUS, en URL
 *   absolues de l'origine de la page (un worker né d'un `blob:` ne résout pas un chemin relatif) ;
 * - **sans rien envoyer** : l'image ne quitte pas la page, seul le texte lu est analysé
 *   (`analyse.ts`), et seule une date validée par les clés de contrôle de la MRZ est rendue.
 *
 * Toute erreur (moteur absent, image illisible, abandon) rend `null` : la lecture ne bloque jamais
 * l'ajout, et un échec ne dit rien.
 */
import type { DocumentType } from '@/types/document';

import { lireLaDateDansLaMrz } from './analyse';

/** Les pièces qui portent une MRZ ; les autres ne lancent pas la lecture (le moteur n'est pas chargé). */
export const PIECES_A_MRZ: readonly DocumentType[] = ['id_card', 'passport'];

/** Le dossier servi par `public/ocr/` (cf. `scripts/copier-moteur-ocr.mjs`). */
export const DOSSIER_DU_MOTEUR = '/ocr';

/** Les trois chemins du moteur, en URL absolues de l'origine donnée. */
export function optionsDuMoteur(origine: string) {
  const base = `${origine.replace(/\/$/, '')}${DOSSIER_DU_MOTEUR}`;
  return {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    // `ocr/lang/eng.traineddata.gz` : `gz` est une extension de fichier servi tel quel
    // (`EXTENSIONS_DE_FICHIERS`), le proxy ne la prend pas pour une page.
    gzip: true,
  } as const;
}

/** Les caractères d'une MRZ : le modèle ne peut rien lire d'autre. */
const ALPHABET_MRZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/** Le plus grand côté de l'image lue : au-delà, la lecture ralentit sans lire mieux. */
const COTE_MAX = 2000;

/**
 * L'image en niveaux de gris, réduite, et sa moitié basse (là où la MRZ se trouve quand la pièce
 * remplit la photo). Rend `null` si le navigateur ne sait pas décoder l'image.
 */
async function preparer(fichier: Blob): Promise<{ basse: HTMLCanvasElement; entiere: HTMLCanvasElement } | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bitmap = await createImageBitmap(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * echelle);
  const hauteur = Math.round(bitmap.height * echelle);
  const entiere = document.createElement('canvas');
  entiere.width = largeur;
  entiere.height = hauteur;
  const ctx = entiere.getContext('2d');
  if (!ctx) return null;
  ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close();
  const debut = Math.floor(hauteur * 0.5);
  const basse = document.createElement('canvas');
  basse.width = largeur;
  basse.height = hauteur - debut;
  basse.getContext('2d')?.drawImage(entiere, 0, debut, largeur, hauteur - debut, 0, 0, largeur, hauteur - debut);
  return { basse, entiere };
}

/**
 * La date d'expiration (`AAAA-MM-JJ`) lue dans la MRZ de la photo, ou `null`.
 * `signal` abandonne la lecture (photo reprise, fenêtre fermée) : le worker est terminé.
 */
export async function lireLaDateDExpiration(fichier: Blob, signal?: AbortSignal): Promise<string | null> {
  if (!fichier.type.startsWith('image/') || signal?.aborted) return null;
  let terminer: (() => Promise<unknown>) | null = null;
  // Une seule fois : l'abandon et la fin de la lecture peuvent tous deux le demander.
  const arreter = () => {
    const t = terminer;
    terminer = null;
    void t?.().catch(() => undefined);
  };
  const surAbandon = () => arreter();
  signal?.addEventListener('abort', surAbandon);
  try {
    const image = await preparer(fichier);
    if (!image || signal?.aborted) return null;
    // tesseract.js est un module CommonJS : selon l'interop du bundler, ses exports sont nommés ou
    // seulement sous `default`. On prend ce qui existe.
    const paquet = (await import('tesseract.js')) as Partial<typeof import('tesseract.js')> & { default?: typeof import('tesseract.js') };
    const { createWorker, OEM } = 'createWorker' in paquet ? (paquet as typeof import('tesseract.js')) : paquet.default!;
    if (signal?.aborted) return null;
    const worker = await createWorker('eng', OEM.LSTM_ONLY, optionsDuMoteur(window.location.origin));
    terminer = () => worker.terminate();
    if (signal?.aborted) return null;
    await worker.setParameters({ tessedit_char_whitelist: ALPHABET_MRZ });
    for (const zone of [image.basse, image.entiere]) {
      if (signal?.aborted) return null;
      const { data } = await worker.recognize(zone);
      const lue = lireLaDateDansLaMrz(data.text);
      if (lue) return signal?.aborted ? null : lue.expiration;
    }
    return null;
  } catch (erreur) {
    // Une trace sans rien de la photo : le nom de l'erreur seul (404 du modèle, wasm, lecture).
    console.warn('[coffre:mrz]', erreur instanceof Error ? erreur.message : erreur);
    return null;
  } finally {
    signal?.removeEventListener('abort', surAbandon);
    arreter();
  }
}
