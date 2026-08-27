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
 * CE QUE LA REVUE ADVERSE A TROUVÉ — et ce qui a changé le 2026-08-27
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La première version de ce fichier laissait passer **8 formes sur 17** éprouvées par mutation,
 * dont deux qui sont exactement le défaut que son propre docblock promettait de refuser. Les
 * quatre corrections, chacune avec ce qu'elle a coûté d'être absente :
 *
 *   1 · **UNE MULTIPLICATION FAISAIT TAIRE LA GARDE.** L'heuristique « ce match est dans un
 *       commentaire » testait la présence d'un `//`, `*` ou `/*` précédé d'un espace **n'importe
 *       où avant le match sur la ligne**. Mesuré : `(p * 100).toLocaleString('fr-FR')` sortait en
 *       **0**, `(p + 100).toLocaleString('fr-FR')` en 1. *Un seul caractère séparait le vert du
 *       rouge*, et le caractère en question est celui du formatage de pourcentage — le cas le
 *       plus banal qui soit. Elle masquait déjà deux littéraux VIVANTS (`charts/LineChart.tsx`,
 *       `charts/BarChart.tsx`). {@link sansCommentaires} dépouille désormais réellement le texte.
 *
 *   2 · **LE CONTRÔLE B NE TENAIT PAS LA PROMESSE DU DOCBLOCK.** Il ne voyait que
 *       `.toLocale*()`. Passaient : `new Intl.DateTimeFormat()` (aucun argument),
 *       `d.toLocaleDateString(undefined, { dateStyle: 'medium' })` — la façon IDIOMATIQUE
 *       d'écrire « locale du navigateur + options », donc la plus probable — et
 *       `d.toLocaleDateString( /* … *\/ )`.
 *
 *   3 · **QUATRE ÉCRITURES FIGEAIENT UNE LOCALE SANS ÊTRE VUES** : le gabarit, le TABLEAU
 *       (`['fr-FR','fr']` — d'autant plus plausible que `toIntlLocale('wo')` du dépôt rend déjà
 *       `['wo','fr-SN']` et sert de modèle), le constructeur ALIASÉ, et la CONSTANTE de module
 *       qui atteint un formateur. Contrôles C, D et E.
 *
 *   4 · **LE PÉRIMÈTRE MENTAIT.** Cf. la section suivante : c'est le trou qui laissait passer un
 *       défaut vivant, sur trois écrans, après le ticket censé le corriger.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * LE PÉRIMÈTRE N'EST PAS L'ÉCRAN — et ce docblock l'a affirmé faux
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier écrivait : *« Il reprend délibérément celui de `check-super-admin-tokens.mjs` — les
 * mêmes fichiers, le même raisonnement : le périmètre n'est pas un répertoire de routes, c'est ce
 * que l'écran monte. »* **C'était faux.** L'autre garde calcule réellement la clôture transitive
 * des imports depuis `src/app/(super-admin)/**`, en déclare le trou et le met sous cliquet
 * séparé ; celle-ci n'avait recopié que la LISTE DE RÉPERTOIRES.
 *
 * Ce qu'il en a coûté, mesuré : `/super-admin/payouts`, `/super-admin/plans` et l'onglet
 * abonnement + le dossier KYC de `/super-admin/agencies/[id]` rendaient **9 locales `'fr-FR'`**
 * dans 4 fichiers de `components/billing` et `components/kyc` — hors des cinq répertoires gardés,
 * donc noyées dans un « reste » indifférencié de 57 où elles voisinaient avec le site public et
 * le calendrier. *Le prochain lecteur aurait cru le trou fermé parce que le commentaire le
 * disait.*
 *
 * D'où TROIS comptes, et non deux :
 *
 *   1. {@link PERIMETRES} — ce qui est GARDÉ, exigé à ZÉRO.
 *   2. {@link clotureDeRendu} — ce que la console super-admin REND réellement et que le périmètre
 *      ne couvre pas. Cliquet propre ({@link PLAFOND_CONSOLE}), parce qu'un défaut rendu par un
 *      écran de la console ne peut pas avoir le même prix qu'un défaut du site public.
 *   3. Le RESTE du dépôt — `/app`, le site public, `components/leases`, `components/calendar`…
 *      Cliquet ({@link PLAFOND_RESTE}). Le porter à zéro est le travail d'un autre ticket (D-24) ;
 *      l'empêcher de croître est celui-ci.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * PORTÉE — ce que cette garde NE prouve PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * T1 · Elle ne voit qu'`Intl.*` et les méthodes `toLocale*`. Une date formatée à la main
 *      (`${j}/${m}/${a}`), un `date-fns` sans `locale:`, ou une chaîne assemblée côté serveur lui
 *      échappent — et le second cas a son propre précédent (`dateFnsLocale.ts`, TCK-292).
 *
 * T2 · Elle ne juge pas du RÉSULTAT : `fmt.date()` appelé avec les mauvaises options rend une
 *      date juste dans un format inattendu, et cette garde reste verte.
 *
 * T3 · La locale figée dans un PARAMÈTRE PAR DÉFAUT (`function f(x, locale = 'fr-SN')`) n'est pas
 *      vue. Le contrôle E ne connaît que `const` / `let` / `var`. C'est un trou MESURÉ, pas
 *      supposé : `src/lib/format/currency.ts` (`formatPriceShort`) en porte un, rendu par les
 *      marqueurs de carte. Le fermer demande de décider ce que devient cette signature, ce qui
 *      est un delta de `@/lib/format`, pas de cette garde.
 *
 * T4 · La clôture d'imports est une approximation, et elle l'est dans le sens PRUDENT : un import
 *      qu'elle ne résout pas (chemin calculé, `next/dynamic` avec une expression) sort de la
 *      clôture, donc du compte. *Une approximation qui se trompe toujours du même côté n'est pas
 *      un aléa : c'est un plancher.* {@link TEMOINS_CLOTURE} empêche qu'elle se vide en silence.
 *
 * T5 · Le dépouillement des commentaires suit les chaînes, les gabarits et les littéraux
 *      d'expression régulière, mais pas le TEXTE JSX : `<p>voir http://x</p>` blanchit la fin de
 *      la ligne. Là encore, dans le sens prudent — un faux NÉGATIF, jamais un faux positif.
 *
 * T6 · La clôture est à granularité FICHIER, pas SYMBOLE, et elle se trompe donc dans l'autre
 *      sens : `lib/utils.ts` y entre parce que toute la console importe `cn`, et sa seule locale
 *      figée est dans `formatRelativeDate`, que la console n'appelle nulle part (mesuré : ses six
 *      appelants sont des cartes de bien). C'est l'unique occurrence du cliquet n°2 — un défaut
 *      qui n'est PAS rendu, compté comme s'il l'était. *Le sens de l'erreur est le bon* : il fait
 *      rougir pour un défaut absent, jamais taire pour un défaut présent.
 *
 * Usage :
 *   node scripts/check-locale-figee.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-locale-figee.mjs --report   # + le détail fichier par fichier
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'takussan-web', 'src');

