#!/usr/bin/env node
/**
 * Garde de CONVERGENCE DES RESSOURCES API : toute ressource de `takussan-api/app/Http/Resources/`
 * étend `App\Http\Resources\Bases\BaseResource`, jamais `JsonResource` directement.
 *
 * **Pourquoi elle existe.** `BaseResource` existe depuis TCK-048 et `takussan-api/CLAUDE.md`
 * tranche pour le code neuf depuis. Mesuré le 2026-08-12, puis le 2026-08-16, puis le
 * 2026-08-17 : **7, 7 puis 8 ressources sur 44** l'étendaient. La dette n'a ni grossi ni fondu
 * en quatre jours (D-36) — c'est le profil d'une convention écrite que rien ne mesure : elle
 * n'est pas violée par malveillance, elle est simplement invisible au moment d'écrire le fichier
 * suivant, parce que `extends JsonResource` est ce que rendent l'IDE, `artisan make:resource` et
 * les 36 fichiers voisins. *Une convention sans garde ne converge pas, elle stagne.*
 *
 * TCK-308 a migré les 36 restantes. La migration a été un **échange de parent, rien d'autre** :
 * 72 insertions et 72 suppressions sur 36 fichiers, soit deux lignes chacun — l'import et la
 * clause `extends`. C'est ce qui rend la migration sûre sur le point le plus cher du dépôt : le
 * montant est décimal en base et entier ×100 à la frontière du driver de paiement (principe n°3),
 * et `BaseResource` **n'offre aucun helper de montant** — il ne peut donc pas en changer la
 * représentation. Aucun corps de `toArray()` n'a été touché.
 *
 * **Ce que la garde vérifie — deux contrôles :**
 *
 *   · **A — NON-VACUITÉ (le contrôle qui garde la garde).** Le mode de défaillance central d'une
 *     garde de ce type est de ne plus trouver sa cible et de passer au vert en ne gardant plus
 *     rien : dossier renommé, motif cassé, arbre déplacé. Elle exige donc que le dossier existe,
 *     qu'il rende un plancher de fichiers, que `Bases/BaseResource.php` déclare toujours une
 *     classe ABSTRAITE de ce nom, et que le motif de détection trouve encore un plancher de
 *     classes. Si l'un cède, elle ROUGIT.
 *
 *   · **B — HÉRITAGE.** Toute classe concrète du dossier étend `BaseResource`. `BaseResource`
 *     lui-même étend `JsonResource` et c'est sa raison d'être : c'est la seule exemption, et elle
 *     est déduite du chemin, pas d'une liste.
 *
 * **Ce que la garde NE prouve PAS, et le dit dans sa sortie.** Étendre `BaseResource` ne veut pas
 * dire *employer* ses helpers. Celle-ci pose le socle — ils deviennent disponibles partout — elle
 * ne décrète pas leur emploi.
 *
 * **Un des quatre est désormais gardé, trois ne le sont pas.** Les DATES le sont depuis TCK-327 :
 * `check-resource-date-format.mjs` refuse toute conversion écrite à la main dans ces mêmes
 * fichiers, et ADR-0018 fixe les deux formes émises. C'était la convergence la plus coûteuse à
 * laisser ouverte — 138 lignes, quatre appels, trois chaînes distinctes, parfois dans le même
 * fichier. `enumValue`, `enumLabel` et `mediaUrl` restent, eux, disponibles et non exigés : même
 * famille, mais chacun a son propre coût de contrat.
 *
 * Usage :
 *   node scripts/check-resources-extend-base.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-resources-extend-base.mjs --report   # + l'inventaire complet
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const RESOURCES = join(ROOT, 'takussan-api', 'app', 'Http', 'Resources');
const BASE = join(RESOURCES, 'Bases', 'BaseResource.php');

/**
 * Planchers de non-vacuité. 45 fichiers et 45 classes au 2026-08-17 ; 20 est délibérément bas — il
 * ne mesure pas la taille du dossier, il distingue « l'arbre a été lu » de « l'arbre est vide
 * parce que le chemin est faux ».
 */
const PLANCHER = 20;

/**
 * Exclusions JUSTIFIÉES, et chacune doit l'être par écrit — même convention que
 * `check-models-spec.mjs`. Vide, et c'est l'état sain depuis TCK-308 : les 44 ressources
 * concrètes étendent `BaseResource`.
 *
 * `Bases/BaseResource.php` n'y figure PAS : son exemption se déduit de son chemin, et une
 * exemption déduite ne dérive pas quand on renomme le fichier.
 */
const EXCLUS_JUSTIFIES = new Map([
  // Vide.
]);

const erreurs = [];

// ── Contrôle A — non-vacuité ────────────────────────────────────────────────────────────────────

