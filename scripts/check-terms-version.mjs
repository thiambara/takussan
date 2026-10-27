#!/usr/bin/env node
/**
 * Garde : la version des CGU que l'API inscrit à l'acceptation est celle que le front affiche.
 *
 * **Pourquoi.** `PublishReadiness::TERMS_VERSION` (`takussan-api/app/Services/Property/
 * PublishReadiness.php`) est la version inscrite dans `users.terms_version` à la première
 * publication. Elle doit désigner le texte que la personne a lu, c'est-à-dire
 * `VERSION_DOCUMENTS.date` de `takussan-web/src/content/legal/editeur.ts`. Le docblock disait
 * « à changer ensemble » : mesuré le 2026-10-27, l'API inscrivait encore `2026-09-17` quand les
 * documents affichaient déjà une révision plus récente. Un commentaire ne relie pas deux fichiers
 * de deux applications ; une garde, si.
 *
 * **Ce qu'elle lit.** La constante PHP (`AAAA-MM-JJ`), puis `date` (« 27 octobre 2026 ») et `dateEn`
 * (« October 27, 2026 ») de `VERSION_DOCUMENTS` : les trois doivent désigner le même jour.
 *
 * **Ce qu'elle ne prouve pas.** Qu'un changement des textes ait bien fait avancer la date : c'est
 * la règle de `takussan-web/src/content/legal/README.md`, que rien ne mesure.
 *
 * Ses propres tests (`CAS_EPREUVE`) tournent à chaque invocation.
 *
 *   node scripts/check-terms-version.mjs            # garde
 *   node scripts/check-terms-version.mjs --report   # + les trois dates lues
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const PHP = join(ROOT, 'takussan-api', 'app', 'Services', 'Property', 'PublishReadiness.php');
const EDITEUR = join(ROOT, 'takussan-web', 'src', 'content', 'legal', 'editeur.ts');

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

export function lireVersionApi(php) {
  const m = php.match(/const\s+TERMS_VERSION\s*=\s*'(\d{4}-\d{2}-\d{2})'/);
  return m ? m[1] : null;
}

export function lireVersionsFront(ts) {
  const bloc = ts.match(/VERSION_DOCUMENTS\s*=\s*\{([\s\S]*?)\}/);
  if (!bloc) return { fr: null, en: null };
  const fr = bloc[1].match(/\bdate:\s*'(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})'/);
  const en = bloc[1].match(/\bdateEn:\s*'([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})'/);
  const moisFr = fr ? MOIS_FR.indexOf(fr[2]) + 1 : 0;
  const moisEn = en ? MOIS_EN.indexOf(en[1]) + 1 : 0;
  return {
    fr: fr && moisFr > 0 ? iso(fr[3], moisFr, fr[1]) : null,
    en: en && moisEn > 0 ? iso(en[3], moisEn, en[2]) : null,
  };
}

export function verifier(php, ts) {
  const erreurs = [];
  const api = lireVersionApi(php);
  const { fr, en } = lireVersionsFront(ts);
  if (!api) erreurs.push('PublishReadiness::TERMS_VERSION illisible (attendu AAAA-MM-JJ)');
  if (!fr) erreurs.push('VERSION_DOCUMENTS.date illisible (attendu « 27 octobre 2026 »)');
  if (!en) erreurs.push('VERSION_DOCUMENTS.dateEn illisible (attendu « October 27, 2026 »)');
  if (fr && en && fr !== en) erreurs.push(`VERSION_DOCUMENTS : date (${fr}) et dateEn (${en}) ne désignent pas le même jour`);
  if (api && fr && api !== fr) erreurs.push(`TERMS_VERSION (${api}) ≠ VERSION_DOCUMENTS.date (${fr}) : l'API inscrirait une autre version que celle affichée`);
  return { erreurs, api, fr, en };
}

const editeur = (date, dateEn) => `export const VERSION_DOCUMENTS = {\n  date: '${date}',\n  dateEn: '${dateEn}',\n} as const;`;
const CAS_EPREUVE = [
  { nom: 'trois dates concordantes passent', php: "public const TERMS_VERSION = '2026-10-27';", ts: editeur('27 octobre 2026', 'October 27, 2026'), erreurs: 0 },
  { nom: "l'API en retard rougit", php: "public const TERMS_VERSION = '2026-09-17';", ts: editeur('27 octobre 2026', 'October 27, 2026'), erreurs: 1 },
  { nom: "fr et en divergents rougissent", php: "public const TERMS_VERSION = '2026-10-27';", ts: editeur('27 octobre 2026', 'October 28, 2026'), erreurs: 1 },
  { nom: 'le premier du mois et un accent se lisent', php: "public const TERMS_VERSION = '2026-08-01';", ts: editeur('1er août 2026', 'August 1, 2026'), erreurs: 0 },
  { nom: 'une constante absente rougit', php: 'final class PublishReadiness {}', ts: editeur('27 octobre 2026', 'October 27, 2026'), erreurs: 1 },
  { nom: 'un mois inconnu rougit', php: "public const TERMS_VERSION = '2026-10-27';", ts: editeur('27 octobr 2026', 'October 27, 2026'), erreurs: 1 },
];

let echec = false;
for (const cas of CAS_EPREUVE) {
  const { erreurs } = verifier(cas.php, cas.ts);
  if (erreurs.length !== cas.erreurs) {
    console.error(`✗ épreuve « ${cas.nom} » : ${erreurs.length} erreur(s) au lieu de ${cas.erreurs}`, erreurs);
    echec = true;
  }
}
if (echec) process.exit(1);

const { erreurs, api, fr, en } = verifier(readFileSync(PHP, 'utf8'), readFileSync(EDITEUR, 'utf8'));
if (REPORT) console.log(`  TERMS_VERSION ${api} · date ${fr} · dateEn ${en}`);
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ check-terms-version : l'API inscrit la version affichée (${api})`);
