#!/usr/bin/env node
/**
 * Garde du CONTRASTE DU COUPLE RENDU par `ProfileBadge` — TCK-444.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE SŒUR ET NON UN ÉLARGISSEMENT DE `check-chart-contrast.mjs`
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `check-chart-contrast.mjs` mesure les jetons `--chart-*` **NUS**, sur `--card` et
 * `--background`, au seuil de **3:1** — celui que WCAG 2.2 §1.4.11 pose pour un objet graphique
 * porteur de sens (une barre, une courbe). Elle était VERTE pendant que 12 couples de
 * `ProfileBadge` échouaient, et **son en-tête le disait déjà** : elle « ne dit rien [d']une série
 * posée sur une autre surface ». *Ce n'est pas un défaut de cette garde, c'est le périmètre
 * qu'elle annonce* — et c'est pourquoi celle-ci est une SŒUR et non un élargissement : elle mesure
 * autre chose (un couple composé), au seuil d'autre chose (4,5:1, du TEXTE), sur un périmètre
 * autre (`components/profile`, pas `components/{charts,reporting}`).
 *
 * ⚠ Confondre les deux seuils est exactement l'erreur qui a laissé passer le défaut : le badge
 * porte un MOT, pas une icône.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET CE QU'ELLE MESURE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   1. `takussan-web/src/components/profile/ProfileBadge.tsx` — la table `TYPE_COLOR` et le repli
 *      `FALLBACK_COLOR`, COMMENTAIRES DÉPOUILLÉS. Le dépouillement n'est pas un raffinement : le
 *      docblock de cette table CITE la recette interdite (`bg-chart-N/20 text-chart-N`) pour
 *      expliquer pourquoi elle l'est. Une garde qui rougit sur la documentation de sa propre règle
 *      se fait désarmer avant d'avoir servi — c'est la politique de `check-chart-contrast.mjs`,
 *      reprise ici pour la même raison.
 *   2. `takussan-web/src/app/globals.css` — les valeurs des jetons, dans `:root` ET dans `.dark`.
 *
 * Puis, pour chaque type × chaque thème × chaque surface : l'aplat est COMPOSÉ sur la surface
 * avant le calcul (un ratio pris sur la couleur nominale d'un `/20` ne mesure rien), l'encre est
 * composée sur cet aplat si elle porte elle-même un alpha, et le rapport WCAG est comparé à 4,5:1.
 *
 * **Les deux surfaces sont exigées, et ce n'est pas de la prudence** : en thème clair,
 * `--background` est TOUJOURS pire que `--card` ; en sombre, TOUJOURS meilleur. N'en mesurer
 * qu'une donne un classement faux. **Les deux thèmes aussi** : `--chart-3` est le pire jeton en
 * clair (2,87:1 sur son propre aplat) et correct en sombre — *une vérification faite dans un seul
 * thème conclut l'inverse de la vérité*.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE RELEVÉ, DATÉ — 2026-08-29, après correction de la recette
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *                       clair --card   clair --bg   sombre --card   sombre --bg
 *     agency_admin         13,32         12,71          11,27          12,45
 *     owner                13,40         12,79          11,45          12,75
 *     agent                14,16         13,54           9,85          10,88
 *     broker               13,32         12,74          10,24          11,41
 *     service_provider     11,50         10,97           8,10           8,99
 *     (repli)              14,87         14,87          12,53          12,53
 *
 * AVANT (`text-chart-N`), 12 couples sur 20 échouaient, minimum **2,87:1**.
 *
 * ⚠ TCK-444 annonçait **2,17:1** pour ce minimum. Les deux chiffres sont justes : 2,17 a été
 * mesuré le 2026-08-27 sur `--chart-3 = #c89a4a`, valeur que **TCK-404 a corrigée le même jour**
 * en `#ad8034`. Le tableau du ticket porte donc une valeur d'avant-correction pour cette seule
 * ligne ; les quatre autres sont inchangées à 0,02 près (arrondi entier de l'aplat composé).
 * *Une mesure sans sa date devient une croyance* — celle-ci a survécu douze heures.
 *
 * Usage :
 *   node scripts/check-profile-badge-contrast.mjs            # garde, sort en 1 sous le seuil
 *   node scripts/check-profile-badge-contrast.mjs --report   # + le tableau complet
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SRC = join(ROOT, 'takussan-web', 'src');
const BADGE = join(SRC, 'components', 'profile', 'ProfileBadge.tsx');
const CSS = join(SRC, 'app', 'globals.css');

/**
 * Le seuil WCAG 2.1 §1.4.3 AA — TEXTE NORMAL.
 *
 * ⚠ **Ce n'est PAS 3:1**, et l'auto-épreuve l'ancre. Le badge rend un libellé de 11 px en
 * `font-medium` : ni « grand texte » (≥ 24 px, ou ≥ 18,66 px gras), ni objet graphique. L'abaisser
 * à 3 ferait passer huit des douze couples que ce ticket corrige.
 */
