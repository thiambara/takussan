#!/usr/bin/env node
/**
 * Garde de l'ATTESTATION PAR ARBRE (ADR-0063, TCK-636) : une suite n'est sautée que sur un arbre
 * qu'un run a déjà vu vert — et jamais parce que le mécanisme s'est trompé en silence.
 *
 * Le mécanisme a quatre manières de mentir, toutes vertes à l'écran, et c'est ce qu'elle tient :
 *
 *   1. Le job lourd perd `!cancelled()` : un job `attestation` en échec le fait SAUTER, et un job
 *      sauté passe un check requis. La suite ne tourne plus, la PR est verte.
 *   2. Le job lourd ne dépose plus son artefact, ou le dépose sous un autre nom : rien ne se
 *      saute plus jamais — le gain disparaît sans un rouge.
 *   3. `promotion-ci.yml` appelle une suite sans lui accorder `actions: read` : le job
 *      `attestation` le demande, et le run de promotion échoue AU DÉMARRAGE (`startup_failure`,
 *      mesuré sur la promotion #369) — y compris quand l'appel ne déclare aucune permission.
 *   4. Le code de l'API se met à lire un fichier de `takussan-web/` que la clé de l'API ne couvre
 *      pas : un changement de ce fichier ne change plus la clé, et une attestation périmée passe.
 *      (Le front, lui, a TOUT `takussan-api/` dans sa clé — `scripts/ci-attestation.mjs`.)
 *   5. L'exclusion de la documentation (TCK-638) dérive : `api-ci.yml` exclut de son déclencheur
 *      autre chose que ce que `HORS_CLE` retire de la clé — le workflow saute un fichier que la clé
 *      juge pertinent, ou se déclenche pour rien —, ou un motif s'étend jusqu'à un dossier de code,
 *      dont `CourtierAbsentTest` lit tous les fichiers quelle que soit l'extension.
 *   6. Le front (TCK-2950) : `statique` et les shards de `tests` tournent en parallèle, et `quality`,
 *      l'AGRÉGATEUR, porte le check requis. Un agrégateur sans `!cancelled()` est SAUTÉ dès qu'un
 *      shard rougit — vert pour la protection ; un agrégateur qui ne lit pas le `result` de chaque
 *      job lourd est vert sur un rouge ; un shard qui dépose l'attestation atteste un quart de la
 *      suite ; une matrice qui n'est pas exactement 1..N, ou un dénominateur recopié qui en diverge,
 *      laisse des fichiers sans runner — en vert. Et le nom de l'agrégateur est celui que la
 *      protection de `preview`/`master` exige, au caractère près.
 *
 * Ce qu'elle ne vérifie PAS : qu'un job sauté compte bien comme réussi pour la protection de
 * branche — c'est une propriété de GitHub, mesurée sur une promotion (TCK-636, AC3), pas un texte.
 *
 * Usage :  node scripts/check-ci-attestation.mjs [--report]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HORS_CLE, PERIMETRES, horsCle } from './ci-attestation.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const erreurs = [];
const notes = [];

/**
 * Les suites attestées : le workflow, son job lourd, la commande qui prouve qu'il a tourné, et le
 * suffixe de ses sorties dans le job `attestation` (`deja-vert<sfx>`, `artefact<sfx>`).
 *
 * TCK-637 — l'API a DEUX jobs lourds, chacun son volet : `lint-and-test` (tests en `--parallel`) et
 * `couverture` (PCOV séquentiel + le cliquet). Chacun doit lire SON `deja-vert` et déposer SON
 * artefact : un job de couverture qui lirait celui des tests serait sauté sur un cliquet rouge.
 */
const SUITES = [
  { suite: 'api', fichier: 'api-ci.yml', job: 'lint-and-test', preuve: /php artisan test --parallel/, sfx: '' },
  { suite: 'api-couverture', fichier: 'api-ci.yml', job: 'couverture', preuve: /bin\/coverage-gate\.php/, sfx: '-couverture' },
];

/**
 * TCK-2950 — le front : DEUX jobs lourds sautés sur l'attestation, qui n'en déposent aucune, et un
 * AGRÉGATEUR qui tourne toujours, rend le verdict et dépose seul l'attestation `web`. Son `name:` est
 * le check requis de `preview`/`master` (relevé par `gh api …/branches/preview/protection`) : le
 * renommer laisserait la protection attendre un statut qui ne viendra jamais.
 */
