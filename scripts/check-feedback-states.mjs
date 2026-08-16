#!/usr/bin/env node
/**
 * Garde des ÉTATS VIDES et des BLOCS D'ERREUR du frontend.
 *
 * `docs/design-guidelines.md:13` demande « une seule façon d'afficher un état vide ». Mesuré le
 * 2026-08-15, avant TCK-246 : le nom `EmptyState` était défini **huit fois**, chaque fois comme
 * fonction privée locale, jamais exportée — plus un `FilteredEmptyState`, un `OwnerEmptyState` et
 * un `ErrorState` du même tonneau. À côté, **au moins 41 blocs d'état vide sur 32 fichiers, en 23
 * formes de `className` distinctes**, et un espace erreur où la palette Tailwind brute
 * (`bg-red-50`, `text-red-700`) coexistait avec les tokens du DS (`bg-destructive/10`).
 *
 * Ces huit duplicatas sont la preuve empirique qu'une convention que rien ne mesure ne tient pas.
 * `web-ci.yml` ne lançait que `npm run lint`, sans aucun contrôle de motif.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE MESURE — ET CE QU'ELLE NE MESURE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La propriété qu'on VOUDRAIT prouver est : « aucun écran n'affiche un état vide fait maison ».
 * Elle n'est pas décidable par un grep, et la dette D-23 dit pourquoi : *une garde qui cherche un
 * JETON ne mesure pas la PROPRIÉTÉ*. Chercher `EmptyState` trouverait le nom, pas le fait.
 *
 * Ce script mesure donc TROIS choses, de force décroissante, et le dit dans sa propre sortie :
 *
 *   A. **Le nom n'est pas repris** — aucune définition de composant nommée `*EmptyState` ou
 *      `*ErrorState` hors de `src/components/feedback/`. C'est EXACT pour cette propriété-là
 *      (les commentaires sont retirés avant analyse), et c'est ce qui empêche littéralement le
 *      neuvième duplicata. Ce n'est PAS une preuve qu'aucun état vide anonyme n'a été écrit en
 *      ligne : un `<div className="text-center">Aucun résultat.</div>` posé au milieu d'un JSX ne
 *      porte aucun nom et échappe à A.
 *
 *   B. **Cliquet sur les états vides ad-hoc** — un compte HEURISTIQUE (un `className` contenant
 *      `text-center` à proximité d'une chaîne « Aucun/Aucune/No … »), comparé à un plafond qui ne
 *      peut que descendre. L'heuristique rate structurellement les états vides libellés via une
 *      clé i18n, ceux sans `text-center`, et ceux dont le wrapper est loin. **C'est un PLANCHER,
 *      pas un inventaire** : le vrai total est supérieur, jamais inférieur.
 *
 *   C. **Cliquet sur les blocs d'erreur en palette Tailwind brute** — les conteneurs mêlant un
 *      fond/bordure rouge et du texte rouge, là où le DS impose `--destructive`. Même statut : un
 *      compte, pas une preuve.
 *
 * B et C ne certifient RIEN quand ils sont verts : ils garantissent seulement que le chiffre n'a
 * pas monté. C'est délibéré — un cliquet est une clôture, pas un certificat. La seule ligne de ce
 * script qui prouve quelque chose est A.
 *
 * Usage :
 *   node scripts/check-feedback-states.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-feedback-states.mjs --report   # + le détail fichier par fichier
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SRC = join(ROOT, 'takussan-web', 'src');
const MAISON = join(SRC, 'components', 'feedback');

/**
 * Les PLAFONDS du cliquet, mesurés sur `dev` au moment où cette garde a été écrite.
 *
 * Ils ne peuvent que DESCENDRE. Un compte qui monte est une régression et fait rougir la CI ; un
 * compte qui descend fait rougir aussi, avec un message qui demande de baisser le plafond — sans
 * ça le cliquet se dégrade en plafond mort et n'empêche plus rien.
 *
 * Mesuré sur `dev` AVANT TCK-246, puis APRÈS, avec ce script inchangé :
 *
 *   A · définitions locales   11 → 1   (le dernier est un écart assumé, cf. `ECARTS_ASSUMES`)
 *   B · états vides ad-hoc    43 → 34
 *   C · erreurs palette brute 28 → 22
 *
 * Le reste part au ticket de suite TCK-291.
 */
const PLAFONDS = {
  // Resserré de 34 à 32 le 2026-08-15, le jour même où la garde est née : TCK-286 a passé des
  // libellés derrière `t()` dans la foulée, et l'heuristique — qui s'appuie sur du texte
  // affiché — a cessé de voir deux occurrences. Le geste est celui que la garde EXIGE d'elle-même
  // en rougissant quand le compte descend. À noter pour le prochain qui resserre : une baisse ici
  // ne prouve pas qu'un état vide a disparu, seulement que l'heuristique ne le voit plus. C'est
  // pourquoi ce compte est un plancher, jamais un inventaire.
  etatsVides: 32,
  erreursPaletteBrute: 22,
};

