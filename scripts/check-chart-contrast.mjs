#!/usr/bin/env node
/**
 * Garde du CONTRASTE des couleurs de série des graphiques (TCK-374).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF — pourquoi une garde, alors que l'AC ne demandait qu'un calcul
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC3 de TCK-374 disait : « le contraste de chaque couleur de série sur `--card` est calculé et
 * **reporté dans la PR** ». Un nombre reporté dans une PR est vrai le jour où on l'écrit, et
 * personne ne le rejoue — c'est le motif exact de TCK-244, dont l'AC exigeait « aucun résultat »
 * et qui échouait **dans son propre périmètre** quatre mois plus tard, faute de garde
 * (cf. l'en-tête de `check-app-tokens.mjs`). Ici la matière première est un HEX dans un fichier
 * CSS : elle changera, et rien dans le dépôt ne relie ce hex à un seuil.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PREMIÈRE VERSION NE VOYAIT PAS — et ce que celle-ci change (revue de TCK-374)
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La première version lisait `charts/palette.ts` avec `/'(?:fill|stroke|bg)-chart-([0-9])'/g` : un
 * chiffre UNIQUE, suivi d'une apostrophe. **Six contournements sur neuf la traversaient en sortant
 * en 0, dont trois SANS CHANGER LE COMPTE AFFICHÉ** — le mode d'échec d'une garde à expression
 * régulière n'est pas de rougir à tort, c'est de cesser de matcher :
 *
 *   · `'stroke-chart-1/50'` — un modificateur d'opacité, invisible à la regex. Le trait rend
 *     alors **2,11:1** sur `--card` clair, et le message de succès affichait encore « 4 jetons ».
 *   · `'fill-chart-10'` — un jeton à deux chiffres. Non vu ; `--chart-10` à `#f7ecd2` rend 1,17:1.
 *   · `'fill-[#c89a4a]'` — une valeur arbitraire Tailwind, qui sort du système de jetons.
 *   · `style={{ fill: 'var(--chart-3)' }}` — la même chose par le style inline.
 *   · un thème retiré de `THEMES`, un `SEUIL` abaissé de 3 à 1, la regex amputée de son
 *     alternative `bg` : **aucune auto-épreuve**, donc trois amputations silencieuses.
 *
 * Et le NOM promettait plus que la lecture ne tenait : onze classes de jeton de série vivaient
 * hors de `palette.ts` (`TimeSeriesChart`, `FunnelChart`, `StatCard`) sans qu'aucune mesure ne les
 * atteigne. Aucune n'échouait — mais rien ne les tenait.
 *
 * D'où la forme actuelle, en trois déplacements :
 *
 *   1. **Le périmètre est ÉLARGI** aux deux répertoires qui rendent des graphiques
 *      (`components/charts` et `components/reporting`), pas seulement à la table de palette.
 *   2. **La lecture est LARGE puis CLASSÉE** : toute écriture `<utilitaire>-chart-<queue>` est vue,
 *      et une queue que le lecteur ne sait pas interpréter fait ÉCHOUER au lieu d'être ignorée.
 *      *Une garde qui ne comprend pas ce qu'elle lit doit le dire, pas l'omettre.*
 *   3. **Ce qui n'est pas une série se DÉCLARE**, avec sa mesure et sa raison (`SURFACES`,
 *      `SURFACES_INLINE`). Une exemption qui ne correspond plus à rien fait échouer elle aussi :
 *      une porte ouverte que plus personne ne franchit reste une porte ouverte.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. Les fichiers de `takussan-web/src/components/{charts,reporting}` — QUELS jetons servent de
 *      couleur, et sous quelle forme. Les sources le disent, pas ce script : énumérer `1..5` ici
 *      ferait mesurer des jetons que le dépôt n'emploie pas, et surtout ferait rougir `--chart-3`,
 *      délibérément écarté des séries.
 *   2. `takussan-web/src/app/globals.css` — les valeurs de `--chart-*` et de `--card`, dans
 *      `:root` (clair) ET dans `.dark` (sombre). **Les deux thèmes sont mesurés** : le défaut
 *      trouvé le 2026-08-27 (`--chart-3` à 2,57:1) n'existait qu'en clair, et une garde qui
 *      n'aurait mesuré qu'un thème l'aurait manqué.
 *
 * Seuil : **3:1**, celui que WCAG 2.2 §1.4.11 (*Non-text Contrast*) pose pour un objet graphique
 * porteur de sens — ce qu'est une barre ou une courbe dont la couleur identifie la série. Ce n'est
 * PAS 4,5:1 : ce seuil-là vaut pour du texte, et l'appliquer ici interdirait la moitié d'une
 * charte sans raison. Il ne s'applique pas non plus aux SURFACES (un fond de tuile, un aplat sous
 * une courbe) : leur lisibilité se juge contre l'encre posée dessus, pas contre la carte.
 *
 * ⚠ Ce que cette garde NE prouve PAS, et il faut le dire :
 *
 *   · elle mesure contre le FOND DE CARTE (`--card`). Elle ne dit rien de deux séries voisines
 *     l'une contre l'autre (WCAG ne l'exige pas ; la légende et l'ordre s'en chargent), ni d'une
 *     série posée sur une autre surface. Mesuré le 2026-08-27 : sur `--background` clair les
 *     quatre jetons rendent 5,06 / 5,25 / 5,44 / 16,69, sur `--muted` sombre le minimum est 3,70 —
 *     aucun échec vivant, mais c'est un relevé, pas une garde ;
 *   · elle lit du TEXTE. Une classe assemblée à l'exécution lui échappe — ce que la forme
 *     littérale imposée par `charts/palette.ts` interdit par ailleurs, pour une autre raison
 *     (Tailwind ne compilerait pas la classe) ;
 *   · elle mesure une couleur, pas un DESSIN : un trait d'un pixel au bon contraste reste
 *     illisible, et ça ne se mesure pas ici.
 *
 * C'est un plancher, pas un certificat.
 *
 * Relevé daté, avec ce script inchangé (2026-08-27, après la revue de TCK-374) :
 *
 *     séries, clair (--card #ffffff)   chart-1 5,32  chart-2 5,51  chart-4 5,72  chart-5 17,53
 *     séries, sombre (--card #2a2018)  chart-1 4,83  chart-2 4,48  chart-4 7,01  chart-5 15,16
 *     composé bg-chart-1/80            3,65 clair · 3,59 sombre   (la barre de FunnelChart)
 *     28 mesures sous seuil (14 formes × 2 thèmes), minimum 3,59:1, marge 1,20× le seuil
 *     + 1 surface déclarée et 1 jeton inline déclaré, mesurés et reportés hors seuil
 *       (elles étaient 2 : `bg-chart-3/15` est tombé avec la tuile `StatCard`, passée aux
 *       jetons d'état à la fusion de TCK-380/381 — cf. le commentaire dans `SURFACES`)
 *
 * Usage :
 *   node scripts/check-chart-contrast.mjs            # garde, sort en 1 sous le seuil
 *   node scripts/check-chart-contrast.mjs --report   # + le tableau complet
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SRC = join(ROOT, 'takussan-web', 'src');

/** Le seuil WCAG 2.2 §1.4.11. Ancré par l'auto-épreuve : l'abaisser ne suffit pas à passer. */
const SEUIL = 3;

