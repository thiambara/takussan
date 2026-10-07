#!/usr/bin/env node
/**
 * Garde : aucune clause de périmètre d'agence ne compare `$user->agency_id` à l'agence d'une
 * ressource sans passer par le prédicat du personnel (TCK-587, ADR-0031).
 *
 * **Ce qu'elle interdit**, sous `takussan-api/app/Policies`, `app/Http/Controllers`,
 * `app/Http/Requests` et `app/Services` :
 *
 *   A. une comparaison de `$user->agency_id` (ou `$actor->`, `$request->user()->`,
 *      `$this->user()->`) à un `->agency_id` — `===`, `!==`, `==`, `!=` ;
 *   B. un `where(…agency_id…, $user->agency_id)` / `orWhere(…)`, à quelque profondeur de
 *      `whereHas` qu'il soit.
 *
 * …sauf si la MÊME instruction appelle aussi `isAgencyAdminAt(` (le droit d'admin, qui implique le
 * personnel) ou le prédicat — `staffAgencyId(`, `isStaffOf(`, `isStaffAt(`.
 *
 * **Pourquoi elle existe.** `User::$agency_id` est l'agence du profil actif QUEL QUE SOIT son type,
 * donc aussi celle d'un bailleur. Onze policies et six `index` ouvraient lecture et écriture sur
 * cette comparaison : chaque bailleur d'une agence lisait et modifiait les baux, loyers et
 * versements de tous les autres. Le dépôt avait fermé deux instances (messagerie, exports), pas la
 * classe — *une correction qui ne nomme pas la forme laisse la forme se recopier.*
 *
 * ## Les exemptions
 *
 * `EXEMPTIONS` : `chemin::méthode → TCK-NNN`, le ticket qui corrige ce site. Une exemption qui ne
 * couvre plus aucune violation est MORTE et fait échouer la garde : le ticket qui corrige un site
 * retire son exemption dans le même commit. `CLIQUET` est leur nombre, et il est **bilatéral** : en
 * ajouter une sans le monter, ou en retirer une sans le baisser, échoue — la dette se lit, elle ne
 * glisse pas.
 *
 * ## Ce qu'elle NE prouve PAS
 *
 *   · Elle cherche des FORMES. Une variable intermédiaire (`$a = $user->agency_id; … $a === …`)
 *     lui échappe, de même qu'un `isOwnerAt(` / `isAgentAt(` employé comme périmètre.
 *   · « La même instruction » se découpe sur `;`, `{` et `}` : une clause dont l'excuse
 *     (`isAgencyAdminAt(`) est dans le `if` englobant, et non dans l'instruction, est signalée —
 *     faux rouge assumé, qui se corrige en lisant le prédicat.
 *   · Elle ne lit que quatre répertoires d'`app/`. Ressources, jobs et écouteurs lui échappent.
 *
 * ## Ses propres tests
 *
 * `CAS_EPREUVE` tourne à CHAQUE invocation, avant le balayage : cinq formes d'écriture au moins
 * (espacée, `!==`, `&&` en tête, `orWhereHas` imbriqué, `$actor->`) et les formes à laisser passer.
 * Une garde dont le motif régresse sort en 1 sur elle-même.
 *
 * Usage :
 *   node scripts/check-agency-scope-clause.mjs            # garde
 *   node scripts/check-agency-scope-clause.mjs --report   # + exemptions et balayage
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const API = join(ROOT, 'takussan-api');
const DOSSIERS = ['app/Policies', 'app/Http/Controllers', 'app/Http/Requests', 'app/Services'].map((d) => join(API, d));

/** Plancher de plausibilité, bien sous le compte réel (~420 fichiers le 2026-10-07). */
const PLANCHER_FICHIERS = 200;

/**
 * `chemin relatif à takussan-api/::méthode` → le ticket qui corrige le site. Chaque ticket retire
 * son exemption dans le commit qui corrige (coordination de la vague 73, TCK-587 Contraintes 10).
 */
