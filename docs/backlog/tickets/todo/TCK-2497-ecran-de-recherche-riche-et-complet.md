---
id: TCK-2497
title: Écran de recherche « Riche et complet » : la barre actuelle, enfin visible au téléphone
status: todo
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, search, mobile, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur trouve sa recherche en un toucher (récente, populaire, quartier, type, autour de lui), voit ce que la barre a compris de sa saisie et l'ouvre d'un pouce, et n'arrive jamais devant zéro résultat sans issue.

## Contrat de données

`GET /api/search/suggest` tel qu'aujourd'hui, plus les ajouts optionnels de TCK-2496 (`relaxations`, interprétation tolérante, `published_after` — paramètre plat de `/api/public/properties/search`) : l'écran les montre quand l'API les rend, et s'en passe sinon. Recherches récentes : stockage de l'appareil (`recherches-recentes`), inchangé.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=recherche&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Avant la frappe », « Pendant la frappe », « Aucun bien », « Depuis la liste », téléphone et bureau.
- Avant la frappe : Louer/Acheter, Autour de moi, recherches récentes (rejouables, « Effacer »), recherches populaires avec leur compte, quartiers populaires, types de bien.
- Pendant la frappe : la saisie comprise en tête, en puces, avec son bouton « Voir les N biens » ; puis recherches fréquentes, lieux, types, trois biens.
- Aucun bien : « M'alerter » (alerte de TCK-599 pré-remplie), « Voir des biens proches » quand la liste s'élargira, critères à retirer avec leur compte.
- Depuis la liste : une ligne « Tes filtres restent : … » avec « Retirer ».
- En bureau, le même contenu dans le panneau sous le champ de l'en-tête, avec les aides clavier.

## Contraintes strictes (métier)

- **Aucune régression** de `SearchAutocomplete` (relevé du 2026-11-08) : saisie comprise et compte sous la base de la page, Entrée qui la valide, alerte à compte nul, « biens proches » seulement si la liste s'élargit, recherches fréquentes et populaires, lieux et types plafonnés, trois aperçus, texte libre sans compréhension, récentes effaçables, Louer/Acheter à trois états imposés à toute URL produite, motif combobox ARIA et annonce du nombre de suggestions, clavier ouvert au premier appui sur Safari iOS, champ en 16 px, fermer sans valider ne touche pas à l'URL.
- Louer/Acheter et le bouton principal ne sont **jamais recouverts** par la liste des suggestions (défaut relevé le 2026-11-08).
- « Autour de moi » ne demande la position qu'au toucher.

## Delta à produire

- [ ] Écran de recherche plein écran du téléphone selon la maquette D.
- [ ] Panneau de bureau enrichi (même contenu, aides clavier).
- [ ] Lecture des ajouts de TCK-2496 quand ils sont présents.
- [ ] Tests : chaque comportement de la liste « aucune régression » ci-dessus garde son test (existants conservés, nouveaux pour les ajouts) ; Louer/Acheter visible pendant la frappe.

## Critères d'acceptation

- [ ] AC1 — À 390 px, pendant la frappe, Louer/Acheter et le bouton « Voir les N biens » sont visibles au-dessus du clavier.
- [ ] AC2 — Tous les tests existants de `SearchAutocomplete` passent sans être réécrits dans leur intention.
- [ ] AC3 — Depuis `/fr/properties?…` avec deux filtres posés, l'écran les nomme, et le compte annoncé est celui de la liste ouverte.
- [ ] AC4 — Sans réponse de TCK-2496 (clé absente), l'écran « Aucun bien » montre l'alerte et les biens proches, sans bloc vide.

## Hors périmètre

- Les calculs côté API (TCK-2496).
- La recherche en langage naturel (approche C, non retenue).

## Notes d'implémentation

_(à remplir par implementing-specs)_
