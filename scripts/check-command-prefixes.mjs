#!/usr/bin/env node
/**
 * Garde des PRÉFIXES DE COMMANDES ARTISAN (TCK-309, ex-dette D-38).
 *
 * Les 16 commandes maison portent une signature `{domaine}:{verbe-kebab}` — `media:`,
 * `invitations:`, `sms:`, `tasks:`… — sauf UNE, qui portait le nom du produit :
 * `takussan:create-super-admin`. Or sa jumelle `platform:grant-super-admin` faisait
 * le même travail sous le préfixe du domaine. Deux préfixes plateforme concurrents,
 * ce n'est pas une inélégance : c'est un choix à refaire à chaque commande suivante,
 * donc un désordre qui se reproduit tout seul.
 *
 * `takussan:` n'est pas un domaine — c'est le nom du dépôt. Toute commande de ce
 * projet lui appartient ; le préfixe ne dit donc rien et ne partitionne rien.
 *
 * ── CE QUE LA GARDE VÉRIFIE ────────────────────────────────────────────────────
 *
 *   A. Aucune `$signature` ne porte un préfixe INTERDIT (`takussan:` et ses
 *      variantes de nom de produit). Le domaine `platform:` est le bon pour ce qui
 *      relève de la plateforme entière.
 *
 *   B. Toute `$signature` a la forme `domaine:verbe-kebab`. Une commande sans
 *      préfixe se répand dans l'espace de noms d'artisan, où elle voisine avec
 *      `migrate`, `serve` et `tinker`.
 *
 *   C. L'ANCIEN NOM SURVIT EN ALIAS DÉPRÉCIÉ, et à un seul endroit. `docs/features.md`
 *      §2.1 prescrit encore `takussan:create-super-admin` à l'installation d'un
 *      environnement, et ce document n'est pas modifiable depuis ce ticket : le
 *      supprimer sec fabriquerait une panne pour le jour de l'installation. La garde
 *      autorise donc l'alias — nommément, celui-là et pas un autre — et vérifie qu'il
 *      est déclaré comme ALIAS (`$aliases`), jamais comme `$signature`. Elle vérifie
 *      aussi qu'il EXISTE toujours : le retirer par mégarde casse la CI, ce qui est
 *      le seul moyen de s'apercevoir qu'on vient de contredire la spec.
 *
 *   D. NON-VACUITÉ. Une garde qui ne trouve plus sa cible rend un tableau vide et
 *      passe au vert en ne gardant plus rien. Sous `MINIMUM_COMMANDES`, elle ROUGIT
 *      au lieu de conclure.
 *
 * ── LE JOUR OÙ L'ALIAS SE RETIRE ──────────────────────────────────────────────
 *
 * Mettre `docs/features.md` §2.1 à jour (passe `/sync-specs`), retirer `$aliases` de
 * `CreateSuperAdmin`, puis vider `ALIAS_DEPRECIES_TOLERES` ici. Dans cet ordre.
 *
 * Usage :
 *   node scripts/check-command-prefixes.mjs
 *   node scripts/check-command-prefixes.mjs --report
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const COMMANDES = join(ROOT, 'takussan-api', 'app', 'Console', 'Commands');

/**
 * Préfixes refusés en `$signature`, avec le motif du refus. Ce ne sont pas des
 * fautes de frappe : ce sont des noms de PRODUIT là où on attend un DOMAINE.
 */
const PREFIXES_INTERDITS = new Map([
  ['takussan', 'nom du dépôt, pas un domaine — toute commande d\'ici lui appartient. Utiliser « platform: » pour ce qui relève de la plateforme entière.'],
  ['app', 'ne partitionne rien : tout est « app ».'],
]);

/**
 * Les seuls alias dépréciés tolérés, et pourquoi chacun l'est. Vide = plus aucun
 * ancien nom ne survit. Chaque entrée est une DETTE datée, pas une exception permanente.
 */
const ALIAS_DEPRECIES_TOLERES = new Map([
  [
    'takussan:create-super-admin',
    {
      canonique: 'platform:create-super-admin',
      motif: 'prescrit par docs/features.md §2.1, document que TCK-309 ne peut pas modifier',
      depuis: '2026-08-17',
    },
  ],
]);

/** Mesuré au 2026-08-17 : 16 commandes. Plancher bas exprès — il détecte la cible perdue. */
const MINIMUM_COMMANDES = 10;

const FORME = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

const erreurs = [];

if (!existsSync(COMMANDES)) {
  console.error(
    `✗ préfixes de commandes : « takussan-api/app/Console/Commands/ » est introuvable.\n` +
      `  La garde n'a PAS conclu « aucun défaut » : elle ne sait plus où chercher.`,
  );
  process.exit(1);
}

function fichiersPhp(repertoire) {
  const out = [];
  for (const entree of readdirSync(repertoire)) {
    const chemin = join(repertoire, entree);
    if (statSync(chemin).isDirectory()) out.push(...fichiersPhp(chemin));
    else if (entree.endsWith('.php')) out.push(chemin);
  }
  return out;
}

const commandes = [];
const aliasTrouves = new Map();

