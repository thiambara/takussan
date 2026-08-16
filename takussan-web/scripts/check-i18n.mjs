#!/usr/bin/env node
/**
 * Garde de l'INTERNATIONALISATION du frontend (TCK-286).
 *
 * Le principe n°5 du `CLAUDE.md` racine dit « le front possède le texte affiché ». Mesuré par AST
 * (compilateur TypeScript, pas regex) le 2026-08-15 sur `dev` : **431 fichiers portaient 3 595
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
 * laisser. Les 88 restantes sont réparties ailleurs et sont portées par le ticket de suite.
 */
const PLAFONDS_PARITE = {
  en: 0,
  wo: 88,
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

const mesure = new Map();
const detail = new Map();
for (const chemin of tous) {
  const trouves = compteFichier(chemin, readFileSync(chemin, 'utf8'));
  if (trouves.length > 0) {
    mesure.set(cleFichier(chemin), trouves.length);
    detail.set(cleFichier(chemin), trouves);
  }
}
const total = [...mesure.values()].reduce((a, b) => a + b, 0);

if (UPDATE) {
  const fichiers = Object.fromEntries([...mesure.entries()].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify({
    _lisez_moi: 'GÉNÉRÉ par `node scripts/check-i18n.mjs --update`. Ne pas éditer à la main : '
      + 'ces comptes sont une MESURE, et un compte recopié à la main est faux dès le commit suivant. '
      + 'Chaque entrée est un plafond PAR FICHIER qui ne peut que descendre.',
    total,
    fichiers,
  }, null, 2)}\n`);
  console.log(`✓ baseline réécrite : ${mesure.size} fichiers, ${total} occurrences.`);
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
  console.log(`\n  B · texte en dur (cliquet HEURISTIQUE, par fichier)`);
  console.log(`      ${mesure.size} fichiers / ${total} occurrences — baseline : `
    + `${Object.keys(baseline).length} fichiers / ${totalBaseline} occurrences`);
  console.log('      les 20 fichiers les plus chargés :');
  for (const [f, c] of [...mesure.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`          ${String(c).padStart(4)}  ${f}`);
  }
  const parCategorie = {};
  for (const trouves of detail.values()) {
    for (const t of trouves) parCategorie[t.categorie] = (parCategorie[t.categorie] ?? 0) + 1;
  }
  console.log(`      par catégorie : ${Object.entries(parCategorie).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
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
    + `${dicos.fr.size} clés fr), et ${total} libellé(s) en dur sur ${mesure.size} fichiers, `
    + 'tous au plafond de leur baseline.',
  );
  console.log("  ⚠ PORTÉE — ce vert NE PROUVE PAS que le front est internationalisé.");
  console.log('    · A (parité) est EXACT sur la PRÉSENCE des clés, et muet sur leur QUALITÉ : une');
  console.log('      valeur wolof recopiée du français passe le contrôle sans broncher.');
  console.log('    · B (texte en dur) est un cliquet HEURISTIQUE. Il ne voit pas les gabarits');
  console.log('      interpolés (`Bonjour ${nom}`), ni les props de composants maison hors');
  console.log('      `ATTRS_AFFICHAGE`. Le total est un PLANCHER, jamais un inventaire.');
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} écart(s) i18n :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
