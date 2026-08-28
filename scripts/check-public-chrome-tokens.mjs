#!/usr/bin/env node
/**
 * Garde de la CHROME PUBLIQUE : la surface que voient les inconnus ne parle qu'un vocabulaire de
 * couleur — celui des jetons de `takussan-web/src/app/globals.css`. Aucune échelle neutre brute
 * de Tailwind (`gray-400`, `slate-700`, `zinc-100`, `neutral-200`) sur les six répertoires que
 * TCK-440 a mesurés.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `docs/design-guidelines.md` pose une règle fondamentale : *« Zéro valeur hex arbitraire dans le
 * code. Toute couleur passe par une variable CSS définie dans `src/app/globals.css`. Changer la
 * palette demain = modifier `globals.css`, rien d'autre. »* Relevé du 2026-08-27, sur la surface
 * publique — la commande est celle du § Contexte de TCK-440, reproduite ci-dessous :
 *
 *     grep -rhoE '\b(bg|text|border|ring)-(slate|gray|zinc|neutral)-[0-9]{2,3}\b' … | wc -l
 *       → 121
 *
 * Les deux composants les plus vus du site — la navbar et le pied de page — étaient les deux plus
 * éloignés du design system, et la page d'accueil qui les contient tous les deux était par
 * ailleurs exemplaire (0). Trois conséquences, toutes vérifiées : changer la palette ne changeait
 * pas la chrome ; le bloc `.dark` n'avait aucune prise sur elle ; et le contraste n'y était
 * arbitré par personne — `text-gray-400` sur blanc rend **2,60:1**, sous la moitié du seuil AA.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE COUVRE — et les DEUX TROUS, mesurés et déclarés
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle rejoue la commande de l'AC1, verbatim, sur le périmètre de l'AC1. Ni plus permissive
 * (l'AC l'interdit), ni plus large — et c'est un choix, pas un oubli. Re-mesuré le 2026-08-27
 * sur le MÊME périmètre, une fois la conversion faite :
 *
 *     T1 · les familles CHAUDES et sémantiques ............................ 260 occurrences
 *          `stone` 176 · `amber` 34 · `red` 23 · `emerald` 8 · `sky` 1. `stone` domine, et ce
 *          n'est pas un hasard : c'est le neutre CHAUD de Tailwind, celui dont quelqu'un s'est
 *          servi pour approcher Lin à la main. Le convertir demande le même travail que
 *          celui-ci, sur un volume deux fois plus grand ; l'inclure ici aurait fait naître la
 *          garde à 260 exceptions, c'est-à-dire pas de garde du tout.
 *     T2 · les couleurs NOMMÉES ........................................... 54 occurrences
 *          `bg-white` 36 · `text-white` 14 · `bg-black` 4. Celles de la navbar et du pied de page
 *          SONT converties par TCK-440 ; les autres restent.
 *
 *          ⚠ **Les quatre `bg-black/*` sont des VOILES, et leur conversion est DIFFÉRÉE.** Le
 *          jeton de voile `--scrim` vit sur `feat/lot-g3-design` et pas ici. La conversion a été
 *          écrite, mesurée par compilation, puis ANNULÉE : une classe dont le jeton n'est pas
 *          déclaré n'émet aucune règle et rend le voile TRANSPARENT. Une branche doit être
 *          cohérente seule. Les sites sont dans le rapport d'intégration.
 *     T3 · les VALEURS ARBITRAIRES par indirection .......................  8 occurrences
 *          `bg-[var(--pg-*)]` et `text-[var(--pg-*)]`, toutes dans `/playground`, plus les 70
 *          hexadécimaux de son `playground.css` — fichier que cette garde LIT sans rien y voir,
 *          puisque le contrôle D ne refuse que les hex écrits DANS une classe. C'est délibéré :
 *          TCK-440 met `/playground` explicitement hors périmètre (« il charge des palettes
 *          alternatives »), son sort appartient à TCK-431. Les refuser demanderait une exception,
 *          les taire serait un mensonge — ils sont donc déclarés.
 *     T4 · la CASSE ...................................................... 0 occurrence, et
 *          ce n'est PAS un trou : `bg-GRAY-400` n'est pas émise par Tailwind, donc la classe est
 *          déjà sans effet et la refuser n'apprendrait rien. Mesuré par compilation (revue
 *          adverse, 2026-08-28). Le drapeau `i` exigé de la garde jumelle ne se transporte pas
 *          ici — écrit pour que personne ne « corrige » cette absence.
 *
 *     T5 · les VALEURS ARBITRAIRES portant une FONCTION de couleur ..... **2 occurrences VIVANTES**
 *          Le contrôle D ne refuse que l'hexadécimal. `rgb()`, `hsl()` et `oklch()` écrits à la
 *          main dans une valeur arbitraire passent — et ce ne sont pas des indirections, ce sont
 *          des couleurs décidées hors de `globals.css`, exactement ce que la règle interdit.
 *
 *          ⚠⚠ **C'est le SEUL trou vivant de ce fichier, et il ne se compare pas aux autres.**
 *          T1 à T4, ci-dessus, sont latents ou hors périmètre ; celui-ci laisse passer du code livré :
 *
 *              components/property/cards/PropertyCardListing.tsx:40
 *                shadow-[0_8px_24px_rgba(31,24,18,0.08)]
 *              components/property/cards/PropertyCardStandard.tsx:61
 *                shadow-[0_1px_4px_rgba(31,24,18,0.10)]
 *
 *          `rgba(31,24,18)` **EST `--foreground`** (#1f1812), recopié à la main en décimal — le
 *          cas d'école de la couleur décidée ailleurs. Antérieur au lot (`git log -S` vide).
 *
 *          ⚠ **Pourquoi il n'est pas fermé ici, et c'est un arbitrage, pas un oubli** : le fermer
 *          rendrait la garde ROUGE sur ces deux lignes, et les corriger demande une décision qui
 *          n'est pas celle de cette garde. Le remède évident — remplacer par le jeton — pose le
 *          piège d'inversion des voiles : `--foreground` vaut #fcf9f3 en contexte `.dark`, donc
 *          une ombre écrite avec lui devient CLAIRE sur les surfaces qui portent la classe.
 *          Vérifié par compilation : `shadow-foreground/10` émet
 *          `--tw-shadow-color: var(--foreground)`.
 *
 *          ⚠ **Nuance, et elle corrige une formulation trop large que ce fichier a portée** :
 *          l'inversion ne mordrait PAS sur ces deux fichiers-ci. Ce sont des cartes de la chrome
 *          PUBLIQUE, dont l'AC4 de TCK-440 établit qu'elle n'est jamais dans un sous-arbre
 *          `.dark`. L'argument porte donc sur le REMÈDE GÉNÉRAL — on n'introduit pas un jeton
 *          inversant pour les ombres du produit entier — et non sur un blocage immédiat ici.
 *          La conclusion tient, la raison est plus étroite qu'écrit. C'est un ticket, pas une
 *          ligne.
 *
 *          Forme de fermeture, le jour où le jeton existe (mesurée par la revue adverse sur 18
 *          formes, 8 rouges / 10 vertes, 0 faux positif) — elle laisse `var()` hors de portée :
 *              -\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()
 *     T6 · CETTE GARDE N'A AUCUNE NOTION DE `className` ................ 0 occurrence, LATENT
 *          Elle cherche un MOTIF DE TEXTE dans un fichier, pas une classe dans un attribut. Tout
 *          ce qui contient la forme d'une classe la fait rougir, mesuré par la revue adverse :
 *          un chemin d'actif (`/images/bg-gray-200.png`), un `data-testid`, un `aria-label`, une
 *          propriété CSS personnalisée (`--text-gray-400`), un chemin d'import, un attribut `alt`,
 *          une URL.
 *
 *          ⚠ **Le cas le plus aigu est le SÉLECTEUR CSS écrit à la main** (`.bg-gray-100 { }`) :
 *          les `.css` sont lus, `playground.css` est dans le périmètre, et un fichier CSS est
 *          FAIT pour écrire des sélecteurs. C'est le seul endroit où le faux positif est la forme
 *          normale d'écriture du fichier.
 *
 *          ⚠ `EXTENSIONS` inclut aussi `md` et `mdx` : un document posé dans le périmètre serait
 *          lu comme du code. Il n'y en a aucun aujourd'hui (vérifié), et ce n'était écrit nulle
 *          part.
 *
 *          ⚠ **C'est la catégorie que la doctrine de ce fichier dit la plus coûteuse** — un faux
 *          positif coûte PLUS qu'un trou, parce qu'il rougit sur du code juste et apprend à
 *          contourner la garde. Le compromis déclaré plus haut ne couvre que les COMMENTAIRES :
 *          un chemin d'actif n'en est pas un, et il n'était couvert par rien.
 *
 *          Non fermé : distinguer une classe d'une chaîne qui lui ressemble demande de savoir où
 *          commence un `className`, c'est-à-dire d'analyser le JSX. Déclaré plutôt que tenté à
 *          moitié — et sans occurrence vivante, le coût est nul aujourd'hui.
 *
 * **Un trou déclaré est ce qui distingue une garde d'une garde qui se croit exhaustive.** Le
 * moment de fermer T1 et T2 est le ticket qui convertira ces familles-là ; jusque-là, ce fichier
 * dit ce qu'il ne voit pas plutôt que de laisser croire qu'il voit tout.
 *
 * ⚠ **ZÉRO EXCEPTION, et c'est structurel : il n'y a pas de liste d'exceptions dans ce fichier.**
 * AC2 de TCK-440 : *« une garde qui naît avec des exceptions n'est plus une garde »*. Le seul
 * moyen de faire passer une couleur brute sur ce périmètre est d'en retirer un répertoire — un
 * geste visible en revue, que {@link TEMOINS} rend en outre rouge.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LES QUATRE FAÇONS DE LA DÉSARMER, ET CE QUI LES ATTRAPE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. casser l'expression régulière  → {@link EPREUVE}, qui exige qu'elle reconnaisse encore
 *      des formes connues ET qu'elle en refuse d'autres. Une regex qui n'attrape plus rien et
 *      une surface propre rendent le même vert.
 *   2. retirer un répertoire du périmètre → {@link TEMOINS} : chaque espace nomme un fichier qui
 *      DOIT se retrouver dans l'ensemble analysé.
 *   3. vider le périmètre de ses fichiers → le plancher {@link FICHIERS_MINIMUM}.
 *   4. retirer un CONTRÔLE entier → l'ablation de configuration, qui exige qu'au moins une sonde
 *      cesse d'être vue quand on l'enlève.
 *
 * ⚠⚠ **Le cran n°4 a été INERTE du 2026-08-27 au 2026-08-28, et rien ne le disait.** Son helper
 * `sansEntree` reconstruisait deux contrôles sur trois — le contrôle D est arrivé plus tard et
 * n'y a pas été ajouté. Comme les sondes contiennent des formes que SEUL D voit, le jeu réduit ne
 * les voyait jamais, et l'ensemble des orphelines restait vide **par construction**. Mesuré :
 * trois entrées bidon (une famille, un préfixe, un suffixe) passaient en silence.
 *
 * *Les trois premiers voisins manqués par ce correctif ouvraient un trou de DÉTECTION ; le
 * quatrième éteignait une DÉFENSE.* Une garde peut donc perdre un cran entier sans qu'aucun de
 * ses contrôles ne change — et le seul moyen de s'en apercevoir est de lui soumettre une entrée
 * décorative exprès, ce que personne ne fait spontanément.
 *
 * Aucun de ces quatre crans n'est infranchissable — retirer un répertoire, son témoin et baisser
 * le plancher passe, en trois gestes dans un commit. Le but n'est pas de rendre la manœuvre
 * impossible, il est de la rendre PLURIELLE : un diff d'une ligne se relit distraitement.
 *
 * ⚠ Les classes de palette brute ne sont **pas** écrites en toutes lettres dans ce docblock, et
 * les commentaires du code analysé ne sont **pas** retirés avant analyse. Même raison que
 * `check-super-admin-tokens.mjs` : un docblock qui montre une classe brute est exactement la
 * documentation périmée qui fait repousser le motif. **Ce piège a été payé ici** : la première
 * version de cette garde rougissait sur le docblock de `Footer.tsx`, qui citait en toutes lettres
 * la couleur qu'il expliquait avoir retirée. Le récit s'écrit donc en mots (« une ardoise 900 »),
 * jamais en classes copiables.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * ÉPROUVÉE DANS LES DEUX SENS — et le second compte autant
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Une garde éprouvée seulement sur ce qu'elle doit refuser devient, le lendemain, un générateur
 * de faux positifs ; et un faux positif coûte PLUS qu'un trou, parce qu'il apprend à contourner
 * la garde. {@link EPREUVE} porte donc 49 formes — 22 à attraper, 27 à ignorer, dont des voisines
 * délibérément trompeuses.
 *
 * Balayage de faux positifs sur du RÉEL, mesuré le 2026-08-27 : les trois contrôles rejoués sur
 * **les 484 classes distinctes réellement écrites dans les 1130 fichiers de `takussan-web/src`**,
 * dont 479 sont légitimes → **0 faux positif**.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WEB_SRC = join(ROOT, 'takussan-web', 'src');

/**
 * Le périmètre — les six répertoires que le § Contexte de TCK-440 a mesurés.
 *
 * ⚠ `src/app/[locale]/(public)` et non `src/app/(public)` : TCK-434 a déplacé toute la surface
 * publique sous le segment de langue (ADR-0026). Le ticket, rédigé avant, cite l'ancien chemin —
 * qui n'existe plus. Un périmètre qui pointe un répertoire absent ne rougit pas, il compte zéro :
 * c'est le contrôle `manquants` ci-dessous qui refuse ce silence-là.
 */
