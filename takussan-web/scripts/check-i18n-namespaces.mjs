#!/usr/bin/env node
/**
 * Garde du DÉCOUPAGE du dictionnaire next-intl (TCK-337).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE EXISTE POUR EMPÊCHER
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le dictionnaire n'est plus servi en entier : chaque frontière de rendu ne reçoit que les espaces
 * de noms que son sous-arbre peut atteindre (`src/i18n/messages.ts`). Ce découpage a un mode de
 * défaillance qu'AUCUNE des quatre vérifications du dépôt ne voit :
 *
 *   `next build` ✓   ESLint ✓   `tsc --noEmit` ✓   ~810 tests vitest ✓   → et l'écran affiche
 *   `dashboard.shortcuts.heading` en toutes lettres à un utilisateur.
 *
 * Une clé manquante n'est pas une erreur de type : c'est une DONNÉE absente d'un objet, découverte
 * au rendu, sur un chemin qui peut être rare. Le corollaire est ce qui rend ce ticket dangereux :
 * **le pire correctif possible — `messages={{}}` — donne le meilleur chiffre de poids et ne fait
 * rougir rien du tout.** Une mesure « avant / après » ne peut donc pas servir de critère
 * d'acceptation à elle seule.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE — ET CE QU'ELLE NE MESURE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * A. **La table est DÉRIVÉE, pas relue.** On marche le graphe d'imports depuis les fichiers du
 *    routeur (`page`, `layout`, `error`, …), en suivant `@/…`, les chemins relatifs et les
 *    `import()`, puis on relève les espaces adressés (règles A/B/C de
 *    `i18n-namespaces-scan.mjs`). Le résultat est comparé à `src/i18n/namespaces.json` — **à
 *    l'identique, dans les deux sens**. Un espace atteignable et non déclaré casse (l'écran
 *    manquerait un libellé) ; un espace déclaré et plus atteignable casse aussi (des octets payés
 *    par tous les visiteurs pour rien). C'est la garde « un document dérivé suit encore sa
 *    source » du `CLAUDE.md`, appliquée au seul endroit du dépôt où la sanction d'une table
 *    périmée est visible par un utilisateur.
 *
 *    ⚠ Le dérivateur SUR-APPROXIME (cf. son en-tête) : il compte plus large plutôt que plus juste,
 *    parce qu'un faux positif coûte quelques centaines d'octets et un faux négatif casse un écran.
 *    Sa preuve de justesse tient dans `src/i18n/__tests__/i18n-namespaces-scan.test.ts`, un cas
 *    par règle — sans quoi une garde devenue aveugle et une garde qui n'a plus rien à trouver
 *    rendent la même sortie verte.
 *
 * B. **Aucun site dynamique n'est ignoré.** `useTranslations(<expression>)` est résolu par récolte
 *    de littéraux ; ce qui ne se résout pas fait ÉCHOUER la garde plutôt que d'être passé sous
 *    silence. Sur ce dépôt, cette règle trouve un espace que le relevé littéral RATE : les filtres
 *    super-admin adressent `property.*` par la table `PROPERTY_ENUM_NAMESPACES`, et le sous-arbre
 *    `(super-admin)` n'aurait pas reçu `property`.
 *
 * C. **Aucune frontière ne sert le dictionnaire entier.** `getMessages()` est interdit hors de
 *    `src/i18n/messages.ts` (c'est l'appel exact qui a produit le défaut), et tout `layout.tsx`
 *    déclaré frontière doit appeler `messagesPour`. Cette seconde vérification vise le piège
 *    documenté dans `IntlProvider.tsx` : un provider imbriqué SANS prop `messages` hérite du
 *    parent en silence.
 *
 * D. **Un cliquet sur la part du dictionnaire** effectivement servie par chaque frontière, exprimé
 *    en POINTS DE POURCENTAGE du dictionnaire complet gzippé — et non en octets. Le choix compte :
 *    un plafond en octets rougirait à chaque traduction ajoutée, ce qui apprend à relever le
 *    plafond sans regarder. Une part, elle, ne bouge que si le DÉCOUPAGE se dégrade.
 *
 * Ce que la garde ne prouve PAS, et il faut le dire : qu'aucun `MISSING_MESSAGE` ne survient. Elle
 * prouve que le sous-ensemble déclaré couvre ce que le graphe d'imports peut atteindre. Un espace
 * adressé par une chaîne construite à l'exécution qu'aucune des trois règles ne récolte lui
 * échapperait. C'est pour ce reste-là qu'existe `surErreurIntl` (`src/i18n/erreurs.ts`), qui lève
 * hors production.
 *
 * Usage :
 *   node scripts/check-i18n-namespaces.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-i18n-namespaces.mjs --report   # + la table mesurée (ne désarme rien)
 *   node scripts/check-i18n-namespaces.mjs --update   # régénère src/i18n/namespaces.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  FICHIERS_ROUTEUR,
  espacesAtteignables,
  fichiersDe,
  retireCommentairesPleineLigne,
} from './i18n-namespaces-scan.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const WEB = join(ICI, '..');
const SRC = join(WEB, 'src');
const APP = join(SRC, 'app');
const TABLE = join(SRC, 'i18n', 'namespaces.json');
const DICTIONNAIRE = join(SRC, 'messages', 'fr.json');

/**
 * Les espaces qu'aucun scan de site d'appel ne peut voir — leur justification complète est dans
 * `src/i18n/messages.ts`, à côté de la constante qui les expose au reste du code. Deux noms, codés
 * en dur : c'est l'angle mort assumé du dérivateur.
 */
