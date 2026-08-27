#!/usr/bin/env node
/**
 * Garde de la CONSOLE SUPER-ADMIN : elle ne parle qu'un vocabulaire de couleur, celui des jetons
 * du design system. Aucune échelle Tailwind brute (`stone-700`, `amber-500`, `emerald-100`…),
 * aucun `bg-white`, aucune valeur arbitraire de couleur (`bg-[#f5f5f4]`), aucun reste du
 * dialecte `app-*`.
 *
 * ⚠⚠ **SON NOM DIT « SUPER-ADMIN » ; ELLE GARDE LES TROIS ESPACES DU PRODUIT.** Depuis TCK-381
 * elle porte DEUX espaces, chacun avec son périmètre exigé à zéro et son cliquet propre :
 *
 *     ESPACES[0]  console super-admin  — TCK-358, et par ricochet la console AGENCE : le
 *                 périmètre inclut `src/components/console`, `feedback`, `billing` et
 *                 `reporting`, des répertoires que les DEUX consoles montent.
 *     ESPACES[1]  tableau de bord `/app` — TCK-381. Vingt-huit répertoires de `src/components`
 *                 plus les 46 pages de `src/app/(dashboard)/app`.
 *
 * C'est délibéré, et c'est la raison d'être des deux tickets : le périmètre n'est pas « un
 * répertoire de routes », c'est **ce que l'écran monte réellement**, primitives partagées
 * comprises. Une pastille de statut rendue par les trois espaces ne peut pas obéir à une règle de
 * couleur d'un côté et pas de l'autre.
 *
 * **Conséquence pratique, à savoir AVANT d'être surpris** : cette garde peut rougir sur un
 * fichier que vous modifiez pour un écran d'AGENCE ou de `/app`, sans que la console super-admin
 * soit en cause. Ce n'est pas un débordement, c'est le contrat.
 *
 * **Le fichier n'est PAS renommé, et c'est une décision, pas un oubli** : plusieurs branches et
 * une PR le désignent par ce nom. *Renommer un fichier que trois chantiers désignent coûte plus
 * que de dire en dix lignes ce qu'il fait vraiment.* Ce qui a été corrigé à la place, c'est
 * l'en-tête : un nom faux qui s'explique coûte moins qu'un nom juste qui casse trois branches.
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
 * LE MOTIF, SECONDE OCCURRENCE — `/app`, et un relevé de ticket faux d'un facteur 2,7
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-381 citait, pour la clôture d'import de `/app` : **259 fichiers, 45 porteurs, 393
 * occurrences**. Re-mesuré le 2026-08-27 avant d'implémenter, sur la même définition de clôture
 * (départ = les 51 fichiers de route de `src/app/(dashboard)/app`, imports `from '…'` et
 * `import('…')` suivis, tests écartés) :
 *
 *     fichiers de la clôture ............................................  403  (le ticket : 259)
 *     fichiers portant au moins une couleur brute .......................  119  (le ticket :  45)
 *     occurrences .......................................................  1070 (le ticket : 393)
 *
 * Par famille : pierre 409 · blanc 179 · ambre 121 · rouge 89 · émeraude 89 · bleu 29 · orange 24
 * · ardoise 24 · gris 18 · rose 17 · violet 16 · ciel 13 · noir 9 · vert 9 · le reste 24.
 *
 * *Un relevé de ticket est une hypothèse, pas une mesure* — et celui-ci se trompait dans le sens
 * qui rassure, d'un facteur 2,7. Le dimensionnement du travail en dépendait entièrement.
 *
 * Ce que TCK-381 porte à ZÉRO : les 1000 occurrences des 103 fichiers de la clôture qui
 * appartiennent aux domaines de `/app`. Ce qu'il laisse au cliquet : 56 occurrences dans 12
 * fichiers de primitives partagées avec le site public (`ui/`, `forms/`, `layout/`, `shared/`,
 * `property/`) — les mêmes que le cliquet super-admin, pour la même raison (TCK-384). Les 8
 * dernières sont dans `components/console` et `components/feedback`, que TCK-358 porte de son
 * côté et que ce ticket ne touche pas.
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
 *   T4 · Les PRÉFIXES sont énumérés. La liste est large — vingt-sept entrées depuis TCK-381, qui
 *        y a ajouté les huit côtés de bordure, les deux axes de séparateur et `ring-offset` après
 *        les avoir vus passer au vert — mais large n'est pas exhaustif. Un utilitaire de couleur
 *        que Tailwind publierait demain serait invisible jusqu'à ce qu'on l'ajoute.
 *   T5 · La clôture part de la racine de ROUTES d'un espace, pas des layouts qui l'enveloppent.
 *        `src/app/layout.tsx` rend sur `/app`, mais aussi sur le site public : le prendre pour
 *        racine ferait entrer le produit entier dans la clôture de `/app`. Trois surfaces
 *        échappent donc au compte — cf. le commentaire sous `PERIMETRES_APP`.
 *   T6 · **Cette garde ne se défend pas contre une réécriture délibérée d'elle-même.** Mesuré par
 *        mutation le 2026-08-27 : retirer un répertoire du périmètre est attrapé (témoins) ;
 *        retirer le répertoire ET son témoin est attrapé (plancher de fichiers) ; retirer le
 *        répertoire, son témoin ET baisser le plancher **passe**. Trois gestes dans un seul
 *        commit. Il n'y a pas de quatrième cran à ajouter qui ne soit pas franchissable de la même
 *        façon : *un contrôle qui nomme ce qu'il surveille se désarme en retirant le nom.* À
 *        partir de là, la défense est la revue du diff — et c'est pour la rendre possible que ces
 *        trois crans existent : ils obligent la manœuvre à être VISIBLE.
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
import { dirname, join, relative, resolve, sep } from 'node:path';
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
  // ⚠ AJOUTÉS PAR TCK-381, et pas par prudence : par MUTATION. Les huit côtés de bordure, les
  // deux axes de séparateur et l'anneau de décalage sont des utilitaires de COULEUR à part
  // entière, et aucun n'était vu — `border-t-stone-300`, `divide-x-red-500` et
  // `ring-offset-stone-200` sortaient tous en 0 sur la version de TCK-358, alors que
  // `inset-ring-stone-300` et `text-shadow-stone-300`, eux, étaient bien attrapés (le motif y
  // retrouve `ring-` / `shadow-` après un tiret, qui est une frontière de mot).
  //
  // *C'est exactement le trou d'un caractère que l'AC2 de TCK-244 avait déjà payé* — `fill-` là
  // où on cherchait `stroke-`. La liste est LARGE, elle n'est pas exhaustive, et T4 le dit.
  'border-t', 'border-r', 'border-b', 'border-l', 'border-x', 'border-y',
  'border-s', 'border-e', 'divide-x', 'divide-y', 'ring-offset',
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

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // TCK-381 — les formes essayées à la main sur CETTE version, et ce qu'elles ont donné.
  //
  // La consigne était d'inventer au moins cinq mutations et de dire lesquelles passent. Les voici,
  // TOUTES, y compris les deux qui passent — *une liste de mutations qui ne contient que les
  // attrapées ne dit rien du détecteur, elle dit ce que son auteur a bien voulu montrer.*
  // ────────────────────────────────────────────────────────────────────────────────────────────

  // M1 · l'échelle à QUATRE chiffres. Tailwind v4 n'en publie pas au-delà de 950, mais la borne
  //      `[0-9]{2,3}` du contrôle A s'arrête à trois : `bg-stone-1000` ne compile pas, donc le
  //      laisser passer n'est pas un trou. On le fige quand même, pour que le jour où quelqu'un
  //      élargit la borne, il sache que ce cas a été regardé.
  ['bg-stone-1000', false],

  // M2 · la MAJUSCULE — `BG-STONE-100`. Tailwind est sensible à la casse : cette classe n'existe
  //      pas, la laisser passer est correct.
  ['BG-STONE-100', false],

  // M3 · les préfixes de COULEUR qui n'étaient pas dans la liste. **Les six premières passaient
  //      au vert** sur la version de TCK-358 ; ce sont de vraies classes Tailwind v4, qui
  //      compilent et décident une couleur. `PREFIXES` a été élargi pour elles — cf. son docblock.
  //      Les deux dernières étaient DÉJÀ attrapées, le motif retrouvant `ring-` / `shadow-` après
  //      un tiret : le noter évite de « corriger » deux fois la même chose.
  ['border-t-stone-300', true], ['border-x-red-500', true], ['divide-x-stone-200', true],
  ['border-s-amber-200', true], ['border-b-white', true], ['ring-offset-stone-200', true],
  ['inset-ring-stone-300', true], ['text-shadow-stone-300', true],

  // M4 · le jeton d'état NEUF employé correctement — il ne doit surtout pas rougir, sinon la
  //      substitution de TCK-381 se ferait refuser par la garde qui l'exige.
  ['bg-success/15', false], ['text-info', false], ['border-warning/30', false],
  ['text-success-foreground', false], ['bg-info/10', false],

  // M5 · le jeton d'état écrit en VALEUR ARBITRAIRE — accepté, c'est une lecture de jeton.
  ['bg-[var(--success)]', false], ['text-[var(--info-foreground)]', false],

  // M6 · l'échelle brute cachée derrière DEUX variantes et une opacité, forme qu'une regex
  //      ancrée sur le début de classe raterait.
  ['md:dark:hover:bg-emerald-950/40', true],
  ['group-hover:supports-[backdrop-filter]:bg-sky-100', true],

  // M7 · la couleur littérale dans une valeur arbitraire de GRADIENT — le préfixe `from` est bien
  //      dans la liste, mais l'oublier était plausible.
  ['from-[#a85332]', true], ['to-[hsl(12_55%_43%)]', true],

  // M8 · une couleur nommée CSS collée à un séparateur `_` dans une ombre — le cas qui a motivé
  //      les bornes `[a-zA-Z0-9-]` du contrôle D plutôt que `\b`.
  ['shadow-[0_0_0_1px_darkseagreen]', true],

  // M9 · ⚠ MUTATION QUI PASSE — la couleur en STYLE INLINE. C'est le trou T1, déclaré en tête de
  //      fichier et non fermé : `style={{ backgroundColor: '#f5f5f4' }}` n'est pas une classe, et
  //      le voir demanderait d'analyser un objet JS. La ligne est ici pour que la prochaine revue
  //      adverse trouve le trou DÉJÀ ÉCRIT plutôt que de croire l'avoir découvert.
  ["style={{ backgroundColor: '#f5f5f4' }}", false], // ← MUTATION QUI PASSE (T1, déclaré)
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

/**
 * LE PÉRIMÈTRE GARDÉ DE `/app` (TCK-381) — vingt-huit répertoires plus les pages.
 *
 * La liste n'est pas devinée : c'est l'ensemble des répertoires de `src/components` atteints par
 * la clôture d'import des 46 pages de `/app` ET qui ne servent QUE le tableau de bord. Ce qui est
 * partagé avec le site public (`ui/`, `forms/`, `layout/`, `shared/`, `property/`, `public/`,
 * `files/`, `wizard/`, `onboarding/`, `map/`) reste DEHORS, dans le cliquet : les porter demande
 * de redessiner des primitives que la recherche publique et les fiches de bien montent aussi.
 *
 * ⚠ `components/console`, `feedback`, `billing`, `reporting` et `kyc-components.tsx` n'y figurent
 * PAS — non parce qu'ils seraient hors de `/app`, mais parce qu'ils sont **déjà** dans le
 * périmètre de l'espace super-admin ci-dessus. Un fichier gardé deux fois est gardé une fois de
 * trop : le second passage n'ajoute rien, et il rendrait le compte du reste dépendant de l'ordre
 * des espaces.
 */
