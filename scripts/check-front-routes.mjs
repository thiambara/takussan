#!/usr/bin/env node
/**
 * Garde des APPELS DU FRONT face aux ROUTES DE L'API (TCK-998, P45.01).
 *
 * Un appel du front vers une route qui n'existe pas ne casse ni `tsc`, ni ESLint, ni le build :
 * il rend un 404 ou un 405 à l'exécution, que l'écran avale souvent en liste vide. Quatre routes
 * absentes ont ainsi vécu dans le code (angles 6 et 13 du fichier de pistes) : `PATCH
 * /api/users/me` (TCK-655), `generate-schedule`, les pièces jointes de la messagerie, les
 * documents de la fiche client. Chacune a été corrigée avec un test propre à SON fichier ;
 * aucune garde ne tenait la famille.
 *
 * ── CE QU'ELLE CONFRONTE ───────────────────────────────────────────────────────
 *
 * D'un côté, `php artisan route:list --json`, lancé par la garde depuis `takussan-api/`, sans
 * base, sans Redis, sans Meilisearch (aucun ne sert à lister les routes, mesuré le 2026-10-19 :
 * 687 routes en 1 s) ; et les route handlers de `takussan-web/src/app/api` (le BFF), lus sur le
 * disque. De l'autre, les appels de `takussan-web/src` (hors tests) : tout littéral `/api/…`, et
 * le premier argument des fonctions qui ajoutent `/api` elles-mêmes.
 *
 * Les quatre difficultés relevées par l'angle 45, et ce que la garde en fait :
 *
 *   1. Les relais à joker (`[...path]`) cachent l'amont : un balayage naïf déclarerait juste tout
 *      `/api/super-admin/*`. La table `RELAIS` dit vers quel préfixe de l'API chacun relaie ; le
 *      reste du chemin est confronté à `route:list`. Un relais `[...path]` absent de la table, ou
 *      dont le source ne relaie plus vers le préfixe écrit, fait ÉCHOUER la garde.
 *   2. `apiFetch` (et `urlApiPublique`, `urlApiServeur`, `relayerVersApi`) ajoutent `/api` ;
 *      `apiRequest` et `useApiQuery` non. Le chemin se reconstruit selon l'appelant : un
 *      `apiRequest('/leases')` sans préfixe est cherché tel quel, et ne trouve rien.
 *   3. Les segments passés en variable (`${id}`, `${action}`) valent n'importe quel segment ; un
 *      chemin dont le PREMIER segment est variable (`/api/${chemin}`) n'est pas vérifiable et
 *      n'est que compté.
 *   4. Un même littéral `/api/me/…` vise le BFF depuis un `fetch` relatif, Laravel depuis
 *      `apiRequest`. La cible se déduit de l'appelant : `fetch('/api/…')` et `redirect('/api/…')`
 *      ne valent que par un route handler (ou un relais) ; `apiRequest`, `useApiQuery`,
 *      `apiFetch` que par une route de l'API ; un littéral hors de ces appels, par l'un ou l'autre.
 *
 * Le verbe : `method: 'PATCH'` dans l'appel, ou un argument littéral `'POST'` (les enveloppes
 * `ecrire(chemin, 'POST', corps)`), sinon GET pour `fetch`, `apiRequest`, `apiFetch` et
 * `useApiQuery`. Un `method` passé en variable n'est pas jugé. Un POST porté par un fichier qui
 * écrit `_method` vaut aussi PUT, PATCH ou DELETE (l'usurpation de verbe de Laravel).
 *
 * ── CE QU'ELLE NE PROUVE PAS ───────────────────────────────────────────────────
 *
 *   - Qu'un segment variable a la bonne valeur : `${action}` vaut tout segment, donc une union
 *     `'approve' | 'reject'` dont un membre n'a pas de route passe.
 *   - Qu'un chemin construit hors d'un littéral (concaténation, chemin rendu par une fonction)
 *     existe : seuls les littéraux sont lus.
 *   - Le corps, les paramètres de requête, les `fields[…]`, ni les droits : un chemin juste peut
 *     rendre 403 ou 422.
 *   - La lecture du source n'est pas un analyseur TypeScript : une expression régulière qui
 *     contiendrait une apostrophe peut masquer une ligne. Le plancher `MIN_APPELS` rougit si le
 *     balayage cesse de voir les appels.
 *
 * ⚠ PHP est EXIGÉ. Sans `php` ou sans `takussan-api/vendor/`, la garde ÉCHOUE et le dit : un vert
 * qui n'a confronté aucune route ne garde rien. En local : `composer install` dans `takussan-api/`.
 * En CI : le job `guards` de `repo-ci.yml` installe PHP et les dépendances pour elle.
 *
 * Preuve de non-vacuité (TCK-998) : réintroduire `PATCH /api/users/me` dans
 * `src/app/actions/locale.ts` fait rougir la garde, qui nomme le fichier, la ligne et le verbe.
 *
 * Usage :  node scripts/check-front-routes.mjs [--report]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'takussan-api');
const WEB = join(ROOT, 'takussan-web');
const SRC = join(WEB, 'src');
const BFF = join(SRC, 'app', 'api');
const REPORT = process.argv.includes('--report');

/**
 * Les relais à joker du BFF : le dossier sous `src/app/api` → le préfixe de l'API vers lequel il
 * relaie (sans `api/`). Chaque entrée est confrontée au source du handler.
 */