const SEUIL = 4.5;

const THEMES = [
  { nom: 'clair', selecteur: ':root' },
  { nom: 'sombre', selecteur: '.dark' },
];

const SURFACES = [
  { jeton: 'card', libelle: '--card' },
  { jeton: 'background', libelle: '--background' },
];

/**
 * Les types de profil que la table DOIT couvrir.
 *
 * ⚠ Ce n'est pas une énumération décorative : c'est la moitié « laisser passer » de la garde.
 * Sans elle, retirer une ligne de `TYPE_COLOR` ferait sortir le script en 0 avec un message
 * d'apparence saine (« 16 mesures ≥ 4,5:1 »). Un ensemble amputé n'est pas « conforme ».
 * La source de vérité du CÔTÉ TYPES reste `src/types/profile.ts`, et `ProfileBadge.test.tsx`
 * comme `profile-types.parity.test.ts` la gardent ; ici on garde le COUPLE de couleurs.
 */
const TYPES_ATTENDUS = ['agency_admin', 'owner', 'agent', 'broker', 'service_provider'];

/**
 * Le nombre de mesures soumises au seuil : (5 types + 1 repli) × 2 thèmes × 2 surfaces.
 *
 * ⚠ **Cliquet à DEUX sens.** Une garde à lecture de texte ne meurt pas en rougissant, elle meurt
 * en ne trouvant plus rien : un compte qui BAISSE est le seul signal que la lecture a cessé de
 * voir ce qu'elle voyait hier. S'il change pour de bon (un type ajouté), corriger ce chiffre ICI,
 * avec sa date.
 */