/** Le périmètre EXIGÉ À ZÉRO : ce que les trois consoles montent, par répertoire. */
const PERIMETRES = [
  'app/(super-admin)',
  'components/admin/super',
  'components/super-admin',
  'components/reporting',
  'components/console',
  'components/billing',
  'components/kyc',
];

/**
 * TÉMOINS DU PÉRIMÈTRE — la moitié de l'auto-épreuve que la première version n'avait pas.
 *
 * ⚠ Retirer `'components/admin/super'` de {@link PERIMETRES} sortait la garde en **0, en
 * silence** : les 27 fichiers basculaient dans le « reste », et comme ils sont propres le plafond
 * ne bougeait pas. Seul le compte imprimé changeait, et personne ne relit un compte. *Une garde
 * qui ne se garde que contre UNE de ses trois façons d'être désarmée n'est pas un cliquet* — les
 * deux autres étant un ajout à {@link EXEMPTS} et une hausse de plafond.
 *
 * Chacun de ces fichiers DOIT se retrouver analysé dans le périmètre gardé. Un répertoire retiré,
 * un fichier exempté, un `fichiers()` cassé : la garde jette au lieu de sortir en 0.
 */
const TEMOINS_PERIMETRE = [
  'app/(super-admin)/super-admin/payouts/page.tsx',
  'components/admin/super/system-health.tsx',
  'components/super-admin/InviteSuperAdminModal.tsx',
  'components/reporting/RevenueChart.tsx',
  'components/console/StatCard.tsx',
  'components/billing/PayoutTable.tsx',
  'components/kyc/kyc-components.tsx',
];