const EXEMPTIONS = new Map([
  ['app/Policies/MaintenanceRequestPolicy.php::view', 'TCK-592'],
  ['app/Policies/MaintenanceRequestPolicy.php::update', 'TCK-592'],
  ['app/Policies/MaintenanceRequestPolicy.php::isPrincipalFor', 'TCK-592'],
  ['app/Http/Controllers/Api/MaintenanceRequestController.php::index', 'TCK-592'],
  ['app/Http/Controllers/Api/PropertyVisitController.php::store', 'TCK-590'],
  ['app/Http/Controllers/Api/PropertyVisitController.php::feedback', 'TCK-590'],
  ['app/Http/Controllers/Api/ReviewController.php::deleteReply', 'TCK-597'],
  ['app/Http/Controllers/Api/ReviewController.php::reply', 'TCK-597'],
  ['app/Http/Controllers/Api/FavoriteController.php::store', 'TCK-599'],
  ['app/Http/Requests/Api/ReplyReviewRequest.php::authorize', 'TCK-597'],
]);

/** Le nombre d'exemptions. Bilatéral : il suit `EXEMPTIONS.size`, dans les deux sens. */
const CLIQUET = 10;

const ACTEUR = String.raw`\$(?:user|actor|request\s*->\s*user\(\s*\)|this\s*->\s*user\(\s*\))\s*(?:\?->|->)\s*agency_id\b`;
const RE_ACTEUR = new RegExp(ACTEUR, 'g');
const RE_AGENCE = /(?:\?->|->)\s*agency_id\b/g;
const RE_COMPARAISON = /[!=]==?/;
const RE_WHERE = new RegExp(
  String.raw`\b(?:or)?where\s*\(\s*(['"])[\w.]*agency_id\1\s*,\s*(?:\(int\)\s*)?${ACTEUR}`,
  'i',
);
const RE_EXCUSE = /\b(?:isAgencyAdminAt|staffAgencyId|isStaffOf|isStaffAt)\s*\(/;

/**
 * Remplace les commentaires par des blancs (sauts de ligne gardés). Une chaîne ne garde son
 * contenu que s'il a la forme d'un nom de colonne (`'agency_id'`, `'leases.agency_id'`) : c'est ce
 * que la forme B doit lire ; une phrase qui CITE la clause n'est pas la clause.
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
      out += c + (/^[\w.]*$/.test(contenu) ? contenu : blanc(contenu)) + (j < n ? c : '');
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

/**
 * Les instructions du texte nettoyé, découpées sur `;`, `{` et `}` hors chaînes, avec la ligne de
 * leur premier caractère non blanc et la méthode nommée qui les contient.
 *
 * @returns {{ texte: string, ligne: number, methode: string|null }[]}
 */
function instructions(net) {
  const out = [];
  let debut = 0;
  let ligne = 1;
  let ligneDebut = 1;
  let methode = null;
  let profondeur = 0;
  let profondeurMethode = -1;
  const pousser = (fin) => {
    const texte = net.slice(debut, fin);
    const nom = /\bfunction\s+(\w+)\s*\(/.exec(texte);
    out.push({ texte, ligne: ligneDebut + (net.slice(debut, fin).match(/^\s*/)[0].split('\n').length - 1), methode, nom: nom?.[1] });
  };
  for (let i = 0; i < net.length; i++) {
    const c = net[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < net.length && net[j] !== c) {
        if (net[j] === '\n') ligne++;
        j += net[j] === '\\' ? 2 : 1;
      }
      i = j;
      continue;
    }
    if (c === '\n') ligne++;
    if (c === ';' || c === '{' || c === '}') {
      pousser(i);
      const dernier = out[out.length - 1];
      if (c === '{') {
        profondeur++;
        if (dernier.nom && profondeurMethode === -1) {
          methode = dernier.nom;
          profondeurMethode = profondeur;
        }
      } else if (c === '}') {
        if (profondeur === profondeurMethode) {
          methode = null;
          profondeurMethode = -1;
        }
        profondeur--;
      }
      debut = i + 1;
      ligneDebut = ligne;
    }
  }
  pousser(net.length);
  return out;
}

/** Les violations d'un source PHP : `{ ligne, methode, forme, texte }`. */
function violationsDe(src) {
  const trouvees = [];
  for (const ins of instructions(sansCommentaires(src))) {
    const t = ins.texte;
    if (RE_EXCUSE.test(t)) continue;
    const acteurs = [...t.matchAll(RE_ACTEUR)].length;
    let forme = null;
    if (RE_WHERE.test(t)) {
      forme = 'B — where(…agency_id, $user->agency_id)';
    } else if (acteurs > 0 && [...t.matchAll(RE_AGENCE)].length > acteurs && RE_COMPARAISON.test(t)) {
      forme = 'A — $user->agency_id comparé à un ->agency_id';
    }
    if (forme) trouvees.push({ ligne: ins.ligne, methode: ins.methode, forme, texte: t.trim().replace(/\s+/g, ' ') });
  }
  return trouvees;
}

const CAS_EPREUVE = [
  // doit attraper — les cinq formes d'écriture de l'AC9, et leurs voisines
  { php: 'if ($user->agency_id !== null && $user->agency_id === $model->agency_id) { return true; }', attendu: 1 },
  { php: 'if ($user -> agency_id   ===   $model -> agency_id) { return true; }', attendu: 1 },
  { php: 'if ($model->agency_id !== $user->agency_id) { return false; }', attendu: 1 },
  { php: 'return ($user->agency_id && $user->agency_id === $model->agency_id) || $x;', attendu: 1 },
  { php: "$q->orWhereHas('property', fn ($p) => $p->whereHas('lease', fn ($l) => $l->where('agency_id', $user->agency_id)));", attendu: 1 },
  { php: 'return $actor->agency_id === $lease->agency_id;', attendu: 1 },
  { php: "$q->orWhere('leases.agency_id', $user->agency_id);", attendu: 1 },
  { php: "$q->where( \"agency_id\" , $request->user()->agency_id );", attendu: 1 },
  { php: 'return (int) $target->agency_id === (int) $user?->agency_id;', attendu: 1 },
  { php: '$ok = $user->agency_id\n    && $property->agency_id === $user->agency_id;', attendu: 1 },
  // doit laisser passer
  { php: 'return $user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id);', attendu: 0 },
  { php: 'if ($this->isStaffOf($user, $model->agency_id)) { return true; }', attendu: 0 },
  { php: "$q->orWhere('agency_id', $user->staffAgencyId());", attendu: 0 },
  { php: '// $user->agency_id === $model->agency_id', attendu: 0 },
  { php: '/* where(\'agency_id\', $user->agency_id) */ $x = 1;', attendu: 0 },
  { php: "$m = 'comparer $user->agency_id === $model->agency_id';", attendu: 0 },
  { php: 'if ($user->agency_id === null) { return false; }', attendu: 0 },
  { php: "'agency_id' => $property->agency_id ?? $user->agency_id,", attendu: 0 },
];

const echecs = CAS_EPREUVE.filter(({ php, attendu }) => violationsDe(`<?php\n${php}`).length !== attendu);
if (echecs.length > 0) {
  console.error(`✗ la garde échoue sur ${echecs.length} de ses propres cas d'épreuve :\n`);
  for (const { php, attendu } of echecs) {
    console.error(`  · ${JSON.stringify(php)} — attendu ${attendu}, vu ${violationsDe(`<?php\n${php}`).length}`);
  }
  console.error("\n  Son motif a régressé : un vert sur l'arbre ne vaudrait rien. Corrige le motif, jamais le cas.");
  process.exit(1);
}

function phpSous(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...phpSous(p));
    else if (e.isFile() && e.name.endsWith('.php')) out.push(p);
  }
  return out;
}