const MESURES_ATTENDUES = 24;

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
 * Le texte SANS ses commentaires, chaînes INTACTES — même implémentation que
 * `check-chart-contrast.mjs`, et pour la même raison (cf. l'en-tête). On parcourt caractère par
 * caractère : un `//` DANS une chaîne n'ouvre pas un commentaire.
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
    if (c === '/' && texte[i + 1] === '/') { while (i < texte.length && texte[i] !== '\n') i += 1; continue; }
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

// ── L'arithmétique des couleurs, avec les MÊMES valeurs de contrôle que check-chart-contrast ────
/*
 * ⚠ Ce dépôt porte désormais TROIS implémentations du calcul WCAG : ce script,
 * `check-chart-contrast.mjs` et `src/test/contraste-wcag.ts`. La dette est connue (TCK-371, notes
 * de revue) et n'est pas résolue ici. Ce qui l'est : les trois partagent les MÊMES valeurs de
 * contrôle (21:1 blanc sur noir, 2,57:1 pour #c89a4a sur blanc, la composition à 50 %), de sorte
 * qu'une divergence de calcul fasse rougir au lieu de se propager en silence.
 */
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

/** La couleur RÉELLEMENT rendue par `<couleur>/<alpha>` posée sur `fond`. */
function composer(hex, fond, alpha) {
  const canaux = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [f, d] = [canaux(hex), canaux(fond)];
  return `#${f.map((v, i) => Math.round(v * alpha + d[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

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

// ── La LECTURE de la recette ────────────────────────────────────────────────────────────────────

/** `bg-chart-1/20`, `text-foreground`, `bg-muted` → `{ prefixe, jeton, alpha }`. */
function utilitaire(classe) {
  const m = /^(bg|text)-([a-z0-9-]+?)(?:\/(\d{1,3}))?$/.exec(classe);
  if (!m) return null;
  const alpha = m[3] === undefined ? 1 : Number(m[3]) / 100;
  if (!(alpha > 0 && alpha <= 1)) return null;
  return { prefixe: m[1], jeton: m[2], alpha };
}

/** Les couples déclarés : `TYPE_COLOR` en entier, plus le repli. */
function recettes(texte) {
  const out = [];
  const table = /const TYPE_COLOR[^{]*\{([\s\S]*?)\n\};/.exec(texte);
  if (table) {
    for (const m of table[1].matchAll(/([a-z_]+)\s*:\s*'([^']*)'/g)) {
      out.push({ nom: m[1], classes: m[2] });
    }
  }
  const repli = /const FALLBACK_COLOR\s*=\s*'([^']*)'/.exec(texte);
  if (repli) out.push({ nom: '(repli)', classes: repli[1] });
  return out;
}

// ────────────────────────────────────────────────────────────────────────────────────────────
// L'AUTO-ÉPREUVE — une garde qui ne s'éprouve pas meurt en silence
// ────────────────────────────────────────────────────────────────────────────────────────────

function autoEpreuve() {
  if (SEUIL !== 4.5) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — SEUIL vaut ${SEUIL} et non 4.5.\n`
      + "  4,5:1 est le seuil de WCAG 2.1 §1.4.3 pour du TEXTE normal. Le badge porte un mot, pas\n"
      + "  une icône : l'abaisser à 3 (le seuil des objets graphiques) ferait passer huit des douze\n"
      + '  couples que TCK-444 corrige. Confondre les deux est ce qui a laissé passer le défaut.',
    );
  }
  const selecteurs = THEMES.map((t) => t.selecteur).join(' ');
  if (selecteurs !== ':root .dark') {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — THEMES vaut « ${selecteurs} » au lieu de « :root .dark ».\n`
      + '  `--chart-3` est le pire jeton en clair et correct en sombre : une vérification faite\n'
      + "  dans un seul thème conclut l'inverse de la vérité.",
    );
  }
  if (SURFACES.map((s) => s.jeton).join(' ') !== 'card background') {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — les deux surfaces ne sont plus mesurées.\n'
      + "  En clair `--background` est toujours PIRE que `--card`, en sombre toujours MEILLEUR :\n"
      + "  n'en mesurer qu'une, c'est choisir celle qui arrange.",
    );
  }

  const presque = (a, b) => Math.abs(a - b) < 0.01;
  if (!presque(contraste('#ffffff', '#000000'), 21)) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — blanc sur noir ne rend plus 21:1.');
  }
  if (!presque(contraste('#c89a4a', '#ffffff'), 2.57)) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la valeur de contrôle partagée (#c89a4a sur blanc) a bougé.');
  }
  if (composer('#a85332', '#ffffff', 0.5) !== '#d4a999') {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la composition alpha ne rend plus la couleur mesurée.');
  }
  // LE défaut de TCK-444, recalculé : du texte sur un aplat à 20 % de sa propre couleur.
  if (!presque(contraste('#ad8034', composer('#ad8034', '#ffffff', 0.2)), 2.87)) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — `bg-chart-3/20 text-chart-3` ne rend plus 2,87:1 sur `--card` clair.\n'
      + "  C'est la mesure qui a motivé ce ticket. Si elle bouge, c'est le CALCUL qui a changé.",
    );
  }

  // La lecture : ce qu'elle doit voir, et ce qu'elle doit refuser.
  const lu = recettes("const TYPE_COLOR: X = {\n  a: 'bg-chart-1/20 text-foreground',\n};\nconst FALLBACK_COLOR = 'bg-muted text-foreground';\n");
  if (lu.length !== 2 || lu[0].nom !== 'a' || lu[1].nom !== '(repli)') {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la lecture de `TYPE_COLOR` / `FALLBACK_COLOR` est cassée.');
  }
  if (recettes(sansCommentaires("/* a: 'bg-chart-9/20 text-chart-9' */\nconst TYPE_COLOR = {\n  a: 'bg-muted text-foreground',\n};")).length !== 1) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — un commentaire est compté comme du code.\n'
      + '  Le docblock de `TYPE_COLOR` CITE la recette interdite pour expliquer pourquoi elle\n'
      + "  l'est. Une garde qui rougit dessus sera désarmée avant d'avoir servi.",
    );
  }
  for (const [classe, attendu] of [
    ['bg-chart-1/20', { prefixe: 'bg', jeton: 'chart-1', alpha: 0.2 }],
    ['text-foreground', { prefixe: 'text', jeton: 'foreground', alpha: 1 }],
  ]) {
    const u = utilitaire(classe);
    if (!u || u.prefixe !== attendu.prefixe || u.jeton !== attendu.jeton || Math.abs(u.alpha - attendu.alpha) > 1e-9) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — « ${classe} » n'est plus interprété.`);
    }
  }
  for (const classe of ['rounded-full', 'text-[11px]', 'bg-chart-1/0', 'px-2']) {
    if (utilitaire(classe) !== null && utilitaire(classe).jeton !== '[11px]') {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — « ${classe} » est pris pour une couleur.`);
    }
  }
  // Et le cœur de l'AC2 : la recette fautive DOIT être refusée par la mesure.
  const aplat = composer('#ad8034', '#ffffff', 0.2);
  if (contraste('#ad8034', aplat) >= SEUIL) {
    throw new Error(
      'AUTO-ÉPREUVE ÉCHOUÉE — la recette `bg-chart-N/20 text-chart-N` PASSE le seuil.\n'
      + "  C'est le défaut même que cette garde existe pour refuser.",
    );
  }
}

autoEpreuve();

// ────────────────────────────────────────────────────────────────────────────────────────────
// LA MESURE
// ────────────────────────────────────────────────────────────────────────────────────────────

const texte = sansCommentaires(lire(BADGE));
const css = lire(CSS);
const declarees = recettes(texte);
const echecs = [];
const lignes = [];

const nommees = declarees.map((r) => r.nom);
for (const attendu of TYPES_ATTENDUS) {
  if (!nommees.includes(attendu)) {
    echecs.push(
      `« ${attendu} » n'a plus de couleur dans \`TYPE_COLOR\` — la garde mesurerait un ensemble\n`
      + "      amputé et sortirait en 0 avec un message d'apparence saine.",
    );
  }
}
if (!nommees.includes('(repli)')) {
  echecs.push('`FALLBACK_COLOR` a disparu : le repli est la troisième garde, celle qui tient en PRODUCTION.');
}

