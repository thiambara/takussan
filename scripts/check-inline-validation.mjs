#!/usr/bin/env node
/**
 * Garde d'UNICITÉ de la convention de validation (TCK-305).
 *
 * **Ce qu'elle interdit.** Valider en ligne dans un contrôleur. Une règle de validation vit dans
 * un `FormRequest` sous `takussan-api/app/Http/Requests/`, et nulle part ailleurs.
 *
 * **Pourquoi elle existe.** Mesuré le 2026-08-17 avant convergence : **120 `$request->validate()`
 * inline** dans 58 contrôleurs, **511 champs de règles**, face à 74 classes `FormRequest`. Deux
 * conventions pour le même geste, et rien qui arbitre : une contrainte métier ne pouvait pas être
 * revue sans d'abord chercher laquelle des deux l'endpoint avait retenue.
 *
 * `takussan-api/CLAUDE.md` tranchait DÉJÀ pour le code neuf — « Pour du code neuf : `FormRequest` »
 * — et le compte a continué de monter. *Une convention qui n'existe que dans un document est lue
 * une fois, par ceux qui la respectaient déjà.*
 *
 * ## Deux orthographes, pas une
 *
 * La convergence en a trouvé une **troisième** forme que le compte de 120 ne voyait pas :
 * `ModerationQueueController::index()` écrivait `validator([...], [...])->validate()` sur un
 * tableau reconstruit à la main. Même défaut, autre orthographe — et c'était l'échappatoire par
 * laquelle on aurait pu contourner cette garde sans jamais mentir. Elle interdit donc :
 *
 *   · `$request->validate(` — et toute variable : `$req->validate(`, `$r->validate(` ;
 *   · `validator(` / `Validator::make(` — la fabrique, sous ses deux appels ;
 *   · `$this->validate(` — l'ancien helper de `Controller`.
 *
 * ## Ce qu'elle NE prouve PAS
 *
 * Qu'un endpoint valide quoi que ce soit. Un contrôleur qui ne valide rien du tout la satisfait —
 * c'est un cliquet contre la ré-divergence, pas une mesure de couverture. Chercher un jeton ne
 * mesure pas une propriété (dette D-23), et le dire ici évite qu'un vert soit lu pour plus qu'il
 * ne vaut. C'est écrit dans la sortie du script, pas seulement dans cet en-tête.
 *
 * ## Le mode de défaillance qu'elle refuse : passer au vert en ne voyant rien
 *
 * Une garde qui ne trouve plus sa cible et rend un tableau vide passe au vert en ne gardant plus
 * rien, et sa sortie ressemble à un succès (D-15, D-18, D-44). Trois vérifications actives, chacune
 * sortant en 1 :
 *   1. `app/Http/Controllers/` existe et porte un nombre plausible de fichiers ;
 *   2. `app/Http/Requests/BaseFormRequest.php` — la cible de la convergence — existe, et refuse
 *      toujours par défaut (`authorize()` retournant `false`) ;
 *   3. `app/Http/Requests/` porte un nombre plausible de FormRequest : si la convergence était
 *      défaite, il n'en resterait plus, et « 0 validation inline » serait vrai pour la pire raison.
 *
 * Usage :
 *   node scripts/check-inline-validation.mjs            # garde, sort en 1 à la moindre violation
 *   node scripts/check-inline-validation.mjs --report   # + l'inventaire de ce qui a été balayé
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const API = join(ROOT, 'takussan-api');
const CONTROLEURS = join(API, 'app', 'Http', 'Controllers');
const REQUETES = join(API, 'app', 'Http', 'Requests');
const BASE_REQUEST = join(REQUETES, 'BaseFormRequest.php');

/**
 * Planchers de plausibilité. Posés bien sous les comptes réels du 2026-08-17 (165 contrôleurs,
 * 196 FormRequest) : ils ne mesurent pas la taille du dépôt — sinon il faudrait les maintenir —
 * ils attrapent « ce répertoire a disparu ou ne se lit plus ».
 */
const PLANCHER_CONTROLEURS = 80;
const PLANCHER_REQUETES = 100;

/**
 * Les formes interdites. Chacune porte le nom de ce qu'elle attrape, parce que le message d'échec
 * doit dire QUOI faire, pas seulement que c'est interdit.
 */