const PERIMETRES = [
  join(WEB_SRC, 'app', '[locale]', '(public)'),
  join(WEB_SRC, 'components', 'home'),
  join(WEB_SRC, 'components', 'property'),
  join(WEB_SRC, 'components', 'search'),
  join(WEB_SRC, 'components', 'compare'),
  join(WEB_SRC, 'components', 'favorites'),
];

/**
 * Un fichier par répertoire gardé, qui DOIT se retrouver dans l'ensemble analysé.
 *
 * Le contrôle `manquants` vérifie qu'un chemin CONFIGURÉ existe encore ; il ne voit pas le cas
 * inverse — une entrée RETIRÉE de {@link PERIMETRES}. La garde sortirait alors en 0, sans un mot,
 * sur un périmètre amputé. Mécanisme repris de `check-super-admin-tokens.mjs`, qui l'avait payé.
 */
const TEMOINS = [
  join(WEB_SRC, 'app', '[locale]', '(public)', 'page.tsx'),
  join(WEB_SRC, 'components', 'home', 'Navbar.tsx'),
  join(WEB_SRC, 'components', 'home', 'Footer.tsx'),
  join(WEB_SRC, 'components', 'property', 'PropertyCard.tsx'),
  join(WEB_SRC, 'components', 'search', 'FilterSidebar.tsx'),
  join(WEB_SRC, 'components', 'compare', 'CompareTable.tsx'),
  join(WEB_SRC, 'components', 'favorites', 'FavoritesPopover.tsx'),
];

