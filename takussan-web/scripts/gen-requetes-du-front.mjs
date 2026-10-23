#!/usr/bin/env node
// Génère `takussan-api/tests/fixtures/requetes-du-front.json` depuis les fonctions et les hooks de
// lecture de `src/lib/queries` (TCK-1800, P150.04).
//
// POURQUOI. Quatre écarts entre ce que le front écrit (`sort`, `filter[…]`, `include`, `fields`) et
// les listes blanches de l'API ont vécu de 15 jours à deux mois, chacun rendant une liste en 400,
// sans qu'aucun test ne rougisse : les tests du front vérifient la chaîne produite, ceux de l'API
// appellent leurs listes avec leurs propres paramètres. Ce fichier relie les deux : le front le
// dérive, l'API le rejoue (`tests/Feature/Contrat/RequetesDuFrontTest.php`, aucune requête en 400).
//
// Usage (depuis `takussan-web/`) :
//   node scripts/gen-requetes-du-front.mjs           # (ré)écrit le fichier
//   node scripts/gen-requetes-du-front.mjs --check   # n'écrit rien, sort 1 si le fichier est périmé
//
// Les requêtes ne se lisent pas dans le source : elles se CAPTENT, en appelant chaque entrée
// d'`INVOCATIONS` sous un `fetch` simulé. C'est le test vitest
// `src/lib/queries/__tests__/requetes-du-front.tck-1800.test.tsx` qui le fait ; ce script le lance,
// en mode écriture ou non. La suite du front le joue sans variable : c'est le `--check` de la CI.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST = 'src/lib/queries/__tests__/requetes-du-front.tck-1800.test.tsx';
const check = process.argv.includes('--check');

const r = spawnSync('npx', ['vitest', 'run', TEST], {
  cwd: WEB,
  stdio: 'inherit',
  env: { ...process.env, ECRIRE_REQUETES_DU_FRONT: check ? '0' : '1' },
});
process.exit(r.status ?? 1);