const PERIMETRES_APP = [
  { type: 'dir', chemin: join(WEB_SRC, 'app', '(dashboard)', 'app') },
  // Les répertoires qui ne servent QUE le tableau de bord : gardés en entier, un fichier neuf
  // déposé dedans est couvert d'office.
  ...[
    'agency', 'agent', 'calendar', 'charts', 'customer', 'customer-dashboard',
    'customer-form', 'dashboard', 'documents', 'inventory', 'leases', 'media',
    'messages', 'owner', 'owners', 'payments', 'pipeline', 'privacy', 'profile',
    'property-dashboard', 'property-form', 'reviews', 'service-providers',
    'tenant', 'visits', 'welcome',
  ].map((d) => ({ type: 'dir', chemin: join(WEB_SRC, 'components', d) })),
  //
  // ⚠ `agent`, `customer-form`, `dashboard`, `owner` et `welcome` entrent alors qu'ils étaient
  // DÉJÀ propres (mesuré le 2026-08-27 : zéro occurrence hors `__tests__`) et qu'aucune page
  // publique ne les monte. *Un répertoire déjà propre est le moins cher à mettre sous cliquet, et
  // c'est le seul moment où ça ne coûte rien* — même raison que `components/reporting` chez
  // TCK-358. Sans eux, ils tombaient dans le reste : gardés par personne, à zéro par chance.
  // Les répertoires PARTAGÉS avec le site public : seuls les fichiers que `/app` monte
  // réellement entrent — cf. le docblock du type `cloture`.
  ...['bookings', 'compare', 'favorites', 'maintenance', 'search']
    .map((d) => ({ type: 'cloture', chemin: join(WEB_SRC, 'components', d) })),
];

