/**
 * TCK-2656 (lot 3) — la fiche d'un document, sans rendu : ce que l'aperçu peut montrer, le format
 * et la taille du fichier, et si la pièce accepte une nouvelle version.
 */
import type { Document, DocumentType } from '@/types/document';

/** `Document::PIECE_TYPES` : une pièce de profil (`isProfilePiece`) ne se versionne pas (422). */
const TYPES_DE_PIECE: readonly DocumentType[] = ['id_card', 'rib', 'ninea'];

/**
 * « Ajouter une version » : le verdict de l'API (`abilities.update`), sauf pour une pièce rattachée à
 * un PROFIL (`App\Models\…Profile`), que `DocumentVersionService::uploadVersion` refuse en 422
 * (`document.profile_piece_not_versioned`) — elle se renvoie par les assistants d'accueil.
 */
export function seVersionne(document: Pick<Document, 'abilities' | 'type' | 'documentable_type'>): boolean {
  if (document.abilities?.update !== true) return false;
  const pieceDeProfil =
    document.type !== null && TYPES_DE_PIECE.includes(document.type) && /Profile$/.test(document.documentable_type ?? '');
  return !pieceDeProfil;
}

/** L'aperçu montre le fichier lui-même quand c'est une image (servie `inline`), une tuile sinon. */
export function estUneImage(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && mime.startsWith('image/');
}

/** « JPG », « PDF » : l'extension du nom, à défaut le sous-type MIME ; `null` sans l'un ni l'autre. */
export function formatDuFichier(nom: string | null | undefined, mime: string | null | undefined): string | null {
  const extension = nom?.includes('.') ? nom.split('.').pop() : null;
  if (extension) return extension.toUpperCase();
  const sousType = mime?.split('/')[1]?.split(/[+;]/)[0];
  return sousType ? sousType.toUpperCase() : null;
}

export type TailleDuFichier = { readonly unite: 'Ko' | 'Mo'; readonly valeur: number };

/** En Mo dès 1 Mo (une décimale), en Ko sinon (au moins 1) — la règle de l'ajout (lot 2). */
export function tailleDuFichier(octets: number | null | undefined): TailleDuFichier | null {
  if (typeof octets !== 'number' || octets < 0) return null;
  const mo = octets / (1024 * 1024);
  if (mo >= 1) return { unite: 'Mo', valeur: Math.round(mo * 10) / 10 };
  return { unite: 'Ko', valeur: Math.max(1, Math.round(octets / 1024)) };
}