/**
 * TÉMOINS DE LA CLÔTURE — le second mode d'échec silencieux, celui de {@link clotureDeRendu}.
 *
 * Une clôture d'imports qui ne résout plus rien rend un ensemble VIDE, donc un cliquet à zéro,
 * donc un vert. *Un mécanisme d'isolation jamais appelé n'échoue pas : un autre le couvre, plus
 * mal, et le vert reste vert* (J-11). Ces deux fichiers ne sont dans AUCUN répertoire de
 * `PERIMETRES` et sont pourtant rendus par la console — ils ne peuvent être vus que par la
 * clôture, donc leur absence la dénonce.
 */
const TEMOINS_CLOTURE = [
  'components/ui/toast.tsx',
  'lib/format.ts',
];

/** Fichiers dont la raison d'être EST de manipuler des locales. */
const EXEMPTS = new Set(['lib/format.ts']);

const EXT = /\.(ts|tsx)$/;
const EST_TEST = (p) => p.includes('__tests__') || /\.test\.tsx?$/.test(p);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LE DÉPOUILLEMENT DES COMMENTAIRES
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Rend le même texte, à la LONGUEUR ET AUX SAUTS DE LIGNE PRÈS, commentaires blanchis.
 *
 * Conserver les offsets est le point : les numéros de ligne du rapport se calculent sur le texte
 * dépouillé et désignent quand même la bonne ligne du fichier.
 *
 * L'automate suit quatre états au-delà du code : chaîne `'`/`"`, gabarit `` ` ``, commentaire de
 * ligne, commentaire de bloc. Il connaît aussi le littéral d'expression régulière — sans quoi
 * `/https?:\/\//` blanchirait la fin de sa ligne, ce qui n'est pas un faux positif mais un faux
 * NÉGATIF, donc le pire des deux.
 *
 * ⚠ Le seul moyen de distinguer `/` division de `/` début de regex est le jeton PRÉCÉDENT : après
 * une valeur (identifiant, `)`, `]`, littéral) c'est une division ; après un opérateur ou une
 * ouverture, c'est une regex. C'est l'heuristique standard, et elle suffit ici : se tromper rend
 * une regex prise pour une division (le texte reste analysé, donc plus de matches, jamais moins).
 */
