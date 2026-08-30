#!/usr/bin/env node
/**
 * Garde du motif « ENCRE HÉRITÉE, FOND REPEINT » — TCK-471.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE REFUSE, ET POURQUOI IL A SURVÉCU
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `agency-detail.tsx` posait `bg-foreground text-background` sur la `<section>` du bandeau
 * « Actions de modération ». **Ce couple retourne deux propriétés, il ne retourne pas les jetons.**
 * Un descendant qui repeint son propre fond continue donc de lire la palette CLAIRE tout en
 * HÉRITANT l'encre claire du conteneur :
 *
 *     <section class="bg-foreground text-background">     encre #fcf9f3
 *       <Button variant="outline">                        fond  #fcf9f3   ← 1,00:1
 *
 * Mesuré sur l'application servie le 2026-08-30 : le bouton *Déverifier* occupait sa place,
 * réagissait au survol, se cliquait — et son libellé n'existait pas visuellement.
 *
 * Il a survécu parce que **la seule condition qui le révèle est la condition normale** : sous une
 * portée `.dark`, les jetons basculent et le libellé réapparaît. Personne ne mesure le contraste
 * d'un bouton qu'il ne voit pas.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE — LE MOTIF, PAS L'OCCURRENCE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Pour chaque `.tsx` de `takussan-web/src/` :
 *
 *   1. les CONTENEURS — un élément JSX dont le `className` déclare, sans variante, À LA FOIS un
 *      `bg-<jeton>` et un `text-<jeton>` ; l'encre est alors héritée par tout son sous-arbre ;
 *   2. dans le sous-arbre de chacun, les DESCENDANTS QUI REPEIGNENT sans poser d'encre :
 *        · `<Button variant="X">` / `buttonVariants({ variant: 'X' })` dont la recette de `X`,
 *          LUE dans `components/ui/button.tsx`, pose un fond et **pas** d'encre — c'est le cas
 *          `outline`, et c'est celui que le ticket nomme ;
 *        · un élément dont le `className` pose un `bg-<jeton>` sans `text-<jeton>`.
 *   3. le rapport WCAG 2.1 de l'encre du CONTENEUR sur le fond du DESCENDANT, alphas composés.
 *      Sous le seuil AA texte (4,5:1), c'est rouge.
 *
 * Une portée `dark` sur le conteneur bascule la table de jetons pour tout son sous-arbre : c'est la
 * forme JUSTE (`SuperAdminSidebar.tsx`, `SuperAdminTopbar.tsx`), et elle se mesure comme les
 * autres — elle n'est pas exemptée, elle passe.
 *
 * ⚠ **Ce script ne cherche pas la chaîne `bg-foreground text-background`.** Une garde qui n'assert
 * que l'occurrence corrigée coche aussi la régression suivante, écrite avec deux autres jetons.
 * L'auto-épreuve, en fin de fichier, exige que le motif fautif soit REFUSÉ et qu'une surface claire
 * ordinaire (`bg-card text-card-foreground` + un `outline`) soit ACCEPTÉE.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES TROUS, DÉCLARÉS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *  · **`--border` et `--input` sous `.dark`** sont approchés par leur blanc translucide COMPOSÉ sur
 *    `--background`, valeurs reprises telles quelles de `src/test/contraste-wcag.ts`.
 *
 *    ⚠ **`--destructive` figurait ici, et il n'y est plus — TCK-480.** Il était le troisième jeton
 *    non hexadécimal, « COMPTÉ et non mesuré » au motif qu'inventer une conversion OKLCH serait
 *    pire que l'omettre. Le motif était bon, le résultat non : c'est précisément ce jeton-là qui
 *    échouait, à 3,17:1 sur son propre aplat, pendant que deux gardes le comptaient. TCK-480 l'a
 *    converti à la SOURCE (`globals.css`), une fois, contre un relevé pris au moteur de rendu —
 *    et cette garde, qui lit la feuille, le mesure depuis sans qu'une ligne d'elle ait changé.
 *    Elle est passée de 10 à 11 couples mesurés le 2026-08-30. *Un trou déclaré dit où l'on ne
 *    regarde pas ; il n'empêche pas que ce soit là que ça casse.*
 *  · **L'imbrication est lue au texte**, pas par un AST : la balise fermante est trouvée en
 *    comptant les ouvertes/fermées de même nom. Une balise citée dans une chaîne fausserait le
 *    compte ; aucune ne le fait aujourd'hui, et le compte de conteneurs (cliquet ci-dessous) le
 *    ferait voir.
 *  · **Le fond SOUS le conteneur est supposé être `--background`** quand le conteneur peint avec un
 *    alpha. Sur-approximation assumée : elle ne peut que rendre le rapport moins bon, jamais
 *    meilleur — une garde doit couvrir plus, jamais moins.
 *  · **Les échelles Tailwind brutes** (`text-white`, `bg-stone-700`, `text-amber-900`…) ne sont pas
 *    des jetons du design system : elles sont COMPTÉES et non mesurées.
 *    C'est `check-super-admin-tokens.mjs` qui les refuse, là où son périmètre porte.
 *  · `src/test/` et les répertoires `__tests__/` sont ÉCARTÉS : le harnais et le banc d'ablation
 *    de `agency-detail-contrast.test.tsx` CITENT le motif interdit pour prouver qu'il est refusé,
 *    et *une garde qui rougit sur la preuve de sa propre efficacité se fait désarmer avant d'avoir
 *    servi* (même politique que `check-chart-contrast.mjs`).
 *
 * Usage :
 *   node scripts/check-heritage-encre.mjs            # garde, sort en 1 sous le seuil
 *   node scripts/check-heritage-encre.mjs --report   # + tous les couples mesurés
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SRC = join(ROOT, 'takussan-web', 'src');
const CSS = join(SRC, 'app', 'globals.css');
const BOUTON = join(SRC, 'components', 'ui', 'button.tsx');

/** WCAG 2.1 §1.4.3 AA — TEXTE normal. Un libellé de bouton porte un mot, pas une icône. */
const SEUIL = 4.5;