const CSS = join(SRC, 'app', 'globals.css');

/** Les répertoires qui RENDENT des graphiques. Élargi à `reporting` par la revue (défaut D4). */
const PERIMETRE = [
  join('components', 'charts'),
  join('components', 'reporting'),
];

/**
 * Les thèmes à mesurer, et le SÉLECTEUR qui porte leurs valeurs dans `globals.css`.
 *
 * ⚠ Les DEUX sont exigés par l'auto-épreuve. Retirer `.dark` faisait sortir la première version en
 * 0 avec un message d'apparence saine (« 4 jetons × 1 thèmes ») — or c'est le thème CLAIR qui
 * portait le seul défaut jamais trouvé ici. Un thème de moins n'est pas une garde plus permissive,
 * c'est une garde qui a cessé de chercher.
 */
const THEMES = [
  { nom: 'clair', selecteur: ':root' },
  { nom: 'sombre', selecteur: '.dark' },
];

/**
 * Les DEUX surfaces sur lesquelles un graphique se pose — et pourquoi il en fallait deux.
 *
 * ⚠ Cette garde ne mesurait que `--card` jusqu'au 2026-08-27, et son titre le disait
 * (« Contraste des couleurs de série sur --card »). C'était un TROU, pas un cadrage : un
 * graphique posé dans une section de page sans carte rend sur `--background`, qui vaut `#fcf9f3`
 * en clair — plus clair que `--card` ? non, plus SOMBRE, donc plus favorable — mais `#1f1812` en
 * sombre, où il est plus SOMBRE que `--card` (`#2a2018`), donc défavorable dans l'autre sens.
 * Les deux surfaces se trompent en sens opposés selon le thème : n'en mesurer qu'une laisse
 * toujours une moitié dehors.
 *
 * Ajoutées par TCK-404, après sa revue : la valeur corrigée de `--chart-3` rend **3,55:1 sur
 * `--card`** et **3,38:1 sur `--background`**, et le second chiffre ne vivait que dans un
 * commentaire. *Un ratio consigné dans une prose que rien ne rejoue est une croyance datée.*
 *
 * Relevé à l'ajout, sur les 34 formes : minimum 3,38:1 en clair (`--chart-3` sur `--background`)
 * et 3,85:1 en sombre (`bg-chart-1/80`). Aucune n'a eu besoin d'être corrigée pour que la
 * surface entre — c'est le seul moment où élargir une garde ne coûte rien.
 */
const SURFACES_DE_FOND = [
  { jeton: 'card', libelle: '--card' },
  { jeton: 'background', libelle: '--background' },
];

/**
 * Les fichiers qui DOIVENT être lus, avec ce qu'ils portent.
 *
 * C'est l'autre moitié de l'auto-épreuve : un répertoire retiré de `PERIMETRE`, un fichier
 * renommé, et la garde sortirait en 0 en n'ayant rien lu. Un ensemble vide n'est pas « conforme ».
 */
