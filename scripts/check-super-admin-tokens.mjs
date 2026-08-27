#!/usr/bin/env node
/**
 * Garde de la CONSOLE SUPER-ADMIN : elle ne parle qu'un vocabulaire de couleur, celui des jetons
 * du design system. Aucune échelle Tailwind brute (`stone-700`, `amber-500`, `emerald-100`…),
 * aucun `bg-white`, aucune valeur arbitraire de couleur (`bg-[#f5f5f4]`), aucun reste du
 * dialecte `app-*`.
 *
 * ⚠⚠ **SON NOM DIT « SUPER-ADMIN » ; SON PÉRIMÈTRE NE L'EST PLUS.** Depuis TCK-358 elle garde
 * aussi `src/components/console`, `src/components/feedback`, `src/components/billing` et
 * `src/components/reporting` — des répertoires que la **console AGENCE** et, pour certains,
 * `/app` montent tout autant. C'est délibéré et c'est la raison d'être du ticket : le périmètre
 * n'est pas « la console super-admin », c'est **ce que la console super-admin monte réellement**,
 * primitives partagées comprises. Une pastille de statut rendue par les deux consoles ne peut pas
 * obéir à une règle de couleur d'un côté et pas de l'autre.
 *
 * **Conséquence pratique, à savoir AVANT d'être surpris** : cette garde peut rougir sur un
 * fichier que vous modifiez pour un écran d'AGENCE, sans que la console super-admin soit en
 * cause. Ce n'est pas un débordement, c'est le contrat. Le fichier n'est pas renommé — TCK-381
 * doit l'étendre à `/app` dans une vague ultérieure, et une PR en cours le référence par son nom
 * actuel ; *renommer un fichier que deux chantiers désignent coûte plus que de dire en cinq
 * lignes ce qu'il fait vraiment.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF — pourquoi cette garde existe
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-245 avait déjà fait ce travail et avait été marqué `done`. Son AC1 exigeait zéro classe de
 * palette brute — et le greppait sur `src/app/(super-admin)/**`, c'est-à-dire les *wrappers* de
 * page. L'écran, lui, vit dans les composants que ces wrappers montent. Relevé du 2026-08-26,
 * quatre mois plus tard, en rejouant l'AC verbatim :
 *
 *     src/app/(super-admin)/**  — le périmètre de l'AC1 ....................  11 (l'AC exigeait 0)
 *     src/components/admin/super/** .......................................  218
 *     src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx ...........   12
 *     src/components/super-admin/** .......................................    1
 *
 * Les 11 du périmètre audité n'y étaient même pas restées : elles étaient REVENUES, avec
 * `/agency-upgrade-requests` et `/super-admins`, deux pages créées après TCK-245. *Un `done`
 * mesuré une fois redevient faux sans que personne le voie* — c'est la même leçon que
 * `check-app-tokens.mjs`, payée une seconde fois sur un autre périmètre.
 *
 * Sur l'ensemble de la console au 2026-08-26 : 348 utilitaires de palette brute contre 109
 * jetons et 25 jetons `app-*`. **Trois vocabulaires**, dont six fichiers en mélangeaient deux.
 *
 * ⚠ Le tableau ci-dessus est la mesure du 2026-08-26 citée par TCK-358. **Re-mesuré le
 * 2026-08-27, au moment d'implémenter, les comptes avaient bougé** — TCK-357 (primitives
 * partagées) était passé entre-temps et avait absorbé une partie du travail :
 *
 *     src/app/(super-admin)/** ............................................   18
 *     src/components/admin/super/** .......................................   85
 *     src/components/layout/SuperAdmin{Shell,Sidebar,Topbar}.tsx ...........   16
 *     src/components/super-admin/** .......................................    9
 *                                                                    total   128
 *
 * Les deux relevés figurent ici ensemble, avec leurs dates : c'est ce qui permettra, la
 * prochaine fois, de savoir lequel est périmé plutôt que de le supposer juste.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE — et les TROIS trous qu'elle déclare
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle prouve, par lecture de texte et sans heuristique, qu'aucun fichier du PÉRIMÈTRE GARDÉ
 * n'écrit une classe de couleur hors jetons. Une classe Tailwind est un littéral : elle ne se
 * calcule pas, sous peine de ne pas être compilée du tout — c'est ce qui rend une lecture de
 * texte suffisante, et c'est pourquoi `` `bg-${famille}-200` `` n'est pas un faux négatif (cette
 * classe-là n'existe simplement pas dans le CSS produit).
 *
 * ⚠ **Cette section a affirmé, du 2026-08-27 au 2026-08-27, qu'il n'existait « pas de faux
 * négatif structurel — sauf le style inline ».** C'était faux, et faux dans le sens qui rassure :
 * la revue adverse de TCK-358 a passé quatre mutations au vert (`bg-[#fff]`, `text-[#a85332]`,
 * `bg-[rgb(255,0,0)]`, `border-[oklch(0.7_0.2_30)]`) — quatre formes qui COMPILENT réellement en
 * Tailwind v4. *Un cliquet qui déclare son unique trou et en a un deuxième est pire qu'un cliquet
 * qui n'en déclare aucun : on lui fait confiance.* Le contrôle D ci-dessous ferme celui-là. Les
 * trois qui restent sont énumérés ici, et ils y restent tant qu'ils ne sont pas fermés :
 *
 *   T1 · Le style INLINE — `style={{ backgroundColor: '#f5f5f4' }}`. Hors portée d'une garde de
 *        classes : il faudrait analyser les propriétés CSS d'un objet JS, ce qui n'est plus une
 *        lecture de texte. Non compté, donc non gardé — c'est le trou déclaré, pas mesuré.
 *   T2 · Le PÉRIMÈTRE lui-même — cf. la section suivante, et le compte du « reste non gardé »
 *        que cette garde imprime à chaque exécution pour que ce trou ne puisse plus grandir en
 *        silence.
 *   T3 · La JUSTESSE du rendu. Un `bg-card` posé là où il fallait `bg-muted` laisse cette garde
 *        verte. C'est un plancher de vocabulaire, pas une revue de design.
 *
 * **Les commentaires ne sont pas retirés avant analyse**, délibérément et pour la même raison
 * que `check-app-tokens.mjs` : un docblock qui montre `bg-stone-100` est exactement la
 * documentation périmée qui fait repousser le motif. Le récit d'une migration s'écrit en toutes
 * lettres (« pierre 100 »), pas en classes copiables.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * T2 — LE PÉRIMÈTRE N'EST PAS L'ÉCRAN, et c'est le défaut de TCK-245 d'un cran plus haut
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un périmètre est une liste de RÉPERTOIRES ; un écran est un GRAPHE DE RENDU. Les deux ne
 * coïncident jamais tout seuls, et la première version de cette garde en a fait la démonstration
 * le jour même de sa naissance : elle sortait en 0 pendant que `/super-admin/payouts` rendait six
 * pastilles de statut en ambre, bleu, violet, émeraude, rouge et neutre, parce que la chaîne
 * `app/(super-admin)/super-admin/payouts/page.tsx → AdminPayoutsClient → PayoutTable` sort du
 * quatrième répertoire à son deuxième maillon. Idem pour `kyc-components.tsx`, importé par
 * `admin/super/agency-detail.tsx` (gardé, lui) et portant un `text-white`.
 *
 * D'où DEUX mécanismes, et non un :
 *
 *   1. `PERIMETRES` — ce qui est GARDÉ, c'est-à-dire ce qui doit être à zéro. Il s'étend au fur
 *      et à mesure qu'on porte des fichiers ; il ne se devine pas.
 *   2. `resteNonGarde()` — ce qui est seulement MESURÉ : la clôture des imports depuis
 *      `src/app/(super-admin)/**`, moins le périmètre gardé. Ce sont les fichiers que la console
 *      rend réellement et que la garde ne peut pas exiger à zéro aujourd'hui, parce qu'ils sont
 *      des primitives partagées avec le reste du produit (`ui/`, `forms/`, `files/`…). Les
 *      porter demande de redessiner ces primitives pour TOUS les écrans : c'est TCK-384, pas
 *      celui-ci.
 *
 * Le second est un CLIQUET : son compte est écrit ci-dessous, la garde échoue s'il MONTE. C'est
 * ce qui empêche « le périmètre est quatre répertoires » de redevenir un secret. *Une garde dont
 * le chiffre de référence est plus petit que le défaut réel de l'écran rassure sur une mesure qui
 * n'est pas celle de l'écran* — alors elle imprime les deux.
 *
 * Usage :
 *   node scripts/check-super-admin-tokens.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-super-admin-tokens.mjs --report   # + le détail fichier par fichier
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WEB_SRC = join(ROOT, 'takussan-web', 'src');

/**
 * LE PÉRIMÈTRE GARDÉ — ce qui DOIT être à zéro.
 *
 * Trois formes, et le choix entre elles se fait sur une question et une seule : *ce chemin
 * sert-il UNIQUEMENT la console super-admin ?*
 *
 *   `dir`   — le répertoire entier ne sert que la console, ou bien il est déjà propre en entier.
 *   `glob`  — un préfixe de nom dans un répertoire partagé. `src/components/layout/` sert aussi
 *             le shell agence ; seuls les `SuperAdmin*` y entrent, et un quatrième né demain est
 *             repris automatiquement — c'est ce que la forme `glob` a de mieux qu'une liste de
 *             trois fichiers nommés.
 *   `file`  — un fichier précis d'un répertoire partagé, quand ses voisins ne sont PAS rendus
 *             par la console. `src/components/kyc/` est le cas : `kyc-components.tsx` est monté
 *             par `admin/super/agency-detail.tsx`, mais `KycUploader.tsx` ne l'est que par les
 *             trois assistants d'onboarding (vérifié par `grep` le 2026-08-27). Mettre le
 *             répertoire entier aurait fait rougir la garde sur un fichier que la console ne
 *             rend pas — et la réponse humaine à ce rouge-là est une exception, pas un correctif.
 *
 * ⚠ La forme `file` a la faiblesse que la forme `glob` a fermée : un fichier neuf déposé à côté
 * n'est PAS couvert. C'est `resteNonGarde()` qui le rattrape — il apparaîtra dans le reste, et
 * le cliquet montera.
 *
 * QUATRE répertoires sont entrés en entier avec TCK-358, et deux d'entre eux ne sont PAS des
 * répertoires de console — cf. l'avertissement en tête de fichier :
 *
 *   `src/components/console`  — les primitives partagées de TCK-357 (`StatusBadge`, `DataState`,
 *                               `EmptyState`…), montées par la console super-admin ET par la
 *                               console agence. Son CODE était déjà propre ; seuls trois
 *                               docblocks citaient des classes brutes, et c'est ce qui l'avait
 *                               tenu dehors — la garde lit les commentaires. Réécrits en toutes
 *                               lettres le 2026-08-27, le répertoire est entré sans qu'une ligne
 *                               de rendu bouge.
 *   `src/components/feedback` — même histoire, un seul docblock (`ErrorState`).
 *
 * `src/components/billing` et `src/components/reporting` entrent aussi :
 * `billing` parce que `AdminPayoutsClient`/`AdminPlansClient`/`AdminAgencySubscriptionPanel` y
 * vivent et que ses cinq autres fichiers sont propres ; `reporting` parce qu'il était gardé par
 * RIEN (constat du vérificateur de TCK-361) alors que `/super-admin/reports` le monte — et qu'il
 * était déjà à zéro, mesuré le 2026-08-27. *Un répertoire déjà propre est le moins cher à mettre
 * sous cliquet, et c'est le seul moment où ça ne coûte rien.*
 */
