#!/usr/bin/env node
/**
 * Garde des DEUX listes tenues à la main de `.design-sync/` (TCK-582).
 *
 * Le système de design est synchronisé vers claude.ai/design depuis un paquet fabriqué :
 * `.design-sync/entry/index.ts` réexporte les primitives de `takussan-web/src/components/ui/`, et
 * le convertisseur fait une carte de composant de chaque nom en PascalCase qu'il y trouve — sauf
 * ceux que `componentSrcMap` (dans `.design-sync/config.json`) exclut en les mettant à `null`.
 * Les deux listes dérivent des fichiers de `ui/`, et rien ne les tenait d'accord :
 *
 *   · une primitive ajoutée à `ui/` sans ligne dans `index.ts` n'est **pas synchronisée** — l'agent
 *     de claude.ai/design continue de dessiner sans elle, et rien ne le dit ;
 *   · une sous-partie ajoutée (`DialogBody`…) sans exclusion devient une **carte racine** de plus,
 *     sans fiche ni aperçu — exactement le bruit que les 61 exclusions existent pour éteindre.
 *
 * Ce qu'elle vérifie :
 *   A. chaque module de `ui/` (hors `__tests__`) est réexporté par `index.ts`, et chaque
 *      `export *` de `index.ts` vise un fichier qui existe ;
 *   B. chaque nom de VALEUR exporté par ces modules, s'il a la forme d'un composant (PascalCase),
 *      est SOIT une racine — il a sa fiche `.design-sync/docs/<Nom>.md` et son aperçu
 *      `.design-sync/previews/<Nom>.tsx` —, SOIT exclu par `componentSrcMap`. Jamais les deux,
 *      jamais aucun des deux. Minuscules (`cn`, `useToast`, `buttonVariants`), CONSTANTES et
 *      `*Props` ne sont pas des composants ;
 *   C. rien de périmé : une fiche, un aperçu ou une exclusion qui ne nomme plus aucun export.
 *
 * ⚠ Elle lit les exports par motifs, pas par un compilateur — c'est délibéré (le scan i18n est
 * mort au bump `typescript@7` pendant que tout restait vert, J-40). Elle REFUSE DE CONCLURE sur une
 * forme qu'elle ne reconnaît pas (`export default`, `export *` dans un module de `ui/`…) :
 * « je ne sais pas lire ce fichier » plutôt que « il n'exporte rien ».
 *
 * Usage :
 *   node scripts/check-design-sync-entry.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-design-sync-entry.mjs --report   # + l'inventaire racines / exclusions
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const DS = join(ROOT, '.design-sync');
const ENTRY = join(DS, 'entry', 'index.ts');
const CONFIG = join(DS, 'config.json');
const UI = join(ROOT, 'takussan-web', 'src', 'components', 'ui');

const rel = (p) => relative(ROOT, p);
const erreurs = [];

if (!existsSync(ENTRY) || !existsSync(CONFIG)) {
  // Pas de synchro configurée : rien à garder. Le dire plutôt que de passer en silence.
  console.log('check-design-sync-entry : aucune synchro .design-sync/ configurée — rien à vérifier.');
  process.exit(0);
}

const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

/** Résout un spécifieur relatif vers un fichier .ts/.tsx existant, ou `null`. */
function resoudreModule(depuis, specifieur) {
  const base = resolve(dirname(depuis), specifieur);
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidat) && /\.tsx?$/.test(candidat)) return candidat;
  }
  return null;
}

/**
 * Les noms de VALEUR exportés par un module. `{ noms, inconnu }` — `inconnu` liste les formes
 * d'export que ce lecteur ne sait pas interpréter ; le fichier est alors refusé, pas lu à moitié.
 */
function exportsDe(fichier) {
  const src = sansCommentaires(readFileSync(fichier, 'utf8'));
  const noms = new Set();
  const inconnu = [];

  for (const m of src.matchAll(/^export\s+(?:async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    noms.add(m[2]);
  }
  for (const m of src.matchAll(/^export\s+(type\s+)?\{([^}]*)\}/gm)) {
    if (m[1]) continue; // `export type { … }` : que des types
    for (const brut of m[2].split(',')) {
      const morceau = brut.trim();
      if (!morceau || morceau.startsWith('type ')) continue;
      const nom = morceau.split(/\s+as\s+/).pop().trim();
      if (nom === 'default') inconnu.push(`export { … as default }`);
      else noms.add(nom);
    }
  }
  for (const m of src.matchAll(/^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/gm)) noms.add(m[1]);

  // Tout `export` de début de ligne doit avoir été compris par l'un des motifs ci-dessus.
  for (const m of src.matchAll(/^export\s+(\S+)(\s+\S+)?/gm)) {
    const [mot, suite = ''] = [m[1], m[2]?.trim() ?? ''];
    if (/^(async|function\*?|const|let|var|class|type|interface|enum|\{)$/.test(mot)) continue;
    if (mot.startsWith('{')) continue;
    if (mot === '*' && suite === 'as') continue;
    if (mot === 'declare' || mot === 'abstract') { inconnu.push(`export ${mot} …`); continue; }
    inconnu.push(`export ${mot}${suite ? ` ${suite}` : ''}`);
  }
  return { noms, inconnu };
}

// ── A. Chaque module de ui/ est réexporté ───────────────────────────────────────────────────

const entree = sansCommentaires(readFileSync(ENTRY, 'utf8'));
const modulesEntree = new Map(); // fichier → spécifieur
for (const m of entree.matchAll(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)) {
  const fichier = resoudreModule(ENTRY, m[1]);
  if (!fichier) erreurs.push(`${rel(ENTRY)} : \`export * from '${m[1]}'\` ne vise aucun fichier .ts/.tsx.`);
  else modulesEntree.set(fichier, m[1]);
}

const modulesUi = readdirSync(UI, { withFileTypes: true })
  .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name))
  .map((e) => join(UI, e.name));
