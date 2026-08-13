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
 * les `onQueue('…')` du code, et la liste `--queue=` de `scripts/server-setup.sh`.
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
 * TOUS les consommateurs, pas seulement celui de production.
 *
 * Une première version ne lisait que `server-setup.sh`. Le `--queue` a donc été corrigé en
 * production… et `dev.sh` a continué de lancer `queue:work` sans lui, réintroduisant en local
 * le défaut exact que la garde venait de fermer en production — au vert, puisqu'elle ne
 * regardait pas là. *Une garde qui ne couvre qu'un côté déplace le défaut au lieu de le
 * supprimer.*
 */
const CONSOMMATEURS = [
  { fichier: join(ROOT, 'scripts', 'server-setup.sh'), ou: 'production (unité systemd)' },
  { fichier: join(ROOT, 'dev.sh'), ou: 'développement local' },
];

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
  lignes.forEach((ligne, i) => {
    let m = ligne.match(/--queue=([a-z0-9_,-]+)/);

    // `--queue=${var}` : on RÉSOUT la variable dans le même fichier plutôt que d'abandonner.
    //
    // `server-setup.sh` génère désormais deux unités systemd depuis une seule fonction, et la
    // liste des files lui arrive en paramètre — l'`ExecStart` du script porte donc
    // `--queue=${files_worker}`. Une garde qui ne lit que des littéraux aurait ici deux issues,
    // toutes deux mauvaises : rendre « pas de --queue= » (faux, et elle bloque une refonte
    // légitime), ou passer en silence (pire). On cherche donc les valeurs littérales que la
    // variable reçoit — ici les arguments des appels en bas du fichier.
    //
    // *Une garde doit suivre l'indirection d'un cran quand le code en pose une ; sinon c'est
    // elle qui dicte comment le code a le droit d'être écrit.*
    if (!m) {
      const varMatch = ligne.match(/--queue=\$\{?(\w+)\}?/);
      if (varMatch) {
        // Valeurs littérales assignées à cette variable, ou passées en argument positionnel.
        const nom = varMatch[1];
        const litteraux = [
          ...contenu.matchAll(new RegExp(`${nom}=["']?([a-z0-9_,-]+)["']?`, 'g')),
          ...contenu.matchAll(/^\s*setup_queue_service\s+\S+\s+\S+\s+["']([a-z0-9_,-]+)["']/gm),
        ].map((x) => x[1]);
        if (litteraux.length) m = [null, litteraux.join(',')];
      }
    }

    if (!m) {
      const autres = [...poussees.keys()].filter((q) => q !== 'default');
      const quel = lignes.length > 1 ? ` (worker n°${i + 1} sur ${lignes.length})` : '';
      console.error(`✗ un \`queue:work\` de « ${ou} »${quel} (${fichier.slice(ROOT.length + 1)}) n'a pas de \`--queue=\`.`);
      console.error('  Il ne consommera donc QUE la file `default`, et les jobs poussés sur');
      console.error(`  ${autres.join(', ') || '(aucune autre file)'} ne seront jamais exécutés.`);
      process.exit(1);
    }
    m[1].split(',').forEach((q) => files.add(q));
  });
  lus.push({ ou, fichier, files, workers: lignes.length });
}

// L'union serait indulgente : une file consommée en production mais pas en local resterait
// invisible. On exige donc que CHAQUE consommateur couvre CHAQUE file.
const consommees = new Set(lus.flatMap((c) => [...c.files]));

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

if (orphelines.length === 0) {
  console.log(`✓ files de jobs : les ${EXIGEES.size} files exigées (dont \`default\`) sont consommées par les ${lus.length} consommateurs.`);
  process.exit(0);
}

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
