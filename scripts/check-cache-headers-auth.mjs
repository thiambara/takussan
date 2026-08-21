#!/usr/bin/env node
/**
 * Garde du CACHE PARTAGÉ face aux SURFACES AUTHENTIFIÉES (TCK-341).
 *
 * `Cache-Control: public` autorise un cache PARTAGÉ — CDN, reverse proxy, cache de
 * navigateur mutualisé — à stocker une réponse et à la resservir à quelqu'un d'autre.
 * Sur une route authentifiée, cela ne produit ni erreur ni ralentissement : cela
 * produit **la réponse d'un utilisateur servie à un autre**, et personne ne peut le
 * voir depuis le code applicatif. C'est la famille de défauts la plus chère de ce
 * dépôt — celle qui ne se manifeste que chez le lecteur suivant.
 *
 * ── POURQUOI UNE GARDE, ET PAS SEULEMENT UN TEST ───────────────────────────────
 *
 * Un test ne couvre que les routes auxquelles on a pensé à le donner. Or le défaut
 * ne s'introduit pas en ajoutant un en-tête de cache : il s'introduit en ajoutant
 * `auth:sanctum` autour d'un groupe qui en portait déjà un, ou en déplaçant une
 * route existante DANS ce groupe. Le fichier modifié n'est alors même pas celui qui
 * porte le `public` — et aucun test de cette route-là ne rougit, parce que la route
 * continue de répondre exactement ce qu'on lui demande.
 *
 * Mesuré le 2026-08-21, ce qui a motivé cette garde : `/api/public/properties/{slug}`
 * était candidate à `Cache-Control: public` dans le delta de TCK-341, et
 * `PropertyResource` émet `rejection_reason`, `submitted_at`, `approved_at`,
 * `rejected_at` — plus l'e-mail d'un collaborateur — dès que `$request->user()` n'est
 * pas null. Cette route ne porte PAS `auth:sanctum`, et `$request->user()` y est
 * pourtant renseigné : `ResolveActiveProfile` propage délibérément un porteur Bearer
 * au garde par défaut sur tout `api/*` (TCK-179). La rendre `public` aurait défait en
 * silence ce que TCK-335 venait tout juste de retirer.
 *
 * ── CE QUE LA GARDE VÉRIFIE ────────────────────────────────────────────────────
 *
 *   A. AUCUNE route portant un middleware d'authentification ne porte, directement
 *      ou par un groupe englobant, un `cache.headers:` dont les options contiennent
 *      `public` ou `s_maxage`.
 *
 *   B. La même chose pour les en-têtes posés DANS LE CONTRÔLEUR. Sans ce second
 *      contrôle, la garde serait quasi vide : les deux seules réponses `public` de ce
 *      dépôt au moment de son écriture (`SuggestController`,
 *      `PublicPropertyController::discovery()`) sont posées à la main dans le
 *      contrôleur, pas par le middleware. Une garde qui ne regarde que la forme qu'on
 *      vient d'écrire garde la forme qu'on vient d'écrire, et rien d'autre.
 *      Le rattachement est fait MÉTHODE PAR MÉTHODE : `PublicPropertyController` sert
 *      à la fois `discovery` (qui émet `public`) et `booking-request` (sous
 *      `auth:sanctum`) — les confondre rendrait la garde rouge à tort dès son premier
 *      jour.
 *
 *   C. NON-VACUITÉ. Une garde qui ne trouve plus sa cible et rend zéro défaut passe au
 *      vert en ne gardant plus rien. Si l'analyse des fichiers de routes rend moins de
 *      `MIN_ROUTES` routes, moins de `MIN_ROUTES_AUTH` routes authentifiées, ou plus
 *      AUCUN émetteur de cache partagé, la garde ROUGIT au lieu de conclure.
 *
 * ── CE QU'ELLE NE VÉRIFIE PAS ──────────────────────────────────────────────────
 *
 *   · Qu'une réponse `public` sans `auth:` soit SÛRE. Elle ne l'est pas
 *     automatiquement — la démonstration est ci-dessus : la fiche publique varie avec
 *     un porteur Bearer sans porter le moindre `auth:`. Ce que le middleware d'un
 *     routeur peut prouver s'arrête là ; la variance réelle d'un corps se prouve par
 *     un test qui compare deux corps (`tests/Feature/Public/CataloguePublicCacheTest.php`).
 *   · Qu'un `Vary` soit juste ou présent. Un `Vary` manquant se prouve par la même
 *     famille de tests, pas par une lecture de fichier de routes.
 *   · Les en-têtes posés par le serveur web (nginx). Ils ne sont pas dans le dépôt,
 *     à l'exception de `scripts/server-setup.sh` que cette garde ne lit pas.
 *
 * Usage :
 *   node scripts/check-cache-headers-auth.mjs
 *   node scripts/check-cache-headers-auth.mjs --report
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const ROUTES = join(ROOT, 'takussan-api', 'routes');
const CONTROLEURS = join(ROOT, 'takussan-api', 'app', 'Http', 'Controllers');

/**
 * Planchers de non-vacuité. Ce ne sont pas des objectifs : ce sont les valeurs
 * MESURÉES le 2026-08-21, arrondies vers le bas assez large pour qu'une suppression
 * légitime ne rougisse pas, et assez serré pour qu'un analyseur qui cesse de
 * comprendre les fichiers de routes le dise au lieu de se taire.
 * Mesuré : 322 routes, dont 243 authentifiées, 3 émetteurs de cache partagé.
 */
