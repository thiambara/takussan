#!/usr/bin/env node
/**
 * Garde d'ACCORD sur les drivers des environnements déployés (TCK-300).
 *
 * `docs/configuration.md` donnait TROIS réponses au même sujet :
 *
 *   · ligne 422  — *(Optionnel)* Redis, « la production tourne en `CACHE_STORE=database` » ;
 *   · §5.7       — checklist production : « `CACHE_STORE=redis` » ;
 *   · les `.env` livrés — `CACHE_STORE=redis`.
 *
 * Le défaut n'est pas qu'une des trois soit fausse. **C'est qu'il y en ait trois** : une valeur
 * recopiée dans trois documents diverge au premier changement, et rien ne le signale. Cette garde
 * pose `docs/infra/prod-drivers.json` en source unique et vérifie que les autres la suivent —
 * exactement le patron de `versions.json` / `check-infra-versions.mjs` (TCK-298), un cran à côté.
 *
 * ## Ce qu'elle vérifie, et où elle s'arrête
 *
 * 1. **Le catalogue contre les `.env` livrés** — quand ils existent. `.env.preview` et `.env.prod`
 *    sont ignorés par git et **absents du runner** : les exiger ferait rougir la CI sur des fichiers
 *    absents par conception. Ils sont donc comparés en local et passés en silence en CI. *Une garde
 *    ne peut pas garantir ce que le dépôt ne contient pas.*
 * 2. **Le catalogue contre la checklist §5.7 de `docs/configuration.md`** — celle-là est dans le
 *    dépôt, donc bloquante. C'est le seul endroit du dépôt qui prescrit des drivers de production.
 *
 * Elle ne vérifie **pas** que ces drivers fonctionnent : `.env.prod` déclare `CACHE_STORE=redis` et
 * `REDIS_HOST=127.0.0.1`, mais rien dans le dépôt ne prouve qu'un Redis écoute sur le serveur — et
 * la production n'ayant jamais été déployée, personne ne l'a découvert. C'est TCK-288, et la garde
 * l'imprime plutôt que de le taire.
 *
 * Usage :
 *   node scripts/check-prod-drivers.mjs           # sort en 1 au moindre désaccord vérifiable
 *   node scripts/check-prod-drivers.mjs --report  # + la matrice et ce qui n'a pas pu être vérifié
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clefsDeclarees } from './lib/env-keys.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const CATALOGUE = join(ROOT, 'docs/infra/prod-drivers.json');
const CONFIGURATION = join(ROOT, 'docs/configuration.md');

/** Titre de la section de `configuration.md` qui prescrit les drivers de production. */
const SECTION_PROD = '### 5.7 Production — checklist additionnelle';

if (!existsSync(CATALOGUE)) {
  console.error(`✗ ${CATALOGUE} introuvable — la source unique a disparu.`);
  process.exit(1);
}

const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
const erreurs = [];
const signalements = [];
const verifies = [];

