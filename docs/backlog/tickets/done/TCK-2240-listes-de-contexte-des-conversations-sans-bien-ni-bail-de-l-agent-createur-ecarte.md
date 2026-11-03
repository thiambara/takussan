---
id: TCK-2240
title: "Les listes de contexte des conversations ne proposent plus à l'agent créateur suspendu ou retiré le bien et le bail qu'il a saisis"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-232--lecteurs-hors-policy-et-hors-liste-qui-tiennent-landlord_id-ou-user_id-pour-le-bailleur"
tags: [api, messaging, authorization, pistes]
---

## Contexte

Réf : **P232.04** du fichier de pistes, `retenu · autonome` (A1). `ConversationContextController`
écrit que ses listes (`GET /api/conversations/context/properties` et `…/leases`) sont la traduction
ligne à ligne de `PropertyPolicy::view` et `LeasePolicy::view`, et que la liste est incluse dans ce
que `CreateGroupConversationRequest` accepte. Depuis que ces policies jugent le créateur par
`BailleurDuBien` (TCK-1926, TCK-2031), les clauses `properties.user_id = user` et
`leases.landlord_id = user` ne le sont plus : l'agent qui a saisi un bien d'agence et son bail,
une fois suspendu ou retiré, se les voit proposer alors que `can('view')` les lui refuse.

## Delta à produire

- [x] `ConversationContextController::visiblePropertiesOnly` : clause « mes biens » par `BailleurDuBien::restreindre`.
- [x] `ConversationContextController::leases` : clause « bailleur » par `BailleurDuBien::restreindre(…, 'leases.landlord_id', 'leases.agency_id')`.
- [x] `ConversationContextTest` : agent créateur suspendu et retiré, plus témoins.

## Critères d'acceptation

- [x] AC1 — Agent créateur suspendu, puis retiré : le bien et le bail qu'il a saisis sont absents des deux listes (et la policy les lui refuse).
- [x] AC2 — Agent créateur actif : les deux restent listés (branche du personnel).
- [x] AC3 — Propriétaire tenant un profil propriétaire dans l'agence : son bien et son bail restent listés, et tout ce qui est listé passe la policy.
- [x] AC4 — Bailleur sans agence, locataire : inchangés (tests existants).

## Hypothèses

- Aucune : la règle à appliquer est celle des policies (`BailleurDuBien`), déjà écrite.

## Hors périmètre

- P232.03 (`ConversationAccess::contextAllows` et `constrainContext`, l'accès aux fils eux-mêmes) : `retenu · à valider` (V2).
- Les autres lecteurs de l'angle 232 (tableau de bord, archive RGPD, effacement, exports, reversements) : tous `à valider`.

## Notes d'implémentation

- Ablation, clause par clause : clause des biens remise → 2 rouges (« bien saisi proposé », suspendu et retiré) ; clause des baux remise → 2 rouges (« bail saisi proposé ») ; correctif rétabli → 17 verts.
- Les colonnes passées à `restreindre` sont qualifiées (`leases.landlord_id`, `leases.agency_id`…), comme le reste du contrôleur.
