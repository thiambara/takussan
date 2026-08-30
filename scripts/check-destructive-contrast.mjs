#!/usr/bin/env node
/**
 * Garde du CONTRASTE DU JETON `--destructive` — TCK-480.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, ET POURQUOI DEUX TICKETS L'ONT MANQUÉ EN LE TOUCHANT
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `--destructive` valait `oklch(0.577 0.245 27.325)` — `#e7000b` rendu, le rouge par défaut de
 * shadcn, jamais confronté à la palette Lin. TCK-471 et TCK-472 l'ont heurté **séparément**, sur
 * des écrans sans rapport, en mesurant autre chose : 3,41 – 3,99:1 pour le ton `danger` de
 * `StatusBadge` sur ses 7 surfaces, ~4,0:1 pour la variante `destructive` de `Button`.
 * *Deux relevés indépendants qui tombent sur le même chiffre décrivent un jeton, pas un écran.*
 *
 * ⚠ Et un correctif d'écran ne pouvait pas y arriver : TCK-471 a fait passer le bouton
 * « Suspendre » de 3,48 à **4,48:1** en corrigeant son conteneur. Sous le seuil, et assez près
 * pour que le chiffre cesse d'avoir l'air faux. *Approcher un seuil est pire que le rater
 * franchement — le second se voit, le premier se plaide.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE — ET POURQUOI LE JEU D'APLATS EST DÉRIVÉ, JAMAIS ÉCRIT
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Pour chaque thème, l'encre `--destructive` est mesurée sur :
 *
 *   · les trois surfaces sur lesquelles il se pose — `--background`, `--card` et `--muted`.
 *     **Les trois sont exigées** : en clair `--background` est toujours pire que `--card`, en
 *     sombre toujours meilleur, et `--muted` majore les deux. *N'en mesurer qu'une donne un
 *     classement faux* — et n'en mesurer que deux, comme cette garde l'a d'abord fait, rend un
 *     vert sur un ton `danger` à 4,10:1 (cf. la note de `SURFACES`).
 *   · SON PROPRE APLAT, à chacun des poids que le code écrit réellement.
 *
 * Ce dernier point est la leçon du ticket. Le sombre « passait » — sur les surfaces NUES, qui
 * sont celles qu'on pense à mesurer. Il rendait **3,39:1** dès que l'encre se posait sur
 * `bg-destructive/30`, un aplat de son propre jeton. *Un jeton ne se mesure pas sur les surfaces
 * du DS, il se mesure sur les surfaces où le code le pose.*
 *
 * D'où un jeu d'aplats **dérivé du source, séparé par thème** (`dark:` compte pour le sombre) :
 * un `/25` écrit demain est mesuré demain, sans que personne ait à penser à cette garde. Une
 * liste écrite ici serait juste le jour où on l'écrit — c'est le défaut que la moitié des gardes
 * de ce dépôt existent pour attraper ailleurs.
 *
 * ⚠ **Le relevé part des LITTÉRAUX, jamais des importateurs** (AC2 du ticket, leçon de TCK-472) :
 * `text-destructive` et `bg-destructive/NN` tels qu'ils apparaissent dans une liste de classes.
 * *Un relevé qui part des importateurs ne voit que les usages corrects.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LES DEUX CONTRÔLES — ET POURQUOI ILS NE SE SÉPARENT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   **A — la VALEUR.** Chaque couple (encre, surface) ≥ 4,5:1, dans les deux thèmes.
 *
 *   **B — le PLAFOND.** Aucun aplat portant `text-destructive` au-delà de `/10` (cf. la note
 *   d'`APLAT_MAX` : c'est le thème sombre qui fixe ce chiffre, pas le clair).
 *
 * Le correctif de TCK-480 est la conjonction des deux : la valeur seule aurait exigé, en sombre,
 * un rose délavé (`#ffb3af`) pour tenir un aplat `/30` ; le plafond seul n'aurait rien réparé sur
 * les surfaces nues. **Séparer les deux contrôles laisserait passer chacun des deux demi-remèdes**
 * — et le contrôle A, à lui seul, rougirait alors pour une raison que son message n'explique pas.
 *
 * ⚠ Le contrôle B ne regarde QUE les aplats qui portent du texte. Un `ring-destructive/40` ou un
 * `border-destructive/50` ne sont pas concernés : ils ne portent pas de libellé, et le seuil d'un
 * indicateur non textuel n'est pas celui d'un texte (3:1, WCAG 1.4.11). *Confondre les deux
 * seuils est exactement l'erreur qui a laissé passer le défaut de `ProfileBadge`.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VOIT PAS, DÉCLARÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 *  · **Le texte posé SUR `--destructive` plein** (`bg-destructive text-white` du badge de
 *    `ChatWidget`) : l'encre n'y est pas le jeton, elle est dessus. Mesuré au passage et **sous
 *    le seuil en thème sombre — 2,89:1 avant ce ticket, 2,77:1 après** ; défaut préexistant,
 *    hors du périmètre d'AC1, ouvert en ticket plutôt que corrigé en douce.
 *  · **La surface réelle d'un `text-destructive` nu** : la garde l'éprouve sur les trois
 *    surfaces les plus défavorables, elle ne remonte pas l'arbre JSX. Un conteneur exotique lui
 *    échappe — c'est `check-heritage-encre.mjs` qui regarde l'héritage, pas celle-ci.
 *  · **Les états au survol** ne sont lus que par leur aplat : la garde compare des poids, pas des
 *    parcours. *Le survol a coûté 1,00:1 à TCK-481 — il est mesuré ici par le contrôle B, pas
 *    par une simulation.*
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bloc, composer, contraste, jeton, verifierControles } from './lib/contraste.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'takussan-web', 'src');
const CSS = join(SRC, 'app', 'globals.css');
const REPORT = process.argv.includes('--report');

/** WCAG 1.4.3 AA — texte normal. Le jeton porte des LIBELLÉS, pas des icônes. */
const SEUIL = 4.5;