const RELAIS = {
  'admin-users': 'users',
  agencies: 'agencies',
  announcements: 'announcements',
  'impersonation/proxy': '',
  'super-admin': 'admin',
  'super-admin-properties': 'properties',
};

/**
 * Les appels que la garde ne sait pas juger, un par un, avec leur raison. Clé :
 * `<fichier relatif à takussan-web> <VERBE> <chemin normalisé>` (`{}` pour un segment variable).
 * Une exception qui ne correspond plus à aucun écart fait rougir la garde.
 */
const EXCEPTIONS = {
  // La BASE du relais d'impersonation, à laquelle `cheminParLeRelais()` colle le chemin d'API : une
  // constante, pas un appel. Le relais `[...path]` exige au moins un segment, et ce qui s'y colle
  // est jugé comme tout appel de l'API.
  'src/lib/impersonation.ts ? /api/impersonation/proxy': 'base du relais, jamais appelée nue',
};

const MIN_ROUTES_API = 300;
const MIN_APPELS = 300;

const VERBES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const AJOUTENT_API = new Set(['apiFetch', 'urlApiPublique', 'urlApiServeur', 'relayerVersApi']);
const VERS_LARAVEL = new Set(['apiRequest', 'useApiQuery', ...AJOUTENT_API]);
const VERS_BFF = new Set(['fetch', 'redirect']);
const GET_PAR_DEFAUT = new Set(['fetch', 'apiRequest', 'apiFetch', 'useApiQuery']);

const erreurs = [];
const notes = [];

// ── Les routes de l'API ────────────────────────────────────────────────────────────────────
function routesDeLApi() {
  if (!existsSync(join(API, 'vendor', 'autoload.php'))) {
    throw new Error(
      "takussan-api/vendor/ est absent : `composer install` dans takussan-api/ avant cette garde.\n" +
        '  Elle ne passe jamais au vert sans avoir lu les routes.',
    );
  }
  let brut;
  try {
    brut = execFileSync('php', ['artisan', 'route:list', '--json'], {
      cwd: API,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // Ni base, ni Redis, ni Meilisearch : lister les routes n'en lit aucun.
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const cause = e.code === 'ENOENT' ? '`php` est introuvable dans le PATH' : (e.stderr || e.message).toString().trim().slice(0, 600);
    throw new Error(`php artisan route:list --json a échoué : ${cause}`);
  }
  let liste;
  try {
    liste = JSON.parse(brut);
  } catch {
    throw new Error(`route:list --json n'a pas rendu du JSON : « ${brut.slice(0, 200)} »`);
  }
  const routes = [];
  for (const r of liste) {
    const methodes = new Set(r.method.split('|').filter((m) => VERBES.includes(m)));
    // `{x?}` : un paramètre optionnel vaut deux formes.
    let formes = [[]];
    for (const seg of r.uri.split('/').filter(Boolean)) {
      const optionnel = /^\{[^}]+\?\}$/.test(seg);
      const motif = /^\{[^}]+\}$/.test(seg) ? '{}' : seg;
      formes = formes.flatMap((f) => (optionnel ? [f, [...f, motif]] : [[...f, motif]]));
    }
    for (const segs of formes) routes.push({ segs, methodes, uri: r.uri });
  }
  if (routes.filter((r) => r.segs[0] === 'api').length < MIN_ROUTES_API) {
    throw new Error(`route:list ne rend que ${routes.length} routes : moins que le plancher de ${MIN_ROUTES_API} routes api/*`);
  }
  return routes;
}

