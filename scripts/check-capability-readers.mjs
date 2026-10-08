#!/usr/bin/env node
/**
 * Garde : chaque capacité du catalogue est SOIT lue par un geste, SOIT inscrite à l'inventaire des
 * capacités sans lecteur — jamais les deux, jamais aucun (TCK-587, ADR-0031 §4).
 *
 * **Ce qu'est « lue ».** Un cas de `App\Models\Enums\Capability` est lu s'il atteint une décision,
 * dans `takussan-api/app/` (commentaires retirés) :
 *
 *   1. `canActAt(Capability::X …)`, `canActDirectlyAt(Capability::X …)`, `can(Capability::X->value …)` ;
 *   2. `can('x.y' …)` / `canActAt('x.y' …)` — la Gate dérivée de l'enum ;
 *   3. `Capability::X` passé à une méthode du même fichier qui prend un `Capability $c` et le juge
 *      (`canActAt($c` / `can($c->value`) — `agencyGesture()`, `staffHolding()` ;
 *   4. `Capability::X` dans une constante tableau du fichier, jugée par `canActAt(self::NOM[` ;
 *   5. `return Capability::X` d'un `viewCapability|createCapability|updateCapability|deleteCapability()`
 *      de `XPolicy`, **seulement si** la policy ne surcharge pas l'ability (`view`, `create`…) et
 *      que l'ability est invoquée pour ce modèle quelque part (`can('create', X::class)`,
 *      `authorize('delete', $x…)`) ;
 *   6. un middleware `'can:x.y'`, dans `app/` ou `routes/` (balayés tous deux).
 *
 * Un nom de route, un docblock, la liste blanche de `resolvePlatform()`, le seed des rôles système
 * ne lisent rien.
 *
 * **L'inventaire** est `CapabilityEnforcementInventory::AWAITING` (valeur → ticket ou dette).
 * `CLIQUET` en est la taille, **bilatéral** : il ne peut que décroître, et une baisse se déclare en
 * baissant le cliquet dans le même commit.
 *
 * ## Ce qu'elle NE prouve PAS
 *
 *   · Elle cherche des FORMES. Une capacité rangée dans une variable puis jugée trois appels plus
 *     loin lui échappe : elle la dira « sans lecteur » — faux rouge, qui se corrige en écrivant la
 *     lecture sous une des cinq formes.
 *   · « Lue » ne veut pas dire « bien lue » : `can('x.y')` dans une branche morte compte.
 *   · Forme 5 : l'invocation est reconnue au NOM de la variable (`$payout` pour `Payout`) ou à
 *     `X::class`. Une variable mal nommée fait perdre la lecture.
 *   · Lectures RÉELLES qu'elle ne voit pas (faux « sans lecteur », verif-587 m1) — une ligne par
 *     forme ; le ticket qui branche une capacité sous l'une d'elles retire sa ligne d'inventaire à
 *     la main, la garde ne le lui signalera pas :
 *       - `Gate::allows('x.y')`, `Gate::authorize('x.y')`, `Gate::check(…)` ;
 *       - `$this->authorize('x.y', …)` ;
 *       - un argument nommé : `canActAt(capability: Capability::X, …)` ;
 *       - `canAny([...])` ;
 *       - `@can('x.y')` dans une vue Blade (`resources/` n'est pas balayé).
 *   · Fausses lectures qu'elle compte (faux « lue », verif-587 m1) : la capacité perd sa mention
 *     « sans effet » dans l'éditeur de rôles alors qu'elle ne décide rien :
 *       - H5 : une méthode qui prend PLUSIEURS paramètres `Capability` et n'en juge qu'un — la
 *         forme 3 compte tout `Capability::X` de l'appel, quelle que soit sa position ;
 *       - H7 : `Capability::X` dans la même instruction, après l'appel à une méthode qui juge son
 *         paramètre — la forme 3 lit l'appel jusqu'au `;`, pas jusqu'à sa parenthèse fermante ;
 *       - le résultat d'une lecture ignoré (`$u->can(Capability::X); return true;`).
 *
 * ## Ses propres tests
 *
 * `CAS_EPREUVE` tourne à CHAQUE invocation sur des arbres figés : nom de route, docblock,
 * `deleteCapability()` déclarée mais jamais atteinte, les cinq formes de lecture, et la capacité à
 * la fois lue et inventoriée (AC8). Une garde dont le motif régresse sort en 1 sur elle-même.
 *
 * Usage :
 *   node scripts/check-capability-readers.mjs                 # garde
 *   node scripts/check-capability-readers.mjs --report        # + classement de chaque capacité
 *   node scripts/check-capability-readers.mjs --ref=<commit>  # classement d'un autre arbre (git)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const REF = process.argv.find((a) => a.startsWith('--ref='))?.slice('--ref='.length) ?? null;
const API = join(ROOT, 'takussan-api');

const ENUM = 'app/Models/Enums/Capability.php';
const INVENTAIRE = 'app/Services/Membership/CapabilityEnforcementInventory.php';

/**
 * Taille de l'inventaire. Bilatéral : il suit `AWAITING`, dans les deux sens.
 * 16 → 14 par TCK-591 (`team.remove`, `crm.assign`) et 16 → 14 par TCK-596 (`bookings.refund`,
 * `leases.sign`), chacun sur sa branche : 12 à leur fusion. 14 → 12 par TCK-592
 * (`maintenance.assign`, `maintenance.close`) sur la sienne : 10 à la fusion de 596 avec 592.
 * 12 à la fusion de TCK-591 dans TCK-594 : chaque branche avait retiré deux lignes et baissé 16 → 14
 * de son côté ; la fusion, sans conflit textuel, gardait 14 pour un inventaire de 12. 10 à la fusion
 * de TCK-592 dans TCK-594, pour la même raison (592 lit `maintenance.*`, 594 `payouts.approve` et
 * `agency.update_billing`).
 * 8 à la fusion de TCK-594 dans TCK-596 : 596 retire `bookings.refund` et `leases.sign`, 594
 * `payouts.approve` et `agency.update_billing`, chacun à 10 de son côté.
 */