/**
 * Le plafond du contrôle B. Cf. l'en-tête : il ne vaut que pour les aplats qui PORTENT du texte.
 *
 * ⚠ **10 et non 15, et c'est le thème SOMBRE qui l'impose.** En clair, un aplat de l'encre
 * assombrit la surface : chaque 5 % coûte ~0,25 de ratio, et /15 tenait (5,00:1). En sombre,
 * l'encre est CLAIRE — son aplat ÉCLAIRCIT la surface et se rapproche d'elle : sur `bg-muted`
 * plein, le pire fond du thème, /15 rendait 4,16:1 quand /10 rend 4,55:1. *Le même réglage ne
 * coûte pas la même chose des deux côtés : un plafond choisi dans un seul thème est un plafond
 * choisi dans le mauvais.*
 */
const APLAT_MAX = 10;

const THEMES = [
  { nom: 'clair', selecteur: ':root', sombre: false },
  { nom: 'sombre', selecteur: '.dark', sombre: true },
];

/**
 * Les surfaces sur lesquelles l'encre se pose réellement.
 *
 * ⚠ **`muted` a été ajouté APRÈS coup, et son absence avait déjà produit un faux vert.** La
 * garde n'a d'abord porté que `background` et `card` — les deux surfaces ordinaires, celles que
 * `check-profile-badge-contrast.mjs` mesure — et elle est passée au vert sur un jeu de valeurs
 * qui laissait le ton `danger` de `StatusBadge` à **4,10:1** en sombre. Le ton se pose sur les
 * lignes `bg-muted` de `kyc-queue.tsx` et `moderation.tsx`, et `--muted` est la surface la plus
 * CLAIRE du thème sombre, donc la pire pour une encre claire.
 *
 * *Un jeu de surfaces hérité d'une autre garde décrit le périmètre de cette autre garde.* Les
 * sept surfaces réelles sont énumérées par `StatusBadge.contraste-tck-450.test.tsx` ; `muted`
 * plein les majore toutes, en clair comme en sombre — vérifié le 2026-08-30, c'est le pire fond
 * des deux thèmes.
 */
const SURFACES = ['background', 'card', 'muted'];

// ── La LECTURE du source ────────────────────────────────────────────────────────────────────────

