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
const APP = join(ROOT, 'takussan-api', 'app');

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
  /(?:public|protected|private)\s+(?:readonly\s+)?\$queue\s*=\s*['"]([a-z0-9_-]+)['"]/g,
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

const poussees = new Map(); // file → [chemins]
const opaques = []; // [chemin, expression]
function balayer(dir) {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      balayer(chemin);
      continue;
    }
    if (!entree.endsWith('.php')) continue;
    const txt = readFileSync(chemin, 'utf8');
    const rel = chemin.slice(ROOT.length + 1);
    for (const brut of MOTIFS) {
      const motif = brut.motif ?? brut;
      for (const m of txt.matchAll(motif)) {
        if (brut.ligneDoitContenir) {
          const debut = txt.lastIndexOf('\n', m.index) + 1;
          const fin = txt.indexOf('\n', m.index);
          if (!brut.ligneDoitContenir.test(txt.slice(debut, fin === -1 ? undefined : fin))) continue;
        }
        if (!poussees.has(m[1])) poussees.set(m[1], []);
        if (!poussees.get(m[1]).includes(rel)) poussees.get(m[1]).push(rel);
      }
    }
    for (const m of txt.matchAll(OPAQUE)) {
      opaques.push([rel, (m[1] ?? m[2]).trim()]);
    }
  }
}
balayer(APP);

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
  const ligne = readFileSync(fichier, 'utf8')
    .split('\n')
    .find((l) => l.includes('artisan queue:work') && !/^\s*#/.test(l));
  if (!ligne) {
    console.error(`✗ aucune ligne \`artisan queue:work\` dans ${fichier.slice(ROOT.length + 1)} (« ${ou} »).`);
    console.error('  La garde le dit plutôt que de passer en silence.');
    process.exit(1);
  }
  const m = ligne.match(/--queue=([a-z0-9_,-]+)/);
  if (!m) {
    const autres = [...poussees.keys()].filter((q) => q !== 'default');
    console.error(`✗ le \`queue:work\` de « ${ou} » (${fichier.slice(ROOT.length + 1)}) n'a pas de \`--queue=\`.`);
    console.error('  Il ne consommera donc QUE la file `default`, et les jobs poussés sur');
    console.error(`  ${autres.join(', ') || '(aucune autre file)'} ne seront jamais exécutés.`);
    process.exit(1);
  }
  lus.push({ ou, fichier, files: new Set(m[1].split(',')) });
}

// L'union serait indulgente : une file consommée en production mais pas en local resterait
// invisible. On exige donc que CHAQUE consommateur couvre CHAQUE file.
const consommees = new Set(lus.flatMap((c) => [...c.files]));

/* ── 3. l'écart ──────────────────────────────────────────────────────────── */
const orphelines = [];
for (const q of poussees.keys()) {
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
for (const [f, expr] of opaques) {
  console.warn(
    `⚠ ${f} pousse sur une file nommée par une expression (\`${expr}\`) : cette garde ne peut pas\n`
    + `  la résoudre. Vérifie À LA MAIN qu'elle figure dans le \`--queue=\` des ${CONSOMMATEURS.length} consommateurs.`
  );
}

if (orphelines.length === 0) {
  console.log(`✓ files de jobs : les ${poussees.size} files poussées par le code sont consommées par les ${lus.length} consommateurs.`);
  process.exit(0);
}

console.error(`\n✗ ${orphelines.length} file(s) poussée(s) par le code et non consommée(s) quelque part :\n`);
for (const [q, ou] of orphelines) {
  console.error(`  · \`${q}\` — absente de : ${ou.join(', ')}`);
  console.error('    poussée depuis :');
  for (const f of poussees.get(q)) console.error(`      ${f}`);
}
console.error(
  `\nLes jobs de ces files s'empilent dans la table \`jobs\` sans jamais s'exécuter, et rien\n` +
    `ne le signale. Ajoute-les au \`--queue=\` de CHAQUE consommateur (l'ordre est la priorité).`
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde. Une option qui fait
// sortir un contrôle en 0 quoi qu'il arrive est une garde armée qui ne mord pas — et
// c'est le défaut le plus difficile à voir, puisque le pipeline reste vert.
process.exit(1);