const MIN_ROUTES = 150;
const MIN_ROUTES_AUTH = 80;
const MIN_EMETTEURS = 1;

/**
 * Ce qui compte comme « surface authentifiée ».
 *
 * `auth:*` et `auth` couvrent le garde. `super-admin` est ajouté parce qu'il ne
 * s'emploie JAMAIS seul dans ce dépôt — il suppose un utilisateur déjà résolu — et
 * qu'une route qui le porterait sans `auth:` serait un défaut d'un autre genre :
 * la garde préfère alors le signaler ici plutôt que de le laisser passer.
 */
const EST_AUTH = (mw) => mw === 'auth' || mw.startsWith('auth:') || mw.startsWith('auth.') || mw === 'super-admin';

/** Les deux options de `cache.headers` qui ouvrent la réponse à un cache PARTAGÉ. */
const OPTIONS_PARTAGE = ['public', 's_maxage'];

// ── Lecture ────────────────────────────────────────────────────────────────────

function fichiersPhp(racine) {
  if (!existsSync(racine)) return [];
  const out = [];
  for (const e of readdirSync(racine)) {
    const p = join(racine, e);
    if (statSync(p).isDirectory()) out.push(...fichiersPhp(p));
    else if (e.endsWith('.php')) out.push(p);
  }
  return out.sort();
}

/**
 * Dénude les commentaires AVANT toute lecture.
 *
 * Ce n'est pas une précaution de principe : `routes/api/public.php` porte désormais
 * vingt lignes de commentaire qui contiennent littéralement `cache.headers`,
 * `public` et `auth:sanctum` pour expliquer pourquoi la fiche ne les porte PAS. Une
 * garde qui lit les commentaires conclurait l'inverse exact de ce qu'ils disent.
 * (`check-resource-date-format.mjs` est passée au vert par ce chemin-là avant d'être
 * corrigée : le docblock satisfaisait le motif que le code ne satisfaisait plus.)
 */
