/**
 * Harnais de MESURE DE CONTRASTE pour les tests — TCK-371, revue adverse.
 *
 * ## Pourquoi ce fichier existe
 *
 * Les gardes d'accessibilité de la console éprouvaient des CHAÎNES DE CLASSES. Une ablation l'a
 * montré au chiffre : remplacer le fond de l'entrée active de `/admin` par `bg-primary` rend
 * l'anneau `--ring` **exactement de la couleur de son propre fond — 1,00:1, littéralement
 * invisible** — et la suite restait verte. Un critère qui coche aussi la régression ne garde rien.
 *
 * Ce module calcule donc le seul chiffre que les AC exigent : le rapport de contraste WCAG 2.1,
 * **sur le fond RÉEL**, en composant l'alpha AVANT le calcul. Le fond réel n'est pas supposé — il
 * est remonté depuis le DOM rendu, ancêtre par ancêtre, comme le navigateur le compose.
 *
 * ## Les trois pièges qu'il ferme, et qui ont tous été payés
 *
 * 1. **La composition avant le calcul.** Un ratio pris sur la couleur NOMINALE d'un `/55` ne
 *    mesure rien : `text-white/55` n'est pas du blanc, c'est `#9a9794` une fois posé sur
 *    `#1f1812`. Tailwind v4 émet `color-mix(in oklab, #fff 55%, transparent)`, que le navigateur
 *    compose ensuite en sRGB — `composer()` fait cette composition-là.
 * 2. **Le fond réel, pas celui de la barre.** `outline-2` + `-outline-offset-2` remplit la bande
 *    de 2 px la plus EXTÉRIEURE de l'élément : son bord interne jouxte le fond PROPRE de
 *    l'élément, pas celui de son conteneur. C'est ce que la revue a mesuré dans Chrome, et c'est
 *    ce que `fondsPossibles()` rend — tous les fonds que l'élément peut avoir, `hover:` compris,
 *    parce qu'un anneau doit tenir dans CHACUN de ses états, pas dans celui du DOM au repos.
 * 3. **Le jeton inconnu.** `resoudreCouleur()` LÈVE sur un jeton absent de la table plutôt que de
 *    rendre une valeur de repli. Un `bg-emerald-100` neuf fait donc rougir avec son nom, au lieu
 *    d'être mesuré contre du blanc imaginaire et déclaré conforme.
 *
 * ⚠ Les jetons sont recopiés de `src/app/globals.css` à dessein, comme dans
 * `ui/__tests__/tabs.contrast.test.tsx` : jsdom ne charge aucune feuille, et un test qui lirait
 * la feuille COMPILÉE mesurerait ce que Tailwind a bien voulu émettre. Celui-ci mesure ce que le
 * design system DÉCLARE.
 *
 * ⚠ **`JETONS_SOMBRE` n'est PAS « pour le jour où » : il mesure une surface RENDUE.** Cette
 * ligne a affirmé le contraire, avec un « (vérifié) » qui la rendait crédible — cf.
 * {@link JETONS_SOMBRE}, dont l'en-tête porte le détail et l'angle mort qui a produit l'erreur.
 */

/** Seuil WCAG 1.4.11 — indicateur non textuel (anneau de focus, bordure porteuse de sens). */
export const SEUIL_NON_TEXTUEL = 3;
/** Seuil WCAG 1.4.3 AA — texte normal (< 18,66 px gras / < 24 px). */
export const SEUIL_AA_TEXTE = 4.5;