/*
 * ⚠ `components/chat-widget` a été RETIRÉ de la liste ci-dessus, et le contrôle « clôture vide »
 * est ce qui l'a dénoncé : le widget est monté par `src/app/layout.tsx`, la racine de TOUT le
 * site. Il n'est donc pas dans la clôture de `/app` — il est dans celle de la page d'accueil
 * publique aussi bien que dans celle du tableau de bord.
 *
 * C'est le trou T5, déclaré : **la clôture part de `app/(dashboard)/app`, pas des layouts qui
 * l'enveloppent.** `app/layout.tsx` et `app/(dashboard)/layout.tsx` rendent sur `/app`, mais ils
 * rendent aussi sur `/admin` et sur le site public ; les prendre pour racine ferait entrer le
 * produit entier dans la « clôture de /app » et viderait le cliquet de son sens. La définition
 * retenue est celle du ticket, et elle laisse trois surfaces hors compte : le widget de
 * conversation, la bannière de maintenance globale et le sélecteur de langue du pied de page.
 */

/**
 * LES TÉMOINS — la moitié de l'auto-épreuve que ce fichier n'avait PAS, et le trou le plus
 * silencieux qu'il portait.
 *
 * Le contrôle `manquants` vérifie qu'un chemin CONFIGURÉ existe encore. Il ne voit pas le cas
 * inverse — **une entrée RETIRÉE de la configuration** : la garde sort alors en 0, sans un mot,
 * sur un périmètre amputé. C'est la troisième façon de la désarmer, après « casser une expression
 * régulière » (que {@link EPREUVE} attrape) et « lever un plafond » (que le cliquet attrape).
 *
 * Chacun des fichiers ci-dessous DOIT se retrouver dans l'ensemble ANALYSÉ de son espace. Le
 * mécanisme est repris de `scripts/check-locale-figee.mjs`, qui l'avait déjà payé.
 */