function denude(code) {
  let out = '';
  let i = 0;
  let etat = 'code'; // code | ligne | bloc | simple | double
  while (i < code.length) {
    const c = code[i];
    const d = code[i + 1];
    if (etat === 'code') {
      if (c === '/' && d === '/') { etat = 'ligne'; i += 2; continue; }
      if (c === '#' && d !== '[') { etat = 'ligne'; i += 1; continue; }
      if (c === '/' && d === '*') { etat = 'bloc'; i += 2; continue; }
      if (c === "'") etat = 'simple';
      else if (c === '"') etat = 'double';
      out += c; i += 1; continue;
    }
    if (etat === 'ligne') {
      if (c === '\n') { etat = 'code'; out += '\n'; }
      i += 1; continue;
    }
    if (etat === 'bloc') {
      if (c === '*' && d === '/') { etat = 'code'; i += 2; continue; }
      if (c === '\n') out += '\n';
      i += 1; continue;
    }
    // dans une chaîne : on recopie, en respectant l'échappement
    out += c;
    if (c === '\\') { out += code[i + 1] ?? ''; i += 2; continue; }
    if ((etat === 'simple' && c === "'") || (etat === 'double' && c === '"')) etat = 'code';
    i += 1;
  }
  return out;
}

/** Toutes les chaînes littérales d'un fragment `middleware(...)`. */
function chainesDe(fragment) {
  return [...fragment.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
}

/** Les middlewares déclarés par un fragment de chaîne fluide `Route::…`. */
function middlewaresDe(fragment) {
  const out = [];
  // `->middleware(…)` et `Route::middleware(…)`. Le `m` minuscule exclut
  // `->withoutMiddleware(…)`, qui RETIRE un middleware et ne doit pas compter.
  for (const m of fragment.matchAll(/(?:->|::)middleware\s*\(([^)]*)\)/g)) out.push(...chainesDe(m[1]));
  // Forme tableau : `Route::group(['middleware' => ['auth:sanctum', …], …], …)`.
  for (const m of fragment.matchAll(/'middleware'\s*=>\s*(\[[^\]]*\]|'[^']*')/g)) out.push(...chainesDe(m[1]));
  return out;
}

const VERBE = /Route::(get|post|put|patch|delete|options|any|match|resource|apiResource)\s*\(/;

/**
 * Analyse statique des fichiers de routes.
 *
 * ⚠ POURQUOI STATIQUE, et pas `php artisan route:list --json` — qui serait exact.
 * Le job `guards` de `repo-ci.yml` n'installe que Node : pas de PHP, pas de
 * `composer install`, pas de base. Les onze autres gardes de ce dossier tiennent la
 * même contrainte. Le prix est écrit dans « ce qu'elle ne vérifie pas ».
 *
 * L'analyseur a donc été CONFRONTÉ à la source autoritative une fois, le 2026-08-21,
 * plutôt que cru sur parole : `artisan route:list --json` compte 509 routes `api/*`
 * dont 465 authentifiées, l'analyse statique 504 et 458. L'écart est expliqué et il
 * est ici sans conséquence : il compte les DÉCLARATIONS, et deux `Route::apiResource`
 * (5 routes chacune) plus un `Route::match(['get','post'], …)` en valent une chacune.
 * Or une déclaration porte UN seul jeu de middlewares — c'est exactement l'unité que
 * cette garde compare. Les deux `cache.headers` que `route:list` connaît sont les
 * deux que l'analyse trouve, à l'identique.
 */
function analyseRoutes() {
  const routes = [];
  for (const fichier of fichiersPhp(ROUTES)) {
    const relatif = relative(ROOT, fichier);
    const lignes = denude(readFileSync(fichier, 'utf8')).split('\n');
    let tampon = '';
    let debutLigne = 0;
    let profondeur = 0;
    const pile = []; // { mw:[], profondeurFermeture }

    lignes.forEach((ligne, index) => {
      if (tampon === '') debutLigne = index + 1;
      tampon += ' ' + ligne;

      const ouvre = (ligne.match(/\{/g) || []).length;
      const ferme = (ligne.match(/\}/g) || []).length;
      profondeur += ouvre;

      const ouvertureGroupe = ouvre > 0 && /(?:->group\s*\(\s*function|Route::group\s*\()/.test(tampon);

      if (ouvertureGroupe) {
        pile.push({ mw: middlewaresDe(tampon), profondeurFermeture: profondeur - ouvre });
        tampon = '';
      } else if (/;\s*$/.test(ligne.trimEnd())) {
        if (VERBE.test(tampon)) {
          const heritees = pile.flatMap((g) => g.mw);
          routes.push({
            fichier: relatif,
            ligne: debutLigne,
            declaration: tampon.replace(/\s+/g, ' ').trim().slice(0, 160),
            middlewares: [...heritees, ...middlewaresDe(tampon)],
            cible: cibleDe(tampon),
          });
        }
        tampon = '';
      }

      profondeur -= ferme;
      while (pile.length > 0 && pile[pile.length - 1].profondeurFermeture >= profondeur) pile.pop();
    });
  }
  return routes;
}

/** `[FooController::class, 'bar']` ou `FooController::class` (invocable) → {classe, methode}. */
function cibleDe(fragment) {
  const paire = fragment.match(/\[\s*([A-Za-z0-9_]+)::class\s*,\s*'([^']+)'\s*\]/);
  if (paire) return { classe: paire[1], methode: paire[2] };
  const invocable = fragment.match(/,\s*([A-Za-z0-9_]+)::class\s*\)/);
  if (invocable) return { classe: invocable[1], methode: '__invoke' };
  return null;
}

/**
 * Les méthodes de contrôleur qui posent elles-mêmes un `Cache-Control` de cache
 * partagé. Rattachement par méthode : voir le contrôle B de l'en-tête.
 */
function emetteursControleurs() {
  const out = [];
  for (const fichier of fichiersPhp(CONTROLEURS)) {
    const code = denude(readFileSync(fichier, 'utf8'));
    if (!/Cache-Control/i.test(code)) continue;
    const classe = (fichier.split('/').pop() || '').replace(/\.php$/, '');
    const lignes = code.split('\n');
    let methode = null;
    lignes.forEach((ligne, index) => {
      const decl = ligne.match(/function\s+([A-Za-z0-9_]+)\s*\(/);
      if (decl) methode = decl[1];
      if (!/Cache-Control/i.test(ligne)) return;
      // La valeur est parfois sur la ligne suivante (`->header('Cache-Control',\n …)`).
      const portee = [ligne, lignes[index + 1] ?? ''].join(' ');
      if (!/\bpublic\b|s-maxage/i.test(portee)) return;
      out.push({
        fichier: relative(ROOT, fichier),
        ligne: index + 1,
        classe,
        methode: methode ?? '?',
        valeur: (portee.match(/'([^']*(?:public|s-maxage)[^']*)'/i) || [, portee.trim()])[1],
      });
    });
  }
  return out;
}

// ── Exécution ──────────────────────────────────────────────────────────────────

const routes = analyseRoutes();
const routesAuth = routes.filter((r) => r.middlewares.some(EST_AUTH));
const erreurs = [];

// A. `cache.headers:…public…` sur une route authentifiée.
const routesPartage = routes.filter((r) =>
  r.middlewares.some((mw) => {
    if (!/^(cache\.headers|.*SetCacheHeaders)[:;]/.test(mw)) return false;
    const options = mw.split(':').slice(1).join(':').split(';').map((o) => o.split('=')[0].trim());
    return options.some((o) => OPTIONS_PARTAGE.includes(o));
  }),
);
for (const r of routesPartage) {
  const auth = r.middlewares.filter(EST_AUTH);
  if (auth.length === 0) continue;
  erreurs.push(
    `${r.fichier}:${r.ligne} — route CACHEABLE PAR UN CACHE PARTAGÉ et AUTHENTIFIÉE.\n` +
      `      middlewares : ${r.middlewares.join(', ')}\n` +
      `      Un CDN ou un reverse proxy peut stocker la réponse d'un utilisateur et la\n` +
      `      resservir au suivant. Retirer \`public\`/\`s_maxage\` (un \`etag\` seul suffit à\n` +
      `      faire un 304 sans autoriser le partage), ou sortir la route de ${auth.join(', ')}.`,
  );
}

// B. En-tête posé dans le contrôleur, rattaché méthode par méthode.
const emetteurs = emetteursControleurs();
for (const e of emetteurs) {
  const concernees = routes.filter(
    (r) => r.cible && r.cible.classe === e.classe && r.cible.methode === e.methode && r.middlewares.some(EST_AUTH),
  );
  for (const r of concernees) {
    erreurs.push(
      `${e.fichier}:${e.ligne} — ${e.classe}::${e.methode}() pose « ${e.valeur} »,\n` +
        `      et ${r.fichier}:${r.ligne} la sert sous ${r.middlewares.filter(EST_AUTH).join(', ')}.\n` +
        `      Même défaut que le contrôle A, une couche plus bas : l'en-tête est écrit à la\n` +
        `      main, donc AUCUNE lecture du fichier de routes ne peut le voir.`,
    );
  }
}

// C. Non-vacuité — la garde doit rougir quand elle cesse de comprendre sa cible.
if (routes.length < MIN_ROUTES) {
  erreurs.push(
    `NON-VACUITÉ — ${routes.length} routes analysées sous ${relative(ROOT, ROUTES)}, seuil ${MIN_ROUTES}.\n` +
      `      L'analyseur ne comprend plus les fichiers de routes (forme nouvelle, dossier\n` +
      `      déplacé, macro). Il rendrait « aucun défaut » sans avoir rien lu.`,
  );
}
if (routesAuth.length < MIN_ROUTES_AUTH) {
  erreurs.push(
    `NON-VACUITÉ — ${routesAuth.length} routes authentifiées reconnues, seuil ${MIN_ROUTES_AUTH}.\n` +
      `      C'est la moitié de la comparaison : sans elle, la garde ne peut plus rien refuser.`,
  );
}
if (routesPartage.length + emetteurs.length < MIN_EMETTEURS) {
  erreurs.push(
    `NON-VACUITÉ — plus AUCUN émetteur de cache partagé trouvé, ni par middleware ni en\n` +
      `      contrôleur. L'autre moitié de la comparaison a disparu : soit le dépôt a cessé\n` +
      `      d'émettre \`Cache-Control: public\` (à écrire ici), soit la garde ne le voit plus.`,
  );
}

if (REPORT) {
  console.log(`cache partagé × authentification — ${routes.length} routes analysées, dont ${routesAuth.length} authentifiées :`);
  for (const r of routesPartage) {
    console.log(`  · ${r.fichier}:${r.ligne} — middleware ${r.middlewares.filter((m) => m.startsWith('cache.headers')).join(', ')}`);
  }
  for (const e of emetteurs) {
    const servies = routes.filter((r) => r.cible && r.cible.classe === e.classe && r.cible.methode === e.methode);
    console.log(`  · ${e.fichier}:${e.ligne} — ${e.classe}::${e.methode}() → « ${e.valeur} » (${servies.length} route(s))`);
  }
  console.log(`  portée : la garde refuse le COUPLE (cache partagé, authentification). Elle ne`);
  console.log(`           dit pas qu'une réponse \`public\` non authentifiée est sûre — la fiche`);
  console.log(`           publique varie avec un porteur Bearer SANS porter \`auth:\` (TCK-179),`);
  console.log(`           et cela se prouve par un test qui compare deux corps, pas ici.`);
}

if (erreurs.length > 0) {
  console.error(`✗ cache partagé × authentification — ${erreurs.length} défaut(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(
  `✓ cache partagé × authentification : ${routes.length} routes, ${routesAuth.length} authentifiées, ` +
    `${routesPartage.length + emetteurs.length} émetteur(s) de cache partagé, aucun recouvrement`,
);