/**
 * Écarts CONNUS et assumés sur le contrôle A, chacun avec son ticket.
 *
 * Une allowlist est une dette, pas une exemption : elle rend l'écart visible et datable au lieu
 * de le laisser se fondre dans le vert. Retirer une entrée d'ici doit être le geste qui FERME le
 * ticket, jamais celui qui fait taire la garde — et une entrée qui n'a plus d'objet fait rougir,
 * sans quoi la liste devient un cimetière et plus personne ne sait ce qu'elle couvre encore.
 */
const ECARTS_ASSUMES = new Map([
  // `OwnerEmptyState` branche sur le rôle et rend une grille d'exemples de documents ET une liste
  // de cibles de rattachement (bien / bail / profil). Le forcer dans `{icon, title, description,
  // action}` détruirait de la fonctionnalité — ce n'est pas un état vide, c'est un mode d'emploi
  // qui s'affiche quand c'est vide. Il est nommé comme l'un, il fait l'autre.
  ['takussan-web/src/components/documents/DocumentsLibrary.tsx::OwnerEmptyState', 'TCK-291'],
]);

/** Retire commentaires de bloc et de ligne — une garde qui lit la prose atteste de la prose. */
function sansCommentaires(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function fichiers(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === 'node_modules' || entree === '__tests__') continue;
      fichiers(chemin, acc);
    } else if (/\.tsx$/.test(entree) && !/\.test\.tsx$/.test(entree)) {
      acc.push(chemin);
    }
  }
  return acc;
}

if (!existsSync(MAISON)) {
  console.error(`✗ ${relative(ROOT, MAISON)} est introuvable.`);
  console.error("  Le composant partagé n'existe pas : la garde ne peut rien tenir, et elle le");
  console.error('  dit plutôt que de passer au vert sur un dépôt sans état vide partagé.');
  process.exit(1);
}

const tous = fichiers(SRC);
if (tous.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : la forme de
  // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
  console.error('✗ aucun `.tsx` trouvé sous `takussan-web/src` — la garde n’aurait rien vérifié.');
  process.exit(1);
}

