---
id: TCK-1027
title: "Garde : pas de règle `exists:` neuve sur une table d'agence quand l'`authorize()` laisse passer tout compte"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-62--règles-exists-des-routes-ouvertes-à-tout-compte-connecté--oracles-dexistence"
tags: [api, autorisation, garde, pistes]
---

## Contexte

Réf : **P62.08** du fichier de pistes, `retenu · autonome` (A5). Une règle `exists:` sur une
table d'agence, dans un FormRequest dont l'`authorize()` ne juge rien, rend 422 pour un
identifiant absent et laisse passer celui d'une autre agence : la route dit à tout compte
connecté ce qui existe. Le défaut a été corrigé route par route (TCK-599, TCK-732, TCK-817), et
chaque correctif ne l'a écrit que dans un commentaire ; P62.01 à P62.07 relèvent les treize
FormRequests qui ont encore cette forme. Aucun test ni garde ne lit `exists:`.

## Objectif

Un FormRequest neuf de cette forme fait rougir la suite, et la liste des formes existantes ne fait
que décroître.

## Delta à produire

- [x] `tests/Unit/Architecture/ExistsSurRouteOuverteTest.php` : balaie `app/Http/Requests/` hors
      `Admin/` et `Auth/`, retient les FormRequests dont l'`authorize()` rend `true` ou ne teste
      que la présence d'un compte (ou qui n'en ont pas et étendent `FormRequest`), et qui portent
      `exists:` ou `Rule::exists()` sur une table d'agence, commentaires exclus ; compare à une
      liste d'exceptions dont chaque entrée cite sa Réf.

## Critères d'acceptation

- [x] AC1 — Les treize FormRequests relevés par P62.01 à P62.07 sont en exceptions, chacun avec
      sa Réf ; la garde est verte.
- [x] AC2 — Un `exists:properties,id` ajouté à un FormRequest ouvert hors liste
      (`StoreFavoriteRequest`) la fait rougir, en le nommant.
- [x] AC3 — Une exception qui n'a plus la forme (corrigée, ou fichier disparu) la fait rougir,
      pour qu'on la retire : la liste ne fait que décroître.
- [x] AC4 — Une mention de `exists:` dans un commentaire ne compte pas.

## Hypothèses (mode sans humain)

- **Les tables d'agence** sont celles de la `Piste` (`customers`, `leases`, `guarantors`, `users`,
  `conversations`, `maintenance_requests`, `properties`), plus `agencies`, `agency_roles` et
  `bookings` : sans elles, trois des treize FormRequests de P62.07 et P62.01 ne seraient pas vus,
  alors que la mesure les compte.
- **« Ne juge rien »** : `return true;`, `return $this->user() !== null;` (et ses variantes
  `!= null`, `instanceof User`, `auth()->check()`), ou aucun `authorize()` sur une classe qui
  étend `FormRequest` (Laravel autorise alors). Un `authorize()` qui délègue à une policy juge.

## Hors périmètre

- Corriger les treize FormRequests : P62.01 à P62.07, au porteur (V2).
- Les règles d'existence écrites ailleurs que dans un FormRequest (contrôleur, service).

## Notes d'implémentation

- Une garde ne rougit pas avant d'exister : elle s'éprouve par ablation. Liste d'exceptions
  vidée → rouge, les 13 nommés ; `exists:properties,id` ajouté à `StoreFavoriteRequest` → rouge,
  le fichier nommé ; exception fantôme → rouge (péremption) ; commentaires non retirés → rouge
  (le commentaire de `CreateInvitationRequest::authorize()` masque alors sa forme). Remis → 3 verts.
- La garde vérifie qu'elle a lu plus de 100 fichiers : un balayage vide serait vert.