const TEMOINS = {
  'console super-admin': [
    join(WEB_SRC, 'app', '(super-admin)', 'super-admin', 'payouts', 'page.tsx'),
    join(WEB_SRC, 'components', 'admin', 'super', 'system-health.tsx'),
    join(WEB_SRC, 'components', 'console', 'StatusBadge.tsx'),
    join(WEB_SRC, 'components', 'feedback', 'ErrorState.tsx'),
    join(WEB_SRC, 'components', 'billing', 'PayoutTable.tsx'),
    join(WEB_SRC, 'components', 'reporting', 'RevenueChart.tsx'),
    join(WEB_SRC, 'components', 'kyc', 'kyc-components.tsx'),
  ],
  'tableau de bord /app': [
    join(WEB_SRC, 'app', '(dashboard)', 'app', 'page.tsx'),
    join(WEB_SRC, 'components', 'calendar', 'CalendarPage.tsx'),
    join(WEB_SRC, 'components', 'leases', 'LeaseDetail.tsx'),
    join(WEB_SRC, 'components', 'maintenance', 'labels.ts'),
    join(WEB_SRC, 'components', 'property-dashboard', 'PropertyList.tsx'),
    join(WEB_SRC, 'components', 'profile', 'ProfileReviewsList.tsx'),
    join(WEB_SRC, 'components', 'messages', 'ChatView.tsx'),
  ],
};

/**
 * LES DEUX ESPACES — chacun : ce qu'il exige à zéro, ce qu'il MESURE, et son cliquet.
 *
 * `resteBilateral` marque le cliquet qui échoue AUSSI quand il descend. Il vaut `true` pour `/app`
 * (né avec TCK-381) et `false` pour la console super-admin : *son chiffre appartient à TCK-358, et
 * le rendre bilatéral ici ferait rougir la CI d'un autre chantier pour une amélioration.*
 * L'asymétrie est une décision, pas un oubli.
 */
