#!/usr/bin/env node
/**
 * Garde du socle IA (TCK-2383, ADR-0076 §4) :
 *
 *   A. tout agent concret de `takussan-api/app/Ai/Agents/` est cité (`X::class`) par un usage de
 *      `app/Ai/Usages/` ;
 *   B. tout usage de `app/Ai/Usages/` est listé dans `AiUsageRegistry::USAGES` ;
 *   C. aucune classe hors de `app/Ai/Agents/` n'emploie `Laravel\Ai\Promptable`, n'implémente
 *      `Laravel\Ai\Contracts\Agent` ni n'étend `SocleAgent` : un agent hors du dossier échapperait à A ;
 *   D. aucun identifiant de modèle (`claude-…`, `gpt-…`, `gemini-…`, `mistral-…`, `llama-…`, `voyage-…` portant
 *      un chiffre) hors de `takussan-api/config/ai.php` : ni dans `app/`, `routes/`, `database/`,
 *      `resources/ai/` de l'API, ni dans `takussan-web/src/` hors tests.
 *
 * **Pourquoi.** Un agent appelé en direct contourne budget, masquage et journal ; un identifiant de
 * modèle écrit dans un service ne se règle plus depuis la console.
 *
 * **Ce qu'elle ne prouve pas.** Qu'un usage déclaré passe bien par la passerelle (c'est le contrat
 * de `AiGateway`), ni qu'un identifiant d'une famille inconnue du motif soit absent.
 *
 *   node scripts/check-ai-usages.mjs            # garde
 *   node scripts/check-ai-usages.mjs --report   # + agents, usages et fichiers lus
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const API = join(ROOT, 'takussan-api');
const AGENTS = join(API, 'app', 'Ai', 'Agents');
const USAGES = join(API, 'app', 'Ai', 'Usages');
const REGISTRE = join(API, 'app', 'Services', 'Ai', 'AiUsageRegistry.php');
// Les jeux d'évaluation citent des identifiants de modèle (`baseline.json` : « fournisseur/modèle ») :
// ADR-0076 les y autorise, ils décrivent ce qui a été mesuré. Hors de la garde D.
const EVALS = join(API, 'resources', 'ai', 'evals');
const RACINES_MODELES = [
  join(API, 'app'), join(API, 'routes'), join(API, 'database'), join(API, 'resources', 'ai'),
  join(ROOT, 'takussan-web', 'src'),
];

export const MOTIF_MODELE = /\b(?:claude|gpt|gemini|mistral|llama|voyage)-[a-z0-9.-]*\d[a-z0-9.-]*/i;
export const MOTIF_AGENT = /use\s+Laravel\\Ai\\Promptable\s*;|implements\s+[^{]*\bAgent\b/;

function fichiers(dossier, filtre) {
  if (!existsSync(dossier)) return [];
  const sortie = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === 'node_modules' || nom === '__tests__') continue;
      sortie.push(...fichiers(chemin, filtre));
    } else if (filtre(chemin)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

/** Le motif d'un agent du socle : `extends SocleAgent`, nom court ou qualifié. */
export const MOTIF_SOCLE = /\bextends\s+\\?(?:[A-Za-z0-9_]+\\)*SocleAgent\b/;

/** `chemin` est-il le dossier ou dans le dossier ? Le séparateur compte : `AgentsX` n'est pas `Agents`. */
export function dans(dossier, chemin) {
  return chemin === dossier || chemin.startsWith(dossier + sep);
}

export function estTest(chemin) {
  return /__tests__|\.test\.tsx?$|\.spec\.tsx?$/.test(chemin);
}

const CAS_EPREUVE = [
  { motif: MOTIF_MODELE, texte: "'model' => 'claude-sonnet-5-5'", attendu: true },
  { motif: MOTIF_MODELE, texte: "$x = 'gpt-4o-mini';", attendu: true },
  { motif: MOTIF_MODELE, texte: "'model' => 'voyage-4-lite'", attendu: true },
  { motif: MOTIF_MODELE, texte: '// voir claude-api pour le SDK', attendu: false },
  { motif: MOTIF_MODELE, texte: "'modele-a'", attendu: false },
  { motif: MOTIF_AGENT, texte: 'use Laravel\\Ai\\Promptable;', attendu: true },
  { motif: MOTIF_AGENT, texte: 'final class X extends SocleAgent implements HasStructuredOutput', attendu: false },
  { motif: MOTIF_AGENT, texte: 'abstract class SocleAgent implements Agent', attendu: true },
  { motif: MOTIF_SOCLE, texte: 'final class X extends SocleAgent implements HasStructuredOutput', attendu: true },
  { motif: MOTIF_SOCLE, texte: 'final class X extends \\App\\Ai\\Agents\\SocleAgent', attendu: true },
  { motif: MOTIF_SOCLE, texte: 'final class X extends SocleAgentFactory', attendu: false },
  { motif: MOTIF_SOCLE, texte: '// une classe qui étend SocleAgent', attendu: false },
];
let echec = false;
for (const cas of CAS_EPREUVE) {
  if (cas.motif.test(cas.texte) !== cas.attendu) {
    console.error(`✗ épreuve : « ${cas.texte} » devait rendre ${cas.attendu}`);
    echec = true;
  }
}
if (dans(AGENTS, join(AGENTS, 'X.php')) !== true || dans(AGENTS, join(AGENTS, 'Sous', 'X.php')) !== true
  || dans(AGENTS, `${AGENTS}X${sep}X.php`) !== false || dans(AGENTS, join(API, 'app', 'Ai', 'Usages', 'X.php')) !== false) {
  console.error('✗ épreuve : dans (un dossier frère `AgentsX` ne doit pas passer pour `Agents`)');
  echec = true;
}
if (estTest('src/a/__tests__/b.tsx') !== true || estTest('src/a/b.tsx') !== false) {
  console.error('✗ épreuve : estTest');
  echec = true;
}
if (echec) process.exit(1);

const erreurs = [];
const sourcesUsages = fichiers(USAGES, (f) => f.endsWith('.php')).map((f) => [f, readFileSync(f, 'utf8')]);
const registre = existsSync(REGISTRE) ? readFileSync(REGISTRE, 'utf8') : '';

// A — chaque agent concret est cité par un usage.
const agents = fichiers(AGENTS, (f) => f.endsWith('.php'));
for (const fichier of agents) {
  const source = readFileSync(fichier, 'utf8');
  if (/\babstract\s+class\b/.test(source)) continue;
  const classe = basename(fichier, '.php');
  if (!sourcesUsages.some(([, s]) => new RegExp(`\\b${classe}::class\\b`).test(s))) {
    erreurs.push(`A — l'agent ${classe} n'est cité par aucun usage de app/Ai/Usages/`);
  }
}

// B — chaque usage est au registre.
for (const [fichier] of sourcesUsages) {
  const classe = basename(fichier, '.php');
  if (!new RegExp(`\\b${classe}::class\\b`).test(registre)) {
    erreurs.push(`B — l'usage ${classe} n'est pas listé dans AiUsageRegistry::USAGES`);
  }
}

// C — aucun agent hors de app/Ai/Agents/.
for (const fichier of fichiers(join(API, 'app'), (f) => f.endsWith('.php'))) {
  if (dans(AGENTS, fichier)) continue;
  const source = readFileSync(fichier, 'utf8');
  if ((MOTIF_AGENT.test(source) && /Laravel\\Ai/.test(source)) || MOTIF_SOCLE.test(source)) {
    erreurs.push(`C — ${relative(ROOT, fichier)} définit un agent hors de app/Ai/Agents/`);
  }
}

// D — aucun identifiant de modèle hors de config/ai.php.
let lus = 0;
for (const racine of RACINES_MODELES) {
  for (const fichier of fichiers(racine, (f) => /\.(php|ts|tsx|md|json)$/.test(f) && !estTest(f) && !dans(EVALS, f))) {
    lus++;
    const lignes = readFileSync(fichier, 'utf8').split('\n');
    lignes.forEach((ligne, i) => {
      const trouve = ligne.match(MOTIF_MODELE);
      if (trouve) erreurs.push(`D — ${relative(ROOT, fichier)}:${i + 1} cite le modèle « ${trouve[0]} » (seul config/ai.php le peut)`);
    });
  }
}
if (lus === 0) erreurs.push('D — aucun fichier lu : la garde ne garde rien');

if (REPORT) {
  console.log(`  agents : ${agents.map((f) => basename(f, '.php')).join(', ') || '—'}`);
  console.log(`  usages : ${sourcesUsages.map(([f]) => basename(f, '.php')).join(', ') || '—'}`);
  console.log(`  fichiers lus pour D : ${lus}`);
}
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ check-ai-usages : ${agents.length} agent(s), ${sourcesUsages.length} usage(s), ${lus} fichiers sans identifiant de modèle`);
