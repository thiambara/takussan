#!/usr/bin/env node
/**
 * Garde des HEREDOCS : aucune substitution involontaire dans un heredoc non quoté.
 *
 * Le défaut qu'elle attrape a été réel, et il s'exécutait EN ROOT.
 *
 * `scripts/server-setup.sh` génère `/etc/sudoers.d/takussan-deploy` et
 * `/etc/logrotate.d/takussan` par `cat > … <<SUDO`. Le délimiteur n'est pas quoté — il ne PEUT
 * pas l'être, puisqu'il faut y interpoler `${DEPLOY_USER}`, `${APP_DIR}`, `${php_version}`.
 * Bash y développe donc aussi les backticks et les `$(…)`, **y compris dans ce qui ressemble à
 * un commentaire**.
 *
 * Un commentaire d'explication écrit `` `setup_queue_service` `` a ainsi réellement INVOQUÉ la
 * fonction du même nom, sous root, et supprimé le mot du fichier écrit. Elle est morte
 * immédiatement sur `local name="$1"` avec `set -u` — mais l'appel, lui, a bien eu lieu.
 * Reproduit en bac à sable. Quatre autres lignes faisaient exécuter `copytruncate`, `create` et
 * `--max-time=3600` comme des commandes, et arrachaient l'explication du fichier livré.
 *
 * *Un heredoc non quoté n'est pas un bloc de texte : c'est du code, y compris dans ce qui
 * ressemble à un commentaire.*
 *
 * La règle appliquée : dans un heredoc NON quoté, `$VAR` et `${VAR}` sont légitimes — c'est la
 * raison d'être du non-quotage — mais une SUBSTITUTION DE COMMANDE ne l'est jamais. Si un jour
 * elle l'était, elle s'écrirait hors du heredoc, dans une variable.
 *
 * Usage :
 *   node scripts/check-heredocs.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-heredocs.mjs --report   # + l'inventaire des heredocs vus
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

/** Tout script shell du dépôt qui écrit des fichiers. */
const FICHIERS = ['scripts/server-setup.sh', 'scripts/deploy.sh', 'dev.sh'];

const OUVERTURE = /<<-?\s*(['"]?)([A-Za-z_]\w*)\1/;
const SUBSTITUTION = /`[^`]*`|\$\([^)]*\)/;

const erreurs = [];
const vus = [];

for (const rel of FICHIERS) {
  const chemin = join(ROOT, rel);
  if (!existsSync(chemin)) {
    console.error(`✗ ${rel} est introuvable — la garde ne peut rien vérifier.`);
    process.exit(1);
  }
  const lignes = readFileSync(chemin, 'utf8').split('\n');

  let delim = null;
  let quote = false;
  let debut = 0;
  lignes.forEach((ligne, i) => {
    const n = i + 1;
    if (delim === null) {
      const m = OUVERTURE.exec(ligne);
      if (m) {
        quote = m[1] !== '';
        delim = m[2];
        debut = n;
      }
      return;
    }
    if (ligne.trim() === delim) {
      vus.push([rel, debut, n, delim, quote]);
      delim = null;
      return;
    }
    if (!quote && SUBSTITUTION.test(ligne)) {
      erreurs.push(
        `${rel}:${n} — substitution de commande dans le heredoc \`<<${delim}\` ouvert ligne ${debut}, `
        + `qui n'est PAS quoté : bash l'exécutera.\n      ${ligne.trim().slice(0, 100)}`,
      );
    }
  });

  if (delim !== null) {
    erreurs.push(`${rel} — heredoc \`<<${delim}\` ouvert ligne ${debut} et jamais refermé.`);
  }
}

if (REPORT) {
  console.log(`Heredocs vus (${vus.length}) :`);
  for (const [f, d, fin, nom, q] of vus) {
    console.log(`  ${q ? 'quoté   ' : 'NON quoté'}  <<${nom.padEnd(12)} ${f}:${d}-${fin}`);
  }
  console.log();
}

if (erreurs.length === 0) {
  console.log(`✓ heredocs : ${vus.length} bloc(s) vérifié(s), aucune substitution involontaire.`);
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} substitution(s) involontaire(s) dans un heredoc non quoté :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nDans un heredoc non quoté, \`…\` et $(…) sont EXÉCUTÉS — même dans une ligne qui commence\n`
  + `par « # ». Sur un script lancé en root, cela exécute du code en root, et le mot disparaît\n`
  + `du fichier écrit. Sors la prose du heredoc, ou quote le délimiteur (<<'FIN') si le bloc\n`
  + `n'a besoin d'aucune interpolation.`,
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
