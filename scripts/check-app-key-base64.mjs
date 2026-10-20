#!/usr/bin/env node
/**
 * Garde « UNE `APP_KEY` SE GÉNÈRE AVEC SON PRÉFIXE `base64:` » (piste P71.01, 2026-10-20).
 *
 * Le défaut qu'elle ferme : la table F3 du plan d'auto-hébergement faisait générer l'`APP_KEY` de
 * production par `openssl rand -base64 32`, sans le préfixe. Laravel ne décode la clé qu'après
 * `base64:` (`EncryptionServiceProvider::parseKey()`) : les 44 caractères bruts sont refusés,
 * `Unsupported cipher or incorrect key length` (mesuré le 2026-10-20). D1, le test de fumée et deux
 * autres lignes portaient le préfixe ; F3 seule l'avait perdu, et rien ne le voyait avant le
 * premier déploiement de production.
 *
 * Ce qu'elle vérifie : dans les runbooks (`deploy/**`, `docs/infra/**`, `docs/plans/*.md`), toute
 * ligne qui nomme `APP_KEY` et contient `openssl rand -base64 32` porte aussi `base64:`.
 *
 * Ce qu'elle ne lit PAS : le fichier de pistes et le journal des corrections, qui CITENT la ligne
 * fautive pour raconter le défaut. Une garde qui confond le récit et la prescription interdit
 * d'écrire pourquoi on a corrigé (même règle que `check-prod-drivers.mjs`).
 *
 * Usage :  node scripts/check-app-key-base64.mjs [--report]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const RACINES = ['deploy', 'docs/infra', 'docs/plans'];
const RECITS = new Set(['docs/plans/2026-10-15-pistes-d-amelioration.md']);
const GENERATION = 'openssl rand -base64 32';

function fichiersSous(dir) {
  const out = [];
  for (const nom of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, nom);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...fichiersSous(rel));
    else if (/\.(md|sh|ya?ml|json|example)$/.test(nom) || nom.startsWith('.env')) out.push(rel);
  }
  return out.sort();
}

const fichiers = RACINES.flatMap(fichiersSous).filter((f) => !RECITS.has(f));
const erreurs = [];
let generations = 0;
for (const rel of fichiers) {
  readFileSync(join(ROOT, rel), 'utf8')
    .split('\n')
    .forEach((ligne, i) => {
      if (!ligne.includes('APP_KEY') || !ligne.includes(GENERATION)) return;
      generations += 1;
      if (!ligne.includes('base64:')) {
        erreurs.push(
          `${rel}:${i + 1} — \`APP_KEY\` générée par \`${GENERATION}\` sans le préfixe \`base64:\` : Laravel refuse la clé (\`Unsupported cipher or incorrect key length\`). Écrire \`base64:$(${GENERATION})\`.`
        );
      }
    });
}

if (REPORT) console.log(`${fichiers.length} fichier(s) lus sous ${RACINES.join(', ')} ; ${generations} génération(s) d'\`APP_KEY\``);
if (generations === 0) {
  console.error(`✗ aucune génération d'\`APP_KEY\` trouvée : la garde ne lit plus ce qu'elle garde.`);
  process.exit(2);
}
if (erreurs.length === 0) {
  console.log(`✓ APP_KEY : ${generations} génération(s), toutes préfixées \`base64:\`.`);
  process.exit(0);
}
console.error(`✗ ${erreurs.length} génération(s) d'\`APP_KEY\` sans \`base64:\` :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
process.exit(1);