const TEMOINS = [
  join('components', 'charts', 'palette.ts'),
  join('components', 'charts', 'StatCard.tsx'),
  join('components', 'reporting', 'TimeSeriesChart.tsx'),
  join('components', 'reporting', 'FunnelChart.tsx'),
];

/**
 * Ce qui porte un jeton `--chart-*` SANS être une couleur de série — donc hors du seuil de 1.4.11.
 *
 * Chaque entrée porte sa mesure et sa raison. **Elles ne sont pas des exemptions muettes** : le
 * contraste est calculé et REPORTÉ comme les autres, seul le verdict change. Et une entrée qui ne
 * correspond plus à aucune occurrence fait échouer la garde — une exemption morte est une porte
 * ouverte que plus personne ne surveille.
 */
const SURFACES = [
  {
    classe: 'fill-chart-1/10',
    mesure: '1,14:1 clair · 1,15:1 sombre',
    raison:
      "aplat sous la courbe de `TimeSeriesChart`. Ce n'est pas lui qui identifie la série — le "
      + '`stroke-chart-1` à pleine opacité le fait, et il est mesuré. Un aplat à 10 % qui '
      + 'atteindrait 3:1 masquerait la grille et les points.',
  },
  /*
   * ⚠ **`bg-chart-3/15` a été RETIRÉ d'ici à la fusion de TCK-380/381 (2026-08-27), et c'est
   * cette garde qui l'a exigé** — elle échoue sur une exemption qui ne correspond plus à rien.
   *
   * C'était le fond de la tuile `StatCard` ton `warning`. TCK-374 lui avait donné `--chart-3`
   * faute de mieux : un jeton de SÉRIE DE GRAPHIQUE employé comme jeton d'ÉTAT. TCK-381 a créé
   * `--success` / `--info` et repris `--warning` de TCK-358 précisément pour que les états
   * cessent d'emprunter — `StatCard` porte désormais `bg-warning/10`, hors de la portée de
   * cette garde, qui ne lit que les `--chart-*`.
   *
   * `--chart-3` n'avait donc PLUS AUCUNE occurrence dans le périmètre, et restait écarté des
   * séries pour son 2,57:1 en clair.
   *
   * ⚠ **TCK-404 l'a corrigé le 2026-08-27** — `#c89a4a` → `#ad8034`, 3,55:1 sur `--card` clair —
   * et il est rentré dans les trois tables de `charts/palette.ts`. Il n'a plus d'entrée ici parce
   * qu'il n'est plus une exception : il est une SÉRIE, mesurée avec les quatre autres. C'est
   * l'inverse exact du geste de TCK-374, qui l'avait sorti de la table sans le corriger.
   */
];

/**
 * Les jetons `--chart-*` atteints par un STYLE INLINE, que la lecture des classes ne peut pas voir.
 *
 * Même règle que `SURFACES` : déclarés, sinon refusés. C'est le trou « T1 style inline » que
 * `check-super-admin-tokens.mjs` nomme de son côté — ici il est fermé par une liste, pas ignoré.
 */
const SURFACES_INLINE = [
  {
    fichier: join('components', 'reporting', 'CohortHeatmap.tsx'),
    raison:
      "l'intensité de la case est un `color-mix` calculé À L'EXÉCUTION (`var(--chart-1)` de 0 à "
      + "100 %) : aucune valeur fixe à mesurer. C'est un FOND derrière `text-foreground`, donc "
      + 'hors du seuil de 1.4.11 — et le cas où il est le plus opaque est celui où l’encre a le '
      + 'plus de contraste, pas le moins.',
  },
];

/**
 * Le nombre de mesures SOUMISES AU SEUIL, mesuré le 2026-08-27 (revue de TCK-374).
 *
 * **14 formes × 2 thèmes = 28.** Une « forme » est un couple *(utilitaire, jeton, opacité)* :
 * `fill-chart-1`, `stroke-chart-1` et `bg-chart-1` comptent pour trois, alors qu'ils rendent la
 * MÊME couleur. C'est délibéré — et c'est précisément ce qui manquait. Amputer la lecture de son
 * alternative `bg` laissait la première version au même compte, chaque numéro survivant dans
 * `fill-`/`stroke-` : la mutation était *strictement* invisible. Compter par forme la rend visible.
 *
 *     fill-chart-{1,2,4,5}  stroke-chart-{1,2,4,5}  bg-chart-{1,2,4,5}  bg-chart-1/80  border-chart-4
 *
 * ⚠ **34 → 68 le 2026-08-27, à la revue de TCK-404** : la garde mesure désormais SUR DEUX
 * SURFACES — `--card` et `--background` — et non plus sur la seule carte. Le compte double sans
 * qu'une forme ait bougé. Le motif est dans le docblock de {@link SURFACES_DE_FOND} : le second
 * chiffre de `--chart-3` (3,38:1 sur `--background`) ne vivait que dans un commentaire, et *un
 * ratio consigné dans une prose que rien ne rejoue est une croyance datée*.
 *
 * ⚠ **28 → 34 le 2026-08-27, par TCK-404** : `--chart-3` est rentré dans les trois tables de
 * `charts/palette.ts` après correction de sa valeur claire (2,57:1 → 3,55:1). Trois formes de
 * plus — `fill-chart-3`, `stroke-chart-3`, `bg-chart-3` — donc six mesures de plus. Le compte
 * monte ici parce que la charte est REDEVENUE complète, pas parce qu'on a ajouté une série :
 * c'est le premier mouvement de ce cliquet, et il fallait qu'il soit expliqué plutôt que subi.
 *
 * ⚠ **C'est un CLIQUET : la garde échoue s'il monte ET s'il descend.** Une garde à lecture de
 * texte ne meurt pas en rougissant, elle meurt en ne trouvant plus rien — et un compte qui baisse
 * tout seul est le seul signal que ça vient d'arriver. Ajouter ou retirer une série est légitime :
 * corriger ce chiffre ici, AVEC SA DATE, fait partie du geste.
 */
