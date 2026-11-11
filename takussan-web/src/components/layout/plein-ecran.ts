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
 * TCK-2619 (décision 6 a, ADR-0090) — `/app` et toutes ses pages : la console. Le widget de messagerie
 * (`ChatWidget`) ne s'y monte plus, à aucune largeur : la barre d'onglets (téléphone) et l'entrée
 * « Messagerie » de la colonne (bureau) y mènent déjà, et le lanceur recouvrait le coin bas droit du
 * contenu. Il reste sur le site public.
 */
export function estDansLaConsole(pathname: string | null | undefined): boolean {
  return pathname != null && (pathname === '/app' || pathname.startsWith('/app/'));
}

/**
 * TCK-2481 — les routes où la coque porte la barre d'onglets mobile : `/app` et ses pages, hors plein
 * écran. Lue par `AppShell` (la barre) et par `CorpsDuWidget` (le bouton flottant « Messagerie »,
 * qui ne se rend plus là où la barre porte déjà la messagerie). Une règle, deux lecteurs — comme
 * `estPleinEcran`.
 */
export function porteLaBarreDOnglets(pathname: string | null | undefined): boolean {
  if (pathname == null || estPleinEcran(pathname)) return false;
  return estDansLaConsole(pathname);
}

/**
 * TCK-2481 (revue, M5) — la plage où la barre d'onglets existe : le complément exact de `md:hidden`
 * (`@media (width >= 48rem)`, Tailwind 4). Une seule chaîne, lue par la barre (`useMatchesMedia`, qui
 * n'arme ses compteurs que dessous) et par la règle du dock de `globals.css` (gardée égale par
 * `CoqueHauteur.test.tsx`).
 *
 * ⚠ En `rem`, jamais en px : dans une media query, `rem` vaut la taille de police PAR DÉFAUT du
 * navigateur, un réglage d'accessibilité. À 20 px, `md` vaut 960 px ; un seuil JS à 767 px laissait
 * la barre affichée entre 768 et 959 px sans qu'elle sonde rien.
 */
export const REQUETE_DE_LA_BARRE = '(width < 48rem)';
