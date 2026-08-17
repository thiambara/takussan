#!/usr/bin/env node
/**
 * Garde d'UNICITÉ de l'autorisation (TCK-306).
 *
 * **Ce qu'elle interdit.** Qu'un contrôleur définisse sa propre règle d'autorisation. Une règle
 * d'autorisation vit dans une policy, sous `takussan-api/app/Policies/`, et le contrôleur
 * l'invoque par `$this->authorize(...)`.
 *
 * **Pourquoi elle existe.** Mesuré le 2026-08-17 : **25 contrôleurs** définissaient chacun leur
 * `authorizeAccess()` / `authorizeManage()` — **88 appels**, plus 9 helpers voisins
 * (`authorizeUpload`, `authorizeView`, `authorizeManageLease`, `ensureCanActOn`…) — avec la même
 * logique copiée-collée. La règle « propriétaire, périmètre d'agence, ou super-admin » était
 * recopiée **dix fois** pour le seul modèle `Property`, sous trois formes syntaxiques différentes.
 *
 * C'est le lot où une divergence ne produit pas un test rouge mais **un accès**. Deux exemples
 * mesurés pendant la convergence, et aucun des deux n'était visible :
 *
 *   · `DocumentController::authorizeManage()` autorisait le seul téléverseur ;
 *     `DocumentVersionController::authorizeManage()`, sur le MÊME modèle, déléguait à la règle de
 *     LECTURE et autorisait donc aussi l'agence. Deux contrôleurs, un modèle, deux réponses à
 *     « qui gère ce document ». Rien ne les confrontait.
 *   · `DocumentVersionController` portait le commentaire « Mirrors
 *     DocumentController::authorizeUpload() without the abort_unless » — sept branches
 *     polymorphes recopiées. *Un commentaire qui annonce une duplication ne la corrige pas : il la
 *     documente, et il vieillit avec elle.*
 *
 * ## Ce qu'elle NE prouve PAS
 *
 * Qu'un endpoint autorise quoi que ce soit. Un contrôleur qui n'appelle aucune policy la satisfait
 * — c'est un cliquet contre la ré-divergence, pas une mesure de couverture (dette D-23 : chercher
 * un jeton ne mesure pas une propriété). C'est écrit dans la sortie du script, pas seulement ici.
 *
 * ## Le mode de défaillance qu'elle refuse : passer au vert en ne voyant rien
 *
 * Quatre vérifications actives, chacune sortant en 1 :
 *   1. `app/Http/Controllers/` existe et porte un nombre plausible de fichiers ;
 *   2. `app/Policies/` porte un nombre plausible de policies — sans elles, « 0 helper dans un
 *      contrôleur » serait vrai pour la pire des raisons ;
 *   3. **la migration a bien eu lieu** : les contrôleurs appellent `$this->authorize(` un nombre
 *      plausible de fois. Sans ce contrôle, supprimer les 88 appels ferait passer la garde au vert
 *      en n'autorisant plus rien du tout — le contraire exact de ce qu'elle garde ;
 *   4. **aucune policy n'est orpheline** : une policy écrite mais jamais liée ne refuse pas
 *      bruyamment, elle est simplement ignorée, et le contrôleur qui compte sur elle laisse
 *      passer. Chaque `*Policy.php` doit être soit liée dans `AppServiceProvider`, soit trouvable
 *      par l'auto-discovery (`App\Models\X` → `App\Policies\XPolicy`).
 *
 * Usage :
 *   node scripts/check-controller-authorization.mjs            # garde, sort en 1 à la moindre violation
 *   node scripts/check-controller-authorization.mjs --report   # + l'inventaire de ce qui a été balayé
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const API = join(ROOT, 'takussan-api');
const CONTROLEURS = join(API, 'app', 'Http', 'Controllers');
const POLICIES = join(API, 'app', 'Policies');
const MODELES = join(API, 'app', 'Models');
const PROVIDER = join(API, 'app', 'Providers', 'AppServiceProvider.php');

/**
 * Planchers de plausibilité. Posés bien sous les comptes réels du 2026-08-17 (165 contrôleurs,
 * 29 policies, 93 appels à `$this->authorize(`) : ils n'ont pas à suivre la taille du dépôt, ils
 * attrapent « ce répertoire a disparu » et « la migration a été défaite ».
 */
const PLANCHER_CONTROLEURS = 80;
const PLANCHER_POLICIES = 20;
const PLANCHER_APPELS_AUTHORIZE = 50;