// ── Les route handlers du BFF ──────────────────────────────────────────────────────────────
function* fichiers(dossier, filtre) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom !== '__tests__' && nom !== 'node_modules') yield* fichiers(chemin, filtre);
    } else if (filtre(nom)) yield chemin;
  }
}

function handlersDuBff() {
  const handlers = [];
  for (const f of fichiers(BFF, (n) => n === 'route.ts')) {
    const dossier = relative(BFF, dirname(f)).split(sep).filter((s) => s && !/^\(.*\)$/.test(s));
    const source = readFileSync(f, 'utf8');
    const methodes = new Set(
      [...source.matchAll(/^export (?:async function|const|function) (GET|POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]),
    );
    const segs = [];
    let joker = null;
    for (const s of dossier) {
      if (/^\[\[\.\.\..+\]\]$/.test(s)) joker = 'optionnel';
      else if (/^\[\.\.\..+\]$/.test(s)) joker = 'requis';
      else segs.push(/^\[.+\]$/.test(s) ? '{}' : s);
    }
    const h = { fichier: relative(WEB, f), segs, joker, methodes };
    if (joker) {
      const cle = segs.join('/');
      if (!(cle in RELAIS)) {
        erreurs.push(
          `${h.fichier} : relais à joker « /api/${cle}/… » absent de RELAIS (scripts/check-front-routes.mjs) —\n` +
            '      dire vers quel préfixe de l\'API il relaie, sans quoi ses appels ne sont confrontés à rien.',
        );
      } else {
        const amont = RELAIS[cle];
        const attendu = amont === '' ? /relayerVersApi\(\s*request,\s*`\/\$\{/ : new RegExp(`relayerVersApi\\(\\s*request,\\s*\`/${amont.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/$]`);
        if (!attendu.test(source)) {
          erreurs.push(`${h.fichier} : RELAIS le dit relayer vers « api/${amont} », son source ne le fait plus — corriger la table.`);
        }
        h.amont = amont;
      }
    }
    handlers.push(h);
  }
  for (const cle of Object.keys(RELAIS)) {
    if (!handlers.some((h) => h.joker && h.segs.join('/') === cle)) erreurs.push(`RELAIS : « ${cle} » ne correspond plus à aucun relais à joker du BFF.`);
  }
  return handlers;
}

// ── La lecture du source ───────────────────────────────────────────────────────────────────
/**
 * Un lexique minimal : chaînes, gabarits (et leurs `${…}`), commentaires, expressions
 * régulières, parenthèses. Rend chaque littéral avec l'appel qui l'englobe. Une chaîne `'` ou `"`
 * ne traverse pas une ligne : une apostrophe de texte JSX n'avale pas le fichier.
 */
function lire(source) {
  const litteraux = [];
  const appels = [];
  const pile = [];
  const modes = [{ type: 'code', profondeur: 0 }];
  let dernier = '';
  let i = 0;
  const n = source.length;
  const ligneDe = (pos) => source.slice(0, pos).split('\n').length;
  const ouvrir = (pos) => {
    const avant = source.slice(Math.max(0, pos - 80), pos);
    const m = avant.match(/([A-Za-z_$][\w$]*)\s*(?:<[^()<>]*>)?\s*$/);
    const appel = { appelant: m ? m[1] : '', debut: pos, fin: n, virgules: 0, positions: [], imbrication: 0 };
    appels.push(appel);
    pile.push(appel);
  };
  const emettre = (debut, fin, valeur) => {
    const haut = pile.at(-1);
    litteraux.push({ debut, fin, valeur, ligne: ligneDe(debut), appel: haut ?? null, argument: haut ? haut.virgules : -1 });
  };
  const lireChaine = (q) => {
    let j = i + 1;
    let valeur = '';
    while (j < n && source[j] !== q) {
      if (source[j] === '\n') return null;
      if (source[j] === '\\') {
        valeur += source[j + 1];
        j += 2;
        continue;
      }
      valeur += source[j++];
    }
    return { fin: j + 1, valeur };
  };
  // Les gabarits s'imbriquent : on accumule la valeur du gabarit courant, `\0` par `${…}`.
  const gabarits = [];
  while (i < n) {
    const mode = modes.at(-1);
    const c = source[i];
    if (mode.type === 'gabarit') {
      const g = gabarits.at(-1);
      if (c === '\\') {
        g.valeur += source[i + 1];
        i += 2;
      } else if (c === '`') {
        modes.pop();
        gabarits.pop();
        emettre(g.debut, i + 1, g.valeur);
        i++;
        dernier = 'x';
      } else if (c === '$' && source[i + 1] === '{') {
        g.valeur += '\0';
        modes.push({ type: 'code', profondeur: 0, gabarit: true });
        i += 2;
        dernier = '{';
      } else {
        g.valeur += c;
        i++;
      }
      continue;
    }
    // Mode code.
    if (c === '/' && source[i + 1] === '/') {
      const fin = source.indexOf('\n', i);
      i = fin < 0 ? n : fin;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const fin = source.indexOf('*/', i + 2);
      i = fin < 0 ? n : fin + 2;
      continue;
    }
    if (c === '/' && (dernier === '' || '(,=:[!&|?{};+-*%<>~^'.includes(dernier) || /(?:return|typeof|case)\s*$/.test(source.slice(Math.max(0, i - 8), i)))) {
      // Une expression régulière : jusqu'au `/` qui la ferme, hors classe, sans traverser de ligne.
      let j = i + 1;
      let classe = false;
      while (j < n && source[j] !== '\n') {
        if (source[j] === '\\') j += 2;
        else if (source[j] === '[') (classe = true), j++;
        else if (source[j] === ']') (classe = false), j++;
        else if (source[j] === '/' && !classe) break;
        else j++;
      }
      if (j < n && source[j] === '/') {
        i = j + 1;
        dernier = 'x';
        continue;
      }
      i++;
      dernier = '/';
      continue;
    }
    if (c === "'" || c === '"') {
      const r = lireChaine(c);
      if (r === null) {
        i++;
        continue;
      }
      emettre(i, r.fin, r.valeur);
      i = r.fin;
      dernier = 'x';
      continue;
    }
    if (c === '`') {
      gabarits.push({ debut: i, valeur: '' });
      modes.push({ type: 'gabarit' });
      i++;
      continue;
    }
    if (c === '{') {
      mode.profondeur++;
      if (pile.length) pile.at(-1).imbrication++;
    } else if (c === '}') {
      if (mode.gabarit && mode.profondeur === 0) {
        modes.pop();
        i++;
        continue;
      }
      mode.profondeur--;
      if (pile.length) pile.at(-1).imbrication--;
    } else if (c === '[') {
      if (pile.length) pile.at(-1).imbrication++;
    } else if (c === ']') {
      if (pile.length) pile.at(-1).imbrication--;
    } else if (c === '(') {
      ouvrir(i);
    } else if (c === ')') {
      const a = pile.pop();
      if (a) a.fin = i;
    } else if (c === ',') {
      if (pile.length && pile.at(-1).imbrication === 0) {
        pile.at(-1).virgules++;
        pile.at(-1).positions.push(i);
      }
    }
    if (!/\s/.test(c)) dernier = /[\w$)\]]/.test(c) ? 'x' : c;
    i++;
  }
  return { litteraux, appels };
}