for (const { nom, classes } of declarees) {
  const utilitaires = classes.split(/\s+/).map(utilitaire).filter(Boolean);
  const fond = utilitaires.find((u) => u.prefixe === 'bg');
  const encre = utilitaires.find((u) => u.prefixe === 'text');
  if (!fond || !encre) {
    echecs.push(`« ${nom} » ne déclare pas un COUPLE fond+encre (« ${classes} ») — rien à mesurer.`);
    continue;
  }
  for (const { nom: theme, selecteur } of THEMES) {
    const source = bloc(css, selecteur);
    for (const { jeton: nomSurface, libelle } of SURFACES) {
      const surface = jeton(source, nomSurface) ?? jeton(bloc(css, ':root'), nomSurface);
      const hexFond = jeton(source, fond.jeton) ?? jeton(bloc(css, ':root'), fond.jeton);
      const hexEncre = jeton(source, encre.jeton) ?? jeton(bloc(css, ':root'), encre.jeton);
      if (!surface || !hexFond || !hexEncre) {
        echecs.push(
          `« ${nom} » : jeton introuvable dans \`${selecteur}\` (`
          + `${[[nomSurface, surface], [fond.jeton, hexFond], [encre.jeton, hexEncre]]
            .filter(([, v]) => !v).map(([k]) => `--${k}`).join(', ')}).`,
        );
        continue;
      }
      const aplat = fond.alpha === 1 ? hexFond : composer(hexFond, surface, fond.alpha);
      const posee = encre.alpha === 1 ? hexEncre : composer(hexEncre, aplat, encre.alpha);
      const ratio = contraste(posee, aplat);
      lignes.push({ nom, theme, libelle, classes, aplat, posee, ratio });
      if (ratio < SEUIL) {
        echecs.push(
          `« ${nom} » (${classes}) rend ${ratio.toFixed(2)}:1 en thème ${theme} sur ${libelle} `
          + `— encre ${posee} sur aplat ${aplat}`,
        );
      }
    }
  }
}