const MESURES_ATTENDUES = 68;

function lire(chemin) {
  try {
    return readFileSync(chemin, 'utf8');
  } catch {
    console.error(`✗ Fichier introuvable : ${relative(ROOT, chemin)}`);
    console.error('  Si le fichier a été déplacé, METTRE À JOUR ce script — ne pas le désactiver.');
    process.exit(1);
  }
}

/** Les sources d'un répertoire, `__tests__` exclu (un test PEUT écrire une classe pour l'asserter). */
function sources(racine) {
  const out = [];
  let entrees;
  try {
    entrees = readdirSync(racine);
  } catch {
    return out;
  }
  for (const e of entrees) {
    if (e === '__tests__' || e.startsWith('.')) continue;
    const chemin = join(racine, e);
    if (statSync(chemin).isDirectory()) out.push(...sources(chemin));
    else if (/\.(ts|tsx)$/.test(e)) out.push(chemin);
  }
  return out.sort();
}

// ── Le bloc de déclarations d'un sélecteur de premier niveau ───────────────────────────────────
/**
 * Volontairement littéral : `globals.css` n'imbrique pas ses blocs de jetons, et un vrai parseur
 * CSS serait une dépendance pour lire vingt lignes. Si le fichier se met à imbriquer, la garde
 * rendra un bloc vide et échouera sur le jeton manquant — bruyamment, ce qui est le comportement
 * voulu.
 */
function bloc(css, selecteur) {
  const i = css.indexOf(`${selecteur} {`);
  if (i === -1) return '';
  const j = css.indexOf('\n}', i);
  return j === -1 ? '' : css.slice(i, j);
}