const FRONT = {
  suite: 'web',
  fichier: 'web-ci.yml',
  lourds: [
    { job: 'statique', preuve: /npm run build/ },
    { job: 'tests', preuve: /vitest run --shard=/ },
  ],
  agregateur: 'quality',
  nomRequis: 'Web (ESLint + tsc + Vitest + build)',
};
const FICHIERS_ATTESTES = [...new Set([...SUITES.map((s) => s.fichier), FRONT.fichier])];

/** Le job `attestation` lance le volet `suite` et peut lister les artefacts. */
function verifierJobAttestation(js, fichier, suite, job) {
  const att = js.attestation;
  if (!att) {
    erreurs.push(`${fichier} : aucun job \`attestation\` — « ${job} » n'a plus rien qui le saute, ni qui le nomme`);
    return;
  }
  const corps = steps(att).join('\n');
  if (!new RegExp(`node scripts/ci-attestation\\.mjs ${suite}(?![\\w-])`).test(corps)) {
    erreurs.push(`${fichier} : le job \`attestation\` ne lance pas \`node scripts/ci-attestation.mjs ${suite}\``);
  }
  if (!/^ {6}actions: read\s*$/m.test(att.join('\n'))) {
    erreurs.push(`${fichier} : le job \`attestation\` ne déclare pas \`actions: read\` — la liste des artefacts rendrait 403`);
  }
}

/** Un job sauté sur SON volet d'attestation : `needs: attestation`, `!cancelled()`, `deja-vert<sfx>`. */
function verifierSaut(lignes, fichier, job, sfx) {
  const needs = cle(lignes, 'needs') ?? '';
  if (!/(^|[\s[,])attestation([\s\],]|$)/.test(needs)) erreurs.push(`${fichier} : « ${job} » ne porte pas \`needs: attestation\``);
  const si = cle(lignes, 'if') ?? '';
  if (!si.includes('!cancelled()')) {
    erreurs.push(
      `${fichier} : le \`if:\` de « ${job} » ne porte pas \`!cancelled()\` — un job \`attestation\` en échec\n` +
        `      le ferait SAUTER, et un job sauté passe un check requis.`,
    );
  }
  if (!si.includes(`needs.attestation.outputs.deja-vert${sfx} != 'true'`)) {
    erreurs.push(`${fichier} : le \`if:\` de « ${job} » ne lit pas \`needs.attestation.outputs.deja-vert${sfx} != 'true'\` — son propre volet`);
  }
}

const estDepot = (s, sfx = '') =>
  /uses: actions\/upload-artifact@/.test(s) && s.includes(`name: \${{ needs.attestation.outputs.artefact${sfx} }}`);

const lireWorkflow = (f) => readFileSync(join(ROOT, '.github/workflows', f), 'utf8');

/** Les jobs d'un workflow, découpés par indentation : `{ nom: lignes[] }`. */
function jobs(texte) {
  const lignes = texte.split('\n');
  const debut = lignes.findIndex((l) => /^jobs:\s*$/.test(l));
  const resultat = {};
  let courant = null;
  for (const l of lignes.slice(debut + 1)) {
    const m = l.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (m) resultat[(courant = m[1])] = [];
    else if (/^\S/.test(l)) courant = null;
    else if (courant) resultat[courant].push(l);
  }
  return resultat;
}