const CLIQUET = 8;

/** Plancher de plausibilité du balayage, bien sous le compte réel (~1 100 fichiers). */
const PLANCHER_FICHIERS = 400;

/**
 * Commentaires blanchis ; une chaîne ne garde son contenu que s'il a la forme d'un identifiant, ou
 * d'un middleware `can:x.y` (forme 6).
 */
function sansCommentaires(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blanc = (t) => t.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      const contenu = src.slice(i + 1, j);
      const garde = /^[\w.]*$/.test(contenu) || /^can:[a-z_]+\.[a-z_]+(?:,[\w.$]*)*$/.test(contenu);
      out += c + (garde ? contenu : blanc(contenu)) + (j < n ? c : '');
      i = j + 1;
    } else if (c === '/' && d === '*') {
      const fin = src.indexOf('*/', i + 2);
      const j = fin === -1 ? n : fin + 2;
      out += blanc(src.slice(i, j));
      i = j;
    } else if ((c === '/' && d === '/') || (c === '#' && d !== '[')) {
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      out += blanc(src.slice(i, j));
      i = j;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** `{ NomDuCas: 'valeur' }` depuis le source de l'enum. */
function casDeLEnum(src) {
  const cas = {};
  for (const m of sansCommentaires(src).matchAll(/\bcase\s+(\w+)\s*=\s*'([a-z_]+\.[a-z_]+)'\s*;/g)) cas[m[1]] = m[2];
  return cas;
}

/** `{ 'valeur': 'ticket' }` depuis le source de l'inventaire. */
function inventaireDe(src) {
  const bloc = /const\s+AWAITING\s*=\s*\[([\s\S]*?)\];/.exec(src);
  if (!bloc) return null;
  const out = {};
  for (const m of bloc[1].matchAll(/'([a-z_]+\.[a-z_]+)'\s*=>\s*'([^']*)'/g)) out[m[1]] = m[2];
  return out;
}

const ABILITY = { viewCapability: 'view', createCapability: 'create', updateCapability: 'update', deleteCapability: 'delete' };

/**
 * Les valeurs LUES par un arbre `{ chemin: source }` (chemins relatifs à `takussan-api/`).
 *
 * @returns {Map<string, string>} valeur → premier lecteur trouvé (`chemin (forme)`)
 */
function lecteurs(arbre, cas) {
  const valeurDe = (nom) => cas[nom];
  const valeurs = new Set(Object.values(cas));
  const lues = new Map();
  const lire = (valeur, ou) => {
    if (valeur && valeurs.has(valeur) && !lues.has(valeur)) lues.set(valeur, ou);
  };

  const nets = Object.entries(arbre)
    .filter(([chemin]) => chemin !== ENUM && chemin !== INVENTAIRE)
    .map(([chemin, src]) => [chemin, sansCommentaires(src)]);
  const tout = nets.map(([, net]) => net).join('\n');

  for (const [chemin, net] of nets) {
    // 1. Appel direct.
    for (const m of net.matchAll(/\b(?:canActAt|canActDirectlyAt|can|cannot)\s*\(\s*Capability::(\w+)/g)) {
      lire(valeurDe(m[1]), `${chemin} (appel direct)`);
    }
    // 2. Chaîne jugée par la Gate.
    for (const m of net.matchAll(/\b(?:canActAt|can|cannot)\s*\(\s*'([a-z_]+\.[a-z_]+)'/g)) {
      lire(m[1], `${chemin} (chaîne)`);
    }
    // 6. Middleware `can:x.y` (routes ou contrôleur) — verif-587, m1.
    for (const m of net.matchAll(/(['"])can:([a-z_]+\.[a-z_]+)/g)) {
      lire(m[2], `${chemin} (middleware can:)`);
    }
    // 3. Méthode du fichier qui juge son paramètre `Capability`.
    for (const m of net.matchAll(/\bfunction\s+(\w+)\s*\(([^)]*)\)/g)) {
      const param = /\bCapability\s+\$(\w+)/.exec(m[2]);
      if (!param) continue;
      const corps = net.slice(m.index + m[0].length).split(/\bfunction\s+\w+\s*\(/)[0];
      const juge = new RegExp(String.raw`\b(?:canActAt|canActDirectlyAt|can|cannot)\s*\(\s*\$${param[1]}\b`);
      if (!juge.test(corps)) continue;
      for (const appel of net.matchAll(new RegExp(String.raw`\b${m[1]}\s*\(([^;]*)`, 'g'))) {
        if (appel.index === m.index + m[0].indexOf(m[1])) continue;
        for (const c of appel[1].matchAll(/Capability::(\w+)/g)) lire(valeurDe(c[1]), `${chemin} (${m[1]}())`);
      }
    }
    // 4. Constante tableau jugée par `self::NOM[`.
    for (const m of net.matchAll(/\bconst\s+(\w+)\s*=\s*\[([\s\S]*?)\]\s*;/g)) {
      const juge = new RegExp(String.raw`\b(?:canActAt|can|cannot)\s*\(\s*self::${m[1]}\s*\[`);
      if (!juge.test(net)) continue;
      for (const c of m[2].matchAll(/Capability::(\w+)/g)) lire(valeurDe(c[1]), `${chemin} (self::${m[1]})`);
    }
    // 5. `*Capability()` d'une policy dont l'ability est invoquée.
    const policy = /(?:^|\/)app\/Policies\/(?:.*\/)?(\w+)Policy\.php$/.exec(`/${chemin}`);
    if (policy) {
      const modele = policy[1];
      for (const m of net.matchAll(/\bfunction\s+(viewCapability|createCapability|updateCapability|deleteCapability)\s*\(\s*\)[^{]*\{\s*return\s+Capability::(\w+)/g)) {
        const ability = ABILITY[m[1]];
        if (new RegExp(String.raw`\bpublic\s+function\s+${ability}\s*\(`).test(net)) continue;
        const invoque = new RegExp(
          String.raw`\b(?:authorize|can|cannot|allows|denies)\s*\(\s*'${ability}'\s*,\s*(?:\[\s*)?(?:${modele}::class|\$\w*${modele}\w*\b)`,
          'i',
        );
        if (invoque.test(tout)) lire(valeurDe(m[2]), `${chemin} (${m[1]}() → '${ability}')`);
      }
    }
  }
  return lues;
}

// ─── Auto-épreuve ──────────────────────────────────────────────────────────────

const CAS_FIGES = { PropertiesDelete: 'properties.delete', MaintenanceAssign: 'maintenance.assign', PayoutsCreate: 'payouts.create', LeasesRenew: 'leases.renew', InvoicesSend: 'invoices.send', ReportsExport: 'reports.export' };
const CAS_EPREUVE = [
  { nom: 'nom de route', arbre: { 'routes/x.php': "Route::delete('p', [C::class, 'x'])->name('properties.delete');", 'app/Http/X.php': "<?php $r->name('properties.delete');" }, lues: [] },
  { nom: 'middleware can: dans les routes', arbre: { 'routes/x.php': "Route::get('e', [C::class, 'x'])->middleware('can:reports.export');" }, lues: ['reports.export'] },
  { nom: 'docblock', arbre: { 'app/Policies/XPolicy.php': '<?php /** canActAt(Capability::PropertiesDelete, $a) */ class XPolicy {}' }, lues: [] },
  {
    nom: 'deleteCapability() déclarée, jamais atteinte',
    arbre: { 'app/Policies/PropertyPolicy.php': '<?php class PropertyPolicy { protected function deleteCapability(): ?Capability { return Capability::PropertiesDelete; } }' },
    lues: [],
  },
  {
    nom: 'deleteCapability() surchargée par delete()',
    arbre: {
      'app/Policies/PropertyPolicy.php': '<?php class PropertyPolicy { protected function deleteCapability(): ?Capability { return Capability::PropertiesDelete; } public function delete(User $u, Model $m): bool { return false; } }',
      'app/Http/C.php': "<?php $this->authorize('delete', $property);",
    },
    lues: [],
  },
  {
    nom: 'createCapability() invoquée par X::class',
    arbre: {
      'app/Policies/PayoutPolicy.php': '<?php class PayoutPolicy { protected function createCapability(): ?Capability { return Capability::PayoutsCreate; } }',
      'app/Http/R.php': "<?php return $this->user()?->can('create', Payout::class) === true;",
    },
    lues: ['payouts.create'],
  },
  { nom: 'appel direct', arbre: { 'app/S.php': '<?php $u->canActAt(Capability::PropertiesDelete, $agency);' }, lues: ['properties.delete'] },
  { nom: 'chaîne', arbre: { 'app/P.php': "<?php return $user->can('leases.renew');" }, lues: ['leases.renew'] },
  {
    nom: 'méthode qui juge son paramètre',
    arbre: { 'app/P.php': '<?php class P { public function send($u, $i) { return $this->h($u, $i, Capability::InvoicesSend); } private function h(User $u, $i, Capability $c): bool { return $u->can($c->value, $i); } }' },
    lues: ['invoices.send'],
  },
  {
    nom: 'constante jugée par self::',
    arbre: { 'app/C.php': "<?php class C { private const CAP = ['leases' => Capability::ReportsExport]; function show($e) { abort_unless($u->canActAt(self::CAP[$e], $a), 403); } }" },
    lues: ['reports.export'],
  },
  {
    nom: 'liste sans jugement',
    arbre: { 'app/R.php': '<?php return in_array($c, [Capability::ReportsExport, Capability::PropertiesDelete], true);' },
    lues: [],
  },
];

const echecs = [];
for (const { nom, arbre, lues } of CAS_EPREUVE) {
  const vues = [...lecteurs(arbre, CAS_FIGES).keys()].sort();
  if (JSON.stringify(vues) !== JSON.stringify([...lues].sort())) echecs.push(`${nom} — attendu [${lues}], vu [${vues}]`);
}
// AC8 : `maintenance.assign` lue par le contrôleur ET inscrite → l'écart est signalé.
{
  const lues = lecteurs({ 'app/Http/Controllers/Api/MaintenanceRequestController.php': '<?php $user->canActAt(Capability::MaintenanceAssign, $agency);' }, CAS_FIGES);
  const ecarts = classer(CAS_FIGES, lues, { 'maintenance.assign': 'TCK-592' });
  if (!ecarts.luesEtInscrites.includes('maintenance.assign')) echecs.push('lue ET inscrite — non signalée');
}
if (echecs.length > 0) {
  console.error(`✗ la garde échoue sur ${echecs.length} de ses propres cas d'épreuve :\n`);
  for (const e of echecs) console.error(`  · ${e}`);
  console.error("\n  Son motif a régressé : un vert sur l'arbre ne vaudrait rien. Corrige le motif, jamais le cas.");
  process.exit(1);
}

function classer(cas, lues, inventaire) {
  const valeurs = Object.values(cas);
  return {
    sansLecteur: valeurs.filter((v) => !lues.has(v) && !(v in inventaire)),
    luesEtInscrites: valeurs.filter((v) => lues.has(v) && v in inventaire),
    inconnues: Object.keys(inventaire).filter((v) => !valeurs.includes(v)),
  };
}

// ─── Lecture de l'arbre ────────────────────────────────────────────────────────

function arbreLocal() {
  const out = {};
  const marcher = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) marcher(p);
      else if (e.isFile() && e.name.endsWith('.php')) out[relative(API, p).split(sep).join('/')] = readFileSync(p, 'utf8');
    }
  };
  marcher(join(API, 'app'));
  marcher(join(API, 'routes'));
  return out;
}

function arbreGit(ref) {
  const out = {};
  const liste = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, 'takussan-api/app', 'takussan-api/routes'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  for (const chemin of liste.split('\n').filter((l) => l.endsWith('.php'))) {
    out[chemin.slice('takussan-api/'.length)] = execFileSync('git', ['show', `${ref}:${chemin}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  }
  return out;
}

const arbre = REF ? arbreGit(REF) : arbreLocal();
const nbFichiers = Object.keys(arbre).length;
if (nbFichiers < PLANCHER_FICHIERS) {
  console.error(`✗ seulement ${nbFichiers} fichier(s) PHP balayés (plancher : ${PLANCHER_FICHIERS}). Un balayage vide ne prouve rien.`);
  process.exit(1);
}
if (!arbre[ENUM]) {
  console.error(`✗ ${ENUM} introuvable.`);
  process.exit(1);
}

const cas = casDeLEnum(arbre[ENUM]);
const lues = lecteurs(arbre, cas);

if (REF) {
  // Classement seul : l'inventaire n'existe pas forcément sur un autre arbre.
  const valeurs = Object.values(cas);
  console.log(`Arbre ${REF} — ${valeurs.length} capacités, ${lues.size} lues :\n`);
  for (const v of valeurs) console.log(`  ${lues.has(v) ? 'lue        ' : 'SANS LECTEUR'} ${v}${lues.has(v) ? `  ← ${lues.get(v)}` : ''}`);
  process.exit(0);
}

const inventaire = inventaireDe(arbre[INVENTAIRE] ?? '');
if (inventaire === null) {
  console.error(`✗ ${INVENTAIRE} : constante AWAITING introuvable.`);
  process.exit(1);
}

const { sansLecteur, luesEtInscrites, inconnues } = classer(cas, lues, inventaire);
let echec = false;

if (REPORT) {
  console.log(`Balayage : ${nbFichiers} fichiers PHP sous takussan-api/app — ${Object.keys(cas).length} capacités`);
  for (const v of Object.values(cas)) {
    console.log(`  ${lues.has(v) ? 'lue      ' : v in inventaire ? 'inscrite ' : 'AUCUN    '} ${v}${lues.has(v) ? `  ← ${lues.get(v)}` : v in inventaire ? `  → ${inventaire[v]}` : ''}`);
  }
  console.log('');
}

if (sansLecteur.length > 0) {
  echec = true;
  console.error(`✗ ${sansLecteur.length} capacité(s) sans lecteur et absentes de l'inventaire :\n`);
  for (const v of sansLecteur) console.error(`  · ${v}`);
  console.error(`
  Une capacité que l'éditeur de rôles sert sans qu'aucun geste la juge ment à l'admin qui la
  retire. Brancher un geste dessus (canActAt / can), ou l'inscrire à
  CapabilityEnforcementInventory::AWAITING avec le ticket qui la branchera — et monter CLIQUET.
`);
}

if (luesEtInscrites.length > 0) {
  echec = true;
  console.error(`✗ ${luesEtInscrites.length} capacité(s) lues ET inscrites à l'inventaire :\n`);
  for (const v of luesEtInscrites) console.error(`  · ${v} → ${inventaire[v]}  (lue par ${lues.get(v)})`);
  console.error("\n  Le ticket qui branche une capacité retire sa ligne d'inventaire dans le même commit, et baisse CLIQUET.");
}

if (inconnues.length > 0) {
  echec = true;
  console.error(`✗ ${inconnues.length} ligne(s) d'inventaire hors de l'enum : ${inconnues.join(', ')}`);
}

const taille = Object.keys(inventaire).length;
if (taille !== CLIQUET) {
  echec = true;
  console.error(`✗ CLIQUET vaut ${CLIQUET}, mais l'inventaire compte ${taille} ligne(s).`);
  console.error(taille > CLIQUET
    ? "  L'inventaire ne peut que décroître : brancher la capacité plutôt que l'inscrire."
    : '  Une ligne retirée baisse le cliquet dans le même commit : la baisse se déclare.');
}

if (echec) process.exit(1);

console.log(`✓ capacités : ${Object.keys(cas).length} au catalogue — ${lues.size} lues, ${taille} inscrites à l'inventaire (cliquet ${CLIQUET}).`);
console.log("  ⚠ PORTÉE : cherche des formes de lecture ; « lue » ne veut pas dire « bien lue » (voir l'en-tête).");
process.exit(0);
