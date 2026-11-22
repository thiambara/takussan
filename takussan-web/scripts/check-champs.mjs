#!/usr/bin/env node
/**
 * CHAQUE CHAMP PREND UN PROFIL DE CLAVIER ET UN PLACEHOLDER — ADR-0135 (TCK-2991).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE MOTIF
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Relevé le 2026-11-21 : 369 champs ouvrent un clavier ; `autoCorrect` n'était posé qu'une fois. Les champs
 * de recherche corrigeaient « Almadies », un montant en `type="number"` ouvrait le clavier complet sur
 * iPhone, et 200 champs n'avaient aucun exemple sous les yeux. Rien ne l'aurait signalé : ni `tsc`, ni
 * ESLint, ni un test.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET LA RÈGLE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les `.tsx` de `src/`, hors `__tests__/`, `playground/` et les composants qui enveloppent les champs
 * (ils transmettent le profil de leur appelant). Le relevé et ses défauts : `scripts/champs.mjs`.
 *
 * **Cliquet EXACT par fichier** sur `scripts/champs-baseline.json` : un compte qui monte rougit, un fichier
 * neuf avec un défaut rougit, et un compte qui DESCEND rougit aussi tant que la base n'est pas réécrite — un
 * cliquet à sens unique est une tolérance, qui laisse remonter un compte jusqu'à son ancien plafond. La base
 * descend à zéro dans ce chantier (TCK-2994) ; vide, la règle n'a plus d'exception.
 *
 *     node scripts/check-champs.mjs            (npm run check:champs, branchée dans web-ci.yml)
 *     node scripts/check-champs.mjs --report   le compte, par défaut et par fichier
 *     node scripts/check-champs.mjs --update   réécrit la base sur l'arbre courant
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compter, DEFAUTS, relever } from './champs.mjs';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(WEB, 'scripts', 'champs-baseline.json');

/** Les composants qui enveloppent un champ : ils transmettent le profil et le placeholder de l'appelant. */
export const ENVELOPPES = new Set([
  'src/components/ui/input.tsx',
  'src/components/ui/textarea.tsx',
  'src/components/ui/phone-input.tsx',
  'src/components/forms/FormInput.tsx',
  'src/components/forms/FormTextarea.tsx',
  'src/components/forms/FormAmountInput.tsx',
]);

function fichiers(dossier) {
  const out = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'playground' || e.name === 'node_modules') continue;
      out.push(...fichiers(chemin));
    } else if (e.name.endsWith('.tsx')) out.push(chemin);
  }
  return out;
}

/** Le relevé de l'arbre : `{ fichier: { sansProfil, sansPlaceholder, nombre, reglage } }`, fichiers fautifs seuls. */
export function releve(racine = WEB) {
  const parFichier = {};
  for (const chemin of fichiers(join(racine, 'src'))) {
    const rel = relative(racine, chemin).split('\\').join('/');
    if (ENVELOPPES.has(rel)) continue;
    const compte = compter(readFileSync(chemin, 'utf8'));
    if (compte) parFichier[rel] = compte;
  }
  return Object.fromEntries(Object.entries(parFichier).sort(([a], [b]) => a.localeCompare(b)));
}

/** Les écarts entre le relevé et la base, en phrases. */
export function ecarts(actuel, base) {
  const out = [];
  for (const f of new Set([...Object.keys(actuel), ...Object.keys(base)])) {
    for (const d of DEFAUTS) {
      const a = actuel[f]?.[d] ?? 0;
      const b = base[f]?.[d] ?? 0;
      if (a > b) out.push(`${f} — ${d} : ${a} (base ${b}) ↑ un champ neuf doit porter son profil et son placeholder`);
      else if (a < b) out.push(`${f} — ${d} : ${a} (base ${b}) ↓ bravo : réécrire la base (--update)`);
    }
  }
  return out;
}

const executeDirectement = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (executeDirectement) {
  const actuel = releve();
  if (process.argv.includes('--update')) {
    writeFileSync(BASE, JSON.stringify(actuel, null, 2) + '\n');
    console.log(`✓ base réécrite : ${Object.keys(actuel).length} fichier(s).`);
    process.exit(0);
  }
  if (process.argv.includes('--report')) {
    const totaux = Object.fromEntries(DEFAUTS.map((d) => [d, 0]));
    for (const c of Object.values(actuel)) for (const d of DEFAUTS) totaux[d] += c[d];
    console.log(`Champs fautifs dans ${Object.keys(actuel).length} fichier(s) :`, totaux);
    for (const f of Object.keys(actuel)) {
      const lignes = relever(readFileSync(join(WEB, f), 'utf8')).filter((x) => x.defauts.length).map((x) => `${x.ligne}:${x.defauts.join('+')}`);
      console.log(`  ${f}  ${lignes.join('  ')}`);
    }
    process.exit(0);
  }
  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  const liste = ecarts(actuel, base);
  if (liste.length) {
    console.error(`✗ check:champs — ${liste.length} écart(s) avec scripts/champs-baseline.json (ADR-0135) :`);
    for (const l of liste) console.error('  ' + l);
    process.exit(1);
  }
  console.log(`✓ check:champs — conforme à la base (${Object.keys(actuel).length} fichier(s) encore fautif(s)).`);
}