const ESPACES = [
  {
    libelle: 'console super-admin',
    perimetres: PERIMETRES,
    racineCloture: join(WEB_SRC, 'app', '(super-admin)'),
    plafondReste: RESTE_PLAFOND,
    resteBilateral: false,
    ticketReste: 'TCK-384',
    reference: '128 le 2026-08-27, avant TCK-358',
    plancherFichiers: 92,
  },
  {
    libelle: 'tableau de bord /app',
    perimetres: PERIMETRES_APP,
    racineCloture: join(WEB_SRC, 'app', '(dashboard)', 'app'),
    /*
     * CLIQUET DU RESTE `/app` — **58, mesuré PAR CETTE GARDE le 2026-08-27**, dans 11 fichiers :
     * `ui/toast` (12), `layout/NotificationBell` (10), `property/PropertyCard` (8),
     * `layout/AppTopbar` (7), `layout/UserMenu` (4), `ui/sheet` (4), `forms/FormError` (3),
     * `forms/FormSuccess` (3), `ui/dropdown-menu` (3), `shared/LanguageSwitcher` (2),
     * `layout/AppSidebar` (1), `ui/dialog` (1).
     *
     * ⚠ **Le chiffre du ticket n'est pas celui-ci, et l'écart est instructif.** Mon relevé
     * préalable disait 56 : il ne jouait que les contrôles A et B. La garde y ajoute le contrôle
     * D, qui trouve deux couleurs littérales en valeur arbitraire (`ui/sheet`, `ui/dropdown-menu`)
     * — *un compte pris avec un sous-ensemble des contrôles n'est pas le compte de la garde*, et
     * c'est exactement ainsi qu'un cliquet naît deux crans trop bas.
     *
     * Ce sont RÉELLEMENT des surfaces de `/app`, et RÉELLEMENT des primitives du site public :
     * neuf de ces onze fichiers figurent aussi dans le reste non gardé de la console super-admin.
     * Les porter est TCK-384, pour les trois espaces d'un coup — le faire ici l'aurait fait sans
     * revue des écrans publics.
     *
     * ⚠ Bilatéral : la garde échoue s'il MONTE (récidive) ET s'il descend sans que ce chiffre
     * suive. Un cliquet qui ne descend pas est une tolérance — leçon de `check-locale-figee.mjs`.
     */
    plafondReste: 58,
    resteBilateral: true,
    ticketReste: 'TCK-384',
    reference: '1070 le 2026-08-27, avant TCK-380/381',
    plancherFichiers: 225,
  },
];
const estTest = (chemin) => chemin.split(/[\\/]/).includes('__tests__');

const EXTENSIONS_IMPORT = ['.tsx', '.ts', '.jsx', '.js'];

/**
 * Rassemble les fichiers d'UN périmètre, en dénonçant tout chemin configuré qui a disparu.
 *
 * `cloture` reçoit la clôture de rendu de l'espace, pour le quatrième type de périmètre.
 */
