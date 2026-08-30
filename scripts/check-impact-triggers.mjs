#!/usr/bin/env node
/**
 * Garde des DÉCLENCHEURS DURS du sélecteur d'impact.
 *
 * `bin/impacted-tests.php` ne lance que les tests que le diff touche — sauf quand le
 * fichier touché sort de la portée de la carte, auquel cas il impose la SUITE ENTIÈRE.
 * La liste de ces chemins-là est définie EN CODE, dans quatre constantes de
 * `takussan-api/tests/Support/ImpactSelector.php`, et elle est RECOPIÉE À LA MAIN dans
 * `takussan-api/CLAUDE.md` § « Ne lancer que les tests que le diff touche ».
 *
 * **Elle avait déjà dérivé le jour où elle a été écrite** — `composer.json` manquait à la
 * copie — et c'est une revue de code qui l'a vu, pas une garde. Le fichier a ensuite porté
 * pendant un temps l'avertissement « cette liste est recopiée à la main et rien ne la
 * garde » : honnête, et sans effet — le déclencheur suivant ajouté au code ne se serait pas
 * propagé davantage (TCK-325).
 *
 * **Les deux sens coûtent, et ils ne coûtent pas pareil :**
 *   · un déclencheur PRÉSENT dans le code, ABSENT de la doc → un agent croit un fichier
 *     inerte alors que l'outil escalade : il perd du temps, rien de plus ;
 *   · un chemin PRÉSENT dans la doc, ABSENT du code → un agent croit qu'un fichier
 *     escalade alors qu'il ne déclenche rien. Son `impacted-tests.php` rend vert sans
 *     avoir joué ce qu'il fallait — **un vert qui ne prouve rien**, la panne exacte que
 *     TCK-320 existe pour rendre impossible.
 * D'où la comparaison dans LES DEUX SENS, et l'égalité stricte plutôt que l'inclusion.
 *
 * **`INERT_PREFIXES` est couverte au même titre que les autres**, et c'est elle la
 * plus coûteuse à laisser dériver : c'est la seule liste dont un ajout non documenté
 * fabrique le faux vert ci-dessus. Un préfixe déclaré inerte à tort n'escalade jamais.
 *
 * **`GLOBAL_TRANSLATION_DOMAINS` a rejoint les trois autres avec TCK-476.** Depuis que
 * `lang/<locale>/<domaine>.php` se résout au lieu d'escalader en bloc, cette liste porte
 * l'exception : les dictionnaires que le FRAMEWORK lit lui-même (`validation.php` émet le
 * message de chaque 422 du dépôt) et dont aucun balayage de `app/` ne peut nommer les
 * consommateurs. Elle penche du côté qui ne coûte que des secondes — mais un domaine qui
 * en SORT sans que la documentation bouge fait croire à une escalade qui n'a plus lieu,
 * c'est-à-dire le sens coûteux décrit ci-dessus.
 *
 * ⚠ **PORTÉE, écrite ici parce qu'une garde qui laisse croire plus qu'elle ne prouve est
 * pire qu'aucune garde :**
 *   · Elle compare des ENSEMBLES de chaînes, pas la prose qui les entoure. Un chemin bien
 *     cité mais mal expliqué reste vert.
 *   · `HARD_PREFIXES` et `HARD_FILES` sont comparées à la même zone, en UNION. La
 *     documentation ne distingue pas — à juste titre — le préfixe du fichier : pour son
 *     lecteur, les deux imposent la suite entière et rien d'autre ne compte. Déplacer une
 *     entrée d'une constante à l'autre reste donc vert.
 *   · Elle ne lit PAS le code exécuté : elle lit quatre littéraux de tableau. Une refonte
 *     du sélecteur qui cesserait d'utiliser ces constantes rendrait la garde muette —
 *     d'où l'échec dur ci-dessous sur « constante introuvable », qui est le seul filet
 *     contre ce cas.
 *
 * **La garde ne rédige pas la documentation, elle la confronte** (« Hors périmètre » du
 * ticket) : engendrer cette section depuis le code lui ferait perdre le raisonnement qui
 * en fait la valeur.
 *
 * Usage :
 *   node scripts/check-impact-triggers.mjs
 *   node scripts/check-impact-triggers.mjs --report
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const SOURCE = join(ROOT, 'takussan-api', 'tests', 'Support', 'ImpactSelector.php');
const DOC = join(ROOT, 'takussan-api', 'CLAUDE.md');

const SOURCE_REL = 'takussan-api/tests/Support/ImpactSelector.php';
const DOC_REL = 'takussan-api/CLAUDE.md';

/**
 * Les trois confrontations. Chacune nomme sa zone de documentation par un marqueur HTML
 * explicite plutôt que par une heuristique « ça ressemble à un chemin » : la section
 * contient des dizaines d'autres empans de code — `app/`, `tests/BaseTestCase.php`,
 * `.env.example`, `git diff --name-only` — dont AUCUN n'est un déclencheur. Une garde qui
 * les prendrait pour tels rougirait sur du texte juste, et on la désarmerait au troisième
 * faux positif.
 */