function fichiers(rep) {
  const out = [];
  for (const e of readdirSync(rep)) {
    const p = join(rep, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Toute chaîne littérale du source — c'est là que vivent les listes de classes. */
const CHAINES = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/**
 * Les aplats de `--destructive` qui portent `text-destructive`, séparés par thème.
 *
 * ⚠ La séparation par thème n'est pas cosmétique : `dark:bg-destructive/20` ne s'applique QU'EN
 * sombre, et le mesurer en clair inventerait un couple qui n'existe pas. Un couple inventé n'est
 * pas une prudence — c'est un rouge que personne ne saura reproduire à l'écran.
 */
function aplatsDuCode() {
  const parTheme = { clair: new Map(), sombre: new Map() };
  for (const f of fichiers(SRC)) {
    const src = readFileSync(f, 'utf8');
    for (const [, , contenu] of src.matchAll(CHAINES)) {
      if (!/\btext-destructive\b/.test(contenu)) continue;
      for (const m of contenu.matchAll(/(dark:)?(?:[a-z-]+:)*bg-destructive(?:\/(\d{1,3}))?\b/g)) {
        const theme = m[1] ? 'sombre' : 'clair';
        const poids = m[2] === undefined ? 100 : Number(m[2]);
        const ou = `${relative(ROOT, f)}`;
        if (!parTheme[theme].has(poids)) parTheme[theme].set(poids, new Set());
        parTheme[theme].get(poids).add(ou);
      }
    }
    // Une liste de classes sans `dark:` s'applique AUSSI en sombre : le thème ne retire rien,
    // il ajoute. Un `bg-destructive/15` nu est donc un couple des DEUX thèmes.
  }
  for (const [poids, ou] of parTheme.clair) {
    if (!parTheme.sombre.has(poids)) parTheme.sombre.set(poids, new Set());
    for (const f of ou) parTheme.sombre.get(poids).add(f);
  }
  return parTheme;
}

// ── L'AUTO-ÉPREUVE ──────────────────────────────────────────────────────────────────────────────

/*
 * Ce que l'auto-épreuve refuse — chacune de ces amputations a rendu la garde muette au moins une
 * fois pendant son écriture, et aucune n'aurait fait rougir sans elle :
 *   · le seuil ramené sous 4,5 ;
 *   · le plafond relevé ;
 *   · une surface retirée de `SURFACES` ;
 *   · un thème retiré de `THEMES` ;
 *   · la lecture des aplats qui cesse de reconnaître `dark:` (elle rangerait alors un couple
 *     sombre en clair, où il est faux, et la garde rougirait pour la mauvaise raison) ;
 *   · le calcul lui-même, par les valeurs de contrôle partagées de `lib/contraste.mjs`.
 */
function autoEpreuve() {
  verifierControles();

  if (SEUIL !== 4.5) throw new Error(`SEUIL déplacé : ${SEUIL} au lieu de 4.5 (WCAG 1.4.3 AA, texte)`);
  if (APLAT_MAX !== 10) throw new Error(`APLAT_MAX déplacé : ${APLAT_MAX} au lieu de 10 — cf. sa note`);
  if (SURFACES.join(' ') !== 'background card muted')
    throw new Error(`SURFACES vaut « ${SURFACES.join(' ')} » — les trois sont exigées, cf. leur note : `
      + 'retirer --muted rend un vert sur un ton `danger` à 4,10:1.');
  if (THEMES.length !== 2) throw new Error('THEMES doit porter le clair ET le sombre');

  // La lecture doit ranger `dark:` en sombre, et un aplat nu dans les DEUX.
  const rangs = (contenu) => {
    const out = { clair: [], sombre: [] };
    for (const m of contenu.matchAll(/(dark:)?(?:[a-z-]+:)*bg-destructive(?:\/(\d{1,3}))?\b/g))
      out[m[1] ? 'sombre' : 'clair'].push(m[2] === undefined ? 100 : Number(m[2]));
    return out;
  };
  const r = rangs('bg-destructive/10 text-destructive dark:bg-destructive/20 hover:bg-destructive/15');
  if (r.clair.join(',') !== '10,15' || r.sombre.join(',') !== '20') {
    throw new Error(`lecture des aplats cassée : clair=[${r.clair}] sombre=[${r.sombre}]`);
  }

  // Et la composition doit rendre le fond mesuré : un `/15` de #b70110 sur du blanc n'est pas
  // #b70110, c'est un rose pâle — c'est CETTE couleur que le seuil juge.
  const compose = composer('#b70110', '#ffffff', 0.15);
  if (compose === '#b70110' || contraste('#b70110', compose) < 4.5) {
    throw new Error(`composition cassée : ${compose}`);
  }
}

// ── LA MESURE ───────────────────────────────────────────────────────────────────────────────────

autoEpreuve();

const css = readFileSync(CSS, 'utf8');
const aplats = aplatsDuCode();
const echecs = [];
const lignes = [];

for (const theme of THEMES) {
  const source = bloc(css, theme.selecteur);
  const encre = jeton(source, 'destructive');
  if (!encre) {
    // Cf. `lib/contraste.mjs` : `null` veut dire « pas lisible », pas « absent ». C'est
    // exactement l'état d'où ce ticket est parti — un jeton en `oklch()` que deux gardes
    // comptaient sans le mesurer. On refuse de reconduire ce silence.
    echecs.push(
      `[${theme.nom}] --destructive n'est pas lisible en hexadécimal dans ${theme.selecteur}. ` +
        `Une couleur qu'on ne peut pas lire est une couleur qu'on ne mesure pas — et c'est ainsi ` +
        `que ce jeton a échoué pendant des mois (TCK-480).`,
    );
    continue;
  }

  const poidsDuTheme = [...aplats[theme.nom].keys()].sort((a, b) => a - b);

  // Contrôle B — le plafond.
  for (const poids of poidsDuTheme) {
    if (poids > APLAT_MAX) {
      const ou = [...aplats[theme.nom].get(poids)].sort().join(', ');
      echecs.push(
        `[${theme.nom}] APLAT TROP LOURD — bg-destructive/${poids} porte text-destructive (max /${APLAT_MAX}) : ${ou}`,
      );
    }
  }

  // Contrôle A — la valeur, sur les surfaces nues ET sur les aplats du code.
  for (const nom of SURFACES) {
    const fond = jeton(source, nom);
    if (!fond) {
      echecs.push(`[${theme.nom}] surface --${nom} illisible dans ${theme.selecteur}`);
      continue;
    }
    for (const poids of [0, ...poidsDuTheme]) {
      const surface = poids === 0 ? fond : composer(encre, fond, poids / 100);
      const r = contraste(encre, surface);
      const quoi = `--${nom}${poids === 0 ? '' : ` + /${poids}`}`;
      lignes.push({ theme: theme.nom, quoi, encre, surface, r });
      if (r < SEUIL) {
        echecs.push(
          `[${theme.nom}] ${encre} sur ${surface} (${quoi}) — ${r.toFixed(2)}:1, seuil ${SEUIL}`,
        );
      }
    }
  }
}

if (REPORT) {
  for (const theme of THEMES) {
    const l = lignes.filter((x) => x.theme === theme.nom);
    if (l.length === 0) continue;
    console.log(`\n  ${theme.nom} — encre ${l[0].encre}`);
    for (const x of l.sort((a, b) => a.r - b.r)) {
      console.log(`      ${x.r >= SEUIL ? '✓' : '✗'} ${x.quoi.padEnd(22)} sur ${x.surface}  ${x.r.toFixed(2)}:1`);
    }
  }
  const poids = Object.entries(aplats).map(([t, m]) => `${t} : ${[...m.keys()].sort((a, b) => a - b).map((p) => `/${p}`).join(' ')}`);
  console.log(`\n  aplats DÉRIVÉS du code — ${poids.join('   ·   ')}\n`);
}

if (echecs.length > 0) {
  console.error(`\n✗ --destructive : ${echecs.length} constat(s) sous le contrat de TCK-480 :\n`);
  for (const e of echecs) console.error(`    ${e}`);
  console.error(
    `\n  La valeur et le plafond des aplats se corrigent ENSEMBLE : le jeton seul exigerait, en\n` +
      `  sombre, un rose délavé pour tenir un aplat /30 ; le plafond seul ne réparerait rien sur\n` +
      `  les surfaces nues. Le raisonnement complet est en tête de globals.css.\n`,
  );
  process.exit(1);
}

const min = Math.min(...lignes.map((l) => l.r));
console.log(
  `✓ --destructive : ${lignes.length} couples RENDUS ≥ ${SEUIL}:1 (${THEMES.length} thèmes × ${SURFACES.length} surfaces × ses aplats), ` +
    `minimum ${min.toFixed(2)}:1 ; aucun aplat porteur de texte au-delà de /${APLAT_MAX}.`,
);