/** `:root` de `src/app/globals.css`. Recopié, pas lu — cf. l'avertissement en tête. */
export const JETONS_CLAIR: Readonly<Record<string, string>> = {
  background: '#fcf9f3',
  foreground: '#1f1812',
  card: '#ffffff',
  'card-foreground': '#1f1812',
  popover: '#ffffff',
  primary: '#a85332',
  'primary-foreground': '#fcf9f3',
  'primary-deep': '#823c20',
  secondary: '#f3ead8',
  'secondary-foreground': '#1f1812',
  muted: '#f1ece0',
  'muted-foreground': '#6e655a',
  accent: '#5d6e4f',
  'accent-foreground': '#fcf9f3',
  warning: '#8a5410',
  'warning-foreground': '#fcf9f3',
  /*
   * ⚠ LES JETONS AJOUTÉS LE 2026-08-29 (TCK-458/444), ET POURQUOI LEUR ABSENCE ÉTAIT UN DÉFAUT.
   *
   * Cette table ne portait que les jetons qu'un test avait eu besoin de résoudre. Tant qu'elle
   * servait deux composants, l'absence des autres ne se voyait pas : `resoudreCouleur()` LÈVE sur
   * un jeton inconnu, et personne n'écrivait `text-success` dans la navbar. Sur un périmètre
   * dérivé, la même absence devient un TROU — le couple n'est pas mesuré à faux, il n'est pas
   * mesuré du tout, et c'est le mode d'échec silencieux que ce fichier existe pour refuser.
   *
   * Les valeurs sont recopiées de `globals.css`, comme les précédentes. `--radius`,
   * `--floating-dock-base` et consorts n'y sont pas : ce ne sont pas des couleurs.
   *
   * ⚠ `--destructive` est ABSENT, et délibérément : `globals.css` le déclare en
   * `oklch(0.577 0.245 27.325)`, seul jeton de couleur non hexadécimal des deux blocs. Le
   * convertir ici demanderait une implémentation d'OKLCH → sRGB qu'aucune garde ne vérifierait ;
   * l'inventer serait pire. Il reste donc « hors jetons », c'est-à-dire COMPTÉ et non mesuré —
   * un trou déclaré vaut mieux qu'un trou.
   */
  success: '#3f6b45',
  'success-foreground': '#fcf9f3',
  info: '#3f5a6b',
  'info-foreground': '#fcf9f3',
  'chart-1': '#a85332',
  'chart-2': '#5d6e4f',
  'chart-3': '#ad8034',
  'chart-4': '#6e655a',
  'chart-5': '#1f1812',
  'shadow-color': '#1f1812',
  'sidebar-foreground': '#1f1812',
  'sidebar-primary': '#a85332',
  'sidebar-primary-foreground': '#fcf9f3',
  'sidebar-accent-foreground': '#1f1812',
  'sidebar-border': '#ebe5d5',
  'sidebar-ring': '#a85332',
  surface: '#fcf9f3',
  'surface-container': '#f1ece0',
  'on-surface': '#1f1812',
  'on-surface-variant': '#6e655a',
  outline: '#ebe5d5',
  border: '#ebe5d5',
  input: '#ebe5d5',
  ring: '#a85332',
  sidebar: '#ffffff',
  'sidebar-accent': '#f1ece0',
  white: '#ffffff',
  black: '#000000',
  /*
   * Le VOILE. Même valeur que `black`, et ce n'est pas une redondance : `black` est la couleur
   * nommée de Tailwind, `scrim` est le jeton `--scrim` de `globals.css` (TCK-384). Les mesurer
   * séparément est ce qui permet à la garde de chrome de refuser l'une et d'admettre l'autre.
   *
   * ⚠ Il est le SEUL jeton dont l'héritage par `...JETONS_CLAIR` soit légitime — le piège que
   * décrit l'en-tête de {@link JETONS_SOMBRE} porte sur les jetons QUE `.dark` REDÉFINIT. Vérifié :
   * `grep -c -- '--scrim:' globals.css` → **1**, ligne 158, dans `:root`, jamais sous `.dark`.
   * Un voile qui s'éclaircirait en thème sombre cesserait d'être un voile.
   */
  scrim: '#000000',
  transparent: 'transparent',
};

