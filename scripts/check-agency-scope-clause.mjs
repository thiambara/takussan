#!/usr/bin/env node
/**
 * Garde : aucune clause de périmètre d'agence ne compare `$user->agency_id` à l'agence d'une
 * ressource sans passer par le prédicat du personnel (TCK-587, ADR-0031).
 *
 * **Ce qu'elle interdit**, sous `takussan-api/app/Policies`, `app/Http/Controllers`,
 * `app/Http/Requests` et `app/Services` :
 *
 *   A. une comparaison de `$user->agency_id` (ou `$actor->`, `$request->user()->`,
 *      `$this->user()->`, `auth()->user()->`, `request()->user()->`, `Auth::user()->`, `?->`
 *      compris, garde nommé `('sanctum')` compris) à un `->agency_id` ou à un `->id` (l'agence
 *      elle-même) — `===`, `!==`, `==`, `!=`, `<>`, `<=>`, dans les deux sens, `(int)` et
 *      `(… ?? 0)` compris ;
 *   B. un `where|orWhere|whereIn|orWhereIn('…agency_id', [opérateur,] $user->agency_id)`, la forme
 *      tableau `where(['…agency_id' => $user->agency_id])`, et `whereRaw('… agency_id …',
 *      [$user->agency_id])` — à quelque profondeur de `whereHas` que ce soit.
 *
 * …sauf si la MÊME instruction appelle aussi `isAgencyAdminAt(` (le droit d'admin, qui implique le
 * personnel) ou le prédicat — `staffAgencyId(`, `isStaffOf(`, `isStaffAt(` — **sur la même
 * agence** : l'argument de l'excuse contient l'un des deux membres comparés, et aucun `||` ne
 * l'en sépare. `… || $user->isAgencyAdminAt(0)` ne blanchit rien (verif-587, G18). L'excuse doit
 * être **positive** : niée (`! …`), comparée (`=== false`) ou enfermée dans une fonction fléchée
 * que la clause ne partage pas, elle ne blanchit rien (verif-587 passe 2, N12, N12b, N25).
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
 *   · Elle cherche des FORMES. Ce qui lui échappe, une ligne par forme (verif-587, M5) :
 *       - variable intermédiaire : `$a = $user->agency_id; … $a === …` (sites connus : `HORS_DETECTION`) ;
 *       - `$user->getAttribute('agency_id')`, `optional($user)->agency_id` ;
 *       - `$user->activeProfile()?->agency_id` ;
 *       - un périmètre jugé par profil : `isOwnerAt(`, `isAgentAt(`, `hasProfileAt(` ;
 *       - `whereAgencyId($user->agency_id)` (where dynamique), `in_array($m->agency_id, [$user->agency_id])` ;
 *       - `whereRaw` dont la valeur est interpolée dans la chaîne (`"agency_id = {$user->agency_id}"`) ;
 *       - un `match`/ternaire dont le bras compare deux variables locales ;
 *       - l'excuse ne regarde pas QUI elle juge : `… && isStaffAt($unTiers, $model->agency_id)` dans la
 *         même instruction blanchit encore la clause. (G17 de verif-587, joint par `||`, est vu.)
 *       - l'excuse niée autrement que par `!` ou une comparaison : `xor`, `and`/`or` en mots, une
 *         variable qui en garde le résultat (`$admin = …; … && ! $admin`) ;
 *       - l'accès par tableau ou par nom dynamique : `$model['agency_id']`, `$user->{'agency_id'}` ;
 *       - `$model->getAttribute('agency_id')` côté RESSOURCE (comme côté acteur, ci-dessus) ;
 *       - `collect([$user->agency_id])->contains(…)` (parent d'`in_array`) ;
 *       - `->when($user->agency_id, fn ($q, $a) => $q->where('agency_id', $a))` (variable de closure) ;
 *       - `whereBelongsTo(Agency::find($user->agency_id))` et toute relation d'agence résolue par modèle ;
 *       - `??` vers autre chose qu'un littéral ou une variable (`($user->agency_id ?? $x->y) === …`).
 *   · « La même instruction » se découpe sur `;`, `{` et `}` : une clause dont l'excuse
 *     (`isAgencyAdminAt(`) est dans le `if` englobant, et non dans l'instruction, est signalée —
 *     faux rouge assumé, qui se corrige en lisant le prédicat.
 *   · Elle ne lit que quatre répertoires d'`app/`. Ressources, jobs et écouteurs lui échappent.
 *
 * ## Ses propres tests
 *
 * `CAS_EPREUVE` tourne à CHAQUE invocation, avant le balayage : cinq formes d'écriture au moins
 * (espacée, `!==`, `&&` en tête, `orWhereHas` imbriqué, `$actor->`), les formes de verif-587
 * (G1, G2, G3, G6, G7, G15, AB-3c, G18), celles de la passe 2 (N1, N2, N3, N5, N6, N12, N12b, N25)
 * et les formes à laisser passer.
 *
 * `REFUS_SANS_OCTROI` et `HORS_DETECTION` : deux listes nommées, chacune avec son cliquet
 * bilatéral et sa détection de ligne morte — voir leur déclaration.
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
  ['app/Http/Controllers/Api/FavoriteController.php::store', 'TCK-599'],
]);

/** Le nombre d'exemptions. Bilatéral : il suit `EXEMPTIONS.size`, dans les deux sens. */
const CLIQUET = 1;

