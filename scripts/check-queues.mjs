#!/usr/bin/env node
/**
 * Garde des FILES DE JOBS : toute file poussée par le code doit être consommée en production.
 *
 * Le défaut qu'elle attrape a été réel. L'unité systemd de production lançait
 * `php artisan queue:work` **sans `--queue`**, donc ne consommait que la file `default` — alors
 * que le code pousse explicitement sur `media`, `notifications-urgent` et `reconciliation`.
 * Leurs jobs s'empilaient indéfiniment dans la table `jobs` sans jamais être exécutés.
 *
 * **Et rien ne le signalait.** Pas d'erreur, pas de timeout, pas d'alerte : l'API répondait 200,
 * la ligne partait en base, et l'effet attendu n'arrivait jamais. Une file sans consommateur ne se
 * manifeste que par l'ABSENCE de quelque chose, et l'absence ne déclenche rien.
 *
 * La garde compare deux sources qui n'ont aucune raison de rester d'accord toutes seules :
 * les `onQueue('…')` du code, et les `--queue=` de ceux qui les consomment :
 * `deploy/takussan/compose.api.yml` (préproduction ET production, ADR-0028) et `dev.sh`.
 *
 * **Et deux règles de plus depuis TCK-2397 (ADR-0078)**, parce que `retry_after` appartient à la
 * CONNEXION et non au job :
 *  - une file qui appartient à une connexion dédiée (`database-long` → `long`) n'est lue que par des
 *    workers de cette connexion : un worker de `database` qui lirait `long` relivrerait après 90 s
 *    un job de 30 min encore vivant ;
 *  - aucun `$timeout` de `app/` n'atteint, à `MARGE_SECONDES` près, le `retry_after` par défaut de
 *    sa connexion dans `config/queue.php`.
 *
 * Usage :
 *   node scripts/check-queues.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-queues.mjs --report   # + l'inventaire
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
/**
 * Les racines BALAYÉES — trois, et pas seulement `app/`.
 *
 * Le balayage s'arrêtait à `app/`. C'est complet aujourd'hui (les 5 sites `onQueue()` y sont
 * tous), mais `routes/console.php` porte la vingtaine de tâches planifiées du projet : un
 * `->onQueue('exports')` écrit là aurait été invisible à cette garde — ET n'aurait même pas
 * déclenché `repo-ci.yml`, dont le filtre `paths:` ne nommait lui aussi que `takussan-api/app/**`.
 * La panne silencieuse que ce script existe pour empêcher revenait donc par la seule porte
 * qu'il ne surveillait pas, avec la CI muette en prime.
 *
 * *Une garde et son déclencheur doivent couvrir le même périmètre ; sinon c'est le plus étroit
 * des deux qui définit ce qui est réellement gardé.*
 */
const RACINES = [
  join(ROOT, 'takussan-api', 'app'),
  join(ROOT, 'takussan-api', 'routes'),
  join(ROOT, 'takussan-api', 'database'),
];

/**
 * TOUS les consommateurs, pas seulement celui du serveur.
 *
 * Une première version ne lisait que la production. Le `--queue` y a été corrigé… et `dev.sh` a
 * continué de lancer `queue:work` sans lui, réintroduisant en local le défaut exact que la garde
 * venait de fermer — au vert, puisqu'elle ne regardait pas là. *Une garde qui ne couvre qu'un
 * côté déplace le défaut au lieu de le supprimer.*
 *
 * Depuis ADR-0028, le serveur n'a plus qu'UNE source : le fichier Compose EST le déploiement, et
 * le même fichier sert la préproduction et la production. Les trois copies qu'on gardait ici —
 * l'unité systemd de production, celle de préproduction, et `FILES_ATTENDUES` de `deploy.sh` —
 * n'existent plus. *Le fichier gardé est celui qu'on exécute.*
 */
