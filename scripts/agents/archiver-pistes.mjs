#!/usr/bin/env node
/**
 * L'ARCHIVEUR du fichier de pistes — amendement d'ADR-0066 du 2026-10-24, « l'archive des pistes
 * closes ». Sans modèle : rien n'y décide, tout s'y compare.
 *
 * ─── Pourquoi il existe ──────────────────────────────────────────────────────────────────────
 *
 * Mesuré sur `pre-dev` le 2026-10-24 : le fichier de pistes pèse 4,9 Mo pour 20 900 lignes, dont
 * 4,4 Mo d'entrées closes que plus aucun agent n'écrit. 2 205 commits l'ont touché en 7 jours :
 * chaque essai de fusion, chaque conflit et chaque réparation porte sur le fichier entier, et
 * GitHub n'en rend plus le diff.
 *
 * ─── Ce qu'il fait ───────────────────────────────────────────────────────────────────────────
 *
 * Il déplace, OCTET POUR OCTET, chaque entrée close (`fait…`, `caduc…`, `refusé…`) du fichier
 * vivant vers `docs/plans/pistes-archive/angles-NNN-NNN.md`, sous le titre de son angle. Le
 * déplacement lui-même est `deplacer()` de `scripts/check-pistes.mjs` : la garde du rôle
 * `archiveur` le rejoue depuis la base et compare, au caractère près.
 *
 * Une entrée ne part que lorsqu'elle est close sur `pre-dev` depuis 24 h au moins : dans l'état du
 * fichier au dernier commit de la première lignée parentale de HEAD antérieur à la fenêtre
 * (`git rev-list --first-parent --before`), elle était déjà close ET son contenu était déjà
 * celui d'aujourd'hui. Une entrée touchée dans la fenêtre — un reste corrigé, une mesure du
 * porteur — attend donc le jour suivant : ce qu'un agent ou le porteur écrit encore ne quitte pas
 * le fichier qu'il édite. Deux lectures de git en tout, quel que soit le nombre d'entrées.
 *
 * Idempotent : une seconde exécution sur l'arbre qu'il a écrit ne trouve rien à déplacer.
 *
 * Usage, depuis la racine du dépôt (HEAD sur `pre-dev`, ou une branche qui en part) :
 *   node scripts/agents/archiver-pistes.mjs                 # déplace, écrit, dit ce qu'il a fait
 *   node scripts/agents/archiver-pistes.mjs --a-blanc       # dit ce qu'il déplacerait, n'écrit rien
 *   node scripts/agents/archiver-pistes.mjs --fenetre-h 48  # une autre fenêtre (24 h par défaut)
 *
 * Sortie : la première ligne est le résumé (« N entrée(s) archivée(s)… »), que `pistes.sh` reprend
 * dans le titre de sa PR.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE, CLOS, FICHIER, analyser, deplacer, lireEnsemble, refDe, statutDe } from '../check-pistes.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function git(args) {
  return execFileSync('git', args, { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function principal(argv) {
  const k = argv.indexOf('--fenetre-h');
  const heures = k >= 0 ? Number(argv[k + 1]) : 24;
  if (!(heures >= 0)) {
    console.error(`✗ --fenetre-h « ${argv[k + 1]} » : un nombre d'heures`);
    return 2;
  }
  const aBlanc = argv.includes('--a-blanc');

  const limite = new Date(Date.now() - heures * 3600 * 1000).toISOString();
  const reference = git(['rev-list', '-1', '--first-parent', `--before=${limite}`, 'HEAD']).trim();
  if (!reference) {
    console.log(`0 entrée archivée : aucun commit de la première lignée de HEAD antérieur au ${limite}`);
    return 0;
  }
  const avant = new Map(analyser(git(['show', `${reference}:${FICHIER}`])).entrees?.map((e) => [refDe(e), e]) ?? []);

  const ens = lireEnsemble(RACINE);
  const refs = [];
  let recentes = 0;
  for (const e of ens.vivant.entrees) {
    if (!CLOS.includes(statutDe(e))) continue;
    const alors = avant.get(refDe(e));
    if (alors && CLOS.includes(statutDe(alors)) && alors.contenu === e.contenu) refs.push(refDe(e));
    else recentes++;
  }
  const court = reference.slice(0, 9);
  if (!refs.length) {
    console.log(`0 entrée archivée : ${recentes} entrée(s) close(s) restent dans le fichier vivant, closes ou touchées depuis ${court} (fenêtre de ${heures} h)`);
    return 0;
  }

  const resultat = deplacer(ens, refs);
  // Le déplacement se vérifie avant d'écrire : mêmes Réf, et chaque contenu identique.
  const relu = new Map();
  const apres = analyser(resultat.vivant);
  for (const e of apres.entrees) relu.set(refDe(e), e.contenu);
  for (const [, texte] of resultat.archives) for (const e of analyser(texte, { archive: true }).entrees) relu.set(refDe(e), e.contenu);
  const ecarts = ens.entrees.filter((e) => relu.get(refDe(e)) !== e.contenu).map(refDe);
  if (resultat.introuvables.length || ecarts.length || relu.size !== ens.entrees.length) {
    console.error(`✗ déplacement incohérent, rien n'est écrit : ${[...resultat.introuvables, ...ecarts].join(', ') || `${relu.size} entrées relues pour ${ens.entrees.length}`}`);
    return 1;
  }

  const angles = [...new Set(resultat.deplacees.map((r) => Number(r.match(/^P(\d+)\./)[1])))];
  console.log(`${refs.length} entrée(s) archivée(s), de ${angles.length} angle(s), closes depuis ${court} au moins (fenêtre de ${heures} h)`);
  console.log(`  restent dans le fichier vivant : ${apres.entrees.length} entrées, dont ${recentes} closes trop récemment`);
  for (const [chemin, texte] of resultat.archives) {
    const lu = ens.archives.find((a) => a.chemin === chemin)?.doc.texteSource;
    if (lu !== texte) console.log(`  ${chemin} : ${lu === undefined ? 'créé' : 'complété'}`);
  }
  if (aBlanc) {
    console.log("  à blanc : rien n'est écrit");
    return 0;
  }
  writeFileSync(join(RACINE, FICHIER), resultat.vivant);
  mkdirSync(join(RACINE, ARCHIVE), { recursive: true });
  for (const [chemin, texte] of resultat.archives) writeFileSync(join(RACINE, chemin), texte);
  return 0;
}

process.exitCode = principal(process.argv.slice(2));
