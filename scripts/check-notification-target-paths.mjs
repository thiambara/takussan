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
 * TCK-1763 (P161.05) — **l'exigence de la page d'une cible d'administration**. Une cible qui mène à
 * une page de `PAGES_ADMIN` (`takussan-web/src/lib/access/pages-admin.ts`) est déclarée ci-dessous,
 * dans `EXIGENCES`, avec l'exigence de sa page (rôle, `kind` d'agence, capacité) telle que ses
 * émetteurs l'ont lue en choisissant leurs destinataires. La garde rougit quand la page change
 * d'exigence, quand une cible neuve vise une page d'administration sans y être déclarée, ou quand
 * une déclaration ne vise plus une telle page : on relit alors les destinataires de ses émetteurs.
 * L'angle 161 a relevé quatre avis qui menaient à une page fermée à leur destinataire.
 *
 * ⚠ Ce qu'elle ne voit pas : qu'une page EXISTE ne dit pas qu'elle s'ouvre pour le destinataire
 * (garde serveur, `kind` d'agence) — c'est l'affaire des gardes de page. La table `EXIGENCES` ne
 * lit PAS les destinataires : elle oblige à les relire quand la page bouge. Et les catch-all
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
const PAGES_ADMIN = join(ROOT, 'takussan-web', 'src', 'lib', 'access', 'pages-admin.ts');

/**
 * TCK-1763 (P161.05) — genre de cible → exigence de la page qu'il ouvre, et qui la reçoit.
 * Changer une ligne ici, c'est avoir relu les destinataires des émetteurs qu'elle nomme.
 */
export const EXIGENCES = {
  // `NotifyStatement{Imported,Finalized}` : l'auteur du geste, admin (`BankStatementPolicy`) ;
  // `payouts:remind-due` : l'émetteur admin de l'agence (TCK-1467).
  finances: { role: 'admin' },
  // Le bénéficiaire d'une délégation (sa cible reste au porteur, TCK-1471).
  team: { role: 'admin', agence: 'standard', ouvertePar: ['team.invite', 'team.assign_role', 'team.suspend'] },
  // Le délégant (TCK-1471).
  role_delegations: { role: 'admin', agence: 'standard', capacite: 'team.assign_role', ouvertePar: ['team.assign_role'] },
  // Les détenteurs de `payouts.approve` (assouplissement du seuil, reste de P161.02 au porteur).
  agency_settings: { role: 'admin' },
  // Le verdict et l'échéance du KYC : les admins actifs (TCK-1763 pour le verdict).
  agency_kyc: { role: 'admin', capacite: 'agency.update_kyc', ouvertePar: ['agency.update_kyc'] },
  // Les alertes de gouvernance, aux admins d'une agence `standard` seulement (TCK-1763).
  audit: { role: 'admin', agence: 'standard' },
  // `ReviewNotifier::toModerate` : les admins d'une agence `standard`.
  review_moderation: { role: 'admin', agence: 'standard' },
  // `PropertyModerationNotifier` : les admins de l'agence du bien.
  property_moderation: { role: 'admin', agence: 'standard' },
};

/** `chemin` → exigence, lues dans la table `TABLE` de `pages-admin.ts`. */
export function lirePagesAdmin(ts) {
  const sortie = new Map();
  for (const m of ts.matchAll(/chemin:\s*'([^']+)',\s*exige:\s*(\{[^}]*\})/g)) {
    const json = m[2]
      .replace(/'/g, '"')
      .replace(/([{,]\s*)([a-zA-Z]+)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, '$1');
    sortie.set(m[1], JSON.parse(json));
  }
  if (sortie.size === 0) throw new Error('aucune page lue dans pages-admin.ts — la garde ne sait plus lire sa source.');
  return sortie;
}

const memeExigence = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());

/** Les écarts entre `EXIGENCES` et les pages d'administration que visent les cibles. */
export function ecartsDExigence(paths, pages, exigences = EXIGENCES) {
  const ecarts = [];
  const vises = new Set();
  for (const { kind, chemin } of paths) {
    const page = pages.get(chemin.split('?')[0]);
    if (!page) continue;
    vises.add(kind);
    const declare = exigences[kind];
    if (!declare) ecarts.push(`${kind} → ${chemin} : page d'administration (${JSON.stringify(page)}) non déclarée dans EXIGENCES`);
    else if (!memeExigence(declare, page)) ecarts.push(`${kind} → ${chemin} : la page exige ${JSON.stringify(page)}, EXIGENCES dit ${JSON.stringify(declare)}`);
  }
  for (const kind of Object.keys(exigences)) {
    if (!vises.has(kind)) ecarts.push(`${kind} : déclaré dans EXIGENCES, mais ne vise plus une page de PAGES_ADMIN`);
  }
  return ecarts;
}

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
  const ecarts = ecartsDExigence(paths, lirePagesAdmin(readFileSync(PAGES_ADMIN, 'utf8')));
  if (ecarts.length > 0) {
    console.error(`✗ ${ecarts.length} cible(s) d'administration dont l'exigence de page n'est plus celle que leurs émetteurs ont lue :`);
    for (const e of ecarts) console.error(`    ${e}`);
    console.error('  Relire les destinataires des émetteurs de la cible (TCK-1763), puis mettre EXIGENCES à jour.');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${paths.length} cibles de notification, chacune mène à une page du front ; ${Object.keys(EXIGENCES).length} visent une page d'administration à l'exigence déclarée.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