for (const fichier of modulesUi) {
  if (!modulesEntree.has(fichier)) {
    erreurs.push(
      `${rel(fichier)} n'est pas réexporté par ${rel(ENTRY)} — la primitive ne sera pas synchronisée ` +
        `vers claude.ai/design. Ajouter : export * from '${relative(dirname(ENTRY), fichier).replace(/\.tsx?$/, '')}';`,
    );
  }
}

// ── B. Chaque composant exporté est racine OU exclu ─────────────────────────────────────────

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const carte = config.componentSrcMap ?? {};
const exclus = new Set();
for (const [nom, valeur] of Object.entries(carte)) {
  if (valeur === null) exclus.add(nom);
  else erreurs.push(`${rel(CONFIG)} : componentSrcMap.${nom} = ${JSON.stringify(valeur)} — forme non comprise par cette garde (seul \`null\`, « exclu », l'est).`);
}
const nomsDe = (dossier, ext) =>
  existsSync(dossier) ? new Set(readdirSync(dossier).filter((f) => f.endsWith(ext)).map((f) => basename(f, ext))) : new Set();
const fiches = nomsDe(join(DS, 'docs'), '.md');
const apercus = nomsDe(join(DS, 'previews'), '.tsx');

const estComposant = (nom) => /^[A-Z]/.test(nom) && !/^[A-Z0-9_]+$/.test(nom) && !/(Props|Variants)$/.test(nom);

/** nom exporté → module d'origine (pour les messages). */
const composants = new Map();
const sources = [...modulesEntree.keys()];
for (const fichier of sources) {
  const { noms, inconnu } = exportsDe(fichier);
  for (const forme of inconnu) {
    erreurs.push(`${rel(fichier)} : forme d'export non comprise (\`${forme}\`) — je refuse de conclure sur ce fichier.`);
  }
  for (const nom of noms) if (estComposant(nom)) composants.set(nom, rel(fichier));
}
// Les exports nommés d'index.ts lui-même (`export { TakussanProvider } from './provider'`, `Icons`).
{
  const { noms } = exportsDe(ENTRY);
  for (const nom of noms) if (estComposant(nom)) composants.set(nom, rel(ENTRY));
}

const racines = [];
for (const [nom, origine] of [...composants].sort(([a], [b]) => a.localeCompare(b))) {
  const racine = fiches.has(nom) || apercus.has(nom);
  if (racine && exclus.has(nom)) {
    erreurs.push(`${nom} (${origine}) est À LA FOIS une racine (fiche ou aperçu) et exclu par componentSrcMap.`);
  } else if (racine) {
    racines.push(nom);
    if (!fiches.has(nom)) erreurs.push(`${nom} (${origine}) : racine sans fiche .design-sync/docs/${nom}.md.`);
    if (!apercus.has(nom)) erreurs.push(`${nom} (${origine}) : racine sans aperçu .design-sync/previews/${nom}.tsx — sa carte serait un plancher.`);
  } else if (!exclus.has(nom)) {
    erreurs.push(
      `${nom} (${origine}) n'est ni une racine ni exclu : le convertisseur en ferait une carte de ` +
        `composant nue. Sous-partie → "${nom}": null dans componentSrcMap ; composant → sa fiche et son aperçu.`,
    );
  }
}

// ── C. Rien de périmé ───────────────────────────────────────────────────────────────────────

for (const nom of exclus) if (!composants.has(nom)) erreurs.push(`componentSrcMap.${nom} n'exclut plus rien : aucun module réexporté ne l'exporte.`);
for (const nom of fiches) if (!composants.has(nom)) erreurs.push(`.design-sync/docs/${nom}.md ne décrit plus aucun export.`);
for (const nom of apercus) if (!composants.has(nom)) erreurs.push(`.design-sync/previews/${nom}.tsx n'illustre plus aucun export.`);

// ── Verdict ─────────────────────────────────────────────────────────────────────────────────

if (REPORT) {
  console.log(`Modules réexportés : ${sources.length} (dont ${modulesUi.length} de ui/)`);
  console.log(`Racines (${racines.length}) : ${racines.join(', ')}`);
  console.log(`Exclues par componentSrcMap : ${exclus.size}`);
}
if (erreurs.length) {
  console.error(`✗ check-design-sync-entry — ${erreurs.length} écart(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}
console.log(`✓ .design-sync/ suit ui/ — ${modulesUi.length} modules réexportés, ${racines.length} racines, ${exclus.size} sous-parties exclues.`);
