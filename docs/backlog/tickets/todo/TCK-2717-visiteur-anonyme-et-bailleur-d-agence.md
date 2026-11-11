---
id: TCK-2717
title: "Le bailleur d'un bien d'agence lit le visiteur sans fiche par la carte comme par les champs, et l'avis suit la même règle"
status: todo
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2716, TCK-2585, TCK-2581]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [back, visites, bailleur, confidentialite, notifications, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

Le bailleur d'un bien confié à une agence voit, sur la visite d'un visiteur venu sans fiche, le même nom et le même
numéro partout où l'API les lui montre — et ne reçoit jamais, par un avis, un contact que l'écran lui cache.

## Contexte

Relevé pendant TCK-2581 (2026-11-11), règle M7″ de TCK-590 :

- `PropertyVisitResource` sert `visitor_name` / `visitor_phone` / `visitor_email` **à tout lecteur de la visite** quand
  elle n'a pas de fiche (`$visiteurLisible = $fiche || customer_id === null`) — donc au bailleur d'un bien d'agence
  (épinglé par `test_m7seconde…`, 01eb56712) ;
- mais `visitor_display` (TCK-2585) lui est **refusé** (`outilDeLaConsole()` : super-admin, personnel actif de l'agence
  du bien, propriétaire d'un bien sans agence). Le même lecteur lit le nom par un champ et pas par l'autre ; le front
  retombe d'ailleurs sur `visitor_name` (`SuiteDeLaVisite`, `EtMaintenant`).
- `VisitNotifier::params()` met `contact` = `visitor_phone · visitor_email` dans l'avis « visite demandée »
  (`VisitRequested`, `VisitRequestedWindow`), envoyé à `agencyRecipients(withPrimaryAndOwner: true)`, **propriétaire
  reconnu compris**, sans regarder la fiche. Or une demande peut naître AVEC une fiche : `PublicPropertyController:863`
  et `PropertyVisitController:387` posent `customer_id` quand le compte demandeur a déjà une fiche dans l'agence du bien.
  Dans ce cas la ressource cache le contact au bailleur, et l'avis le lui envoie.

La session a tranché (2026-11-11) de **garder** la lecture du contact d'un visiteur sans fiche par le bailleur, par
cohérence avec la décision du porteur du matin (« permettre de les voir » : le bailleur voit le téléphone et l'étape d'un
candidat). Reste à rendre les deux canaux cohérents avec cette règle.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tes recommandations sur les dix points »).**

- **a) (recommandé)** une seule règle pour le bailleur d'un bien d'agence : il lit le contact du visiteur **quand la
  visite n'a pas de fiche**, par `visitor_*`, par la carte `visitor_display` et par l'avis ; il ne le lit **pas** quand
  elle en a une, avis compris — ce qui **change** l'avis d'aujourd'hui pour une demande faite par un client déjà fiché.
- b) fermer au bailleur le contact du visiteur sans fiche partout (`visitor_*` et avis) — revient sur la décision de
  session et sur `test_m7seconde…`.

## Contrat de données

- Prédicat nommé : **le propriétaire du bien hors console** — le lecteur est le propriétaire du bien de la visite
  (`VisitReadContext.owner_id`, valeur relue) et n'est pas de la console de ce bien (`outilDeLaConsole()` faux : bien
  d'agence dont il n'est pas personnel actif).
- `PropertyVisitResource.visitor_display` : servi aussi au **propriétaire du bien hors console** quand la visite n'a pas
  de fiche (`customer_id === null`), sous la forme
  `{name: visitor_name, phone: visitor_phone, kind: 'account'|'anonymous', visits_on_property: null}`. Pour la console,
  inchangé. `null` pour tout autre lecteur (le visiteur et le client compris) et pour le propriétaire sur une visite à
  fiche.
- `visits_on_property` devient `number | null` (le type du front suit) : le compte relie des visites que ce lecteur ne
  voit pas comme une même personne (celles planifiées sur la fiche) ; il ne lui est pas servi. Lecteurs du front à
  vérifier : `SuiteDeLaVisite` (`?? null`, déjà tolérant) et les visites par le temps (TCK-2587).
- `metadata` reste réservée à la console (`outilDeLaConsole()`, 012106f3b) : **deux prédicats distincts**, la carte n'est
  plus jugée par celui de la `metadata`.
- `VisitNotifier::params($visit, $code, …, $recipient)` : pour un destinataire qui est **le propriétaire du bien hors
  console** (même prédicat, jugé pour le destinataire), `contact` n'est posé que si `customer_id === null` ; pour les
  autres destinataires (agent, admins, contact principal du personnel), inchangé.

## Contraintes strictes (métier)

- La carte ne sort jamais **plus** que `visitor_*` au même lecteur : ni le nom de la fiche, ni `kind: 'customer'`, ni le
  rang de visite.
- Le préremplissage d'une fiche ne dépend plus de la carte (TCK-2716, `abilities.create_customer`) : ce ticket ne démarre
  pas avant lui, sinon il rouvre la faille du compte à double casquette (8a556c9dd).
- Le jugement « propriétaire du bien hors console » est le même dans la ressource et dans l'avis (une seule fonction),
  sur l'agence du bien et les valeurs relues, pas sur le profil actif du lecteur ou du destinataire.
