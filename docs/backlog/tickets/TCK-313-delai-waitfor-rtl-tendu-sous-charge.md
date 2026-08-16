---
id: TCK-313
title: "Le délai propre de waitFor/findBy est un défaut de framework, pas une mesure"
status: todo
phase: P2
family: front
estimate: S
wave: 40
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-312]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, tests, ci, flaky, dette]
---

## Objectif utilisateur

Le même objectif que [TCK-312](TCK-312-tests-front-rougissent-sous-charge.md), un cran plus bas :
qu'un test rouge veuille dire « le code est cassé ».

## Contexte

Découvert **pendant** la vérification de TCK-312, et délibérément laissé hors de son périmètre.

TCK-312 a mesuré, puis fixé, le plafond **par test** (`testTimeout`) : les 5000 ms n'avaient jamais
été choisis, c'était le défaut de vitest. Il reste un second plafond de la même nature, à un étage
plus bas et sur un autre bouton : **`asyncUtilTimeout` de Testing Library, 1000 ms, lui aussi un
défaut de framework jamais mesuré pour cette suite**, qui gouverne tous les `waitFor` et `findBy*`.

Mesure du 2026-08-16, sur la suite front entière (882 tests) :

- Sous la charge que décrit TCK-312 (suites back et front simultanées, charge 1-min ~65 sur
  8 cœurs) : **0 échec**, ce délai n'est jamais atteint.
- Sous une charge délibérément portée à ~4× ce niveau (charge 1-min **222 à 243**), un cinquième
  test rougit — `src/components/admin/super/__tests__/Integrations.test.tsx > renders masked
  credentials and submits only replacement values`, sur
  `await screen.findByPlaceholderText('••••1234')` (ligne 64) — avec
  `Unable to find an element with the placeholder text of: ••••1234`, **2 tours sur 3**.

Ce n'est pas un défaut du composant : le dialogue finit par s'afficher, il met simplement plus de
1000 ms à le faire quand la machine est saturée. *Le message d'erreur, lui, accuse le code* — il dit
« l'élément n'existe pas », pas « je n'ai pas attendu assez ».

## Contraintes strictes (métier)

- **Ne pas augmenter le délai en aveugle** — la consigne de TCK-312 vaut identiquement ici. Mesurer
  d'abord combien de temps ces attentes prennent réellement, au repos et sous charge.
- **Le délai court a une valeur qu'il faut préserver, et elle est mesurée** : c'est lui, et non
  `testTimeout`, qui fait échouer une vraie régression en ~1,3 s avec son message d'assertion
  (ablation consignée dans TCK-312). Le relever a un coût réel sur 882 tests — il se paie en
  lenteur de signalement à chaque exécution rouge. Ce n'est pas le même arbitrage que `testTimeout`,
  qui ne se déclenche que sur un blocage.
- Un délai relevé cite la mesure qui le justifie ; aucun ne l'est « pour voir ».

## Delta à produire

- [ ] Mesurer la durée réelle des `waitFor`/`findBy*` de la suite — au repos, et sous la charge où
      `Integrations` rougit — pour savoir s'il s'agit d'un test isolé ou d'une pente commune
- [ ] Décider entre un `asyncUtilTimeout` global mesuré, un délai local sur les seules attentes qui
      le justifient, ou aucun changement si la charge de reproduction n'est pas représentative
- [ ] Écrire la mesure qui justifie la décision, y compris si la décision est « ne rien changer »

## Critères d'acceptation

- [ ] AC1 — la durée des attentes concernées est mesurée et consignée, au repos et sous charge
- [ ] AC2 — la décision est écrite et sourcée par sa mesure
- [ ] AC3 — si un délai est relevé, le coût en lenteur de signalement est chiffré, pas éludé
- [ ] AC4 — la suite front reste verte au repos, et le compte de tests n'a pas baissé

## Hors périmètre

- `testTimeout`, mesuré et fixé par TCK-312.
- L'instabilité backend, soldée (ardoise D-44).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
