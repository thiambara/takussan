#!/usr/bin/env node
/**
 * Garde de l'INTERNATIONALISATION du frontend (TCK-286).
 *
 * Le principe n°5 du `CLAUDE.md` racine dit « le front possède le texte affiché ». Mesuré par
 * analyse lexicale de TS/TSX (pas regex, cf. `i18n-scan.mjs`) le 2026-08-15 sur `dev` :
 * **431 fichiers portaient 3 595
 * occurrences de texte affiché codé en dur**, pour 85 fichiers seulement branchés sur next-intl.
 * La règle était donc une intention, pas un état — et rien ne mesurait l'écart (dette D-24).
 *
 * Deuxième défaut, invisible celui-là : `src/i18n/request.ts:95-101` deep-merge le dictionnaire
 * `fr` SOUS toute locale ≠ fr. Une clé traduite en français seulement s'affiche **en français** à
 * un utilisateur anglophone, sans erreur, sans avertissement, sans test rouge. Au 2026-08-15,
 * `wo.json` avait déjà **96 clés de retard** sur `fr.json` et personne ne l'avait jamais vu.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE MESURE — ET CE QU'ELLE NE MESURE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La propriété qu'on VOUDRAIT prouver est : « aucun écran n'affiche de libellé écrit en dur ».
 * Elle n'est pas décidable, et la dette D-23 dit pourquoi : *une garde qui cherche un JETON ne
 * mesure pas la PROPRIÉTÉ*. Compter les fichiers qui importent `useTranslations` mentirait
 * exactement comme l'INDEX.md maintenu à la main : 18 fichiers importent next-intl ET portent du
 * texte en dur, jusqu'à 29 occurrences dans un seul (`admin-agency/AgencyConfigForm.tsx`).
 *
 * Ce script mesure donc DEUX choses, de force très inégale, et le dit dans sa propre sortie :
 *
 *   A. **Parité des clés entre `fr`, `en` et `wo`** — EXACT. On compare les clés feuilles des
 *      trois dictionnaires. Il n'y a pas d'heuristique : une clé est là ou elle n'est pas là.
 *      C'est le contrôle le plus rentable du lot, parce qu'il transforme un repli silencieux en
 *      échec de CI. Il ne dit RIEN de la QUALITÉ de la traduction : une valeur wolof recopiée du
 *      français passe le contrôle. Cette qualité-là n'est pas mécanisable.
 *
 *   B. **Cliquet PAR FICHIER sur le texte affiché en dur** — HEURISTIQUE. Un scan AST compte
 *      quatre catégories (cf. `compteFichier`) et les compare à une baseline par fichier. Un
 *      cliquet GLOBAL (un seul nombre) se contournerait en baissant un fichier pendant qu'un
 *      autre monte ; la baseline est donc une carte `chemin → compte`, et un fichier ABSENT de
 *      la baseline qui porte du texte fait rougir — sinon un écran neuf entre sous le radar, ce
 *      qui est précisément le mode de dégradation que TCK-286 décrit.
 *
 *      ⚠ **Ce que B compte est le TOLÉRÉ, pas le trouvé** (TCK-292, 2026-08-22). Toute occurrence
 *      inscrite dans `i18n-exceptions.mjs` avec sa raison écrite est EXCUSÉE, et sort du cliquet.
 *      Les deux populations étaient auparavant mélangées dans un seul nombre : un `console.error`
 *      du BFF, qui ne sera jamais traduit, et un libellé anglais affiché au super-admin, qui
 *      DEVAIT l'être, y comptaient pareil. Le cliquet disait « pas plus qu'hier » ; il ne pouvait
 *      pas dire « et voici pourquoi ces onze-là sont légitimes », et c'est ce qui rendait « le
 *      compte tombe à zéro » inatteignable.
 *
 *   C. **Les EXCEPTIONS elles-mêmes** — EXACT. Chaque entrée d'`i18n-exceptions.mjs` doit
 *      correspondre à au moins un site réel, porter une famille connue et une raison
 *      substantielle. Une exception qui ne s'applique plus à rien fait ROUGIR : une autorisation
 *      qui survit à son motif est le mécanisme par lequel une liste d'exemptions devient une
 *      passoire. C'est accessoirement le refus de vacuité du scanner — s'il devenait aveugle, les
 *      41 entrées cesseraient toutes de correspondre et la garde crierait, au lieu de passer au
 *      vert en n'ayant plus rien à trouver.
 *
 * B ne certifie RIEN quand il est vert. Ses limites sont MESURÉES, pas supposées :
 *   · Les littéraux de gabarit interpolés (`` `Bonjour ${nom}` ``) ne sont PAS comptés. Le total
 *     est un PLANCHER, jamais un inventaire.
 *   · La liste des attributs d'affichage est une whitelist (`ATTRS_AFFICHAGE`) : un composant
 *     maison qui reçoit du texte sous un autre nom de prop n'est pas compté.
 *   · Les chaînes de classes Tailwind hors `className` (typiquement dans un `cva()`) sont la
 *     seule classe de faux positifs systématique connue — 33 occurrences sur 3 628 mesurées, soit
 *     0,9 %. Elles sont retirées par `ressembleATailwind`.
 *   · Un compte qui descend à 0 sur un fichier ne prouve pas que l'écran est traduit : il prouve
 *     que ce que CETTE garde sait voir a disparu.
 *
 * Usage :
 *   node scripts/check-i18n.mjs              # garde, sort en 1 au moindre écart
 *   node scripts/check-i18n.mjs --report     # + les 20 fichiers les plus chargés (ne désarme rien)
 *   node scripts/check-i18n.mjs --update     # réécrit la baseline après une résorption
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compteFichier } from './i18n-scan.mjs';
import { EXCEPTIONS_JUSTIFIEES, FAMILLES, LONGUEUR_MIN_RAISON } from './i18n-exceptions.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const MESSAGES = join(SRC, 'messages');
const BASELINE = join(WEB, 'scripts', 'i18n-baseline.json');

const REPORT = process.argv.includes('--report');
const UPDATE = process.argv.includes('--update');

/**
 * PLAFONDS de parité, mesurés sur `dev` au 2026-08-15, AVANT le lot 1 de TCK-286.
 *
 * `en` était complet (0 clé manquante) : le plafond est donc 0, et il n'a aucune raison de bouger
 * — toute clé neuve part avec sa traduction anglaise, c'est la décision produit de TCK-286.
 *
 * `wo` accusait **96 clés de retard PRÉEXISTANTES**, jamais vues de personne. Exiger zéro tout de
 * suite reviendrait à faire rougir la CI sur une dette qu'on n'a pas créée ; le plafond a donc
 * démarré à 96 et **ne peut que descendre**. Un compte qui monte est une régression ; un compte
 * qui descend fait rougir aussi, avec l'ordre de baisser le plafond — sans quoi le cliquet se
 * dégrade en plafond mort et laisse remonter jusqu'à l'ancienne valeur sans rien dire.
 *
 * 96 → 88 au lot 1 de TCK-286 : huit des clés manquantes tombaient dans des sous-arbres que le
 * lot réécrivait (`auth.login.*`, `auth.register.*`), et les traduire coûtait moins que de les
 * laisser.
 *
 * 88 → 70 au lot B de TCK-292, et **sans qu'une seule traduction wolof ait été écrite pour ça** :
 * les 18 clés qui manquaient étaient `property.types.*` et deux voisines, un sous-arbre qui n'avait
 * AUCUN consommateur et AUCUN wolof. Il faisait doublon avec `nav.categories.*`, qui traduisait le
 * même enum backend dans les trois langues et que le `Navbar` lisait vraiment. Fusionner les deux
 * a résolu les 18 d'un coup — le doublon était la dette, pas la traduction manquante.
 *
 * 70 → 27 à la vague B–H de TCK-292 (2026-08-20), et cette fois par de vraies traductions : les 43
 * clés résorbées sont celles dont TOUS les consommateurs tombaient dans un lot converti — `nav.*`,
 * `footer.*`, `map.*`, `publicContact.*`, `meta.*`, plus les sous-arbres des surfaces réservations,
 * baux et finances.
 *
 * 27 → **0** à la fin de TCK-292, le même jour. Les 27 dernières étaient des `common.*`, lues
 * partout, donc possédées par aucun lot : elles ne pouvaient tomber qu'à la fin. **Le plafond vaut
 * désormais zéro dans les deux langues**, et ce n'est plus un cliquet qu'on desserre : toute clé
 * française ajoutée sans son wolof fait rougir, comme c'était déjà le cas pour l'anglais.
 *
 * ⚠ Ce cliquet est EXACT sur la PRÉSENCE d'une clé et MUET sur sa JUSTESSE : une valeur wolof
 * recopiée du français le passe sans broncher. La vague B–H l'a payé — un vérificateur a mesuré
 * 42 valeurs `wo` identiques à leur `fr` dans un seul lot, dont une trentaine seulement étaient
 * déclarées. C'est une relecture humaine qu'il faut là, pas une garde.
 */