function jeton(source, nom) {
  const m = source.match(new RegExp(`--${nom}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  return m ? m[1].toLowerCase() : null;
}

// ── L'arithmétique des couleurs ────────────────────────────────────────────────────────────────

/** Luminance relative WCAG. */
function luminance(hex) {
  const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, v, b] = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

function contraste(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [haut, bas] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (haut + 0.05) / (bas + 0.05);
}

/**
 * La couleur RÉELLEMENT rendue par `<classe>/<alpha>` posée sur `fond`.
 *
 * Tailwind v4 écrit `color-mix(in oklab, var(--chart-1) 80%, transparent)`, ce qui rend la même
 * couleur avec un canal alpha ; c'est le NAVIGATEUR qui la compose ensuite sur ce qu'il y a
 * derrière, en sRGB. Composer AVANT de mesurer est donc la seule façon d'obtenir le chiffre que
 * l'œil voit — mesurer la couleur nue rend un contraste que rien n'affiche.
 */
function composer(hex, fond, alpha) {
  const canaux = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, d] = [canaux(hex), canaux(fond)];
  return `#${f.map((v, i) => Math.round(v * alpha + d[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

// ── La LECTURE : large d'abord, classée ensuite ────────────────────────────────────────────────

/**
 * Toute écriture `<utilitaire>-chart-<queue>`, quelle que soit la queue.
 *
 * ⚠ La queue est capturée SANS être présumée valide. C'est tout le déplacement par rapport à la
 * première version : `/'(?:fill|stroke|bg)-chart-([0-9])'/` n'attrapait un jeton QUE s'il avait la
 * forme attendue, donc toute forme inattendue devenait invisible — un `/50`, un `10`. Ici elle est
 * vue, puis refusée si le lecteur ne sait pas l'interpréter.
 */
const CLASSE_CHART = /\b(fill|stroke|bg|text|border)-chart-([A-Za-z0-9/.[\]_-]*)/g;

/** Une valeur arbitraire Tailwind qui porte une COULEUR — la sortie du système de jetons. */
const VALEUR_ARBITRAIRE = /\b(?:fill|stroke|bg|text|border|from|via|to)-\[\s*(#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|hwb\()/g;

/** La palette Tailwind BRUTE, celle que l'AC2 de TCK-374 a retirée des graphiques. */
const PALETTE_BRUTE = /\b(?:fill|stroke|bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

/** Un jeton `--chart-*` atteint autrement que par une classe (style inline, `color-mix`, …). */
const JETON_INLINE = /var\(\s*--chart-\d+\s*\)/g;

/**
 * Le texte SANS ses commentaires — et les chaînes INTACTES.
 *
 * ⚠ Nécessaire, et pas un raffinement : l'en-tête de `charts/palette.ts` cite `` `fill-chart-${n}` ``
 * comme la forme INTERDITE (Tailwind ne compilerait pas une classe assemblée à l'exécution). Une
 * garde qui lit les commentaires rougit donc sur la documentation de sa propre règle — et sera
 * désarmée avant d'avoir attrapé quoi que ce soit. L'inverse vaut aussi : un défaut « expliqué »
 * dans un commentaire n'est pas un défaut, et une classe COMMENTÉE ne rend rien à l'écran.
 *
 * On parcourt donc caractère par caractère plutôt qu'avec une expression régulière : un `//` DANS
 * une chaîne n'ouvre pas un commentaire, et c'est exactement le défaut que `check-locale-figee.mjs`
 * a payé de son côté.
 */
function sansCommentaires(texte) {
  let sortie = '';
  let i = 0;
  while (i < texte.length) {
    const c = texte[i];
    if (c === '"' || c === "'" || c === '`') {
      sortie += c;
      i += 1;
      while (i < texte.length) {
        if (texte[i] === '\\') { sortie += texte[i] + (texte[i + 1] ?? ''); i += 2; continue; }
        sortie += texte[i];
        i += 1;
        if (texte[i - 1] === c) break;
      }
      continue;
    }
    if (c === '/' && texte[i + 1] === '/') {
      while (i < texte.length && texte[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && texte[i + 1] === '*') {
      i += 2;
      while (i < texte.length && !(texte[i] === '*' && texte[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    sortie += c;
    i += 1;
  }
  return sortie;
}

/**
 * Interprète la queue d'une classe `-chart-…`.
 *
 * Rend `{ numero, alpha }` ou `null` si la forme est inconnue — auquel cas l'appelant ÉCHOUE.
 * `alpha` est une fraction : `1` pour la pleine opacité, `0.5` pour `/50`.
 */
function interpreter(queue) {
  const m = /^(\d+)(?:\/(\d+))?$/.exec(queue);
  if (!m) return null;
  const alpha = m[2] === undefined ? 1 : Number(m[2]) / 100;
  if (!(alpha > 0 && alpha <= 1)) return null;
  return { numero: m[1], alpha };
}

/** Le nom canonique d'une occurrence, tel qu'il s'écrit dans `SURFACES`. */
function nomClasse(utilitaire, numero, alpha) {
  return alpha === 1
    ? `${utilitaire}-chart-${numero}`
    : `${utilitaire}-chart-${numero}/${Math.round(alpha * 100)}`;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// L'AUTO-ÉPREUVE
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le mode d'échec d'une garde à expressions régulières n'est pas de rougir à tort, c'est de
 * **cesser de matcher**. On lui donne donc à manger, à chaque invocation, ce qu'elle DOIT voir et
 * ce qu'elle DOIT laisser passer — et on ancre les constantes qu'il suffirait de baisser.
 *
 * ⚠ Les cas marqués « REVUE » sont ceux qui SORTAIENT EN 0 avant le 2026-08-27, sur la première
 * version de ce script. Ils ne sont pas décoratifs : chacun est une mutation réellement passée.
 */
function autoEpreuve() {
  const vu = (re, texte) => { re.lastIndex = 0; return re.test(texte); };

  // ── 1. Les constantes. Les abaisser était le contournement le plus simple qui existe. ────────
  if (SEUIL !== 3) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — SEUIL vaut ${SEUIL} et non 3.\n`
      + '  3:1 est le seuil de WCAG 2.2 §1.4.11 pour un objet graphique porteur de sens. Le\n'
      + "  changer n'est pas un réglage : c'est décider que la garde ne mesure plus la même\n"
      + '  chose. Si la norme visée change, changer AUSSI cette assertion, avec sa raison.',
    );
  }
  const selecteurs = THEMES.map((t) => t.selecteur).join(' ');
  if (selecteurs !== ':root .dark') {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — THEMES vaut « ${selecteurs} » au lieu de « :root .dark ».\n`
      + "  Retirer un thème ne fait pas rougir : ça fait sortir en 0 avec un message d'apparence\n"
      + '  saine. Or le seul défaut jamais trouvé ici (--chart-3, 2,57:1) n’existait qu’en clair.',
    );
  }

  // ── 2. L'arithmétique. Une luminance amputée rend des chiffres, pas une erreur. ──────────────
  const presque = (a, b) => Math.abs(a - b) < 0.01;
  if (!presque(contraste('#ffffff', '#000000'), 21)) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — blanc sur noir ne rend plus 21:1.');
  }
  if (!presque(contraste('#c89a4a', '#ffffff'), 2.57)) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — `--chart-3` sur blanc ne rend plus 2,57:1.\n'
      + "  C'est la valeur de contrôle du dépôt : le défaut qui a motivé TCK-374, recalculé à\n"
      + '  chaque exécution. Si elle bouge, c’est le CALCUL qui a changé, pas la charte.',
    );
  }
  if (composer('#a85332', '#ffffff', 0.5) !== '#d4a999') {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la composition alpha ne rend plus la couleur mesurée.');
  }
  if (!presque(contraste(composer('#a85332', '#ffffff', 0.5), '#ffffff'), 2.11)) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — `stroke-chart-1/50` ne rend plus 2,11:1 sur `--card` clair.\n'
      + '  C’est le défaut D2 de la revue : sans composition, la garde mesurerait 5,32:1 — la\n'
      + '  couleur nue, celle que personne ne voit.',
    );
  }

  // ── 3. La lecture. REVUE : chacun de ces cas traversait la première version. ─────────────────
  const doitEtreVu = [
    "'fill-chart-1'",
    "'stroke-chart-2'",
    "'bg-chart-4'",                        // REVUE — amputer l'alternative `bg` était invisible
    'className="border-chart-4"',
    'className="text-chart-5"',
    "'stroke-chart-1/50'",                 // REVUE — le modificateur d'opacité
    "'fill-chart-10'",                     // REVUE — le jeton à deux chiffres
    'className="fill-chart-1/10 stroke-none"',
  ];
  for (const cas of doitEtreVu) {
    if (!vu(CLASSE_CHART, cas)) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la lecture ne voit plus : ${cas}`);
    }
  }

  // Et ce qu'elle doit interpréter, ou refuser d'interpréter.
  const interpretations = [
    ['1', { numero: '1', alpha: 1 }],
    ['10', { numero: '10', alpha: 1 }],
    ['1/50', { numero: '1', alpha: 0.5 }],
    ['3/15', { numero: '3', alpha: 0.15 }],
  ];
  for (const [queue, attendu] of interpretations) {
    const lu = interpreter(queue);
    if (!lu || lu.numero !== attendu.numero || Math.abs(lu.alpha - attendu.alpha) > 1e-9) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — « chart-${queue} » n'est plus interprété.`);
    }
  }
  for (const queue of ['foo', '1/0', '1/200', '', '1-2']) {
    if (interpreter(queue) !== null) {
      throw new Error(
        `AUTO-ÉPREUVE ÉCHOUÉE — « chart-${queue} » est accepté alors qu'il est ininterprétable.\n`
        + '  Une forme inconnue doit faire ÉCHOUER, jamais être omise en silence : c’est la\n'
        + '  différence entre « rien à signaler » et « je n’ai pas su lire ».',
      );
    }
  }

  // ── 4. Les sorties du système de jetons. REVUE — aucune n'était vue. ─────────────────────────
  for (const cas of ["'fill-[#c89a4a]'", 'className="bg-[rgb(200,154,74)]"', "stroke-[oklch(0.7 0.1 60)]"]) {
    if (!vu(VALEUR_ARBITRAIRE, cas)) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la valeur arbitraire n'est plus vue : ${cas}`);
    }
  }
  for (const cas of ['className="text-[10px]"', 'className="fill-[url(#degrade)]"']) {
    if (vu(VALEUR_ARBITRAIRE, cas)) {
      throw new Error(
        `AUTO-ÉPREUVE ÉCHOUÉE — une valeur arbitraire SANS couleur est refusée à tort : ${cas}\n`
        + '  `text-[10px]` est une taille de police. Une garde qui rougit dessus sera désarmée.',
      );
    }
  }
  if (!vu(PALETTE_BRUTE, 'className="fill-emerald-500"')) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la palette Tailwind brute n’est plus vue.');
  }
  if (vu(PALETTE_BRUTE, 'className="bg-card text-muted-foreground"')) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — un jeton du design system est pris pour une couleur brute.');
  }
  if (!vu(JETON_INLINE, "style={{ fill: 'var(--chart-3)' }}")) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — le jeton atteint par style inline n’est plus vu.');
  }

  // ── 5. Le dépouillement des commentaires, dans LES DEUX SENS. ────────────────────────────────
  const nu = (t) => sansCommentaires(t);
  if (vu(CLASSE_CHART, nu('/** la forme interdite : `fill-chart-${n}` */'))) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — un commentaire de bloc est compté comme du code.\n'
      + '  L’en-tête de `charts/palette.ts` CITE la forme interdite. Une garde qui rougit sur la\n'
      + '  documentation de sa propre règle sera désarmée avant d’avoir servi.',
    );
  }
  if (vu(CLASSE_CHART, nu("// className='fill-chart-9'"))) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — un commentaire de ligne est compté comme du code.');
  }
  if (!vu(CLASSE_CHART, nu("const s = 'a // b'; const c = 'fill-chart-1';"))) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — un `//` DANS une chaîne blanchit la fin de sa ligne.\n'
      + '  C’est le défaut que `check-locale-figee.mjs` a payé : le dépouillement doit connaître\n'
      + '  les chaînes, sinon il efface du code vivant et la garde sort en 0.',
    );
  }
  if (!vu(CLASSE_CHART, nu('const c = "stroke-chart-2"; /* un aparté */'))) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — le dépouillement efface du code vivant.');
  }

  for (const re of [CLASSE_CHART, VALEUR_ARBITRAIRE, PALETTE_BRUTE, JETON_INLINE]) re.lastIndex = 0;
}

