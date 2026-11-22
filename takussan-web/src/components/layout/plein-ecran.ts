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

/**
 * ADR-0136 (TCK-2998) — les formulaires de création : `/app/…/new`. Une création, jamais un détail ; au téléphone,
 * un écran plein (en-tête « ✕ », pas de barre d'onglets).
 */
export function estFormulaire(pathname: string | null | undefined): boolean {
  return pathname != null && pathname.startsWith('/app/') && pathname.endsWith('/new');
}

/**
 * TCK-2602 — « Votre annonce est en ligne », la sortie de la publication d'un espace particulier :
 * l'écran porte la coque d'entrée (sa barre, sa sortie « Aller à mon espace »). Un motif ancré, pour
 * la même raison que l'égalité stricte : la fiche `/app/properties/{id}` garde sa coque.
 */
const MOTIFS_PLEIN_ECRAN: readonly RegExp[] = [/^\/app\/properties\/\d+\/en-ligne$/];

export function estPleinEcran(pathname: string | null | undefined): boolean {
  return pathname != null && (ROUTES_PLEIN_ECRAN.includes(pathname) || MOTIFS_PLEIN_ECRAN.some((motif) => motif.test(pathname)));
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
 * ADR-0134 (TCK-2989) — les routes de la console qui gardent, au téléphone, une boîte de la hauteur de
 * l'écran où c'est le `<main>` qui défile : leur page a besoin d'une hauteur bornée. Relevé du
 * 2026-11-21 (25 pages, 390 × 844) : la messagerie seule (sa colonne de conversations défile dans sa
 * propre boîte, `MessagesPage`).
 */
export const ROUTES_EN_BOITE: readonly string[] = ['/app/messages'];

/**
 * ADR-0134 (TCK-2989) — sous `md`, c'est le DOCUMENT qui défile, pour que le navigateur replie ses
 * barres : toute page de la barre d'onglets, hors des routes en boîte.
 *
 * ⚠ Décidé par la ROUTE, jamais par `data-barre-onglets` : la barre se retire EN COURS de page (une
 * sélection, une section à enregistrer, déclarées par le client) ; le mode basculerait sous le doigt et
 * le défilement sauterait en haut. La seule bascule légitime, la conversation ouverte, est un état de
 * `/app/messages` — déjà en boîte.
 */
export function defileLeDocument(pathname: string | null | undefined): boolean {
  if (!porteLaBarreDOnglets(pathname) || pathname == null) return false;
  return !ROUTES_EN_BOITE.some((route) => pathname === route || pathname.startsWith(`${route}/`));
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

/**
 * ADR-0136 (TCK-2998) — LE PROFIL D'ESPACE d'une page de la console : ce que l'écran du téléphone y fait de sa place.
 *
 * - `liste` (listes et lecture) : le document défile et les barres s'effacent (ADR-0134) ;
 * - `formulaire` (une création, un parcours plein écran) : pas de barre d'onglets ; en saisie, l'en-tête se compacte
 *   et la barre d'action se pose sur le clavier (ADR-0133) ;
 * - `conversation` (le fil ouvert de la messagerie) : hauteur fixe, composeur collé au clavier (ADR-0133, TCK-2996).
 *
 * Décidé par la ROUTE (ADR-0134 § 1), avec une seule exception d'ÉTAT, déjà admise par ADR-0134 : la conversation
 * ouverte, état de `/app/messages`. Une déclaration de page ne change jamais le profil. Publié sur la coque
 * (`data-espace`), lu par `globals.css` et par `formeDeLaRoute`.
 */
export type ProfilDEspace = 'liste' | 'formulaire' | 'conversation';

export function profilDEspace(
  pathname: string | null | undefined,
  etat: { readonly conversation?: boolean } = {},
): ProfilDEspace {
  if (estPleinEcran(pathname) || estFormulaire(pathname)) return 'formulaire';
  const enBoite = pathname != null && ROUTES_EN_BOITE.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (enBoite && etat.conversation === true) return 'conversation';
  return 'liste';
}