const PERIMETRES = [
  { type: 'dir', chemin: join(WEB_SRC, 'app', '(super-admin)') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'admin', 'super') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'super-admin') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'billing') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'reporting') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'console') },
  { type: 'dir', chemin: join(WEB_SRC, 'components', 'feedback') },
  { type: 'glob', dir: join(WEB_SRC, 'components', 'layout'), prefixe: 'SuperAdmin' },
  { type: 'file', chemin: join(WEB_SRC, 'components', 'kyc', 'kyc-components.tsx') },
];

/**
 * Les préfixes d'utilitaires de couleur de Tailwind v4 — liste délibérément LARGE.
 *
 * C'est la leçon de l'AC2 de TCK-244, qui cherchait `stroke-` quand le code écrivait `fill-` :
 * une palette hors charte a survécu à un caractère près. Un préfixe manquant ici est un trou
 * muet — la garde reste verte et la palette brute revit sous un nom d'utilitaire voisin.
 */
const PREFIXES = [
  'bg', 'text', 'border', 'ring', 'divide', 'fill', 'stroke', 'placeholder',
  'outline', 'shadow', 'from', 'via', 'to', 'caret', 'accent', 'decoration',
];

/**
 * Les familles de l'échelle Tailwind par défaut, TOUTES.
 *
 * L'AC1 de TCK-358 n'en nommait que dix (`stone|amber|emerald|red|green|blue|slate|gray|zinc|
 * neutral`) — celles que la console utilisait ce jour-là. Une garde qui recopierait cette liste
 * laisserait passer le premier `bg-teal-100` venu. La liste ci-dessous est celle de Tailwind,
 * pas celle du relevé.
 */