if (!existsSync(RESOURCES) || !statSync(RESOURCES).isDirectory()) {
  console.error(`✗ ${relative(ROOT, RESOURCES)} est introuvable.`);
  console.error("  La garde ne peut rien vérifier — elle le dit plutôt que de passer en silence.");
  process.exit(1);
}

function fichiersPhp(dir) {
  const out = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) out.push(...fichiersPhp(chemin));
    else if (entree.isFile() && entree.name.endsWith('.php')) out.push(chemin);
  }
  return out;
}

const fichiers = fichiersPhp(RESOURCES);

if (fichiers.length < PLANCHER) {
  erreurs.push(
    `A — ${fichiers.length} fichier(s) PHP lus sous ${relative(ROOT, RESOURCES)}, plancher ${PLANCHER}.\n` +
      `    La garde ne lit plus l'arbre qu'elle prétend garder. Un vert ici ne vaudrait rien.`,
  );
}

if (!existsSync(BASE)) {
  erreurs.push(
    `A — ${relative(ROOT, BASE)} est introuvable.\n` +
      `    C'est la classe que toutes les autres doivent étendre. Sans elle, la garde n'a plus d'objet.`,
  );
} else if (!/abstract class BaseResource extends JsonResource\b/.test(readFileSync(BASE, 'utf8'))) {
  erreurs.push(
    `A — ${relative(ROOT, BASE)} ne déclare plus \`abstract class BaseResource extends JsonResource\`.\n` +
      `    La cible a changé de forme : la garde ne sait plus ce qu'elle garde.`,
  );
}

// ── Contrôle B — héritage ───────────────────────────────────────────────────────────────────────

const MOTIF_CLASSE = /^\s*(?:final\s+|abstract\s+)*class\s+(\w+)\s+extends\s+([A-Za-z0-9_\\]+)/gm;

const inventaire = [];

for (const fichier of fichiers) {
  const source = readFileSync(fichier, 'utf8');
  const rel = relative(ROOT, fichier);
  const estLaBase = fichier === BASE;

  MOTIF_CLASSE.lastIndex = 0;
  let m;
  while ((m = MOTIF_CLASSE.exec(source)) !== null) {
    const [, nom, parent] = m;
    const parentCourt = parent.split('\\').pop();
    inventaire.push({ rel, nom, parent: parentCourt, estLaBase });

    if (estLaBase) continue; // Exemption DÉDUITE du chemin, pas listée.
    if (EXCLUS_JUSTIFIES.has(`${rel}::${nom}`)) continue;
    if (parentCourt === 'BaseResource') continue;

    erreurs.push(
      `B — ${rel} : \`${nom}\` étend \`${parentCourt}\`, pas \`BaseResource\`.\n` +
        `    Une ressource qui étend JsonResource directement refait à la main les conversions\n` +
        `    que BaseResource fournit (iso, enumValue, enumLabel, mediaUrl) — c'est la dette D-36,\n` +
        `    soldée par TCK-308. Étendre App\\Http\\Resources\\Bases\\BaseResource.`,
    );
  }
}

if (inventaire.length < PLANCHER) {
  erreurs.push(
    `A — ${inventaire.length} classe(s) détectée(s), plancher ${PLANCHER}.\n` +
      `    Le motif de détection ne reconnaît plus le code du dépôt : le contrôle B n'a rien lu,\n` +
      `    et son vert ne prouverait rien.`,
  );
}

// ── Sortie ──────────────────────────────────────────────────────────────────────────────────────

if (REPORT) {
  console.log(`Fichiers PHP lus sous ${relative(ROOT, RESOURCES)} : ${fichiers.length}`);
  console.log(`Classes détectées : ${inventaire.length}`);
  for (const c of inventaire.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(`  · ${c.nom} extends ${c.parent}${c.estLaBase ? '   (la base elle-même — exemption déduite du chemin)' : ''}`);
  }
  console.log('');
  console.log("Portée : l'HÉRITAGE, pas l'EMPLOI. Étendre BaseResource ne veut pas dire employer ses");
  console.log('  helpers. Les DATES sont gardées depuis TCK-327 par check-resource-date-format.mjs');
  console.log('  (ADR-0018 : instant `…T12:34:56+00:00`, jour `YYYY-MM-DD`). Les trois autres —');
  console.log('  enumValue, enumLabel, mediaUrl — restent disponibles et non exigés : même famille,');
  console.log("  mais chacun a son propre coût de contrat.");
  console.log('');
}

if (erreurs.length > 0) {
  console.error(`✗ ${erreurs.length} écart(s) — toute ressource étend BaseResource :\n`);
  for (const e of erreurs) console.error(`  ${e}\n`);
  process.exit(1);
}

console.log('✓ toutes les ressources étendent BaseResource.');
console.log(
  `  ${inventaire.length - 1} ressources concrètes dans ${fichiers.length} fichiers, plus la base elle-même.`,
);