// ── 1. Le catalogue contre les `.env` livrés, quand ils sont là ────────────────────────────────
for (const [nom, env] of Object.entries(catalogue.environnements)) {
  const chemin = join(ROOT, env.fichier);

  if (!existsSync(chemin)) {
    signalements.push(
      `${env.fichier} absent (hors dépôt) — les ${Object.keys(env.drivers).length} drivers de ` +
        `« ${nom} » n'ont pas pu être confrontés à leur source.`
    );
    continue;
  }

  const contenu = readFileSync(chemin, 'utf8');
  const declarees = clefsDeclarees(contenu);

  for (const [cle, attendu] of Object.entries(env.drivers)) {
    if (!declarees.has(cle)) {
      erreurs.push(`${nom} : ${cle} est au catalogue mais absente de ${env.fichier}`);
      continue;
    }
    // Valeur réelle de la ligne — le parseur partagé ne rend que les noms.
    const ligne = contenu.split('\n')[declarees.get(cle).ligne - 1];
    const valeur = (ligne.split('=').slice(1).join('=') || '').trim().replace(/^["']|["']$/g, '');

    if (valeur !== attendu.valeur) {
      erreurs.push(
        `${nom} : ${cle} vaut « ${valeur} » dans ${env.fichier}, ` +
          `le catalogue déclare « ${attendu.valeur} » (mesuré le ${attendu.date})`
      );
    } else {
      verifies.push(`${nom}.${cle} = ${valeur}`);
    }
  }
}

// ── 2. Le catalogue contre la checklist §5.7, qui est DANS le dépôt ─────────────────────────────
const configuration = readFileSync(CONFIGURATION, 'utf8');
const debut = configuration.indexOf(SECTION_PROD);

if (debut === -1) {
  // Le titre a bougé : la garde ne sait plus où regarder, et un vert obtenu sur une section
  // introuvable serait un vert pour la mauvaise raison — le défaut même que ce dépôt traque.
  erreurs.push(
    `docs/configuration.md : section « ${SECTION_PROD} » introuvable. ` +
      `Si elle a été renommée, mettre à jour SECTION_PROD dans cette garde.`
  );
} else {
  const apres = configuration.slice(debut + SECTION_PROD.length);
  const fin = apres.search(/^#{1,3} |^---$/m);
  const section = fin === -1 ? apres : apres.slice(0, fin);

  const prod = catalogue.environnements.production.drivers;

  // ⚠ **Seule la LIGNE D'AMORCE d'une case à cocher prescrit.** Les lignes de continuation
  // indentées expliquent — et une explication cite forcément la valeur qu'elle corrige.
  //
  // Sans ce filtre, la garde rougissait sur sa propre correction : la phrase « cette ligne
  // demandait `QUEUE_CONNECTION=redis` quand les deux fichiers déclarent `database` » contient
  // le littéral fautif, en tant que RÉCIT. C'est exactement le défaut que la 7ᵉ mutation de
  // TCK-298 a trouvé dans `check-db-engine.mjs` : la garde lisait la mémoire du défaut et la
  // prenait pour la déclaration.
  //
  // *Une garde qui ne distingue pas la prescription du récit interdit d'écrire pourquoi on a
  // corrigé — et rend donc le dépôt plus muet à mesure qu'il devient plus juste.*
  const prescriptions = section
    .split('\n')
    .filter((l) => /^\s*-\s*\[[ x]\]/.test(l))
    .join('\n');

  for (const [cle, attendu] of Object.entries(prod)) {
    // Toutes les valeurs prescrites pour cette clé dans la section.
    const prescrites = [...prescriptions.matchAll(new RegExp(`${cle}=([A-Za-z0-9_.-]+)`, 'g'))].map(
      (m) => m[1]
    );

    if (prescrites.length === 0) continue; // la checklist n'a pas à tout prescrire

    const contradictoires = [...new Set(prescrites)].filter((v) => v !== attendu.valeur);
    if (contradictoires.length > 0) {
      erreurs.push(
        `docs/configuration.md §5.7 prescrit ${cle}=${contradictoires.join('/')} ` +
          `alors que ${catalogue.environnements.production.fichier} déclare « ${attendu.valeur} »`
      );
    } else {
      verifies.push(`configuration.md §5.7 : ${cle} = ${attendu.valeur}`);
    }
  }
}

if (REPORT) {
  console.log('Drivers déclarés par les environnements déployés :\n');
  for (const [nom, env] of Object.entries(catalogue.environnements)) {
    const deploye = env.deploye?.valeur ? 'déployé' : 'JAMAIS déployé';
    console.log(`  ${nom} (${env.fichier}${env.hors_depot ? ', hors dépôt' : ''}) — ${deploye}`);
    for (const [cle, d] of Object.entries(env.drivers)) {
      console.log(`      ${cle.padEnd(20)} ${d.valeur}`);
    }
  }
  if (catalogue.manques?.length) {
    console.log('\n  Clés manquantes des `.env` livrés :');
    for (const m of catalogue.manques) {
      console.log(`      ${m.cle.padEnd(24)} gravité : ${m.gravite}`);
    }
  }
  console.log(`\n  ${verifies.length} accord(s) vérifié(s).`);
  if (catalogue._ce_que_ce_fichier_ne_dit_pas) {
    console.log(`\n  ⚠ ${catalogue._ce_que_ce_fichier_ne_dit_pas}\n`);
  }
}

if (signalements.length > 0) {
  console.warn(`⚠ ${signalements.length} vérification(s) impossible(s) ici :\n`);
  for (const s of signalements) console.warn(`  · ${s}`);
  console.warn(
    `\n  Normal sur un runner : ces fichiers sont ignorés par git. En local ils sont comparés.\n`
  );
}

if (erreurs.length === 0) {
  console.log(`✓ drivers de déploiement : ${verifies.length} accord(s) vérifié(s).`);
  process.exit(0);
}

console.error(`✗ ${erreurs.length} désaccord(s) sur les drivers de déploiement :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\n\`docs/infra/prod-drivers.json\` est la source unique. Si un \`.env\` a changé, mettre le\n` +
    `catalogue à jour AVEC sa date de mesure — pas l'inverse : le catalogue enregistre, il ne décide pas.`
);
process.exit(1);
