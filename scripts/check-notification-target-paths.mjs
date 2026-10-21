#!/usr/bin/env node
/**
 * Garde des CIBLES DE NOTIFICATION : chaque chemin de `NotificationTarget::PATHS` (API) mène à une
 * page du front.
 *
 * La cloche fait de chaque notification un lien vers une page de console, et ce lien s'écrit côté
 * API (`takussan-api/app/Domain/Notifications/NotificationTarget.php`) pour une page qui vit côté
 * front (`takussan-web/src/app`). Rien ne vérifiait que les deux restent d'accord. **Ce que la
 * première lecture a trouvé** (TCK-649, 2026-10-14) : `review_moderation` visait `/admin/reviews`,
 * page qui n'a jamais existé — chaque notification de modération d'avis menait à un 404, depuis
 * TCK-597. Et ADR-0064 déplace toute l'administration d'agence de `/admin` vers `/app/agency` : six
 * chemins à réécrire d'un côté, sans rien pour dire qu'ils suivent l'autre.
 *
 * Résolution : on retire la chaîne de requête, puis on cherche le chemin dans l'arborescence de
 * `app/` comme le fait Next — un groupe `(x)` est transparent, `{id}` doit tomber sur un segment
 * dynamique `[x]`, et le dossier atteint doit porter un `page.tsx`.
 *
 * ⚠ Ce qu'elle ne voit pas : qu'une page EXISTE ne dit pas qu'elle s'ouvre pour le destinataire
 * (garde serveur, `kind` d'agence) — c'est l'affaire des gardes de page. Et les catch-all
 * `[...x]` NE COMPTENT PAS : `app/(dashboard)/app/[...introuvable]` attrape toute adresse inconnue
 * pour rendre un 404 maison. Le laisser résoudre aurait rendu tout chemin « valide ».
 *
 * Usage :
 *   node scripts/check-notification-target-paths.mjs            # sort en 1 au moindre chemin mort
 *   node scripts/check-notification-target-paths.mjs --report   # + la résolution de chaque chemin
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SOURCE = join(ROOT, 'takussan-api', 'app', 'Domain', 'Notifications', 'NotificationTarget.php');
const APP = join(ROOT, 'takussan-web', 'src', 'app');

/** Les entrées `'kind' => '/chemin'` du tableau `PATHS`, et elles seules. */
export function lirePaths(php) {
  const bloc = php.match(/public const PATHS = \[([\s\S]*?)\n\s*\];/);
  if (!bloc) throw new Error('PATHS introuvable dans NotificationTarget.php — la garde ne sait plus lire sa source.');
  const sortie = [];
  for (const m of bloc[1].matchAll(/^\s*'([a-z_]+)'\s*=>\s*'([^']+)'/gm)) sortie.push({ kind: m[1], chemin: m[2] });
  return sortie;
}

const sousDossiers = (dir) =>
  readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());

/** Les dossiers atteints par `segments` depuis `dir` — groupes transparents, `{id}` → `[x]`. */
function resoudre(dir, segments) {
  // Un groupe `(x)` ne consomme aucun segment : on le traverse à tout niveau.
  const viaGroupes = sousDossiers(dir)
    .filter((n) => n.startsWith('(') && n.endsWith(')'))
    .flatMap((n) => resoudre(join(dir, n), segments));
  if (segments.length === 0) return [dir, ...viaGroupes];
  const [tete, ...reste] = segments;
  const suivants = sousDossiers(dir).filter((n) =>
    tete === '{id}'
      ? /^\[[^.\]][^\]]*\]$/.test(n) // dynamique simple ; jamais un catch-all `[...x]`
      : n === tete,
  );
  return [...suivants.flatMap((n) => resoudre(join(dir, n), reste)), ...viaGroupes];
}

export function pageDe(chemin, app = APP) {
  const segments = chemin.split('?')[0].split('/').filter(Boolean);
  return resoudre(app, segments).map((d) => join(d, 'page.tsx')).find((f) => existsSync(f)) ?? null;
}

function main() {
  const paths = lirePaths(readFileSync(SOURCE, 'utf8'));
  if (paths.length === 0) throw new Error('PATHS est vide — la garde ne lit plus rien, elle ne prouverait rien.');
  const morts = [];
  for (const { kind, chemin } of paths) {
    const page = pageDe(chemin);
    if (REPORT) console.log(`  ${page ? '✓' : '✗'} ${kind.padEnd(18)} ${chemin.padEnd(36)} ${page ? relative(ROOT, page) : '— aucune page'}`);
    if (!page) morts.push(`${kind} → ${chemin}`);
  }
  if (morts.length > 0) {
    console.error(`✗ ${morts.length} cible(s) de notification sans page dans takussan-web/src/app :`);
    for (const m of morts) console.error(`    ${m}`);
    console.error('  Corriger NotificationTarget::PATHS, ou créer la page. Une notification qui mène à un 404 est un lien peint sur un mur.');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${paths.length} cibles de notification, chacune mène à une page du front.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
