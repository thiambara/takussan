---
id: TCK-2871
title: "API des visites : « Absent » prévient le visiteur et lui propose de replanifier, la visite créée rend le SMS parti, et le client lit le quartier, qui a annulé et le délai de réponse de l'agence"
status: done
phase: P1
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

### 2026-11-15 — implémentation (agent, vague 92)

**Prémisse re-mesurée.**
- `noShow` est à `PropertyVisitController.php` l. 762 (le ticket disait 747-763 : TCK-2849 a décalé). Il ne prévenait personne : confirmé.
- AC3 (« l'e-mail part-il ? ») : **il partait déjà**. `CodedNotification::via()` ouvre `mail` à un compte qui a un e-mail (préférence `visit_reminder` × e-mail vraie par défaut) ; `contactChannels()` ouvre `mail` à un contact sans compte qui en a laissé un. Rien à corriger : le livrable est le test qui le tient (`VisitConfirmedChannelsTest`, rouge par ablation de l'un ou l'autre canal).
- `cancelled_by` n'existait pas : colonne neuve (migration `2026_11_15_287100`, `varchar(16)` + CHECK `visitor|agency`, `down()` qui retire les deux). Les visites annulées avant restent `null` (rien ne dit qui les a annulées).
- Le quartier : `adresse()` le servait déjà, mais seulement dans `property.address`, fermé avant confirmation.

**Ce qui est livré.**
- `visit.no_show` (type `Visit`, préférence `visit_reminder`, `mobile()` et `reachesContacts()` vrais, famille `[V, à traiter : non]`) : paramètres `property`, `date` (le JOUR à Dakar — une visite à tranche n'a pas d'heure, on n'annonce pas le début de tranche) et `url` FACULTATIF (`PARAM_URL`) = `/{langue du destinataire}/properties/{slug}`, posé seulement si le bien est encore public ; sans lui, variante de base « Contactez l'agence ». Textes `fr`/`en`/`wo` (wo = fr), `sms_link`/`mail_body_link`. Clés front `notifications.codes.visit.no_show.{title,body}` et `notifications.repli.titres.visit.no_show` (`check-notification-codes` vert).
- `noShow` envoie par `VisitNotifier::noShow` (même borne `borneLeSms` que les autres SMS de visite) et rend le sort du SMS comme `confirm`/`cancel` (`avecSortDuSms`).
- `POST /api/property-visits` (personnel qui planifie, `planForCustomer` seulement) : `notification: {channels, sms: {queued_at, body} | null}`. `RemiseAuVisiteur` est rempli par `VisitNotifier` AU MOMENT de la remise : `via()` de la même `CodedNotification` (canaux traduits dans le vocabulaire `NotificationChannel` : `app`, `email`, `push`, `sms`, `whatsapp`), et `toSms()` de la même notification rendu sous la langue du destinataire (trait `Localizable`) et son fuseau. Le test compare `body` au texte que le prestataire SMS a reçu (bout en bout, seul l'HTTP du prestataire simulé), agent en `en`/New York, visiteur en `fr`/Paris. `queued_at` à la forme d'ADR-0018 (`BaseResource::instantOnWire`). `sms` vaut `null` sans mobile, SMS retenu par la borne, ou canal WhatsApp ÉLIGIBLE (gabarit approuvé). Mesuré dans `WhatsappChannel` : un compte à téléphone vérifié a WhatsApp par défaut (`MOBILE_DEFAULT_EVENTS`), et hors fenêtre sans gabarit approuvé — le cas ordinaire, `last_inbound_at` n'étant écrit par rien — le canal se replie sur le SMS avec `toSms()`. `WhatsappChannel::seReplieraitSurSms()` (public, neuf) dit ce repli à l'instant de la remise en rejouant `resolveMessage()` : la réponse rend alors `sms` et `channels` porte `sms` au lieu de `whatsapp`. Seul l'échec du fournisseur WhatsApp, repli plus tardif, n'est pas annoncé. Relais (compte sans téléphone vérifié) : le SMS consigné est celui du relais, qui est celui qui part. Un échec de consignation est journalisé et ne change jamais le sort de l'envoi.
- `PropertyVisitResource` : `property.neighborhood` à tout lecteur de la visite (dans le bloc `property`, hors `fields` : suit `include=property`) ; `address` inchangé. `cancelled_by` (`visitor` | `agency` | `null`), écrit par `cancelOrFail` dans la transaction qui annule, à partir du `$byVisitor` du contrôleur ; colonne de `$queryFields` (`fields[property_visits]=…,cancelled_by`).
- `GET /api/agencies/{agency}/response-time` (`AgencyResponseTimeController`) : `{data: {median_hours, sample}}` ou 204. `ContactLeadResponseStatsService::forClients()` : la requête « demandes répondues » est désormais partagée (`responded()`), une seule requête agrégée sur l'agence, aucun regroupement par agent. Médiane `percentile_cont` sur 90 jours, `round` à l'heure, **au moins 1 h** (« 0 h » ne dit rien — décision d'implémentation), 204 sous 10 réponses ou sans réponse.

**Décisions à relire par le porteur.**
- Autorisation de `response-time` : **tout utilisateur connecté**. « Client de l'agence » pris au sens d'usage : le visiteur d'une demande publique n'a le plus souvent AUCUNE fiche client chez l'agence (le chemin public n'en crée pas) ; exiger une fiche rendrait 403 à l'écran même que la route sert. La donnée est un agrégat d'agence, jamais par agent.
- `sms` nul seulement quand WhatsApp part réellement (gabarit approuvé) ; le repli SMS est annoncé comme un SMS (cf. plus haut).
- Plancher d'une heure pour `median_hours` (une médiane de 20 min rend 1).

**Mesures.** Tests : `VisitNoShowNotifiesVisitorTest` (4), `VisitStoreReturnsSmsTest` (4), `VisitConfirmedChannelsTest` (2), `VisitResourceNeighborhoodTest` (5), `AgencyResponseTimeTest` (4) ; `FormeDesDatesDeNotificationTest` étendu (`VisitNoShow` éprouvé par son émetteur réel). 17 ablations une à une, toutes rouges, restaurées au md5. `SmsSegmentsTest` vert (lien d'échantillon de 33 caractères). Avec un lien RÉEL (`https://takussan.com/fr/properties/<slug de 55>`, ~95 caractères), mesuré par `SmsSegmentCalculator` : `sms_link` fr écrit sans accent hors de la date → 182 caractères en GSM-7, **2 segments** ; en anglais 161, 2 segments ; mais un mois accentué (février, août, décembre) passe le texte en UCS-2 → **3 segments** — le même trou que les liens de paiement, déjà relevé en tête de `SmsSegmentsTest`. `VisitStoreReturnsSmsTest` porte aussi les cas WhatsApp par défaut (repli SMS rendu) et gabarit approuvé (`sms` nul) ; 21 ablations au total.

**Reste à la CI.** Suites entières ; balayages `NotificationCode::cases()` non joués ici (`RoleDelegationNotificationRoleTest`, `RienPourUnCompteNonJoignableTest`, `NotificationTemplateChannelsTest`, `NotificationParamTypesTest` joué : vert) ; `check-models-spec` rouge sur `BookingDossierItem` (TCK-2872, pas ce ticket).
