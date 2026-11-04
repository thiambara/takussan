#!/usr/bin/env node
/**
 * Garde des GARDES : chaque `scripts/check-*.mjs` est joué par un workflow de `.github/workflows/`.
 *
 * Relevé du 2026-11-03 : cinq gardes — `check-mail-button-paths`, `check-nom-affichable`,
 * `check-notification-target-audience`, `check-status-labels`, `check-status-unions` — existaient,
 * passaient en local, et AUCUN workflow ne les lançait, alors que CLAUDE.md affirmait que Repo CI
 * « les rejoue toutes ». Une garde qu'aucune CI ne joue n'est pas une garde : elle est verte parce
 * que personne ne la lance, et elle le reste le jour où le défaut qu'elle attrape revient.
 *
 * Ce qui compte comme « joué » : le nom du fichier apparaît dans un workflow, ou dans un script
 * `check:*` de `takussan-web/package.json` que web-ci joue. Pas de « boucle sur le motif » reconnue :
 * la première version en acceptait une, et un COMMENTAIRE de repo-ci qui cite le rituel
 * `for g in scripts/check-*.mjs` la rendait verte sur les cinq orphelines — prouvé par ablation.
 *
 * Usage :
 *   node scripts/check-gardes-branchees.mjs            # sort en 1 sur une garde non branchée
 *   node scripts/check-gardes-branchees.mjs --report   # + où chacune est jouée
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const gardes = readdirSync(join(ROOT, 'scripts')).filter((f) => /^check-.+\.mjs$/.test(f)).sort();
const dossierWf = join(ROOT, '.github', 'workflows');
const workflows = readdirSync(dossierWf)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ ou: `.github/workflows/${f}`, texte: readFileSync(join(dossierWf, f), 'utf8') }));
const pkg = join(ROOT, 'takussan-web', 'package.json');
if (existsSync(pkg)) workflows.push({ ou: 'takussan-web/package.json', texte: readFileSync(pkg, 'utf8') });

if (gardes.length < 10) {
  console.error(`✗ seulement ${gardes.length} garde(s) trouvée(s) sous scripts/ — la garde ne lit pas le bon dossier.`);
  process.exit(1);
}

const orphelines = [];
for (const g of gardes) {
  const ou = workflows.filter((w) => w.texte.includes(g)).map((w) => w.ou);
  if (!ou.length) orphelines.push(g);
  if (REPORT) console.log(`  ${g.padEnd(48)} ${ou.join(', ') || '—'}`);
}

if (orphelines.length) {
  console.error(`\n✗ ${orphelines.length} garde(s) qu'aucun workflow ne joue :`);
  for (const g of orphelines) console.error(`  · scripts/${g}`);
  console.error('\n→ ajouter un step `run: node scripts/<garde>.mjs` à .github/workflows/repo-ci.yml.');
  process.exit(1);
}
console.log(`✓ ${gardes.length} gardes scripts/check-*.mjs, toutes jouées par un workflow.`);
