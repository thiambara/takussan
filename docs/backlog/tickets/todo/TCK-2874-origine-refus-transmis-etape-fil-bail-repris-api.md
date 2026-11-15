---
id: TCK-2874
title: "API : l'origine d'une candidature, le refus transmis au client, l'acceptation qui passe la fiche en Négociation (et son retour), et le client prévenu par SMS et e-mail"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2877, TCK-2878]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#7-customer"
tags: [back, bookings, crm, pipeline, notifications, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent lit d'où vient une candidature (« par le lien envoyé après la visite ») ; quand il refuse, le client reçoit son message ; quand il accepte, le client est prévenu par SMS et e-mail et la fiche passe en Négociation sans geste de plus — et se rattrape.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e2 ; app-fil-commercial e6 et e7 ; « Fil commercial non bouclé », point 2 de la synthèse). Relevé :

- aucune origine n'est écrite sur une réservation ;
- `BookingService::reject` écrit le motif en `cancellation_reason`, mais `booking.rejected` part sans lui (`BookingNotificationParams::for`) ;
- l'étape « Négociation » n'est que **proposée** (`CustomerSuggestedStageQuery`) ; la maquette e7 montre « Passé en Négociation · Annuler » (`app-fil-commercial-a-suite.tsx:569-573`) ;
- la maquette e7 dit « prévenu par SMS et e-mail » : à mesurer sur `booking.confirmed`.

Décisions : [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 6, 7, 8, qui précise [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md) § 5.

## Contrat de données

- `bookings.source` (enum `BookingSource`).
- `POST /api/bookings/{booking}/reject` : `reason_code`, `message`.
- `POST /api/customers/{customer}/pipeline-stage/undo` (neuf).
- `BookingResource` : `source`, `stage_change` (le changement d'étape fait à l'acceptation : `from`, `to`, `undoable_until`).

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 6 à 8.
- `via=invitation` est un **indice** sans droit : aucune autorisation n'en dépend.
- L'étape n'avance qu'à l'acceptation d'une candidature ou d'une offre, depuis Prospect ou Qualifié ; jamais depuis Gagné ou Perdu, jamais en arrière. Le retour arrière n'est possible que dans les 24 h, par le personnel de l'agence de la fiche, et seulement si l'étape n'a pas changé depuis.
- Le message de refus est le texte du personnel, transmis tel quel ; le motif est un code.

## Delta à produire

- [ ] Ajouter à ADR-0103 la mention « précisé par ADR-0110 § 8 » (ligne de statut), sans toucher à sa décision.
- [ ] Migration `add_source_to_bookings` (string, rattrapage `staff` si l'auteur est du personnel de l'agence, `public` sinon ; `down()`).
- [ ] Enum `BookingSource` ; tunnel public : lit `via=invitation` du corps de la requête ; `BookingService::create` pose la source.
- [ ] Lien d'invitation (« Inviter à candidater », TCK-2581) : l'URL porte `&via=invitation`, que la fiche publique transmet au tunnel.
- [ ] `RejectBookingRequest` (créée ou étendue) : `reason_code` (liste des motifs de `FeuilleDeDecision`), `message` (≤ 500) ; `BookingNotificationParams` : `reason_code`, `message` pour `booking.rejected` ; textes `fr`/`en`/`wo`.
- [ ] `BookingService::confirm` : pour une candidature ou une offre, passe la fiche en `negotiation` (si `prospect`/`qualified`) par le service d'étape existant, journalisé avec le fait ; `CustomerController::undoPipelineStage` + `UndoPipelineStageRequest` + route.
- [ ] Mesurer les canaux de `booking.confirmed` vers un client qui a mobile et e-mail ; les deux doivent partir.
- [ ] Tests : `BookingSourceTest`, `BookingRejectionMessageTest`, `BookingAcceptanceStageTest` (avance, n'avance pas depuis Gagné, retour dans 24 h, 409 après un autre changement, 422 après 24 h), `BookingConfirmedChannelsTest`.

## Critères d'acceptation

- [ ] AC1 — Une candidature déposée par le tunnel public avec `via=invitation` rend `source = invitation` ; sans, `public` ; saisie par l'agent, `staff`.
- [ ] AC2 — Refuser avec `reason_code = incomplete_file` et `message = "Il manque l'engagement du garant"` : la notification `booking.rejected` du client porte ces deux valeurs.
- [ ] AC3 — Accepter la candidature d'un client en Qualifié passe sa fiche en Négociation et rend `stage_change.from = qualified` ; l'undo dans l'heure la remet en Qualifié ; un client en Gagné ne bouge pas.
- [ ] AC4 — Un client qui a mobile et e-mail reçoit `booking.confirmed` par les deux canaux.

## Hors périmètre

- La réservation au fil de la fiche et le bail repris (TCK-2894) ; les écrans (TCK-2877 refus, TCK-2878 fil commercial).

## Notes d'implémentation

_(à remplir par implementing-specs)_
