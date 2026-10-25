import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import { createRequire } from "node:module";

// Version de React, LUE dans `node_modules` — pas recopiée à la main.
//
// ⚠️ Pourquoi cette ligne existe (PR #172, bump ESLint 9 → 10).
// `eslint-config-next@16.3.1` pose `settings.react.version = 'detect'`, et la
// détection d'`eslint-plugin-react@7.37.5` appelle `context.getFilename()` —
// une API du contexte de règle SUPPRIMÉE par ESLint 10. `npm run lint`
// mourait donc au CHARGEMENT de la première règle, avant d'analyser une seule
// ligne :
//
//     TypeError: Error while loading rule 'react/display-name':
//     contextOrFilename.getFilename is not a function
//
// Il n'existe aucune sortie par le haut : `eslint-plugin-react@7.37.5` est la
// DERNIÈRE version publiée et son peer s'arrête à `eslint ^3 || … || ^9.7` ;
// `eslint-config-next@16.3.1` est la dernière aussi, et annonce
// `eslint >=9.0.0` — une portée que sa propre dépendance transitive ne tient
// pas. Vérifié au registre, pas déduit.
//
// Mais la détection n'est appelée QUE si la version vaut littéralement
// `'detect'` (`eslint-plugin-react/lib/util/version.js:113-117`) : une chaîne
// explicite court-circuite `detectReactVersion`, donc `resolveBasedir`, donc
// l'API disparue. C'est ce que fait cette ligne — sans désactiver aucune
// règle, et sans épingler l'analyse à une version de React fausse le jour où
// l'on bumpera : elle lit la version installée.
//
// À RETIRER dès qu'`eslint-plugin-react` publie une version compatible
// ESLint 10 (ou qu'`eslint-config-next` cesse de forcer `'detect'`). Ce
// n'est pas un réglage, c'est un contournement daté.
const reactVersion = createRequire(import.meta.url)("react/package.json").version;

// Règles d'accessibilité : le jeu `recommended` d'`eslint-plugin-jsx-a11y`, EN ERREUR (P07.12,
// TCK-2335). `eslint-config-next` n'en pose que six, en `warn` : ni
// `label-has-associated-control`, ni `click-events-have-key-events`, ni
// `no-static-element-interactions`. Le plugin est LU dans la config de Next, qui l'enregistre
// déjà sous `jsx-a11y` : ce n'est pas une dépendance du dépôt, et le réimporter ailleurs ferait
// « redéfinir » le plugin. Les options que Next pose (`alt-text` sur `Image`) sont gardées, seule
// la gravité passe à `error`.
const jsxA11y = nextVitals.find((config) => config.plugins?.["jsx-a11y"]).plugins["jsx-a11y"];
const enErreur = (reglage) => (Array.isArray(reglage) ? ["error", ...reglage.slice(1)] : "error");
const reglesA11yDeNext = Object.fromEntries(
  nextVitals
    .flatMap((config) => Object.entries(config.rules ?? {}))
    .filter(([regle]) => regle.startsWith("jsx-a11y/"))
    .map(([regle, reglage]) => [regle, enErreur(reglage)]),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "takussan/react-version-pin",
    settings: { react: { version: reactVersion } },
  },
  // Le préfixe `_` DIT « inutilisé, et c'est voulu » (signature imposée par un mock, un rappel,
  // une déstructuration qui retire une clé). Le dépôt l'écrit ainsi partout ; sans cette règle,
  // la convention produisait quatorze avertissements qui noyaient les vrais (2026-09-16).
  {
    name: "takussan/unused-underscore",
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
    },
  },
  // ⚠ LE CLIQUET des trois blocs qui suivent est `eslint-suppressions.json`, à côté de ce
  // fichier : les suppressions en masse natives d'ESLint 10 (P210.05, P07.12, TCK-2335). Il gèle
  // les violations qui existaient le jour où les règles sont passées en erreur, compte par
  // fichier et par règle ; `npm run lint` le lit sans option. Il tient dans les deux sens :
  //   · une violation NEUVE, ou une de plus dans un fichier gelé → rouge (exit 1) ;
  //   · une violation CORRIGÉE sans élaguer → rouge aussi (exit 2, « suppressions left that do
  //     not occur anymore »), jusqu'à `npx eslint --prune-suppressions`. Le cliquet ne se
  //     desserre donc jamais en silence.
  // Résorber un lot : corriger, puis `npx eslint --prune-suppressions`, et commiter le fichier.
  // Ne JAMAIS regeler par `--suppress-all` / `--suppress-rule` pour faire passer du code neuf, ni
  // ajouter `--pass-on-unpruned-suppressions` à un script : c'est rouvrir le cliquet.
  {
    name: "takussan/a11y-en-erreur",
    rules: { ...jsxA11y.flatConfigs.recommended.rules, ...reglesA11yDeNext },
  },
  // Lint TYPÉ, limité à deux règles (P210.05) : une fonction `async` passée à `onClick` rend une
  // promesse que React jette, et son rejet n'est vu par personne. `checksVoidReturn` ne vise que
  // les attributs JSX, le motif des défauts relevés (P210.01-03, P182.01) ; les autres positions
  // (arguments, propriétés, retours) ouvriraient des rouges hors de ce motif.
  // ⚠ `void f()` satisfait les deux règles SANS `catch` (P210.04) : elles ne remplacent pas la
  // relecture du chemin d'erreur.
  {
    name: "takussan/promesses",
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-misused-promises": ["error", {
        checksConditionals: false,
        checksSpreads: false,
        checksVoidReturn: {
          attributes: true,
          arguments: false,
          inheritedMethods: false,
          properties: false,
          returns: false,
          variables: false,
        },
      }],
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