/** Plancher de fichiers analysés — 76 le 2026-08-27. Vider un répertoire ne doit pas être muet. */
const FICHIERS_MINIMUM = 60;

/**
 * Les préfixes d'utilitaires de couleur de Tailwind v4 — liste délibérément LARGE.
 *
 * ⚠ Elle s'arrêtait à `bg|text|border|ring`, et la revue adverse a mesuré le trou : `from-gray-400`
 * était ACCEPTÉE alors que sa famille est gardée et que Tailwind l'émet parfaitement. La famille
 * était gardée, le préfixe non — *une garde qui énumère se trompe toujours par le bord.* Zéro
 * occurrence vivante au 2026-08-28, donc l'élargissement ne coûte aucune exception : c'est le
 * moment le moins cher de fermer un trou, et le seul où ça ne coûte rien.
 */
const PREFIXES = [
  'bg', 'text', 'border', 'ring',
  'from', 'via', 'to', 'divide', 'outline', 'placeholder',
  'fill', 'stroke', 'shadow', 'caret', 'accent', 'decoration',
];
const FAMILLES = ['slate', 'gray', 'zinc', 'neutral'];

/**
 * TROIS contrôles — A, C, D. Chacun ferme un défaut que les deux autres laissent passer.
 *
 *   A · ÉCHELLE NEUTRE BRUTE — le contrôle du § Contexte de TCK-440, sa regex verbatim, sur une
 *       liste de préfixes désormais large.
 *   C · `scrim` HORS DE SON RÔLE — un voile est un FOND ; `text-scrim` et `ring-scrim/20`
 *       compilent parfaitement et ne veulent rien dire. C'est le trou que la garde jumelle a
 *       DÉCLARÉ sans pouvoir le fermer en général : *une garde sait qu'un jeton est déclaré, pas
 *       quels utilitaires il a le droit de prendre.* Il se ferme ICI parce que `--scrim` n'a qu'un
 *       rôle et qu'il est connu. Le cas général reste ouvert — `text-card` passe encore.
 *   D · VALEUR ARBITRAIRE HEXADÉCIMALE — `bg-[#6b7280]`. La revue adverse a mesuré que la garde
 *       l'acceptait, **en contradiction directe avec la règle que son propre en-tête cite** :
 *       *« Zéro valeur hex arbitraire dans le code. »* Une garde qui cite une règle sans
 *       l'appliquer est pire qu'une garde absente : elle fait croire que la règle est tenue.
 *
 * ⚠ **Il n'y a PAS de contrôle B, et c'est une décision, pas un oubli.** Il refusait le noir nu
 * (`bg-black/40`), parce qu'un voile s'écrit avec le jeton `--scrim`. Il a été écrit, éprouvé par
 * mutation, puis RETIRÉ en même temps que la conversion des quatre voiles était annulée : ce jeton
 * vit sur une autre branche, et une garde ne peut pas refuser ce que sa propre branche doit encore
 * écrire. Les formes d'épreuve correspondantes sont restées dans {@link EPREUVE}, du côté « non
 * vues » : les rebasculer à `true` est le diff qui rendra le changement d'avis visible au moment
 * de l'intégration. La lettre B n'est pas réattribuée, pour que les deux moitiés de cette
 * histoire portent le même nom.
 */