export function sansCommentaires(texte) {
  const n = texte.length;
  let out = '';
  let i = 0;
  let etat = 'code';
  let precedent = ''; // dernier caractère significatif du code

  const regexPossible = () => precedent === '' || '(,=:[!&|?{};+-*%~^<>\n'.includes(precedent);

  while (i < n) {
    const c = texte[i];
    const d = texte[i + 1];

    if (etat === 'code') {
      if (c === '/' && d === '/') { out += '  '; i += 2; etat = 'ligne'; continue; }
      if (c === '/' && d === '*') { out += '  '; i += 2; etat = 'bloc'; continue; }
      if (c === '/' && regexPossible()) { out += c; i += 1; etat = 'regex'; continue; }
      if (c === "'" || c === '"' || c === '`') { out += c; i += 1; etat = c; precedent = c; continue; }
      out += c;
      if (!/\s/.test(c) || c === '\n') precedent = c;
      i += 1;
      continue;
    }

    if (etat === 'ligne') {
      if (c === '\n') { out += '\n'; i += 1; etat = 'code'; precedent = '\n'; continue; }
      out += ' '; i += 1; continue;
    }

    if (etat === 'bloc') {
      if (c === '*' && d === '/') { out += '  '; i += 2; etat = 'code'; continue; }
      out += c === '\n' ? '\n' : ' '; i += 1; continue;
    }

    if (etat === 'regex') {
      if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
      if (c === '[') { out += c; i += 1; etat = 'classe'; continue; }
      if (c === '/' || c === '\n') { out += c; i += 1; etat = 'code'; precedent = '/'; continue; }
      out += c; i += 1; continue;
    }

    if (etat === 'classe') {
      if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
      if (c === ']') { out += c; i += 1; etat = 'regex'; continue; }
      out += c; i += 1; continue;
    }

    // chaîne ou gabarit : `etat` porte le délimiteur
    if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
    if (c === etat) { out += c; i += 1; etat = 'code'; continue; }
    out += c; i += 1;
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LES CONTRÔLES
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Les constructeurs d'`Intl` — nommés un par un, pour ne pas confondre avec les TYPES homonymes
 *  (`Intl.DateTimeFormatOptions` n'est pas un constructeur, et le dépôt en écrit sept). */
const CTORS = 'DateTimeFormat|NumberFormat|RelativeTimeFormat|ListFormat|PluralRules|Collator|Segmenter|DisplayNames|DurationFormat';

/** L'entrée d'un formateur : `Intl.<Ctor>(` ou `.toLocale*(`. */
const ENTREE = String.raw`(?:Intl\.(?:${CTORS})\(|\.toLocale(?:String|DateString|TimeString)\()`;

/**
 * A · un LITTÉRAL de locale passé à un formateur — y compris dans un TABLEAU.
 *
 * Le motif accepte `fr`, `fr-FR`, `fr-SN`, `en-GB`… et exige la QUOTE : `Intl.NumberFormat(locale)`
 * — une variable — est la forme juste et ne doit pas rougir. `\s*\[?\s*` couvre
 * `toLocaleDateString(['fr-FR','fr'])`, forme d'autant plus plausible que `toIntlLocale('wo')` du
 * dépôt rend déjà `['wo','fr-SN']` et sert donc de modèle.
 */
const CONTROLE_A = new RegExp(ENTREE + String.raw`\s*\[?\s*['"\x60][a-z]{2}(?:-[A-Za-z]{2,4})?['"\x60]`, 'g');

/**
 * B · un formateur appelé SANS locale — le cas que le grep de TCK-364 ne pouvait pas voir,
 * puisqu'il n'y a aucun littéral à trouver.
 *
 * ⚠ `toLocaleString()` nu est plus insidieux qu'un `'fr-FR'` : il ne rend pas la MÊME mauvaise
 * réponse à tout le monde, il en rend une différente par machine. C'est irreproductible en test.
 *
 * Trois écritures, une seule promesse : l'appel vide, l'`undefined` EXPLICITE (la façon
 * idiomatique d'écrire « locale du navigateur + options »), et `new Intl.X()` sans argument du
 * tout — que la première version ne voyait pas, alors que son docblock le promettait.
 */
const CONTROLE_B = new RegExp(ENTREE + String.raw`\s*(?:\)|undefined\s*[,)])`, 'g');

/**
 * C · une locale construite par GABARIT — `` new Intl.DateTimeFormat(`fr-${pays}`) ``.
 *
 * Le préfixe est figé même si le suffixe ne l'est pas : c'est la même faute, écrite plus long.
 */
const CONTROLE_C = new RegExp(ENTREE + String.raw`\s*\[?\s*\x60[a-z]{2}(?:-[A-Za-z]{2,4})?(?:-|\$\{)`, 'g');

/**
 * D · un constructeur `Intl` ALIASÉ — `const DTF = Intl.DateTimeFormat; new DTF('fr-FR')`.
 *
 * La garde refuse l'ALIAS lui-même, pas le site d'appel : une fois le constructeur passé sous un
 * autre nom, plus aucune lecture de texte ne peut suivre ce qu'on lui donne. *Un contrôle qui
 * dépend d'un nom ne survit pas au renommage de ce nom* — alors il refuse le renommage.
 *
 * Le `(?![\s]*[(.])` écarte les deux formes légitimes : l'appel (`Intl.NumberFormat(…)`, couvert
 * par A/B/C) et la méthode statique (`Intl.DateTimeFormat.supportedLocalesOf(…)`). Le `\b` écarte
 * les TYPES : `Intl.DateTimeFormatOptions` continue par un caractère de mot.
 */
const CONTROLE_D = new RegExp(String.raw`\bIntl\.(?:${CTORS})\b(?![\s]*[(.])`, 'g');

/**
 * E · une CONSTANTE DE MODULE qui atteint un formateur — `const L = 'fr-FR'; d.toLocaleDateString(L)`.
 *
 * ⚠ C'est le seul contrôle qui ne se décide pas sur un match : il faut les DEUX moitiés. La
 * première version le tolérait explicitement (`'const fr = "fr-FR";' // volontairement toléré`),
 * et la tolérance était juste — pour la déclaration SEULE. Elle ne l'est plus dès que la
 * constante atteint un formateur, et la garde ne savait pas distinguer les deux. C'est fait ici :
 * `const CODE_PAYS = 'sn'` ne rougit toujours pas ; le même passé à `Intl.NumberFormat` rougit.
 */
const DECL_LOCALE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:\[\s*)?['"`][a-z]{2}(?:-[A-Za-z]{2,4})?['"`]/g;

function constantesFigees(texte) {
  const out = [];
  DECL_LOCALE.lastIndex = 0;
  for (const m of texte.matchAll(DECL_LOCALE)) {
    const nom = m[1];
    const echappe = nom.replace(/[$]/g, '\\$&');
    const usage = new RegExp(ENTREE + String.raw`\s*\[?\s*` + echappe + String.raw`\b`, 'g');
    for (const u of texte.matchAll(usage)) out.push([u.index, `${u[0]}   ← ${nom} = locale figée`]);
  }
  return out;
}

const CONTROLES = [
  [CONTROLE_A, 'locale figée'],
  [CONTROLE_B, 'formateur SANS locale — suit le NAVIGATEUR'],
  [CONTROLE_C, 'locale figée par gabarit'],
  [CONTROLE_D, "constructeur `Intl` aliasé — plus aucune lecture de texte ne peut le suivre"],
];

// ──────────────────────────────────────────────────────────────────────────────────────────────
// L'AUTO-ÉPREUVE
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le mode d'échec d'une garde à expressions régulières n'est pas de rougir à tort, c'est de
 * **cesser de matcher** : un préfixe retiré, un `\b` déplacé, et elle sort en 0 pour toujours en
 * ayant l'air de travailler. On lui donne donc à manger, à chaque invocation, un échantillon
 * qu'elle DOIT refuser et un qu'elle DOIT accepter.
 *
 * ⚠ Les cas marqués « REVUE » sont ceux qui SORTAIENT EN 0 avant le 2026-08-27. Ils ne sont pas
 * décoratifs : chacun est une mutation qui est réellement passée.
 */
function autoEpreuveRegex() {
  const doitRougir = [
    "new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' })",
    'new Intl.NumberFormat("en-GB").format(1)',
    "d.toLocaleDateString('fr-SN', {})",
    'x.toLocaleString()',
    'x.toLocaleTimeString(  )',
    // REVUE — le contrôle B ne tenait pas la promesse du docblock
    'new Intl.DateTimeFormat().format(d)',
    'new Intl.NumberFormat( ).format(1)',
    "d.toLocaleDateString(undefined, { dateStyle: 'medium' })",
    'd.toLocaleTimeString(undefined)',
    // REVUE — le gabarit et le tableau
    'new Intl.DateTimeFormat(`fr-${pays}`)',
    "d.toLocaleDateString(['fr-FR','fr'])",
    "new Intl.NumberFormat([ 'en-GB' ])",
    // REVUE — le constructeur aliasé
    'const DTF = Intl.DateTimeFormat;',
    'const f = new (Intl.NumberFormat)',
  ];
  const doitPasser = [
    'new Intl.DateTimeFormat(locale, { dateStyle: "medium" })',
    'new Intl.NumberFormat(toIntlLocale(locale))',
    'value.toLocaleString(locale)',
    "t('dates.short')",
    'const fr = "fr-FR";', // la DÉCLARATION seule reste hors sujet — cf. contrôle E
    'options: Intl.DateTimeFormatOptions = {}',
    'const o: Intl.NumberFormatOptions = {};',
    'Intl.DateTimeFormat.supportedLocalesOf(["wo"])',
    'new Intl.NumberFormat(locale as string | string[], options)',
  ];
  const attrape = (cas) => CONTROLES.some(([re]) => { re.lastIndex = 0; return re.test(cas); });
  for (const cas of doitRougir) {
    if (!attrape(cas)) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la garde n'attrape plus : ${cas}`);
    }
  }
  for (const cas of doitPasser) {
    if (attrape(cas)) throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la garde refuse à tort : ${cas}`);
  }

  // Contrôle E : il faut les DEUX moitiés, et une seule ne suffit pas.
  const avecLesDeux = "const L = 'fr-FR';\nconst s = d.toLocaleDateString(L);";
  if (constantesFigees(avecLesDeux).length === 0) {
    throw new Error("AUTO-ÉPREUVE ÉCHOUÉE — la constante de module qui atteint un formateur n'est plus vue.");
  }
  if (constantesFigees("const L = 'fr-FR';\nexport { L };").length !== 0) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — la DÉCLARATION seule est refusée à tort.');
  }
  if (constantesFigees("const CODE = 'sn';\nreport(CODE);").length !== 0) {
    throw new Error("AUTO-ÉPREUVE ÉCHOUÉE — une constante qui n'atteint aucun formateur est refusée à tort.");
  }

  // Le dépouillement des commentaires — les deux sens, et le piège de la multiplication.
  //
  // ⚠ `re.test()` sur une expression régulière `/g` AVANCE `lastIndex` : deux appels d'affilée
  //   sur des textes différents rendent un faux négatif. C'est le mode d'échec de cette garde
  //   appliqué à sa propre auto-épreuve — d'où `vu()`, qui repart de zéro à chaque fois.
  const vu = (texte) => { CONTROLE_A.lastIndex = 0; return CONTROLE_A.test(sansCommentaires(texte)); };
  if (vu("// d.toLocaleDateString('fr-FR')")) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — un commentaire de ligne est compté comme du code.');
  }
  if (vu("/* d.toLocaleDateString('fr-FR') */")) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — un commentaire de bloc est compté comme du code.');
  }
  if (!vu("const s = (p * 100).toLocaleString('fr-FR');")) {
    throw new Error("AUTO-ÉPREUVE ÉCHOUÉE — la MULTIPLICATION fait de nouveau taire la garde (le défaut D3).");
  }
  if (!vu("const u = /https?:\\/\\//.test(x) ? d.toLocaleDateString('fr-FR') : '';")) {
    throw new Error("AUTO-ÉPREUVE ÉCHOUÉE — un littéral d'expression régulière blanchit la fin de sa ligne.");
  }
  if (!vu("const s = 'a // b' + d.toLocaleDateString('fr-FR');")) {
    throw new Error('AUTO-ÉPREUVE ÉCHOUÉE — un `//` DANS une chaîne est pris pour un commentaire.');
  }
  for (const re of [CONTROLE_A, CONTROLE_B, CONTROLE_C, CONTROLE_D]) re.lastIndex = 0;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────

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
  const brut = readFileSync(chemin, 'utf8');
  // Les commentaires CITENT les formes fautives, c'est leur travail. On ne garde que le code —
  // et « garder le code » veut dire dépouiller, pas deviner (cf. le défaut D3 du docblock).
  const texte = sansCommentaires(brut);
  const out = [];
  const ligneDe = (index) => texte.slice(0, index).split('\n').length;

  for (const [controle, quoi] of CONTROLES) {
    controle.lastIndex = 0;
    for (const m of texte.matchAll(controle)) {
      out.push({ ligne: ligneDe(m.index), quoi, extrait: m[0].trim() });
    }
  }
  for (const [index, extrait] of constantesFigees(texte)) {
    out.push({ ligne: ligneDe(index), quoi: 'constante de module figée, passée à un formateur', extrait });
  }
  return out.sort((a, b) => a.ligne - b.ligne);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LA CLÔTURE DE RENDU — reprise de `check-super-admin-tokens.mjs`, cette fois pour de bon
// ──────────────────────────────────────────────────────────────────────────────────────────────

const EXT_IMPORT = ['.tsx', '.ts', '.jsx', '.js'];

function resoudre(spec, depuis) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null; // paquet npm : hors du dépôt, donc hors sujet.
  for (const e of EXT_IMPORT) if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const e of EXT_IMPORT) {
      const idx = join(base, `index${e}`);
      if (existsSync(idx)) return idx;
    }
    return null;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

/** La clôture transitive des imports depuis `src/app/(super-admin)/**` : ce que la console REND. */
function clotureDeRendu() {
  const depart = fichiers(join(SRC, 'app', '(super-admin)'));
  const vus = new Set(depart);
  const file = [...depart];
  while (file.length > 0) {
    const f = file.pop();
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const r = resoudre(m[1] ?? m[2], f);
      if (r && !vus.has(r)) { vus.add(r); file.push(r); }
    }
  }
  return [...vus].filter((f) => !EST_TEST(f) && EXT.test(f));
}

// ──────────────────────────────────────────────────────────────────────────────────────────────

autoEpreuveRegex();

const dansPerimetre = PERIMETRES.flatMap((p) => fichiers(join(SRC, p)));
const relatifs = new Set(dansPerimetre.map((f) => relative(SRC, f)));
for (const temoin of TEMOINS_PERIMETRE) {
  if (!relatifs.has(temoin) || EXEMPTS.has(temoin)) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — « ${temoin} » n'est plus analysé dans le périmètre gardé.\n`
      + '  Un répertoire retiré de PERIMETRES, un fichier ajouté à EXEMPTS : la garde sortait en 0\n'
      + '  EN SILENCE, les fichiers basculant dans un « reste » que leur propreté laissait immobile.',
    );
  }
}