const FAMILLES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

const P = PREFIXES.join('|');

/** A · échelle numérotée : `bg-stone-100`, `hover:text-amber-700`, `ring-amber-500/30`. */
const ECHELLE = new RegExp(`\\b(?:${P})-(?:${FAMILLES.join('|')})-[0-9]{2,3}\\b`, 'g');

/**
 * B · les couleurs NOMMÉES sans échelle : `bg-white`, `text-black`, `border-white/10`.
 *
 * Elles échappent au motif A faute de chiffre, et c'est par elles que le blanc en dur revenait :
 * 14 `bg-white` dans les périmètres au 2026-08-27, tous des surfaces qui voulaient dire `--card`.
 * Le blanc FONCTIONNEL — le fond d'un QR code, qui doit rester blanc en thème sombre — passe par
 * la classe `.qr-surface` de `globals.css`, nommée pour ce qu'elle fait.
 */
const NOMMEES = new RegExp(`\\b(?:${P})-(?:white|black)\\b`, 'g');

/**
 * C · le dialecte `app-*`, que `check-app-tokens.mjs` garde déjà sur `src` entier.
 *
 * Le doublon est délibéré et il coûte trois lignes : si cette garde-ci était la seule à tourner
 * un jour (exécution ciblée, bissection), la console ne perdrait pas son contrôle le plus
 * ancien. Deux gardes qui se recouvrent valent mieux qu'un trou entre elles.
 */
