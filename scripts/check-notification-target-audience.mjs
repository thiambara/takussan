#!/usr/bin/env node
/**
 * TCK-1763 (P161.05) — garde de l'EXIGENCE DE PAGE des cibles de notification d'administration.
 *
 * Une cible qui mène à une page de `PAGES_ADMIN` (`takussan-web/src/lib/access/pages-admin.ts`) est
 * déclarée ci-dessous, dans `EXIGENCES`, avec l'exigence de sa page (rôle, `kind` d'agence,
 * capacité) telle que ses émetteurs l'ont lue en choisissant leurs destinataires. La garde rougit
 * quand la page change d'exigence, quand une cible neuve vise une page d'administration sans y être
 * déclarée, ou quand une déclaration ne vise plus une telle page : on relit alors les destinataires
 * de ses émetteurs. L'angle 161 du fichier de pistes a relevé quatre avis qui menaient à une page
 * fermée à leur destinataire, tous verts sous `check-notification-target-paths.mjs` — qui ne vérifie
 * que l'existence de la page.
 *
 * Indexée par GENRE de cible, non par code : le genre d'un code n'est pas statique
 * (`payouts:remind-due` le choisit selon le destinataire, TCK-1467), celui d'une cible l'est.
 *
 * ⚠ Ce qu'elle ne voit pas : elle ne lit PAS les destinataires, elle oblige à les relire quand la
 * page bouge. Et une cible hors de `PAGES_ADMIN` (`/app/payments?tab=…`) n'y est pas jugée.
 *
 * Usage :
 *   node scripts/check-notification-target-audience.mjs            # sort en 1 au moindre écart
 *   node scripts/check-notification-target-audience.mjs --report   # + chaque cible d'administration
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lirePaths } from './check-notification-target-paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SOURCE = join(ROOT, 'takussan-api', 'app', 'Domain', 'Notifications', 'NotificationTarget.php');
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

function main() {
  const paths = lirePaths(readFileSync(SOURCE, 'utf8'));
  const pages = lirePagesAdmin(readFileSync(PAGES_ADMIN, 'utf8'));
  if (REPORT) {
    for (const { kind, chemin } of paths) {
      const page = pages.get(chemin.split('?')[0]);
      if (page) console.log(`  ${kind.padEnd(20)} ${chemin.padEnd(36)} ${JSON.stringify(page)}`);
    }
  }
  const ecarts = ecartsDExigence(paths, pages);
  if (ecarts.length > 0) {
    console.error(`✗ ${ecarts.length} cible(s) d'administration dont l'exigence de page n'est plus celle que leurs émetteurs ont lue :`);
    for (const e of ecarts) console.error(`    ${e}`);
    console.error('  Relire les destinataires des émetteurs de la cible, puis mettre EXIGENCES à jour.');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${Object.keys(EXIGENCES).length} cibles de notification visent une page d'administration, chacune à l'exigence déclarée.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
