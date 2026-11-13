---
id: TCK-2764
title: "Abandonner un brouillon de bail jamais envoyé en signature : il cesse d'occuper le bien, sans rien effacer ni rouvrir"
status: todo
phase: P1
family: full
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2747]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
tags: [back, front, leases, bookings, candidature, audit-ux]
---

## Objectif utilisateur

L'agent qui a préparé un bail pour un candidat qui se désiste l'abandonne. Le logement peut alors être promis à un autre candidat, sans attendre un bail qui ne sera jamais signé.

## Contrat de données

Constat (relevé le 2026-11-12, HEAD 3796d9052, rapport de back-4 sur TCK-2747) :

- **Depuis TCK-2747** (décision 6 du porteur), `BookingService::confirm()` refuse en 409 `booking.property_already_leased` la candidature d'un bien qui porte un bail `draft`, `pending_signature`, `active` ou `terminating` couvrant le début demandé (`BookingService::bauxQuiOccupent`). Le bail du candidat lui-même est excepté.
- **Un brouillon abandonné bloque donc les autres candidatures du bien sans limite de temps.**
  - Aucune route ne supprime un bail (`routes/api/leases.php`).
  - `LeaseService::terminate` n'accepte que `active` et `pending_signature` : un brouillon n'a aucune sortie.
- **Le modèle `Lease` est déjà `SoftDeletes`.** `bauxQuiOccupent` part de `Lease::query()`, qui écarte les lignes supprimées.
- **Un brouillon peut porter une caution saisie** avant l'activation. `generateSchedule` exige `active`, mais une échéance `deposit` peut exister (P46.04, TCK-957).
- **Un renouvellement ne naît jamais brouillon** : `LeaseRenewalService` le crée `pending_signature` ou `active`. Aucun bail parent n'est touché par l'abandon d'un brouillon.
- **Décision 7 du porteur** (TCK-2734) : les autres candidatures ne se ferment qu'à l'**envoi en signature**, plus à la création du brouillon. **Aucune candidature n'a donc été fermée par un brouillon.**

À servir :

- **`DELETE /api/leases/{lease}`** : l'abandon d'un brouillon. Corps facultatif `{ reason?: string(500) }`.
  - 200 → `{ data: { id, abandoned_at, origin_booking: { id, status } | null } }` ;
  - 422 `lease.not_draft_abandon` si le bail n'est pas `draft` ;
  - 422 `lease.abandon_has_payments` s'il porte un paiement non annulé ;
  - 403 hors de la règle d'autorisation.

## Décision : suppression douce, plutôt qu'un statut « abandonné »

**Retenu : la suppression douce (`deleted_at`)**, validée par le porteur le 2026-11-12 (nuit, point 6 de ses huit validations). Trois raisons, et un coût :

- **Un brouillon n'a engagé personne.** Rien n'est signé, rien n'est dû, aucun échéancier n'existe. Le faire disparaître des listes est juste, et l'histoire reste en base (`withTrashed`, journal).
- **Aucun lecteur ne change.** `bauxQuiOccupent`, les listes, la file « À traiter », les comptes et les rapports écartent déjà les lignes supprimées par Eloquent. Un statut neuf devrait, lui, entrer dans chaque lecteur de `LeaseStatus` :
  - les filtres et les comptes de `GET /api/leases/summary` ;
  - les unions de statuts du front (`check-status-unions`) et leurs libellés en trois langues ;
  - les rapports.

  Chacun serait un oubli possible, et un oubli remettrait le brouillon dans un compte.
- **Le modèle le porte déjà** (`SoftDeletes`), sans migration.
- **Ce qu'on perdrait** : un brouillon abandonné ne se voit plus dans l'historique du bien. C'est acceptable, puisqu'il n'a rien produit. Le journal en garde la trace, avec son auteur et son motif.

**Écarté : un statut `abandoned`.** Il est plus visible, mais il coûte tous les lecteurs ci-dessus pour un objet qui n'a jamais eu d'effet. Si l'historique des brouillons abandonnés devient un besoin, ce sera un filtre `withTrashed` sur la chaîne du bien, pas un statut.