const APP_DIALECTE = new RegExp(`\\b(?:${P})-app-[a-z0-9-]+\\b`, 'g');

/**
 * Les 148 couleurs nommées de CSS — de la DONNÉE, pas une heuristique.
 *
 * `bg-[red]`, `text-[gold]`, `shadow-[0_1px_2px_teal]` compilent tous, et aucun ne porte de `#`
 * ni de fonction de couleur : sans cette liste, le contrôle D aurait le même genre de trou d'un
 * caractère que l'AC2 de TCK-244. Elle est recopiée de la spécification CSS Color 4, pas devinée.
 */
const COULEURS_CSS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue '
  + 'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk '
  + 'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki '
  + 'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen '
  + 'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue '
  + 'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite '
  + 'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki '
  + 'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan '
  + 'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen '
  + 'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen '
  + 'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen '
  + 'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream '
  + 'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid '
  + 'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum '
  + 'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown '
  + 'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen '
  + 'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
).split(' ');

/**
 * D · la VALEUR ARBITRAIRE porteuse d'une couleur LITTÉRALE : `bg-[#f5f5f4]`, `text-[#a85332]`,
 * `bg-[rgb(255,0,0)]`, `border-[oklch(0.7_0.2_30)]`, `shadow-[0_0_40px_rgba(0,0,0,.04)]`,
 * `bg-[red]`.
 *
 * Le mot LITTÉRALE porte tout le contrôle : `bg-[color-mix(in_srgb,var(--chart-1)_50%,transparent)]`
 * est accepté, parce qu'il ne décide aucune couleur — il en lit une. Cf. le docblock de
 * `D_MOTIFS`, qui raconte le faux positif que cette distinction a coûté.
 *
 * ⚠ **Ce contrôle est né d'un trou, pas d'une prévoyance.** Les quatre premières formes
 * ci-dessus ont été passées au vert par la revue adverse de TCK-358, sur une garde dont l'en-tête
 * affirmait n'avoir qu'un seul faux négatif. Elles compilent toutes : Tailwind v4 accepte
 * n'importe quelle valeur CSS entre crochets. Une couleur décidée là est décidée hors de
 * `globals.css` exactement comme un `bg-stone-100`, et elle est *plus* difficile à retrouver.
 *
 * Ce qu'il ne refuse PAS, et c'est voulu : `bg-[var(--sidebar-accent)]`, `w-[42ch]`,
 * `text-[13px]`, `shadow-[0_1px_2px_0_var(--ombre)]`. Une valeur arbitraire n'est pas un défaut ;
 * une COULEUR LITTÉRALE dans une valeur arbitraire en est un. Un `var(--…)` est une lecture de
 * jeton — précisément ce que la garde veut voir.
 *
 * Les bornes ne sont pas `\b` : dans une valeur arbitraire les séparateurs sont des `_`
 * (`shadow-[0_0_0_1px_teal]`), et `\b` ne coupe pas entre `_` et une lettre. La classe exclue de
 * part et d'autre est donc `[a-zA-Z0-9-]`, ce qui laisse `_teal` visible tout en protégeant les
 * noms de variables (`var(--linen)` : le `-` qui précède bloque).
 */
/**
 * ⚠ `color-mix` n'est PAS dans cette liste, et son absence est le correctif d'un faux positif
 * mesuré — signalé par l'agent de TCK-361 le 2026-08-27, reproduit en extrayant la regex de ce
 * fichier même.
 *
 * **`color-mix()` est un CONTENEUR, pas une couleur.** Sa littéralité dépend entièrement de ses
 * arguments : `color-mix(in srgb, var(--chart-1) 50%, transparent)` ne décide aucune couleur, il
 * en LIT une et l'éclaircit — c'est exactement ce que `CohortHeatmap` calcule pour son échelle de
 * chaleur. Le nom de fonction nu tirait avant que le motif ait regardé l'intérieur, donc
 * l'exemption `var(--…)` ne pouvait jamais s'appliquer.
 *
 * Rien n'est perdu : un littéral NOYÉ dans un mix reste attrapé par les deux autres motifs —
 * `color-mix(…,#fff,…)` par l'hexadécimal, `color-mix(…,red,blue)` par les couleurs nommées,
 * `color-mix(…,rgb(1,2,3),…)` par la fonction imbriquée. Les quatre cas sont dans `EPREUVE`.
 *
 * `color(` RESTE, lui : `color(display-p3 1 0 0)` est une vraie couleur littérale.
 *
 * *Un contrôle qui refuse du code correct ne se fait pas corriger, il se fait contourner* — et la
 * sortie de secours la moins chère devant ce refus-ci aurait été de réinjecter un hexadécimal,
 * précisément ce que le contrôle D existe pour empêcher.
 */
