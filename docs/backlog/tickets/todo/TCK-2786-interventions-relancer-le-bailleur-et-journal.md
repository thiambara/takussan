---
id: TCK-2786
title: "Interventions : « Relancer le bailleur » sur une demande chez lui, et le journal de la demande, servis par l'API"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [back, front, maintenance, interventions, bailleur, relance, journal, suite-de-tck-2653, audit-ux, app]
---

## Objectif utilisateur

L'agent ou l'admin d'agence relance en un geste le bailleur d'une intervention qui attend sa décision, et lit sur la
fiche ce qui s'est passé, et quand : « 10:12 — Signalée par … », « Envoyée au bailleur », « Relancé ».

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 15 : « Relancer le bailleur » et le journal de la demande, côté
API. Ce sont les décisions n° 2 et n° 3 de TCK-2653, appliquées par défaut : pas de « Relancer le bailleur » ni de
journal tant que l'API ne les sert pas (relevé u).

**Constat, relu sur l'arbre du 2026-11-13.**

- **Relancer le bailleur.**
  - La file « Chez le bailleur » est le statut `awaiting_owner` : le devis dépasse le seuil d'accord du mandat, et
    seul le bailleur en sort (ADR-0037, `MaintenanceQuoteWorkflow::approveQuote`).
  - L'API ne sert pas le contact du bailleur au personnel (décision n° 2 de TCK-2653).
  - Aucune route ne relance le bailleur : les routes `maintenance-requests/{id}/…` couvrent statut, fin,
    acceptation, refus et devis, sans relance.
  - Le geste est donc absent de la carte et de la fiche (`gestePrincipal` : `bailleur` sans action).
- **Journal.**
  - L'API ne garde pas d'historique lisible d'une demande. `activity()` n'est écrit que par
    `MaintenanceQuoteWorkflow` (événements du devis, dont `quote.awaiting_owner`).
  - Les changements de statut passent par l'événement `MaintenanceStatusChanged` (cause, acteur). Ses écouteurs
    (`NotifyMaintenanceParticipants`, `SyncMaintenanceConversation`) notifient et tiennent le fil, mais
    n'enregistrent rien qu'on puisse relire.
  - `queue_entered_at` ne garde que l'entrée dans la file courante.

## Direction UX / Artistique

Le journal est une colonne calme, en liste chronologique (heure, puis qui, puis quoi), dans la colonne droite de la
fiche au bureau et sous la frise au téléphone. C'est la maquette de TCK-2653. Le geste « Relancer le bailleur »
devient le geste principal de la file « Chez le bailleur », sur la carte comme sur la fiche. Après une relance, il
dit « Relancé il y a 2 h », et il est indisponible tant que la relance suivante n'est pas permise. Les libellés
viennent du front (principe 5) : l'API émet des codes d'événement.

## Contraintes strictes (métier)

- **La relance passe par Takussan, sans servir le contact du bailleur.** La décision n° 2 de TCK-2653 tient. Le
  bailleur reçoit une notification « une intervention attend votre décision » par ses canaux préférés, qui mène à
  la décision du devis.
- **Qui relance** : le personnel actif de l'agence du bien qui gère les interventions (la capacité de dispatch de la
  fiche). Jamais le prestataire, le locataire, ni le bailleur lui-même.
- **Quand** : seulement en `awaiting_owner`. Ailleurs, 409 `maintenance.not_awaiting_owner`.
- **Une relance par demande et par 24 heures.** Au-delà, 409 `maintenance.owner_reminder_too_soon` avec la date de
  la prochaine relance permise. L'API sert `owner_reminded_at` et l'aptitude `can_remind_owner`.
- **Un bailleur parti ou bloqué** (TCK-2753) n'est pas relancé. Le geste est refusé avec un code, et le journal le
  dit.
- **Le journal** se lit par le personnel actif de l'agence du bien et par le super-admin. Le bailleur, le locataire
  et le prestataire n'y ont pas accès dans ce ticket.
- **Le journal ne révèle rien que le lecteur ne lit pas déjà.** Chaque entrée porte un code, une date, et un acteur
  réduit à `{id, full_name}` ou à « système ». Pas de montant de devis au-delà de ce que la fiche montre déjà à ce
  lecteur, et pas de motif de refus d'un tiers.
- L'historique commence au déploiement : pas de reprise des demandes existantes. Leur journal commence par une
  entrée « avant le journal ». Une reconstruction partielle mêlerait deux vérités, comme `last_contact_channel`.

## Delta à produire

- [x] Écouteur `RecordMaintenanceJournal` sur `MaintenanceStatusChanged` : une entrée `activity()` par transition
  (`log_name = maintenance`, `event = status.<cause>`, propriétés `from` et `to`), dans la même transaction que la
  transition ou après son commit.
- [x] Les événements du devis déjà écrits par `MaintenanceQuoteWorkflow` sont relus sous le même `log_name`, sans
  doublon avec les transitions.
- [x] Route `GET /api/maintenance-requests/{maintenanceRequest}/journal` → `MaintenanceJournalController@index`,
  policy `viewJournal`, ressource `MaintenanceJournalEntryResource` (`at`, `code`, `actor`), triée par date et
  paginée.
- [x] Route `POST /api/maintenance-requests/{maintenanceRequest}/owner-reminders` → `MaintenanceOwnerReminderController@store`,
  policy `remindOwner`. Code `NotificationCode::MaintenanceOwnerReminder` (`maintenance.owner_reminder`). Colonne
  `owner_reminded_at` (migration `add_owner_reminded_at_to_maintenance_requests`, `down()` qui la retire). Entrée de
  journal `owner_reminded`.
