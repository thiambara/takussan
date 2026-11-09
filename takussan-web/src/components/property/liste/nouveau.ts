/**
 * TCK-2499 — « Nouveau » : publié il y a moins de 48 heures. Le ticket demande la mention « quand il
 * l'est » sans en fixer le seuil, et le dépôt n'en avait aucun ; deux jours tiennent un bien « tout
 * juste publié » sans qualifier de neuf ce qui a une semaine.
 *
 * Partagé par la carte en disposition « ligne » (`PropertyCard`) et par `LigneDeResultat` (fiche
 * d'agence, TCK-2522).
 */
export const NOUVEAU_PENDANT_MS = 48 * 3_600_000;

export function estNouveau(publieLe: string | null | undefined, maintenant: number = Date.now()): boolean {
  if (!publieLe) return false;
  const quand = new Date(publieLe).getTime();
  return Number.isFinite(quand) && maintenant - quand >= 0 && maintenant - quand < NOUVEAU_PENDANT_MS;
}