const D_MOTIFS = [
  '#[0-9a-fA-F]{3,8}',
  '(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(',
  `(?<![a-zA-Z0-9-])(?:${COULEURS_CSS.join('|')})(?![a-zA-Z0-9-])`,
];
const ARBITRAIRE = new RegExp(
  `\\b(?:${P})-\\[[^\\]]*(?:${D_MOTIFS.join('|')})[^\\]]*\\]`,
  'g',
);

const CONTROLES = [
  ['A', 'échelle Tailwind brute (bg-stone-100, text-amber-700…)', ECHELLE],
  ['B', 'couleur nommée en dur (bg-white, text-black…)', NOMMEES],
  ['C', 'dialecte app-* (éteint par TCK-372)', APP_DIALECTE],
  ['D', 'couleur littérale en valeur arbitraire (bg-[#f5f5f4], bg-[rgb(…)], text-[red]…)', ARBITRAIRE],
];


/**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * L'AUTO-ÉPREUVE — elle tourne à CHAQUE exécution, avant la moindre lecture de fichier
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le mode d'échec d'une garde à expressions régulières n'est pas de rougir à tort : c'est de
 * cesser de matcher. Un préfixe retiré de `PREFIXES`, une famille perdue, une parenthèse
 * déplacée dans le contrôle D — et la garde sort en 0 sur un dépôt qu'elle ne regarde plus.
 * *Un vert n'a de valeur que si un rouge reste possible*, et rien dans la sortie ne distingue
 * les deux.
 *
 * Le tableau ci-dessous est donc la garde de la garde : chaque forme y est marquée `true` (doit
 * être vue) ou `false` (doit être ignorée). Il n'est pas décoratif — **il est la liste exacte des
 * 20 mutations passées sur cette garde au 2026-08-27**, dont les six que sa version d'origine
 * laissait au vert (`bg-[#fff]`, `text-[#a85332]`, `bg-[rgb(…)]`, `border-[oklch(…)]`, plus
 * `bg-[red]` et une ombre à hexadécimal noyé). Les lignes `false` comptent autant que les
 * autres : une garde qui refuse `bg-[var(--jeton)]` ou `text-[13px]` devient une garde qu'on
 * contourne, et une garde qu'on contourne ne garde rien.
 *
 * Toute forme neuve essayée à la main VIENT ICI. C'est ce qui empêche la prochaine revue adverse
 * de redécouvrir un trou déjà trouvé une fois.
 */
const EPREUVE = [
  // A · l'échelle numérotée.
  ['bg-stone-100', true], ['hover:text-amber-700', true], ['ring-amber-500/30', true],
  ['dark:bg-stone-800', true], ['bg-teal-100', true], ['fill-rose-500', true],
  ['decoration-fuchsia-400', true], ['bg-lime-500', true],
  // B · les couleurs nommées sans échelle.
  ['bg-white', true], ['text-black', true], ['border-white/10', true], ['bg-white/80', true],
  // C · le dialecte éteint.
  ['bg-app-surface', true], ['text-app-ink', true],
  // D · la couleur littérale en valeur arbitraire — les six formes qui passaient au vert.
  ['bg-[#fff]', true], ['text-[#a85332]', true], ['bg-[rgb(255,0,0)]', true],
  ['border-[oklch(0.7_0.2_30)]', true], ['bg-[red]', true], ['shadow-[0_1px_2px_#0003]', true],
  ['bg-[color-mix(in_oklch,var(--primary)_50%,white)]', true],
  // `color-mix` — un CONTENEUR : ces quatre lignes tiennent la frontière, cf. le docblock de
  // D_MOTIFS. Elles viennent d'un faux positif réel, pas d'une prévoyance.
  ['bg-[color-mix(in_srgb,#fff_50%,transparent)]', true],
  ['bg-[color-mix(in_srgb,red_50%,blue)]', true],
  ['bg-[color-mix(in_srgb,rgb(1,2,3)_50%,transparent)]', true],
  ['bg-[color(display-p3_1_0_0)]', true],
  ['dark:hover:bg-[#1a1a1a]/70', true], ['decoration-[lightseagreen]', true],
  ['shadow-[0_0_40px_0_rgba(31,27,23,0.04)]', true],
  // Ce qui doit rester INVISIBLE — la moitié qu'on oublie de vérifier.
  ['bg-[color-mix(in_srgb,var(--chart-1)_50%,transparent)]', false],
  ['bg-[color-mix(in_srgb,var(--a)_50%,var(--b))]', false],
  ['bg-[var(--sidebar-accent)]', false], ['text-[13px]', false], ['w-[42ch]', false],
  ['shadow-[0_1px_2px_var(--ombre)]', false], ['bg-[url(/fond.svg)]', false],
  ['grid-cols-[repeat(3,minmax(0,1fr))]', false], ['bg-card', false], ['text-muted-foreground', false],
  ['bg-warning/10', false], ['ring-border', false], ['bg-primary-foreground', false],
  // Un nom de variable CSS qui CONTIENT une couleur nommée : `--linen` ne doit pas rougir.
  ['bg-[var(--linen)]', false], ['text-[var(--tan-fonce)]', false],
  // Une classe calculée ne compile pas : la garde n'a pas à la voir (trou déclaré, pas un défaut).
  ['bg-${famille}-200', false],
];