const relApi = (p) => relative(API, p).split(sep).join('/');
const fichiers = DOSSIERS.flatMap(phpSous).sort();

if (fichiers.length < PLANCHER_FICHIERS) {
  console.error(`✗ seulement ${fichiers.length} fichier(s) PHP balayés (plancher : ${PLANCHER_FICHIERS}).`);
  console.error('  Un balayage vide ne trouve aucune violation : ce vert-là ne vaudrait rien.');
  process.exit(1);
}

const violations = [];
const tolerees = [];
const exemptionsVues = new Set();
for (const f of fichiers) {
  const r = relApi(f);
  for (const v of violationsDe(readFileSync(f, 'utf8'))) {
    const cle = `${r}::${v.methode ?? '?'}`;
    if (EXEMPTIONS.has(cle)) {
      exemptionsVues.add(cle);
      tolerees.push({ cle, ...v });
    } else {
      violations.push({ r, ...v });
    }
  }
}

let echec = false;

const mortes = [...EXEMPTIONS.keys()].filter((cle) => !exemptionsVues.has(cle));
if (mortes.length > 0) {
  echec = true;
  console.error(`✗ ${mortes.length} exemption(s) ne couvrent plus aucune clause — elles sont mortes :\n`);
  for (const cle of mortes) console.error(`  · ${cle} → ${EXEMPTIONS.get(cle)}`);
  console.error('\n  Le ticket qui corrige un site retire son exemption dans le même commit, et baisse CLIQUET.');
}