const FORMES = [
  { re: /\$\w+->validate\s*\(\s*\[/, quoi: 'validation en ligne — `$request->validate([...])`' },
  { re: /\$this->validate\s*\(/, quoi: 'validation en ligne — `$this->validate(...)` (ancien helper de Controller)' },
  { re: /(?<![\w>$])validator\s*\(/, quoi: 'fabrique de validateur — `validator(...)`' },
  { re: /Validator::make\s*\(/, quoi: 'fabrique de validateur — `Validator::make(...)`' },
];

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/** @returns {string[]} chemins absolus de tous les .php sous `dir` */
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

const controleurs = phpSous(CONTROLEURS).sort();
const requetes = phpSous(REQUETES);

// (1) le balayage voit-il les contrôleurs ?
if (controleurs.length < PLANCHER_CONTROLEURS) {
  console.error(`✗ seulement ${controleurs.length} contrôleur(s) balayé(s) sous ${rel(CONTROLEURS)} (plancher : ${PLANCHER_CONTROLEURS}).`);
  console.error("  Un balayage vide ne trouve aucune violation : ce vert-là ne vaudrait rien.");
  console.error('  Si le répertoire a légitimement bougé, corrige ce script — jamais en abaissant le seuil à 0.');
  process.exit(1);
}

// (2) la cible de la convergence existe-t-elle, et refuse-t-elle toujours par défaut ?
if (!existsSync(BASE_REQUEST)) {
  console.error(`✗ ${rel(BASE_REQUEST)} est introuvable — la garde ne sait plus vers quoi elle fait converger.`);
  process.exit(1);
}
const baseSrc = readFileSync(BASE_REQUEST, 'utf8');
if (!/function authorize\(\)\s*:\s*bool\s*\{\s*return false;/s.test(baseSrc)) {
  console.error(`✗ ${rel(BASE_REQUEST)}::authorize() ne retourne plus \`false\` par défaut.`);
  console.error('  Le *fail-closed* est la moitié de la valeur de cette classe : une sous-classe qui');
  console.error("  oublie de surcharger doit refuser, pas autoriser. Si le changement est voulu, il");
  console.error('  demande un ADR — pas une garde qu\'on assouplit.');
  process.exit(1);
}

// (3) la convergence tient-elle encore ?
if (requetes.length < PLANCHER_REQUETES) {
  console.error(`✗ seulement ${requetes.length} FormRequest sous ${rel(REQUETES)} (plancher : ${PLANCHER_REQUETES}).`);
  console.error('  « 0 validation en ligne » serait alors vrai pour la pire des raisons : il ne resterait');
  console.error('  plus de validation du tout.');
  process.exit(1);
}

const violations = [];

for (const f of controleurs) {
  const lignes = readFileSync(f, 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    const nu = ligne.trim();
    // On ne juge pas les commentaires : ce script est lui-même documenté par l'exemple.
    if (nu.startsWith('*') || nu.startsWith('//') || nu.startsWith('/*')) return;
    for (const { re, quoi } of FORMES) {
      if (re.test(ligne)) violations.push({ f, n: i + 1, quoi, ligne: nu });
    }
  });
}

if (REPORT) {
  console.log(`Balayage : ${controleurs.length} contrôleurs sous ${rel(CONTROLEURS)}`);
  console.log(`Cible    : ${requetes.length} FormRequest sous ${rel(REQUETES)}, base ${rel(BASE_REQUEST)} (fail-closed vérifié)`);
  console.log(`Formes interdites : ${FORMES.length}`);
  console.log(`Violations : ${violations.length}\n`);
}

if (violations.length === 0) {
  console.log(`✓ validation : ${controleurs.length} contrôleurs balayés, 0 validation en ligne — ${requetes.length} FormRequest.`);
  console.log("  ⚠ PORTÉE : cette garde interdit de valider DANS un contrôleur, elle ne vérifie pas");
  console.log('    qu\'un endpoint valide quoi que ce soit. Un contrôleur qui ne valide rien la satisfait.');
  process.exit(0);
}

console.error(`\n✗ ${violations.length} validation(s) en ligne dans un contrôleur :\n`);
for (const v of violations) {
  console.error(`  · ${rel(v.f)}:${v.n}  ${v.quoi}`);
  console.error(`      ${v.ligne}`);
}
console.error(`
  Une règle de validation vit dans un FormRequest, sous takussan-api/app/Http/Requests/ :

    // app/Http/Requests/Api/StoreFooRequest.php
    class StoreFooRequest extends BaseFormRequest
    {
        // BaseFormRequest refuse par DÉFAUT (fail-closed) : sans cette surcharge, 403 pour tous.
        // L'autorisation elle-même ne migre PAS ici — elle appartient aux policies (TCK-306).
        public function authorize(): bool { return true; }

        /** @return array<string, mixed> */
        public function rules(): array
        {
            return ['title' => ['required', 'string', 'max:255']];
        }
    }

    // le contrôleur type-hinte la classe et lit $request->validated()
    public function store(StoreFooRequest $request): JsonResponse

  ⚠ Deux pièges déjà payés pendant la convergence des 120 sites :
    · les règles perdent le contexte du CONTRÔLEUR. Un \`$this->allowedRoles()\`, un
      \`self::TASKABLE_TYPES\` ou un \`$request\` recopiés tels quels produisent une 500 à
      l'exécution, pas une erreur de compilation — 7 cas mesurés, dont un seul attrapé par un
      test. Déplace la constante dans le FormRequest et fais-la relire par le contrôleur.
    · la validation d'un FormRequest court AVANT le corps du contrôleur. Si l'action vérifiait
      quelque chose avant de valider (404 sur un modèle, autorisation), l'ordre s'inverse.

  120 sites recopiés dans 58 contrôleurs, c'est ce qu'une convention écrite seulement dans un
  document a produit (TCK-305, ardoise D-32).
`);
process.exit(1);