/** Une clé de job (4 espaces) et ses continuations, à plat ; `null` si absente. */
function cle(lignes, nom) {
  const i = lignes.findIndex((l) => new RegExp(`^ {4}${nom}:`).test(l));
  if (i < 0) return null;
  let texte = lignes[i].replace(new RegExp(`^ {4}${nom}:`), '');
  for (const l of lignes.slice(i + 1)) {
    if (l.trim() === '' || /^\s*#/.test(l)) continue;
    if (l.length - l.trimStart().length <= 4) break;
    texte += ' ' + l.trim();
  }
  return texte.trim();
}

/** Les steps d'un job : chaque `      - ` ouvre un step, ses lignes suivent. */
function steps(lignes) {
  const resultat = [];
  for (const l of lignes) {
    if (/^ {6}- /.test(l)) resultat.push([l]);
    else if (resultat.length && (l.length - l.trimStart().length > 6 || l.trim() === '')) resultat.at(-1).push(l);
  }
  return resultat.map((s) => s.filter((l) => !/^\s*#/.test(l)).join('\n'));
}

for (const { suite, fichier, job, preuve, sfx } of SUITES) {
  let texte;
  try {
    texte = lireWorkflow(fichier);
  } catch {
    erreurs.push(`${fichier} introuvable`);
    continue;
  }
  const js = jobs(texte);

  verifierJobAttestation(js, fichier, suite, job);

  // ── Le job lourd ──────────────────────────────────────────────────────────────────────
  const lourd = js[job];
  if (!lourd) {
    erreurs.push(`${fichier} : le job « ${job} » a disparu — mettre à jour cette garde avec le changement qui l'a renommé`);
    continue;
  }
  verifierSaut(lourd, fichier, job, sfx);

  const ss = steps(lourd);
  const iPreuve = ss.findLastIndex((s) => preuve.test(s));
  const iDepot = ss.findIndex((s) => estDepot(s, sfx));
  if (iDepot < 0) {
    erreurs.push(
      `${fichier} : « ${job} » ne dépose aucun artefact nommé \`\${{ needs.attestation.outputs.artefact${sfx} }}\` —\n` +
        `      aucun arbre ne serait plus jamais attesté, et la suite tournerait partout, sans un rouge.`,
    );
  } else if (iPreuve < 0 || iDepot < iPreuve) {
    erreurs.push(`${fichier} : le dépôt de l'attestation précède la commande qui éprouve la suite (${preuve}) — il attesterait un arbre non éprouvé`);
  } else if (/^\s*if:.*always\(\)|^\s*if:.*failure\(\)|continue-on-error: true/m.test(ss[iDepot])) {
    erreurs.push(`${fichier} : le dépôt de l'attestation tourne aussi sur une suite rouge`);
  }
  if (REPORT) notes.push(`${fichier} : attestation → « ${job} » (needs, !cancelled(), deja-vert${sfx}), dépôt au step ${iDepot + 1}/${ss.length}`);
}

// ── Le front : deux jobs lourds en parallèle, un agrégateur qui juge et atteste (TCK-2950) ────
{
  const { suite, fichier, lourds, agregateur, nomRequis } = FRONT;
  const js = jobs(lireWorkflow(fichier));
  verifierJobAttestation(js, fichier, suite, agregateur);

  // Aucun job autre que l'agrégateur ne dépose l'attestation : un shard vert n'atteste pas l'arbre.
  for (const [nom, lignes] of Object.entries(js)) {
    if (nom !== agregateur && steps(lignes).some((s) => estDepot(s))) {
      erreurs.push(`${fichier} : « ${nom} » dépose l'attestation — seul « ${agregateur} », qui a vu TOUS les jobs verts, le peut`);
    }
  }

  for (const { job, preuve } of lourds) {
    const lignes = js[job];
    if (!lignes) {
      erreurs.push(`${fichier} : le job « ${job} » a disparu — mettre à jour cette garde avec le changement qui l'a renommé`);
      continue;
    }
    verifierSaut(lignes, fichier, job, '');
    if (!steps(lignes).some((s) => preuve.test(s))) erreurs.push(`${fichier} : « ${job} » ne joue plus ${preuve}`);
  }

  // La matrice des shards : exactement 1..N, et un dénominateur qui ne peut pas en diverger.
  const tests = js.tests;
  if (tests) {
    const texte = tests.filter((l) => !/^\s*#/.test(l)).join('\n');
    const liste = texte.match(/^\s+shard:\s*\[([^\]]*)\]/m)?.[1];
    const shards = liste ? liste.split(',').map((x) => x.trim()) : [];
    const n = shards.length;
    if (!n || shards.join(',') !== Array.from({ length: n }, (_, i) => String(i + 1)).join(',')) {
      erreurs.push(`${fichier} : la matrice \`shard\` de « tests » n'est pas exactement [1..N] (lu : [${shards.join(', ')}]) — des fichiers resteraient sans runner`);
    }
    const commande = texte.match(/vitest run --shard=(.*?)\s*$/m)?.[1] ?? '';
    const [index, total] = commande.split('/');
    if (index !== '${{ matrix.shard }}' || !(total === '${{ strategy.job-total }}' || total === String(n))) {
      erreurs.push(
        `${fichier} : \`vitest run --shard=${commande}\` — attendu \`--shard=\${{ matrix.shard }}/\${{ strategy.job-total }}\`\n` +
          `      (ou \`/${n}\`) : un dénominateur qui diverge de la matrice laisse des fichiers sans runner.`,
      );
    }
  }

  // L'agrégateur : le check requis. Il tourne TOUJOURS, lit chaque `result`, puis seulement dépose.
  const agr = js[agregateur];
  if (!agr) {
    erreurs.push(`${fichier} : l'agrégateur « ${agregateur} » a disparu — le check requis « ${nomRequis} » n'aurait plus de job`);
  } else {
    if ((cle(agr, 'name') ?? '').replace(/^['"]|['"]$/g, '') !== nomRequis) {
      erreurs.push(`${fichier} : « ${agregateur} » ne s'appelle plus « ${nomRequis} » — le nom du check requis de preview/master`);
    }
    const needs = cle(agr, 'needs') ?? '';
    for (const dep of ['attestation', ...lourds.map((l) => l.job)]) {
      if (!new RegExp(`(^|[\\s[,])${dep}([\\s\\],]|$)`).test(needs)) erreurs.push(`${fichier} : « ${agregateur} » ne porte pas « ${dep} » dans \`needs\``);
    }
    const si = cle(agr, 'if') ?? '';
    if (!si.includes('!cancelled()') && !si.includes('always()')) {
      erreurs.push(
        `${fichier} : le \`if:\` de « ${agregateur} » ne porte ni \`!cancelled()\` ni \`always()\` — il serait SAUTÉ dès\n` +
          `      qu'un shard rougit, et un check requis sauté est un check requis vert.`,
      );
    }
    if (si.includes('deja-vert')) {
      erreurs.push(`${fichier} : le \`if:\` de « ${agregateur} » lit \`deja-vert\` — l'agrégateur doit tourner toujours, c'est lui qui rend le verdict`);
    }
    const ss = steps(agr);
    const iVerdict = ss.findIndex((s) => lourds.every(({ job }) => s.includes(`needs.${job}.result`)) && /exit 1/.test(s));
    const iDepot = ss.findIndex((s) => estDepot(s));
    if (iVerdict < 0) {
      erreurs.push(`${fichier} : « ${agregateur} » n'a aucun step qui lit \`needs.<job>.result\` de ${lourds.map((l) => l.job).join(' et ')} et sort en 1 — il serait vert sur un rouge`);
    }
    if (iDepot < 0) {
      erreurs.push(`${fichier} : « ${agregateur} » ne dépose aucun artefact nommé \`\${{ needs.attestation.outputs.artefact }}\` — aucun arbre ne serait plus attesté`);
    } else {
      if (iVerdict >= 0 && iDepot < iVerdict) erreurs.push(`${fichier} : le dépôt de l'attestation précède le verdict de « ${agregateur} »`);
      if (/^\s*if:.*always\(\)|^\s*if:.*failure\(\)|^\s*if:.*!cancelled\(\)|continue-on-error: true/m.test(ss[iDepot])) {
        erreurs.push(`${fichier} : le dépôt de l'attestation tourne aussi sur un verdict rouge`);
      }
      if (!ss[iDepot].includes("needs.attestation.outputs.deja-vert != 'true'")) {
        erreurs.push(`${fichier} : le dépôt de l'attestation ne s'abstient pas sur un arbre déjà attesté — il prolongerait sans fin sa validité de 7 jours`);
      }
    }
    if (REPORT) notes.push(`${fichier} : ${lourds.map((l) => l.job).join(' + ')} sautés sur l'attestation ; « ${agregateur} » (${nomRequis}) juge au step ${iVerdict + 1}, dépose au step ${iDepot + 1}/${ss.length}`);
  }
}

// ── promotion-ci : un appel qui restreint les permissions doit garder `actions: read` ──────────
const promotion = jobs(lireWorkflow('promotion-ci.yml'));
for (const [nom, lignes] of Object.entries(promotion)) {
  const texte = lignes.join('\n');
  const appel = texte.match(/^ {4}uses: \.\/\.github\/workflows\/([\w-]+\.yml)/m)?.[1];
  if (!appel || !FICHIERS_ATTESTES.includes(appel)) continue;
  // Sans bloc `permissions`, l'appel n'hérite PAS de « tout en lecture » : le réglage du dépôt
  // (`default_workflow_permissions: read`) borne le jeton à `contents` et `packages`, et le job
  // `attestation` qui demande `actions: read` fait échouer le run AU DÉMARRAGE — mesuré sur la
  // promotion #369 (`startup_failure`), pas déduit. Le bloc est donc exigé, `actions: read` dedans.
  if (!/^ {4}permissions:/m.test(texte) || !/^ {6}actions: read\s*$/m.test(texte)) {
    erreurs.push(
      `promotion-ci.yml : l'appel « ${nom} » (${appel}) n'accorde pas \`actions: read\` dans un bloc\n` +
        `      \`permissions\` — le job \`attestation\` appelé le demande, et le run échouerait au démarrage.`,
    );
  }
}

// ── Le périmètre de l'API : ce que son code lit de `takussan-web/` tombe dans sa clé ───────────
const DOSSIERS_API = ['app', 'bin', 'config', 'database', 'routes', 'tests'].map((d) => join(ROOT, 'takussan-api', d));
function* fichiersPhp(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) yield* fichiersPhp(chemin);
    else if (nom.endsWith('.php')) yield chemin;
  }
}
const CONSTRUIT_UN_CHEMIN = /\.\.\/|base_path|__DIR__|dirname\(|realpath|file_get_contents|fopen|File::|Storage::/;
const couvert = (chemin) => PERIMETRES.api.some((p) => chemin === p || chemin.startsWith(`${p}/`));
let references = 0;
for (const dossier of DOSSIERS_API) {
  for (const fichier of fichiersPhp(dossier)) {
    const lignes = readFileSync(fichier, 'utf8').split('\n');
    lignes.forEach((ligne, i) => {
      if (/^\s*(\*|\/\/|#|\/\*)/.test(ligne)) return;
      // Une LECTURE construit un chemin ; une mention (une donnée de test, un libellé) non.
      // Relevé le 2026-10-13 : `ImpactSelectorTest` passe « takussan-web/src/app/page.tsx » en
      // donnée à un sélecteur, sans jamais l'ouvrir.
      if (!CONSTRUIT_UN_CHEMIN.test(ligne)) return;
      for (const m of ligne.matchAll(/takussan-web\/[A-Za-z0-9_.\/-]*/g)) {
        references++;
        if (!couvert(m[0].replace(/\/+$/, ''))) {
          erreurs.push(
            `${relative(ROOT, fichier)}:${i + 1} lit « ${m[0]} », hors de la clé de l'API —\n` +
              `      l'ajouter à PERIMETRES.api dans scripts/ci-attestation.mjs, sans quoi un changement de ce\n` +
              `      fichier laisserait passer une attestation périmée.`,
          );
        }
      }
    });
  }
}
if (REPORT) notes.push(`périmètre de l'API : ${references} référence(s) à takussan-web/ dans son code, toutes dans la clé`);

// ── Ce qui sort de la clé sort du déclencheur, et rien d'autre (TCK-638) ──────────────────────
{
  const texte = readFileSync(join(ROOT, '.github', 'workflows', 'api-ci.yml'), 'utf8');
  const declencheurs = texte.slice(texte.search(/^on:/m), texte.search(/^jobs:/m)).split('\n');
  const negations = { pull_request: [], push: [] };
  let evenement = null;
  for (const ligne of declencheurs) {
    const titre = ligne.match(/^ {2}([a-z_]+):/);
    if (titre) evenement = titre[1];
    const negation = ligne.match(/^\s+- '!(.+)'\s*$/);
    if (negation && evenement in negations) negations[evenement].push(negation[1]);
  }
  const attendu = [...HORS_CLE].sort().join(', ');
  for (const [nom, motifs] of Object.entries(negations)) {
    if ([...motifs].sort().join(', ') !== attendu) {
      erreurs.push(
        `api-ci.yml, \`${nom}\` : le déclencheur exclut [${motifs.join(', ')}], la clé exclut [${attendu}]\n` +
          `      (HORS_CLE, scripts/ci-attestation.mjs) — les deux doivent retirer exactement les mêmes chemins.`,
      );
    }
  }
  // Un motif ne descend dans aucun dossier de code : sondé par des chemins témoins, et sur l'arbre.
  for (const dossier of ['app', 'bin', 'config', 'database', 'routes', 'tests', 'lang']) {
    for (const temoin of [`takussan-api/${dossier}/a.md`, `takussan-api/${dossier}/a/b.php`]) {
      if (horsCle(temoin)) erreurs.push(`HORS_CLE retire « ${temoin} » de la clé — un dossier de code lu par la suite.`);
    }
  }
  for (const motif of HORS_CLE) {
    if (!motif.startsWith('takussan-api/') || motif === 'takussan-api/**') {
      erreurs.push(`HORS_CLE : « ${motif} » sort du périmètre documentaire de l'API.`);
    }
  }
  if (REPORT) notes.push(`hors clé et hors déclencheur : ${attendu}`);
}

if (REPORT) for (const n of notes) console.log(n);
if (erreurs.length) {
  console.error(`✗ attestation par arbre — ${erreurs.length} écart(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}
console.log(`✓ attestation par arbre : ${SUITES.length + 1} suites ne se sautent que sur un arbre attesté vert, et toute incertitude les rejoue.`);
