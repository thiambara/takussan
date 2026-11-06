/**
 * TCK-631 — les routes de la console qui se montrent en PLEIN ÉCRAN : ni barre du haut, ni barre
 * latérale, ni lanceur « Messagerie ». La page porte alors sa propre sortie.
 *
 * Une seule liste, lue par `AppShell` (la coquille) et par `ChatWidget` (le lanceur, monté par le
 * layout racine) : deux listes recopiées divergent, et la bulle reviendrait se poser sur le pied
 * d'un parcours qui l'avait congédiée.
 *
 * ⚠ Égalité stricte, pas un préfixe : `/app/properties/new` est le parcours de publication, et
 * rien sous lui ne doit hériter du plein écran par accident.
 */
const ROUTES_PLEIN_ECRAN: readonly string[] = ['/app/properties/new'];

export function estPleinEcran(pathname: string | null | undefined): boolean {
  return pathname != null && ROUTES_PLEIN_ECRAN.includes(pathname);
}

/**
 * TCK-2481 — les routes où la coque porte la barre d'onglets mobile : `/app` et ses pages, hors plein
 * écran. Lue par `AppShell` (la barre) et par `CorpsDuWidget` (le bouton flottant « Messagerie »,
 * qui ne se rend plus là où la barre porte déjà la messagerie). Une règle, deux lecteurs — comme
 * `estPleinEcran`.
 */
export function porteLaBarreDOnglets(pathname: string | null | undefined): boolean {
  if (pathname == null || estPleinEcran(pathname)) return false;
  return pathname === '/app' || pathname.startsWith('/app/');
}
