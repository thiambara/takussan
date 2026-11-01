#!/usr/bin/env node
/**
 * Garde des GABARITS d'environnement de production (TCK-2456).
 *
 * `deploy/takussan/env.api.production.example` et `env.web.production.example` sont ce qu'on recopie
 * dans l'onglet Environment de Dokploy. `check-env-parity` compare `.env.example` et `.env.docker`
 * entre eux ; `check-webhook-env-keys` ne regarde que les webhooks. Rien ne disait qu'un gabarit
 * couvre ce que le code lit, ni qu'une clé laissée hors de Dokploy l'est délibérément : une clé
 * oubliée y garde le défaut de `config/`, sans erreur, et le défaut de `config/` n'est pas celui de
 * la production (`APP_NAME=Laravel`, `LOG_LEVEL=debug`, `DB_CONNECTION=sqlite`…).
 *
 * Elle exige :
 *   1. chaque clé d'un gabarit existe dans le `.env.example` de son application ;
 *   2. chaque clé d'un `.env.example` est dans le gabarit, ou dans la liste des résidus ci-dessous,
 *      qui porte son motif ;
 *   3. chaque clé que le CODE lit est dans `.env.example` ou les résidus : le troisième sommet, qui
 *      ferme « une clé absente des deux est en parité parfaite » ;
 *   4. un résidu est encore lu ou déclaré quelque part, et n'est pas dans le gabarit ;
 *   5. aucune valeur de gabarit ne ressemble à un secret, et une clé de secret y est vide ;
 *   6. `APP_DEBUG` et `OTP_PREVIEW_ENABLED` valent `false`, `APP_ENV` `production` ;
 *      `REDIS_HOST` et `REDIS_PORT` en sont absentes (écrites par `compose.api.yml`) ;
 *   7. mêmes sections, même ordre, chaque clé sous la même section dans tous les fichiers.
 *
 * Elle ne prouve PAS qu'une ligne vide n'écrase pas un défaut de `config/` : il faut PHP, et c'est
 * `deploy/takussan/comparer-config-env.php`. Ni que Dokploy porte ce que dit le gabarit : c'est
 * hors dépôt. Les clés que seul le `vendor/` lit (configuration de base du cadriciel, `laravel/ai`,
 * `spatie/laravel-pdf`) lui échappent aussi : la CI de ce job ne les lit pas ; elles sont à leur
 * défaut, et le rapport de TCK-2456 les nomme par famille.
 *
 * Usage :
 *   node scripts/check-env-production.mjs            # sort en 1 au moindre écart
 *   node scripts/check-env-production.mjs --report   # + les clés requises encore vides dans les gabarits
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clefsDeclarees } from './lib/env-keys.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(ROOT, 'takussan-api');
const WEB = join(ROOT, 'takussan-web');
const REPORT = process.argv.includes('--report');

/**
 * Les résidus de l'API : lues par `config/` ou déclarées dans `.env.example`, et délibérément absentes
 * de Dokploy. Avant d'en ajouter une : grep son usage, la clé d'un pilote actif n'est pas un résidu.
 */
