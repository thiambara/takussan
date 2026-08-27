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
 * La garde recalcule donc au lieu de croire. Elle lit :
 *
 *   1. `takussan-web/src/components/charts/palette.ts` — QUELS jetons servent de couleur de série.
 *      La palette est la source ; énumérer `1..5` ici ferait mesurer des jetons que le dépôt
 *      n'emploie pas, et surtout ferait rougir `--chart-3`, délibérément écarté.
 *   2. `takussan-web/src/app/globals.css` — les valeurs de `--chart-*` et de `--card`, dans
 *      `:root` (clair) ET dans `.dark` (sombre). **Les deux thèmes sont mesurés** : le défaut
 *      trouvé le 2026-08-27 (`--chart-3` à 2,57:1) n'existait qu'en clair, et une garde qui
 *      n'aurait mesuré qu'un thème l'aurait manqué.
 *
 * Seuil : **3:1**, celui que WCAG 2.2 §1.4.11 (*Non-text Contrast*) pose pour un objet graphique
 * porteur de sens — ce qu'est une barre ou une courbe dont la couleur identifie la série. Ce n'est
 * PAS 4,5:1 : ce seuil-là vaut pour du texte, et l'appliquer ici interdirait la moitié d'une
 * charte sans raison.
 *
 * ⚠ Ce que cette garde NE prouve PAS, et il faut le dire : elle mesure une couleur de série contre
 * le FOND DE CARTE. Elle ne dit rien de deux séries voisines l'une contre l'autre (WCAG ne l'exige
 * pas ; la légende et l'ordre s'en chargent), ni d'une série posée sur une autre surface que
 * `--card`. C'est un plancher, pas un certificat.
 *
 * Relevé daté, avec ce script inchangé (2026-08-27, après TCK-374) :
 *
 *     clair (--card #ffffff)   chart-1 5,32  chart-2 5,51  chart-4 5,72  chart-5 17,53
 *     sombre (--card #2a2018)  chart-1 4,83  chart-2 4,48  chart-4 7,01  chart-5 15,16
 *     minimum = 4,48:1, marge = 1,49× le seuil
 *
 * Usage :
 *   node scripts/check-chart-contrast.mjs            # garde, sort en 1 sous le seuil
 *   node scripts/check-chart-contrast.mjs --report   # + le tableau complet
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SEUIL = 3;

const CSS = join(ROOT, 'takussan-web', 'src', 'app', 'globals.css');
const PALETTE = join(ROOT, 'takussan-web', 'src', 'components', 'charts', 'palette.ts');

/** Les thèmes à mesurer, et le SÉLECTEUR qui porte leurs valeurs dans `globals.css`. */
const THEMES = [
  { nom: 'clair', selecteur: ':root' },
  { nom: 'sombre', selecteur: '.dark' },
];

function lire(chemin) {
  try {
    return readFileSync(chemin, 'utf8');
  } catch {
    console.error(`✗ Fichier introuvable : ${relative(ROOT, chemin)}`);
    console.error('  Si le fichier a été déplacé, METTRE À JOUR ce script — ne pas le désactiver.');
    process.exit(1);
  }
}

/**
 * Le bloc de déclarations d'un sélecteur de premier niveau.
 *
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

// ── Quels jetons servent de couleur de série ? La palette le dit, pas ce script ────────────────
const palette = lire(PALETTE);
const numeros = [...new Set(
  [...palette.matchAll(/'(?:fill|stroke|bg)-chart-([0-9])'/g)].map((m) => m[1]),
)].sort();

if (numeros.length === 0) {
  console.error('✗ Aucun jeton de série trouvé dans charts/palette.ts.');
  console.error('  Une palette qui ne déclare plus rien n’est pas « conforme », elle est absente.');
  process.exit(1);
}

const css = lire(CSS);
const echecs = [];
const lignes = [];

for (const { nom, selecteur } of THEMES) {
  const source = bloc(css, selecteur);
  const card = jeton(source, 'card');
  if (!card) {
    console.error(`✗ \`--card\` introuvable dans \`${selecteur}\` de globals.css.`);
    process.exit(1);
  }
  for (const n of numeros) {
    const couleur = jeton(source, `chart-${n}`);
    if (!couleur) {
      echecs.push(`--chart-${n} n’est pas déclaré dans \`${selecteur}\` (thème ${nom})`);
      continue;
    }
    const ratio = contraste(couleur, card);
    lignes.push({ nom, n, couleur, card, ratio });
    if (ratio < SEUIL) {
      echecs.push(
        `--chart-${n} (${couleur}) rend ${ratio.toFixed(2)}:1 sur --card (${card}) en thème ${nom}`,
      );
    }
  }
}

if (REPORT) {
  console.log(`Contraste des couleurs de série sur --card — seuil ${SEUIL}:1 (WCAG 1.4.11)\n`);
  for (const { nom, selecteur } of THEMES) {
    const duTheme = lignes.filter((l) => l.nom === nom);
    if (duTheme.length === 0) continue;
    console.log(`  ${nom} (${selecteur}, --card ${duTheme[0].card})`);
    for (const l of duTheme) {
      const verdict = l.ratio >= SEUIL ? '✓' : '✗';
      console.log(`      ${verdict} --chart-${l.n}  ${l.couleur}  ${l.ratio.toFixed(2)}:1`);
    }
  }
  const min = Math.min(...lignes.map((l) => l.ratio));
  console.log(`\n  minimum ${min.toFixed(2)}:1 — marge ${(min / SEUIL).toFixed(2)}× le seuil\n`);
}

if (echecs.length > 0) {
  console.error(`✗ Contraste des séries sous le seuil de ${SEUIL}:1 (WCAG 2.2 §1.4.11) :\n`);
  for (const e of echecs) console.error(`    ${e}`);
  console.error('\n  Deux corrections possibles, et une seule est la bonne selon le cas :');
  console.error('    · le JETON est trop clair pour ce thème → corriger sa valeur dans globals.css,');
  console.error('      ce qui le change PARTOUT (c’est une décision de charte) ;');
  console.error('    · le jeton est bon ailleurs mais pas en série → le retirer des tables de');
  console.error('      `charts/palette.ts`, comme --chart-3 l’est depuis TCK-374.');
  process.exit(1);
}

console.log(
  `✓ Contraste des séries : ${lignes.length} mesures ≥ ${SEUIL}:1 `
  + `(${numeros.length} jetons × ${THEMES.length} thèmes).`,
);