const PLAFONDS_PARITE = {
  en: 0,
  wo: 0,
};

// ── Parcours ──────────────────────────────────────────────────────────────────────────────────

function fichiersSource(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === 'node_modules' || entree === '__tests__') continue;
      fichiersSource(chemin, acc);
      continue;
    }
    if (!/\.tsx?$/.test(entree)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entree) || /\.d\.ts$/.test(entree)) continue;
    acc.push(chemin);
  }
  return acc;
}

/** Chemin relatif à `takussan-web/`, séparateurs normalisés — la baseline doit être portable. */
const cleFichier = (chemin) => relative(WEB, chemin).split(sep).join('/');

// ── A. Parité des clés entre les trois dictionnaires ──────────────────────────────────────────

function clesFeuilles(objet, prefixe = '', acc = new Map()) {
  for (const [k, v] of Object.entries(objet)) {
    const chemin = prefixe ? `${prefixe}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) clesFeuilles(v, chemin, acc);
    else acc.set(chemin, v);
  }
  return acc;
}

const erreurs = [];

for (const locale of ['fr', 'en', 'wo']) {
  if (!existsSync(join(MESSAGES, `${locale}.json`))) {
    console.error(`✗ src/messages/${locale}.json est introuvable — la garde ne peut rien tenir.`);
    process.exit(1);
  }
}

const dicos = Object.fromEntries(['fr', 'en', 'wo'].map((l) =>
  [l, clesFeuilles(JSON.parse(readFileSync(join(MESSAGES, `${l}.json`), 'utf8')))]));

const parite = {};
for (const locale of ['en', 'wo']) {
  // Une clé présente mais vide vaut absente : elle déclenche le même repli silencieux.
  const manquantes = [...dicos.fr.keys()]
    .filter((k) => !dicos[locale].has(k) || String(dicos[locale].get(k) ?? '').trim() === '');
  const orphelines = [...dicos[locale].keys()].filter((k) => !dicos.fr.has(k));
  parite[locale] = { manquantes, orphelines };
}

// ── B. Cliquet par fichier sur le texte en dur ────────────────────────────────────────────────

const tous = fichiersSource(SRC);
if (tous.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : la forme de
  // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
  console.error('✗ aucun `.ts`/`.tsx` trouvé sous `takussan-web/src` — la garde n’aurait rien vérifié.');
  process.exit(1);
}

// ── C1. La FORME des exceptions — vérifiée AVANT toute mesure ─────────────────────────────────
//
// Cet ordre n'est pas cosmétique : la boucle de mesure appelle `entree.motif.test(…)`. Une entrée
// sans `litteral` NI `motif` y faisait planter Node sur un `TypeError` — un code de sortie 1, mais
// une trace de pile au lieu de la phrase qui dit quoi corriger. *Une garde qui a raison en
// s'effondrant n'apprend rien à qui la lit.*

const ecartsExceptions = [];
const identiteDe = (e) => `${e.fichier} :: ${e.litteral ?? e.motif ?? '(aucun site désigné)'}`;

for (const entree of EXCEPTIONS_JUSTIFIEES) {
  const identite = identiteDe(entree);

  if ((entree.litteral === undefined) === (entree.motif === undefined)) {
    ecartsExceptions.push(
      `l'exception « ${identite} » doit porter EXACTEMENT l'un de \`litteral\` ou \`motif\`. `
      + "Ni les deux (le second serait mort sans que rien ne le dise), ni aucun des deux — une "
      + "entrée sans site désigné excuserait le fichier ENTIER, c'est-à-dire la baseline sous un "
      + 'autre nom, avec en plus l\'autorité d\'une justification écrite.',
    );
  }
  if (!FAMILLES.includes(entree.famille)) {
    ecartsExceptions.push(
      `l'exception « ${identite} » porte la famille inconnue \`${entree.famille}\`. `
      + `Les seules admises : ${FAMILLES.join(', ')}. Le champ est CLOS parce qu'une famille `
      + "inventée à la volée efface le raisonnement qui a produit le classement.",
    );
  }
  if (typeof entree.raison !== 'string' || entree.raison.trim().length < LONGUEUR_MIN_RAISON) {
    ecartsExceptions.push(
      `l'exception « ${identite} » n'a pas de raison substantielle `
      + `(${LONGUEUR_MIN_RAISON} caractères minimum). Le champ \`raison\` est ce qui rend `
      + "l'exception RELISIBLE : sans lui, cette liste n'est qu'une baseline plus permissive.",
    );
  }
}