**Les candidatures.** L'abandon ne rouvre et ne ferme **aucune** candidature.
- **Les autres candidatures du bien.** Rien ne les a fermées à la création du brouillon (décision 7). Elles redeviennent acceptables dès l'abandon, parce que le brouillon ne compte plus dans `bauxQuiOccupent`.
- **La candidature d'origine** (`leases.booking_id`) reste dans son état, `pending` ou `confirmed`.
  - Pendant qu'elle reste `confirmed`, la règle « une seule candidature acceptée par bien » (TCK-2734) empêche toujours d'en accepter une autre. **C'est voulu** : le brouillon peut être abandonné pour être refait pour le même candidat.
  - L'écran le dit, et propose de la fermer par son **propre** geste, après l'abandon : `POST /api/bookings/{id}/reject` si elle est `pending`, `POST /api/bookings/{id}/cancel` si elle est `confirmed`. Ce sont deux gestes existants, avec leurs avis.
  - L'abandon ne la ferme pas en douce : fermer une candidature prévient le candidat, et l'agent doit le décider.

## Direction UX / Artistique

- Sur la fiche d'un bail **brouillon**, une action « Abandonner le brouillon », en ton destructif, sous les actions principales. Elle n'apparaît pas pour un autre statut.
- Le dialogue dit l'effet en une phrase : « Le brouillon disparaît des listes et le logement peut être proposé à un autre candidat. Rien n'est envoyé au locataire. » Le motif est facultatif.
- **Quand le brouillon vient d'une candidature**, le dialogue la nomme (« Candidature de Awa Ndiaye, acceptée »). Il propose une case « Fermer aussi cette candidature », **décochée**, et dit que, tant qu'elle reste acceptée, aucune autre ne peut l'être. Cochée, l'écran enchaîne le geste existant après l'abandon.
- Si une caution est saisie, l'action n'est pas proposée. Une phrase dit pourquoi, et quoi faire d'abord : annuler ou rembourser la caution.
- Après l'abandon, retour à la liste des baux, et un message de confirmation.
- i18n : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Contraintes strictes (métier)

