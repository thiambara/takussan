#!/usr/bin/env node
/**
 * Garde : aucun numéro sénégalais plausible ni courriel dans les jeux d'évaluation du socle IA
 * (`takussan-api/tests/AiEvals/`) — TCK-2384.
 *
 * **Pourquoi.** Les cas viennent de vraies annonces corrigées (`ai:export-eval-cases`). L'export
 * anonymise, mais un cas écrit à la main, ou un format de numéro que l'anonymisation ne connaît
 * pas, ferait entrer une donnée personnelle dans le dépôt — d'où elle ne sort plus.
 *
 * **Ce qu'elle ne prouve pas.** L'absence d'un nom de personne : aucun motif ne le reconnaît.
 *
 *   node scripts/check-ai-evals-pii.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = join(ROOT, 'takussan-api', 'tests', 'AiEvals');

// `\s` couvre déjà U+00A0 et U+202F (espaces insécables, fréquents dans un texte collé).
export const TELEPHONE = /(?<!\d)(?:(?:\+|00)221[\s.-]?)?(?:7[05678]|33)[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/;
export const COURRIEL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

const CAS_EPREUVE = [
  ['77 123 45 67', true], ['+221781234567', true], ['00221 70.123.45.67', true], ['33 821 00 00', true],
  ['77 123 45 67', true], ['77 123 45 67', true],
  ['[TELEPHONE]', false], ['150 000 000 FCFA', false], ['awa@exemple.sn', true], ['[EMAIL]', false],
];
for (const [texte, attendu] of CAS_EPREUVE) {
  if ((TELEPHONE.test(texte) || COURRIEL.test(texte)) !== attendu) {
    console.error(`✗ épreuve : « ${texte} » devait rendre ${attendu}`);
    process.exit(1);
  }
}

function fichiers(dossier) {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const erreurs = [];
const lus = fichiers(EVALS);
for (const fichier of lus) {
  readFileSync(fichier, 'utf8').split('\n').forEach((ligne, i) => {
    const trouve = ligne.match(TELEPHONE) ?? ligne.match(COURRIEL);
    if (trouve) erreurs.push(`${relative(ROOT, fichier)}:${i + 1} — « ${trouve[0]} »`);
  });
}
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`✗ donnée personnelle dans un jeu d'évaluation : ${e}`);
  process.exit(1);
}
console.log(`✓ check-ai-evals-pii : ${lus.length} fichier(s) lus, aucun numéro ni courriel`);