const PLANCHER = ['errors', 'validation'];

/** Marge du cliquet, en POINTS de pourcentage au-dessus de la part mesurée. */
const MARGE_POINTS = 5;

const args = new Set(process.argv.slice(2));
const rapport = args.has('--report');
const majTable = args.has('--update');

const dico = JSON.parse(readFileSync(DICTIONNAIRE, 'utf8'));
const espacesConnus = new Set(Object.keys(dico));
const partGzip = (noms) => {
  const sous = {};
  for (const n of noms) if (dico[n] !== undefined) sous[n] = dico[n];
  return gzipSync(JSON.stringify(sous)).length;
};

// Le dénominateur se mesure par le MÊME chemin que les numérateurs — clés triées, même
// sérialisation, même gzip. Sinon la « part » n'est pas une fraction : l'ordre des clés change à
// lui seul le taux de compression, et une frontière servant tout le dictionnaire s'affichait à
// 102,3 %. Une mesure appariée, comme le cliquet de couverture du back (TCK-331).
const totalGzip = partGzip(Object.keys(dico).sort());

// ── 1. Les frontières : un `layout.tsx` du routeur = un provider possible ────────────────────────
const fichiersRouteur = fichiersDe(APP).filter(
  (f) => FICHIERS_ROUTEUR.has(basename(f)) && !relative(APP, f).startsWith('api/'),
);
/**
 * TCK-426 — UN LAYOUT QUI NE REND RIEN DE LUI-MÊME N'EST PAS UNE FRONTIÈRE DE DICTIONNAIRE.
 *
 * Ce ticket a posé 14 `layout.tsx` sous `/app` dont le seul travail est de REFUSER : ils
 * appellent une garde, puis rendent `<>{children}</>` et rien d'autre. Ils existent parce qu'un
 * `loading.tsx` ouvre une frontière de suspension sous laquelle un `redirect()` de page rend 200
 * au lieu de 307 — un refus d'autorisation indiscernable d'un succès pour tout ce qui n'est pas
 * un navigateur (mesuré sur Next 16.3.1).
 *
 * Pour next-intl, ces layouts sont TRANSPARENTS : un provider imbriqué remplace le dictionnaire
 * du parent, mais eux n'en montent aucun, donc le provider effectif reste celui du parent, et
 * leur sous-arbre reçoit exactement ce qu'il recevait avant. Les déclarer frontières exigerait
 * 14 `messagesPour` — c'est-à-dire 14 fois les 38 espaces de noms du tableau de bord, sérialisés
 * pour des composants qui n'affichent pas un seul mot. *Le coût que ce fichier existe pour
 * mesurer, payé par la garde elle-même.*
 *
 * ⚠ L'exemption est DÉRIVÉE et étroite, pas déclarée : il faut À LA FOIS qu'aucune API de
 * traduction n'apparaisse dans le fichier ET que le rendu soit exactement `<>{children}</>`. Un
 * layout qui rendrait la moindre chrome traduite retombe dans le contrôle. C'est ce qui empêche
 * l'exemption de couvrir le défaut que ce fichier attrape — « hérite EN SILENCE d'un
 * dictionnaire plus pauvre que ce que son sous-arbre adresse ».
 */
const RENDU_TRANSPARENT = /return\s*<>\s*\{\s*children\s*\}\s*<\/>\s*;/;
const API_DE_TRADUCTION = /getTranslations|useTranslations|messagesPour|IntlProvider|getMessages/;

function estTransparentPourI18n(layout) {
  const source = retireCommentairesPleineLigne(readFileSync(layout, 'utf8'));
  return RENDU_TRANSPARENT.test(source) && !API_DE_TRADUCTION.test(source);
}

const frontieres = fichiersRouteur
  .filter((f) => basename(f) === 'layout.tsx')
  .filter((f) => !estTransparentPourI18n(f))
  .map((f) => dirname(f))
  .sort((a, b) => a.length - b.length);

