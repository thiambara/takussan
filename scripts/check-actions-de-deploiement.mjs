#!/usr/bin/env node
/**
 * Les actions humaines du déploiement (ADR-0127) : la garde, et la liste de ce qui reste.
 *
 * Avant, ces actions ne vivaient que dans la description d'une PR : fusionnée, plus personne ne la
 * relisait, et rien ne disait si l'action avait été faite. Une action = un fichier sous
 * `docs/deploiement/actions/`, son état tenu par environnement (`preview`, `production`).
 *
 * La garde refuse :
 *   · un frontmatter incomplet, un type ou un état inconnu ;
 *   · un état `fait` ou `sans-objet` sans sa ligne `- AAAA-MM-JJ · <env> · <état> · …` sous `## Historique` ;
 *   · une clé de `deploy/takussan/env.*.production.example` qu'aucune action ne nomme dans `cles:`
 *     et qui n'est pas figée dans `docs/deploiement/cles-anterieures.json` (les clés du 2026-11-16).
 * Ce qu'elle ne voit pas : une action qui n'est pas une clé (gabarit, donnée, vérification) et
 * qu'on n'a pas écrite. Celle-là reste à la charge de la PR qui l'exige.
 *
 * Usage :
 *   node scripts/check-actions-de-deploiement.mjs                       # la garde
 *   node scripts/check-actions-de-deploiement.mjs --report preview      # ce qui reste à faire
 *   node scripts/check-actions-de-deploiement.mjs --report production
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = join(ROOT, 'docs', 'deploiement', 'actions');
const ANTERIEURES = join(ROOT, 'docs', 'deploiement', 'cles-anterieures.json');
const GABARITS = ['deploy/takussan/env.api.production.example', 'deploy/takussan/env.web.production.example'];

const ENVIRONNEMENTS = ['preview', 'production'];
const ETATS = ['a-faire', 'fait', 'sans-objet'];
const TYPES = ['cle-env', 'externe', 'donnee', 'verification', 'decision'];
const REQUIS = ['titre', 'type', 'tickets', 'cles', 'creee', ...ENVIRONNEMENTS];

const iReport = process.argv.indexOf('--report');
const REPORT = iReport !== -1 ? process.argv[iReport + 1] : null;
if (iReport !== -1 && !ENVIRONNEMENTS.includes(REPORT)) {
  console.error(`✗ --report attend un environnement : ${ENVIRONNEMENTS.join(' | ')}`);
  process.exit(2);
}

/** Frontmatter plat : `cle: valeur`, `cle: [a, b]`, `cle: "texte"`. */
function lire(fichier) {
  const texte = readFileSync(join(DOSSIER, fichier), 'utf8');
  const m = texte.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { erreur: 'pas de frontmatter `---` en tête' };
  const fm = {};
  for (const ligne of m[1].split('\n')) {
    const l = ligne.replace(/\s+#.*$/, '');
    const kv = l.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[')) v = v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    else v = v.replace(/^"(.*)"$/, '$1');
    fm[kv[1]] = v;
  }
  return { fm, corps: m[2] };
}

const fichiers = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter((f) => f.endsWith('.md')).sort() : [];
const erreurs = [];
const actions = [];
const nommees = new Set();

for (const f of fichiers) {
  const ou = `docs/deploiement/actions/${f}`;
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(f)) erreurs.push(`${ou} : le nom doit être AAAA-MM-JJ-<slug>.md`);
  const { fm, corps, erreur } = lire(f);
  if (erreur) { erreurs.push(`${ou} : ${erreur}`); continue; }
  for (const k of REQUIS) if (fm[k] === undefined || fm[k] === '') erreurs.push(`${ou} : \`${k}:\` manque`);
  if (fm.type && !TYPES.includes(fm.type)) erreurs.push(`${ou} : type \`${fm.type}\` inconnu (${TYPES.join(' | ')})`);
  if (fm.creee && !/^\d{4}-\d{2}-\d{2}$/.test(fm.creee)) erreurs.push(`${ou} : \`creee:\` attend AAAA-MM-JJ`);
  for (const k of ['tickets', 'cles']) if (fm[k] !== undefined && !Array.isArray(fm[k])) erreurs.push(`${ou} : \`${k}:\` attend une liste [..]`);
  if (Array.isArray(fm.cles)) fm.cles.forEach((c) => nommees.add(c));
  const historique = (corps.split(/^## Historique\s*$/m)[1] ?? '');
  if (!/^## Historique\s*$/m.test(corps)) erreurs.push(`${ou} : la section \`## Historique\` manque`);
  for (const env of ENVIRONNEMENTS) {
    const etat = fm[env];
    if (etat === undefined) continue;
    if (!ETATS.includes(etat)) { erreurs.push(`${ou} : \`${env}: ${etat}\` inconnu (${ETATS.join(' | ')})`); continue; }
    if (etat !== 'a-faire') {
      const ligne = new RegExp(`^- \\d{4}-\\d{2}-\\d{2} · ${env} · ${etat} · .+ · .+$`, 'm');
      if (!ligne.test(historique)) erreurs.push(`${ou} : \`${env}: ${etat}\` sans sa ligne « - AAAA-MM-JJ · ${env} · ${etat} · <qui> · <preuve> » sous ## Historique`);
    }
  }
  actions.push({ ou, ...fm });
}

// Les clés des gabarits : chaque clé neuve doit être nommée par une action.
const anterieures = new Set(existsSync(ANTERIEURES) ? JSON.parse(readFileSync(ANTERIEURES, 'utf8')).cles : []);
if (anterieures.size < 100) erreurs.push(`docs/deploiement/cles-anterieures.json : ${anterieures.size} clé(s) seulement — la garde ne lit pas le bon fichier.`);
let comptees = 0;
for (const g of GABARITS) {
  const texte = readFileSync(join(ROOT, g), 'utf8');
  for (const [, cle] of texte.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) {
    comptees++;
    if (!anterieures.has(cle) && !nommees.has(cle)) erreurs.push(`${g} : la clé \`${cle}\` est neuve et aucune action de docs/deploiement/actions/ ne la nomme dans \`cles:\``);
  }
}
if (comptees < 100) erreurs.push(`seulement ${comptees} clé(s) lues dans les gabarits — la garde ne lit pas les bons fichiers.`);

if (REPORT) {
  const restent = actions.filter((a) => a[REPORT] === 'a-faire');
  console.log(`${restent.length} action(s) à faire en ${REPORT} (sur ${actions.length}) :`);
  for (const a of restent) {
    console.log(`  · [${a.type}] ${a.titre}`);
    console.log(`      ${a.ou}${a.tickets?.length ? ` — ${a.tickets.join(', ')}` : ''}`);
    // TCK-2956 — les clés à poser se lisent dans le rapport, sans ouvrir le fichier.
    if (Array.isArray(a.cles) && a.cles.length) console.log(`      clés : ${a.cles.join(', ')}`);
  }
}

if (erreurs.length) {
  console.error(`\n✗ ${erreurs.length} écart(s) dans les actions de déploiement (ADR-0127) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  console.error('\n→ mode d\'emploi : docs/deploiement/README.md');
  process.exit(1);
}
if (!REPORT) console.log(`✓ ${actions.length} action(s) de déploiement bien formée(s) ; ${comptees} clés des gabarits, toutes figées ou nommées.`);