/**
 * Des REFUS qui n'accordent rien : `if ($user->agency_id !== $agency->id) return false;` suivi d'un
 * droit qui exige déjà l'admin ou l'administrateur principal. Ce n'est pas une fuite, mais la forme
 * est celle qui en fait une ailleurs : chaque site est nommé, justifié, compté (cliquet bilatéral)
 * et refusé s'il ne correspond plus à rien. Les réécrire par le prédicat change l'accès de
 * l'administrateur principal sans profil d'admin actif (32 tests rouges, mesuré) : hors ticket.
 */
const REFUS_SANS_OCTROI = new Map([
  ['app/Policies/BankStatementPolicy.php::viewAny', "la suite exige l'administrateur principal ou isAgencyAdminAt"],
  ['app/Policies/RoleDelegationPolicy.php::viewAny', "la suite exige l'administrateur principal ou team.delegate_role en direct"],
  ['app/Http/Requests/Permissions/StoreRoleDelegationRequest.php::validateBeneficiaryInAgency', "`$user` y est le BÉNÉFICIAIRE (validation), pas l'appelant"],
]);
const CLIQUET_REFUS = 3;

/**
 * Sites connus que la garde NE DÉTECTE PAS (variable intermédiaire, `getAttribute`) : inscrits à la
 * main au nom du ticket qui les corrige, et vérifiés par recherche du motif dans le fichier. Quand
 * le motif disparaît, la ligne est morte et la garde échoue : le ticket retire sa ligne et baisse
 * `CLIQUET_HORS_DETECTION`. Sans cette liste, rien ne forcerait leur fermeture (verif-587, M5).
 */
const HORS_DETECTION = [];
const CLIQUET_HORS_DETECTION = 0;

/**
 * L'agence de l'acteur : `$user`, `$actor`, `$request->user()`, `$this->user()`, `auth()->user()`,
 * `request()->user()`, `Auth::user()` — suivis de `->agency_id` ou `?->agency_id`.
 */
// `()` ou `('sanctum')` (verif-587 passe 2, N5 et N6) ; sans groupe capturant : les motifs qui
// l'emploient numérotent les leurs.
const GARDE = String.raw`\(\s*(?:'\w*'|"\w*")?\s*\)`;
const ACTEUR = String.raw`(?:\$(?:user|actor)|\$(?:request|this)\s*->\s*user${GARDE}|(?:auth|request)${GARDE}\s*->\s*user${GARDE}|Auth::(?:guard${GARDE}\s*->\s*)?user\(\s*\))\s*(?:\?->|->)\s*agency_id\b`;
/** `(int)` en tête, et `(… ?? 0)` autour (verif-587 passe 2, N2). */
const ACTEUR_INT = String.raw`(?:\(\s*)?(?:\(int\)\s*)?${ACTEUR}(?:\s*\?\?\s*[\w$'"]+\s*\))?`;
/** L'autre membre d'une comparaison : un `->agency_id` ou un `->id` (l'agence elle-même, AB-3c). */
const OPERANDE = String.raw`(?:\(int\)\s*)?\$\w+(?:\s*(?:\?->|->)\s*\w+(?:\(\s*\))?)*?\s*(?:\?->|->)\s*(?:agency_id|id)\b`;
/** `===`, `!==`, `==`, `!=`, `<>` et `<=>` (verif-587 passe 2, N1 et N3). */
const CMP = String.raw`\s*(?:[!=]==?|<=?>)\s*`;
/** Forme A : `ACTEUR == OPERANDE` ou `OPERANDE == ACTEUR`, l'opérande étant capturé. */
const RE_COMPARAISONS = [
  new RegExp(String.raw`${ACTEUR_INT}${CMP}(${OPERANDE})`, 'g'),
  new RegExp(String.raw`(${OPERANDE})${CMP}${ACTEUR_INT}`, 'g'),
];
/** Une chaîne SQL qui nomme `agency_id` (`whereRaw('agency_id = ?', …)`), voir `sansCommentaires`. */
const SQL_AGENCE = '§agency_id§';
/**
 * Forme B : `where|orWhere|whereIn|orWhereIn('…agency_id', [op,] [ACTEUR])`, la forme tableau
 * `where(['…agency_id' => ACTEUR])`, et `whereRaw('… agency_id …', [ACTEUR])`.
 */
