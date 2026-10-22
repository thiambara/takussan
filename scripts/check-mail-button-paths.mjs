#!/usr/bin/env node
/**
 * Garde des BOUTONS DE COURRIEL : chaque chemin que déclare
 * `takussan-api/tests/Feature/Notifications/LiensDesCourrielsTest.php::CHEMINS_DU_FRONT` mène à une
 * page du front — P97.05 (TCK-1245).
 *
 * `check-notification-target-paths.mjs` garde les cibles de la cloche (`NotificationTarget::PATHS`).
 * Les `toMail()`, eux, écrivaient leurs liens de console à la main, hors de `PATHS`, et rien ne les
 * gardait : le bouton de l'alerte de seuil a mené à l'hôte de l'API (P97.01). Le travail est coupé
 * en deux, chacun là où il peut se faire :
 *
 *   · le test de l'API REND chaque `toMail()` à bouton et exige que son `actionUrl` soit sur la base
 *     du front, au chemin que déclare `CHEMINS_DU_FRONT` ; il ne lit pas le front, que la clé
 *     d'attestation de l'API (ADR-0063) ne couvre pas ;
 *   · cette garde, qui lit les deux côtés, résout chaque chemin en `page.tsx`, par la résolution de
 *     la garde des cibles (`pageDe` : groupes transparents, `{id}` sur un segment dynamique simple,
 *     jamais un catch-all). `{locale}` y est lu comme `{id}` : il tombe sur `[locale]`.
 *
 * Usage :
 *   node scripts/check-mail-button-paths.mjs            # sort en 1 au moindre chemin mort
 *   node scripts/check-mail-button-paths.mjs --report   # + la résolution de chaque chemin
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pageDe } from './check-notification-target-paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const SOURCE = join(ROOT, 'takussan-api', 'tests', 'Feature', 'Notifications', 'LiensDesCourrielsTest.php');

/** Les entrées `'Classe' => '/chemin'` de `CHEMINS_DU_FRONT`, et elles seules. */
export function lireChemins(php) {
  const bloc = php.match(/public const CHEMINS_DU_FRONT = \[([\s\S]*?)\n\s*\];/);
  if (!bloc) throw new Error('CHEMINS_DU_FRONT introuvable dans LiensDesCourrielsTest.php — la garde ne sait plus lire sa source.');
  const sortie = [];
  for (const m of bloc[1].matchAll(/^\s*'([A-Za-z]+)'\s*=>\s*'([^']+)'/gm)) sortie.push({ classe: m[1], chemin: m[2] });
  return sortie;
}

function main() {
  const chemins = lireChemins(readFileSync(SOURCE, 'utf8'));
  if (chemins.length === 0) throw new Error('CHEMINS_DU_FRONT est vide — la garde ne lit plus rien, elle ne prouverait rien.');
  const morts = [];
  for (const { classe, chemin } of chemins) {
    const page = pageDe(chemin.replaceAll('{locale}', '{id}'));
    if (REPORT) console.log(`  ${page ? '✓' : '✗'} ${classe.padEnd(42)} ${chemin.padEnd(44)} ${page ? relative(ROOT, page) : '— aucune page'}`);
    if (!page) morts.push(`${classe} → ${chemin}`);
  }
  if (morts.length > 0) {
    console.error(`✗ ${morts.length} bouton(s) de courriel sans page dans takussan-web/src/app :`);
    for (const m of morts) console.error(`    ${m}`);
    console.error('  Corriger le lien du courriel et LiensDesCourrielsTest::CHEMINS_DU_FRONT, ou créer la page.');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${chemins.length} boutons de courriel, chacun mène à une page du front.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