if (ecartsExceptions.length > 0) {
  // On sort ICI plutôt que de poursuivre : la mesure qui suit LIT ces entrées, et une entrée mal
  // formée ferait de sa sortie un mensonge (une occurrence excusée à tort, ou une trace de pile).
  console.error(`\n✗ ${ecartsExceptions.length} exception(s) i18n MAL FORMÉE(S) :\n`);
  for (const e of ecartsExceptions) console.error(`  · ${e}`);
  console.error('\n  La mesure du texte en dur n\'a PAS été faite : elle lit ces entrées.');
  process.exit(1);
}

// ── B/C. Le tri : chaque occurrence est EXCUSÉE (raison écrite) ou TOLÉRÉE (dette au cliquet) ──

/** L'entrée d'exception couvre-t-elle cette occurrence ? `litteral` est EXACT, `motif` est testé. */
const couvre = (entree, extrait) => (
  entree.litteral !== undefined ? entree.litteral === extrait : entree.motif.test(extrait)
);

/** Combien de sites chaque entrée a-t-elle réellement couverts — cf. contrôle C. */
const sitesParException = new Map(EXCEPTIONS_JUSTIFIEES.map((e) => [e, 0]));

const mesure = new Map();      // toléré, par fichier — c'est CE compte que la baseline garde
const detail = new Map();      // les occurrences tolérées, pour le rapport
const excuses = new Map();     // excusé, par fichier
const parFamille = new Map();  // excusé, par famille

