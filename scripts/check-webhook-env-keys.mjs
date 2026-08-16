#!/usr/bin/env node
/**
 * Garde de COUVERTURE des clés de gardes webhook (TCK-296).
 *
 * `check-env-parity.mjs` compare `.env.example` et `.env.docker` **entre eux**.
 * Cette garde-ci compare les fichiers `.env` au **code** — et c'est un troisième
 * sommet que la parité ne peut pas voir par construction : *une clé absente des
 * DEUX fichiers est en parité parfaite.* Le commentaire qui ouvre le bloc SMS de
 * `.env.example` énonce exactement ce trou depuis le 2026-08-16 ; il restait à le
 * fermer.
 *
 * ## Pourquoi ces clés-là, et pas les 232 autres
 *
 * `config/` lit 232 clés d'environnement. Exiger qu'elles soient toutes déclarées
 * dans les quatre `.env` serait faux : 155 d'entre elles ont un défaut sensé et
 * n'ont aucune raison d'être écrites. Une garde qui rougit sur 155 faux positifs
 * est une garde qu'on désactive.
 *
 * Le critère retenu est **le mode de défaillance**, pas la sensibilité supposée :
 * une clé lue en `env('X', '')` par un fichier de configuration qui porte une garde
 * de webhook entrant **échoue FERMÉ** — jeton vide → 404, allowlist vide → 403,
 * secret vide → rejet. Le webhook est donc simplement **muet** au premier
 * déploiement : pas d'erreur, pas d'alerte, pas de trace. C'est exactement le
 * profil de défaut que ce dépôt paie le plus cher.
 *
 * ## Ce qui est dérivé et ce qui est décidé
 *
 * - La liste des **fichiers de configuration** est une décision de périmètre, écrite
 *   ici, courte et justifiée. `config/lemon-squeezy.php` en est absent : mesuré, il
 *   n'a aucune clé à défaut vide.
 * - La liste des **clés** est DÉRIVÉE de ces fichiers à chaque exécution. Une clé
 *   ajoutée à `config/whatsapp.php` demain est gardée sans que personne ne pense à
 *   mettre cette garde à jour. *Aucune liste maintenue à la main ne reste juste ;
 *   seule une liste dérivée le reste.*
 *
 * Usage :
 *   node scripts/check-webhook-env-keys.mjs           # sort en 1 au moindre trou
 *   node scripts/check-webhook-env-keys.mjs --report  # liste la matrice complète
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clefsDeclarees } from './lib/env-keys.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'takussan-api');
const REPORT = process.argv.includes('--report');

/**
 * Fichiers de configuration qui portent une garde de webhook ENTRANT. Décision de
 * périmètre — la seule chose écrite à la main dans cette garde.
 */
const CONFIGS_A_GARDE = ['config/sms.php', 'config/whatsapp.php'];

/**
 * Environnements SUIVIS PAR GIT — les seuls que ce dépôt peut garantir.
 *
 * `.env.example` est le contrat des clés ET l'environnement de TEST de la CI
 * (dette D-54) : une valeur non vide y change le comportement de la suite, donc
 * les clés s'y déclarent **vides**, comme les quatre clés SMS déjà en place.
 */
const ENVIRONNEMENTS = ['.env.example', '.env.docker'];

/**
 * `.env.preview` et `.env.prod` sont IGNORÉS par git (`takussan-api/.gitignore`
 * n'excepte que `.env.example` et `.env.docker`). Ils vivent sur les machines et
 * sur le serveur, pas dans le dépôt — **et n'existent donc pas en CI**.
 *
 * Les exiger ferait rougir le build sur des fichiers absents par conception. Ils
 * sont signalés quand ils existent, parce qu'un développeur qui les a sous la main
 * gagne à voir le trou ; ils ne font jamais échouer.
 *
 * *Une garde ne peut pas garantir ce que le dépôt ne contient pas.* Déclarer ces
 * clés côté preview et production est un acte de DÉPLOIEMENT — il appartient à
 * TCK-288, au même titre que la dette D-48 sur le `.env` de développement.
 */
const ENVIRONNEMENTS_HORS_DEPOT = ['.env.preview', '.env.prod'];

/** Clés lues avec un défaut à la chaîne vide → échec fermé silencieux. */
function clesEchouantFerme(cheminConfig) {
  const contenu = readFileSync(cheminConfig, 'utf8');
  const trouvees = new Set();
  for (const m of contenu.matchAll(/env\(\s*'([A-Z][A-Z0-9_]*)'\s*,\s*''\s*\)/g)) {
    trouvees.add(m[1]);
  }
  return trouvees;
}

