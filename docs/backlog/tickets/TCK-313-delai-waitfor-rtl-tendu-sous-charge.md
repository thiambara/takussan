---
id: TCK-313
title: "Le délai propre de waitFor/findBy est un défaut de framework, pas une mesure"
status: done
phase: P2
family: front
estimate: S
wave: 40
created: 2026-08-16
updated: 2026-08-17
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

- [x] Mesurer la durée réelle des `waitFor`/`findBy*` de la suite — au repos, et sous la charge où
      `Integrations` rougit — pour savoir s'il s'agit d'un test isolé ou d'une pente commune
- [x] Décider entre un `asyncUtilTimeout` global mesuré, un délai local sur les seules attentes qui
      le justifient, ou aucun changement si la charge de reproduction n'est pas représentative
- [x] Écrire la mesure qui justifie la décision, y compris si la décision est « ne rien changer »

## Critères d'acceptation

- [x] AC1 — la durée des attentes concernées est mesurée et consignée, au repos et sous charge
- [x] AC2 — la décision est écrite et sourcée par sa mesure
- [x] AC3 — si un délai est relevé, le coût en lenteur de signalement est chiffré, pas éludé
- [x] AC4 — la suite front reste verte au repos, et le compte de tests n'a pas baissé

## Hors périmètre

- `testTimeout`, mesuré et fixé par TCK-312.
- L'instabilité backend, soldée (ardoise D-44).

## Notes d'implémentation

**Décision : `asyncUtilTimeout` passe de 1000 à 3000 ms, globalement**, dans `vitest.setup.ts`.
La mesure complète vit dans le commentaire de ce fichier — c'est là qu'elle sera relue le jour où
quelqu'un voudra y toucher, pas ici.

**Comment la mesure a été prise.** Testing Library route toutes ses utilités asynchrones par
`getConfig().asyncWrapper`. On l'a enveloppé le temps de la mesure, en séparant par la pile
d'appel les attentes (`@testing-library/dom/…/wait-for`) des frappes `user-event` — lesquelles
passent par le MÊME point d'entrée mais ne sont **pas** gouvernées par `asyncUtilTimeout`. Sans
cette séparation on mesure la frappe en croyant mesurer l'attente : sur la suite entière,
312 frappes (somme 29,8 s) contre 227 attentes (somme 7,2 s).

**Ce n'est pas un test isolé, et ce n'est pas non plus une pente commune** — les deux hypothèses
du delta sont fausses. La distribution au repos est très creuse (p50 = 8,4 ms, p95 = 150 ms,
5 attentes sur 227 au-dessus de 200 ms) : c'est une QUEUE, et c'est la queue qui décide.

**Le chiffre qui a tranché n'est pas le pire cas, c'est sa volatilité.** La même attente —
`Integrations > findByPlaceholderText('••••1234')`, celle du ticket — a été mesurée à **467 ms**
sur la suite entière lancée machine calme, puis à **980 ms** quelques minutes plus tard sur le
même code, pour la seule raison que deux autres agents travaillaient sur la machine. Un plafond
dont la marge annoncée (2,1×) tombe à 1,02× sans qu'une ligne ait changé n'est pas un plafond.
C'est aussi pourquoi l'option « délai local sur les seules attentes qui le justifient » a été
écartée : **l'ensemble des attentes qui le justifient n'est pas stable** — au repos c'est
`Integrations` (467 ms), sous 64 brûleurs c'est `OAuthButtons` (1653 ms). On aurait annoté des
tests là où le sujet est la machine.

**3000 et non 5000.** Les deux tiennent sous la charge qui rougissait ; 3000 ne facture que
+2 s par test rouge au lieu de +4 s. Et le coût est **exactement nul sur une exécution verte** :
un plafond ne se paie que lorsqu'on l'atteint. Vérifié : exactement UNE attente échoue par test
rouge, et elle consomme le plafond à la milliseconde près (1004 / 3002 / 5003 ms).

**Ce que la mesure a appris en passant, et qui n'était pas dans le ticket** : sous forte
contention, une attente peut dépasser son plafond en temps réel **sans échouer** — le `setTimeout`
qui porte le plafond est starvé comme le reste. Sous 64 brûleurs (charge 72 → 128), quatre
attentes ont dépassé 1000 ms de temps mural et les 38 tests sont passés. Le plafond borne du
temps *ordonnancé*, pas du temps mural : c'est pourquoi la charge de rupture (≈ 290) est bien
plus haute que ne le laisserait croire une simple règle de trois sur les facteurs de TCK-312.

**Conditions de toutes les mesures** : 8 cœurs (`sysctl -n hw.ncpu`), charge 1-min relevée à
`uptime` de part et d'autre de chaque exécution et consignée avec chaque chiffre. La charge de
rupture a été produite par 192 brûleurs CPU, jamais par une seconde suite réelle — la règle
« qui lance quoi » du `CLAUDE.md` racine interdit la seconde.