for (const chemin of tous) {
  const cle = cleFichier(chemin);
  const trouves = compteFichier(chemin, readFileSync(chemin, 'utf8'));
  const toleres = [];
  for (const occurrence of trouves) {
    const entree = EXCEPTIONS_JUSTIFIEES
      .find((e) => e.fichier === cle && couvre(e, occurrence.extrait));
    if (entree === undefined) {
      toleres.push(occurrence);
      continue;
    }
    sitesParException.set(entree, sitesParException.get(entree) + 1);
    excuses.set(cle, (excuses.get(cle) ?? 0) + 1);
    parFamille.set(entree.famille, (parFamille.get(entree.famille) ?? 0) + 1);
  }
  if (toleres.length > 0) {
    mesure.set(cle, toleres.length);
    detail.set(cle, toleres);
  }
}
const total = [...mesure.values()].reduce((a, b) => a + b, 0);
const totalExcuse = [...excuses.values()].reduce((a, b) => a + b, 0);

// ── C2. La FRAÎCHEUR des exceptions — après la mesure, qui seule sait ce qui a été couvert ────

for (const entree of EXCEPTIONS_JUSTIFIEES) {
  if (sitesParException.get(entree) === 0) {
    ecartsExceptions.push(
      `l'exception « ${identiteDe(entree)} » ne correspond à AUCUN site. Le fichier a été renommé, `
      + "le littéral corrigé, ou le scanner ne le voit plus. Une autorisation qui survit à son "
      + "motif n'est pas inoffensive : elle donne à la liste une autorité qu'elle n'a plus. La "
      + 'retirer, ou corriger ce qui a bougé.',
    );
  }
}


