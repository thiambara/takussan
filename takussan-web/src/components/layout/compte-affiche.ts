/**
 * Revue adverse de TCK-2490 (M1) — le nombre AFFICHÉ d'un compteur de la colonne : le compte jusqu'à 99,
 * « 99+ » au-delà. Une seule fonction pour le menu (`SidebarCounter`) et « Aujourd'hui », qui montraient
 * « 99+ » et « 100 » pour le même compte. Le vrai compte reste dans le nom accessible.
 */
export const PLAFOND_DU_COMPTE = 99;

export function compteAffiche(nombre: number): string {
  return nombre > PLAFOND_DU_COMPTE ? '99+' : String(nombre);
}