const RESIDUS = [
  {
    motif: 'pilote de diffusion non utilisé : BROADCAST_CONNECTION=log, aucun canal temps réel',
    cles: [
      'ABLY_KEY', 'PUSHER_APP_CLUSTER', 'PUSHER_APP_ID', 'PUSHER_APP_KEY', 'PUSHER_APP_SECRET', 'PUSHER_HOST',
      'PUSHER_PORT', 'PUSHER_SCHEME', 'REVERB_APP_ID', 'REVERB_APP_KEY', 'REVERB_APP_SECRET', 'REVERB_HOST',
      'REVERB_PORT', 'REVERB_SCHEME',
    ],
  },
  {
    motif: 'moteur de recherche non utilisé : Meilisearch seul (SCOUT_DRIVER=meilisearch)',
    cles: [
      'ALGOLIA_APP_ID', 'ALGOLIA_SECRET', 'TYPESENSE_API_KEY', 'TYPESENSE_CONNECTION_TIMEOUT_SECONDS',
      'TYPESENSE_HEALTHCHECK_INTERVAL_SECONDS', 'TYPESENSE_HOST', 'TYPESENSE_IMPORT_ACTION', 'TYPESENSE_NUM_RETRIES', 'TYPESENSE_PATH', 'TYPESENSE_PORT', 'TYPESENSE_PROTOCOL',
      'TYPESENSE_RETRY_INTERVAL_SECONDS',
    ],
  },
  {
    motif: 'pilote de cache ou de file non utilisé : CACHE_STORE=redis, QUEUE_CONNECTION=database',
    cles: [
      'MEMCACHED_HOST', 'MEMCACHED_PASSWORD', 'MEMCACHED_PERSISTENT_ID', 'MEMCACHED_PORT', 'MEMCACHED_USERNAME',
      'DYNAMODB_CACHE_TABLE', 'DYNAMODB_ENDPOINT', 'SQS_PREFIX', 'SQS_QUEUE', 'SQS_SUFFIX', 'BEANSTALKD_QUEUE',
      'BEANSTALKD_QUEUE_HOST', 'BEANSTALKD_QUEUE_RETRY_AFTER', 'REDIS_QUEUE', 'REDIS_QUEUE_CONNECTION',
      'REDIS_QUEUE_RETRY_AFTER',
    ],
  },
  {
    motif: "disque S3 générique et comptes AWS non utilisés : les médias vont sur les disques R2 (ADR-0029)",
    cles: [
      'AWS_ACCESS_KEY_ID', 'AWS_BUCKET', 'AWS_DEFAULT_REGION', 'AWS_ENDPOINT', 'AWS_SECRET_ACCESS_KEY', 'AWS_URL',
      'AWS_USE_PATH_STYLE_ENDPOINT', 'ENABLE_MEDIA_LIBRARY_VAPOR_UPLOADS',
    ],
  },
  {
    motif: "canal de journaux non utilisé : LOG_CHANNEL=stderr, aucun collecteur (P14.08)",
    cles: [
      'LOG_DAILY_DAYS', 'LOG_PAPERTRAIL_HANDLER', 'LOG_SLACK_EMOJI', 'LOG_SLACK_USERNAME', 'LOG_SLACK_WEBHOOK_URL',
      'LOG_SYSLOG_FACILITY', 'PAPERTRAIL_PORT', 'PAPERTRAIL_URL', 'SLACK_BOT_USER_DEFAULT_CHANNEL',
      'SLACK_BOT_USER_OAUTH_TOKEN',
    ],
  },
  {
    motif: 'à laisser absentes : LOG_STDERR_FORMATTER vide ferait résoudre une classe vide au premier journal ; LOG_EXCEPTIONS_STREAM ne sert qu\'à phpunit.xml',
    cles: ['LOG_STDERR_FORMATTER', 'LOG_EXCEPTIONS_STREAM'],
  },
  {
    motif: 'transport de courriel du développement ou non utilisé : la production passe par Resend (MAIL_MAILER=resend)',
    cles: [
      'MAIL_EHLO_DOMAIN', 'MAIL_HOST', 'MAIL_PASSWORD', 'MAIL_PORT', 'MAIL_SCHEME', 'MAIL_SENDMAIL_PATH', 'MAIL_URL',
      'MAIL_USERNAME', 'POSTMARK_API_KEY',
    ],
  },
  {
    motif: "paramètre d'un moteur retiré (ADR-0020) ou défaut propre à chaque connexion : DB_CHARSET vaut utf8mb4 ou utf8 selon elle, et la poser casserait pgsql",
    cles: [
      'DB_CHARSET', 'DB_COLLATION', 'DB_FOREIGN_KEYS', 'DB_SOCKET', 'MYSQL_ATTR_SSL_CA',
    ],
  },
  {
    motif: "plomberie : un nom de table, de classe ou de connexion que rien ne change, ou une forme de configuration qu'on n'emploie pas (DB_URL, REDIS_URL l'emporteraient sur les clés du gabarit)",
    cles: [
      'AUTH_GUARD', 'AUTH_MODEL', 'AUTH_PASSWORD_BROKER', 'AUTH_PASSWORD_RESET_TOKEN_TABLE', 'AUTH_PASSWORD_TIMEOUT',
      'DB_CACHE_CONNECTION', 'DB_CACHE_LOCK_CONNECTION', 'DB_CACHE_LOCK_TABLE', 'DB_CACHE_TABLE', 'DB_QUEUE',
      'DB_QUEUE_CONNECTION', 'DB_QUEUE_TABLE', 'DB_URL', 'REDIS_BACKOFF_ALGORITHM', 'REDIS_BACKOFF_BASE',
      'REDIS_BACKOFF_CAP', 'REDIS_CACHE_CONNECTION', 'REDIS_CACHE_LOCK_CONNECTION', 'REDIS_CLUSTER',
      'REDIS_MAX_RETRIES', 'REDIS_URL', 'REDIS_USERNAME', 'SESSION_CONNECTION', 'SESSION_STORE', 'SESSION_TABLE',
    ],
  },
  {
    motif: 'écrites par deploy/takussan/compose.api.yml, qui l\'emporte sur l\'onglet : un fait de la pile (TCK-880)',
    cles: ['REDIS_HOST', 'REDIS_PORT'],
  },
  {
    motif: "ni l'API ni l'image ne les lisent à l'exécution de cet environnement : `artisan serve` et Vite du développement ; BUILD_SHA posée par l'image ; SEEDER_CLASS et APP_ROOT passées à l'appel d'un script",
    cles: ['PHP_CLI_SERVER_WORKERS', 'VITE_APP_NAME', 'BUILD_SHA', 'SEEDER_CLASS', 'APP_ROOT'],
  },
];

