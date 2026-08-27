#!/usr/bin/env node
/**
 * Garde : dans les consoles, **aucune locale n'est figée dans le code**.
 *
 * Ni un littéral (`Intl.DateTimeFormat('fr-FR', …)`, `date.toLocaleDateString('fr-SN', …)`), ni
 * son inverse silencieux — un `toLocaleString()` **nu**, qui ne fige rien mais suit la locale du
 * NAVIGATEUR au lieu de celle de l'application. Les deux produisent le même symptôme : un
 * utilisateur en `en` ou en `wo` lit une date française, ou pire, une date qui change selon la
 * machine.
 *
 * La forme juste est `useFormatteurs()` (`src/lib/format/useFormatteurs.ts`), qui prend la locale
 * de next-intl, ou `@/lib/format` quand on a déjà une `Locale` sous la main.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF — pourquoi cette garde existe, et ce qu'elle a coûté d'être absente
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-364 a supprimé **18 formatages `'fr-FR'` écrits en dur dans 13 fichiers**. Son AC1 était :
 * *« le grep `'fr-FR'` ne renvoie rien sur les 3 répertoires »*. Il était vert. Il l'est resté
 * exactement le temps de la fusion.
 *
 * Trois tickets de la même vague — TCK-360, TCK-361, TCK-362 — ont créé des fichiers NEUFS
 * (`ConsoleRecentActivity.tsx`, `TimeSeriesChart.tsx`, `RevenueChart.tsx`, `kyc-queue.tsx`) qui
 * portaient chacun leur propre helper module-level, avec `'fr-FR'` dedans. **Et git n'a signalé
 * aucun conflit** : un fichier qui n'existe que d'un seul côté d'une fusion ne peut pas entrer en
 * conflit. L'AC de TCK-364 avait été mesuré sur une base où les fautifs n'existaient pas encore.
 *
 * *Un AC vérifié par un grep manuel n'est pas une garde : c'est une photographie.* Elle prouve
 * l'état d'un instant, jamais qu'il tienne — et c'est précisément ce que ce dépôt facture depuis
 * TCK-245 (`check-super-admin-tokens.mjs`) et TCK-244 (`check-app-tokens.mjs`).
 *
 * ⚠ La cause profonde n'est pas la négligence : **une fonction module-level n'a pas de locale
 * sous la main**. `function formatDate(value)` hors composant ne peut pas appeler un hook, donc
 * son auteur écrit un littéral. C'est pour cela que la forme juste est un hook et que ce fichier
 * refuse les deux symptômes plutôt que d'expliquer la cause dans un commentaire.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * PORTÉE — ce que cette garde NE prouve PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle ne voit qu'`Intl.*` et les méthodes `toLocale*`. Une date formatée à la main
 * (`${j}/${m}/${a}`), un `date-fns` sans `locale:`, ou une chaîne assemblée côté serveur lui
 * échappent — et le second cas a son propre précédent (`dateFnsLocale.ts`, TCK-292). C'est un
 * plancher, pas une preuve d'internationalisation.
 *
 * Elle ne juge pas non plus du RÉSULTAT : `fmt.date()` appelé avec les mauvaises options rend une
 * date juste dans un format inattendu, et cette garde reste verte.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'takussan-web', 'src');

/**
 * Le périmètre EXIGÉ À ZÉRO : ce que les trois consoles montent.
 *
 * Il reprend délibérément celui de `check-super-admin-tokens.mjs` — les mêmes fichiers, le même
 * raisonnement : le périmètre n'est pas un répertoire de routes, c'est ce que l'écran monte.
 */
const PERIMETRES = [
  'app/(super-admin)',
  'components/admin/super',
  'components/super-admin',
  'components/reporting',
  'components/console',
];

/** Fichiers du périmètre dont la raison d'être EST de manipuler des locales. */
const EXEMPTS = new Set(['lib/format.ts']);

const EXT = /\.(ts|tsx)$/;
const EST_TEST = (p) => p.includes('__tests__') || /\.test\.tsx?$/.test(p);

/**
 * A · un littéral de locale passé à `Intl.*` ou à une méthode `toLocale*`.
 *
 * Le motif accepte `fr`, `fr-FR`, `fr-SN`, `en-GB`… et exige la QUOTE : `Intl.NumberFormat(locale)`
 * — une variable — est la forme juste et ne doit pas rougir.
 */