if (UPDATE) {
  const fichiers = Object.fromEntries([...mesure.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify({
    _lisez_moi: 'GÉNÉRÉ par `node scripts/check-i18n.mjs --update`. Ne pas éditer à la main : '
      + 'ces comptes sont une MESURE, et un compte recopié à la main est faux dès le commit suivant. '
      + 'Chaque entrée est un plafond PAR FICHIER qui ne peut que descendre. '
      + 'Depuis TCK-292 (2026-08-22), ce fichier ne compte QUE le TOLÉRÉ : les occurrences '
      + 'inscrites dans `scripts/i18n-exceptions.mjs` avec leur raison écrite sont EXCUSÉES et '
      + "n'apparaissent pas ici. Un objet `fichiers` vide veut donc dire « plus aucune dette non "
      + 'justifiée », et non « plus aucun littéral ».',
    total,
    fichiers,
  }, null, 2)}\n`);
  console.log(`✓ baseline réécrite : ${mesure.size} fichier(s), ${total} occurrence(s) TOLÉRÉE(S)`
    + ` — ${totalExcuse} autre(s) sont excusées par ${EXCEPTIONS_JUSTIFIEES.length} exception(s)`
    + ' écrite(s) dans `scripts/i18n-exceptions.mjs`.');
  if (ecartsExceptions.length > 0) {
    // `--update` réécrit la baseline, il ne PARDONNE pas une exception invalide : la réécriture
    // aurait justement retiré du cliquet les sites qu'une exception périmée couvrait à tort.
    console.error(`\n✗ ${ecartsExceptions.length} écart(s) sur les exceptions :\n`);
    for (const e of ecartsExceptions) console.error(`  · ${e}`);
    process.exit(1);
  }
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('✗ `takussan-web/scripts/i18n-baseline.json` est introuvable.');
  console.error('  Sans référence, le cliquet ne cliquette pas. Génère-la : node scripts/check-i18n.mjs --update');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')).fichiers ?? {};

const monte = [];
const neufs = [];
const descend = [];
const morts = [];

for (const [f, compte] of mesure) {
  const plafond = baseline[f];
  if (plafond === undefined) neufs.push([f, compte]);
  else if (compte > plafond) monte.push([f, compte, plafond]);
  else if (compte < plafond) descend.push([f, compte, plafond]);
}
for (const [f, plafond] of Object.entries(baseline)) {
  if (!mesure.has(f)) morts.push([f, plafond]);
}

// ── Rapport ───────────────────────────────────────────────────────────────────────────────────

if (REPORT) {
  const totalBaseline = Object.values(baseline).reduce((a, b) => a + b, 0);
  console.log(`i18n — ${tous.length} fichiers source lus sous takussan-web/src (hors tests)\n`);
  console.log('  A · parité des clés (contrôle EXACT)');
  console.log(`      fr : ${dicos.fr.size} clés feuilles (référence)`);
  for (const locale of ['en', 'wo']) {
    console.log(`      ${locale} : ${dicos[locale].size} clés · ${parite[locale].manquantes.length} manquante(s)`
      + ` / plafond ${PLAFONDS_PARITE[locale]} · ${parite[locale].orphelines.length} orpheline(s)`);
    for (const k of parite[locale].manquantes.slice(0, 20)) console.log(`          · ${k}`);
    if (parite[locale].manquantes.length > 20) {
      console.log(`          … et ${parite[locale].manquantes.length - 20} autres`);
    }
  }
  console.log(`\n  B · texte en dur — ${total + totalExcuse} occurrence(s) vue(s) par le scanner`);
  console.log(`      ${String(totalExcuse).padStart(4)} EXCUSÉE(S)  — raison écrite dans `
    + `scripts/i18n-exceptions.mjs (${EXCEPTIONS_JUSTIFIEES.length} exception(s))`);
  for (const famille of FAMILLES) {
    const n = parFamille.get(famille) ?? 0;
    if (n > 0) console.log(`           ${String(n).padStart(4)}  ${famille}`);
  }
  console.log(`      ${String(total).padStart(4)} TOLÉRÉE(S)  — dette au cliquet, sur `
    + `${mesure.size} fichier(s) ; baseline : ${totalBaseline} sur `
    + `${Object.keys(baseline).length} fichier(s)`);
  if (total === 0) {
    console.log('           (aucune — toute occurrence vue est motivée)');
  }
  for (const [f, c] of [...mesure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`           ${String(c).padStart(4)}  ${f}`);
    for (const t of detail.get(f) ?? []) {
      console.log(`                 ${t.categorie.padEnd(9)} ${f.split('/').pop()}:${t.ligne}  ${t.extrait}`);
    }
  }
  const parCategorie = {};
  for (const trouves of detail.values()) {
    for (const t of trouves) parCategorie[t.categorie] = (parCategorie[t.categorie] ?? 0) + 1;
  }
  if (total > 0) {
    console.log(`      par catégorie (toléré) : ${Object.entries(parCategorie).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  }
  console.log();
}

// ── Verdict ───────────────────────────────────────────────────────────────────────────────────

for (const locale of ['en', 'wo']) {
  const { manquantes, orphelines } = parite[locale];
  const plafond = PLAFONDS_PARITE[locale];
  if (manquantes.length > plafond) {
    const echantillon = manquantes.slice(0, 8).map((k) => `\`${k}\``).join(', ');
    erreurs.push(
      `\`src/messages/${locale}.json\` : ${manquantes.length} clé(s) absente(s) de \`fr.json\` pour un `
      + `plafond de ${plafond} — le compte a MONTÉ. ${echantillon}`
      + (manquantes.length > 8 ? ` … (+${manquantes.length - 8})` : '')
      + `. Ces clés ne produiront AUCUNE erreur à l'exécution : \`src/i18n/request.ts:95-101\` `
      + `deep-merge \`fr\` sous \`${locale}\`, donc l'utilisateur ${locale === 'en' ? 'anglophone' : 'wolophone'} `
      + `verra du français sans que rien ne le signale. Traduis-les, ou lance \`--report\` pour la liste.`,
    );
  } else if (manquantes.length < plafond) {
    erreurs.push(
      `\`${locale}\` n'a plus que ${manquantes.length} clé(s) manquante(s) pour un plafond de ${plafond} : `
      + `le compte a DESCENDU, baisse \`PLAFONDS_PARITE.${locale}\` à ${manquantes.length} dans ce fichier. `
      + "Un cliquet qu'on ne resserre pas redevient un plafond mort — il laisse remonter jusqu'à "
      + "l'ancienne valeur sans rien dire.",
    );
  }
  if (orphelines.length > 0) {
    erreurs.push(
      `\`src/messages/${locale}.json\` porte ${orphelines.length} clé(s) qui n'existent pas dans `
      + `\`fr.json\` : ${orphelines.slice(0, 8).map((k) => `\`${k}\``).join(', ')}`
      + (orphelines.length > 8 ? ` … (+${orphelines.length - 8})` : '')
      + '. Personne ne les lira jamais — soit le français manque, soit ce sont des restes à retirer.',
    );
  }
}

erreurs.push(...ecartsExceptions);

for (const [f, compte, plafond] of monte) {
  erreurs.push(
    `${f} : ${compte} libellé(s) en dur pour un plafond de ${plafond} — le compte a MONTÉ. `
    + 'Passe le texte par `useTranslations` (client) ou `getTranslations` (serveur) et ajoute la clé '
    + 'dans les TROIS dictionnaires `src/messages/{fr,en,wo}.json`.',
  );
}
for (const [f, compte] of neufs) {
  erreurs.push(
    `${f} : ${compte} libellé(s) en dur, et ce fichier n'est PAS dans la baseline. `
    + 'Un écran neuf ne repart pas de la dette : ses libellés passent par next-intl dès le premier '
    + 'commit. (Si le fichier est un renommage, lance `--update` en le disant dans le message de commit.)',
  );
}
for (const [f, compte, plafond] of descend) {
  erreurs.push(
    `${f} : ${compte} libellé(s) en dur pour un plafond de ${plafond} — le compte a DESCENDU. `
    + 'Lance `node scripts/check-i18n.mjs --update` pour resserrer le cliquet. Sans ça la baseline '
    + 'devient un cimetière : elle laisse remonter jusqu\'à l\'ancienne valeur sans rien dire.',
  );
}
for (const [f, plafond] of morts) {
  erreurs.push(
    `${f} porte ${plafond} entrée(s) dans la baseline mais ne compte plus rien (fichier traduit, `
    + 'supprimé ou renommé). Lance `node scripts/check-i18n.mjs --update` pour retirer la ligne.',
  );
}