const attendues = new Map(); // clé → fichier de config d'origine
for (const relatif of CONFIGS_A_GARDE) {
  const chemin = join(API, relatif);
  if (!existsSync(chemin)) {
    console.error(`✗ ${relatif} : introuvable. Le périmètre de la garde est périmé.`);
    process.exit(1);
  }
  for (const cle of clesEchouantFerme(chemin)) {
    if (!attendues.has(cle)) attendues.set(cle, relatif);
  }
}

if (attendues.size === 0) {
  // Une garde qui ne garde rien est pire qu'une garde absente : elle rassure.
  console.error(
    `✗ aucune clé à défaut vide trouvée dans ${CONFIGS_A_GARDE.join(', ')}.\n` +
      `  La dérivation est cassée, ou les gardes webhook ont changé de forme.\n` +
      `  Dans les deux cas ce script ne garde plus rien — corriger avant de continuer.`
  );
  process.exit(1);
}

const declarees = new Map(); // environnement → Set de clés
for (const env of ENVIRONNEMENTS) {
  const chemin = join(API, env);
  if (!existsSync(chemin)) {
    console.error(`✗ ${env} : fichier introuvable (${chemin})`);
    process.exit(1);
  }
  declarees.set(env, new Set(clefsDeclarees(readFileSync(chemin, 'utf8')).keys()));
}

// Les fichiers hors dépôt sont lus s'ils existent, et seulement pour être signalés.
const horsDepotPresents = [];
for (const env of ENVIRONNEMENTS_HORS_DEPOT) {
  const chemin = join(API, env);
  if (!existsSync(chemin)) continue;
  horsDepotPresents.push(env);
  declarees.set(env, new Set(clefsDeclarees(readFileSync(chemin, 'utf8')).keys()));
}

const erreurs = [];
for (const [cle, origine] of attendues) {
  for (const env of ENVIRONNEMENTS) {
    if (!declarees.get(env).has(cle)) {
      erreurs.push(`${cle} : lue par ${origine}, absente de ${env}`);
    }
  }
}

const signalements = [];
for (const [cle] of attendues) {
  for (const env of horsDepotPresents) {
    if (!declarees.get(env).has(cle)) signalements.push(`${cle} absente de ${env}`);
  }
}

if (REPORT) {
  const colonnes = [...ENVIRONNEMENTS, ...horsDepotPresents];
  console.log(`${attendues.size} clé(s) à échec fermé dérivée(s) de ${CONFIGS_A_GARDE.join(', ')} :\n`);
  const large = Math.max(...[...attendues.keys()].map((k) => k.length));
  const entetes = colonnes.map((e) => e.replace('.env.', ''));
  console.log(`${''.padEnd(large)}  ${entetes.join('  ')}`);
  for (const cle of [...attendues.keys()].sort()) {
    const cases = colonnes.map((env, i) =>
      (declarees.get(env).has(cle) ? '✓' : '✗').padEnd(entetes[i].length)
    );
    console.log(`${cle.padEnd(large)}  ${cases.join('  ')}`);
  }
  if (horsDepotPresents.length > 0) {
    console.log(`\n(${horsDepotPresents.join(', ')} : hors dépôt — signalés, jamais bloquants)`);
  }
  console.log('');
}

if (signalements.length > 0) {
  console.warn(`⚠ ${signalements.length} clé(s) absente(s) d'un environnement HORS DÉPÔT :\n`);
  for (const s of signalements) console.warn(`  · ${s}`);
  console.warn(
    `\nCes fichiers sont ignorés par git et absents en CI : ce script ne peut pas les garantir.\n` +
      `Les déclarer côté preview/production est un acte de déploiement — cf. TCK-288.\n`
  );
}

if (erreurs.length === 0) {
  console.log(
    `✓ gardes webhook : ${attendues.size} clés déclarées dans ${ENVIRONNEMENTS.join(' et ')}.`
  );
  process.exit(0);
}

console.error(`✗ ${erreurs.length} clé(s) de garde webhook non déclarée(s) :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nCes gardes échouent FERMÉ : jeton vide → 404, allowlist vide → 403, secret vide → rejet.\n` +
    `Une clé absente ne produit donc aucune erreur — le webhook est simplement muet.\n` +
    `Déclare-la dans chaque fichier, vide dans .env.example (c'est l'env de test de la CI).`
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
