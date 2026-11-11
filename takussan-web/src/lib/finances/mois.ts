/**
 * TCK-2659 — le MOIS de la page « Argent » (`?period=YYYY-MM`), en chaînes : la synthèse le reçoit
 * tel quel (`GET /api/agencies/{agency}/finance/summary?period=`), et les encaissements en tirent
 * leurs bornes `date_from` / `date_to`. Tout se calcule en chaînes et en UTC : Dakar est à UTC+0
 * sans heure d'été, et un `Date` local (fuseau du poste) déplacerait un 1ᵉʳ du mois la veille.
 */

const MOTIF_MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `2026-10` est un mois ; `2026-13`, `2026-1` ou `octobre` non. */
export function estMois(valeur: string | null | undefined): valeur is string {
  return typeof valeur === 'string' && MOTIF_MOIS.test(valeur);
}

function parties(mois: string): readonly [number, number] {
  const [, a, m] = MOTIF_MOIS.exec(mois) ?? [];
  return [Number(a), Number(m)];
}

function ecrire(annee: number, mois: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

/** Le mois civil en cours, au fuseau de Dakar. `maintenant` sert aux tests. */
export function moisCourant(maintenant: Date = new Date()): string {
  // Dakar vit à UTC+0 toute l'année (ni décalage ni heure d'été) : le mois UTC EST celui de Dakar.
  return maintenant.toISOString().slice(0, 7);
}

/** Le mois d'avant : `2026-01` → `2025-12`. */
export function moisPrecedent(mois: string): string {
  const [a, m] = parties(mois);
  return m === 1 ? ecrire(a - 1, 12) : ecrire(a, m - 1);
}

/** Les bornes du mois, incluses : `2026-02` → `2026-02-01` … `2026-02-28`. */
export function bornesDuMois(mois: string): { readonly du: string; readonly au: string } {
  const [a, m] = parties(mois);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { du: `${mois}-01`, au: `${mois}-${String(dernier).padStart(2, '0')}` };
}

/** Les `n` derniers mois, le plus récent d'abord (le sélecteur de mois). */
export function derniersMois(courant: string, n = 12): readonly string[] {
  const liste: string[] = [courant];
  while (liste.length < n) liste.push(moisPrecedent(liste[liste.length - 1] as string));
  return liste;
}

/** Une date au milieu du mois (le 15, midi UTC), pour le nommer par `Intl` sans risque de bord. */
export function dateDuMois(mois: string): Date {
  const [a, m] = parties(mois);
  return new Date(Date.UTC(a, m - 1, 15, 12));
}