const idDe = (chemin) => relative(APP, chemin) || '.';

/** La frontière la plus PROFONDE qui gouverne un fichier — c'est elle qui monte son provider. */
function frontierePour(fichier) {
  let meilleure = null;
  for (const f of frontieres) {
    if (fichier.startsWith(f + '/') && (!meilleure || f.length > meilleure.length)) meilleure = f;
  }
  return meilleure;
}
function parentDe(frontiere) {
  let meilleure = null;
  for (const f of frontieres) {
    if (f !== frontiere && frontiere.startsWith(f + '/') && (!meilleure || f.length > meilleure.length)) {
      meilleure = f;
    }
  }
  return meilleure;
}

// ── 2. Dérivation ────────────────────────────────────────────────────────────────────────────────
const entrees = new Map(frontieres.map((f) => [f, []]));
for (const fichier of fichiersRouteur) {
  const f = frontierePour(fichier);
  if (f) entrees.get(f).push(fichier);
}

const echecs = [];
const propres = new Map();
for (const f of frontieres) {
  const { espaces, irresolus } = espacesAtteignables(entrees.get(f), SRC, espacesConnus);
  propres.set(f, espaces);
  for (const { fichier, expression } of irresolus) {
    echecs.push(
      `namespace dynamique IRRÉSOLU — ${relative(WEB, fichier)} : useTranslations(${expression})\n` +
        '    Le rendre décidable : soit un littéral, soit une valeur de `const … as const` que la\n' +
        '    règle B sait replier. Ne PAS le laisser passer : le sous-ensemble servi serait amputé\n' +
        '    d’un espace de noms sans que rien ne le signale.',
    );
  }
}

const cumules = new Map();
function cumule(f) {
  if (cumules.has(f)) return cumules.get(f);
  const parent = parentDe(f);
  const set = new Set([...PLANCHER, ...propres.get(f), ...(parent ? cumule(parent) : [])]);
  const trie = [...set].filter((n) => espacesConnus.has(n)).sort();
  cumules.set(f, trie);
  return trie;
}

const derive = {};
const plafonds = {};
for (const f of frontieres) {
  const id = idDe(f);
  derive[id] = cumule(f);
  const part = (100 * partGzip(derive[id])) / totalGzip;
  plafonds[id] = Math.min(100, Math.ceil(part) + MARGE_POINTS);
}