// ── A. Le nom n'est pas repris ────────────────────────────────────────────────────────────────
//
// On cherche une DÉFINITION, pas une mention : `function XxxEmptyState(`, `const XxxErrorState =`
// suivi d'une flèche ou d'une fonction. Un import, un usage `<EmptyState …>` ou une prop nommée
// `emptyState` ne déclenchent pas — sinon la garde interdirait de s'en servir.
const DEFINITION = /(?:^|\n)\s*(?:export\s+)?(?:function\s+(\w*(?:Empty|Error)State)\s*[<(]|const\s+(\w*(?:Empty|Error)State)\s*(?::[^=]+)?=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>)/g;

const reprises = [];
for (const chemin of tous) {
  if (chemin.startsWith(MAISON)) continue;
  const src = sansCommentaires(readFileSync(chemin, 'utf8'));
  for (const m of src.matchAll(DEFINITION)) {
    reprises.push([relative(ROOT, chemin), m[1] ?? m[2]]);
  }
}

// ── B. Cliquet sur les états vides ad-hoc ─────────────────────────────────────────────────────
//
// Heuristique assumée : un `className` contenant `text-center` dans les trois lignes qui
// précèdent une chaîne de vacuité. Elle ne voit PAS les états vides passés par une clé i18n —
// ce qui est cohérent avec l'objet du cliquet : ceux-là sont, en pratique, ceux qu'on a déjà
// migrés. Elle ne voit pas non plus ceux qui n'ont pas `text-center`. **Plancher, pas inventaire.**
const VACUITE = /(?:Aucune?\b|Aucun\b|\bNo (?:result|item|data)\b|\bnothing\b)/i;

const etatsVides = [];
for (const chemin of tous) {
  if (chemin.startsWith(MAISON)) continue;
  const lignes = sansCommentaires(readFileSync(chemin, 'utf8')).split('\n');
  for (let i = 0; i < lignes.length; i += 1) {
    if (!VACUITE.test(lignes[i])) continue;
    const fenetre = lignes.slice(Math.max(0, i - 3), i + 1).join('\n');
    if (/className=(?:"|'|\{`|\{')[^"'`]*text-center/.test(fenetre)) {
      etatsVides.push([relative(ROOT, chemin), i + 1]);
    }
  }
}

// ── C. Cliquet sur les blocs d'erreur en palette Tailwind brute ───────────────────────────────
//
// `docs/design-guidelines.md:53` : l'erreur passe par `--destructive`. Un conteneur qui mêle un
// fond ou une bordure rouge Tailwind ET du texte rouge Tailwind est un bloc d'erreur fait main.
// On exige les DEUX pour ne pas compter un simple `text-red-600` posé sur un `<span>` inline —
// ce sont des couleurs de badge, pas des blocs à migrer.
const ERREUR_BRUTE = /className=(?:"|'|\{`|\{')[^"'`]*(?:bg-red-\d{2,3}|border-red-\d{2,3})[^"'`]*text-red-\d{2,3}/;

const erreursBrutes = [];
for (const chemin of tous) {
  if (chemin.startsWith(MAISON)) continue;
  const lignes = sansCommentaires(readFileSync(chemin, 'utf8')).split('\n');
  lignes.forEach((ligne, i) => {
    if (ERREUR_BRUTE.test(ligne)) erreursBrutes.push([relative(ROOT, chemin), i + 1]);
  });
}

const cle = ([f, nom]) => `${f}::${nom}`;
const assumes = reprises.filter((r) => ECARTS_ASSUMES.has(cle(r)));
const aCorriger = reprises.filter((r) => !ECARTS_ASSUMES.has(cle(r)));

if (REPORT) {
  console.log(`états de feedback — ${tous.length} fichiers .tsx lus sous takussan-web/src\n`);
  console.log(`  A · définitions locales de *EmptyState / *ErrorState : ${reprises.length}`);
  for (const [f, nom] of aCorriger) console.log(`      ✗ ${nom.padEnd(24)} ${f}`);
  for (const r of assumes) {
    console.log(`      ~ ${r[1].padEnd(24)} ${r[0]} — écart assumé (${ECARTS_ASSUMES.get(cle(r))})`);
  }
  console.log(`  B · états vides ad-hoc (heuristique) : ${etatsVides.length} / plafond ${PLAFONDS.etatsVides}`);
  for (const [f, l] of etatsVides) console.log(`      · ${f}:${l}`);
  console.log(`  C · blocs d'erreur en palette brute : ${erreursBrutes.length} / plafond ${PLAFONDS.erreursPaletteBrute}`);
  for (const [f, l] of erreursBrutes) console.log(`      · ${f}:${l}`);
  console.log();
}

const erreurs = [];

for (const [f, nom] of aCorriger) {
  erreurs.push(
    `\`${nom}\` est redéfini dans ${f}. Le composant partagé vit dans `
    + '`takussan-web/src/components/feedback/` — importe-le au lieu d\'en écrire un neuvième. '
    + 'Si ton cas ne rentre pas dans `{icon, title, description, action}`, donne à ton composant '
    + 'un nom qui dit ce qu\'il fait (`OwnerEmptyState` → `OwnerDocumentsPrimer`) et ouvre un ticket.',
  );
}

for (const [cle, compte, quoi, conseil] of [
  ['etatsVides', etatsVides.length, 'états vides ad-hoc',
    'Passe-les par `<EmptyState>` (`@/components/feedback`).'],
  ['erreursPaletteBrute', erreursBrutes.length, 'blocs d\'erreur en palette Tailwind brute',
    'Passe-les par `<ErrorState>` (`@/components/feedback`), qui tient les tokens `--destructive`.'],
]) {
  const plafond = PLAFONDS[cle];
  if (compte > plafond) {
    erreurs.push(
      `${compte} ${quoi} pour un plafond de ${plafond} : le compte a MONTÉ. ${conseil} `
      + '(Lance `--report` pour la liste fichier par fichier.)',
    );
  } else if (compte < plafond) {
    erreurs.push(
      `${compte} ${quoi} pour un plafond de ${plafond} : le compte a DESCENDU, baisse le plafond `
      + `\`PLAFONDS.${cle}\` à ${compte} dans ce fichier. Un cliquet qu'on ne resserre pas `
      + "redevient un plafond mort — il laisse remonter jusqu'à l'ancienne valeur sans rien dire.",
    );
  }
}

// L'inverse compte aussi : un écart réparé doit sortir de l'allowlist.
for (const [k, ticket] of ECARTS_ASSUMES) {
  if (!reprises.some((r) => cle(r) === k)) {
    erreurs.push(
      `\`${k}\` est dans ECARTS_ASSUMES (${ticket}) mais n'existe plus — l'entrée est morte, retire-la.`,
    );
  }
}

for (const r of assumes) {
  console.warn(
    `⚠ \`${r[1]}\` dans ${r[0]} : redéfinition locale — écart assumé, suivi par ${ECARTS_ASSUMES.get(cle(r))}.`,
  );
}

if (erreurs.length === 0) {
  console.log(
    `✓ états de feedback : 0 redéfinition locale non assumée (${ECARTS_ASSUMES.size} écart(s) `
    + `assumé(s)), ${etatsVides.length} état(s) vide(s) ad-hoc et ${erreursBrutes.length} `
    + "bloc(s) d'erreur brut(s), tous deux au plafond.",
  );
  console.log('  ⚠ PORTÉE — cette garde NE PROUVE PAS que plus aucun écran n\'affiche un état vide');
  console.log('    fait maison. Elle prouve qu\'aucun composant ne REPREND les noms `*EmptyState` /');
  console.log('    `*ErrorState` hors de `components/feedback/` (contrôle A, exact). Les deux autres');
  console.log('    chiffres sont des cliquets HEURISTIQUES : ils ratent les états vides anonymes,');
  console.log('    ceux libellés par une clé i18n et ceux sans `text-center`. Ce sont des PLANCHERS,');
  console.log('    pas des inventaires — un vert ne veut pas dire « il n\'en reste plus ».');
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} écart(s) sur les états de feedback :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