const CONSOMMATEURS = [
  { fichier: join(ROOT, 'deploy', 'takussan', 'compose.api.yml'), ou: 'serveur — préproduction et production (Compose Dokploy)' },
  { fichier: join(ROOT, 'dev.sh'), ou: 'développement local' },
];

/**
 * La connexion d'un `queue:work` est son premier argument positionnel ; sans lui, c'est
 * `QUEUE_CONNECTION`, qui vaut `database` dans les deux environnements déployés et dans
 * `.env.docker`. Une garde ne lit pas un `.env` qu'elle n'a pas : elle pose ce défaut ici, nommé.
 */
const CONNEXION_PAR_DEFAUT = 'database';
/**
 * La plus petite marge en place au 2026-10-27 : `Audit\ExportActivityLogJob`, 85 s contre 90. La
 * règle de Laravel est « quelques secondes » : le worker tue le job à `$timeout`, la file le rend à
 * `retry_after`, et les deux horloges ne partent pas du même instant.
 */
const MARGE_SECONDES = 5;
const CONFIG_FILE = join(ROOT, 'takussan-api', 'config', 'queue.php');

/* ── 1. les files que le CODE pousse ─────────────────────────────────────── */
// Les écritures possibles. Le commentaire d'origine en annonçait trois et le tableau
// n'en implémentait que deux : une garde qui documente plus qu'elle ne mesure laisse passer
// exactement ce qu'elle prétend couvrir. `protected $queue` — la forme la plus courante après
// `onQueue()` — n'était dans ni l'un ni l'autre.
//   ->onQueue('x') · Queue::pushOn('x')  · nom littéral au point de dispatch
//   public|protected $queue = 'x';       · propriété de classe
//   'queue' => 'x'                       · dans une config de dispatch
const MOTIFS = [
  /->onQueue\(\s*['"]([a-z0-9_-]+)['"]\s*\)/g,
  // `Queue::pushOn('x', $job)` / `->pushOn('x', …)` — la façade prend la file en PREMIER.
  /::pushOn\(\s*['"]([a-z0-9_-]+)['"]/g,
  // ⚠ Le TYPE de la propriété est facultatif dans le motif, et son absence rendait ce motif
  // entièrement mort. Il avait été ajouté avec un commentaire triomphant (« `protected $queue`
  // — la forme la plus courante après `onQueue()` — n'était dans ni l'un ni l'autre ») ; il
  // acceptait `readonly` mais pas un type. Or la SEULE propriété `$queue` du dépôt est typée —
  // `public string $queue = 'media';` dans `ApplyWatermarkOnConversionListener` — donc ce motif
  // n'a jamais rien matché, pas une fois, et rien ne le disait puisque son absence de résultat
  // ressemble à « il n'y en a pas ».
  //
  // On tolère donc n'importe quelle déclaration de type (`?string`, `string|null`, un FQCN),
  // et l'ordre `readonly`/type dans les deux sens.
  //
  // *Un motif ajouté pour fermer un trou et qui ne matche jamais ne se distingue pas d'un trou :
  // il coûte en plus la certitude qu'on l'a fermé.*
  /(?:public|protected|private)\s+(?:readonly\s+)?(?:\??[\\\w|]+\s+)?(?:readonly\s+)?\$queue\s*=\s*['"]([a-z0-9_-]+)['"]/g,
  // ⚠ RESSERRÉ. Ce motif balayait tout `app/**.php` : n'importe quel tableau de configuration
  // portant une clé `queue` — `'queue' => 'sync'` dans un service, un tableau de valeurs par
  // défaut, un payload de test — était compté comme une file poussée, et faisait rougir Repo CI
  // jusqu'à ce qu'on ajoute une file FANTÔME aux deux `--queue=`. Une garde qui exige qu'on
  // consomme une file inexistante enseigne à la contourner.
  //
  // On ne le retient donc que sur les lignes où la clé cohabite avec un dispatch — c'est là, et
  // là seulement, qu'elle désigne une file.
  { motif: /['"]queue['"]\s*=>\s*['"]([a-z0-9_-]+)['"]/g, ligneDoitContenir: /dispatch|Queue::|->onQueue|Bus::/ },
];

/**
 * Les files nommées par une CONSTANTE ou une variable, que rien ci-dessus ne peut lire.
 *
 * `->onQueue(self::QUEUE)` et `->onQueue($file)` sont des dispatchs parfaitement valides dont le
 * nom de file n'est pas dans l'expression. La version précédente les ignorait en silence : le
 * défaut même que cette garde existe pour empêcher — une file poussée que personne ne consomme —
 * se réintroduisait donc en une ligne, la garde restant verte.
 *
 * On ne peut pas résoudre la constante sans interpréter du PHP. On refuse donc de conclure : la
 * garde SIGNALE le site et demande une lecture humaine, au lieu de rendre « rien à déclarer ».
 * *Une garde qui ne sait pas doit le dire, jamais rendre « non ».*
 */
const OPAQUE = /->onQueue\(\s*(?!['"])([^)]+)\)|::pushOn\(\s*(?!['"])([^,)]+)/g;

/**
 * Les COMMENTAIRES PHP sont retirés avant analyse — la garde sœur le fait, celle-ci ne le
 * faisait pas.
 *
 * `check-pro-routes.mjs` a appris à ses dépens qu'un motif appliqué au texte brut atteste de ce
 * qu'on a ÉCRIT SUR le code, pas du code. La leçon n'avait pas traversé jusqu'ici : n'importe
 * quel docblock de `takussan-api/app/**` citant `->onQueue('…')` — un commentaire expliquant
 * une file supprimée, exactement le genre de prose que cette PR ajoute partout — comptait comme
 * un site de poussée vivant. Repo CI exigeait alors ce nom dans les deux `--queue=`, et le
 * correctif naturel était d'y ajouter une file FANTÔME : le mode d'échec que le commentaire de
 * `'queue' =>` dans ce même fichier dénonce en toutes lettres.
 *
 * Une garde qui apprend une leçon doit la propager à ses sœurs, sinon elle ne l'a apprise que
 * pour elle.
 */
function sansCommentairesPhp(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/^\s*#(?!\[)[^\n]*/gm, ''); // `#` de shell-style ; `#[` est un attribut PHP 8.
}

const poussees = new Map(); // file → [chemins]
const opaques = []; // [chemin, expression]

/**
 * Combien de fois chaque motif a MATCHÉ — parce qu'un motif mort ne se voit pas.
 *
 * Le motif `$queue` a vécu plusieurs revues sans jamais matcher une seule ligne : il exigeait
 * `public $queue` là où la seule occurrence du dépôt écrit `public string $queue`. Son absence
 * de résultat est indiscernable de « il n'y a rien à trouver », et il portait un commentaire
 * affirmant qu'il fermait le trou. On croyait la porte fermée parce qu'on l'avait décrite.
 *
 * Le compte est affiché sous `--report` et un zéro est NOMMÉ. Il ne fait pas échouer — un dépôt
 * peut légitimement n'avoir aucune propriété `$queue` — mais il ne se tait plus.
 *
 * *Un motif ajouté pour fermer un trou et qui ne matche jamais ne se distingue pas d'un trou :
 * il coûte en plus la certitude qu'on l'a fermé.*
 */
const touches = MOTIFS.map(() => 0);
function balayer(dir) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      balayer(chemin);
      continue;
    }
    if (!entree.endsWith('.php')) continue;
    const txt = sansCommentairesPhp(readFileSync(chemin, 'utf8'));
    const rel = chemin.slice(ROOT.length + 1);
    for (const [i, brut] of MOTIFS.entries()) {
      const motif = brut.motif ?? brut;
      for (const m of txt.matchAll(motif)) {
        if (brut.ligneDoitContenir) {
          const debut = txt.lastIndexOf('\n', m.index) + 1;
          const fin = txt.indexOf('\n', m.index);
          if (!brut.ligneDoitContenir.test(txt.slice(debut, fin === -1 ? undefined : fin))) continue;
        }
        touches[i] += 1;
        if (!poussees.has(m[1])) poussees.set(m[1], []);
        if (!poussees.get(m[1]).includes(rel)) poussees.get(m[1]).push(rel);
      }
    }
    for (const m of txt.matchAll(OPAQUE)) {
      opaques.push([rel, (m[1] ?? m[2]).trim()]);
    }
  }
}
for (const racine of RACINES) if (existsSync(racine)) balayer(racine);

/* ── 2. les files que CHAQUE consommateur consomme ───────────────────────── */
const lus = [];
for (const { fichier, ou } of CONSOMMATEURS) {
  if (!existsSync(fichier)) {
    console.error(`✗ ${fichier.slice(ROOT.length + 1)} est introuvable — la garde ne peut pas vérifier « ${ou} ».`);
    process.exit(1);
  }
  // Les COMMENTAIRES sont écartés, et ce n'est pas de la coquetterie.
  //
  // `find()` rendait la PREMIÈRE ligne contenant `artisan queue:work`, où qu'elle soit. Or les
  // deux consommateurs portent désormais de longs blocs d'explication au-dessus de leur
  // invocation. Le jour où l'un d'eux cite la commande complète — `php artisan queue:work
  // --queue=notifications-urgent,default,media,reconciliation`, la chose la plus naturelle à
  // écrire dans un commentaire qui explique ce drapeau — la garde lisait le commentaire, y
  // trouvait le `--queue=`, et passait au vert pendant que l'`ExecStart` réel l'avait perdu.
  //
  // *Une garde qui lit la documentation de la commande au lieu de la commande atteste de
  // l'intention, pas de l'exécution.* C'est le défaut même qu'elle existe pour attraper.
  // TOUTES les lignes `queue:work`, pas la première.
  //
  // `.find()` s'arrêtait au premier worker trouvé. Aujourd'hui chaque consommateur n'en déclare
  // qu'un, donc la garde était juste — mais le commentaire de `server-setup.sh` lui-même
  // recommande de donner un worker dédié à `notifications-urgent` si elle grossit. Le jour où
  // une seconde ligne existe, la garde certifie tout le fichier d'après la première et annonce
  // « les 4 files exigées sont consommées » sans avoir jamais regardé le second worker.
  //
  // C'est la TROISIÈME fois que cette garde est corrigée pour n'avoir lu qu'une partie de ce
  // qu'elle juge — après les commentaires côté consommateurs, puis côté PHP. *Lire le premier
  // élément d'un ensemble et conclure sur l'ensemble est une erreur qui ne se voit pas tant que
  // l'ensemble est un singleton.* On la ferme avant qu'elle ne se manifeste.
  const contenu = readFileSync(fichier, 'utf8');

  const lignes = contenu
    .split('\n')
    .filter((l) => l.includes('artisan queue:work') && !/^\s*#/.test(l));
  if (lignes.length === 0) {
    console.error(`✗ aucune ligne \`artisan queue:work\` dans ${fichier.slice(ROOT.length + 1)} (« ${ou} »).`);
    console.error('  La garde le dit plutôt que de passer en silence.');
    process.exit(1);
  }
  // L'UNION des files servies par les workers du fichier : deux workers qui se partagent les
  // files couvrent le contrat ensemble, et c'est bien ainsi qu'on les déploierait.
  const files = new Set();
  const workers = [];
  lignes.forEach((ligne, i) => {
    const m = ligne.match(/--queue=([a-z0-9_,-]+)/);

    // Une valeur littérale, toujours. `--queue=${VAR}` est refusé plus bas comme un worker sans
    // `--queue=` : Compose interpole la variable depuis un .env que le dépôt ne contient pas, et
    // une garde qui ne peut pas lire la valeur ne doit pas rendre « couvert ».
    if (!m) {
      const autres = [...poussees.keys()].filter((q) => q !== 'default');
      const quel = lignes.length > 1 ? ` (worker n°${i + 1} sur ${lignes.length})` : '';
      console.error(`✗ un \`queue:work\` de « ${ou} »${quel} (${fichier.slice(ROOT.length + 1)}) n'a pas de \`--queue=\`.`);
      console.error('  Il ne consommera donc QUE la file `default`, et les jobs poussés sur');
      console.error(`  ${autres.join(', ') || '(aucune autre file)'} ne seront jamais exécutés.`);
      process.exit(1);
    }
    m[1].split(',').forEach((q) => files.add(q));
    workers.push({ connexion: connexionDuWorker(ligne), files: m[1].split(',') });
  });
  lus.push({ ou, fichier, files, workers: lignes.length, detail: workers });
}

// L'union serait indulgente : une file consommée en production mais pas en local resterait
// invisible. On exige donc que CHAQUE consommateur couvre CHAQUE file.
const consommees = new Set(lus.flatMap((c) => [...c.files]));

/* ── 2 bis. connexions et délais de reprise (TCK-2397, ADR-0078) ─────────── */
export function connexionDuWorker(ligne) {
  const m = ligne.match(/artisan queue:work\s+(?!-)([a-z0-9_-]+)/);
  return m ? m[1] : CONNEXION_PAR_DEFAUT;
}

/** `'nom' => [ … 'driver' => 'database' … 'queue' => 'long' … 'retry_after' => (int) env('X', 1900) … ]` */
export function lireConnexions(php) {
  const debut = php.indexOf("'connections' =>");
  const connexions = new Map();
  if (debut === -1) return connexions;
  for (const m of sansCommentairesPhp(php.slice(debut)).matchAll(/'([a-z0-9_-]+)'\s*=>\s*\[([^\]]*)\]/g)) {
    const driver = m[2].match(/'driver'\s*=>\s*'([a-z0-9_-]+)'/)?.[1];
    if (!driver || connexions.has(m[1])) continue;
    const retry = m[2].match(/'retry_after'\s*=>\s*(?:\(int\)\s*env\(\s*'[A-Z0-9_]+'\s*,\s*)?(\d+)/)?.[1];
    connexions.set(m[1], {
      driver,
      file: m[2].match(/'queue'\s*=>\s*'([a-z0-9_-]+)'/)?.[1] ?? null,
      retryAfter: retry === undefined ? null : Number(retry),
    });
  }
  return connexions;
}

/**
 * La file d'une connexion `database` dédiée lui appartient : `database-long` → `long`. Les files de
 * la connexion par défaut n'ont pas de propriétaire écrit — c'est le cas général.
 */
export function proprietaires(connexions) {
  const p = new Map();
  for (const [nom, c] of connexions) if (nom !== CONNEXION_PAR_DEFAUT && c.driver === 'database' && c.file) p.set(c.file, nom);
  return p;
}

/**
 * Résout l'expression d'un `$timeout` : un entier, `self::X`, `Classe::X`, suivis d'un `+ N` ou
 * `- N`. Ce qu'elle ne sait pas lire, elle le dit (`null`) — jamais « 0 », qui passerait toujours.
 */
export function resoudreTimeout(expr, source, constantesDe) {
  const m = expr.trim().match(/^(?:(\d+)|(self|static|[A-Z]\w*)::([A-Z_][A-Z0-9_]*))\s*(?:([+-])\s*(\d+))?$/);
  if (!m) return null;
  let base;
  if (m[1] !== undefined) base = Number(m[1]);
  else {
    const src = m[2] === 'self' || m[2] === 'static' ? source : constantesDe(m[2]);
    const c = src?.match(new RegExp(`const\\s+(?:int\\s+)?${m[3]}\\s*=\\s*(\\d+)\\s*;`));
    if (!c) return null;
    base = Number(c[1]);
  }
  return m[4] === '+' ? base + Number(m[5]) : m[4] === '-' ? base - Number(m[5]) : base;
}

export function connexionDeLaClasse(source) {
  // Le `use` DANS la classe (indenté), pas l'import en tête de fichier.
  // `[ \t]+` et non `\s+` : sous `m`, `\s` traverse le saut de ligne, et l'import précédé d'une ligne
  // vide passait pour un `use` de classe (attrapé par ablation, d'où la seconde épreuve).
  return /^[ \t]+use\s+[^;]*\bRunsOnLongQueue\b/m.test(source) ? 'database-long' : CONNEXION_PAR_DEFAUT;
}

const EPREUVES = [
  ['worker sans connexion', connexionDuWorker('    command: php artisan queue:work --queue=a,b --tries=3'), 'database'],
  ['worker de database-long', connexionDuWorker('    command: php artisan queue:work database-long --queue=long'), 'database-long'],
  ['timeout littéral', resoudreTimeout('300', '', () => null), 300],
  ['timeout self::', resoudreTimeout('self::T', 'public const T = 1800;', () => null), 1800],
  ['timeout Classe:: + N', resoudreTimeout('B::CHAIN + 20', '', (c) => (c === 'B' ? 'public const CHAIN = 30;' : null)), 50],
  ['timeout illisible', resoudreTimeout('config(\'x\')', '', () => null), null],
  ['classe longue', connexionDeLaClasse('use App\\Jobs\\Concerns\\RunsOnLongQueue;\nclass A {\n    use Queueable, RunsOnLongQueue;\n}'), 'database-long'],
  ['import seul', connexionDeLaClasse('use App\\Jobs\\Concerns\\RunsOnLongQueue;\nclass A {\n    use Queueable;\n}'), 'database'],
  ['import seul après une ligne vide', connexionDeLaClasse('<?php\n\nnamespace App\\Jobs;\n\nuse App\\Jobs\\Concerns\\RunsOnLongQueue;\nclass A {\n    use Queueable;\n}'), 'database'],
  ['propriétaire de long', proprietaires(lireConnexions("'connections' => [\n 'database' => ['driver' => 'database', 'queue' => env('DB_QUEUE', 'default'), 'retry_after' => (int) env('DB_QUEUE_RETRY_AFTER', 90)],\n 'database-long' => ['driver' => 'database', 'queue' => 'long', 'retry_after' => (int) env('DB_LONG_QUEUE_RETRY_AFTER', 1900)],\n]")).get('long'), 'database-long'],
];
for (const [nom, obtenu, attendu] of EPREUVES) {
  if (obtenu !== attendu) {
    console.error(`✗ épreuve « ${nom} » : ${JSON.stringify(obtenu)} au lieu de ${JSON.stringify(attendu)}`);
    process.exit(1);
  }
}

const connexions = lireConnexions(readFileSync(CONFIG_FILE, 'utf8'));
const proprio = proprietaires(connexions);
const fautes = [];

// Une file dédiée n'est lue que par sa connexion ; une file ordinaire, que par la connexion par défaut.
for (const c of lus) {
  for (const w of c.detail) {
    if (!connexions.has(w.connexion)) {
      fautes.push(`un worker de « ${c.ou} » vise la connexion \`${w.connexion}\`, absente de config/queue.php`);
      continue;
    }
    for (const q of w.files) {
      const attendue = proprio.get(q) ?? CONNEXION_PAR_DEFAUT;
      if (w.connexion !== attendue) {
        fautes.push(`« ${c.ou} » lit la file \`${q}\` par la connexion \`${w.connexion}\`, au lieu de \`${attendue}\` : son délai de reprise n'est pas celui des jobs de cette file`);
      }
    }
  }
}

// Chaque `$timeout` contre le `retry_after` de sa connexion.
const sources = new Map(); // classe → source sans commentaires
const fichiersPhp = [];
(function lister(dir) {
  for (const e of readdirSync(dir)) {
    const ch = join(dir, e);
    if (statSync(ch).isDirectory()) lister(ch);
    else if (e.endsWith('.php')) fichiersPhp.push(ch);
  }
})(join(ROOT, 'takussan-api', 'app'));
for (const f of fichiersPhp) {
  const src = sansCommentairesPhp(readFileSync(f, 'utf8'));
  const cls = src.match(/^(?:final\s+|abstract\s+|readonly\s+)*(?:class|interface|trait|enum)\s+(\w+)/m)?.[1];
  if (cls && !sources.has(cls)) sources.set(cls, src);
}
const delais = [];
for (const f of fichiersPhp) {
  const src = sansCommentairesPhp(readFileSync(f, 'utf8'));
  const rel = f.slice(ROOT.length + 1);
  for (const m of src.matchAll(/(?:public|protected|private)\s+(?:\??\w+\s+)?\$timeout\s*=\s*([^;]+);/g)) {
    const t = resoudreTimeout(m[1], src, (c) => sources.get(c) ?? null);
    const conn = connexionDeLaClasse(src);
    const retry = connexions.get(conn)?.retryAfter ?? null;
    delais.push({ rel, t, conn, retry });
    if (t === null) fautes.push(`${rel} : \`$timeout = ${m[1].trim()}\` illisible — la garde ne peut pas juger son délai de reprise`);
    else if (retry === null) fautes.push(`${rel} : la connexion \`${conn}\` n'a pas de \`retry_after\` lisible dans config/queue.php`);
    else if (t + MARGE_SECONDES > retry) {
      fautes.push(`${rel} : \`$timeout\` ${t} s sur \`${conn}\` (retry_after ${retry} s) — un worker de plus le relivrerait vivant. Prendre \`RunsOnLongQueue\` (ADR-0078)`);
    }
  }
}
if (delais.length === 0) fautes.push('aucun `$timeout` trouvé dans takussan-api/app : le motif ne lit plus rien');

/* ── 3. l'écart ──────────────────────────────────────────────────────────── */
// `default` est EXIGÉE inconditionnellement, et son absence de `poussees` est précisément la
// raison pour laquelle elle ne l'était pas.
//
// Rien ne la NOMME dans le code : c'est la file où atterrit tout `dispatch()` sans `onQueue()`,
// donc la grande majorité des jobs du dépôt. Aucun motif ne peut la trouver, elle n'entrait
// jamais dans `poussees`, et la boucle ci-dessous n'exigeait donc jamais qu'un consommateur la
// serve. Éditer une unité en `--queue=notifications-urgent,media,reconciliation` laissait la
// garde au vert pendant que TOUS les jobs ordinaires cessaient de tourner — la panne silencieuse
// exacte que ce script existe pour empêcher, sur la file qui compte le plus.
//
// *Ce qu'une garde déduit de la lecture du code ne contient pas ce que le code ne dit pas.*
const EXIGEES = new Set([...poussees.keys(), 'default']);

const orphelines = [];
for (const q of EXIGEES) {
  const absente = lus.filter((c) => !c.files.has(q));
  if (absente.length) orphelines.push([q, absente.map((c) => c.ou)]);
}
// L'inverse est un avertissement, pas une erreur : consommer une file que plus personne
// n'alimente ne casse rien, mais c'est le signe d'un job supprimé sans nettoyer l'unité.
const inutiles = [...consommees].filter((q) => q !== 'default' && !poussees.has(q));

if (REPORT) {
  console.log(`Files poussées par le code (${poussees.size}) :`);
  for (const [q, fichiers] of [...poussees].sort()) {
    console.log(`  ${q.padEnd(22)} ${fichiers.length} site(s) — ${fichiers[0]}${fichiers.length > 1 ? ' …' : ''}`);
  }
  for (const c of lus) {
    console.log(`\nFiles consommées — ${c.ou} (${c.files.size}, dans l'ordre de priorité) :`);
    console.log(`  ${[...c.files].join(' › ')}`);
  }
  const NOMS = ['->onQueue(\'x\')', '::pushOn(\'x\', …)', 'public|protected $queue = \'x\'', "'queue' => 'x' (ligne de dispatch)"];
  console.log(`\nMotifs et leur nombre de correspondances :`);
  MOTIFS.forEach((_, i) => {
    console.log(`  ${touches[i] === 0 ? '⚠ 0' : String(touches[i]).padStart(3)}  ${NOMS[i] ?? `motif n°${i + 1}`}`);
  });
  console.log(`\nDélais de reprise (marge ${MARGE_SECONDES} s) :`);
  for (const d of [...delais].sort((a, b) => (b.t ?? 0) - (a.t ?? 0))) {
    console.log(`  ${String(d.t ?? '?').padStart(5)} s / ${String(d.retry ?? '?').padStart(4)} s  ${d.conn.padEnd(14)} ${d.rel}`);
  }
  if (opaques.length) {
    console.log(`\nFiles nommées par une expression (${opaques.length}) — non lisibles ici :`);
    for (const [f, expr] of opaques) console.log(`  ${expr.padEnd(28)} ${f}`);
  }
  console.log();
}

for (const q of inutiles) {
  console.warn(`⚠ la production consomme la file \`${q}\`, qu'aucun job n'alimente plus.`);
}

// Les dispatchs dont la file n'est pas un littéral : la garde ne peut pas les résoudre, et le
// silence serait un « rien à déclarer » mensonger. On les nomme, sans faire échouer — un
// avertissement qu'on lit vaut mieux qu'une erreur qu'on apprend à contourner.
// Un motif qui n'a jamais matché : on le NOMME, sans faire échouer.
touches.forEach((n, i) => {
  if (n === 0) {
    console.warn(
      `⚠ le motif n°${i + 1} de MOTIFS n'a matché AUCUNE ligne du dépôt. Soit cette écriture n'y\n`
      + `  existe pas — c'est légitime — soit il ne sait pas la lire, et il ferme alors un trou\n`
      + `  en apparence seulement. Vérifie-le avant de lui faire confiance.`
    );
  }
});

for (const [f, expr] of opaques) {
  console.warn(
    `⚠ ${f} pousse sur une file nommée par une expression (\`${expr}\`) : cette garde ne peut pas\n`
    + `  la résoudre. Vérifie À LA MAIN qu'elle figure dans le \`--queue=\` des ${CONSOMMATEURS.length} consommateurs.`
  );
}

if (fautes.length) {
  console.error(`\n✗ ${fautes.length} faute(s) de connexion ou de délai de reprise (ADR-0078) :\n`);
  for (const f of fautes) console.error(`  · ${f}`);
  console.error('');
}

if (orphelines.length === 0 && fautes.length === 0) {
  console.log(`✓ files de jobs : les ${EXIGEES.size} files exigées (dont \`default\`) sont consommées par les ${lus.length} consommateurs.`);
  process.exit(0);
}

if (orphelines.length === 0) process.exit(1);

console.error(`\n✗ ${orphelines.length} file(s) exigée(s) et non consommée(s) quelque part :\n`);
for (const [q, ou] of orphelines) {
  console.error(`  · \`${q}\` — absente de : ${ou.join(', ')}`);
  // `default` n'a pas de site de poussée à citer : aucun code ne la nomme, c'est justement ce
  // qui la rendait invisible à cette garde.
  const sites = poussees.get(q);
  if (sites) {
    console.error('    poussée depuis :');
    for (const f of sites) console.error(`      ${f}`);
  } else {
    console.error('    (file implicite : tout `dispatch()` sans `onQueue()` y atterrit — la majorité des jobs)');
  }
}
console.error(
  `\nLes jobs de ces files s'empilent dans la table \`jobs\` sans jamais s'exécuter, et rien\n` +
    `ne le signale. Ajoute-les au \`--queue=\` de CHAQUE consommateur (l'ordre est la priorité).`
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde. Une option qui fait
// sortir un contrôle en 0 quoi qu'il arrive est une garde armée qui ne mord pas — et
// c'est le défaut le plus difficile à voir, puisque le pipeline reste vert.
process.exit(1);