/**
 * A — l'échelle neutre brute.
 *
 * ⚠ Le groupe `SUFFIXES` a été ajouté le 2026-08-28 : `border-t-gray-200` et `ring-offset-gray-200`
 * étaient ACCEPTÉES, parce que le motif exigeait le nom de famille juste après le préfixe. Tailwind
 * insère pourtant un côté (`t b l r x y s e`) ou `offset` entre les deux. *Une garde qui décrit la
 * forme d'une classe se trompe sur la forme, pas sur le vocabulaire* — c'est le troisième bord par
 * lequel celle-ci est passée à côté. Les huit côtés et `offset` : 0 occurrence vivante, donc
 * fermeture gratuite.
 */
const SUFFIXES = ['t', 'b', 'l', 'r', 'x', 'y', 's', 'e', 'offset'];

function construireMotif({ prefixes = PREFIXES, familles = FAMILLES, suffixes = SUFFIXES } = {}) {
  return new RegExp(
    `\\b(?:${prefixes.join('|')})(?:-(?:${suffixes.join('|')}))?-(?:${familles.join('|')})-[0-9]{2,3}\\b`,
    'g',
  );
}

/**
 * C — `scrim` partout SAUF derrière `bg-`. Le préfixe est capturé pour le message d'échec.
 *
 * ⚠⚠ **{@link SUFFIXES} est arrivé ici en TROISIÈME**, après le contrôle A (passe 3) et le
 * contrôle D (passe 4). `border-t-scrim` et `ring-offset-scrim` traversaient — mesuré. *Le même
 * correctif a manqué trois voisins successifs, et chaque fois le diff avait l'air complet.*
 *
 * Ce n'est pas émis aujourd'hui (`--scrim` vit sur une autre branche), et c'est précisément
 * pourquoi il fallait le fermer AVANT : ce contrôle existe pour garder le RÔLE du jeton le jour
 * où il arrive. `border-t-scrim` compilera alors exactement comme `text-scrim`, que ce même
 * fichier décrit déjà comme « compile parfaitement et ne veut rien dire ».
 */
