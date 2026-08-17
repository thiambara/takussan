#!/usr/bin/env node
/**
 * Garde de la CARTE D'IMPACT.
 *
 * `takussan-api/tests/impact-map.json` dit quelles classes de test couvrent quel
 * fichier de `app/`. Elle est DÉRIVÉE d'un rapport `--coverage-php` de PHPUnit, et
 * elle est le seul document de ce dépôt dont la péremption produit un FAUX VERT :
 * un fichier dont les tests ont changé depuis la génération se verrait attribuer
 * les anciens.
 *
 * Cette garde sépare deux choses qui ne se paient pas au même prix :
 *
 *   · L'INTÉGRITÉ STRUCTURELLE est un ÉCHEC. Un index hors bornes, une clé de
 *     `files` absente de `scanned`, une version inattendue : la carte ment, et le
 *     sélecteur qui la lit prendrait ses décisions sur du sable.
 *   · La PÉREMPTION est un AVERTISSEMENT. Une carte de trois semaines est moins
 *     bonne qu'une carte d'hier, mais elle n'est pas fausse : `impacted-tests.php`
 *     rattrape les tests écrits depuis, et la suite entière reste la seule garde.
 *     Faire échouer la CI là-dessus, ce serait bloquer des PR sur la fraîcheur d'un
 *     index qu'aucune PR ne contrôle.
 *
 * Usage :
 *   node scripts/check-impact-map.mjs
 *   node scripts/check-impact-map.mjs --report
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const CHEMIN = join(ROOT, 'takussan-api', 'tests', 'impact-map.json');
const AGE_MAX_JOURS = 30;
const VERSION_ATTENDUE = 1;

const erreurs = [];
const avertissements = [];

if (!existsSync(CHEMIN)) {
  console.error(
    `✗ carte d'impact absente : takussan-api/tests/impact-map.json\n` +
      `  Elle est engendrée par le job « carte d'impact » d'api-ci.yml sur push vers dev.\n` +
      `  Localement : XDEBUG_MODE=coverage php artisan test --coverage-php=/tmp/cov.php\n` +
      `               php bin/build-impact-map.php /tmp/cov.php`,
  );
  process.exit(1);
}

let carte;
try {
  carte = JSON.parse(readFileSync(CHEMIN, 'utf8'));
} catch (e) {
  console.error(`✗ carte d'impact illisible : ${e.message}`);
  process.exit(1);
}

if (carte.version !== VERSION_ATTENDUE) {
  erreurs.push(`version ${JSON.stringify(carte.version)} inattendue (attendu ${VERSION_ATTENDUE})`);
}

for (const clef of ['commit', 'generated_at', 'classes', 'scanned', 'files']) {
  if (carte[clef] === undefined) erreurs.push(`clé « ${clef} » absente`);
}

if (erreurs.length === 0) {
  if (carte.classes.length === 0) erreurs.push('aucune classe de test — la carte est vide');
  if (carte.scanned.length === 0) erreurs.push('aucun fichier scanné — la carte est vide');

  const scannes = new Set(carte.scanned);
  for (const [fichier, indices] of Object.entries(carte.files)) {
    if (!scannes.has(fichier)) {
      erreurs.push(`« ${fichier} » est dans files mais absent de scanned`);
    }
    for (const i of indices) {
      if (!Number.isInteger(i) || i < 0 || i >= carte.classes.length) {
        erreurs.push(`« ${fichier} » référence l'indice de classe ${i}, hors bornes (0..${carte.classes.length - 1})`);
      }
    }
  }
}

// Péremption — avertissement, jamais échec.
const ageJours = Math.round((Date.now() - Date.parse(carte.generated_at)) / 86400000);
if (Number.isNaN(ageJours)) {
  erreurs.push(`generated_at illisible : ${JSON.stringify(carte.generated_at)}`);
} else if (ageJours > AGE_MAX_JOURS) {
  avertissements.push(`carte engendrée il y a ${ageJours} jours (plafond indicatif : ${AGE_MAX_JOURS})`);
}

// Le commit — avertissement aussi : `actions/checkout` clone à une profondeur de 1
// par défaut, donc son absence ne prouve rien.
try {
  execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${carte.commit}^{commit}`], { stdio: 'ignore' });
} catch {
  avertissements.push(`commit ${String(carte.commit).slice(0, 8)} introuvable dans l'historique local (clone superficiel ?)`);
}

if (REPORT) {
  console.log(`carte : ${String(carte.commit).slice(0, 8)} · ${carte.generated_at} · ${ageJours} jour(s)`);
  console.log(`  ${carte.classes.length} classes · ${Object.keys(carte.files).length} fichiers couverts sur ${carte.scanned.length} scannés`);
}

for (const a of avertissements) console.warn(`⚠ carte d'impact : ${a}`);

if (erreurs.length > 0) {
  console.error(`✗ carte d'impact — ${erreurs.length} défaut(s) structurel(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log('✓ carte d\'impact : structure cohérente');