const cloture = clotureDeRendu();
const clotureRel = new Set(cloture.map((f) => relative(SRC, f)));
for (const temoin of TEMOINS_CLOTURE) {
  if (!clotureRel.has(temoin)) {
    throw new Error(
      `AUTO-ÉPREUVE ÉCHOUÉE — la clôture de rendu ne voit plus « ${temoin} ».\n`
      + '  Une clôture qui ne résout plus rien rend un ensemble vide, donc un cliquet à zéro,\n'
      + '  donc un vert. C’est le mode d’échec le plus silencieux de ce fichier.',
    );
  }
}

const tous = fichiers(SRC);
const dansPerimetreSet = new Set(dansPerimetre);
const consoleHorsPerimetre = cloture.filter((f) => !dansPerimetreSet.has(f));
const consoleSet = new Set(consoleHorsPerimetre);
const reste = tous.filter((f) => !dansPerimetreSet.has(f) && !consoleSet.has(f));

function compter(liste) {
  let total = 0;
  const detail = [];
  for (const f of liste) {
    const rel = relative(SRC, f);
    if (EXEMPTS.has(rel)) continue;
    const d = defautsDe(f);
    if (d.length) {
      total += d.length;
      for (const x of d) detail.push({ fichier: rel, ...x });
    }
  }
  return { total, detail };
}

