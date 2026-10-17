---
id: TCK-752
title: "Pluriels ICU en fr et en : plus de « 1 biens » ni de « (s) », et une garde"
status: todo
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

- [ ] `fr.json` et `en.json` : `plural` sur les messages qui s'accordent.
- [ ] Appelants : `String(n)` et `formatNumber(…)` remplacés par le nombre (`#` le formate).
- [ ] `scripts/check-i18n.mjs` : contrôle D, `{count} <lettre>` ou `<lettre>(s)` hors `plural`
      en `fr` et `en`, avec la liste écrite des messages invariables.
- [ ] Un test vitest qui rend les messages convertis à 1 et à 2.

## Critères d'acceptation

- [ ] AC1 — `nav.propertiesCount` rend « 1 bien » et « 2 biens » en `fr`, « 1 listing » et
      « 2 listings » en `en` ; de même pour chaque message converti.
- [ ] AC2 — `node scripts/check-i18n.mjs` rougit sur un `{count} biens` neuf hors `plural`.
- [ ] AC3 — `wo.json` inchangé.

## Hors périmètre

- Le wolof (pause).
- Les messages où la variable n'est pas `count` sans forme « (s) » : la garde ne les voit pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_