const RE_WHERES = [
  new RegExp(String.raw`\b(?:or)?where(?:In)?\s*\(\s*(['"])[\w.]*agency_id\1\s*,\s*(?:(['"])[^'"]*\2\s*,\s*)?\[?\s*${ACTEUR_INT}`, 'gi'),
  new RegExp(String.raw`\b(?:or)?where\s*\(\s*\[[^\]]*?(['"])[\w.]*agency_id\1\s*=>\s*${ACTEUR_INT}`, 'gi'),
  new RegExp(String.raw`\b(?:or)?whereRaw\s*\(\s*(['"])${SQL_AGENCE}[^'"]*\1\s*,\s*\[[^\]]*?${ACTEUR_INT}`, 'gi'),
];
/** Les excuses : un appel au droit d'admin ou au prédicat, dont on lit les arguments. */
const RE_EXCUSE = /\b(?:isAgencyAdminAt|staffAgencyId|isStaffOf|isStaffAt)\s*\(/g;

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
      // Une chaîne SQL qui nomme `agency_id` garde un marqueur (forme `whereRaw`) ; sa phrase,
      // elle, est blanchie comme les autres : une phrase qui CITE la clause n'est pas la clause.
      const garde = /^[\w.]*$/.test(contenu) ? contenu : (/agency_id/.test(contenu) ? SQL_AGENCE : '') + blanc(contenu);
      out += c + garde + (j < n ? c : '');
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

const normal = (x) => x.replace(/\(int\)/g, '').replace(/\s+/g, '').replace(/\?->/g, '->');

/** Les excuses d'une instruction : `{ debut, fin, args }`, `args` normalisés. */
function excusesDe(t) {
  const out = [];
  for (const m of t.matchAll(RE_EXCUSE)) {
    let i = m.index + m[0].length;
    let prof = 1;
    while (i < t.length && prof > 0) {
      if (t[i] === '(') prof++;
      else if (t[i] === ')') prof--;
      i++;
    }
    out.push({ debut: m.index, fin: i, args: normal(t.slice(m.index + m[0].length, i - 1)) });
  }
  return out;
}

/**
 * Les corps de fonctions fléchées d'une instruction : `[debut, fin[` de ce qui suit `=>` jusqu'à la
 * première `)` ou `,` non appariée. Une excuse dans un corps que la clause ne partage pas n'est
 * jamais évaluée avec elle (verif-587 passe 2, N25 : `… && (fn () => $user->isAgencyAdminAt(…))`).
 */
function corpsFleches(t) {
  const out = [];
  for (const m of t.matchAll(/\bfn\s*\([^()]*\)\s*(?::\s*\??\w+\s*)?=>/g)) {
    let i = m.index + m[0].length;
    let prof = 0;
    for (; i < t.length; i++) {
      if (t[i] === '(' || t[i] === '[') prof++;
      else if (t[i] === ')' || t[i] === ']') {
        if (prof === 0) break;
        prof--;
      } else if (t[i] === ',' && prof === 0) break;
    }
    out.push([m.index, i]);
  }
  return out;
}

/**
 * Une excuse est POSITIVE quand son résultat est pris tel quel : ni précédée de `!`, ni comparée
 * (`=== false`, `false ===`, `!== true`…). `… && ! $user->isAgencyAdminAt(…)` dit l'inverse de
 * l'excuse — *même agence ET pas admin* accorde à tout bailleur (verif-587 passe 2, N12 et N12b).
 */
function positive(t, debut, fin) {
  // Le receveur (`$user->`, `$this->`, `$request->user()->`, `User::`) et les parenthèses ouvrantes.
  const avant = t.slice(0, debut)
    .replace(/(?:\$\w+(?:\s*(?:\?->|->)\s*\w+(?:\([^()]*\))?)*\s*(?:\?->|->)|\w+::)\s*$/, '')
    .replace(/[\s(]*$/, '');
  if (/!$/.test(avant) || /(?:[!=]==?|<=?>)$/.test(avant)) return false;
  return !/^[\s)]*(?:[!=]==?|<=?>)/.test(t.slice(fin));
}

/**
 * Une excuse ne blanchit une clause que si elle juge **la même agence** : son argument contient le
 * membre comparé (`$kpi->agency_id === … && isAgencyAdminAt((int) $kpi->agency_id)`), aucun `||`
 * ne la sépare de la clause, elle est **positive** et n'est pas enfermée dans une fonction fléchée
 * que la clause ne partage pas. `… || $user->isAgencyAdminAt(0)` (verif-587, G18) ne blanchit
 * plus rien : la simple PRÉSENCE du mot suffisait ; ni sa négation (passe 2, N12, N12b, N25).
 */
function excusee(t, clause, cible) {
  // L'un ou l'autre membre de la comparaison : `(int) $target->agency_id === (int) $user->agency_id
  // && $user->isAgencyAdminAt((int) $user->agency_id)` juge la même agence que `… $target …`.
  const membres = [normal(cible), normal(new RegExp(ACTEUR).exec(t.slice(clause.debut, clause.fin))?.[0] ?? '\0')];
  const fleches = corpsFleches(t);
  const dans = (pos, [d, f]) => pos >= d && pos < f;
  return excusesDe(t).some(({ debut, fin, args }) => {
    if (!membres.some((m) => args.includes(m))) return false;
    if (!positive(t, debut, fin)) return false;
    if (fleches.some((c) => dans(debut, c) && !dans(clause.debut, c))) return false;
    const entre = debut > clause.fin ? t.slice(clause.fin, debut) : t.slice(fin, clause.debut);
    return !entre.includes('||');
  });
}

/** Les violations d'un source PHP : `{ ligne, methode, forme, texte }`. */
function violationsDe(src) {
  const trouvees = [];
  for (const ins of instructions(sansCommentaires(src))) {
    const t = ins.texte;
    let forme = null;
    for (const re of RE_WHERES) {
      for (const m of t.matchAll(re)) {
        const acteur = new RegExp(ACTEUR).exec(m[0])[0];
        if (!excusee(t, { debut: m.index, fin: m.index + m[0].length }, acteur)) forme ??= 'B — where(…agency_id, $user->agency_id)';
      }
    }
    for (const re of RE_COMPARAISONS) {
      for (const m of t.matchAll(re)) {
        if (!excusee(t, { debut: m.index, fin: m.index + m[0].length }, m[1])) forme ??= 'A — $user->agency_id comparé à un ->agency_id ou à un ->id';
      }
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
  // verif-587 (M5) — formes ajoutées
  { php: "$q->where('agency_id', '=', $user->agency_id);", attendu: 1 }, // G1
  { php: "$q->whereIn('agency_id', [$user->agency_id]);", attendu: 1 }, // G2
  { php: "$q->where(['status' => 'x', 'agency_id' => $user->agency_id]);", attendu: 1 }, // G3
  { php: 'return auth()->user()->agency_id === $model->agency_id;', attendu: 1 }, // G6
  { php: 'return request()->user()?->agency_id === $model->agency_id;', attendu: 1 }, // G7
  { php: "$q->whereRaw('agency_id = ?', [$user->agency_id]);", attendu: 1 }, // G15
  { php: 'return $user->agency_id === $documentable->id;', attendu: 1 }, // AB-3c (l'agence elle-même)
  { php: 'return $user->agency_id === $model->agency_id || $user->isAgencyAdminAt(0);', attendu: 1 }, // G18
  { php: 'return $user->agency_id === $model->agency_id || $user->isAgencyAdminAt((int) $model->agency_id);', attendu: 1 }, // excuse séparée par ||
  // verif-587 passe 2 (N1) — l'excuse niée, comparée ou jamais appelée ne blanchit rien
  { php: 'return $user->agency_id === $model->agency_id && ! $user->isAgencyAdminAt((int) $model->agency_id);', attendu: 1 }, // N12
  { php: 'return $user->agency_id === $model->agency_id && !($user->isAgencyAdminAt((int) $model->agency_id));', attendu: 1 }, // N12, parenthésée
  { php: 'return $user->agency_id === $model->agency_id && $user->isAgencyAdminAt((int) $model->agency_id) === false;', attendu: 1 }, // N12b
  { php: 'return $user->agency_id === $model->agency_id && false === $user->isAgencyAdminAt((int) $model->agency_id);', attendu: 1 }, // N12b, à gauche
  { php: 'return $user->agency_id === $model->agency_id && (fn () => $user->isAgencyAdminAt((int) $model->agency_id));', attendu: 1 }, // N25
  { php: 'return $user->agency_id <> $model->agency_id;', attendu: 1 }, // N1
  { php: 'return ($user->agency_id ?? 0) === $model->agency_id;', attendu: 1 }, // N2
  { php: 'return $model->agency_id === ($user->agency_id ?? 0);', attendu: 1 }, // N2, à droite
  { php: 'return ($user->agency_id <=> $model->agency_id) === 0;', attendu: 1 }, // N3
  { php: "return request()->user('sanctum')->agency_id === $model->agency_id;", attendu: 1 }, // N5
  { php: "return auth('sanctum')->user()->agency_id === $model->agency_id;", attendu: 1 }, // N6
  // doit laisser passer
  { php: 'return $user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id);', attendu: 0 },
  { php: 'return $user->agency_id !== null && $user->agency_id === $kpi->agency_id && $user->isAgencyAdminAt((int) $kpi->agency_id);', attendu: 0 },
  { php: 'if ((int) $target->agency_id === (int) $user->agency_id && $user->isAgencyAdminAt((int) $user->agency_id)) { return true; }', attendu: 0 },
  { php: 'return $user->agency_id === $model->agency_id && ($user->isAgencyAdminAt((int) $model->agency_id));', attendu: 0 }, // positive, parenthésée
  { php: "$q->where(fn ($w) => $w->where('agency_id', $user->agency_id) && $user->isAgencyAdminAt((int) $user->agency_id));", attendu: 0 }, // même corps
  { php: "$q->whereRaw('lower(name) = ?', [$name]);", attendu: 0 },
  { php: 'return $user->id === $documentable->id;', attendu: 0 },
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
const refusVus = new Set();
for (const f of fichiers) {
  const r = relApi(f);
  for (const v of violationsDe(readFileSync(f, 'utf8'))) {
    const cle = `${r}::${v.methode ?? '?'}`;
    if (EXEMPTIONS.has(cle)) {
      exemptionsVues.add(cle);
      tolerees.push({ cle, ...v });
    } else if (REFUS_SANS_OCTROI.has(cle)) {
      refusVus.add(cle);
    } else {
      violations.push({ r, ...v });
    }
  }
}

let echec = false;

const refusMorts = [...REFUS_SANS_OCTROI.keys()].filter((cle) => !refusVus.has(cle));
if (refusMorts.length > 0 || REFUS_SANS_OCTROI.size !== CLIQUET_REFUS) {
  echec = true;
  for (const cle of refusMorts) console.error(`✗ refus sans octroi mort (plus aucune clause) : ${cle} — retire la ligne et baisse CLIQUET_REFUS.`);
  if (REFUS_SANS_OCTROI.size !== CLIQUET_REFUS) console.error(`✗ CLIQUET_REFUS vaut ${CLIQUET_REFUS}, mais REFUS_SANS_OCTROI en compte ${REFUS_SANS_OCTROI.size}.`);
}

for (const { site, motif, ticket } of HORS_DETECTION) {
  const [chemin] = site.split('::');
  const p = join(API, chemin);
  if (!existsSync(p) || !readFileSync(p, 'utf8').includes(motif)) {
    echec = true;
    console.error(`✗ site hors détection disparu : ${site} (${ticket}) — le motif \`${motif}\` n'y est plus.`);
    console.error('  Le ticket qui corrige le site retire sa ligne de HORS_DETECTION et baisse CLIQUET_HORS_DETECTION.');
  }
}
if (HORS_DETECTION.length !== CLIQUET_HORS_DETECTION) {
  echec = true;
  console.error(`✗ CLIQUET_HORS_DETECTION vaut ${CLIQUET_HORS_DETECTION}, mais HORS_DETECTION en compte ${HORS_DETECTION.length}.`);
}

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
  console.log(`Refus sans octroi : ${REFUS_SANS_OCTROI.size} (cliquet ${CLIQUET_REFUS})`);
  for (const [cle, motif] of REFUS_SANS_OCTROI) console.log(`  · ${cle} — ${motif}`);
  console.log(`Hors détection : ${HORS_DETECTION.length} (cliquet ${CLIQUET_HORS_DETECTION})`);
  for (const h of HORS_DETECTION) console.log(`  · ${h.site} → ${h.ticket}`);
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

console.log(`✓ périmètre d'agence : ${fichiers.length} fichiers balayés, 0 clause hors du prédicat — ${tolerees.length} tolérée(s) par ${EXEMPTIONS.size} exemption(s) nommée(s), ${REFUS_SANS_OCTROI.size} refus sans octroi, ${HORS_DETECTION.length} site(s) hors détection inscrit(s).`);
console.log('  ⚠ PORTÉE : cherche des formes ; une variable intermédiaire lui échappe (voir l\'en-tête).');
process.exit(0);