/**
 * Bloc `.dark` de `globals.css` — la table d'une surface RÉELLEMENT RENDUE, et non d'un thème
 * hypothétique.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * UNE RE-VÉRIFICATION QUI A CONCLU À FAUX, ET PAR QUEL ANGLE MORT
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Cet en-tête a porté, du 2026-08-27 au 2026-08-28, l'affirmation suivante — **elle était
 * fausse**, et elle est recopiée ici plutôt que effacée, parce que c'est sa FORME qui instruit :
 *
 *     « ⚠ « Inatteignable » a été RE-VÉRIFIÉ le 2026-08-27 (TCK-440) […] il n'y a pas seulement
 *       aucune classe .dark posée, il n'y a AUCUN MÉCANISME pour en poser une […] La bascule
 *       sombre est un jeu de valeurs déclarées que rien n'active. »
 *
 * **La classe est posée, en toutes lettres, sur des composants livrés. Ne pas recopier la liste
 * ci-dessous : la DÉRIVER**, parce que la première correction de cette erreur en avait énuméré
 * DEUX et qu'il y en a TROIS —
 *
 *     grep -rnE "(^|['\"`]|[[:space:]])dark([[:space:]]|['\"`]|$)" takussan-web/src --include='*.tsx'
 *
 * ⚠⚠ **La première version de cette commande faisait 3 SUR 7, et rendait pourtant le bon compte.**
 * Elle exigeait un guillemet immédiatement avant `dark`, alors que dans une liste de classes le
 * séparateur est une ESPACE : elle ratait `className="flex dark bg-x"`, la position finale, et un
 * gabarit au milieu. Elle donnait trois parce que les trois posages réels écrivent `dark` en
 * premier — *coïncidence, pas propriété.* **Une commande qui rend le bon nombre sur les cas
 * existants n'est pas une dérivation, c'est une énumération déguisée** : exactement ce qu'elle
 * était censée remplacer. La forme ci-dessus fait **7 sur 7** sur ce banc.
 *
 * ⚠⚠ **LE BRUIT NE SE CHIFFRE PAS SANS SON PÉRIMÈTRE, et cette phrase l'a fait.** Elle a annoncé
 * « zéro ligne de bruit en plus (22 dans les deux cas) » — un chiffre exact, mesuré ailleurs, et
 * donc invérifiable par qui le relit. Trois relevés du même écart ont donné trois nombres, tous
 * justes sous leur propre périmètre :
 *
 *     commande TELLE QU'ÉCRITE ci-dessous, depuis la racine, à 82d83706, le 2026-08-28
 *         → 23 lignes sans ancre, 23 avec .................................... +0
 *     `takussan-web/src` en `.tsx` ET `.ts` (1129 fichiers) ................... +0  (30 / 30)
 *     le seul périmètre gardé par `check-public-chrome-tokens.mjs` ........... +0  (4 / 4)
 *     un relevé sur un AUTRE commit ........................................ +1  (22 / 23)
 *
 * L'ancre ne change ici que l'ORDRE de parcours de `grep`, pas l'ensemble rendu — vérifié par
 * `diff`. *Une mesure juste ne le reste pas quand on la transporte sur un autre commit, ni sur un
 * autre périmètre.* Le choix reste évidemment le bon : un cas réel gagné contre, au pire, une
 * ligne de commentaire.
 *
 * ⚠ Les ancres `^` et `$` ne sont pas décoratives : `grep` est orienté LIGNE, et un gabarit
 * multiligne peut mettre `dark` seule sur sa ligne. Sans elles, la version « 6 sur 7 » exigeait
 * un caractère APRÈS `dark` sur la même ligne et ratait ce cas-là — un huitième bord, trouvé
 * une passe après les sept autres.
 *
 * ⚠ **Le septième cas est hors de portée de TOUT grep** : `clsx({ dark: x })` écrit la classe en
 * clé d'objet, et `dark:` est par ailleurs le préfixe de la variante Tailwind — aucun motif
 * textuel ne peut les distinguer. Écrit ici plutôt que laissé croire exhaustif.
 *
 * ⚠⚠ **DEPUIS TCK-459 (2026-08-29), LA COMMANDE CI-DESSUS N'EST PLUS LE MOYEN DE DÉRIVER CETTE
 * LISTE** — elle reste écrite parce que c'est son HISTOIRE qui instruit. La dérivation vit dans
 * `src/test/portees-sombres.ts`, qui lit l'arbre JSX plutôt que des lignes, et qui ferme le
 * septième cas : un lecteur d'AST distingue une clé d'objet d'un préfixe de variante, là où aucun
 * motif textuel ne le peut. Son banc fait **10 sur 10** (7 écritures à voir, 3 sosies à refuser).
 * Et surtout, la liste n'est plus lue par un humain : `portees-sombres.test.tsx` la confronte à
 * l'ensemble — dérivé lui aussi — des composants dont un couple tombe sous le seuil en sombre.
 * *Une liste dérivée qu'aucune garde ne consomme reste une liste à recopier.*
 *
 * Au 2026-08-28 elle rend `SuperAdminSidebar.tsx:224`, `SuperAdminTopbar.tsx:49` et
 * `SuperAdminShell.tsx:80`. ⚠ La troisième est la plus instructive : c'est un `<SheetContent
 * className="dark …">`, donc une portée qui traverse un **portail** et atterrit au niveau du
 * `body`, hors position d'arbre. Un raisonnement sur l'arbre JSX ne l'aurait pas trouvée.
 *
 * ⚠ Et le piège du relevé lui-même : `variant="dark"` (`AppTopbar.tsx:80`, `UserMenu.tsx`) n'est
 * PAS la classe — c'est une prop de composant. Le motif de recherche ci-dessus les écarte.
 *
 * Leurs docblocks le disent depuis TCK-358, et l'un précise même : *« La classe `dark` n'est PAS
 * le mode sombre de l'utilisateur : c'est une surface. »*
 *
 * ⚠ **L'ANGLE MORT, qui est le seul détail utile ici** : la re-vérification a cherché un
 * MÉCANISME — `ThemeProvider`, `next-themes` au `package.json`, `documentElement.classList`. Les
 * trois sont bien absents, et c'est ce qui l'a rendue convaincante. Elle n'a pas cherché **une
 * classe littérale dans un `className`**, qui est pourtant la façon la plus simple de poser une
 * classe. *Chercher l'outil et pas le geste : on ne trouve alors que les usages sophistiqués.*
 *
 * Et la leçon de forme, qui vaut au-delà de ce fichier : **une re-vérification qui conclut à faux
 * est plus difficile à défaire que l'erreur d'origine.** Elle porte sa date et son ticket, elle a
 * l'air d'avoir déjà résisté à un examen. Le « (vérifié) » de l'en-tête de fichier faisait le même
 * travail. Un lecteur les croit tous les deux sans les rejouer — c'est exactement ce qui s'est
 * passé pendant deux passes de revue.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TABLE MESURE DONC, ET QUI EST DOUBLE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * · Pour la chrome SUPER-ADMIN : un écran que des gens regardent. Ces valeurs-là sont éprouvées
 *   par la réalité, et une erreur dedans est un défaut visible. C'est ce qui donne sa portée au
 *   piège du `...JETONS_CLAIR` décrit plus bas — il mesurait à faux une surface rendue.
 * · Pour la chrome PUBLIQUE : une hypothèse. Aucune bascule globale n'existe, et la navbar n'est
 *   jamais dans un sous-arbre `.dark` — les deux composants qui posent la classe sont ailleurs.
 *   Les mesures « en sombre » de `chrome-publique.contraste.test.tsx` gardent donc la COHÉRENCE
 *   des jetons, pas la lisibilité d'un écran existant.
 *
 * La distinction juste n'est pas « mort / vivant » mais **« portée locale assumée » contre
 * « bascule globale absente »** (TCK-452).
 *
 * ⚠ **Le `...JETONS_CLAIR` de la première ligne est un piège, et il a mordu.** Il fait hériter en
 * silence des valeurs CLAIRES tout jeton non ré-écrit ci-dessous — `primary`, `secondary`,
 * `popover`, `border`, `accent` restaient donc à leur valeur de thème clair, et une mesure
 * « en sombre » les comparait à un fond sombre : un rapport rassurant, calculé sur une paire qui
 * n'existe nulle part. Les huit lignes ajoutées le 2026-08-27 (TCK-440) recopient le bloc `.dark`
 * en entier. Une valeur absente de `globals.css` n'est pas une valeur héritée du clair.
 */