autoEpreuve();

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LA LECTURE DU PÉRIMÈTRE
// ──────────────────────────────────────────────────────────────────────────────────────────────

const fichiers = PERIMETRE.flatMap((p) => sources(join(SRC, p)));
const relatifs = new Set(fichiers.map((f) => relative(SRC, f)));

for (const temoin of TEMOINS) {
  if (!relatifs.has(temoin)) {
    console.error(`✗ AUTO-ÉPREUVE ÉCHOUÉE — « ${temoin} » n'est plus lu.`);
    console.error('  Un répertoire retiré de PERIMETRE, un fichier renommé : la garde sortirait en 0');
    console.error('  en n’ayant RIEN lu. Un ensemble vide n’est pas « conforme », il est absent.');
    process.exit(1);
  }
}

const echecs = [];
/** Une occurrence par forme distincte, avec les fichiers où elle vit. */
const formes = new Map();
const inlineVus = new Set();
const surfacesVues = new Set();

for (const f of fichiers) {
  const rel = relative(SRC, f);
  const texte = sansCommentaires(lire(f));

  CLASSE_CHART.lastIndex = 0;
  for (const m of texte.matchAll(CLASSE_CHART)) {
    const lu = interpreter(m[2]);
    if (!lu) {
      echecs.push(
        `${rel} : « ${m[0]} » — forme de jeton ININTERPRÉTABLE.\n`
        + '      Les formes admises sont `<utilitaire>-chart-<n>` et `<utilitaire>-chart-<n>/<opacité>`.\n'
        + '      La garde refuse plutôt que d’omettre : une écriture qu’elle ne sait pas mesurer\n'
        + '      est exactement celle qui la ferait sortir en 0 en ayant l’air de travailler.',
      );
      continue;
    }
    const nom = nomClasse(m[1], lu.numero, lu.alpha);
    const deja = formes.get(nom);
    if (deja) deja.fichiers.add(rel);
    else formes.set(nom, { ...lu, utilitaire: m[1], fichiers: new Set([rel]) });
  }

  VALEUR_ARBITRAIRE.lastIndex = 0;
  for (const m of texte.matchAll(VALEUR_ARBITRAIRE)) {
    echecs.push(
      `${rel} : « ${m[0]}… » — COULEUR ARBITRAIRE, hors du système de jetons.\n`
      + '      Aucune garde du dépôt ne la mesure, et elle ne suit pas le thème sombre. Passer par\n'
      + '      un jeton `--chart-*` de `charts/palette.ts`.',
    );
  }

  PALETTE_BRUTE.lastIndex = 0;
  for (const m of texte.matchAll(PALETTE_BRUTE)) {
    echecs.push(
      `${rel} : « ${m[0]} » — palette Tailwind BRUTE dans un graphique (AC2 de TCK-374).\n`
      + '      Mesuré le 2026-08-27 sur `--card` clair : amber-500 2,15:1, emerald-500 2,54:1,\n'
      + '      sky-500 2,77:1. Trois échelons 500 sur quatre sont sous le seuil.',
    );
  }

  JETON_INLINE.lastIndex = 0;
  if (JETON_INLINE.test(texte)) {
    inlineVus.add(rel);
    if (!SURFACES_INLINE.some((s) => s.fichier === rel)) {
      echecs.push(
        `${rel} : un jeton \`--chart-*\` est atteint par STYLE INLINE, hors de toute mesure.\n`
        + '      La lecture des classes ne peut pas le voir. Soit la couleur passe par une classe\n'
        + '      de `charts/palette.ts`, soit elle se DÉCLARE dans `SURFACES_INLINE` de ce script,\n'
        + '      avec sa raison — un trou déclaré vaut mieux qu’un trou.',
      );
    }
  }
}