const CONTROLE_A =
  /(?:Intl\.[A-Za-z]+\(|\.toLocale(?:String|DateString|TimeString)\()\s*['"`][a-z]{2}(?:-[A-Za-z]{2,4})?['"`]/g;

/**
 * B · une méthode `toLocale*` appelée SANS locale — le cas que le grep de TCK-364 ne pouvait pas
 * voir, puisqu'il n'y a aucun littéral à trouver.
 *
 * ⚠ `toLocaleString()` nu est plus insidieux qu'un `'fr-FR'` : il ne rend pas la MÊME mauvaise
 * réponse à tout le monde, il en rend une différente par machine. C'est irreproductible en test.
 */
const CONTROLE_B = /\.toLocale(?:String|DateString|TimeString)\(\s*\)/g;

/**
 * AUTO-ÉPREUVE — le mode d'échec d'une garde à expressions régulières n'est pas de rougir à
 * tort, c'est de **cesser de matcher** : un préfixe retiré, un `\b` déplacé, et elle sort en 0
 * pour toujours en ayant l'air de travailler. On lui donne donc à manger, à chaque invocation,
 * un échantillon qu'elle DOIT refuser et un qu'elle DOIT accepter.
 */
function autoEpreuve() {
  const doitRougir = [
    "new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })",
    'new Intl.NumberFormat("en-GB").format(1)',
    "d.toLocaleDateString('fr-SN', {})",
    'x.toLocaleString()',
    'x.toLocaleTimeString(  )',
  ];
  const doitPasser = [
    'new Intl.DateTimeFormat(locale, { dateStyle: "medium" })',
    'new Intl.NumberFormat(toIntlLocale(locale))',
    'value.toLocaleString(locale)',
    "t('dates.short')",
    'const fr = "fr-FR";', // pas passé à un formateur : hors sujet, et volontairement toléré
  ];
  for (const cas of doitRougir) {
    if (!(cas.match(CONTROLE_A) || cas.match(CONTROLE_B))) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la garde n'attrape plus : ${cas}`);
    }
  }
  for (const cas of doitPasser) {
    if (cas.match(CONTROLE_A) || cas.match(CONTROLE_B)) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la garde refuse à tort : ${cas}`);
    }
  }
}

function fichiers(racine) {
  const out = [];
  const marche = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) marche(p);
      else if (EXT.test(p) && !EST_TEST(p)) out.push(p);
    }
  };
  try {
    marche(racine);
  } catch {
    /* répertoire absent : rien à garder */
  }
  return out;
}

function defautsDe(chemin) {
  const texte = readFileSync(chemin, 'utf8');
  const out = [];
  for (const [controle, quoi] of [
    [CONTROLE_A, 'locale figée'],
    [CONTROLE_B, 'toLocale* sans locale — suit le NAVIGATEUR'],
  ]) {
    controle.lastIndex = 0;
    for (const m of texte.matchAll(controle)) {
      const ligne = texte.slice(0, m.index).split('\n').length;
      const source = texte.split('\n')[ligne - 1] ?? '';
      // Les commentaires CITENT les formes fautives, c'est leur travail. On ne garde que le code.
      const avant = source.slice(0, source.indexOf(m[0]));
      if (/(^|\s)(\/\/|\*|\/\*)/.test(avant)) continue;
      out.push({ ligne, quoi, extrait: m[0] });
    }
  }
  return out;
}

autoEpreuve();

const dansPerimetre = PERIMETRES.flatMap((p) => fichiers(join(SRC, p)));
const tous = fichiers(SRC);
const horsPerimetre = tous.filter((f) => !dansPerimetre.includes(f));

const fautifs = [];
for (const f of dansPerimetre) {
  const rel = relative(SRC, f);
  if (EXEMPTS.has(rel)) continue;
  for (const d of defautsDe(f)) fautifs.push({ fichier: rel, ...d });
}

/**
 * Le RESTE : `/app`, le site public, `components/leases`, `components/calendar`… Ce n'est pas une
 * tolérance, c'est un PLAFOND — la garde échoue s'il monte. Le porter à zéro est le travail d'un
 * autre ticket ; l'empêcher de croître est celui-ci.
 */
const PLAFOND_RESTE = 57;
let reste = 0;
const resteDetail = [];
for (const f of horsPerimetre) {
  const rel = relative(SRC, f);
  if (EXEMPTS.has(rel)) continue;
  const d = defautsDe(f);
  if (d.length) {
    reste += d.length;
    resteDetail.push(`${rel} — ${d.length}`);
  }
}

const rapport = process.argv.includes('--report');

if (fautifs.length) {
  console.error(`✗ locale figée : ${fautifs.length} occurrence(s) dans le périmètre des consoles.`);
  for (const f of fautifs) console.error(`  ${f.fichier}:${f.ligne}  ${f.extrait}   (${f.quoi})`);
  console.error('');
  console.error("  La forme juste : `const fmt = useFormatteurs()` puis `fmt.date(…)` / `fmt.nombre(…)`.");
  console.error('  ⚠ Un helper module-level ne PEUT pas avoir raison ici : hors composant, il n’a pas');
  console.error('    de locale sous la main, et son auteur écrira un littéral. Déplace-le dans le');
  console.error('    composant, ou fais-en un hook.');
  process.exit(1);
}

if (reste > PLAFOND_RESTE) {
  console.error(`✗ le reste NON gardé est passé de ${PLAFOND_RESTE} à ${reste} occurrence(s).`);
  console.error('  Ce plafond n’est pas une tolérance : il ne monte pas. Formate par `useFormatteurs()`.');
  for (const l of resteDetail) console.error(`  ${l}`);
  process.exit(1);
}

console.log(
  `✓ locale figée : 0 occurrence sur ${dansPerimetre.length} fichiers du périmètre des consoles.`,
);
console.log(
  `  RESTE NON GARDÉ : ${reste} occurrence(s) (plafond ${PLAFOND_RESTE}) hors consoles — /app, site`,
);
console.log('  public, baux, calendrier. PLAFOND, pas tolérance : la garde échoue s’il monte.');
if (rapport) for (const l of resteDetail) console.log(`    ${l}`);