export const JETONS_SOMBRE: Readonly<Record<string, string>> = {
  ...JETONS_CLAIR,
  background: '#1f1812',
  foreground: '#fcf9f3',
  card: '#2a2018',
  'card-foreground': '#fcf9f3',
  popover: '#2a2018',
  'popover-foreground': '#fcf9f3',
  primary: '#c87a52',
  'primary-foreground': '#1f1812',
  secondary: '#3a2e23',
  'secondary-foreground': '#fcf9f3',
  muted: '#3a2e23',
  'muted-foreground': '#b8aa97',
  accent: '#7d8d6e',
  'accent-foreground': '#1f1812',
  warning: '#e0a458',
  'warning-foreground': '#1f1812',
  ring: '#c87a52',
  sidebar: '#2a2018',
  'sidebar-accent': '#3a2e23',
  success: '#8fbf87',
  'success-foreground': '#1f1812',
  info: '#8fb2c8',
  'info-foreground': '#1f1812',
  'chart-1': '#c87a52',
  'chart-2': '#7d8d6e',
  'chart-3': '#d6b66c',
  'chart-4': '#b8aa97',
  'chart-5': '#fcf9f3',
  'sidebar-foreground': '#fcf9f3',
  'sidebar-primary': '#c87a52',
  'sidebar-primary-foreground': '#1f1812',
  'sidebar-accent-foreground': '#fcf9f3',
  /*
   * ⚠ `--sidebar-border` rejoint `--border` et `--input` : `oklch(1 0 0 / 10%)` sous `.dark`,
   * donc du blanc translucide. La valeur ci-dessous est ce blanc COMPOSÉ sur `--background`, la
   * même approximation assumée que pour les deux autres — cf. leur commentaire.
   */
  'sidebar-border': '#352f2a',
  'sidebar-ring': '#c87a52',
  /*
   * ⚠ `--border` et `--input` sont les DEUX seuls jetons du bloc `.dark` qui ne sont pas des hex :
   * `oklch(1 0 0 / 10%)` et `oklch(1 0 0 / 15%)`, c'est-à-dire du blanc translucide. Les valeurs
   * ci-dessous sont ces blancs COMPOSÉS sur `--background` #1f1812, la seule composition qu'ils
   * subissent en pratique — les recopier translucides ferait lever `versRvb()`, et les laisser à
   * leur valeur claire (ce que faisait le `...JETONS_CLAIR`) mesurerait une bordure crème sur un
   * fond sombre, c'est-à-dire rien de réel. C'est une APPROXIMATION assumée : posée sur `--card`
   * (#2a2018), la vraie bordure serait un cran plus claire.
   */
  border: '#352f2a',
  input: '#413b36',
};