// Une exemption morte est une porte ouverte que plus personne ne surveille.
for (const s of SURFACES_INLINE) {
  if (!inlineVus.has(s.fichier)) {
    echecs.push(
      `SURFACES_INLINE cite « ${s.fichier} », qui n'atteint plus aucun jeton \`--chart-*\`.\n`
      + '      Retirer l’entrée. Une exemption qui ne correspond plus à rien ne protège rien —\n'
      + '      elle attend le prochain fichier qui portera ce nom.',
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LA MESURE
// ──────────────────────────────────────────────────────────────────────────────────────────────

const css = lire(CSS);
const lignes = [];

for (const { nom: theme, selecteur } of THEMES) {
  const source = bloc(css, selecteur);
  for (const { jeton: nomFond, libelle } of SURFACES_DE_FOND) {
    const fond = jeton(source, nomFond);
    if (!fond) {
      console.error(`✗ \`--${nomFond}\` introuvable dans \`${selecteur}\` de globals.css.`);
      process.exit(1);
    }
    for (const [classe, { numero, alpha }] of [...formes].sort()) {
      const brut = jeton(source, `chart-${numero}`);
      if (!brut) {
        echecs.push(
          `--chart-${numero} n’est pas déclaré dans \`${selecteur}\` (thème ${theme}), alors que `
          + `« ${classe} » l’emploie.`,
        );
        continue;
      }
      const surface = SURFACES.find((s) => s.classe === classe);
      if (surface) surfacesVues.add(classe);
      const couleur = alpha === 1 ? brut : composer(brut, fond, alpha);
      const ratio = contraste(couleur, fond);
      lignes.push({ theme, fond: libelle, classe, couleur, valeurFond: fond, ratio, surface: Boolean(surface) });
      if (!surface && ratio < SEUIL) {
        echecs.push(
          `« ${classe} » (${couleur}) rend ${ratio.toFixed(2)}:1 sur ${libelle} (${fond}) `
          + `en thème ${theme}`,
        );
      }
    }
  }
}

for (const s of SURFACES) {
  if (!surfacesVues.has(s.classe)) {
    echecs.push(
      `SURFACES cite « ${s.classe} », qui n'est employé nulle part dans le périmètre.\n`
      + '      Retirer l’entrée : une exemption morte finit par couvrir autre chose que ce\n'
      + '      qu’elle décrivait.',
    );
  }
}

const mesurees = lignes.filter((l) => !l.surface);

if (REPORT) {
  console.log(
    `Contraste des couleurs de série sur --card ET --background — seuil ${SEUIL}:1 (WCAG 1.4.11)\n`,
  );
  for (const { nom: theme, selecteur } of THEMES) {
    for (const { libelle } of SURFACES_DE_FOND) {
    const duTheme = lignes.filter((l) => l.theme === theme && l.fond === libelle);
    if (duTheme.length === 0) continue;
    console.log(`  ${theme} (${selecteur}, ${libelle} ${duTheme[0].valeurFond})`);
    for (const l of duTheme) {
      const verdict = l.surface ? '·' : (l.ratio >= SEUIL ? '✓' : '✗');
      const suffixe = l.surface ? '   (SURFACE — hors seuil, cf. SURFACES)' : '';
      console.log(`      ${verdict} ${l.classe.padEnd(18)} ${l.couleur}  ${l.ratio.toFixed(2)}:1${suffixe}`);
    }
    }
  }
  if (mesurees.length > 0) {
    const min = Math.min(...mesurees.map((l) => l.ratio));
    console.log(`\n  minimum sous seuil ${min.toFixed(2)}:1 — marge ${(min / SEUIL).toFixed(2)}× le seuil`);
  }
  console.log('\n  Surfaces déclarées (mesurées, hors seuil) :');
  for (const s of SURFACES) console.log(`      ${s.classe.padEnd(18)} ${s.mesure} — ${s.raison}`);
  for (const s of SURFACES_INLINE) console.log(`      ${s.fichier} (inline) — ${s.raison}`);
  console.log('');
}

if (echecs.length > 0) {
  console.error(`✗ Couleurs de série des graphiques — ${echecs.length} défaut(s) :\n`);
  for (const e of echecs) console.error(`    ${e}`);
  console.error('\n  Sur un contraste sous le seuil, deux corrections, et une seule est la bonne :');
  console.error('    · le JETON est trop clair pour ce thème → corriger sa valeur dans globals.css,');
  console.error('      ce qui le change PARTOUT (c’est une décision de charte, cf. TCK-404) ;');
  console.error('    · le jeton est bon ailleurs mais pas en série → le retirer des tables de');
  console.error('      `charts/palette.ts`, comme --chart-3 l’est depuis TCK-374 ; ou, si ce n’est');
  console.error('      pas une série, le DÉCLARER dans `SURFACES` de ce script avec sa raison.');
  process.exit(1);
}

if (mesurees.length !== MESURES_ATTENDUES) {
  console.error(
    `✗ CLIQUET — ${mesurees.length} mesure(s) soumise(s) au seuil, alors que le cliquet dit `
    + `${MESURES_ATTENDUES}.`,
  );
  console.error('  Ce chiffre échoue dans LES DEUX SENS, et c’est le sens descendant qui compte :');
  console.error('  une garde à lecture de texte ne meurt pas en rougissant, elle meurt en ne');
  console.error('  trouvant plus rien. Un compte qui baisse tout seul est le seul signal que la');
  console.error('  lecture a cessé de voir ce qu’elle voyait hier.');
  console.error('  Si l’écart est VOULU (une série ajoutée, une retirée), corriger');
  console.error('  `MESURES_ATTENDUES` dans `scripts/check-chart-contrast.mjs`, avec sa date.');
  process.exit(1);
}

const formesSeries = [...formes.keys()].filter((c) => !SURFACES.some((s) => s.classe === c));
console.log(
  `✓ Contraste des séries : ${mesurees.length} mesures ≥ ${SEUIL}:1 `
  + `(${formesSeries.length} formes × ${THEMES.length} thèmes × ${SURFACES_DE_FOND.length} surfaces), `
  + `sur ${fichiers.length} fichiers de `
  + `${PERIMETRE.length} répertoires.`,
);
console.log(
  `  + ${SURFACES.length} surface(s) déclarée(s) et ${SURFACES_INLINE.length} jeton(s) inline `
  + 'déclaré(s) : mesurés et reportés, hors seuil de 1.4.11 (--report pour le détail).',
);