- Aucun texte libre du visiteur n'entre dans l'avis (contrainte 4 de `VisitNotifier`) — inchangé.

## Delta à produire

- [x] `PropertyVisitResource` : prédicat de la carte séparé de `outilDeLaConsole()` ; forme réduite pour le lecteur hors
      console ; `visits_on_property` nul pour lui.
- [x] `VisitNotifier::params()` reçoit le destinataire ; `contact` retiré pour un destinataire hors console sur une visite
      à fiche.
- [x] Type du front `visitor_display.visits_on_property: number | null` (les lecteurs actuels font déjà `?? null`).
- [x] Tests : `ProprietaireDuBienTest` étendu (carte du bailleur), `VisitRequestRoutingTest` étendu (avis au bailleur
      avec et sans fiche).
- [ ] `/sync-specs` : `docs/models-spec.md` § 17 (lecteurs de `visitor_display`).

## Critères d'acceptation

- [x] AC1 — Bailleur d'un bien de l'agence A, visite anonyme V (sans fiche) : `visitor_display = {name, phone}` égaux à
      `visitor_name` / `visitor_phone` de la même réponse, `kind = 'anonymous'`, `visits_on_property = null` ; `metadata`
      **absente** de la réponse.
- [x] AC2 — Même bailleur, visite W rattachée à une fiche de A : `visitor_name`, `visitor_phone` et `visitor_display`
      nuls (comme aujourd'hui pour `visitor_*`).
- [x] AC3 — Personnel de A sur V : `visitor_display` inchangé (`visits_on_property` entier, `kind` juste) — test de
      non-régression sur la forme.
- [x] AC4 — Le compte à double casquette (personnel de B, bailleur du bien de V) lit la carte de V **et**
      `abilities.create_customer = false` sur V (la carte n'ouvre pas le préremplissage).
- [x] AC5 — Un compte qui a déjà une fiche dans A demande une visite publique du bien (visite née avec `customer_id`) :
      l'avis « visite demandée » reçu par le bailleur reconnu n'a **pas** de `contact` ; celui reçu par l'agent ou
      l'admin de A l'a.
- [x] AC6 — Demande anonyme (sans fiche) : l'avis du bailleur reconnu porte `contact` (comportement d'aujourd'hui gardé).

## Hors périmètre

- La règle du bailleur sur les candidats de réservation (décision du porteur du matin, déjà appliquée).
- Les autres avis de visite (confirmée, déplacée, annulée), qui ne portent pas `contact`.
- La lecture du compte rendu par un membre du personnel client de sa propre visite (autre décision en attente).

## Notes d'implémentation

- **Prédicat unique** : `App\Services\Visit\ProprietaireHorsConsole::est(User, ?ownerId, ?agencyId)` — propriétaire du
  bien (`properties.user_id`), bien d'agence, pas super-admin, pas personnel actif de l'agence du bien
  (`isStaffAt`, quel que soit l'espace ouvert). Jugé sur les valeurs RELUES (`VisitReadContext` dans la ressource, la
  visite et son bien dans l'avis), jamais sur le profil actif.
- **Ressource** : `PropertyVisitResource::visitorDisplay()` garde la carte complète pour la console
  (`outilDeLaConsole()`, inchangé) ; hors console, la forme réduite `{name, phone, kind: account|anonymous,
  visits_on_property: null}` pour ce seul lecteur et sur une visite sans fiche. La `metadata` reste à
  `outilDeLaConsole()` : deux prédicats distincts.
- **Avis** : `VisitNotifier::params(…, ?User $recipient)` (passé par `toAgency`) met `contact = null` pour ce
  destinataire quand `customer_id` est posé. Pour ne pas écrire « Pour joindre le visiteur : — », `contact` entre dans
  `NotificationCode::unnamedParams()` de `VisitRequested` / `VisitRequestedWindow`, avec les variantes
  `body_unnamed` / `mail_body_unnamed` (fr/en ; wo = fr, wolof en pause) : la phrase sans le contact. Le SMS ne
  portait pas le contact, inchangé.
- **Front** : `visitor_display.visits_on_property: number | null` (`src/types/visit.ts`) ; `SuiteDeLaVisite` le lisait
  déjà avec `?? null`. « Créer sa fiche » reste jugé par `abilities.create_customer` seul (TCK-2716).
- **Tests** : `ProprietaireDuBienTest` (AC1 à AC4), `VisitRequestRoutingTest` (AC5, AC6, et le propriétaire qui est
  aussi personnel de l'agence garde le contact), `PropertyVisitAddressVisibilityTest` amendé (le bailleur lisait
  `visitor_display = null` : il lit désormais la carte réduite de la visite sans fiche, et rien sur celle à fiche).
  Huit ablations rouges (carte refusée, rang servi, test de la fiche retiré côté carte et côté avis, contact toujours
  posé, variante retirée, prédicat vrai pour tous, personnel compris dans le prédicat).
- **Reste** : un gabarit d'avis surchargé par le super-admin (`fromTemplate`) pour `visit.requested` ne connaît pas la
  variante sans contact (risque préexistant, même famille que `lease_payment_due`). `/sync-specs` :
  `docs/models-spec.md` § 17 (lecteurs de `visitor_display`) et `docs/features.md` § 23 (contenu de l'avis au
  bailleur).