/**
 * Les couples PRÉEXISTANTS, mesurés le 2026-08-30, que TCK-471 ne corrige pas.
 *
 * ⚠ **Cliquet à sens unique : cette liste ne peut que RÉTRÉCIR.** Un couple qui en sort sans
 * qu'on l'ait corrigé fait rougir la garde ; un couple qu'on y ajoute doit porter sa mesure, sa
 * date et la raison de ne pas le corriger ici. *Un cliquet à deux sens est une tolérance.*
 *
 * ⚠ **Elle est VIDE depuis TCK-481, et c'est le cliquet qui a joué.** Elle a porté UNE entrée, et
 * c'était déjà un résultat : le ticket TCK-471 annonçait « un seul conteneur porte le motif » sur
 * la foi d'un `grep bg-foreground`, le balayage en a trouvé **deux**, et le second n'écrivait ni
 * `bg-foreground` ni `text-background` — c'est exactement pourquoi une garde ne doit pas chercher
 * l'occurrence. *Une classe utilitaire n'est dangereuse que là où elle est héritée ; encore
 * faut-il chercher l'héritage et pas la classe.*
 *
 * L'entrée retirée, pour mémoire : `src/components/profile/security/TwoFactorSection.tsx ·
 * <button> bg-warning/20` — un bouton « Copier tout » sans encre à lui dans un bandeau
 * `bg-warning/10 text-warning`, **3,94:1** au relevé du 2026-08-30 (4,10:1 sur le fond réel : le
 * bandeau est posé sur `--card`, pas sur `--background` — cf. la sur-approximation déclarée
 * ci-dessus). Corrigé par TCK-481, qui lui a donné SON fond et SON encre
 * (`bg-card text-warning hover:bg-secondary`) : **6,26:1** au repos, **5,24:1** au survol.
 * Le correctif n'est pas la portée `dark` de TCK-471, et la raison est écrite dans le ticket — ce
 * bandeau est une surface CLAIRE teintée, pas une surface sombre.
 *
 * ⚠ **Ce que ce ticket a appris à CETTE garde, et qui n'est pas dans son code** : un commentaire
 * `//` placé ENTRE DEUX ATTRIBUTS d'une balise la rend AVEUGLE sur l'élément — ses apostrophes
 * ouvrent, dans `finDeBaliseOuvrante()`, une chaîne que rien ne referme. Mesuré : le défaut
 * ci-dessus, commenté de la sorte, laissait la garde VERTE. La lecture au texte est un trou
 * déclaré (voir plus haut) ; celui-ci en est une conséquence concrète, et il se voit à l'ablation.
 */
const TOLERES = new Set([]);

/**
 * Le nombre de CONTENEURS que la lecture doit trouver dans `src/`.
 *
 * ⚠ **Cliquet à DEUX sens, et c'est le sens descendant qui compte.** Une garde à lecture de texte
 * ne meurt pas en rougissant, elle meurt en ne trouvant plus rien : si un changement de forme
 * d'écriture rendait la lecture aveugle, le script sortirait en 0 avec un message d'apparence
 * saine. Relevé le 2026-08-30 ; s'il bouge pour de bon, corriger ICI, avec la date.
 */
const CONTENEURS_ATTENDUS = 299;
/** Marge de respiration : le dépôt bouge, la lecture non. En dehors, il faut regarder. */
const TOLERANCE_CONTENEURS = 0.35;

// ────────────────────────────────────────────────────────────────────────────────────────────────
// L'ARITHMÉTIQUE DES COULEURS — mêmes valeurs de contrôle que les gardes sœurs
// ────────────────────────────────────────────────────────────────────────────────────────────────

