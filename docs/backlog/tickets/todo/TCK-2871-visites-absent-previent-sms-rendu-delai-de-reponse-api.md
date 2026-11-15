---
id: TCK-2871
title: "API des visites : « Absent » prévient le visiteur et lui propose de replanifier, la visite créée rend le SMS parti, et le client lit le quartier, qui a annulé et le délai de réponse de l'agence"
status: todo
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2881, TCK-2882, TCK-2883]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, visits, notifications, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Le visiteur qui a manqué sa visite est prévenu et peut en reprendre une ; l'agent qui confirme une visite voit le SMS exact qui est parti et à quelle heure ; le client sait dans quel quartier il va, s'il a lui-même annulé, et en combien de temps l'agence répond d'ordinaire.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-visites e3, e6, e7 ; app-fil-commercial e2). Relevé :

- `PropertyVisitController::noShow` (l. 747-763) passe la visite en `no_show` et ne prévient personne ; la maquette (`app-visites-a-mobile.tsx`, CarteEnCours) dit « « Absent » prévient Abdoulaye et propose de replanifier ».
- La création d'une visite ne rend rien de la notification envoyée ; la maquette fil-commercial e2 montre « SMS envoyé à 09:21 » et le texte du SMS.
- La maquette app-visites e6 dit « prévenu par SMS et par e-mail », le produit « Un SMS a prévenu » : l'audit n'a pas pu dire si l'e-mail part (`VisitNotifier::toVisitor`).
- Côté client (e7), trois écarts « acceptés » faute de donnée : le quartier n'est pas servi avant confirmation (`PropertyVisitResource::adresseLisible`), « Annulée par vous » ne se distingue pas (aucun `cancelled_by` servi), « L'agence vous répond d'ordinaire en 2 h » n'a aucune mesure servie au client (`contact-leads/response-stats` est réservé au personnel).

## Contrat de données

- `POST /api/property-visits/{visit}/no-show` ; `POST /api/property-visits` ; `GET /api/property-visits` et `/{visit}` (lecture du visiteur) ; `PropertyVisitResource`.
- Notification neuve `visit.no_show` (ADR-0032 : code et paramètres) vers le visiteur.
- La mesure du délai de première réponse existe (ADR-0103, `ContactLeadResponseStatsController`).

## Contraintes strictes (métier)

- [ADR-0032](../../../adr/0032-l-api-n-ecrit-plus-de-prose.md) : la notification est un code ; le texte se rend par surface.
- Le **quartier** n'est pas l'adresse : il se sert au visiteur dès la demande ; la rue et le numéro restent réservés à la visite confirmée (règle actuelle de `adresseLisible`, inchangée).
- Le délai de réponse servi au client est **celui de l'agence** (médiane de la première réponse sur 90 jours), arrondi à l'heure, absent sous 10 demandes mesurées (pas de chiffre sur un échantillon trop petit) ; jamais celui d'un agent nommé.
- Le texte du SMS rendu à l'agent est **le texte effectivement envoyé** (rendu dans la langue du destinataire), pas une prose reconstruite ; absent quand aucun SMS n'est parti (borne `visit_sms_capped`, pas de mobile).

## Delta à produire

- [ ] `NotificationCode::VisitNoShow = 'visit.no_show'` (type `Visit`), paramètres : bien, date, lien de replanification (l'URL publique du bien, où « Demander une visite » existe déjà) ; textes `title`/`body`/`mail_*`/`sms` en `fr`/`en`/`wo` côté API.
- [ ] `PropertyVisitController::noShow` : envoie `visit.no_show` au visiteur par `VisitNotifier` (même borne SMS que les autres SMS de visite).
- [ ] `PropertyVisitController::store` : la réponse porte `notification: { channels: [...], sms: { queued_at, body } | null }` pour le personnel qui crée — `body` est le texte SMS **rendu au moment de la remise au canal** (rendu synchrone même si l'envoi part en file), `queued_at` l'heure de cette remise.
- [ ] Mesurer les canaux de `visit.confirmed` vers un visiteur qui a un e-mail ; si l'e-mail ne part pas, le faire partir (la maquette dit « par SMS et par e-mail »).
- [ ] `PropertyVisitResource` : `neighborhood` servi au visiteur dès la demande ; `cancelled_by` (`visitor` | `agency`) au visiteur et au personnel.
- [ ] `GET /api/agencies/{agency}/response-time` (lecture publique authentifiée, client de l'agence) : `{ median_hours, sample }` ou 204 sous le seuil.
- [ ] Tests : `VisitNoShowNotifiesVisitorTest`, `VisitStoreReturnsSmsTest` (texte = celui du canal SMS ; nul si borné), `VisitConfirmedChannelsTest`, `VisitResourceNeighborhoodTest` (quartier oui, rue non, avant confirmation), `AgencyResponseTimeTest` (seuil de 10, arrondi, aucune donnée par agent).

## Critères d'acceptation

- [ ] AC1 — Marquer « Absent » une visite confirmée passée envoie au visiteur une notification `visit.no_show` dont le SMS contient l'URL publique du bien.
- [ ] AC2 — Créer une visite pour un client qui a un mobile rend `notification.sms.body` égal au texte remis au canal SMS et `queued_at` à la minute près ; pour un client sans mobile, ou un SMS retenu par la borne, `notification.sms` est `null`.
- [ ] AC3 — Un visiteur qui a un e-mail et un mobile reçoit `visit.confirmed` par SMS **et** par e-mail (test qui échoue si l'un des deux canaux manque).
- [ ] AC4 — Un client lit sa visite `requested` : `neighborhood` présent, `address.line` absent.
- [ ] AC5 — Un client qui annule lit `cancelled_by = visitor` ; une visite annulée par l'agence rend `agency`.
- [ ] AC6 — Une agence qui a 12 premières réponses mesurées en 90 jours, médiane 1 h 40, rend `median_hours = 2` ; avec 9 réponses, 204.

## Hors périmètre

- Les écrans (TCK-2881, TCK-2882, TCK-2883).

## Notes d'implémentation

_(à remplir par implementing-specs)_
