---
id: TCK-752
title: "Pluriels ICU en fr et en : plus de « 1 biens » ni de « (s) », et une garde"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo"
tags: [front, i18n, pistes]
---

## Contexte

Réf : **P06.10** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Des messages de `takussan-web/src/messages/{fr,en}.json` écrivent `{count} <nom>` sans ICU
`plural` (« 1 biens », « 1 months »), ou une forme « (s) » (« 1 document(s) »). Plusieurs appelants
passent un nombre déjà converti en chaîne (`String(n)`, `formatNumber(…)`) : ICU `plural` a besoin
d'un nombre (`formatNumber` rend « 1 500 », qui donne `NaN`).

## Décision du porteur

ICU plural en fr et en ; en wo une seule forme other qui reprend le texte actuel

## Objectif utilisateur

Un compte affiché au singulier s'accorde au singulier, en français comme en anglais.

## Contraintes strictes

- **Hypothèse (wolof en pause depuis le 2026-10-16)** : `wo.json` n'est pas touché. Sa valeur
  actuelle `{count} …` rend déjà, pour toute valeur, le texte actuel, ce que demande « une seule
  forme other qui reprend le texte actuel » ; la réécrire en `{count, plural, other {…}}` serait
  une réécriture d'un texte `wo` existant, que la pause interdit.
- Un message dont le nom est invariable dans la langue (« avis », « mois », « en attente »,
  « ch », « sdb ») ne prend pas de `plural` dans cette langue.
- Les appelants des messages convertis passent un nombre.

## Delta à produire

- [x] `fr.json` et `en.json` : `plural` sur les messages qui s'accordent.
- [x] Appelants : `String(n)` et `formatNumber(…)` remplacés par le nombre (`#` le formate).
- [x] `scripts/i18n-pluriels.mjs` (neuf) : `{count} <lettre>` ou `<lettre>(s)` hors `plural`
      en `fr` et `en`, avec la liste écrite des messages invariables ; gardé par le test vitest.
- [x] Un test vitest qui rend les messages convertis à 1 et à 2.

## Critères d'acceptation

- [x] AC1 — `nav.propertiesCount` rend « 1 bien » et « 2 biens » en `fr`, « 1 listing » et
      « 2 listings » en `en` ; de même pour chaque message converti.
- [x] AC2 — `src/i18n/__tests__/pluriels.test.ts` rougit sur un `{count} biens` neuf hors `plural`.
- [x] AC3 — `wo.json` inchangé.

## Reste à faire

- Brancher `accordsManquants` dans `scripts/check-i18n.mjs` : garde existante, que l'implémenteur
  des pistes ne modifie pas (ADR-0066, V9).

## Hors périmètre

- Le wolof (pause).
- Les messages où la variable n'est pas `count` sans forme « (s) » : la garde ne les voit pas.

## Notes d'implémentation

- **Ablation** : `fr.json` et `en.json` d'avant remis → `pluriels.test.ts` 11 rouges sur 17, et
  `accordsManquants` relève 52 messages (fr et en) ; correctif remis → 17 verts.
- Le branchement dans `check-i18n.mjs`, d'abord écrit, a été retiré : `check-pistes --role
  implementeur` refuse toute modification d'une garde existante (V9). La règle vit dans un module
  neuf, et c'est le test vitest qui la tient en CI.
- ICU `plural` ne lit qu'un nombre : `formatNumber(…)` (« 1 500 ») y rend `NaN`. Les appelants
  passent le nombre, et `#` le formate. Pour garder « 1,500 » en anglais, `publishedHint` (`en`,
  invariable) passe à `{count, number}`.
- Effet de bord assumé sur le wolof, non réécrit : un compte d'`AgencyKpis` qui y était formaté par
  l'appelant s'affiche désormais sans séparateur de milliers (« 1500 »).
- Messages invariables : liste écrite `INVARIABLES` de `scripts/i18n-pluriels.mjs`, par langue.
