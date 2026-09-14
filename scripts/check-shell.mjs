#!/usr/bin/env node
/**
 * Garde du SHELL et des DOCKERFILE : shellcheck et hadolint sur tout ce que le serveur exécute.
 *
 * Le défaut qu'elle attrape a été réel, deux fois, et corrigé À LA MAIN les deux fois (plan
 * d'ADR-0028, « Écarts constatés ») : `iptables -D DOCKER-USER $(…)` découpé sans guillemets dans
 * `bootstrap.sh`, et un `cmd | grep -q` sous `pipefail` qui rougissait une vérification selon le
 * minutage. Aucun workflow ne lançait shellcheck ; un Dockerfile cassé ne se voyait qu'au premier
 * push sur `preview`, après la fusion. Une correction faite à la main est une correction qui
 * reviendra : *ce qui n'est pas gardé finit par se défaire.*
 *
 * Ce qu'elle vérifie :
 *   · shellcheck, sévérité `warning` et au-dessus, sur les scripts que le serveur, l'image ou la CI
 *     exécutent : `deploy/**` , `takussan-api/docker/*.sh`, `scripts/*.sh`, `dev.sh` ;
 *   · hadolint, seuil `warning`, sur les deux Dockerfile — les `info` s'affichent, ne rougissent pas.
 *
 * Ce qu'elle ne vérifie PAS : qu'un script fait ce qu'il annonce. `test-release-reindex.sh` et les
 * tests de fumée en sont chargés. Et `cmd | grep -q` sous `pipefail` n'est PAS une trouvaille
 * shellcheck : c'est une règle du dépôt (bootstrap.sh), tenue en relecture.
 *
 * Les deux outils doivent être PRÉSENTS : leur absence est une erreur, jamais un vert. En CI,
 * `repo-ci.yml` les installe à version épinglée ; en local, `brew install shellcheck hadolint`.
 *
 * Usage :
 *   node scripts/check-shell.mjs            # garde, sort en 1 à la première trouvaille
 *   node scripts/check-shell.mjs --report   # + l'inventaire des fichiers et les versions
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const DOCKERFILES = ['takussan-api/Dockerfile', 'takussan-web/Dockerfile'];
const RACINES_SHELL = ['deploy', 'takussan-api/docker', 'scripts'];
const FICHIERS_SHELL = ['dev.sh'];

function scriptsSous(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const nom of readdirSync(abs)) {
    const chemin = join(abs, nom);
    if (statSync(chemin).isDirectory()) out.push(...scriptsSous(join(dir, nom)));
    else if (nom.endsWith('.sh')) out.push(relative(ROOT, chemin));
  }
  return out.sort();
}

function outil(nom, argsVersion) {
  const r = spawnSync(nom, argsVersion, { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(`✗ ${nom} introuvable : en local \`brew install ${nom}\`, en CI repo-ci.yml l'installe à version épinglée. Une garde sans son outil n'est pas verte, elle est absente.`);
    process.exit(2);
  }
  return (r.stdout || '').trim().split('\n').find((l) => /\d+\.\d+/.test(l)) ?? '?';
}

const shell = [...RACINES_SHELL.flatMap(scriptsSous), ...FICHIERS_SHELL.filter((f) => existsSync(join(ROOT, f)))];
const dockerfiles = DOCKERFILES.filter((f) => existsSync(join(ROOT, f)));
if (shell.length === 0 || dockerfiles.length !== DOCKERFILES.length) {
  console.error(`✗ inventaire inattendu : ${shell.length} script(s), ${dockerfiles.length}/${DOCKERFILES.length} Dockerfile — la garde ne trouve plus ce qu'elle doit garder.`);
  process.exit(2);
}

const vShell = outil('shellcheck', ['--version']);
const vHado = outil('hadolint', ['--version']);
if (REPORT) {
  console.log(`shellcheck ${vShell} · hadolint ${vHado}`);
  console.log(`scripts (${shell.length}) : ${shell.join(', ')}`);
  console.log(`Dockerfile (${dockerfiles.length}) : ${dockerfiles.join(', ')}`);
}

let echec = false;
const sc = spawnSync('shellcheck', ['--severity=warning', '--external-sources', ...shell], { cwd: ROOT, encoding: 'utf8' });
if (sc.status !== 0) { echec = true; process.stdout.write(sc.stdout); process.stderr.write(sc.stderr); }

const hl = spawnSync('hadolint', ['--failure-threshold', 'warning', ...dockerfiles], { cwd: ROOT, encoding: 'utf8' });
process.stdout.write(hl.stdout); // les `info` s'affichent même quand tout passe
if (hl.status !== 0) { echec = true; process.stderr.write(hl.stderr); }

if (echec) {
  console.error('✗ shellcheck ou hadolint a une trouvaille de niveau warning ou plus : corriger, ou justifier ligne à ligne (`# shellcheck disable=…` / `# hadolint ignore=…` avec le pourquoi).');
  process.exit(1);
}
console.log(`✓ shell et Dockerfile : ${shell.length} script(s) et ${dockerfiles.length} Dockerfile sans trouvaille de niveau warning.`);