function construireMotifScrimHorsRole({ prefixes = PREFIXES, suffixes = SUFFIXES } = {}) {
  const horsBg = prefixes.filter((p) => p !== 'bg');
  return new RegExp(
    `\\b(?:${horsBg.join('|')})(?:-(?:${suffixes.join('|')}))?-scrim(?:\\/[0-9]{1,3})?\\b`,
    'g',
  );
}

/**
 * D — une couleur ÉCRITE À LA MAIN dans une classe : `bg-[#6b7280]`, `text-[#fff]`.
 *
 * ⚠⚠ **Le même groupe {@link SUFFIXES} qu'au contrôle A, et il a manqué ici pendant un commit
 * entier.** `border-t-[#6b7280]` traversait cette garde alors que Tailwind l'émet : *la faille
 * refermée pour les échelles nommées est restée ouverte pour les hexadécimaux, dans le fichier
 * même qui la fermait.* Un correctif appliqué à un contrôle et pas à son voisin est la forme la
 * plus discrète du défaut — le diff a l'air complet.
 *
 * ⚠ **La borne réelle est « hexadécimal », et rien de plus — ce docblock a prétendu autre chose.**
 * Il justifiait la borne par l'indirection (`bg-[var(--pg-ink)]` est une variable, pas une couleur
 * décidée). C'est vrai de `var()`, et FAUX de `rgb()`, `hsl()` et `oklch()`, qui sont des couleurs
 * écrites à la main tout autant qu'un hexadécimal et que ce contrôle laisse passer. *Une borne
 * déclarée qui ne décrit pas la borne appliquée est une garde qui se raconte une histoire.*
 *
 * Ce qui passe encore, et pourquoi, est en trou T5 en tête de fichier — avec ses DEUX occurrences
 * VIVANTES, qui font toute la différence avec les autres trous de ce fichier.
 */
function construireMotifHexArbitraire({ prefixes = PREFIXES, suffixes = SUFFIXES } = {}) {
  return new RegExp(
    `\\b(?:${prefixes.join('|')})(?:-(?:${suffixes.join('|')}))?-\\[#[0-9a-fA-F]{3,8}\\]`,
    'g',
  );
}

const CONTROLES = [
  ['A', 'échelle neutre brute', construireMotif()],
  ['C', 'jeton de voile hors de son rôle (--scrim est un FOND)', construireMotifScrimHorsRole()],
  ['D', 'couleur hexadécimale écrite à la main', construireMotifHexArbitraire()],
];

/** Conservé pour l'ablation de configuration, qui raisonne sur le contrôle A. */
const MOTIF = CONTROLES[0][2];

function vuParUnControle(forme, controles = CONTROLES) {
  return controles.some(([, , motif]) => { motif.lastIndex = 0; return motif.test(forme); });
}

/**
 * L'AUTO-ÉPREUVE — les formes que le motif doit voir, et celles qu'il doit laisser passer.
 *
 * Sans elle, une expression régulière cassée rend exactement la même sortie qu'une surface
 * propre. Les faux positifs comptent autant que les vrais : `text-sm` et `border-2` traversent
 * tout le dépôt, et un motif qui les attraperait ferait rougir sans rien apprendre.
 */