function autoEpreuve() {
  const echecs = [];
  for (const [forme, attendu] of EPREUVE) {
    const vu = CONTROLES.some(([, , motif]) => { motif.lastIndex = 0; return motif.test(forme); });
    if (vu !== attendu) echecs.push([forme, attendu, vu]);
  }
  if (echecs.length === 0) return;
  console.error(
    '✗ AUTO-ÉPREUVE EN ÉCHEC — les contrôles de cette garde ne font plus ce qu\'ils disent.\n',
  );
  console.error('  La garde ne mesure RIEN tant que ceci n\'est pas corrigé ; un vert de sa part');
  console.error('  serait un vert de détecteur cassé, pas un vert de dépôt propre.\n');
  for (const [forme, attendu, vu] of echecs) {
    console.error(`      ${forme}  —  attendu ${attendu ? 'ATTRAPÉ' : 'IGNORÉ'}, obtenu ${vu ? 'attrapé' : 'ignoré'}`);
  }
  process.exit(1);
}

autoEpreuve();

const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/;

function fichiersDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === 'node_modules') continue;
      fichiersDe(chemin, acc);
      continue;
    }
    if (EXTENSIONS.test(entree)) acc.push(chemin);
  }
  return acc;
}

const manquants = [];
const tous = [];

for (const p of PERIMETRES) {
  if (p.type === 'dir') {
    if (!existsSync(p.chemin)) { manquants.push(relative(ROOT, p.chemin)); continue; }
    fichiersDe(p.chemin, tous);
  } else if (p.type === 'file') {
    // Un périmètre d'UN fichier disparaît sans bruit au premier renommage : sans ce contrôle, la
    // garde perdrait sa portée sur `kyc-components.tsx` en restant verte.
    if (!existsSync(p.chemin)) { manquants.push(relative(ROOT, p.chemin)); continue; }
    tous.push(p.chemin);
  } else {
    if (!existsSync(p.dir)) { manquants.push(relative(ROOT, p.dir)); continue; }
    const trouves = readdirSync(p.dir).filter(
      (e) => e.startsWith(p.prefixe) && EXTENSIONS.test(e),
    );
    // Un périmètre défini par un préfixe de nom peut se vider sans erreur : le jour où les trois
    // `SuperAdmin*.tsx` sont renommés, cette garde perdrait un pan de sa portée en silence.
    if (trouves.length === 0) manquants.push(`${relative(ROOT, p.dir)}/${p.prefixe}*`);
    for (const e of trouves) tous.push(join(p.dir, e));
  }
}

if (manquants.length > 0) {
  console.error('✗ périmètre introuvable — la garde n\'aurait rien vérifié dessus :');
  for (const m of manquants) console.error(`    ${m}`);
  console.error('  Si le chemin a été renommé ou supprimé, METTRE À JOUR `PERIMETRES`.');
  process.exit(1);
}

if (tous.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : la forme de
  // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
  console.error('✗ aucun fichier lisible dans les périmètres — la garde n\'aurait rien vérifié.');
  process.exit(1);
}

const estTest = (chemin) => chemin.split(/[\\/]/).includes('__tests__');

// Les tests ne sont PAS analysés : ils peuvent légitimement asserter la classe d'un composant
// tiers, et l'AC1 de TCK-358 les exclut explicitement.
const analyses = tous.filter((c) => !estTest(c));