// ── Le jugement ────────────────────────────────────────────────────────────────────────────
/** Un chemin en segments : `{}` pour un segment variable ; `null` si rien n'est vérifiable. */
function segmentsDe(valeur) {
  let chemin = valeur;
  const q = chemin.indexOf('?');
  if (q >= 0) chemin = chemin.slice(0, q);
  chemin = chemin.replace(/#.*$/, '');
  const segs = chemin.split('/').filter(Boolean);
  // Un `${…}` collé à la fin du dernier segment est un suffixe (requête, `/${chemin}`) : on le retire.
  if (segs.length && /^[^\0]+\0$/.test(segs.at(-1))) segs[segs.length - 1] = segs.at(-1).slice(0, -1);
  return segs.map((s) => (s.includes('\0') ? '{}' : s));
}

function correspond(front, route) {
  if (front.length !== route.length) return false;
  return front.every((s, k) => s === '{}' || route[k] === '{}' || s === route[k]);
}

/** Les routes de l'API qui servent ce chemin ; un `{}` final peut valoir plusieurs segments. */
function routesQuiServent(routes, segs) {
  const exactes = routes.filter((r) => correspond(segs, r.segs));
  if (exactes.length || segs.at(-1) !== '{}') return exactes;
  const tete = segs.slice(0, -1);
  return routes.filter((r) => r.segs.length > segs.length && correspond(tete, r.segs.slice(0, tete.length)));
}

function cibleBff(handlers, routes, segs) {
  // segs commence par `api`.
  const reste = segs.slice(1);
  const cibles = [];
  for (const h of handlers) {
    if (!h.joker) {
      if (correspond(reste, h.segs)) cibles.push({ methodes: h.methodes, quoi: h.fichier });
      continue;
    }
    if (reste.length < h.segs.length || !correspond(reste.slice(0, h.segs.length), h.segs)) continue;
    const suite = reste.slice(h.segs.length);
    if (suite.length === 0 && h.joker === 'requis') continue;
    if (h.amont === undefined) continue;
    const amont = ['api', ...h.amont.split('/').filter(Boolean), ...suite];
    for (const r of routesQuiServent(routes, amont)) {
      cibles.push({ methodes: new Set([...r.methodes].filter((m) => h.methodes.has(m))), quoi: `${h.fichier} → ${r.uri}` });
    }
  }
  return cibles;
}

function verbeDe(source, litteral) {
  const a = litteral.appel;
  if (!a) return { verbe: null };
  const corps = source.slice(a.debut, a.fin);
  const m = corps.match(/\bmethod\s*:\s*['"`]([A-Za-z]+)['"`]/);
  if (m) return { verbe: m[1].toUpperCase() };
  if (/\bmethod\s*[:,}]/.test(corps)) return { verbe: null };
  const nu = corps.match(/['"`](GET|POST|PUT|PATCH|DELETE)['"`]/);
  if (nu) return { verbe: nu[1] };
  if (!GET_PAR_DEFAUT.has(a.appelant)) return { verbe: null };
  // Sans `method` écrit : GET si l'appel n'a pas d'options, ou des options littérales sans
  // `method`. Des options rendues par une fonction (`post(corps)`) ou une variable ne se jugent pas.
  if (a.positions.length === 0) return { verbe: 'GET' };
  const options = source.slice(a.positions[0] + 1, a.fin).trimStart();
  return { verbe: options.startsWith('{') ? 'GET' : null };
}

const routes = (() => {
  try {
    return routesDeLApi();
  } catch (e) {
    console.error(`✗ appels du front ↔ routes de l'API : ${e.message}`);
    process.exit(1);
  }
})();
const handlers = handlersDuBff();

let juges = 0;
let invérifiables = 0;
const ecarts = new Map();
for (const f of fichiers(SRC, (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) && !/\.d\.ts$/.test(n))) {
  const source = readFileSync(f, 'utf8');
  const fichier = relative(WEB, f);
  const usurpe = source.includes('_method');
  const { litteraux } = lire(source);
  for (const l of litteraux) {
    const appelant = l.appel?.appelant ?? '';
    let valeur = l.valeur;
    let cible = 'les deux';
    const argumentDuChemin = appelant === 'relayerVersApi' ? 1 : 0;
    if (AJOUTENT_API.has(appelant) && l.argument === argumentDuChemin && /^\/[\w\0]/.test(valeur)) {
      // Ces fonctions ajoutent `/api` elles-mêmes : `apiFetch('/api/x')` vise `/api/api/x`.
      valeur = `/api${valeur}`;
      cible = 'laravel';
    } else if (/^\0\/api\//.test(valeur)) {
      // `${apiUrl()}/api/…` : une URL absolue de l'API.
      valeur = valeur.slice(1);
      cible = 'laravel';
    } else if (valeur === '/api' || valeur.startsWith('/api/')) {
      if (VERS_BFF.has(appelant)) cible = 'bff';
      else if (VERS_LARAVEL.has(appelant)) cible = 'laravel';
    } else if ((appelant === 'apiRequest' || appelant === 'useApiQuery') && l.argument === 0 && /^\/[a-z]/.test(valeur)) {
      cible = 'laravel';
    } else continue;

    const segs = segmentsDe(valeur);
    if (segs.length < 2 && segs[0] === 'api') continue;
    if (segs[0] === 'api' && segs[1] === '{}') {
      invérifiables++;
      continue;
    }
    const { verbe } = verbeDe(source, l);
    const cibles = [];
    if (cible !== 'bff') for (const r of routesQuiServent(routes, segs)) cibles.push({ methodes: r.methodes, quoi: r.uri });
    if (cible !== 'laravel' && segs[0] === 'api') cibles.push(...cibleBff(handlers, routes, segs));
    juges++;
    const chemin = '/' + segs.join('/');
    let ecart = null;
    if (!cibles.length) {
      ecart = `aucune ${cible === 'bff' ? 'route du BFF (route handler ou relais)' : cible === 'laravel' ? "route de l'API" : "route de l'API ni du BFF"}`;
    } else if (verbe && !cibles.some((c) => c.methodes.has(verbe))) {
      const usurpable = verbe === 'POST' && usurpe && cibles.some((c) => ['PUT', 'PATCH', 'DELETE'].some((m) => c.methodes.has(m)));
      if (!usurpable) {
        const offerts = [...new Set(cibles.flatMap((c) => [...c.methodes]))].join(', ') || 'aucun verbe';
        ecart = `${verbe} non servi (${offerts} : ${cibles.map((c) => c.quoi).slice(0, 3).join(' ; ')})`;
      }
    }
    if (!ecart) continue;
    const cle = `${fichier} ${verbe ?? '?'} ${chemin}`;
    if (!ecarts.has(cle)) ecarts.set(cle, { ligne: l.ligne, ecart });
  }
}

const exceptionsVues = new Set();
for (const [cle, { ligne, ecart }] of ecarts) {
  if (cle in EXCEPTIONS) {
    exceptionsVues.add(cle);
    continue;
  }
  const [fichier, verbe, chemin] = cle.split(' ');
  erreurs.push(`takussan-web/${fichier}:${ligne} ${verbe === '?' ? '' : verbe + ' '}${chemin} — ${ecart}`);
}
for (const cle of Object.keys(EXCEPTIONS)) {
  if (!exceptionsVues.has(cle)) erreurs.push(`EXCEPTIONS : « ${cle} » ne correspond plus à aucun écart — la retirer.`);
}
if (juges < MIN_APPELS) {
  erreurs.push(`${juges} appels jugés seulement, sous le plancher de ${MIN_APPELS} : le balayage ne voit plus les appels du front.`);
}

if (REPORT) {
  notes.push(`${routes.length} formes de routes de l'API (route:list), ${handlers.length} route handlers du BFF dont ${Object.keys(RELAIS).length} relais à joker`);
  notes.push(`${juges} appels jugés, ${invérifiables} au premier segment variable (non vérifiables), ${Object.keys(EXCEPTIONS).length} exception(s)`);
  for (const n of notes) console.log(n);
}
if (erreurs.length) {
  console.error(`✗ appels du front ↔ routes de l'API — ${erreurs.length} écart(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}
console.log(`✓ appels du front ↔ routes de l'API : ${juges} appels de takussan-web/src ont tous leur route, verbe compris.`);