const EPREUVE = [
  // ── A · VUES : échelles neutres, toutes familles, toutes variantes ──────────────────────
  ['text-gray-400', true],
  ['text-slate-700', true],
  ['bg-zinc-100', true],
  ['border-neutral-200', true],
  ['ring-gray-300', true],
  ['hover:bg-gray-50', true],
  ['md:text-slate-900', true],
  ['dark:border-gray-800', true],
  ['group-hover:text-zinc-500', true],
  ['focus-visible:ring-neutral-400', true],
  ['text-zinc-50', true],
  ['data-[state=open]:bg-slate-100', true],
  // ── A · VUES : les préfixes ajoutés le 2026-08-28, un par entrée de PREFIXES ─────────────
  // ⚠ Chacun DOIT être ici : l'ablation de configuration refuse une entrée que rien n'exerce,
  // et c'est elle qui a attrapé l'élargissement quand il a été fait sans ces lignes.
  ['from-gray-400', true],
  ['via-slate-200', true],
  ['to-neutral-900', true],
  ['divide-gray-200', true],
  ['outline-gray-400', true],
  ['placeholder-gray-400', true],
  ['fill-gray-300', true],
  ['stroke-slate-500', true],
  ['shadow-gray-200', true],
  ['caret-gray-700', true],
  ['accent-gray-600', true],
  ['decoration-slate-300', true],
  // ── D · VUES : une couleur écrite à la main ──────────────────────────────────────────────
  ['border-t-gray-200', true],
  ['border-x-slate-300', true],
  ['border-e-neutral-200', true],
  ['ring-offset-gray-200', true],
  ['hover:border-b-zinc-400', true],
  // Les QUATRE côtés que l'ablation de configuration a dénoncés le 2026-08-28 : déclarés dans
  // SUFFIXES et exercés par rien. ⚠ Ce ne sont PAS des entrées inutiles — `border-l-*` et
  // `border-y-*` sont de vraies classes et le motif les couvre, vérifié. Le défaut était que
  // rien ne l'aurait dit si elles cessaient de l'être.
  ['border-l-gray-300', true],
  ['border-r-slate-200', true],
  ['border-y-zinc-100', true],
  ['border-s-neutral-400', true],
  ['bg-[#6b7280]', true],
  ['text-[#fff]', true],
  ['border-[#A1B2C3]', true],
  // Le 3e bord, sur D cette fois — il a manqué un commit entier.
  ['border-t-[#6b7280]', true],
  ['ring-offset-[#6b7280]', true],
  ['divide-x-[#6b7280]', true],
  ['hover:bg-[#6b7280]', true],
  // ── C · VUES : le jeton de voile hors de son rôle ───────────────────────────────────────
  ['text-scrim', true],
  ['ring-scrim/20', true],
  ['border-scrim', true],
  ['hover:text-scrim/50', true],
  // Le groupe SUFFIXES sur le contrôle C — sans ces formes, l'ablation de configuration ne
  // l'exercerait que sur A et D, et il resterait décoratif pour C sans que personne le sache.
  ['border-t-scrim', true],
  ['ring-offset-scrim', true],
  ['divide-x-scrim/40', true],

  // ── NON VUES : le vocabulaire légitime ──────────────────────────────────────────────────
  //
  // Une garde éprouvée seulement sur ce qu'elle doit refuser devient, le lendemain, un
  // générateur de faux positifs — et un faux positif coûte plus cher qu'un trou, parce qu'il
  // apprend à contourner la garde. D'où autant de formes ici que de formes attrapées.
  ['bg-scrim', false],          // LE rôle légitime du jeton de voile
  ['bg-scrim/40', false],
  ['bg-scrim/90', false],
  ['hover:bg-scrim/60', false],
  ['text-muted-foreground', false],
  ['text-muted-foreground/60', false],
  ['bg-card', false],
  ['bg-popover', false],
  ['border-border', false],
  ['text-primary-foreground', false],
  ['hover:bg-muted', false],
  // utilitaires non chromatiques qui PARTAGENT un préfixe
  ['text-sm', false],
  ['text-center', false],
  ['border-2', false],
  ['bg-cover', false],
  ['ring-inset', false],
  // formes VOISINES d'une classe interdite, et qui n'en sont pas — le piège du `\\b` mal posé
  ['text-gray', false],
  ['bg-gray-1000', false],
  ['text-graybeard-400', false],
  ['bg-blackboard', false],
  ['text-blackish', false],
  ['bg-scrimshaw', false],
  ['text-description', false],   // contient « scri »… mais pas `-scrim`
  // familles hors du périmètre DÉCLARÉ (trou T1) et couleurs nommées (trou T2)
  ['bg-stone-100', false],
  ['text-amber-400', false],
  ['text-white', false],
  ['bg-white', false],
  // ⚠ Le NOIR NU est délibérément TOLÉRÉ sur cette branche — cf. le trou T2 en tête de fichier.
  // Ces formes sont ici pour que le jour où le contrôle correspondant naîtra, il soit
  // impossible de le faire naître sans basculer ces lignes : une garde qui change d'avis doit
  // le faire par un diff visible.
  ['bg-black', false],
  ['bg-black/40', false],
  ['text-black', false],
  // ── D · NON VUES : les arbitraires qui ne sont PAS des couleurs écrites à la main ────────
  //
  // Une INDIRECTION vers une variable n'est pas une couleur décidée dans le JSX : les huit qui
  // vivent dans le périmètre sont dans `/playground`, hors périmètre par TCK-440. Trou déclaré.
  ['bg-[var(--pg-ink)]', false],
  ['text-[var(--pg-accent)]', false],
  ['bg-[length:200%]', false],
  ['border-t-[3px]', false],
  ['ring-offset-[2px]', false],
  ['text-[11px]', false],
  ['w-[264px]', false],
  ['top-[145px]', false],
  // La CASSE n'est pas un défaut ici, et c'est MESURÉ : Tailwind n'émet pas `bg-GRAY-400`, donc
  // la classe est déjà sans effet et la refuser n'apprendrait rien. Le drapeau `i` exigé de la
  // garde jumelle ne se transporte pas — vérifié par compilation, revue adverse du 2026-08-28.
  ['bg-GRAY-400', false],
  ['TEXT-gray-400', false],
  // ── T5 · NON VUES, et c'est le trou VIVANT de ce fichier ─────────────────────────────────
  //
  // Ces formes DOIVENT rester ici du côté « non vues » tant que T5 est ouvert : elles rendent
  // le trou exécutable plutôt que seulement raconté, et les basculer à `true` sera le diff qui
  // rend sa fermeture visible.
  ['shadow-[0_1px_0_#6b7280]', false],
  ['bg-[rgb(107,114,128)]', false],
  ['bg-[oklch(0.7_0.02_260)]', false],
  ['shadow-[0_8px_24px_rgba(31,24,18,0.08)]', false],
];