/** Ce que le front lit et que l'image pose elle-même (takussan-web/Dockerfile) : jamais dans l'onglet. */
const RESIDUS_FRONT = ['NODE_ENV', 'BUILD_SHA'];

/** Les clés qu'un gabarit ne doit jamais porter : le service les écrit lui-même. */
const INTERDITES_API = ['REDIS_HOST', 'REDIS_PORT'];

/** Les valeurs dont dépend la sécurité de la production. */
const VALEURS_IMPOSEES_API = { APP_ENV: 'production', APP_DEBUG: 'false', OTP_PREVIEW_ENABLED: 'false' };

const CLE_DE_SECRET = /(?:^|_)(?:KEY|KEYS|KEY_ID|SECRET|PASSWORD|TOKEN|ACCOUNT_ID)$/;
const FORME_DE_SECRET = /^(?:base64:|sk-|re_|rk_|ghp_|xox[a-z]-|AKIA|EAA)/;
const JETON_LONG = /(?:^|[^A-Za-z0-9+_=-])[A-Za-z0-9+_-]{32,}={0,2}(?:$|[^A-Za-z0-9+_=-])/;

/** @returns {string|null} pourquoi cette ligne de gabarit porte un secret */
export function secretDansLaLigne(cle, valeur) {
  if (valeur === '') return null;
  if (CLE_DE_SECRET.test(cle)) return 'une clé de secret reste vide dans un gabarit';
  if (FORME_DE_SECRET.test(valeur)) return 'la valeur a la forme d\'un secret';
  if (/^[a-z]+:\/\/[^/@\s]+:[^/@\s]+@/i.test(valeur)) return "l'URL porte des identifiants";
  const sansUrl = /^https?:\/\//i.test(valeur) ? '' : valeur;
  if (JETON_LONG.test(sansUrl)) return 'la valeur a la longueur d\'un jeton';
  return null;
}