const perimetre = compter(dansPerimetre);

/**
 * CLIQUET 2 — ce que la console super-admin REND et que le périmètre ne couvre pas.
 *
 * Mesuré le 2026-08-27, après le portage de `components/billing` et `components/kyc` sur
 * `useFormatteurs()`. Ce sont les primitives partagées avec `/app` et le site public : les porter
 * demande de les redessiner pour tous leurs écrans, ce qui est un autre ticket.
 *
 * L'unique occurrence est `lib/utils.ts:25` (`Intl.RelativeTimeFormat('fr')`), et elle n'est
 * même pas rendue : cf. T6 ci-dessus. Le fichier entre dans la clôture par `cn`, pas par
 * `formatRelativeDate`. On la compte quand même — *une clôture qui trie ce qu'elle compte selon
 * ce qu'elle CROIT appelé n'est plus un plancher, c'est une opinion.*
 *
 * ⚠ Ce nombre est un PLAFOND **et un PLANCHER** : la garde échoue s'il monte (récidive) ET s'il
 * descend sans que la ligne soit corrigée. C'est ce qui empêche la troisième façon de désarmer
 * cette garde — *lever le chiffre* — de passer en silence, la première version n'ayant gardé que
 * ses expressions régulières : retirer un répertoire de `PERIMETRES`, ajouter un fichier à
 * `EXEMPTS` ou lever un plafond la faisaient sortir en 0 sans un mot.
 */