function autoEpreuve() {
  const echecs = [];
  for (const [forme, attendu] of EPREUVE) {
    const vu = vuParUnControle(forme);
    if (vu !== attendu) echecs.push([forme, attendu, vu]);
  }
  if (echecs.length === 0) return true;
  console.error("✗ AUTO-ÉPREUVE — l'expression régulière ne reconnaît plus ce qu'elle doit.\n");
  for (const [forme, attendu, vu] of echecs) {
    console.error(`    « ${forme} » — attendu ${attendu ? 'vu' : 'non vu'}, obtenu ${vu ? 'vu' : 'non vu'}`);
  }
  console.error('\n  Une expression régulière cassée et une surface propre rendent le même vert.');
  return false;
}

/**
 * ABLATION DE CONFIGURATION — chaque famille et chaque préfixe déclaré doit être PORTEUR.
 *
 * Retirer `zinc` de {@link FAMILLES} ne fait rougir aucun contrôle si aucune forme d'épreuve ne
 * l'exerce : l'entrée devient décorative, et la garde perd une famille en silence. On reconstruit
 * donc le motif sans chaque entrée, et on exige qu'au moins une forme d'`EPREUVE` cesse d'être
 * vue. Une entrée orpheline est signalée par son nom.
 */
function ablationDeConfiguration() {
  const sondes = EPREUVE.filter(([forme, attendu]) => attendu && vuParUnControle(forme)).map(([f]) => f);
  const orphelines = [];
  // ⚠⚠ LES TROIS CONTRÔLES, et il en manquait UN. `sansEntree` a été écrit quand la garde en
  // avait deux ; le contrôle D est arrivé plus tard et ce helper ne l'a pas suivi. Conséquence
  // mesurée : `sondes` contient des formes que SEUL D voit, le jeu réduit ne les voyait donc
  // JAMAIS, `sondes.every(...)` était faux pour toute entrée candidate, et `orphelines` restait
  // vide INCONDITIONNELLEMENT. **L'ablation de configuration ne pouvait signaler aucune entrée
  // décorative** — trois entrées bidon (une famille, un préfixe, un suffixe) passaient en silence.
  //
  // C'est le QUATRIÈME voisin manqué par le même correctif, et le plus coûteux : les trois
  // premiers ouvraient un trou de détection, celui-ci ÉTEIGNAIT une défense entière — la
  // quatrième de celles que l'en-tête énumère comme façons de résister au désarmement.
  const sansEntree = (opts) => [
    ['A', '', construireMotif(opts)],
    ['C', '', construireMotifScrimHorsRole(opts)],
    ['D', '', construireMotifHexArbitraire(opts)],
  ];

  for (const famille of FAMILLES) {
    const sans = sansEntree({ familles: FAMILLES.filter((f) => f !== famille) });
    if (sondes.every((forme) => vuParUnControle(forme, sans))) orphelines.push(`famille « ${famille} »`);
  }
  for (const prefixe of PREFIXES) {
    const sans = sansEntree({ prefixes: PREFIXES.filter((p) => p !== prefixe) });
    if (sondes.every((forme) => vuParUnControle(forme, sans))) orphelines.push(`préfixe « ${prefixe} »`);
  }
  // SUFFIXES est la liste la PLUS RÉCENTE — celle qui vient de refermer trois bords — et elle
  // n'était couverte par aucune boucle. Une liste neuve échappe à l'ablation par défaut : c'est
  // au moment de l'ajouter qu'il faut l'y inscrire, pas à la passe suivante.
  for (const suffixe of SUFFIXES) {
    const sans = sansEntree({ suffixes: SUFFIXES.filter((x) => x !== suffixe) });
    if (sondes.every((forme) => vuParUnControle(forme, sans))) orphelines.push(`suffixe « ${suffixe} »`);
  }
  // Un CONTRÔLE entier retiré doit lui aussi faire tomber une sonde : sans ça, B ou C
  // pourraient devenir décoratifs sans que rien ne le dise.
  for (const [id] of CONTROLES) {
    const sans = CONTROLES.filter(([autre]) => autre !== id);
    if (sondes.every((forme) => vuParUnControle(forme, sans))) orphelines.push(`contrôle « ${id} »`);
  }

  if (orphelines.length === 0) return true;
  console.error("✗ ABLATION — une entrée de configuration n'est exercée par aucune forme d'épreuve.\n");
  for (const o of orphelines) console.error(`    ${o}`);
  console.error("\n  Ajouter une forme à EPREUVE qui l'exerce, ou retirer l'entrée.");
  return false;
}

const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/;

function fichiersDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      // Les tests ne rendent rien à un visiteur : un fichier de test peut légitimement écrire une
      // classe brute pour éprouver qu'elle est refusée — c'est le cas de ce fichier-ci.
      if (entree === '__tests__') continue;
      fichiersDe(chemin, acc);
    } else if (EXTENSIONS.test(entree) && !/\.(test|spec)\.[jt]sx?$/.test(entree)) {
      acc.push(chemin);
    }
  }
  return acc;
}

