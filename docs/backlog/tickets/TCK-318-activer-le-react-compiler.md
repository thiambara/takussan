---
id: TCK-318
title: "Activer le React Compiler — ou décider de ne pas l'activer, mais le décider"
status: done
phase: P3
family: front
estimate: M
wave: 39
created: 2026-08-16
updated: 2026-08-17
depends_on: [TCK-316]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, perf, lint, dette]
---

## Objectif utilisateur

Que le dépôt sache s'il compile avec le React Compiler ou non — et que ses règles de lint parlent
du build qu'il produit réellement.

## Le constat

Mesuré le 2026-08-16, en traitant TCK-316 :

- `eslint-plugin-react-hooks@7` (via `eslint-config-next`) active **cinq familles de règles du React
  Compiler**, toutes en `severity 2` ;
- **le React Compiler n'est pas activé** : `next.config.ts` ne déclare pas `reactCompiler`, et
  `babel-plugin-react-compiler` n'apparaît pas dans `package-lock.json` ;
- l'une de ces règles, `preserve-manual-memoization`, rend compte **littéralement** d'une
  compilation qui n'a pas lieu : *« React Compiler has skipped optimizing this component »*. Elle
  produisait **10** des 23 erreurs de TCK-316.

Les quatre autres familles (`set-state-in-effect`, `refs`, `immutability`, `use-memo`) décrivent des
défauts d'exécution, vrais avec ou sans compilateur. **Leurs 13 occurrences ont été corrigées par
TCK-316.** `preserve-manual-memoization` a été coupée dans `eslint.config.mjs`, avec sa raison — et
ce ticket est la contrepartie de cette coupure.

## Pourquoi ça n'a pas été tranché dans TCK-316

Le correctif canonique de `preserve-manual-memoization` est de **supprimer** le `useCallback` /
`useMemo` signalé, en laissant le compilateur mémoïser à sa place. Sans compilateur, ce serait
retirer une mémoïsation sans rien mettre derrière : une régression de performance réelle, appliquée
dix fois, pour faire taire un avertissement portant sur une optimisation absente du build.

Activer le compilateur est une décision **structurelle** — elle change la sortie de compilation de
toute l'application. Elle n'appartient pas à un ticket de nettoyage de lint.

## Delta à produire

- [x] Mesurer ce que le compilateur apporte ICI : bundle, temps de rendu sur les deux ou trois
      écrans les plus lourds (liste de biens, console super-admin, chat). **Chiffres avant/après**,
      pas une conviction.
- [x] Vérifier la compatibilité de la base de code — le compilateur refuse le code qui viole les
      règles des hooks. Les 13 corrections de TCK-316 vont dans ce sens ; les 4
      `react-hooks/exhaustive-deps` restants (aujourd'hui en `warning`) sont à instruire.
- [x] Trancher, et **écrire un ADR** dans les deux cas. « On ne l'active pas » est une décision qui
      mérite d'être écrite autant que l'inverse — sinon la question se reposera.
- [x] Si activé : retirer la coupure de `preserve-manual-memoization` dans `eslint.config.mjs` et
      traiter les 10 signalements avec leur vrai correctif.
- [ ] ~~Si non activé : garder la coupure, et faire pointer son commentaire vers l'ADR.~~ — branche non prise (le compilateur EST activé).

## Critères d'acceptation

- [x] AC1 — La décision est écrite en ADR, sourcée par une mesure et non par une préférence.
- [x] AC2 — `eslint.config.mjs` est cohérent avec la décision : aucune règle coupée sans raison
      écrite, aucune règle active qui décrive un build qu'on ne produit pas.
- [x] AC3 — Si le compilateur est activé, `npm run lint`, `tsc --noEmit`, la suite et `build`
      restent verts, et la mesure de performance est consignée.

## Hors périmètre

- Les 13 corrections de TCK-316 : faites, et valables indépendamment de cette décision.
- Toute optimisation de performance qui ne passerait pas par le compilateur.

## Notes d'implémentation

**Décision : ACTIVÉ. Le raisonnement complet, sourcé, est dans
[ADR-0015](../../adr/0015-react-compiler-active.md)** — pas ici, pour qu'il survive à la clôture de
ce ticket.

**Trois chiffres pris de travers avant d'être pris juste**, et c'est le vrai contenu de ce ticket :

1. **Le poids** — première mesure : somme de tout `.next/static/chunks`, **+26,7 % gzippé**. Ce
   chiffre est faux d'un facteur **cinq** pour la question posée : il compte le code de *toutes*
   les routes alors qu'un visiteur n'en télécharge qu'une. Mesuré comme un navigateur le vit
   (serveur de production, `<script src>` du HTML, pesés gzippés) : **+3,6 à +6,1 %**. La décision
   se serait inversée sur le mauvais chiffre.
2. **Le rendu** — le banc a rendu **zéro gain** trois exécutions durant. `@vitejs/plugin-react@6`
   transforme avec **oxc** et **n'expose plus d'option `babel`** : le plugin qu'on lui passait était
   silencieusement ignoré. Il a fallu ajouter au banc un témoin (« la transformation a-t-elle eu
   lieu ? ») pour le voir. *Une mesure de performance sans témoin d'application mesure le placebo.*
3. **Le build** — premier relevé ×4 (28,6 s → 112 s), pris à des charges machine de 13 et 92. Rejoué
   dos à dos à charge égale : **×2** (10,7 s → 21,5 s).

**Le healthcheck sur-promet, et deux outils du même éditeur ne comptent pas la même chose.**
`react-compiler-healthcheck` annonce « 870/870 compilés » et « no incompatible libraries » ; ESLint
signalait au même instant 10 abandons dans 2 composants (`preserve-manual-memoization`, corrigés
ici) et en signale 2 autres (`incompatible-library` — `BookingTunnel`, `DepositRefundModal`, sautés
délibérément par le compilateur, avertissements, non bloquants).

**Limite structurelle consignée dans l'ADR : la suite de tests n'exerce PAS le code compilé** — même
cause qu'au point 2, `vitest` passe par oxc. Un vert de `npm run test` ne valide pas le build ; ce
sont `npm run lint` et `npm run build` de `web-ci.yml` qui gardent ce flanc.

**Les 4 `exhaustive-deps` restants** sont instruits un par un dans l'ADR : aucun ne bloque le
compilateur (il ne réécrit pas les deps de `useEffect`), un est délibéré, un est inoffensif, deux
sont des inefficacités latentes que le compilateur rend sans objet — et dont le vrai correctif est
de RETIRER les `useCallback`, pas d'ajouter un `useMemo`. Ce nettoyage n'est pas dans ce delta.

⑴ Le vrai enseignement de TCK-316 n'est pas « il y avait 23 violations ». C'est que **cinq familles
de règles étaient déclarées bloquantes et ne s'exécutaient pas** sous ESLint 9 — et qu'une fois
exécutées, 10 des 23 signalements portaient sur un compilateur absent. Une garde qui ne tourne pas
et une garde qui décrit autre chose que ce qu'on construit sont deux formes du même défaut.
