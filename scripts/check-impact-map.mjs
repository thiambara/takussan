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

// Nomme le type reçu pour un message lisible — `typeof null === 'object'`, donc un
// `typeof` nu confondrait « null » et « objet », les deux défauts les plus probables
// sur `files`.
function decrireType(valeur) {
  if (valeur === null) return 'null';
  if (Array.isArray(valeur)) return 'tableau';
  return typeof valeur;
}

// Les contrôles de TYPE se font AVANT tout accès de propriété, et indépendamment de
// l'absence de clé ci-dessus (une clé présente mais du mauvais type ne redéclenche
// pas « absente »). Sans ce garde-fou, une carte où `classes` vaut `5` au lieu d'un
// tableau ferait passer `carte.classes.length === 0` (`undefined === 0` → faux) ET
// `i >= carte.classes.length` (`99999 >= undefined` → TOUJOURS faux en JavaScript) :
// le contrôle d'indice hors bornes ne se déclencherait alors plus jamais, quel que
// soit l'indice. C'est le défaut que cette garde existe pour attraper, et il se
// glissait par la porte qu'elle ouvrait elle-même.
const classesValides = Array.isArray(carte.classes);
if (carte.classes !== undefined && !classesValides) {
  erreurs.push(`« classes » n'est pas un tableau (reçu : ${decrireType(carte.classes)})`);
}
const scannesValides = Array.isArray(carte.scanned);
if (carte.scanned !== undefined && !scannesValides) {
  erreurs.push(`« scanned » n'est pas un tableau (reçu : ${decrireType(carte.scanned)})`);
}
const filesValides = carte.files !== null && typeof carte.files === 'object' && !Array.isArray(carte.files);
if (carte.files !== undefined && !filesValides) {
  erreurs.push(`« files » n'est pas un objet (reçu : ${decrireType(carte.files)})`);
}

// Chaque contrôle qui suit ne dépend QUE des types dont IL a besoin — jamais de
// `erreurs.length === 0`. Un défaut de `version` ne doit pas masquer un indice hors
// bornes : le développeur qui corrige le premier doit voir le second à la même
// exécution, pas à la suivante.
if (classesValides && carte.classes.length === 0) {
  erreurs.push('aucune classe de test — la carte est vide');
}
if (scannesValides && carte.scanned.length === 0) {
  erreurs.push('aucun fichier scanné — la carte est vide');
}

if (filesValides && scannesValides) {
  const scannes = new Set(carte.scanned);
  for (const fichier of Object.keys(carte.files)) {
    if (!scannes.has(fichier)) {
      erreurs.push(`« ${fichier} » est dans files mais absent de scanned`);
    }
  }
}

if (filesValides) {
  for (const [fichier, indices] of Object.entries(carte.files)) {
    if (!Array.isArray(indices)) {
      erreurs.push(`« ${fichier} » : les indices ne sont pas un tableau (reçu : ${decrireType(indices)})`);
      continue;
    }
    if (!classesValides) continue; // déjà signalé ci-dessus — juger « hors bornes » sans borne connue n'a pas de sens.
    for (const i of indices) {
      if (!Number.isInteger(i) || i < 0 || i >= carte.classes.length) {
        erreurs.push(`« ${fichier} » référence l'indice de classe ${i}, hors bornes (0..${carte.classes.length - 1})`);
      }
    }
  }
}

// Péremption — avertissement, jamais échec. Calculé seulement si la clé est présente :
// sinon la boucle de clés requises l'a déjà signalée, et `Date.parse(undefined)`
// produirait un second message pour le même défaut.
let ageJours = null;
if (carte.generated_at !== undefined) {
  ageJours = Math.round((Date.now() - Date.parse(carte.generated_at)) / 86400000);
  if (Number.isNaN(ageJours)) {
    erreurs.push(`generated_at illisible : ${JSON.stringify(carte.generated_at)}`);
  } else if (ageJours > AGE_MAX_JOURS) {
    avertissements.push(`carte engendrée il y a ${ageJours} jours (plafond indicatif : ${AGE_MAX_JOURS})`);
  }
}

// Le commit — avertissement aussi : `actions/checkout` clone à une profondeur de 1
// par défaut, donc son absence ne prouve rien.
try {
  execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${carte.commit}^{commit}`], { stdio: 'ignore' });
} catch {
  avertissements.push(`commit ${String(carte.commit).slice(0, 8)} introuvable dans l'historique local (clone superficiel ?)`);
}

if (REPORT) {
  // `--report` ne doit jamais planter, y compris sur une carte corrompue : c'est le
  // mode qu'on lance justement pour l'inspecter. D'où le « ? » plutôt qu'un accès
  // direct à `.length` sur une valeur dont on vient de constater qu'elle n'en a pas.
  const nbClasses = classesValides ? carte.classes.length : '?';
  const nbFiles = filesValides ? Object.keys(carte.files).length : '?';
  const nbScanned = scannesValides ? carte.scanned.length : '?';
  console.log(`carte : ${String(carte.commit).slice(0, 8)} · ${carte.generated_at} · ${ageJours === null ? '?' : ageJours} jour(s)`);
  console.log(`  ${nbClasses} classes · ${nbFiles} fichiers couverts sur ${nbScanned} scannés`);
}

for (const a of avertissements) console.warn(`⚠ carte d'impact : ${a}`);

if (erreurs.length > 0) {
  console.error(`✗ carte d'impact — ${erreurs.length} défaut(s) structurel(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log('✓ carte d\'impact : structure cohérente');