if (REPORT) {
  console.log(`Contraste du COUPLE RENDU par ProfileBadge — seuil ${SEUIL}:1 (WCAG 1.4.3, texte)\n`);
  for (const { nom: theme } of THEMES) {
    for (const { libelle } of SURFACES) {
      const duGroupe = lignes.filter((l) => l.theme === theme && l.libelle === libelle);
      if (duGroupe.length === 0) continue;
      console.log(`  ${theme} (${libelle})`);
      for (const l of duGroupe) {
        console.log(`      ${l.ratio >= SEUIL ? '✓' : '✗'} ${l.nom.padEnd(18)} ${l.posee} sur ${l.aplat}  ${l.ratio.toFixed(2)}:1`);
      }
    }
  }
  if (lignes.length > 0) {
    const min = Math.min(...lignes.map((l) => l.ratio));
    console.log(`\n  minimum ${min.toFixed(2)}:1 — marge ${(min / SEUIL).toFixed(2)}× le seuil\n`);
  }
}

if (echecs.length > 0) {
  console.error(`✗ Contraste de ProfileBadge — ${echecs.length} défaut(s) :\n`);
  for (const e of echecs) console.error(`    ${e}`);
  console.error('\n  ⚠ Le motif `bg-chart-N/20 text-chart-N` — du texte sur un aplat de sa PROPRE');
  console.error('    couleur — ne peut pas atteindre 4,5:1 : le contraste y est borné par celui du');
  console.error('    jeton nu sur la surface, qui vaut 3,55:1 pour --chart-3. Aucune valeur d’alpha');
  console.error('    ne le sauve. Garder l’aplat (il porte la CATÉGORIE) et prendre une encre qui');
  console.error("    s'inverse avec le thème : `text-foreground`.");
  process.exit(1);
}

if (lignes.length !== MESURES_ATTENDUES) {
  console.error(
    `✗ CLIQUET — ${lignes.length} mesure(s), alors que le cliquet dit ${MESURES_ATTENDUES}.`,
  );
  console.error('  Ce chiffre échoue dans LES DEUX SENS, et c’est le sens descendant qui compte :');
  console.error('  une garde à lecture de texte meurt en ne trouvant plus rien, pas en rougissant.');
  console.error('  Si l’écart est VOULU (un type de profil ajouté), corriger `MESURES_ATTENDUES`');
  console.error('  dans `scripts/check-profile-badge-contrast.mjs`, avec sa date.');
  process.exit(1);
}

const min = Math.min(...lignes.map((l) => l.ratio));
console.log(
  `✓ ProfileBadge : ${lignes.length} couples RENDUS ≥ ${SEUIL}:1 `
  + `(${declarees.length} recettes × ${THEMES.length} thèmes × ${SURFACES.length} surfaces), `
  + `minimum ${min.toFixed(2)}:1.`,
);