function main() {
  if (!autoEpreuve() || !ablationDeConfiguration()) process.exit(1);

  const manquants = PERIMETRES.filter((p) => !existsSync(p));
  if (manquants.length > 0) {
    console.error('✗ PÉRIMÈTRE — chemin(s) configuré(s) introuvable(s) :\n');
    for (const m of manquants) console.error(`    ${relative(ROOT, m)}`);
    console.error("\n  Un périmètre qui pointe un répertoire absent ne rougit pas, il compte zéro.");
    process.exit(1);
  }

  const fichiers = PERIMETRES.flatMap((p) => fichiersDe(p));
  const ensemble = new Set(fichiers);

  const temoinsAbsents = TEMOINS.filter((t) => !ensemble.has(t));
  if (temoinsAbsents.length > 0) {
    console.error("✗ TÉMOINS — des fichiers qui doivent être analysés ne le sont plus :\n");
    for (const t of temoinsAbsents) console.error(`    ${relative(ROOT, t)}`);
    console.error('\n  Soit le fichier a bougé, soit un répertoire a quitté PERIMETRES.');
    process.exit(1);
  }

  if (fichiers.length < FICHIERS_MINIMUM) {
    console.error(`✗ PLANCHER — ${fichiers.length} fichier(s) analysé(s), moins que le plancher de ${FICHIERS_MINIMUM}.`);
    process.exit(1);
  }

  const defauts = [];
  let total = 0;
  for (const fichier of fichiers) {
    const contenu = readFileSync(fichier, 'utf8');
    const lignes = contenu.split('\n');
    lignes.forEach((ligne, i) => {
      for (const [id, libelle, motif] of CONTROLES) {
        motif.lastIndex = 0;
        const trouvees = ligne.match(motif);
        if (!trouvees) continue;
        total += trouvees.length;
        defauts.push({
          fichier: relative(ROOT, fichier), ligne: i + 1, controle: id, libelle,
          classes: [...new Set(trouvees)],
        });
      }
    });
  }

  if (defauts.length > 0) {
    console.error(`✗ chrome publique — ${total} classe(s) de palette brute sur ${defauts.length} ligne(s).\n`);
    for (const d of defauts.slice(0, 40)) {
      console.error(`    [${d.controle}] ${d.fichier}:${d.ligne}  ${d.classes.join(' ')}  — ${d.libelle}`);
    }
    if (defauts.length > 40) console.error(`    … et ${defauts.length - 40} ligne(s) de plus`);
    console.error(`
  Le périmètre est exigé à ZÉRO, sans exception (TCK-440, AC2). Les jetons du design
  system vivent dans takussan-web/src/app/globals.css ; la correspondance retenue par
  TCK-440 est en tête de src/components/home/Footer.tsx et dans le test de contraste
  src/components/home/__tests__/chrome-publique.contraste.test.tsx.

  Un contraste doit être MESURÉ avant d'être introduit : le harnais est
  takussan-web/src/test/contraste-wcag.ts.
`);
    process.exit(1);
  }

  console.log(`✓ chrome publique : 0 classe de palette brute sur ${fichiers.length} fichier(s) de ${PERIMETRES.length} répertoire(s) (contre 121 le 2026-08-27, avant TCK-440).`);
  if (REPORT) {
    console.log(`  PORTÉE — ce contrôle est EXACT sur ce qu'il regarde : une classe Tailwind est
    un littéral, elle ne se calcule pas sous peine de ne pas être compilée. Ce
    qu'il NE regarde PAS, et qui est détaillé en tête de ce fichier : les
    familles chaudes ou sémantiques (260 occurrences, pierre en tête), les
    couleurs nommées (54, dont les quatre voiles en attente de leur jeton), les
    arbitraires par indirection de /playground, hors périmètre par TCK-440, et
    la casse, qui n'est pas un défaut puisque Tailwind ne l'émet pas.

    ⚠ ET UN TROU VIVANT — le SEUL de cette liste, le seul qui laisse passer du
    code LIVRÉ, et donc le seul que ce résumé n'avait pas le droit d'omettre :
    une couleur écrite à la main dans une valeur arbitraire sous forme de
    FONCTION (rgb, hsl, oklch) traverse le contrôle D, qui ne refuse que
    l'hexadécimal. DEUX occurrences aujourd'hui, deux ombres qui recopient
    --foreground en décimal :

        takussan-web/src/components/property/cards/PropertyCardListing.tsx:40
        takussan-web/src/components/property/cards/PropertyCardStandard.tsx:61

    Non fermé à dessein : une ombre a besoin d'un jeton qui ne s'inverse pas,
    comme un voile — cf. le trou T5 en tête de ce fichier pour l'arbitrage.

    ⚠ ET DANS L'AUTRE SENS — ce qu'il attraperait À TORT : cette garde cherche
    un motif de TEXTE, pas une classe dans un attribut de classe. Un sélecteur
    CSS écrit à la main, un chemin d'actif, un libellé d'accessibilité ou un
    texte alternatif la feraient rougir sur du code juste. 0 occurrence
    aujourd'hui ; trou T6, détaillé en tête de ce fichier.

    Un vert ici ne veut donc PAS dire « la chrome publique n'a plus une seule
    couleur brute » : il en reste au moins ces deux-là.
    ⚠ Cette garde ne voit pas non plus si un jeton EXISTE : une classe dont le
    jeton n'est pas déclaré n'émet aucune règle et ne fait aucune erreur. Aucun
    mécanisme du dépôt ne l'attrape aujourd'hui — c'est l'objet de TCK-453.`);
  }
}

main();