// ── 3. `getMessages()` ne doit vivre qu'à un endroit ─────────────────────────────────────────────
const AUTORISE_GETMESSAGES = [join(SRC, 'i18n', 'messages.ts'), join(SRC, 'test', 'intl.tsx')];
for (const fichier of fichiersDe(SRC)) {
  if (AUTORISE_GETMESSAGES.includes(fichier)) continue;
  // Sur la source débarrassée de ses commentaires pleine ligne : `src/app/layout.tsx` porte
  // désormais un « ⚠ PAS `getMessages()` » qui explique justement l'interdiction, et une garde
  // qui rougit sur sa propre documentation apprend à ne plus documenter.
  const source = retireCommentairesPleineLigne(readFileSync(fichier, 'utf8'));
  if (/\bgetMessages\s*\(/.test(source)) {
    echecs.push(
      `\`getMessages()\` hors de src/i18n/messages.ts — ${relative(WEB, fichier)}\n` +
        '    C’est l’appel EXACT qui sérialisait les 60 espaces de noms dans la charge RSC de\n' +
        '    chaque document. Passer par `messagesPour(<frontière>)`.',
    );
  }
}

// ── 4. Chaque frontière déclarée monte bien un provider avec un `messages` explicite ─────────────
for (const f of frontieres) {
  const layout = join(f, 'layout.tsx');
  const source = retireCommentairesPleineLigne(readFileSync(layout, 'utf8'));
  const id = idDe(f);
  // On exige l'identifiant EXACT de la frontière, et pas seulement la présence d'un appel.
  // Sans cela, `messagesPour('(dashboard)')` écrit dans `(dashboard)/app/layout.tsx` passait la
  // garde en servant un sous-ensemble amputé de 30 espaces de noms — le défaut au complet, avec
  // le meilleur chiffre de poids du lot.
  const attendu = new RegExp(`messagesPour\\s*\\(\\s*(['"\`])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\s*\\)`);
  if (!attendu.test(source)) {
    echecs.push(
      `frontière sans \`messagesPour('${id}')\` — ${relative(WEB, layout)}\n` +
        '    Un `layout.tsx` est une frontière de rendu : ou bien il sert LE sous-ensemble de sa\n' +
        '    propre frontière, ou bien il hérite EN SILENCE de celui de son parent — plus pauvre\n' +
        '    que ce que son sous-arbre adresse (cf. l’en-tête de `src/i18n/IntlProvider.tsx`).',
    );
  }
}

// ── 5. Comparaison à la table, ou régénération ───────────────────────────────────────────────────
const enTete =
  'GÉNÉRÉ par takussan-web/scripts/check-i18n-namespaces.mjs — ne jamais éditer à la main. ' +
  'Chaque frontière porte son ensemble CUMULÉ (le sien plus celui de tous ses parents), parce que ' +
  'les providers next-intl imbriqués REMPLACENT le dictionnaire du parent au lieu de le compléter.';

if (majTable) {
  writeFileSync(
    TABLE,
    JSON.stringify({ _: enTete, plancher: PLANCHER, frontieres: derive, plafondsPourcent: plafonds }, null, 2) + '\n',
  );
  console.log(`✓ ${relative(WEB, TABLE)} régénéré — ${frontieres.length} frontières.`);
} else {
  let table;
  try {
    table = JSON.parse(readFileSync(TABLE, 'utf8'));
  } catch (e) {
    console.error(`✗ ${relative(WEB, TABLE)} illisible : ${e.message}`);
    console.error('  → node scripts/check-i18n-namespaces.mjs --update');
    process.exit(1);
  }

  const declare = table.frontieres ?? {};
  const idsDerives = Object.keys(derive).sort();
  const idsDeclares = Object.keys(declare).sort();
  if (idsDerives.join('|') !== idsDeclares.join('|')) {
    echecs.push(
      'la LISTE des frontières a changé.\n' +
        `    dérivées : ${idsDerives.join(', ')}\n` +
        `    déclarées: ${idsDeclares.join(', ')}`,
    );
  }
  for (const id of idsDerives) {
    const d = derive[id];
    const decl = declare[id] ?? [];
    const manquants = d.filter((n) => !decl.includes(n));
    const surplus = decl.filter((n) => !d.includes(n));
    if (manquants.length) {
      echecs.push(
        `frontière « ${id} » — espaces ATTEIGNABLES et non déclarés : ${manquants.join(', ')}\n` +
          '    Ce sont des libellés qui s’afficheraient en chemin de clé brut à un utilisateur.',
      );
    }
    if (surplus.length) {
      echecs.push(
        `frontière « ${id} » — espaces déclarés et PLUS atteignables : ${surplus.join(', ')}\n` +
          '    Des octets sérialisés dans chaque document pour du code qui ne les lit plus.',
      );
    }
  }

  // Cliquet — sur la table DÉCLARÉE, qui est ce que le produit sert réellement.
  for (const id of idsDeclares) {
    const plafond = table.plafondsPourcent?.[id];
    if (plafond === undefined) {
      echecs.push(`frontière « ${id} » — aucun plafond déclaré. → --update`);
      continue;
    }
    const part = (100 * partGzip(declare[id])) / totalGzip;
    if (part > plafond) {
      echecs.push(
        `CLIQUET — frontière « ${id} » sert ${part.toFixed(1)} % du dictionnaire, plafond ${plafond} %.\n` +
          '    Le découpage se dégrade. Ne PAS relever le plafond sans avoir regardé quel espace\n' +
          '    de noms vient d’entrer et pourquoi il est atteignable depuis ce sous-arbre.',
      );
    }
  }
}

// ── 6. Sortie ────────────────────────────────────────────────────────────────────────────────────
if (rapport || majTable) {
  console.log(`\ndictionnaire complet : ${Object.keys(dico).length} espaces, ${totalGzip} o gzip\n`);
  const large = Math.max(...frontieres.map((f) => idDe(f).length));
  for (const f of frontieres) {
    const id = idDe(f);
    const octets = partGzip(derive[id]);
    console.log(
      `${id.padEnd(large)}  ${String(derive[id].length).padStart(2)} espaces  ` +
        `${String(octets).padStart(6)} o gzip  ${((100 * octets) / totalGzip).toFixed(1).padStart(5)} %` +
        `  (plafond ${plafonds[id]} %)`,
    );
    console.log(`${' '.repeat(large)}  ${derive[id].join(' ')}`);
  }
}

if (echecs.length) {
  console.error(`\n✗ check-i18n-namespaces — ${echecs.length} écart(s) :\n`);
  for (const e of echecs) console.error(`  · ${e}\n`);
  console.error('  Régénérer la table après une modification LÉGITIME du graphe :');
  console.error('    node scripts/check-i18n-namespaces.mjs --update\n');
  process.exit(1);
}

if (!majTable) {
  console.log(
    `✓ check-i18n-namespaces — ${frontieres.length} frontières, table conforme au graphe d'imports.`,
  );
}