function versRvb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function versHex(rvb) {
  return `#${rvb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex) {
  const [r, v, b] = versRvb(hex)
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

function contraste(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [haut, bas] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (haut + 0.05) / (bas + 0.05);
}

/** La couleur RÉELLEMENT rendue par `<couleur>/<alpha>` posée sur `fond`. */
function composer(hex, fond, alpha) {
  const [f, d] = [versRvb(hex), versRvb(fond)];
  return versHex(f.map((v, i) => v * alpha + d[i] * (1 - alpha)));
}

function fmt(ratio) {
  return `${ratio.toFixed(2).replace('.', ',')}:1`;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LA LECTURE DES JETONS
// ────────────────────────────────────────────────────────────────────────────────────────────────

function lire(chemin) {
  try {
    return readFileSync(chemin, 'utf8');
  } catch {
    console.error(`✗ Fichier introuvable : ${relative(ROOT, chemin)}`);
    console.error('  Si le fichier a été déplacé, METTRE À JOUR ce script — ne pas le désactiver.');
    process.exit(1);
  }
}

function bloc(css, selecteur) {
  const i = css.indexOf(`${selecteur} {`);
  if (i === -1) return '';
  const j = css.indexOf('\n}', i);
  return j === -1 ? '' : css.slice(i, j);
}

/** Les jetons HEXADÉCIMAUX d'un bloc. Un `oklch(…)` n'entre pas : il devient un trou déclaré. */
function jetonsDe(source) {
  const table = {};
  for (const m of source.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    table[m[1]] = m[2].toLowerCase();
  }
  return table;
}

const css = lire(CSS);
const JETONS_CLAIR = jetonsDe(bloc(css, ':root'));
const JETONS_SOMBRE = {
  ...JETONS_CLAIR,
  ...jetonsDe(bloc(css, '.dark')),
  /*
   * `--border` et `--input` valent `oklch(1 0 0 / 10%)` et `/ 15%` sous `.dark` — du blanc
   * translucide. Les valeurs ci-dessous sont ces blancs COMPOSÉS sur `--background` #1f1812, seule
   * composition qu'ils subissent en pratique. Approximation reprise mot pour mot de
   * `src/test/contraste-wcag.ts`, pour que les deux gardes ne divergent pas en silence.
   */
  border: '#352f2a',
  input: '#413b36',
  'sidebar-border': '#352f2a',
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LA LECTURE DES UTILITAIRES ET DES RECETTES DE VARIANTE
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Utilitaires `bg-`/`text-` qui ne sont PAS des couleurs (mêmes ensembles que le harnais de test). */
const NON_COULEURS = {
  bg: new Set([
    'auto', 'cover', 'contain', 'none', 'fixed', 'local', 'scroll', 'clip-text', 'clip-border',
    'clip-padding', 'clip-content', 'origin-border', 'origin-padding', 'origin-content',
    'repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'repeat-round', 'repeat-space',
    'top', 'bottom', 'left', 'right', 'center', 'blend-normal', 'blend-multiply', 'gradient-to-r',
    'gradient-to-l', 'gradient-to-t', 'gradient-to-b', 'gradient-to-br', 'gradient-to-bl',
    'gradient-to-tr', 'gradient-to-tl',
  ]),
  text: new Set([
    'xs', 'sm', 'base', 'lg', 'xl', 'left', 'center', 'right', 'justify', 'start', 'end',
    'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip', 'transparent',
  ]),
};

/** `bg-primary/20`, `dark:text-foreground`, `hover:bg-muted` → `{ variante, jeton, alpha }`. */
function utilitaire(classe, prefixe) {
  const m = /^(?:([a-z-]+(?::[a-z-]+)*):)?([a-z]+)-([a-z0-9-]+?)(?:\/(\d{1,3}))?$/.exec(classe);
  if (!m || m[2] !== prefixe) return null;
  const jeton = m[3];
  if (/^\d/.test(jeton) || NON_COULEURS[prefixe].has(jeton)) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / 100;
  if (!(alpha > 0 && alpha <= 1)) return null;
  return { variante: m[1] ?? '', jeton, alpha };
}

/**
 * La peinture au REPOS déclarée par une liste de classes. Sous une portée sombre, `dark:` gagne
 * sur la classe nue — c'est l'ordre de la cascade.
 */
function auRepos(classes, prefixe, sombre) {
  let retenu = null;
  for (const classe of classes) {
    const u = utilitaire(classe, prefixe);
    if (!u || u.jeton === 'transparent') continue;
    if (u.variante !== '' && !(sombre && u.variante === 'dark')) continue;
    if (u.variante === 'dark' || retenu === null) retenu = u;
  }
  return retenu;
}

/**
 * Les chaînes littérales d'un `className`, **une par une et NON fusionnées**.
 *
 * ⚠ La fusion est un piège payé : `className={x ? 'bg-primary …' : 'bg-secondary …'}` écrit DEUX
 * états mutuellement exclusifs du même élément. Les aplatir en une seule liste fabrique des couples
 * qui ne sont rendus dans AUCUN état — un rouge qui n'apprend rien, et qui fait désarmer la garde.
 * Chaque littéral est donc une ALTERNATIVE : le conteneur doit porter son couple dans UN littéral,
 * et un descendant est mesuré une fois par alternative qui peint.
 */
function litterauxDeLAttribut(valeur) {
  const out = [];
  for (const m of valeur.matchAll(/'([^']*)'|"([^"]*)"|`([^`$]*)`/g)) {
    const classes = (m[1] ?? m[2] ?? m[3]).split(/\s+/).filter(Boolean);
    if (classes.length > 0) out.push(classes);
  }
  return out;
}

/** Toutes les classes d'un `className`, alternatives confondues — pour les seuls tests d'existence. */
function classesDeLAttribut(valeur) {
  return litterauxDeLAttribut(valeur).flat();
}

/**
 * Les recettes de `buttonVariants`, lues dans `components/ui/button.tsx`.
 * Une variante qui pose un FOND sans poser d'ENCRE est celle qui hérite : c'est `outline`.
 */
function recettesDeVariante() {
  const texte = lire(BOUTON);
  const i = texte.indexOf('variant: {');
  if (i === -1) return null;
  // Fin du bloc `variant: { … }` par comptage d'accolades.
  let profondeur = 0;
  let j = texte.indexOf('{', i);
  const debut = j;
  for (; j < texte.length; j += 1) {
    if (texte[j] === '{') profondeur += 1;
    else if (texte[j] === '}') { profondeur -= 1; if (profondeur === 0) break; }
  }
  const corps = texte.slice(debut, j);
  const table = new Map();
  for (const m of corps.matchAll(/(\w+):\s*((?:"[^"]*"|'[^']*'|\s|\+)+),?\n/g)) {
    const classes = [];
    for (const s of m[2].matchAll(/"([^"]*)"|'([^']*)'/g)) {
      classes.push(...(s[1] ?? s[2]).split(/\s+/).filter(Boolean));
    }
    if (classes.length > 0) table.set(m[1], classes);
  }
  return table;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LA LECTURE DE L'IMBRICATION
// ────────────────────────────────────────────────────────────────────────────────────────────────

function sourcesTsx(racine) {
  const out = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) out.push(...sourcesTsx(chemin));
    else if (/\.tsx$/.test(entree)) out.push(chemin);
  }
  return out;
}

/** La fin de la balise ouvrante commencée en `i` — l'index du `>` qui la ferme. */
function finDeBaliseOuvrante(texte, i) {
  let profondeur = 0;
  let guillemet = null;
  for (let j = i; j < texte.length; j += 1) {
    const c = texte[j];
    if (guillemet) { if (c === guillemet) guillemet = null; continue; }
    if (c === '"' || c === "'" || c === '`') { guillemet = c; continue; }
    if (c === '{') profondeur += 1;
    else if (c === '}') profondeur -= 1;
    else if (c === '>' && profondeur === 0) return j;
  }
  return -1;
}

/** Le SOUS-ARBRE d'une balise ouvrante : le texte entre son `>` et sa fermante de même nom. */
function sousArbre(texte, balise, finOuvrante) {
  if (texte[finOuvrante - 1] === '/') return ''; // auto-fermante : aucun enfant
  const ouvre = new RegExp(`<${balise}(?=[\\s/>])`, 'g');
  const ferme = new RegExp(`</${balise}\\s*>`, 'g');
  let profondeur = 1;
  let curseur = finOuvrante + 1;
  while (curseur < texte.length) {
    ouvre.lastIndex = curseur;
    ferme.lastIndex = curseur;
    const o = ouvre.exec(texte);
    const f = ferme.exec(texte);
    if (!f) return texte.slice(finOuvrante + 1);
    if (o && o.index < f.index) {
      const fin = finDeBaliseOuvrante(texte, o.index);
      if (fin !== -1 && texte[fin - 1] !== '/') profondeur += 1;
      curseur = (fin === -1 ? o.index : fin) + 1;
      continue;
    }
    profondeur -= 1;
    if (profondeur === 0) return texte.slice(finOuvrante + 1, f.index);
    curseur = f.index + f[0].length;
  }
  return texte.slice(finOuvrante + 1);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LA MESURE
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Les recettes de `buttonVariants`, lues une fois. */
const VARIANTES = recettesDeVariante();

/**
 * Toutes les balises ouvrantes d'un fichier, avec leurs littéraux de classe, la recette de
 * variante qu'elles empruntent, et leur sous-arbre.
 *
 * ⚠ La recette d'une variante est INDISSOCIABLE du `className` de l'élément qui l'emprunte, et
 * l'oublier a produit trois faux rouges au premier balayage : `PropertyList.tsx` écrit
 * `<Button variant="outline" className="bg-transparent text-primary-foreground …">` — il annule le
 * fond de la variante ET pose son encre. Lire la recette seule le déclarait à 1,00:1 alors qu'il
 * est correct. *Une garde qui accuse le code juste se fait désarmer avant d'avoir servi.*
 */
function balises(texte) {
  const out = [];
  for (const m of texte.matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)) {
    const fin = finDeBaliseOuvrante(texte, m.index);
    if (fin === -1) continue;
    const ouvrante = texte.slice(m.index, fin + 1);
    const attr = /className\s*=\s*(\{[\s\S]*?\}|"[^"]*"|'[^']*')/.exec(ouvrante);
    const litteraux = attr ? litterauxDeLAttribut(attr[1]) : [];
    const empruntee = /buttonVariants\(/.test(ouvrante);
    let variante = null;
    if (m[1] === 'Button' || empruntee) {
      variante = /buttonVariants\(\s*\{[^}]*?variant:\s*['"]([a-z]+)['"]/.exec(ouvrante)?.[1]
        ?? /\bvariant\s*=\s*"([a-z]+)"/.exec(ouvrante)?.[1]
        ?? 'default';
    }
    out.push({
      balise: m[1],
      litteraux,
      recette: variante ? VARIANTES?.get(variante) ?? null : null,
      variante,
      enfants: () => sousArbre(texte, m[1], fin),
    });
  }
  return out;
}

/** L'élément pose-t-il SON encre, dans un littéral ou dans la recette qu'il emprunte ? */
function aSonEncre(noeud, sombre) {
  if (noeud.litteraux.some((l) => auRepos(l, 'text', sombre))) return true;
  return noeud.recette ? auRepos(noeud.recette, 'text', sombre) !== null : false;
}

/**
 * Les fonds que l'élément peut se peindre au repos — un par ALTERNATIVE de `className`.
 * `bg-transparent` n'est pas « pas de fond déclaré » : c'est une annulation explicite de la
 * recette, et la confondre avec l'absence est ce qui accusait `PropertyList.tsx`.
 */
function fondsDeclares(noeud, sombre) {
  const propres = [];
  let annule = false;
  for (const litteral of noeud.litteraux) {
    if (litteral.includes('bg-transparent')) { annule = true; continue; }
    const fond = auRepos(litteral, 'bg', sombre);
    if (fond) propres.push(fond);
  }
  if (propres.length > 0) return propres;
  if (annule || !noeud.recette) return [];
  const fond = auRepos(noeud.recette, 'bg', sombre);
  return fond ? [fond] : [];
}

/**
 * Le sous-arbre porte-t-il du TEXTE ?
 *
 * ⚠ Sans cette question, `FilterSidebar.tsx` rougissait à 1,00:1 sur la piste d'un interrupteur —
 * un `<span className="bg-primary">` qui ne contient qu'un autre `<span>` et pas un mot. Une encre
 * héritée par un élément qui n'affiche rien n'est pas un défaut de contraste, c'est un couple que
 * personne ne voit. Même raisonnement que `couples-de-contraste.ts` sur `after:bg-foreground`.
 */
function porteDuTexte(morceau) {
  return /[^\s]/.test(morceau.replace(/<[^>]*>/g, ''));
}

/** Les descendants d'un sous-arbre qui REPEIGNENT leur fond, sans poser d'encre, et qui parlent. */
function descendantsQuiRepeignent(morceau, sombre) {
  const out = [];
  for (const noeud of balises(morceau)) {
    // Une portée `dark` imbriquée rebascule les jetons : ce n'est plus le motif, c'est sa solution.
    if (noeud.litteraux.some((l) => l.includes('dark'))) continue;
    if (aSonEncre(noeud, sombre)) continue;
    if (!porteDuTexte(noeud.enfants())) continue;
    for (const fond of fondsDeclares(noeud, sombre)) {
      out.push({
        origine: noeud.variante
          ? `<${noeud.balise} variant="${noeud.variante}"> → bg-${fond.jeton}`
          : `<${noeud.balise}> bg-${fond.jeton}${fond.alpha === 1 ? '' : `/${Math.round(fond.alpha * 100)}`}`,
        fond,
      });
    }
  }
  return out;
}

/** Les couples fautifs d'un fichier. `inconnus` recueille les jetons non résolus. */
function couplesDuFichier(chemin, inconnus, compteurs) {
  const texte = readFileSync(chemin, 'utf8');
  const nom = relative(join(ROOT, 'takussan-web'), chemin);
  const out = [];

  for (const noeud of balises(texte)) {
    const sombre = noeud.litteraux.some((l) => l.includes('dark'));
    const jetons = sombre ? JETONS_SOMBRE : JETONS_CLAIR;
    // Le couple doit tenir dans UN littéral : deux branches d'un ternaire ne sont jamais rendues
    // ensemble, et les apparier fabrique un conteneur qui n'existe dans aucun état.
    const couple = noeud.litteraux
      .map((l) => ({ fond: auRepos(l, 'bg', sombre), encre: auRepos(l, 'text', sombre) }))
      .find((c) => c.fond && c.encre);
    if (!couple) continue;

    const enfants = noeud.enfants();
    if (enfants.trim() === '') continue;
    compteurs.conteneurs += 1;

    const hexEncre = jetons[couple.encre.jeton];
    const hexFondConteneur = jetons[couple.fond.jeton];
    if (!hexEncre || !hexFondConteneur) {
      inconnus.push(`${nom} : --${!hexEncre ? couple.encre.jeton : couple.fond.jeton}`);
      continue;
    }
    const dessous = couple.fond.alpha === 1
      ? hexFondConteneur
      : composer(hexFondConteneur, jetons.background, couple.fond.alpha);

    for (const enfant of descendantsQuiRepeignent(enfants, sombre)) {
      const hexFond = jetons[enfant.fond.jeton];
      if (!hexFond) { inconnus.push(`${nom} : --${enfant.fond.jeton}`); continue; }
      const fond = enfant.fond.alpha === 1 ? hexFond : composer(hexFond, dessous, enfant.fond.alpha);
      const encre = couple.encre.alpha === 1 ? hexEncre : composer(hexEncre, fond, couple.encre.alpha);
      compteurs.couples += 1;
      out.push({
        nom,
        conteneur: `<${noeud.balise}> bg-${couple.fond.jeton} text-${couple.encre.jeton}${sombre ? ' (portée dark)' : ''}`,
        enfant: enfant.origine,
        encre,
        fond,
        ratio: contraste(encre, fond),
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// L'AUTO-ÉPREUVE — une garde qui ne s'éprouve pas meurt en silence
// ────────────────────────────────────────────────────────────────────────────────────────────────

function autoEpreuve() {
  const presque = (a, b) => Math.abs(a - b) < 0.01;

  if (SEUIL !== 4.5) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — SEUIL vaut ${SEUIL} et non 4.5.\n`
      + '  4,5:1 est le seuil WCAG 2.1 §1.4.3 du TEXTE normal. Un libellé de bouton porte un mot,\n'
      + "  pas une icône : l'abaisser à 3 (seuil des objets graphiques) laisserait passer le défaut.",
    );
  }
  if (!presque(contraste('#ffffff', '#000000'), 21)) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — blanc sur noir ne rend plus 21:1.');
  }
  if (!presque(contraste('#c89a4a', '#ffffff'), 2.57)) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la valeur de contrôle partagée (#c89a4a sur blanc) a bougé.');
  }
  if (composer('#a85332', '#ffffff', 0.5) !== '#d4a999') {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la composition alpha ne rend plus la couleur mesurée.');
  }

  // Les jetons du défaut, tels que `globals.css` les déclare.
  for (const [jeton, attendu] of [['foreground', '#1f1812'], ['background', '#fcf9f3']]) {
    if (JETONS_CLAIR[jeton] !== attendu) {
      throw new Error(
        `AUTO-ÉPREUVE ÉCHOUÉE — --${jeton} clair vaut ${JETONS_CLAIR[jeton]} et non ${attendu}.\n`
        + '  Si le design system a bougé, remesurer AVANT de corriger cette ligne.',
      );
    }
  }
  if (JETONS_SOMBRE.foreground !== '#fcf9f3' || JETONS_SOMBRE.background !== '#1f1812') {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — le bloc `.dark` de globals.css n’est plus lu.');
  }

  // LA recette qui hérite : `outline` pose un fond et PAS d'encre. Si elle en posait une, ce
  // script n'aurait plus rien à attraper — et le dirait en vert.
  if (!VARIANTES || VARIANTES.size < 5) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — ${VARIANTES ? VARIANTES.size : 0} variante(s) lue(s) dans button.tsx.\n`
      + '  La table de `buttonVariants` a changé de forme : la lecture est aveugle, pas satisfaite.',
    );
  }
  const outline = VARIANTES.get('outline');
  if (!outline || !auRepos(outline, 'bg', false) || auRepos(outline, 'text', false)) {
    throw new Error(
      "AUTO-ÉPREUVE ÉCHOUÉE — la variante `outline` ne pose plus « un fond sans encre ».\n"
      + "  Si c'est VOULU (elle pose désormais son encre), le défaut de TCK-471 n'est plus\n"
      + '  atteignable par elle : le vérifier, puis mettre à jour cette épreuve avec sa date.',
    );
  }

  // LE défaut, recalculé : `text-background` du conteneur sur le `bg-background` de l'`outline`.
  const ratioDefaut = contraste(JETONS_CLAIR.background, JETONS_CLAIR.background);
  if (!presque(ratioDefaut, 1)) {
    throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — le défaut de TCK-471 ne rend plus 1,00:1 (${fmt(ratioDefaut)}).`);
  }

  // Le banc : le motif fautif doit être REFUSÉ, et une surface claire ordinaire ACCEPTÉE.
  const banc = (classes) => {
    const morceau = '<Button size="sm" variant="outline">Déverifier</Button>';
    const conteneur = classes.split(/\s+/);
    const sombre = conteneur.includes('dark');
    const jetons = sombre ? JETONS_SOMBRE : JETONS_CLAIR;
    const fondC = auRepos(conteneur, 'bg', sombre);
    const encreC = auRepos(conteneur, 'text', sombre);
    const enfant = descendantsQuiRepeignent(morceau, sombre)[0];
    if (!fondC || !encreC || !enfant) return null;
    return contraste(jetons[encreC.jeton], jetons[enfant.fond.jeton]);
  };
  // Et le contre-banc : le MÊME bouton qui annule le fond de sa variante et pose son encre ne doit
  // produire AUCUN couple — c'est la forme de `PropertyList.tsx`, trois faux rouges du 2026-08-30.
  if (descendantsQuiRepeignent(
    '<Button variant="outline" className="bg-transparent text-primary-foreground">Archiver</Button>',
    false,
  ).length !== 0) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — un bouton qui ANNULE le fond de sa variante et pose son encre est\n'
      + '  encore compté comme porteur du motif. La garde accuse du code juste.',
    );
  }
  // …et un élément qui repeint sans porter de texte non plus (la piste d'un interrupteur).
  if (descendantsQuiRepeignent('<span className="bg-primary"><span className="bg-card" /></span>', false).length !== 0) {
    throw new Error(
      "AUTO-ÉPREUVE ÉCHOUÉE — un élément SANS TEXTE est compté comme un couple de contraste.\n"
      + '  Une encre héritée par ce qui n’affiche rien n’est pas un défaut : c’est un faux rouge.',
    );
  }
  const fautif = banc('rounded-xl bg-foreground p-4 text-background');
  if (fautif === null || fautif >= SEUIL) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — le motif de TCK-471 PASSE le seuil (${fautif === null ? 'non vu' : fmt(fautif)}).\n`
      + "  C'est le défaut même que cette garde existe pour refuser : elle est vacuité.",
    );
  }
  const sain = banc('rounded-xl bg-card p-4 text-card-foreground');
  if (sain === null || sain < SEUIL) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — une surface claire ordinaire est REFUSÉE (${sain === null ? 'non vue' : fmt(sain)}).\n`
      + '  Une garde qui rougit sur ce qui va bien sera désarmée avant d’avoir servi.',
    );
  }
  const sombre = banc('dark rounded-xl bg-background p-4 text-foreground');
  if (sombre === null || sombre < SEUIL) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — la forme JUSTE (portée \`dark\`) est refusée (${sombre === null ? 'non vue' : fmt(sombre)}).\n`
      + '  C’est la correction de TCK-471 : si elle rougit, la garde interdit sa propre solution.',
    );
  }

  // La lecture de l'imbrication : elle doit voir l'enfant, et s'arrêter à la bonne fermante.
  const texte = '<section className="bg-foreground text-background"><div className="bg-card">a</div>'
    + '</section><div className="bg-muted">dehors</div>';
  const noeud = balises(texte).find((b) => b.litteraux.flat().includes('bg-foreground'));
  if (!noeud || !noeud.enfants().includes('bg-card') || noeud.enfants().includes('dehors')) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — le sous-arbre déborde la balise fermante (ou ne la voit pas).\n'
      + '  Un conteneur dont le sous-arbre déborde apparie des enfants qui ne sont pas les siens.',
    );
  }
}

autoEpreuve();

// ────────────────────────────────────────────────────────────────────────────────────────────────

const inconnus = [];
const compteurs = { conteneurs: 0, couples: 0 };
const tous = [];
for (const fichier of sourcesTsx(SRC)) {
  // `src/test/` et les `__tests__/` CITENT le motif interdit — le banc d'ablation de
  // `agency-detail-contrast.test.tsx` l'écrit en toutes lettres pour prouver qu'il est refusé.
  // Une garde qui rougit sur la preuve de sa propre efficacité se fait désarmer avant d'avoir servi.
  const relatif = relative(SRC, fichier);
  if (relatif.startsWith('test/') || relatif.split('/').includes('__tests__')) continue;
  tous.push(...couplesDuFichier(fichier, inconnus, compteurs));
}

const fautifs = tous.filter((c) => c.ratio < SEUIL);

if (REPORT) {
  console.log(`Encre HÉRITÉE sur fond REPEINT — seuil ${SEUIL}:1 (WCAG 1.4.3, texte)\n`);
  for (const c of [...tous].sort((a, b) => a.ratio - b.ratio)) {
    console.log(`  ${c.ratio >= SEUIL ? '✓' : '✗'} ${fmt(c.ratio).padStart(8)}  ${c.nom}`);
    console.log(`             ${c.conteneur}  →  ${c.enfant}`);
    console.log(`             encre ${c.encre} sur fond ${c.fond}`);
  }
  const parJeton = new Map();
  for (const i of inconnus) parJeton.set(i.split(' : ')[1], (parJeton.get(i.split(' : ')[1]) ?? 0) + 1);
  console.log(`\n  jetons non résolus (comptés, non mesurés) : ${[...parJeton].map(([j, n]) => `${j}×${n}`).join(', ') || 'aucun'}`);
  console.log(`  ${compteurs.conteneurs} conteneurs, ${compteurs.couples} couples\n`);
}

const nonToleres = fautifs.filter((c) => !TOLERES.has(`${c.nom} · ${c.enfant}`));
if (nonToleres.length > 0) {
  console.error(`✗ Encre héritée illisible — ${nonToleres.length} couple(s) sous ${SEUIL}:1 :\n`);
  for (const c of nonToleres) {
    console.error(`    ${c.nom}`);
    console.error(`      ${c.conteneur}`);
    console.error(`      → ${c.enfant}`);
    console.error(`      encre ${c.encre} sur fond ${c.fond} = ${fmt(c.ratio)}\n`);
  }
  console.error('  ⚠ Un couple `bg-<X> text-<Y>` sur un CONTENEUR retourne deux propriétés, il ne');
  console.error('    retourne pas les jetons : tout descendant qui repeint son fond lit encore la');
  console.error('    palette de départ tout en héritant votre encre. La forme juste est la classe');
  console.error('    `dark` — une SURFACE sombre, pas un couple retourné — comme le font');
  console.error('    `SuperAdminSidebar.tsx` et `SuperAdminTopbar.tsx`. À défaut, poser une encre');
  console.error('    explicite sur le descendant.');
  process.exit(1);
}

/*
 * L'AUTRE SENS DU CLIQUET, ajouté par TCK-481 : une tolérance qui ne désigne plus rien.
 *
 * Le cliquet refusait déjà qu'un couple SORTE de la liste sans être corrigé. Il laissait passer
 * l'inverse — une entrée pour un couple corrigé — et ça n'est pas anodin : la ligne reste, elle
 * cite une mesure devenue fausse, et le jour où le défaut revient elle l'absorbe SANS UN MOT.
 * *Une tolérance qui ne correspond à aucun défaut mesuré n'est pas une tolérance, c'est une porte.*
 */
const perimees = [...TOLERES].filter((e) => !fautifs.some((c) => `${c.nom} · ${c.enfant}` === e));
if (perimees.length > 0) {
  console.error(`✗ TOLÉRANCE PÉRIMÉE — ${perimees.length} entrée(s) ne désignent aucun couple sous ${SEUIL}:1 :\n`);
  for (const e of perimees) console.error(`    ${e}`);
  console.error('\n  Soit le couple a été CORRIGÉ — retirer l’entrée, dans le diff qui le corrige ;');
  console.error('  soit la lecture ne le voit plus, et c’est la garde qu’il faut regarder, pas la liste.');
  process.exit(1);
}

const ecart = Math.abs(compteurs.conteneurs - CONTENEURS_ATTENDUS) / CONTENEURS_ATTENDUS;
if (ecart > TOLERANCE_CONTENEURS) {
  console.error(
    `✗ CLIQUET — ${compteurs.conteneurs} conteneur(s) lus, alors que le relevé du 2026-08-30 en`
    + ` donnait ${CONTENEURS_ATTENDUS} (±${Math.round(TOLERANCE_CONTENEURS * 100)} %).`,
  );
  console.error('  Ce chiffre échoue dans LES DEUX SENS, et c’est le sens descendant qui compte :');
  console.error('  une garde à lecture de texte meurt en ne trouvant plus rien, pas en rougissant.');
  console.error('  Si l’écart est VOULU, corriger `CONTENEURS_ATTENDUS` ici, avec sa date.');
  process.exit(1);
}

const mesures = tous.filter((c) => !TOLERES.has(`${c.nom} · ${c.enfant}`));
console.log(
  `✓ Encre héritée : ${mesures.length} couple(s) mesuré(s) ≥ ${SEUIL}:1 sur `
  + `${compteurs.conteneurs} conteneur(s) « bg + text »`
  + (mesures.length > 0 ? `, minimum ${fmt(Math.min(...mesures.map((c) => c.ratio)))}` : '')
  + (TOLERES.size > 0 ? ` — ${TOLERES.size} couple(s) TOLÉRÉ(s), cf. la liste du script` : '')
  + (inconnus.length > 0 ? `, ${inconnus.length} jeton(s) non résolu(s), comptés et non mesurés` : '')
  + '.',
);