const CONFRONTATIONS = [
  {
    titre: 'déclencheurs durs (suite entière imposée)',
    constantes: ['HARD_PREFIXES', 'HARD_FILES'],
    marqueur: 'garde:déclencheurs-durs',
  },
  {
    titre: 'chemins inertes (aucun test exécuté)',
    constantes: ['INERT_PREFIXES'],
    marqueur: 'garde:chemins-inertes',
  },
  {
    titre: 'dictionnaires de lang/ lus par le framework (suite entière imposée)',
    constantes: ['GLOBAL_TRANSLATION_DOMAINS'],
    marqueur: 'garde:dictionnaires-globaux',
  },
];

const erreurs = [];

for (const [chemin, libelle] of [
  [SOURCE, SOURCE_REL],
  [DOC, DOC_REL],
]) {
  if (!existsSync(chemin)) {
    console.error(`✗ déclencheurs d'impact : ${libelle} est introuvable.`);
    process.exit(1);
  }
}

const source = readFileSync(SOURCE, 'utf8');
const doc = readFileSync(DOC, 'utf8');

/**
 * Les valeurs d'un `private const NOM = [ … ];`.
 *
 * ⚠ **Rend `null` — et jamais `[]` — quand la constante est INTROUVABLE.** C'est le point
 * qui fait la différence entre une garde et un décor : un tableau vide s'accorde avec
 * n'importe quelle documentation, donc une constante renommée ou supprimée rendrait la
 * garde VERTE au moment précis où elle cesse de garder quoi que ce soit. L'appelant
 * distingue les deux et échoue sur les deux (une constante vide est un défaut à son tour :
 * `INERT_PREFIXES` vidée ferait tout escalader, `HARD_FILES` vidée ferait le contraire).
 *
 * On coupe chaque ligne à son premier `//` avant d'y chercher les littéraux : les
 * commentaires de ces constantes contiennent des apostrophes françaises, qu'un balayage
 * naïf des guillemets simples prendrait pour des délimiteurs de chaîne. Aucune valeur de
 * chemin ne contient `//` — si un jour l'une en contenait, la garde le dirait en rougissant
 * sur une valeur tronquée, pas en se taisant.
 *
 * @returns {string[]|null}
 */
function valeursDeLaConstante(nom) {
  const bloc = new RegExp(`private const ${nom} = \\[([\\s\\S]*?)\\];`).exec(source);
  if (bloc === null) return null;

  const valeurs = [];
  for (const ligne of bloc[1].split('\n')) {
    const sansCommentaire = ligne.split('//')[0];
    for (const litteral of sansCommentaire.matchAll(/'([^']*)'/g)) {
      valeurs.push(litteral[1]);
    }
  }

  return valeurs;
}