export type Rvb = readonly [number, number, number];

export function versRvb(hex: string): Rvb {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`couleur non hexadécimale : « ${hex} »`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rvb;
}

export function versHex([r, v, b]: Rvb): string {
  return `#${[r, v, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** sRGB → composante linéaire (WCAG 2.1, définition de la luminance relative). */
function lineaire(canal: number): number {
  const s = canal / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, v, b]: Rvb): number {
  return 0.2126 * lineaire(r) + 0.7152 * lineaire(v) + 0.0722 * lineaire(b);
}

/** Compose `encre` à l'opacité `alpha` SUR `fond`. C'est ce que fait le navigateur, en sRGB. */
export function composer(encre: Rvb, fond: Rvb, alpha: number): Rvb {
  return [0, 1, 2].map((i) => encre[i] * alpha + fond[i] * (1 - alpha)) as unknown as Rvb;
}

/** Rapport de contraste WCAG 2.1 entre deux couleurs OPAQUES. */
export function contraste(a: Rvb | string, b: Rvb | string): number {
  const [haut, bas] = [
    luminance(typeof a === 'string' ? versRvb(a) : a),
    luminance(typeof b === 'string' ? versRvb(b) : b),
  ].sort((x, y) => y - x);
  return (haut + 0.05) / (bas + 0.05);
}

/** Deux décimales, virgule française — la forme dans laquelle les AC sont écrites. */
export function fmt(ratio: number): string {
  return `${ratio.toFixed(2).replace('.', ',')}:1`;
}

/**
 * Les utilitaires QUI PARTAGENT UN PRÉFIXE DE COULEUR SANS EN ÊTRE UN.
 *
 * `text-sm` n'est pas une encre, `bg-cover` n'est pas un fond. Sans cette liste, le premier
 * `text-sm` venu fait lever `resoudreCouleur()` avec « jeton inconnu : sm » — un faux rouge, donc
 * exactement le défaut de maintenance qu'on corrige ailleurs dans ce lot. Les listes sont CLOSES :
 * ce sont des familles finies de Tailwind, pas des noms libres. Un utilitaire absent d'ici et
 * absent des jetons fait rougir avec son nom — c'est voulu, c'est la moitié utile de la garde.
 */
const NON_COULEURS: Readonly<Record<string, ReadonlySet<string>>> = {
  text: new Set([
    'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
    'left', 'center', 'right', 'justify', 'start', 'end',
    'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip',
  ]),
  bg: new Set([
    'auto', 'cover', 'contain', 'none', 'fixed', 'local', 'scroll', 'clip-text', 'clip-border',
    'clip-padding', 'clip-content', 'origin-border', 'origin-padding', 'origin-content',
    'repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'repeat-round', 'repeat-space',
    'top', 'bottom', 'left', 'right', 'center', 'blend-normal', 'blend-multiply',
  ]),
  outline: new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double']),
  border: new Set([
    'solid', 'dashed', 'dotted', 'double', 'hidden', 'none',
    'x', 'y', 't', 'r', 'b', 'l', 's', 'e', 'collapse', 'separate', 'spacing',
  ]),
  ring: new Set(['inset']),
};

/**
 * `bg-muted/60`, `text-white/55`, `outline-ring`, `bg-primary` → `{ jeton, alpha }`.
 * Rend `null` si la classe n'est pas un utilitaire de couleur du préfixe demandé.
 *
 * Trou déclaré : les valeurs arbitraires (`bg-[#f5f5f4]`, `text-[10px]`) ne matchent pas et sont
 * donc IGNORÉES, pas mesurées. `check-super-admin-tokens.mjs` les refuse par ailleurs.
 */
export function litUtilitaireDeCouleur(
  classe: string,
  prefixe: 'bg' | 'text' | 'outline' | 'border' | 'ring',
): { jeton: string; alpha: number; variante: string } | null {
  const m = /^(?:([a-z-]+(?::[a-z-]+)*):)?([a-z]+)-([a-z0-9-]+?)(?:\/(\d{1,3}))?$/.exec(classe);
  if (!m || m[2] !== prefixe) return null;
  const jeton = m[3];
  // Une échelle de taille (`outline-2`, `border-4`) ni un utilitaire non chromatique.
  if (/^\d+(?:\.\d+)?$/.test(jeton) || NON_COULEURS[prefixe]?.has(jeton)) return null;
  if (prefixe === 'outline' && jeton.startsWith('offset-')) return null;
  return { variante: m[1] ?? '', jeton, alpha: m[4] === undefined ? 1 : Number(m[4]) / 100 };
}

/**
 * Jeton → hex. LÈVE sur un jeton inconnu : c'est le point du n°3 en tête de fichier — une
 * couleur qu'on ne sait pas résoudre ne doit pas être mesurée contre une valeur de repli.
 */
export function resoudreCouleur(jeton: string, jetons = JETONS_CLAIR): string {
  const valeur = jetons[jeton];
  if (valeur === undefined) {
    // Que faire de ce rouge :
    //  · c'est un jeton du design system → le recopier de `src/app/globals.css` dans
    //    `JETONS_CLAIR` / `JETONS_SOMBRE` ci-dessus ;
    //  · c'est une échelle Tailwind brute (`stone-700`, `emerald-100`…) → la retirer du
    //    composant : le design system n'a qu'un vocabulaire, et `check-super-admin-tokens.mjs`
    //    la refuse déjà partout où son périmètre porte.
    //
    // Le message reste court à dessein : ce fichier est un harnais de test, et `check-i18n.mjs`
    // compte les chaînes en dur sans savoir qu'aucune ne s'affichera jamais à un utilisateur.
    throw new Error(`jeton de couleur inconnu : « ${jeton} » (cf. src/test/contraste-wcag.ts)`);
  }
  return valeur;
}

/** L'état « aucune pseudo-classe » — le fond que l'élément a quand rien ne le survole. */
export const REPOS = 'repos';

/** Un fond que l'élément peut réellement avoir, avec l'état qui le produit. */
export interface FondPossible {
  /** `REPOS`, `hover`, `focus-visible`, `data-[state=selected]`… */
  readonly etat: string;
  readonly hex: string;
  /** Comment il a été composé — reporté dans le message d'échec. */
  readonly provenance: string;
}

/**
 * Fond OPAQUE hérité d'un élément : le premier ancêtre qui peint, aplati sur ce que LUI hérite.
 * `racine` incluse ; au-delà, c'est la page, donc `--background`.
 */
export function fondHerite(
  element: Element,
  jetons = JETONS_CLAIR,
  fondDePage = resoudreCouleur('background', jetons),
): { hex: string; provenance: string } {
  const parent = element.parentElement;
  if (!parent) return { hex: fondDePage, provenance: 'page (--background)' };

  const peinture = Array.from(parent.classList)
    .map((c) => litUtilitaireDeCouleur(c, 'bg'))
    .find((u) => u !== null && u.variante === '' && u.jeton !== 'transparent');

  if (!peinture) return fondHerite(parent, jetons, fondDePage);

  const dessous = fondHerite(parent, jetons, fondDePage);
  const hex = versHex(
    composer(versRvb(resoudreCouleur(peinture.jeton, jetons)), versRvb(dessous.hex), peinture.alpha),
  );
  return {
    hex,
    provenance: peinture.alpha === 1
      ? `bg-${peinture.jeton}`
      : `bg-${peinture.jeton}/${Math.round(peinture.alpha * 100)} sur ${dessous.hex}`,
  };
}

/**
 * TOUS les fonds que l'élément peut avoir : son fond au repos (le sien, ou celui dont il hérite),
 * plus un par variante (`hover:`, `data-[state=…]:`…) qu'il déclare.
 *
 * ⚠ On mesure sur TOUS, pas sur celui du DOM au repos. Le cas qui a motivé la revue est
 * précisément un état absent du DOM de test : l'entrée SURVOLÉE pendant que le clavier la
 * focalise — « la souris repose sur la liste » — dont le fond composé faisait tomber l'anneau à
 * 2,89:1. Un test qui ne lit que l'état rendu ne le verrait jamais.
 */
export function fondsPossibles(element: Element, jetons = JETONS_CLAIR): FondPossible[] {
  const propres = Array.from(element.classList)
    .map((c) => litUtilitaireDeCouleur(c, 'bg'))
    .filter((u): u is NonNullable<typeof u> => u !== null && u.jeton !== 'transparent');

  const dessous = fondHerite(element, jetons);
  const fonds: FondPossible[] = [];

  if (!propres.some((u) => u.variante === '')) {
    fonds.push({ etat: REPOS, hex: dessous.hex, provenance: `hérité — ${dessous.provenance}` });
  }
  for (const u of propres) {
    const hex = versHex(
      composer(versRvb(resoudreCouleur(u.jeton, jetons)), versRvb(dessous.hex), u.alpha),
    );
    const nom = u.alpha === 1 ? `bg-${u.jeton}` : `bg-${u.jeton}/${Math.round(u.alpha * 100)}`;
    fonds.push({
      etat: u.variante === '' ? REPOS : u.variante,
      hex,
      provenance: `${u.variante ? `${u.variante}:` : ''}${nom} sur ${dessous.hex}`,
    });
  }
  return fonds;
}

/**
 * L'anneau de focus déclaré par un élément : sa couleur résolue et son décalage.
 * Rend `null` si l'élément n'en déclare aucun — l'appelant décide si c'est un échec.
 */
export function anneauDeFocus(
  element: Element,
  jetons = JETONS_CLAIR,
): { classe: string; jeton: string; alpha: number; hex: string; rentrant: boolean } | null {
  const classes = Array.from(element.classList);
  const brut = classes
    .map((c) => ({ c, u: litUtilitaireDeCouleur(c, 'outline') }))
    .find(({ u }) => u?.variante === 'focus-visible');
  if (!brut?.u) return null;
  return {
    classe: brut.c,
    jeton: brut.u.jeton,
    alpha: brut.u.alpha,
    hex: resoudreCouleur(brut.u.jeton, jetons),
    rentrant: classes.includes('focus-visible:-outline-offset-2'),
  };
}

/**
 * LE PIRE FOND D'UNE PLAQUE SEMI-TRANSPARENTE POSÉE SUR UN MÉDIA — TCK-458, AC4.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN BALAYAGE, ET PAS « BLANC SI L'ENCRE EST CLAIRE, NOIR SINON »
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un texte posé sur une photo par une plaque `bg-X/90` n'a pas de contraste garanti *par
 * construction* : les 10 % restants laissent passer un pixel quelconque. Le ratio VARIE donc avec
 * l'image, et la seule question qui vaille est son MINIMUM.
 *
 * La règle intuitive — « le pire cas est à une extrémité, blanc si l'encre est claire, noir
 * sinon » — est vraie pour la pastille de contrat et **fausse en général**. Elle suppose la
 * monotonie du contraste en le pixel, ce qui n'est vrai que si la luminance de l'encre tombe HORS
 * de la plage que la plaque peut atteindre. Quand elle tombe DEDANS, le minimum est au
 * **croisement**, pas à un bord. Contre-exemple, encre `#808080` sur plaque `#808080/90`, mesuré :
 *
 *     pixel 0 → 1,20:1        pixel 128 → **1,00:1**  ← le vrai minimum        pixel 255 → 1,19:1
 *
 * Une règle par extrémité rendrait 1,19 et manquerait 1,00, c'est-à-dire un texte littéralement
 * invisible. Le balayage coûte 256 évaluations — moins que la règle qu'il remplace.
 *
 * ⚠ **256 GRIS SUFFISENT — ne pas « améliorer » en balayant les 16,7 millions de couleurs.**
 * C'est contre-intuitif, donc c'est écrit ici : le contraste ne dépend que de la LUMINANCE, la
 * plaque est affine en le pixel, et l'ensemble des luminances atteignables sur le cube 256³ est
 * exactement celui que la droite des gris parcourt. La 3-D n'ouvre aucune luminance nouvelle.
 * Mesuré sur quatre couples, dont deux construits pour la mettre en défaut : le pire écart vaut
 * **0,0010**, et il se produit au croisement — là où 1,0000 et 1,0010 sont mauvais de la même
 * façon (le détail est dans l'AC4 de TCK-458).
 *
 * ⚠ Le pire pixel n'est PAS une propriété de la plaque seule : pour `bg-accent/90` la pastille de
 * contrat le trouve en **255** en thème clair (encre quasi blanche) et en **0** en thème sombre
 * (encre quasi noire). Le même couple, deux extrémités opposées — raison de plus pour balayer.
 */
export function pireFondSurMedia(
  encre: Rvb,
  plaque: Rvb,
  alpha: number,
  alphaEncre = 1,
): { readonly ratio: number; readonly pixel: number; readonly fond: Rvb } {
  let pire = { ratio: Number.POSITIVE_INFINITY, pixel: -1, fond: plaque };
  for (let gris = 0; gris < 256; gris += 1) {
    const fond = composer(plaque, [gris, gris, gris], alpha);
    // Une encre elle-même translucide se compose sur CE fond-là et pas sur un autre : la
    // recomposer à chaque pas est la seule façon de ne pas mesurer une encre imaginaire.
    const posee = alphaEncre === 1 ? encre : composer(encre, fond, alphaEncre);
    const ratio = contraste(posee, fond);
    if (ratio < pire.ratio) pire = { ratio, pixel: gris, fond };
  }
  return pire;
}
