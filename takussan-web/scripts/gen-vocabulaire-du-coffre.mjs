#!/usr/bin/env node
// Génère `takussan-api/resources/documents/vocabulaire-du-coffre.json` depuis les libellés du coffre
// (`documents.coffre.entrees`, `documents.types` de `src/messages/*.json`) — TCK-2769.
//
// POURQUOI. Le front possède le texte affiché (principe 5) : le libellé d'une entrée générée du coffre
// (« Quittance de mars ») se compose ici. La recherche du coffre est jugée par le serveur
// (`GET /api/me/document-vault?filter[search]=`), qui doit chercher ce que l'utilisateur lit : il lit
// ce fichier, dérivé des messages, jamais une copie écrite à la main.
//
// Usage (depuis `takussan-web/`) :
//   node scripts/gen-vocabulaire-du-coffre.mjs           # (ré)écrit le fichier
//   node scripts/gen-vocabulaire-du-coffre.mjs --check   # n'écrit rien, sort 1 si le fichier est périmé
//
// C'est le test vitest `src/lib/documents/__tests__/vocabulaire-du-coffre.tck-2769.test.ts` qui le
// rend ; ce script le lance, en mode écriture ou non. La suite du front le joue sans variable.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST = 'src/lib/documents/__tests__/vocabulaire-du-coffre.tck-2769.test.ts';
const check = process.argv.includes('--check');

const r = spawnSync('npx', ['vitest', 'run', TEST], {
  cwd: WEB,
  stdio: 'inherit',
  env: { ...process.env, ECRIRE_VOCABULAIRE_DU_COFFRE: check ? '0' : '1' },
});
process.exit(r.status ?? 1);