for (const chemin of fichiersPhp(COMMANDES)) {
  const relatif = relative(ROOT, chemin);
  const source = readFileSync(chemin, 'utf8');

  // La signature peut courir sur plusieurs lignes (les options la suivent) : on ne
  // lit que le premier jeton, qui EST le nom de la commande.
  const sig = source.match(/\$signature\s*=\s*'([^\s'{]+)/);
  if (sig) commandes.push({ relatif, nom: sig[1] });

  // `protected $aliases = ['a', 'b'];` — les alias déclarés par la commande.
  const bloc = source.match(/\$aliases\s*=\s*\[([^\]]*)\]/);
  if (bloc) {
    for (const m of bloc[1].matchAll(/'([^']+)'/g)) {
      aliasTrouves.set(m[1], relatif);
    }
  }

  // Un `takussan:` qui reparaîtrait par une autre porte que `$signature` ou
  // `$aliases` — attribut #[AsCommand], `setName()`, `setAliases()` en dur.
  for (const m of source.matchAll(/(?:AsCommand\(|setName\(|setAliases\(\[?)\s*(?:name:\s*)?'([^']+)'/g)) {
    const nom = m[1];
    const prefixe = nom.split(':')[0];
    if (PREFIXES_INTERDITS.has(prefixe) && !ALIAS_DEPRECIES_TOLERES.has(nom)) {
      erreurs.push(
        `${relatif} — « ${nom} » déclaré hors de \$signature/\$aliases, avec un préfixe interdit.\n` +
          `      ${PREFIXES_INTERDITS.get(prefixe)}`,
      );
    }
  }
}

// ── D. NON-VACUITÉ — avant tout jugement. ─────────────────────────────────────
if (commandes.length < MINIMUM_COMMANDES) {
  console.error(
    `✗ préfixes de commandes : ${commandes.length} \$signature trouvée(s) sous ` +
      `takussan-api/app/Console/Commands/, plancher ${MINIMUM_COMMANDES}.\n` +
      `  La garde ne conclut PAS « aucun défaut » : elle ne reconnaît plus sa cible.\n` +
      `  Causes probables : répertoire déplacé, signatures déclarées autrement (#[AsCommand] ?), checkout partiel.`,
  );
  process.exit(1);
}

// ── A + B. Les signatures. ────────────────────────────────────────────────────
for (const c of commandes) {
  const prefixe = c.nom.split(':')[0];

  if (PREFIXES_INTERDITS.has(prefixe)) {
    erreurs.push(
      `${c.relatif} — \$signature « ${c.nom} » porte le préfixe interdit « ${prefixe}: ».\n` +
        `      ${PREFIXES_INTERDITS.get(prefixe)}\n` +
        `      Un ancien nom ne se conserve QU'EN ALIAS (\$aliases), et il se déclare ici` +
        ` dans ALIAS_DEPRECIES_TOLERES avec son motif et sa date.`,
    );
    continue;
  }

  if (!FORME.test(c.nom)) {
    erreurs.push(
      `${c.relatif} — \$signature « ${c.nom} » n'a pas la forme « domaine:verbe-kebab ».\n` +
        `      Sans préfixe, la commande voisine avec migrate, serve et tinker dans l'espace d'artisan.`,
    );
  }
}

// ── C. Les alias dépréciés : ceux-là, et ils doivent exister. ─────────────────
for (const [alias, relatif] of aliasTrouves) {
  if (!ALIAS_DEPRECIES_TOLERES.has(alias)) {
    erreurs.push(
      `${relatif} — alias « ${alias} » non déclaré dans ALIAS_DEPRECIES_TOLERES.\n` +
        `      Un alias est une DETTE : il se déclare ici avec son motif et sa date, ou il n'existe pas.`,
    );
  }
}

for (const [alias, dette] of ALIAS_DEPRECIES_TOLERES) {
  if (aliasTrouves.has(alias)) continue;
  erreurs.push(
    `alias déprécié « ${alias} » DÉCLARÉ ICI mais introuvable dans le code.\n` +
      `      Il tenait pour : ${dette.motif}.\n` +
      `      S'il a été retiré volontairement, retirer aussi son entrée de ALIAS_DEPRECIES_TOLERES —\n` +
      `      et vérifier d'abord que le document qui le prescrit ne le prescrit plus.\n` +
      `      Sinon, « ${dette.canonique} » a cassé un appelant hors du code, en silence.`,
  );
}

if (REPORT) {
  const parPrefixe = new Map();
  for (const c of commandes) {
    const p = c.nom.split(':')[0];
    parPrefixe.set(p, (parPrefixe.get(p) ?? 0) + 1);
  }
  console.log(`préfixes de commandes — ${commandes.length} commandes maison :`);
  for (const [p, n] of [...parPrefixe].sort()) console.log(`  ${String(n).padStart(3)} · ${p}:`);
  console.log(`  ${ALIAS_DEPRECIES_TOLERES.size} alias déprécié(s) toléré(s) :`);
  for (const [a, d] of ALIAS_DEPRECIES_TOLERES) {
    console.log(`      ${a} → ${d.canonique} (depuis ${d.depuis} — ${d.motif})`);
  }
  console.log(`  portée : la garde lit les \$signature et \$aliases DÉCLARÉS.`);
  console.log(`           Elle ne démarre pas artisan et ne voit donc pas une commande`);
  console.log(`           enregistrée à l'exécution par un service provider.`);
}

if (erreurs.length > 0) {
  console.error(`✗ préfixes de commandes — ${erreurs.length} défaut(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(
  `✓ préfixes de commandes : ${commandes.length} commandes en « domaine:verbe-kebab », ` +
    `aucun préfixe de produit, ${ALIAS_DEPRECIES_TOLERES.size} alias déprécié en place`,
);
