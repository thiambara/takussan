---
id: TCK-1867
title: "La fiche et la bibliothèque des documents ne montrent que les gestes que `DocumentPolicy` accorde, par `abilities`"
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
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-189--gestes-montrés-par-une-comparaison-didentité-ou-de-rôle-dans-les-détails-refusés-par-la-policy"
tags: [back, front, documents, permissions, pistes]
---

## Objectif utilisateur

Le téléverseur d'un document, suspendu comme bailleur dans l'agence du porteur, ne se voit plus
offrir « Nouvelle version », « Restaurer », « Partager » ni « Supprimer », que l'API lui refuse.

## Contexte

Réf : **P189.01** du fichier de pistes, `retenu · autonome` (A1 : la règle est écrite dans
`DocumentPolicy`, `update`, `share` et `delete`).

La fiche ouvre la gestion des versions par la seule identité (`uploaded_by === currentUserId`), la
bibliothèque rend « Partager » et « Supprimer » sur chaque ligne sans condition, et
`DocumentResource` ne sert aucun verdict.

## Hypothèses (mode sans humain)

- Comme le recommande la Piste, et comme `LeaseResource` (P152.02, TCK-1424) : `DocumentResource`
  rend `abilities` (`update`, `share`, `delete`) calculés par `DocumentPolicy` pour l'appelant.
- La bibliothèque lit la liste : les verdicts y sont rendus aussi. Pour que la liste ne coûte pas
  une batterie de requêtes par ligne (`ProListQueryBudgetTest`), le porteur est préchargé et les
  jugements de profil de la page sont amorcés une fois (`MembershipCapabilityResolver::primed`,
  TCK-603), sans changer aucune règle.
- « Nouvelle version » et « Restaurer » suivent `update` (`DocumentVersionController` autorise par
  `update`), « Partager » suit `share`, « Supprimer » suit `delete`. Sans `abilities`, aucun geste.

## Delta à produire

- [x] `DocumentResource` : `abilities` (`update`, `share`, `delete`) pour l'appelant authentifié.
- [x] `DocumentController::index` et `SearchDocumentController::index` : porteur préchargé,
  jugements de profil amorcés pour la page.
- [x] Front : la fiche lie la gestion des versions à `abilities.update` ; la bibliothèque lie
  « Partager » et « Supprimer » à `abilities.share` et `abilities.delete`.
- [x] Tests : API (bailleur suspendu → trois `false`, témoin → trois `true`, liste et détail),
  `DocumentDetailClient` et `DocumentsLibrary` sans les gestes refusés.

## Critères d'acceptation

- [x] AC1 — Téléverseur bailleur suspendu dans l'agence du bien : `GET /api/documents/{id}` et
  `GET /api/documents` rendent `abilities` `update`, `share`, `delete` à `false` ; non suspendu, à
  `true`.
- [x] AC2 — La fiche ne monte « Nouvelle version » ni « Restaurer » sans `abilities.update` ; la
  bibliothèque ne monte « Partager » que sous `abilities.share`, « Supprimer » que sous
  `abilities.delete`.
- [x] AC3 — La liste des documents coûte toujours autant de requêtes pour 12 lignes que pour 2.

## Hors périmètre

- Toute règle de `DocumentPolicy`.
- Tout texte affiché.

## Notes d'implémentation

- Ablation : `abilities` retirés de `DocumentResource` → 3 rouges API (`DocumentAbilitiesTest`) ;
  gestes rendus sans condition et fiche remise sur l'identité → 5 rouges front ; remis → verts.
- Piège : `ProListQueryBudgetTest` ne crée que des biens sans agence, où `landlordWrites` ne lit
  pas le statut du bailleur : il ne voyait que la relecture du porteur. Dans une agence, chaque
  ligne coûtait trois `owner_profiles` de plus (+30 pour 12 lignes, mesuré en retirant l'amorce).
  D'où le test de budget propre à `DocumentAbilitiesTest`, et `blocked_owner` dans l'amorce de
  `MembershipCapabilityResolver::primed()`, jugé paresseusement pour ne rien coûter à la liste
  des biens.
- La page `/app/documents/[id]` ne lit plus `getMeAction()` : l'identité n'y sert plus à rien.