/**
 * Les empans de code d'une zone `<!-- marqueur --> … <!-- /marqueur -->` de la doc.
 *
 * Même contrat que ci-dessus : `null` quand la zone est introuvable — un marqueur effacé
 * par une réécriture de la section doit rougir, pas produire un ensemble vide.
 *
 * @returns {string[]|null}
 */
function empansDeLaZone(marqueur) {
  const zone = new RegExp(`<!-- ${marqueur} -->([\\s\\S]*?)<!-- /${marqueur} -->`).exec(doc);
  if (zone === null) return null;

  return [...zone[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

for (const { titre, constantes, marqueur } of CONFRONTATIONS) {
  const attendus = new Set();
  let constanteManquante = false;

  for (const nom of constantes) {
    const valeurs = valeursDeLaConstante(nom);

    if (valeurs === null) {
      erreurs.push(
        `${titre} : constante « ${nom} » INTROUVABLE dans ${SOURCE_REL}.\n` +
          `      La garde ne peut plus rien comparer — elle rougit plutôt que de se déclarer verte\n` +
          `      sur un ensemble vide. Renommée ? Supprimée ? Mettre ce script d'accord avec elle.`,
      );
      constanteManquante = true;
      continue;
    }

    if (valeurs.length === 0) {
      erreurs.push(
        `${titre} : constante « ${nom} » VIDE dans ${SOURCE_REL} — aucun littéral extrait.`,
      );
      constanteManquante = true;
      continue;
    }

    for (const v of valeurs) attendus.add(v);
  }

  const cites = empansDeLaZone(marqueur);

  if (cites === null) {
    erreurs.push(
      `${titre} : zone « ${marqueur} » INTROUVABLE dans ${DOC_REL}.\n` +
        `      La section se délimite par <!-- ${marqueur} --> … <!-- /${marqueur} -->.\n` +
        `      Sans ces marqueurs la garde ne sait pas QUELS empans de code comparer : la section\n` +
        `      en contient des dizaines d'autres (\`app/\`, \`.env.example\`…) qui ne sont pas des\n` +
        `      déclencheurs.`,
    );
    continue;
  }

  if (cites.length === 0) {
    erreurs.push(`${titre} : zone « ${marqueur} » vide dans ${DOC_REL} — aucun chemin cité.`);
    continue;
  }

  if (constanteManquante) continue;

  const documentes = new Set(cites);

  const absentsDeLaDoc = [...attendus].filter((v) => !documentes.has(v)).sort();
  const absentsDuCode = [...documentes].filter((v) => !attendus.has(v)).sort();

  for (const v of absentsDeLaDoc) {
    erreurs.push(
      `${titre} : « ${v} » est dans ${constantes.join('/')} mais PAS dans ${DOC_REL} ` +
        `(zone ${marqueur}).`,
    );
  }

  for (const v of absentsDuCode) {
    erreurs.push(
      `${titre} : « ${v} » est cité par ${DOC_REL} (zone ${marqueur}) mais n'est dans AUCUNE ` +
        `des constantes ${constantes.join('/')}.\n` +
        `      C'est le sens le plus coûteux des deux : on croit qu'un fichier escalade alors\n` +
        `      qu'il ne déclenche rien, et le vert obtenu ne prouve rien.`,
    );
  }

  if (REPORT) {
    console.log(`${titre} — ${attendus.size} chemin(s), source ${SOURCE_REL} :`);
    console.log(`  ${[...attendus].sort().join(' · ')}`);
  }
}

if (erreurs.length > 0) {
  console.error(`✗ déclencheurs d'impact — ${erreurs.length} écart(s) code ↔ documentation :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  console.error(
    `\n  La SOURCE DE VÉRITÉ est le code (${SOURCE_REL}).\n` +
      `  Cette garde ne rédige pas la documentation : elle la confronte.`,
  );
  process.exit(1);
}

console.log(
  "✓ déclencheurs d'impact : les quatre constantes d'ImpactSelector et les énumérations de " +
    `${DOC_REL} disent la même chose (comparaison dans les deux sens).`,
);