/**
 * Les formes interdites : la DÉFINITION d'une règle d'autorisation dans un contrôleur.
 *
 * Le motif vise `function <nom>(`, jamais `$this-><nom>(` : appeler `$this->authorize(...)` est
 * précisément ce que la garde encourage. Les trois familles couvrent les noms réellement trouvés
 * dans le dépôt — `authorize*` (11 variantes), `ensureCanActOn`, `checkDocumentableAccess` — plus
 * ce qui leur ressemblera demain.
 */
const FORMES = [
  { re: /function\s+(authorize[A-Z]\w*)\s*\(/, quoi: "helper d'autorisation" },
  { re: /function\s+(ensureCan\w*)\s*\(/, quoi: "helper d'autorisation (forme `ensureCan…`)" },
  { re: /function\s+(check\w*Access\w*)\s*\(/, quoi: "helper d'autorisation (forme `check…Access…`)" },
];

/**
 * Exemptions JUSTIFIÉES — et chacune doit l'être par écrit, comme dans `check-models-spec.mjs`.
 *
 * *Une liste d'exemptions est une dette visible ; une exemption implicite est une dette
 * invisible.* Le script refuse aussi une exemption PÉRIMÉE : si le helper disparaît, l'entrée est
 * morte et doit être retirée, sinon la liste devient un cimetière que plus personne ne relit.
 */
const EXEMPTIONS_JUSTIFIEES = new Map([
  [
    'Api/TaskController.php::authorizeAssignee',
    "rend 422, pas 403 : « l'assigné doit appartenir à votre agence » est une contrainte de "
      + 'forme sur le corps de la requête, pas un refus d\'accès. La déplacer dans une policy '
      + 'changerait son code de réponse (TCK-306).',
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // HORS PÉRIMÈTRE DE TCK-306 — 19 helpers dans 15 contrôleurs, et c'est une
  // DETTE MESURÉE, pas une tolérance.
  //
  // TCK-306 a inventorié « les contrôleurs qui définissent `authorizeAccess()`
  // ou `authorizeManage()` » : 25 contrôleurs, 88 appels. Ce compte est exact —
  // et il est incomplet, parce qu'il cherchait DEUX NOMS. Cette garde cherche
  // une FORME, et elle en trouve 19 de plus, sous 19 noms différents :
  // `authorizeAdmin`, `authorizeAgency`, `authorizeBookingManage`,
  // `authorizeLeaseAccess`, `authorizeReceipt`, `authorizeAttach`,
  // `authorizeWrite`… La même dette, invisible au grep qui l'avait mesurée.
  //
  // *Un inventaire qui cherche des noms mesure les noms qu'il connaît.*
  //
  // Elles ne sont PAS migrées ici : le « Delta à produire » de TCK-306 nomme
  // les 25 contrôleurs et les 88 appels, et en migrer 44 de mon propre chef
  // ferait un diff qu'aucune revue ne peut lire — sur le lot où une erreur
  // ouvre une porte plutôt que de rougir. Elles sont listées pour être
  // COMPTABLES : la garde bloque tout helper NOUVEAU, et cette liste dit
  // exactement ce qui reste, à qui reprendra le chantier.
  //
  // Mesuré le 2026-08-17. Chaque entrée retirée est un helper migré.
  // ───────────────────────────────────────────────────────────────────────────
  ...[
    'Api/Agency/KycController.php::authorizeAgencyAdmin',
    'Api/AgencyController.php::authorizeAdmin',
    'Api/BookingPaymentController.php::authorizeBookingAccess',
    'Api/BookingPaymentController.php::authorizeBookingManage',
    'Api/CustomerNoteController.php::authorizeCustomerAccess',
    'Api/DocumentPdfController.php::authorizeReceipt',
    'Api/DocumentPdfController.php::authorizeInvoice',
    'Api/DocumentPdfController.php::authorizeLease',
    'Api/DocumentShareLinkController.php::authorizeDocument',
    'Api/KpiConfigController.php::authorizeAgency',
    'Api/KycDocumentController.php::authorizeDocument',
    'Api/LeasePaymentController.php::authorizeLeaseAccess',
    'Api/LeasePaymentController.php::authorizeLeaseManage',
    'Api/Me/TenantOnboardingChecklistController.php::authorizeTenant',
    'Api/MediaController.php::authorizeAttach',
    'Api/PaymentController.php::authorizeBookingManage',
    'Api/PaymentController.php::authorizeLeaseManage',
    'Api/TagController.php::authorizeWrite',
    'Api/ThresholdAlertController.php::authorizeAgency',
  ].map((cle) => [cle, 'hors périmètre TCK-306 (qui nomme 25 contrôleurs et 88 appels) — dette mesurée le 2026-08-17, à reprendre par un ticket de suite']),
]);

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
const policies = phpSous(POLICIES);

// (1) le balayage voit-il les contrôleurs ?
if (controleurs.length < PLANCHER_CONTROLEURS) {
  console.error(`✗ seulement ${controleurs.length} contrôleur(s) balayé(s) sous ${rel(CONTROLEURS)} (plancher : ${PLANCHER_CONTROLEURS}).`);
  console.error("  Un balayage vide ne trouve aucune violation : ce vert-là ne vaudrait rien.");
  process.exit(1);
}

// (2) la cible de la convergence existe-t-elle ?
if (policies.length < PLANCHER_POLICIES) {
  console.error(`✗ seulement ${policies.length} policy(ies) sous ${rel(POLICIES)} (plancher : ${PLANCHER_POLICIES}).`);
  console.error("  « 0 helper d'autorisation dans un contrôleur » serait alors vrai pour la pire des");
  console.error("  raisons : il ne resterait plus de règle d'autorisation du tout.");
  process.exit(1);
}

// (3) la migration a-t-elle eu lieu ? — le contrôle qui empêche le vert par soustraction
let appelsAuthorize = 0;
for (const f of controleurs) {
  appelsAuthorize += (readFileSync(f, 'utf8').match(/\$this->authorize\s*\(|Gate::authorize\s*\(/g) || []).length;
}
if (appelsAuthorize < PLANCHER_APPELS_AUTHORIZE) {
  console.error(`✗ seulement ${appelsAuthorize} appel(s) à \`$this->authorize(\` dans les contrôleurs (plancher : ${PLANCHER_APPELS_AUTHORIZE}).`);
  console.error("  Les helpers ont peut-être disparu — mais l'autorisation avec eux. Supprimer les appels");
  console.error('  ferait passer cette garde au vert en n\'autorisant plus rien : c\'est le contraire exact');
  console.error('  de ce qu\'elle garde.');
  process.exit(1);
}

// (4) aucune policy orpheline : une policy jamais liée est ignorée, pas bruyante.
const provider = existsSync(PROVIDER) ? readFileSync(PROVIDER, 'utf8') : '';
if (provider === '') {
  console.error(`✗ ${rel(PROVIDER)} est introuvable — impossible de vérifier que les policies sont liées.`);
  process.exit(1);
}
const orphelines = [];
for (const f of policies) {
  const nom = f.split(sep).pop().replace(/\.php$/, '');
  if (nom === 'BasePolicy') continue;
  const src = readFileSync(f, 'utf8');
  if (/^abstract class /m.test(src)) continue;

  const liee = new RegExp(`\\b${nom}::class`).test(provider);
  const modele = nom.replace(/Policy$/, '');
  const autoDecouverte = existsSync(join(MODELES, `${modele}.php`));

  if (!liee && !autoDecouverte) orphelines.push({ nom, modele });
}
if (orphelines.length > 0) {
  console.error(`✗ ${orphelines.length} policy(ies) orpheline(s) — ni liée dans AppServiceProvider, ni trouvable par auto-discovery :\n`);
  for (const o of orphelines) {
    console.error(`  · ${o.nom}   (ni \`${o.nom}::class\` dans AppServiceProvider, ni app/Models/${o.modele}.php)`);
  }
  console.error(`
  Une policy jamais liée ne refuse pas bruyamment : elle est ignorée, et l'ability retombe sur le
  défaut de la Gate. Le contrôleur qui compte sur elle laisse alors passer — ou refuse tout le
  monde — sans que rien ne le signale. Ajoute un \`Gate::policy(Modele::class, XPolicy::class);\`
  dans \`AppServiceProvider::bootGatesAndPolicies()\`.
`);
  process.exit(1);
}

const violations = [];

for (const f of controleurs) {
  const relF = rel(f).replace('takussan-api/app/Http/Controllers/', '');
  const lignes = readFileSync(f, 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    const nu = ligne.trim();
    if (nu.startsWith('*') || nu.startsWith('//') || nu.startsWith('/*')) return;
    for (const { re, quoi } of FORMES) {
      const m = re.exec(ligne);
      if (!m) continue;
      const cle = `${relF}::${m[1]}`;
      if (EXEMPTIONS_JUSTIFIEES.has(cle)) return;
      violations.push({ cle, f, n: i + 1, quoi, nom: m[1], ligne: nu });
    }
  });
}

// L'inverse compte aussi : une exemption dont le helper a disparu est une entrée morte.
const clesVues = new Set();
for (const f of controleurs) {
  const relF = rel(f).replace('takussan-api/app/Http/Controllers/', '');
  const src = readFileSync(f, 'utf8');
  for (const [cle] of EXEMPTIONS_JUSTIFIEES) {
    const [fichier, nom] = cle.split('::');
    if (fichier === relF && new RegExp(`function\\s+${nom}\\s*\\(`).test(src)) clesVues.add(cle);
  }
}
for (const [cle, motif] of EXEMPTIONS_JUSTIFIEES) {
  if (clesVues.has(cle)) continue;
  console.error(`✗ \`${cle}\` est dans EXEMPTIONS_JUSTIFIEES (${motif}) mais n'existe plus — l'entrée est morte.`);
  console.error('  Retire-la : une exemption périmée n\'exempte plus rien, elle brouille la liste.');
  process.exit(1);
}

if (REPORT) {
  console.log(`Balayage : ${controleurs.length} contrôleurs sous ${rel(CONTROLEURS)}`);
  console.log(`Cible    : ${policies.length} policies sous ${rel(POLICIES)}, toutes liées ou auto-découvrables`);
  console.log(`Migration : ${appelsAuthorize} appel(s) à \`$this->authorize(\` dans les contrôleurs`);
  console.log(`Exemptions justifiées : ${EXEMPTIONS_JUSTIFIEES.size}`);
  for (const [cle, motif] of EXEMPTIONS_JUSTIFIEES) console.log(`  ~ ${cle}\n      ${motif}`);
  console.log(`Violations : ${violations.length}\n`);
}

if (violations.length === 0) {
  console.log(`✓ autorisation : ${controleurs.length} contrôleurs balayés, 0 règle définie hors d'une policy — ${policies.length} policies, ${appelsAuthorize} appels à authorize().`);
  console.log("  ⚠ PORTÉE : cette garde interdit de DÉFINIR une règle dans un contrôleur, elle ne");
  console.log('    vérifie pas qu\'un endpoint autorise quoi que ce soit. Un contrôleur qui n\'appelle');
  console.log('    aucune policy la satisfait (dette D-23).');
  process.exit(0);
}

console.error(`\n✗ ${violations.length} règle(s) d'autorisation définie(s) dans un contrôleur :\n`);
for (const v of violations) {
  console.error(`  · ${rel(v.f)}:${v.n}  ${v.quoi} \`${v.nom}()\``);
  console.error(`      ${v.ligne}`);
}
console.error(`
  Une règle d'autorisation vit dans une policy, sous takussan-api/app/Policies/ :

    // app/Policies/FooPolicy.php
    class FooPolicy extends BasePolicy
    {
        public function view(User $user, Model $model): bool { … }
        public function update(User $user, Model $model): bool { … }
    }

    // AppServiceProvider::bootGatesAndPolicies()
    Gate::policy(Foo::class, FooPolicy::class);

    // le contrôleur invoque, il ne décide pas
    $this->authorize('view', $foo);        // 403 via AuthorizationException
    $this->authorize('attachTo', [Foo::class, $parent]);   // ability à second argument

  ⚠ Trois pièges payés pendant la migration des 25 contrôleurs :
    · **Vérifie sur quelle règle chaque appel tombait vraiment.** Deux contrôleurs portaient un
      \`authorizeManage()\` du même nom, sur le même modèle, avec des règles DIFFÉRENTES — l'un
      autorisait le téléverseur seul, l'autre déléguait à la règle de lecture. Mapper les deux sur
      \`update\` aurait rendu 403 là où l'endpoint répondait 200.
    · **Une policy jamais liée est ignorée, pas bruyante.** Cette garde le vérifie (contrôle 4).
    · Si le helper rend autre chose que 403 — une 422 de validation, par exemple — ce n'est pas de
      l'autorisation : il reste dans le contrôleur, et son exemption s'écrit dans
      EXEMPTIONS_JUSTIFIEES avec son motif.

  25 contrôleurs, 88 appels, la même logique copiée-collée : c'est ce qu'une convention écrite
  seulement dans un document a produit (TCK-306, ardoise D-32).
`);
process.exit(1);