/** Compte les trouvailles de chaque contrôle sur une liste de fichiers. */
function analyser(chemins) {
  const par = new Map(CONTROLES.map(([id]) => [id, []]));
  for (const chemin of chemins) {
    const rel = relative(ROOT, chemin);
    readFileSync(chemin, 'utf8').split('\n').forEach((ligne, i) => {
      for (const [id, , motif] of CONTROLES) {
        motif.lastIndex = 0;
        for (const m of ligne.matchAll(motif)) par.get(id).push([rel, i + 1, m[0]]);
      }
    });
  }
  return par;
}

const trouvailles = analyser(analyses);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// T2 · le RESTE NON GARDÉ — ce que la console rend et que le périmètre ne couvre pas
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * La clôture transitive des imports depuis `src/app/(super-admin)/**`.
 *
 * C'est une approximation, et elle l'est dans le sens PRUDENT : un import qu'elle ne résout pas
 * (chemin calculé, ré-export exotique, `next/dynamic` avec une expression) sort de la clôture,
 * donc du compte — la garde ne peut pas rougir à cause d'elle, seulement manquer quelque chose.
 * *Une approximation qui se trompe toujours du même côté n'est pas un aléa : c'est un plancher.*
 */
const EXT_IMPORT = ['.tsx', '.ts', '.jsx', '.js'];

function resoudre(spec, depuis) {
  let base;
  if (spec.startsWith('@/')) base = join(WEB_SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null; // paquet npm : hors du dépôt, donc hors sujet.
  for (const e of EXT_IMPORT) if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const e of EXT_IMPORT) {
      const idx = join(base, `index${e}`);
      if (existsSync(idx)) return idx;
    }
    return null;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

function clotureDeRendu() {
  const racine = join(WEB_SRC, 'app', '(super-admin)');
  const depart = fichiersDe(racine).filter((f) => /\.(tsx?|jsx?)$/.test(f));
  const vus = new Set(depart);
  const file = [...depart];
  while (file.length > 0) {
    const f = file.pop();
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = resoudre(m[1] ?? m[2], f);
      if (r && !vus.has(r)) { vus.add(r); file.push(r); }
    }
  }
  return [...vus].filter((f) => !estTest(f));
}

/**
 * LE CLIQUET DU RESTE — mesuré le 2026-08-27, après TCK-358.
 *
 * Ce sont des défauts de couleur RÉELLEMENT RENDUS par la console, dans des fichiers que le
 * périmètre gardé ne couvre pas parce qu'ils sont partagés avec tout le produit :
 * `ui/toast.tsx`, `ui/sheet.tsx`, `ui/dropdown-menu.tsx`, `ui/dialog.tsx`, `ui/warning-banner.tsx`,
 * `forms/FormError.tsx`, `forms/FormSuccess.tsx`, `files/PdfViewer.tsx`, `layout/UserMenu.tsx`,
 * `shared/LanguageSwitcher.tsx`.
 *
 * ⚠ Ce plafond valait 54 le 2026-08-27 au matin. Il est à 46 le même jour : les HUIT occurrences
 * de `console/` et `feedback/` n'étaient pas du rendu mais des DOCBLOCKS, et les réécrire en
 * toutes lettres a fait passer ces deux répertoires du reste au périmètre gardé. *Un chiffre qui
 * descend doit dire par quoi, sinon la prochaine baisse ressemblera à une érosion.*
 *
 * Ces deux répertoires sont donc comptés dans le PÉRIMÈTRE GARDÉ et nulle part ailleurs : un
 * fichier ne peut pas être dans les deux à la fois, `resteNonGarde()` retirant le périmètre de la
 * clôture avant de compter. Les 46 restants sont bien du rendu.
 *
 * **Les porter demande de redessiner des primitives montées par les pages publiques et par
 * `/app` : c'est TCK-384, et le faire ici l'aurait fait sans revue de ces écrans-là.**
 *
 * Le nombre ci-dessous n'est PAS un objectif ni une tolérance : c'est un plafond. La garde
 * échoue s'il monte — donc un nouveau `bg-emerald-50` déposé dans `ui/` est refusé même si aucun
 * périmètre gardé ne le contient. Quand TCK-384 le fait descendre, la ligne se corrige à la main
 * avec sa date, et cette phrase-ci reste.
 */
const RESTE_PLAFOND = 46;

const reste = clotureDeRendu().filter((f) => !tous.includes(f));
const resteTrouvailles = analyser(reste);
const resteTotal = CONTROLES.reduce((n, [id]) => n + resteTrouvailles.get(id).length, 0);