function fichiersDuPerimetre(perimetres, manquants, cloture) {
  const tous = [];
  for (const p of perimetres) {
    if (p.type === 'cloture') {
      /*
       * QUATRIÈME TYPE, ajouté par TCK-381 — l'intersection d'un répertoire et de la clôture.
       *
       * Il existe parce que six répertoires servent DEUX espaces à la fois : `search/`,
       * `compare/`, `bookings/`, `favorites/`, `chat-widget/` et `maintenance/` portent les
       * écrans de `/app` **et** le tunnel de réservation, la comparaison et la recherche du site
       * PUBLIC. Mesuré : 137 occurrences de palette brute y vivent dans des fichiers que `/app`
       * ne monte pas.
       *
       * Les mettre en `dir` aurait fait rougir la garde sur le site public, que TCK-381 met
       * explicitement hors périmètre — et *la réponse humaine à ce rouge-là est une exception,
       * pas un correctif*, exactement ce que le docblock du type `file` dit déjà.
       *
       * ⚠ Contrairement à `dir`, un fichier NEUF déposé dans ce répertoire n'est couvert que
       * s'il est réellement importé depuis l'espace. C'est le contrat, pas une faiblesse : la
       * garde suit l'écran. S'il n'est monté par personne, il tombe dans le reste — et le
       * cliquet le voit.
       */
      if (!existsSync(p.chemin)) { manquants.push(relative(ROOT, p.chemin)); continue; }
      const dedans = cloture.filter((c) => c.startsWith(p.chemin + sep));
      // Un répertoire de clôture qui ne rend plus RIEN est un périmètre évaporé : le dire.
      if (dedans.length === 0) manquants.push(`${relative(ROOT, p.chemin)} (clôture vide)`);
      for (const c of dedans) tous.push(c);
      continue;
    }
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
  return tous;
}

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

// ──────────────────────────────────────────────────────────────────────────────────────────────
// T2 · le RESTE NON GARDÉ — ce que l'espace REND et que son périmètre ne couvre pas
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * La clôture transitive des imports depuis une racine de routes.
 *
 * C'est une approximation, et elle l'est dans le sens PRUDENT : un import qu'elle ne résout pas
 * (chemin calculé, ré-export exotique, `next/dynamic` avec une expression) sort de la clôture,
 * donc du compte — la garde ne peut pas rougir à cause d'elle, seulement manquer quelque chose.
 * *Une approximation qui se trompe toujours du même côté n'est pas un aléa : c'est un plancher.*
 */
function resoudre(spec, depuis) {
  let base;
  if (spec.startsWith('@/')) base = join(WEB_SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null; // paquet npm : hors du dépôt, donc hors sujet.
  for (const e of EXTENSIONS_IMPORT) {
    if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const e of EXTENSIONS_IMPORT) {
      const idx = join(base, `index${e}`);
      if (existsSync(idx)) return idx;
    }
    return null;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

function clotureDeRendu(racine) {
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

// ──────────────────────────────────────────────────────────────────────────────────────────────
// L'EXÉCUTION — un passage par espace, et un seul verdict
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * L'ÉPREUVE DE LA FORME DE LA CONFIGURATION — deux lignes, contre deux mutations à un geste.
 *
 * Mesuré le 2026-08-27 : **retirer l'entrée `/app` du tableau {@link ESPACES}** et **vider
 * {@link TEMOINS}** sortaient tous deux la garde en 0, d'une seule suppression chacun. Ces deux
 * contrôles ne les rendent pas impossibles — ils les font passer d'UNE suppression à DEUX, dont
 * l'une est un chiffre écrit ici, que personne ne baisse par distraction.
 *
 * ⚠ **C'est un plancher, pas une preuve** : cf. le trou T6 en tête de fichier. Une garde ne se
 * défend pas contre une réécriture délibérée d'elle-même ; à partir de là, la défense est la revue
 * du diff.
 */
if (ESPACES.length < 2) {
  console.error('✗ AUTO-ÉPREUVE — `ESPACES` ne porte plus que ' + ESPACES.length + ' espace(s).');
  console.error('  Il en faut DEUX : la console super-admin (TCK-358) et `/app` (TCK-381). En');
  console.error('  retirer un sortait la garde en 0 sur la moitié du produit, en silence.');
  process.exit(1);
}
for (const espace of ESPACES) {
  const t = TEMOINS[espace.libelle];
  if (t && t.length >= 3) continue;
  console.error(`✗ AUTO-ÉPREUVE — « ${espace.libelle} » n'a plus au moins trois témoins.`);
  console.error('  Vider `TEMOINS` désarmait le contrôle de périmètre d\'une seule suppression.');
  process.exit(1);
}

const manquants = [];

const collectes = ESPACES.map((espace) => {
  // La clôture d'abord : le type de périmètre `cloture` en dépend.
  const cloture = clotureDeRendu(espace.racineCloture);
  return { espace, cloture, tous: fichiersDuPerimetre(espace.perimetres, manquants, cloture) };
});

/**
 * TOUT ce qui est gardé, TOUS espaces confondus.
 *
 * ⚠ Le reste d'un espace se calcule contre cet ensemble-là, pas contre son seul périmètre — et
 * ce n'est pas un détail de présentation. `components/console` et `components/feedback` sont
 * rendus par `/app` **et** gardés par l'espace super-admin : les compter dans le reste de `/app`
 * ferait dire au cliquet « voici des fichiers que personne ne garde » à propos de fichiers exigés
 * à zéro deux lignes plus haut. Le chiffre dépendrait alors de l'ordre dans lequel les tickets
 * fusionnent — un cliquet qui bouge sans que le dépôt change n'est pas un cliquet.
 */
const GARDE_PARTOUT = new Set(collectes.flatMap((c) => c.tous));

const bilans = collectes.map(({ espace, cloture, tous }) => {
  // Les tests ne sont PAS analysés : ils peuvent légitimement asserter la classe d'un composant
  // tiers, et l'AC1 de TCK-358 comme celle de TCK-381 les excluent explicitement.
  const analyses = tous.filter((c) => !estTest(c));
  const reste = cloture.filter((f) => !GARDE_PARTOUT.has(f));
  const trouvailles = analyser(analyses);
  const resteTrouvailles = analyser(reste);
  const somme = (t) => CONTROLES.reduce((n, [id]) => n + t.get(id).length, 0);
  return {
    espace,
    tous,
    analyses,
    cloture,
    reste,
    trouvailles,
    resteTrouvailles,
    total: somme(trouvailles),
    resteTotal: somme(resteTrouvailles),
  };
});

if (manquants.length > 0) {
  console.error('✗ périmètre introuvable — la garde n\'aurait rien vérifié dessus :');
  for (const m of manquants) console.error(`    ${m}`);
  console.error('  Si le chemin a été renommé ou supprimé, METTRE À JOUR `PERIMETRES` ou');
  console.error('  `PERIMETRES_APP`, selon l\'espace.');
  process.exit(1);
}

for (const bilan of bilans) {
  if (bilan.analyses.length === 0) {
    // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : la forme de
    // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
    console.error(
      `✗ aucun fichier lisible dans le périmètre « ${bilan.espace.libelle} » — rien n'a été vérifié.`,
    );
    process.exit(1);
  }
}

/**
 * L'ÉPREUVE DES TÉMOINS — le contrôle que ce fichier n'avait pas, cf. le docblock de `TEMOINS`.
 *
 * Elle tourne APRÈS la collecte parce qu'elle porte sur son RÉSULTAT : ce n'est pas « le chemin
 * existe-t-il », c'est « ce fichier a-t-il réellement été analysé ». Les deux questions ont l'air
 * de la même ; seule la seconde survit au retrait d'une entrée de la configuration.
 */
for (const bilan of bilans) {
  const vus = new Set(bilan.analyses);
  for (const temoin of TEMOINS[bilan.espace.libelle] ?? []) {
    if (vus.has(temoin)) continue;
    console.error(
      `✗ AUTO-ÉPREUVE — « ${relative(ROOT, temoin)} » n'est PLUS analysé dans « ${bilan.espace.libelle} ».`,
    );
    console.error('');
    console.error('  Un répertoire retiré de la configuration, une extension perdue, un parcours');
    console.error('  cassé : la garde sortait en 0 SANS UN MOT sur un périmètre amputé. C\'est la');
    console.error('  troisième façon de la désarmer, après « casser une expression régulière »');
    console.error('  (que EPREUVE attrape) et « lever un plafond » (que le cliquet attrape).');
    console.error('');
    console.error('  Si le fichier a été renommé ou supprimé POUR DE BON, corriger `TEMOINS` —');
    console.error('  jamais le retirer pour faire taire ce message.');
    process.exit(1);
  }
}

/**
 * LE PLANCHER DE FICHIERS GARDÉS — le trou que la MUTATION K a ouvert, et qu'elle referme.
 *
 * Les témoins ci-dessus attrapent « retirer un répertoire du périmètre ». Ils n'attrapent pas la
 * manœuvre à deux temps : **retirer le répertoire ET son témoin.** Mesuré le 2026-08-27 en la
 * jouant — `leases` sorti de `PERIMETRES_APP` et `LeaseDetail.tsx` sorti de `TEMOINS` : la garde
 * sortait en **0, sans un mot**, sur seize fichiers de moins. C'est la même leçon que les témoins,
 * d'un cran plus haut : *un contrôle qui nomme ce qu'il surveille se désarme en retirant le nom.*
 *
 * Ce plancher-ci ne nomme rien : il compte. Ajouter des fichiers est libre ; en perdre exige de
 * corriger le chiffre à la main, avec sa date — et corriger un chiffre à la baisse est un geste
 * qu'une revue voit, contrairement à une ligne de configuration retirée.
 *
 * ⚠ Il est PLANCHER et non cliquet bilatéral : une suppression légitime de composant le fera
 * rougir, et c'est voulu — c'est le seul moment où quelqu'un relit ce que la garde couvre.
 */
for (const b of bilans) {
  if (b.analyses.length >= b.espace.plancherFichiers) continue;
  console.error(
    `✗ « ${b.espace.libelle} » ne garde plus que ${b.analyses.length} fichiers, `
    + `contre ${b.espace.plancherFichiers} au relevé du 2026-08-27.`,
  );
  console.error('');
  console.error('  Un répertoire retiré de la configuration fait exactement cela — et si son');
  console.error('  témoin part avec lui, RIEN d\'autre ne le dit. Le périmètre a rétréci :');
  console.error('    · si c\'est une suppression légitime de composants, corriger');
  console.error('      `plancherFichiers` de cet espace, avec sa date ;');
  console.error('    · sinon, remettre le chemin dans `PERIMETRES` / `PERIMETRES_APP`.');
  console.error('');
  process.exit(1);
}

if (REPORT) {
  for (const b of bilans) {
    console.log(
      `${b.espace.libelle} — ${b.analyses.length} fichiers GARDÉS `
      + `(${b.tous.length - b.analyses.length} fichiers de test écartés)\n`,
    );
    for (const [id, libelle] of CONTROLES) {
      const hits = b.trouvailles.get(id);
      console.log(`  ${id} · ${libelle} : ${hits.length}`);
      for (const [f, l, m] of hits) console.log(`      ✗ ${f}:${l}  ${m}`);
    }
    console.log(
      `\n  reste NON GARDÉ — ${b.reste.length} fichiers de la clôture de rendu, hors périmètre :`,
    );
    for (const [id, libelle] of CONTROLES) {
      const hits = b.resteTrouvailles.get(id);
      if (hits.length === 0) continue;
      console.log(`    ${id} · ${libelle} : ${hits.length}`);
      for (const [f, l, m] of hits) console.log(`        · ${f}:${l}  ${m}`);
    }
    console.log(`    total ${b.resteTotal} (cliquet ${b.espace.plafondReste}) — ${b.espace.ticketReste}\n`);
  }
}

let echec = false;

for (const b of bilans) {
  if (b.total === 0) continue;
  echec = true;
  console.error(
    `✗ ${b.total} classe(s) de couleur hors jetons dans « ${b.espace.libelle} » :\n`,
  );
  for (const [id, libelle] of CONTROLES) {
    const hits = b.trouvailles.get(id);
    if (hits.length === 0) continue;
    console.error(`  ${id} · ${libelle} — ${hits.length} :`);
    for (const [f, l, m] of hits) console.error(`      ${f}:${l}  ${m}`);
    console.error('');
  }
}

if (echec) {
  console.error('  Traduire par RÔLE, jamais par teinte proche :');
  console.error('      surface de carte ............ bg-card          (ex-blanc en dur)');
  console.error('      surface secondaire .......... bg-muted         (ex-pierre 50|100|200)');
  console.error('      bordure / anneau ............ border-border · ring-border');
  console.error('      texte principal ............. text-foreground  (ex-pierre 900|950)');
  console.error('      texte secondaire ............ text-muted-foreground');
  console.error('      accent de marque ............ text-primary · bg-primary');
  console.error('      avertissement ............... WarningBanner · bg-warning/10 · text-warning');
  console.error('      succès / confirmation ....... bg-success/15 · text-success   (TCK-381)');
  console.error('      information / en cours ...... bg-info/15 · text-info         (TCK-381)');
  console.error('      erreur ...................... ErrorState · text-destructive');
  console.error('      pastille de statut .......... <StatusBadge tone="…"> — jamais une classe');
  console.error('  Surface sombre permanente (topbar / sidebar) : la classe `dark` plus les jetons');
  console.error('  `--sidebar-*`, cf. le docblock de `SuperAdminSidebar`.');
  console.error('  Blanc FONCTIONNEL (fond de QR code) : la classe `.qr-surface` de `globals.css`.');
  console.error('  Valeur arbitraire (contrôle D) : une couleur ne s\'écrit pas entre crochets.');
  console.error('  `bg-[var(--jeton)]` est accepté — c\'est une LECTURE de jeton, pas une décision.');
  console.error('');
}

for (const b of bilans) {
  const { plafondReste, resteBilateral, libelle, ticketReste } = b.espace;
  if (b.resteTotal > plafondReste) {
    echec = true;
    console.error(`✗ « ${libelle} » — le RESTE NON GARDÉ est monté : ${b.resteTotal} > ${plafondReste}.\n`);
    console.error('  Ces fichiers sont rendus par l\'écran sans être dans son périmètre — ils sont');
    console.error(`  partagés avec le reste du produit (cf. ${ticketReste}). Le plafond ne se relève pas :`);
    console.error('  soit la couleur neuve passe par un jeton, soit le fichier entre dans un');
    console.error('  périmètre gardé et y passe à zéro. Le détail : --report.\n');
    for (const [id] of CONTROLES) {
      for (const [f, l, m] of b.resteTrouvailles.get(id)) console.error(`      ${id} ${f}:${l}  ${m}`);
    }
    console.error('');
  } else if (resteBilateral && b.resteTotal < plafondReste) {
    echec = true;
    console.error(
      `✗ « ${libelle} » — le reste vaut ${b.resteTotal}, alors que le cliquet dit ${plafondReste}.\n`,
    );
    console.error('  Un cliquet qui ne DESCEND pas est une tolérance : corrige le chiffre dans');
    console.error('  `scripts/check-super-admin-tokens.mjs`, avec sa date. C\'est aussi ce qui rend');
    console.error('  une hausse de plafond immédiatement rouge au lieu de silencieuse.\n');
  }
}

if (echec) process.exit(1);

for (const b of bilans) {
  console.log(
    `✓ ${b.espace.libelle} : 0 classe de couleur hors jetons sur ${b.analyses.length} fichiers `
    + `gardés (contre ${b.espace.reference}).`,
  );
  console.log(
    `  RESTE NON GARDÉ : ${b.resteTotal} défaut(s) (cliquet ${b.espace.plafondReste}`
    + `${b.espace.resteBilateral ? ', bilatéral' : ''}) dans ${b.reste.length} fichiers que l'écran `
    + `rend RÉELLEMENT`,
  );
  console.log(
    `  sans qu'un périmètre les couvre — primitives partagées avec le site public (${b.espace.ticketReste}).`,
  );
}
console.log(
  '  PORTÉE — plancher de VOCABULAIRE, pas revue de design : un `bg-card` posé là où il',
);
console.log(
  '  fallait `bg-muted` laisse cette garde verte. Elle prouve seulement qu\'aucune couleur',
);
console.log('  n\'est décidée en dehors de `globals.css`. Trous déclarés : T1 style inline,');
console.log('  T2 périmètre (ci-dessus, sous cliquet), T3 justesse du rendu. Détail : --report.');
process.exit(0);
