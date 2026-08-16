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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "takussan/react-version-pin",
    settings: { react: { version: reactVersion } },
  },
  {
    name: "takussan/react-compiler-rules",
    rules: {
      // `react-hooks/preserve-manual-memoization` est COUPÉE, et c'est la seule
      // des cinq familles du React Compiler à l'être. Les quatre autres —
      // `set-state-in-effect`, `refs`, `immutability`, `use-memo` — restent en
      // erreur : elles décrivent des défauts d'exécution, vrais avec ou sans
      // compilateur, et TCK-316 en a corrigé les treize occurrences.
      //
      // ⚠️ MESURÉ AVANT DE COUPER, pas supposé. **Le React Compiler n'est pas
      // activé dans ce projet** : `next.config.ts` ne déclare pas
      // `reactCompiler`, et `babel-plugin-react-compiler` n'est pas dans le
      // lock. Le message de cette règle est pourtant, littéralement,
      // « React Compiler has skipped optimizing this component » — elle rend
      // compte d'une compilation qui n'a jamais lieu.
      //
      // Et son correctif canonique est de SUPPRIMER le `useCallback`/`useMemo`
      // signalé, en laissant le compilateur mémoïser à la place. Sans
      // compilateur, ce serait retirer une mémoïsation sans rien mettre
      // derrière — une régression de performance réelle, appliquée dix fois,
      // pour faire taire un avertissement sur une optimisation qui n'existe pas
      // dans ce build. C'est le contraire du service rendu.
      //
      // La question de fond — activer le React Compiler — est structurelle et
      // n'appartient pas à un ticket de lint : elle est ticketée à part
      // (TCK-318). Le jour où il sera activé, cette ligne se retire et les dix
      // signalements redeviennent actionnables, avec leur vrai correctif.
      "react-hooks/preserve-manual-memoization": "off",
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