if (REPORT) {
  console.log(
    `console super-admin — ${analyses.length} fichiers GARDÉS `
    + `(${tous.length - analyses.length} fichiers de test écartés)\n`,
  );
  for (const [id, libelle] of CONTROLES) {
    const hits = trouvailles.get(id);
    console.log(`  ${id} · ${libelle} : ${hits.length}`);
    for (const [f, l, m] of hits) console.log(`      ✗ ${f}:${l}  ${m}`);
  }
  console.log(
    `\nreste NON GARDÉ — ${reste.length} fichiers de la clôture de rendu, hors périmètre :`,
  );
  for (const [id, libelle] of CONTROLES) {
    const hits = resteTrouvailles.get(id);
    if (hits.length === 0) continue;
    console.log(`  ${id} · ${libelle} : ${hits.length}`);
    for (const [f, l, m] of hits) console.log(`      · ${f}:${l}  ${m}`);
  }
  console.log(`  total ${resteTotal} (plafond ${RESTE_PLAFOND}) — TCK-384\n`);
}

const total = CONTROLES.reduce((n, [id]) => n + trouvailles.get(id).length, 0);

let echec = false;

if (total > 0) {
  echec = true;
  console.error(`✗ ${total} classe(s) de couleur hors jetons dans la console super-admin :\n`);
  for (const [id, libelle] of CONTROLES) {
    const hits = trouvailles.get(id);
    if (hits.length === 0) continue;
    console.error(`  ${id} · ${libelle} — ${hits.length} :`);
    for (const [f, l, m] of hits) console.error(`      ${f}:${l}  ${m}`);
    console.error('');
  }
  console.error('  Traduire par RÔLE, jamais par teinte proche :');
  console.error('      surface de carte ............ bg-card          (ex-bg-white)');
  console.error('      surface secondaire .......... bg-muted         (ex-bg-stone-50|100|200)');
  console.error('      bordure / anneau ............ border-border · ring-border');
  console.error('      texte principal ............. text-foreground  (ex-text-stone-900|950)');
  console.error('      texte secondaire ............ text-muted-foreground');
  console.error('      accent de marque ............ text-primary · bg-primary');
  console.error('      avertissement ............... WarningBanner · bg-warning/10 · text-warning');
  console.error('      erreur ...................... ErrorState · text-destructive');
  console.error('      pastille de statut .......... <StatusBadge tone="…"> — jamais une classe');
  console.error('  Surface sombre permanente (topbar / sidebar) : la classe `dark` plus les jetons');
  console.error('  `--sidebar-*`, cf. le docblock de `SuperAdminSidebar`.');
  console.error('  Blanc FONCTIONNEL (fond de QR code) : la classe `.qr-surface` de `globals.css`.');
  console.error('  Valeur arbitraire (contrôle D) : une couleur ne s\'écrit pas entre crochets.');
  console.error('  `bg-[var(--jeton)]` est accepté — c\'est une LECTURE de jeton, pas une décision.');
  console.error('');
}

if (resteTotal > RESTE_PLAFOND) {
  echec = true;
  console.error(
    `✗ le RESTE NON GARDÉ est monté : ${resteTotal} > ${RESTE_PLAFOND}.\n`,
  );
  console.error('  Ces fichiers sont rendus par la console sans être dans `PERIMETRES` — ils sont');
  console.error('  partagés avec le reste du produit (cf. TCK-384). Le plafond ne se relève pas :');
  console.error('  soit la couleur neuve passe par un jeton, soit le fichier entre dans un');
  console.error('  périmètre gardé et y passe à zéro. Le détail : --report.\n');
  for (const [id] of CONTROLES) {
    for (const [f, l, m] of resteTrouvailles.get(id)) console.error(`      ${id} ${f}:${l}  ${m}`);
  }
  console.error('');
}

if (echec) process.exit(1);

console.log(
  `✓ console super-admin : 0 classe de couleur hors jetons sur ${analyses.length} fichiers `
  + 'gardés (contre 128 le 2026-08-27, avant TCK-358).',
);
console.log(
  `  RESTE NON GARDÉ : ${resteTotal} défaut(s) (plafond ${RESTE_PLAFOND}) dans ${reste.length} `
  + 'fichiers que la console rend RÉELLEMENT sans qu\'un périmètre les couvre —',
);
console.log(
  '  primitives partagées avec `/app` et le site public (TCK-384). Ce nombre est un PLAFOND,',
);
console.log('  pas une tolérance : la garde échoue s\'il monte. Détail : --report.');
console.log(
  '  PORTÉE — plancher de VOCABULAIRE, pas revue de design : un `bg-card` posé là où il',
);
console.log(
  '  fallait `bg-muted` laisse cette garde verte. Elle prouve seulement qu\'aucune couleur',
);
console.log('  n\'est décidée en dehors de `globals.css`. Trous déclarés : T1 style inline,');
console.log('  T2 périmètre (ci-dessus, sous cliquet), T3 justesse du rendu.');
process.exit(0);
