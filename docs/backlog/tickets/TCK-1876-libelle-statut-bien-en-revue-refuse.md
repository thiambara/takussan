---
id: TCK-1876
title: "Un bien en revue ou refusé a un libellé de statut dans les trois langues de l'API"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-192--libellés-résolus-par-une-clé-bâtie-sur-une-valeur"
tags: [back, i18n, admin, pistes]
---

## Objectif utilisateur

Le super-admin qui ouvre l'onglet « Biens » d'une agence lit « En revue » ou « Refusé », et non
`pending_review` ou `rejected`.

## Contexte

Réf : **P192.02** du fichier de pistes, `retenu · autonome` (A4 : deux clés manquantes dont les
libellés existent déjà au front, sans texte de produit neuf).

`PropertyStatus` compte onze cas, et `properties.status` n'en nommait que neuf : `enumLabel()` rendait
`null` pour `pending_review` et `rejected`, et `agency-detail.tsx` retombait sur le code.

## Hypothèses (mode sans humain)

- La `Piste` offre deux voies. Je prends la première, celle que nomme le classement A4 : ajouter les
  deux clés à l'API, avec les libellés de `property.status` du front (`fr` « En revue » / « Refusé »,
  `en` « In review » / « Rejected »).
- `wo` reprend mot pour mot le texte `wo` que `takussan-web/src/messages/wo.json` porte déjà pour ces deux clés (`property.status`) : aucun wolof neuf (pause du 2026-10-16), et la garde de parité `property-labels.parity.test.ts` refuse toute divergence nouvelle entre l'API et le front. Le texte français, d'abord écrit, l'a fait rougir en CI.

## Delta à produire

- [x] `lang/{fr,en,wo}/properties.php` : `status.pending_review` et `status.rejected`.
- [x] Test : `GET /api/admin/agencies/{agency}/properties` rend un `status_label` pour ces deux cas, en `fr` et en `en`.

## Critères d'acceptation

- [x] AC1 — Sous `Accept-Language: fr`, un bien `pending_review` a `status_label` « En revue », un bien `rejected` « Refusé ».
- [x] AC2 — Sous `Accept-Language: en`, « In review » et « Rejected ».

## Reste à faire

- Typer `status_label` en `string | null` dans `takussan-web/src/types/property.ts` (la `Piste` le
  demande ; hors du lot, qui ne touche que l'API).

## Hors périmètre

- La garde qui compare les cas d'un enum aux clés bâties sur lui (P192.03, TCK-1878).
- Les filtres du front qui ignorent ces deux statuts (P146.03).

## Notes d'implémentation

- Ablation : les clés retirées des trois fichiers → `test_un_bien_en_revue_ou_refuse_a_un_libelle_de_statut`
  rouge (`[null, null]` au lieu de `['En revue', 'Refusé']`) ; remises → vert.
