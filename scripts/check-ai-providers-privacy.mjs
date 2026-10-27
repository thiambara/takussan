#!/usr/bin/env node
/**
 * Garde : tout fournisseur d'IA joignable est nommé par la politique de confidentialité
 * (TCK-2383, ADR-0076 §3).
 *
 * **Pourquoi.** La console super-admin choisit le modèle de chaque rôle parmi les fournisseurs de
 * `config/ai.php`. Sans cette garde, ajouter un fournisseur et deux clics enverraient des contenus
 * à un sous-traitant que `privacy.ts` ne déclare pas.
 *
 * **Ce qu'elle lit.** Le bloc `'providers' => [ … ]` de `takussan-api/config/ai.php` : chaque entrée
 * de premier niveau doit porter un `legal_name`. Puis la puce « Intelligence artificielle » (fr) et
 * « Artificial intelligence » (en) du § 4.3 de `takussan-web/src/content/legal/privacy.ts` : chaque
 * `legal_name` doit y figurer, dans les deux langues.
 *
 * **Ce qu'elle ne prouve pas.** Qu'un nom cité par la puce soit encore configuré (la puce peut en
 * dire trop), ni que le texte décrive bien le traitement.
 *
 * Ses propres tests (`CAS_EPREUVE`) tournent à chaque invocation : une garde dont la lecture
 * régresse sort en 1 sur elle-même.
 *
 *   node scripts/check-ai-providers-privacy.mjs            # garde
 *   node scripts/check-ai-providers-privacy.mjs --report   # + les fournisseurs lus
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const CONFIG = join(ROOT, 'takussan-api', 'config', 'ai.php');
const PRIVACY = join(ROOT, 'takussan-web', 'src', 'content', 'legal', 'privacy.ts');
const PUCES = { fr: '- **Intelligence artificielle**', en: '- **Artificial intelligence**' };

/** Rend `{ cle: legal_name|null }` pour chaque entrée de premier niveau du bloc `providers`. */
export function lireFournisseurs(php) {
  const debut = php.indexOf("'providers' => [");
  if (debut < 0) throw new Error("bloc 'providers' introuvable");
  let i = php.indexOf('[', debut);
  let profondeur = 0;
  let chaine = null;
  const entrees = {};
  let courante = null;
  let corps = '';
  for (; i < php.length; i++) {
    const c = php[i];
    if (chaine) {
      if (c === '\\') { if (courante) corps += c + php[i + 1]; i++; continue; }
      if (c === chaine) chaine = null;
      if (courante) corps += c;
      continue;
    }
    if (c === "'" || c === '"') {
      chaine = c;
      if (profondeur === 1 && courante === null) {
        const fin = php.indexOf(c, i + 1);
        const cle = php.slice(i + 1, fin);
        if (/^\s*=>\s*\[/.test(php.slice(fin + 1))) { courante = cle; corps = ''; }
        i = fin;
        chaine = null;
        continue;
      }
      if (courante) corps += c;
      continue;
    }
    if (c === '[') { profondeur++; if (courante && profondeur > 2) corps += c; continue; }
    if (c === ']') {
      profondeur--;
      if (profondeur === 1 && courante) {
        const nom = corps.match(/'legal_name'\s*=>\s*'([^']+)'/);
        entrees[courante] = nom ? nom[1] : null;
        courante = null;
      }
      if (profondeur === 0) break;
      if (courante) corps += c;
      continue;
    }
    if (courante) corps += c;
  }
  return entrees;
}

/** Rend la ligne de la puce, ou null. */
export function lirePuce(texte, prefixe) {
  return texte.split('\n').find((ligne) => ligne.trim().startsWith(prefixe)) ?? null;
}

export function verifier(php, privacy) {
  const erreurs = [];
  const fournisseurs = lireFournisseurs(php);
  if (Object.keys(fournisseurs).length === 0) erreurs.push('aucun fournisseur lu dans config/ai.php');
  for (const [cle, nom] of Object.entries(fournisseurs)) {
    if (!nom) { erreurs.push(`fournisseur « ${cle} » sans legal_name`); continue; }
    for (const [langue, prefixe] of Object.entries(PUCES)) {
      const puce = lirePuce(privacy, prefixe);
      if (!puce) erreurs.push(`privacy.ts : puce ${langue} « ${prefixe} » absente`);
      else if (!puce.includes(nom)) erreurs.push(`privacy.ts (${langue}) ne nomme pas « ${nom} » (fournisseur ${cle})`);
    }
  }
  return { erreurs, fournisseurs };
}

const CAS_EPREUVE = [
  {
    nom: 'un fournisseur nommé passe',
    php: "'providers' => [\n 'anthropic' => ['driver' => 'anthropic', 'legal_name' => 'Anthropic'],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic (États-Unis)\n- **Artificial intelligence**: Anthropic (United States)',
    erreurs: 0,
  },
  {
    nom: 'un fournisseur absent de la puce rougit',
    php: "'providers' => [\n 'anthropic' => ['legal_name' => 'Anthropic', 'k' => ['x' => 1]],\n 'openai' => ['legal_name' => 'OpenAI'],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic\n- **Artificial intelligence**: Anthropic',
    erreurs: 2,
  },
  {
    nom: 'un fournisseur sans legal_name rougit',
    php: "'providers' => [\n 'mistral' => ['driver' => 'mistral'],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic\n- **Artificial intelligence**: Anthropic',
    erreurs: 1,
  },
];

let echec = false;
for (const cas of CAS_EPREUVE) {
  const { erreurs } = verifier(cas.php, cas.privacy);
  if (erreurs.length !== cas.erreurs) {
    console.error(`✗ épreuve « ${cas.nom} » : ${erreurs.length} erreur(s) au lieu de ${cas.erreurs}`, erreurs);
    echec = true;
  }
}
if (echec) process.exit(1);

const { erreurs, fournisseurs } = verifier(readFileSync(CONFIG, 'utf8'), readFileSync(PRIVACY, 'utf8'));
if (REPORT) for (const [cle, nom] of Object.entries(fournisseurs)) console.log(`  ${cle} → ${nom}`);
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ check-ai-providers-privacy : ${Object.keys(fournisseurs).length} fournisseur(s), tous nommés par privacy.ts`);