/** Les lignes `CLE=valeur` actives d'un gabarit, avec leur section. */
function lireGabarit(contenu) {
  const lignes = [];
  let section = null;
  let classe = null;
  contenu.split('\n').forEach((ligne, i, tout) => {
    const titre = titreDeSection(tout, i);
    if (titre) {
      section = titre;
      classe = null;
    }
    const c = ligne.match(/^# (requise|intégration|réglage)$/);
    if (c) classe = c[1];
    const m = ligne.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (m) lignes.push({ cle: m[1], valeur: m[2].trim().replace(/^(["'])(.*)\1$/, '$2'), section, classe, n: i + 1 });
  });
  return lignes;
}

/** Une section : `# N. Titre` entre deux lignes de `# ====`, et rien d'autre (une prose numérotée n'en est pas une). */
function titreDeSection(tout, i) {
  const m = tout[i].match(/^# \d+\. (.+)$/);
  if (!m) return null;
  return /^# =+$/.test(tout[i - 1] ?? '') && /^# =+$/.test(tout[i + 1] ?? '') ? m[1] : null;
}

/** La section de chaque clé déclarée d'un `.env`, commentée ou non, et la suite des titres. */
function sectionsDe(contenu) {
  const titres = [];
  const parCle = new Map();
  const declarees = clefsDeclarees(contenu);
  const parLigne = new Map([...declarees].map(([k, v]) => [v.ligne, k]));
  contenu.split('\n').forEach((_, i, tout) => {
    const titre = titreDeSection(tout, i);
    if (titre) titres.push(titre);
    const cle = parLigne.get(i + 1);
    if (cle) parCle.set(cle, titres.at(-1) ?? null);
  });
  return { titres, parCle };
}

/** Retire les commentaires PHP : un `env('X')` cité dans un docblock n'est pas une lecture. */
function sansCommentaires(php) {
  return php.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(?:\/\/|#).*$/gm, '');
}

/**
 * Les clés lues par un fichier PHP : `env('X'` sur une ou plusieurs lignes, `getenv('X')`, et, dans
 * `config/`, les fermetures locales qui enveloppent `env` (`$adresse('OPENAI_URL', …)`, config/ai.php).
 */
export function lecturesPhp(php, { fermetures = false } = {}) {
  const net = sansCommentaires(php);
  const cles = new Set();
  const motifs = [/\b(?:get)?env\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g];
  if (fermetures) motifs.push(/\$[a-zA-Z_]+\(\s*'([A-Z][A-Z0-9_]{2,})'/g);
  for (const motif of motifs) for (const m of net.matchAll(motif)) cles.add(m[1]);
  return cles;
}

/** Les clés lues par du shell, un Compose ou un Caddyfile : `${X}`, `${X:-d}`, `$X`, `{$X}`, `{$X:d}`. */
export function lecturesShell(texte) {
  const net = texte.replace(/^\s*#.*$/gm, '');
  return new Set([...net.matchAll(/\$\{?([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
}

/** `process.env.X`, et `env.X` sur un paramètre qui vaut `process.env` (src/lib/pwa/version.ts). */
export function lecturesFront(ts) {
  return new Set([...ts.matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
}

const CAS_EPREUVE_LECTURES = [
  { php: "env('A_B')", attendu: ['A_B'] },
  { php: "env(\n    'SESSION_COOKIE',\n    'x'\n)", attendu: ['SESSION_COOKIE'] },
  { php: "getenv('RESEND_BASE_URL') ?: 'y'", attendu: ['RESEND_BASE_URL'] },
  { php: "$adresse('OPENAI_URL', 'https://…')", fermetures: true, attendu: ['OPENAI_URL'] },
  { php: "$adresse('OPENAI_URL', 'https://…')", attendu: [] },
  { php: "// env('EN_COMMENTAIRE')\n/* env('AUSSI') */\n", attendu: [] },
  { php: "config('app.name'); Str::env('minuscule');", attendu: [] },
];
const CAS_EPREUVE_SECRETS = [
  ['APP_KEY', 'base64:abc', true],
  ['GOOGLE_CLIENT_SECRET', 'abc', true],
  ['R2_ACCESS_KEY_ID', 'abc', true],
  ['CLOUDFLARE_ACCOUNT_ID', 'abc', true],
  ['RADAR_PHONE_HMAC_PREVIOUS_KEYS', 'abc', true],
  ['MEILISEARCH_HOST', 'http://user:motdepasse@meilisearch:7700', true],
  ['CACHE_PREFIX', 'sk-ant-api03-xyz', true],
  ['CDN_PULL_ZONE', 'a'.repeat(40), true],
  ['APP_KEY', '', false],
  ['R2_MEDIA_BUCKET', 'takussan-prod-media', false],
  ['RESEND_BASE_URL', 'api.resend.com', false],
  ['CDN_SIGNATURE_TTL', '300', false],
  ['TRUSTED_PROXIES', '10.0.1.0/24,2400:cb00::/32,173.245.48.0/20', false],
  ['SMS_ORANGE_SEND_URL', 'https://api.orange.com/smsmessaging/v1/outbound/{senderAddress}/requests', false],
  ['SANCTUM_STATEFUL_DOMAINS', 'www.takussan.com', false],
];
const egaux = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const echecs = [
  ...CAS_EPREUVE_LECTURES.filter(({ php, fermetures, attendu }) => !egaux(lecturesPhp(php, { fermetures }), attendu)).map(
    ({ php }) => `lecture : ${JSON.stringify(php)}`,
  ),
  ...CAS_EPREUVE_SECRETS.filter(([c, v, attendu]) => (secretDansLaLigne(c, v) !== null) !== attendu).map(
    ([c, v]) => `secret : ${c}=${v}`,
  ),
  ...(egaux(lecturesShell('# $COMMENTE\na=${A_B:-x} $C_D {$E_F:d}'), ['A_B', 'C_D', 'E_F']) ? [] : ['lecturesShell']),
  ...(egaux(lecturesFront('process.env.A_B; env.C_D; process.env.NODE_ENV'), ['A_B', 'C_D', 'NODE_ENV']) ? [] : ['lecturesFront']),
];
if (echecs.length > 0) {
  console.error(`✗ la garde échoue sur ${echecs.length} de ses propres cas d'épreuve :\n`);
  for (const e of echecs) console.error(`  · ${e}`);
  console.error("\n  Son motif a régressé : un vert sur l'arbre ne vaudrait rien. Corrige le motif, jamais le cas.");
  process.exit(1);
}

function fichiersSous(dossier, extensions, sauf = /$^/) {
  if (!existsSync(dossier)) return [];
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (sauf.test(p)) continue;
    if (e.isDirectory()) out.push(...fichiersSous(p, extensions, sauf));
    else if (extensions.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const erreurs = [];
const nom = (p) => relative(ROOT, p);

// ── Ce que le code lit ─────────────────────────────────────────────────────────────────────────
const luParApi = new Map();
const noter = (carte, cles, fichier) => {
  for (const c of cles) if (!carte.has(c)) carte.set(c, nom(fichier));
};
for (const dossier of ['config', 'app', 'bootstrap', 'database', 'routes']) {
  for (const f of fichiersSous(join(API, dossier), ['.php'])) {
    noter(luParApi, lecturesPhp(readFileSync(f, 'utf8'), { fermetures: dossier === 'config' }), f);
  }
}
for (const f of [
  ...fichiersSous(join(API, 'docker'), ['.sh', 'Caddyfile']),
  join(ROOT, 'deploy/takussan/compose.api.yml'),
]) {
  noter(luParApi, lecturesShell(readFileSync(f, 'utf8')), f);
}

const luParFront = new Map();
for (const f of [
  ...fichiersSous(join(WEB, 'src'), ['.ts', '.tsx'], /__tests__|\.test\.tsx?$/),
  join(WEB, 'next.config.ts'),
]) {
  noter(luParFront, lecturesFront(readFileSync(f, 'utf8')), f);
}

// Non-vacuité : une garde qui ne trouve plus sa cible passe au vert en ne gardant plus rien.
if (luParApi.size < 100) erreurs.push(`seulement ${luParApi.size} clés lues par l'API : le balayage ne voit plus le code.`);
if (!luParFront.has('API_URL')) erreurs.push('le balayage du front ne voit plus API_URL : il ne lit plus le code.');

// ── Résidus ────────────────────────────────────────────────────────────────────────────────────
const residus = new Map();
for (const { motif, cles } of RESIDUS) {
  if (!motif?.trim()) erreurs.push(`un groupe de résidus n'a pas de motif : ${cles.join(', ')}`);
  for (const c of cles) {
    if (residus.has(c)) erreurs.push(`${c} : déclarée deux fois dans la liste des résidus.`);
    residus.set(c, motif);
  }
}

// ── API ────────────────────────────────────────────────────────────────────────────────────────
const CHEMIN_EX = join(API, '.env.example');
const CHEMIN_DOCKER = join(API, '.env.docker');
const CHEMIN_GAB_API = join(ROOT, 'deploy/takussan/env.api.production.example');
const CHEMIN_GAB_WEB = join(ROOT, 'deploy/takussan/env.web.production.example');
const CHEMIN_EX_WEB = join(WEB, '.env.example');

const contenuEx = readFileSync(CHEMIN_EX, 'utf8');
const gabApi = lireGabarit(readFileSync(CHEMIN_GAB_API, 'utf8'));
const clesEx = clefsDeclarees(contenuEx);
const clesGabApi = new Set(gabApi.map((l) => l.cle));

if (gabApi.length < 100) erreurs.push(`${nom(CHEMIN_GAB_API)} : ${gabApi.length} clés seulement, le gabarit n'est plus lu.`);

for (const { cle, n } of gabApi) {
  if (!clesEx.has(cle)) erreurs.push(`${nom(CHEMIN_GAB_API)}:${n} : ${cle} n'existe pas dans ${nom(CHEMIN_EX)}.`);
  if (residus.has(cle)) erreurs.push(`${nom(CHEMIN_GAB_API)}:${n} : ${cle} est aussi un résidu (${residus.get(cle)}).`);
}
for (const [cle, { ligne }] of clesEx) {
  if (!clesGabApi.has(cle) && !residus.has(cle)) {
    erreurs.push(`${nom(CHEMIN_EX)}:${ligne} : ${cle} n'est ni dans le gabarit de production ni dans les résidus de cette garde.`);
  }
}
for (const [cle, fichier] of luParApi) {
  if (!clesEx.has(cle) && !residus.has(cle)) {
    erreurs.push(`${cle} : lue par ${fichier}, ni dans ${nom(CHEMIN_EX)} ni dans les résidus de cette garde.`);
  }
}
for (const cle of residus.keys()) {
  if (!luParApi.has(cle) && !clesEx.has(cle)) {
    erreurs.push(`${cle} : résidu que plus rien ne lit ni ne déclare, à retirer de la liste de cette garde.`);
  }
}
for (const cle of INTERDITES_API) {
  if (clesGabApi.has(cle)) erreurs.push(`${nom(CHEMIN_GAB_API)} : ${cle} est écrite par compose.api.yml, et sans effet dans l'onglet.`);
}
for (const [cle, attendue] of Object.entries(VALEURS_IMPOSEES_API)) {
  const ligne = gabApi.find((l) => l.cle === cle);
  if (ligne?.valeur !== attendue) erreurs.push(`${nom(CHEMIN_GAB_API)} : ${cle} doit valoir « ${attendue} » en production.`);
}

// ── Front ──────────────────────────────────────────────────────────────────────────────────────
const contenuExWeb = readFileSync(CHEMIN_EX_WEB, 'utf8');
const gabWeb = lireGabarit(readFileSync(CHEMIN_GAB_WEB, 'utf8'));
const clesExWeb = clefsDeclarees(contenuExWeb);
const clesGabWeb = new Set(gabWeb.map((l) => l.cle));

for (const { cle, n } of gabWeb) {
  if (!clesExWeb.has(cle)) erreurs.push(`${nom(CHEMIN_GAB_WEB)}:${n} : ${cle} n'existe pas dans ${nom(CHEMIN_EX_WEB)}.`);
}
for (const [cle, { ligne }] of clesExWeb) {
  if (!clesGabWeb.has(cle)) erreurs.push(`${nom(CHEMIN_EX_WEB)}:${ligne} : ${cle} n'est pas dans le gabarit de production.`);
}
for (const [cle, fichier] of luParFront) {
  if (!clesExWeb.has(cle) && !RESIDUS_FRONT.includes(cle)) {
    erreurs.push(`${cle} : lue par ${fichier}, ni dans ${nom(CHEMIN_EX_WEB)} ni dans les résidus du front de cette garde.`);
  }
}

// ── Doublons et secrets, sur les deux gabarits ─────────────────────────────────────────────────
for (const [chemin, lignes] of [[CHEMIN_GAB_API, gabApi], [CHEMIN_GAB_WEB, gabWeb]]) {
  const vues = new Set();
  for (const { cle, valeur, classe, n } of lignes) {
    if (!classe) erreurs.push(`${nom(chemin)}:${n} : ${cle} n'est sous aucune classe (# requise, # intégration, # réglage).`);
    if (vues.has(cle)) erreurs.push(`${nom(chemin)}:${n} : ${cle} déclarée deux fois.`);
    vues.add(cle);
    const motif = secretDansLaLigne(cle, valeur);
    // Le nom seul : un message de garde finit dans un journal de CI.
    if (motif) erreurs.push(`${nom(chemin)}:${n} : ${cle} — ${motif}.`);
  }
}

// ── Sections : mêmes titres, même ordre, chaque clé sous le même ──────────────────────────────
function comparerSections(reference, cheminRef, autres) {
  const titresRef = reference.titres;
  for (const [chemin, contenu, { titresEnPlus = [] } = {}] of autres) {
    const { titres, parCle } = sectionsDe(contenu);
    const attendus = [...titresRef, ...titresEnPlus];
    if (JSON.stringify(titres) !== JSON.stringify(attendus)) {
      erreurs.push(`${nom(chemin)} : sections « ${titres.join(' / ')} », attendues « ${attendus.join(' / ')} » (${nom(cheminRef)}).`);
    }
    for (const [cle, section] of reference.parCle) {
      if (parCle.has(cle) && parCle.get(cle) !== section) {
        erreurs.push(`${cle} : section « ${parCle.get(cle)} » dans ${nom(chemin)}, « ${section} » dans ${nom(cheminRef)}.`);
      }
    }
  }
}
const SECTION_RESIDUS = 'Résidus (jamais dans Dokploy)';
const contenuGabApi = readFileSync(CHEMIN_GAB_API, 'utf8');
comparerSections(sectionsDe(contenuGabApi), CHEMIN_GAB_API, [
  [CHEMIN_EX, contenuEx, { titresEnPlus: [SECTION_RESIDUS] }],
  [CHEMIN_DOCKER, readFileSync(CHEMIN_DOCKER, 'utf8'), { titresEnPlus: [SECTION_RESIDUS] }],
]);
comparerSections(sectionsDe(readFileSync(CHEMIN_GAB_WEB, 'utf8')), CHEMIN_GAB_WEB, [[CHEMIN_EX_WEB, contenuExWeb]]);

// ── Verdict ────────────────────────────────────────────────────────────────────────────────────
if (REPORT) {
  console.log(`API : ${gabApi.length} clés au gabarit, ${residus.size} résidus, ${luParApi.size} lues par le code.`);
  console.log(`Front : ${gabWeb.length} clés au gabarit, ${luParFront.size} lues par le code.`);
  for (const classe of ['requise', 'intégration']) {
    const vides = [...gabApi, ...gabWeb].filter((l) => l.classe === classe && l.valeur === '').map((l) => l.cle);
    console.log(`Vides, ${classe} :\n  ${vides.join(', ')}`);
  }
}

if (erreurs.length > 0) {
  console.error(`✗ ${erreurs.length} écart(s) sur les gabarits de production :\n`);
  for (const e of erreurs) console.error(`  · ${e}`);
  console.error(
    `\nUne clé neuve va dans .env.example et .env.docker (commentée si elle a un défaut, D-54), dans le gabarit\n` +
      `avec sa valeur de production, ou dans les résidus de cette garde avec son motif.`,
  );
  process.exit(1);
}
console.log(`✓ gabarits de production : ${gabApi.length} + ${gabWeb.length} clés, ${residus.size} résidus motivés, aucune valeur de secret.`);