- **`draft` seulement.** `pending_signature` a déjà une sortie, `terminate`. Ses candidatures ont été fermées à l'envoi (décision 7), et les rouvrir est un autre sujet.
- **Refus si le brouillon porte une échéance non annulée**, de tout type, caution comprise : 422 `lease.abandon_has_payments`. De l'argent saisi ne disparaît pas avec un brouillon.
- **Le contrôle se fait sous le verrou du bien, puis de la ligne du bail**, relue. C'est l'ordre bien → bail de `confirm()` : un abandon concurrent d'une signature demandée ne laisse pas un bail `pending_signature` supprimé.
- **Qui** : la règle de `LeasePolicy::update` (le bailleur qui écrit, le personnel de l'agence), exercée par une ability `abandon` qui y ajoute la condition `draft`. Pas de capacité neuve.
- **L'effet** : `deleted_at` posé, et rien d'autre en base que le journal. Les garants rattachés, les documents et la candidature d'origine restent.
- **Journal** : `activity('Lease')`, évènement `lease_draft_abandoned`, avec `lease_id`, `property_id`, `booking_id`, `reason` et l'acteur. L'audit du modèle (`Auditable`) garde sa trace de suppression.
- **Les documents** rattachés au brouillon ne se lisent plus que par leur téléverseur (`DocumentPolicy::view` : un porteur supprimé n'est plus atteint). C'est voulu, et le ticket le dit dans son test (AC7).
- **Codes d'erreur** : `lang/{fr,en,wo}/errors.php`, avec la parité de `LangGroupParity`.

## Delta à produire

- [ ] Route `DELETE leases/{lease}` → `LeaseController@destroy` (ou un contrôleur dédié), `AbandonLeaseDraftRequest` (`reason` facultatif, 500 au plus).
- [ ] `LeaseService::abandonDraft(Lease, User, ?string)` : verrous, refus, suppression douce, journal.
- [ ] `LeasePolicy::abandon`.
- [ ] Codes `lease.not_draft_abandon`, `lease.abandon_has_payments` (fr, en, wo).
- [ ] Front : l'action et son dialogue sur la fiche d'un bail brouillon (cf. Direction UX), avec l'enchaînement facultatif du geste de la candidature d'origine.
- [ ] Tests : `LeaseDraftAbandonTest` (back), et le test du dialogue (front).

## Critères d'acceptation

Fixture : un bien P, une candidature A `confirmed` (client CA), un brouillon de bail L tiré de A (`booking_id = A`), et une candidature B `pending` (client CB) sur P, dont le début demandé est couvert par L.

- [ ] **AC1 — La prémisse.** Avant l'abandon, confirmer B rend 409 `booking.property_already_leased`. Ce test est vert sur le code d'avant le ticket.
- [ ] **AC2 — L'abandon débloque le bien.**
  - `DELETE /api/leases/{L}` → 200.
  - L a `deleted_at`, et `GET /api/leases/{L}` → 404.
  - L n'est plus dans `GET /api/leases` ni dans les comptes de `GET /api/leases/summary`.
  - Ensuite, après la fermeture de A (`cancel`), confirmer B passe. Sans la fermeture de A, confirmer B rend le refus de TCK-2734 (une seule candidature acceptée), **et non** `booking.property_already_leased`.
  - Ablation : faire lire `bauxQuiOccupent` avec `withTrashed()` rend la confirmation de B rouge.
- [ ] **AC3 — Aucune candidature ne bouge.** Après l'abandon, A reste `confirmed` et B reste `pending`. Aucun avis de réservation n'est envoyé : le faux des notifications est vide.
- [ ] **AC4 — `draft` seulement.**
  - Un bail `pending_signature`, `active`, `terminating` ou `terminated` → 422 `lease.not_draft_abandon`.
  - La ligne est inchangée, et aucun journal n'est écrit.
- [ ] **AC5 — L'argent saisi.**
  - Le brouillon porte une échéance `deposit` `pending` → 422 `lease.abandon_has_payments`, et L reste.
  - Une fois cette échéance `cancelled`, l'abandon passe.
  - Ablation : retirer ce contrôle rend le test rouge.
- [ ] **AC6 — Qui.**
  - Le personnel actif de l'agence de L → 200.
  - Le bailleur de L (bien sans agence, bailleur particulier) → 200.
  - Le personnel d'une autre agence, le locataire désigné (CA), un bailleur bloqué de l'agence → 403.
- [ ] **AC7 — Ce qui reste.**
  - Les garants rattachés, les documents et A sont inchangés.
  - L se relit par `Lease::withTrashed()`.
  - Le journal porte `lease_draft_abandoned`, avec le motif.
  - Un document joint à L par l'agent X reste lisible par X (200), mais plus par un autre membre du personnel (403).
- [ ] **AC8 — La course.** Une demande de signature (`POST /api/leases/{L}/signature-request`) et l'abandon, lancés ensemble, ne laissent jamais un bail `pending_signature` supprimé : l'un des deux échoue proprement.
- [ ] **AC9 — Le front.**
  - L'action n'est rendue que sur un brouillon.
  - Avec une caution saisie, elle est remplacée par sa raison.
  - Le dialogue nomme la candidature d'origine, et sa case est décochée.
  - Décochée, un seul `DELETE` part. Cochée sur une candidature `confirmed`, `DELETE` puis `POST …/cancel`.

## Hors périmètre

- **Retirer de la signature un bail `pending_signature`** pour le ramener au brouillon, et rouvrir les candidatures que l'envoi a fermées. `terminate` reste la sortie d'aujourd'hui.
- **L'expiration automatique** d'un brouillon resté sans suite. Elle se décidera si l'abandon manuel ne suffit pas.
- **Restaurer un brouillon abandonné.** On recrée le bail depuis la candidature.

## Notes d'implémentation

_(à remplir par implementing-specs)_