if (EXEMPTIONS.size !== CLIQUET) {
  echec = true;
  console.error(`✗ CLIQUET vaut ${CLIQUET}, mais EXEMPTIONS en compte ${EXEMPTIONS.size}.`);
  console.error(EXEMPTIONS.size > CLIQUET
    ? '  Une exemption de plus est une clause de plus : corrige le site par le prédicat plutôt que de l\'exempter.'
    : '  Une exemption retirée baisse le cliquet dans le même commit : la dette se lit, elle ne glisse pas.');
}

if (REPORT) {
  console.log(`Balayage   : ${fichiers.length} fichiers PHP sous ${DOSSIERS.map(relApi).join(', ')}`);
  console.log(`Exemptions : ${EXEMPTIONS.size} (cliquet ${CLIQUET})`);
  for (const t of tolerees) console.log(`  toléré · ${t.cle}:${t.ligne} → ${EXEMPTIONS.get(t.cle)}\n      ${t.texte.slice(0, 140)}`);
  console.log(`Violations : ${violations.length}\n`);
}

if (violations.length > 0) {
  echec = true;
  console.error(`\n✗ ${violations.length} clause(s) de périmètre d'agence hors du prédicat du personnel :\n`);
  for (const v of violations) {
    console.error(`  · ${v.r}:${v.ligne}  (${v.methode ?? 'hors méthode'}) ${v.forme}`);
    console.error(`      ${v.texte.slice(0, 160)}`);
  }
  console.error(`
  \`$user->agency_id\` est l'agence du profil actif QUEL QUE SOIT son type — aussi celle d'un
  BAILLEUR. Le comparer à l'agence d'une ressource ouvre au bailleur les ressources de tous les
  autres bailleurs de l'agence (ADR-0031). Lire le prédicat :

    $this->isStaffOf($user, $model->agency_id)                 // dans une policy
    $user->staffAgencyId() === (int) $model->agency_id         // ailleurs
    if (($staffAgencyId = $user->staffAgencyId()) !== null) {  // dans un index
        $q->orWhere('agency_id', $staffAgencyId);
    }
`);
}

if (echec) process.exit(1);

console.log(`✓ périmètre d'agence : ${fichiers.length} fichiers balayés, 0 clause hors du prédicat — ${tolerees.length} tolérée(s) par ${EXEMPTIONS.size} exemption(s) nommée(s).`);
console.log('  ⚠ PORTÉE : cherche des formes ; une variable intermédiaire lui échappe (voir l\'en-tête).');
process.exit(0);