const PLAFOND_CONSOLE = 1; // mesuré le 2026-08-27

/**
 * CLIQUET 3 — le RESTE du dépôt : `/app`, le site public, `components/leases`,
 * `components/calendar`… Le porter à zéro est le travail d'un autre ticket (dette D-24) ;
 * l'empêcher de croître est celui-ci.
 *
 * ⚠ Ce chiffre a été MESURÉ le 2026-08-27, pas reconduit, et il ne se déduit PAS de l'ancien 57 :
 * quatre mouvements s'y annulent en partie, et les additionner à la main aurait donné un autre
 * nombre que la mesure.
 *
 *   +2  `charts/LineChart.tsx:56` et `charts/BarChart.tsx:45` — deux littéraux VIVANTS que
 *       l'heuristique de commentaire masquait, chacun sur une ligne portant une MULTIPLICATION.
 *   +1  `pipeline/PipelineCard.tsx:27` — `Intl.DateTimeFormat(undefined, …)`, que le contrôle B
 *       ne voyait pas alors que le docblock promettait de le refuser.
 *   −9  `components/billing` et `components/kyc`, portés sur `useFormatteurs()` et entrés dans le
 *       PÉRIMÈTRE : ils ne sont plus dans le reste, ils sont à zéro.
 *   −1  `lib/utils.ts`, passé du reste au cliquet n°2 (la console le rend).
 *
 * Même plancher/plafond que ci-dessus.
 */
