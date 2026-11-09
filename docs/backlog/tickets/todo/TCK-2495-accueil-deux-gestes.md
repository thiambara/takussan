---
id: TCK-2495
title: Accueil « Deux gestes » : Louer/Acheter et catégories au téléphone, trois rangées sans doublon
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
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, accueil, mobile, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur arrive dans une liste filtrée en deux touchers (Louer, puis une catégorie), et voit des biens différents à chaque rangée.

## Contrat de données

Endpoints existants de l'accueil (rangées, quartiers). Aucun neuf.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=accueil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) (« Deux gestes »), téléphone et bureau.
- Pas de hero marketing : la recherche reste le premier objet de la page. Sous l'en-tête : Louer | Acheter, puis la rangée de catégories qui défile.
- Les quartiers en tuiles photo ; trois rangées au plus, de grammaire distincte.
- Cartes d'accueil : une pastille et le favori sur la photo, le comparateur en sort.
- Un bloc propriétaire chiffré en fin de page — du contenu, pas une bannière.

## Contraintes strictes (métier)

- Aucun bien n'apparaît dans deux rangées de la même page.
- « À Dakar » tant que la position n'est pas permise ; jamais une demande de position au chargement.
- Les sponsorisés suivent la règle de placement de TCK-2500 là où l'accueil en montre.

## Delta à produire

- [ ] Louer | Acheter et catégories visibles au téléphone.
- [ ] Rangées réduites à trois, dédoublonnées.
- [ ] Cartes d'accueil allégées (deux éléments au plus sur la photo sous `md`).
- [ ] Bloc propriétaire chiffré.
- [ ] Tests : dédoublonnage des rangées ; catégories présentes à 390 px.

## Critères d'acceptation

- [ ] AC1 — À 390 px, Louer/Acheter et au moins quatre catégories sont visibles sans défiler ; un toucher sur une catégorie ouvre la liste filtrée sur la transaction choisie.
- [ ] AC2 — Sur la base de démo, aucun identifiant de bien n'apparaît deux fois dans la page.
- [ ] AC3 — Aucune carte d'accueil ne porte plus de deux éléments sur sa photo sous `md`.

## Hors périmètre

- L'écran de recherche plein écran (TCK-2497).
- Le seed « vitrine » de démonstration.

## Notes d'implémentation

_(à remplir par implementing-specs)_