- [x] `MaintenanceRequestResource` : `owner_reminded_at`, et `abilities.can_remind_owner`.
- [x] Front : le geste « Relancer le bailleur » sur la carte « Chez le bailleur » et sur la fiche, et le journal de
  la fiche.
- [x] Tests `RelancerLeBailleurTest` (droits, statut, 24 h, bailleur parti, notification, entrée de journal) et
  `JournalDeLInterventionTest` (lecteurs admis et refusés, une entrée par transition, acteur réduit, aucune donnée
  hors fiche).

## Critères d'acceptation

- [x] AC1 — En `awaiting_owner`, `POST …/owner-reminders` par un agent de l'agence rend 201. Le bailleur reçoit une
  notification `maintenance.owner_reminder` dont la cible mène à la décision du devis, et `owner_reminded_at` est
  posé.
  _Preuve : `RelancerLeBailleurTest::test_ac1_…` (201, avis `maintenance.owner_reminder` cible `maintenance`/id, `owner_reminded_at` posé, entrée `owner_reminded`)._
- [x] AC2 — Une seconde relance dans les 24 h rend 409 `maintenance.owner_reminder_too_soon` avec la date permise.
  Après 24 h, elle rend 201.
  _Preuve : `test_ac2_une_relance_par_24_heures_avec_la_date_permise` (409 + `params.available_at` à 23 h, 201 à 24 h 01)._
- [x] AC3 — Le prestataire, le locataire et le bailleur reçoivent 403. Hors `awaiting_owner`, la réponse est 409.
  _Preuve : `test_ac3_ni_le_prestataire_ni_le_locataire_ni_le_bailleur`, `test_le_bailleur_aussi_agent_de_l_agence_ne_se_relance_pas`, `test_le_personnel_d_une_autre_agence_ou_sans_maintenance_assign_recoit_403`, `test_ac3_hors_awaiting_owner_409`._
- [x] AC4 — Une demande menée de `open` jusqu'à `closed`, en passant par `awaiting_owner`, donne un journal dont chaque transition a une entrée,
  dans l'ordre, avec son acteur ; la relance y figure.
  _Preuve : `JournalDeLInterventionTest::test_ac4_…` — onze entrées de `created` à `status.confirmed`, la relance entre `status.quote_awaiting_owner` et `status.quote_approved`, chacune avec son acteur._
- [x] AC5 — Le journal rend 403 au bailleur, au locataire et au prestataire, et 200 au personnel de l'agence.
  _Preuve : `test_ac5_lecteurs_admis_et_refuses` (403 bailleur, locataire, prestataire, autre agence ; 200 agent et super-admin)._
- [x] AC6 — Front : la carte « Chez le bailleur » montre « Relancer le bailleur ». Après la relance, elle affiche
  « Relancé il y a … » et le geste est inactif. La fiche montre le journal.
  _Preuve : `takussan-web/src/components/maintenance/files/__tests__/relancer-le-bailleur.tck-2786.test.tsx` (carte : geste en un clic, « Relancé il y a 2 h » inactif, de nouveau possible à 24 h ; fiche : geste principal, journal). Relevé de fidélité à 390/1280 non fait (base de démo sans demande `awaiting_owner` relançable sans écriture)._
- [x] AC7 — Vérifié par ablation. Un écouteur retiré rend AC4 rouge. Une garde de 24 h retirée rend AC2 rouge. Une
  policy de journal ouverte au bailleur rend AC5 rouge.
  _Preuve : ablations, une à la fois, md5 restauré — écouteur → AC4 rouge ; garde de 24 h → AC2 rouge ; `viewJournal` ouvert au bailleur → AC5 rouge ; plus `remindOwner` en `isPrincipalFor`, sans capacité, sans agence, sans statut, sans garde du bailleur parti, `properties` exposées : tous rouges._

## Hors périmètre

- Servir au personnel le téléphone du bailleur : la décision n° 2 de TCK-2653 tient.
- Le journal lu par le bailleur, le locataire ou le prestataire (TCK-2654), qui demanderait sa propre règle de ce
  qui se montre.
- Le carnet des prestataires (recherche, zones, délai de réponse) : TCK-2772.

## Notes d'implémentation

- **Un seul écrivain par fait** (décision 1a, validée par team-lead le 2026-11-14) : le journal ne relit que le log
  `maintenance`, écrit par `RecordMaintenanceJournal` (une entrée par `MaintenanceStatusChanged`, devis compris),
  par `MaintenanceRequestController::store` (`created`) et par `OwnerReminder` (`owner_reminded`,
  `owner_unavailable`). Les `activity()` du devis, du refus et de la contestation restent dans le log `default`.
- **Avant le journal** : une demande sans entrée `created` s'ouvre, en première page, sur `journal.before` (jamais
  écrite) ; `meta.starts_with_request` le dit aussi.
- **Bailleur parti, suspendu ou injoignable** : 409 `maintenance.owner_unavailable`, et une entrée
  `owner_unavailable` — une seule par suite de refus.
- **Carte** (décision 2a, validée par team-lead le 2026-11-14) : « Relancer le bailleur » agit depuis la carte ; au bureau, la carte de colonne ne
  porte que lui (maquette TCK-2653). `abilities.can_view_journal` ajouté pour que la fiche sache si elle lit le
  journal.
- **Le geste, trois exigences de team-lead (2026-11-14)** : la relance réussie se voit (le geste dit « Relance
  envoyée », inactif) et s'annonce (région `role="status"` présente dès le rendu) ; le refus de cadence dit le délai
  restant tiré d'`available_at` (« dans 22 h, le … à … », arrondi au-dessus : `dureeJusqua`) ; un seul envoi par
  geste (bouton inactif pendant l'envoi, plus un verrou synchrone pour le second clic du même tour). Testé, et
  chaque point rougit à son ablation (verrou, `disabled`, état envoyé, délai, région née pleine).