if (erreurs.length === 0) {
  console.log(
    `✓ i18n : parité tenue (en ${parite.en.manquantes.length}/${PLAFONDS_PARITE.en}, `
    + `wo ${parite.wo.manquantes.length}/${PLAFONDS_PARITE.wo} clé(s) manquante(s) sur `
    + `${dicos.fr.size} clés fr), et ${total} libellé(s) en dur NON JUSTIFIÉ(S) sur `
    + `${mesure.size} fichier(s), tous au plafond de leur baseline — `
    + `${totalExcuse} autre(s) sont excusé(e)s par ${EXCEPTIONS_JUSTIFIEES.length} exception(s) `
    + 'écrite(s), chacune vérifiée contre un site réel.',
  );
  console.log("  ⚠ PORTÉE — ce vert NE PROUVE PAS que le front est internationalisé.");
  console.log('    · A (parité) est EXACT sur la PRÉSENCE des clés, et muet sur leur QUALITÉ : une');
  console.log('      valeur wolof recopiée du français passe le contrôle sans broncher.');
  console.log('    · B (texte en dur) est un cliquet HEURISTIQUE. Il ne voit pas les gabarits');
  console.log('      interpolés (`Bonjour ${nom}`), ni les props de composants maison hors');
  console.log('      `ATTRS_AFFICHAGE`. Le total est un PLANCHER, jamais un inventaire.');
  console.log('    · Une occurrence EXCUSÉE l’est sur la foi d’une raison écrite par un humain.');
  console.log('      La garde vérifie que la raison existe et que le site existe encore — jamais');
  console.log('      que le classement est juste. C’est exactement l’hypothèse qui a coûté cinq');
  console.log('      libellés affichés à TCK-292 : « ça ressemble à du technique donc ça ne');
  console.log('      s’affiche pas » se vérifie en suivant le littéral jusqu’à son rendu.');
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} écart(s) i18n :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