const PLAFOND_RESTE = 48; // mesuré le 2026-08-27, resserré de 50 à 48 à la fusion de la vague 3
//                          (TCK-374 a porté deux graphiques de `/app` sur la locale active).

const consoleCompte = compter(consoleHorsPerimetre);
const resteCompte = compter(reste);

const rapport = process.argv.includes('--report');

if (perimetre.total) {
  console.error(`✗ locale figée : ${perimetre.total} occurrence(s) dans le périmètre des consoles.`);
  for (const f of perimetre.detail) console.error(`  ${f.fichier}:${f.ligne}  ${f.extrait}   (${f.quoi})`);
  console.error('');
  console.error("  La forme juste : `const fmt = useFormatteurs()` puis `fmt.date(…)` / `fmt.nombre(…)`.");
  console.error('  ⚠ Un helper module-level ne PEUT pas avoir raison ici : hors composant, il n’a pas');
  console.error('    de locale sous la main, et son auteur écrira un littéral. Déplace-le dans le');
  console.error('    composant, ou fais-en un hook.');
  process.exit(1);
}

let rouge = false;
for (const [nom, compte, plafond, quoi] of [
  ['CONSOLE HORS PÉRIMÈTRE', consoleCompte, PLAFOND_CONSOLE, 'que la console super-admin REND'],
  ['RESTE DU DÉPÔT', resteCompte, PLAFOND_RESTE, 'hors consoles'],
]) {
  if (compte.total > plafond) {
    rouge = true;
    console.error(`✗ ${nom} : ${compte.total} occurrence(s) ${quoi}, plafond ${plafond}.`);
    console.error('  Ce plafond n’est pas une tolérance : il ne monte pas. Formate par `useFormatteurs()`.');
    for (const f of compte.detail) console.error(`  ${f.fichier}:${f.ligne}  ${f.extrait}`);
  } else if (compte.total < plafond) {
    rouge = true;
    console.error(`✗ ${nom} : ${compte.total} occurrence(s) ${quoi}, alors que le cliquet dit ${plafond}.`);
    console.error('  Un cliquet qui ne DESCEND pas est une tolérance : corrige le chiffre dans');
    console.error('  `scripts/check-locale-figee.mjs`, avec sa date. C’est aussi ce qui rend une hausse');
    console.error('  de plafond immédiatement rouge au lieu de silencieuse.');
  }
}
if (rouge) process.exit(1);

console.log(
  `✓ locale figée : 0 occurrence sur ${dansPerimetre.length} fichiers du périmètre des consoles.`,
);
console.log(
  `  CONSOLE HORS PÉRIMÈTRE : ${consoleCompte.total} (cliquet ${PLAFOND_CONSOLE}) — clôture des imports`,
);
console.log(`  depuis app/(super-admin) : ${cloture.length} fichiers rendus, dont ${consoleHorsPerimetre.length} hors périmètre.`);
console.log(
  `  RESTE DU DÉPÔT : ${resteCompte.total} (cliquet ${PLAFOND_RESTE}) — /app, site public, baux, calendrier.`,
);
console.log('  Les deux chiffres sont des CLIQUETS : la garde échoue s’ils montent ET s’ils descendent.');
if (rapport) {
  const par = (detail) => {
    const m = new Map();
    for (const d of detail) m.set(d.fichier, (m.get(d.fichier) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  for (const [nom, compte] of [['console hors périmètre', consoleCompte], ['reste', resteCompte]]) {
    if (!compte.detail.length) continue;
    console.log(`\n  — ${nom} —`);
    for (const [f, n] of par(compte.detail)) console.log(`    ${f} — ${n}`);
  }
}
