#!/usr/bin/env node
/**
 * Garde « GITHUB NE PORTE AUCUN ENVIRONNEMENT » (ADR-0069 §2, TCK-832).
 *
 * Le défaut qu'elle ferme : le dépôt peut devenir privé. Sur le plan gratuit de GitHub, un dépôt
 * privé perd les environnements et leurs secrets. Un job qui déclare `environment:` lirait alors
 * des secrets disparus — et `images.yml`, faute de déclencheur, s'arrêtait jusqu'ici en simple
 * `::notice::`, VERT, sans rien déployer. La configuration vit dans Dokploy ; GitHub ne garde que
 * des secrets et variables de DÉPÔT pour déclencher et prouver.
 *
 * Ce qu'elle vérifie :
 *
 * · aucune clé `environment:` (hors commentaires) dans `.github/workflows/*.yml` ;
 * · dans `images.yml`, le `case` qui choisit l'environnement ne porte aucune URL : la branche
 *   choisit la cible, pas la configuration (ADR-0069 §2).
 *
 * Usage :  node scripts/check-workflows-sans-environnement.mjs [--report]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const DIR = join(ROOT, '.github', 'workflows');
const IMAGES = join(DIR, 'images.yml');

const fichiers = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(DIR, f)).sort()
  : [];

/**
 * Plancher : 7 workflows le 2026-10-18. Un balayage qui en trouve moins de 5 ne lit plus le bon
 * répertoire, et sa sortie ressemblerait à un succès.
 */
if (fichiers.length < 5 || !fichiers.includes(IMAGES)) {
  console.error(`✗ ${fichiers.length} workflow(s) balayé(s), ou images.yml absent : la garde ne trouve plus ce qu'elle garde.`);
  process.exit(2);
}

const sansCommentaire = (ligne) => ligne.replace(/\s#.*$/, '').replace(/^\s*#.*$/, '');

const erreurs = [];
for (const fichier of fichiers) {
  readFileSync(fichier, 'utf8').split('\n').forEach((brute, i) => {
    if (/^\s*environment:/.test(sansCommentaire(brute))) {
      erreurs.push(
        `${relative(ROOT, fichier)}:${i + 1} — \`environment:\` : un environnement GitHub disparaît avec le ` +
          `dépôt privé, et ses secrets avec lui. Secrets et variables de DÉPÔT, préfixés par ` +
          `l'environnement (ADR-0069 §2).`,
      );
    }
  });
}

// Le `case "$GITHUB_REF_NAME"` d'images.yml, jusqu'à son `esac`.
const lignesImages = readFileSync(IMAGES, 'utf8').split('\n');
const debut = lignesImages.findIndex((l) => /case "\$GITHUB_REF_NAME"/.test(l));
const fin = lignesImages.findIndex((l, i) => i > debut && /^\s*esac\b/.test(l));
if (debut < 0 || fin < 0) {
  console.error(`✗ ${relative(ROOT, IMAGES)} : le \`case "$GITHUB_REF_NAME"\` est introuvable. Le motif est périmé.`);
  process.exit(2);
}
for (let i = debut; i <= fin; i++) {
  if (/https?:\/\//.test(sansCommentaire(lignesImages[i]))) {
    erreurs.push(
      `${relative(ROOT, IMAGES)}:${i + 1} — une URL dans le \`case\` : la branche choisit la cible, pas la ` +
        `configuration. Les URL de preuve sont des variables de dépôt \`<PREFIXE>_API_URL\` / \`_SITE_URL\`.`,
    );
  }
}

if (REPORT) console.log(`workflows balayés (${fichiers.length}) ; case d'images.yml aux lignes ${debut + 1}-${fin + 1}`);
if (erreurs.length) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ aucun environnement GitHub dans les ${fichiers.length} workflow(s), et aucune URL dans le case d'images.yml.`);
