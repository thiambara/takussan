---
id: TCK-997
title: "Le bailleur se désigne à la saisie du bien : le bail, les reversements, le relevé, la copie et le lot le suivent (P15.06, P50.01 à P50.03)"
status: todo
phase: P1
family: applicatif
estimate: L
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: [TCK-999, TCK-1000]
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#15-transactions--paiements
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#34-ownerprofile-
tags: [back, front, properties, leases, payouts, owners, porteur, pistes]
---

## Objectif utilisateur

Que l'agent qui saisit le bien d'un bailleur de son agence le fasse **au nom de ce bailleur**, pour
que le bailleur voie son bien, ses baux et son relevé, et que ses loyers lui soient reversés.

## Contrat de données

Sources : P15.06, P50.01, P50.02 et P50.03 de
[`docs/plans/2026-10-15-pistes-d-amelioration.md`](../../plans/2026-10-15-pistes-d-amelioration.md),
constats mesurés le 2026-10-19 ; décisions du porteur du même jour (ci-dessous) ;
[ADR-0036](../../adr/0036-l-agent-responsable-est-le-collaborateur-principal.md), amendement du
2026-10-19.

- **Titulaire** : `properties.user_id` (`Property::owner()`), dont tirent le bail (`LeaseService::create`,
  `landlord_id = $property->user_id`), la liste « mes biens » du bailleur (`PropertyController::index`),
  `PropertyPolicy::view` et `update`, le reversement (`PayoutService::create`, `PayoutCalculator`) et
  le relevé (`OwnerStatementPolicy`, `SendOwnerStatements`).
- **Bailleurs actifs de l'agence** : `OwnerProfile` `status = active`, `user_id` non nul, de
  l'agence du bien ; lus par `GET /api/owners` (agences `standard` seulement, TCK-284).
- Endpoints touchés : `POST /api/properties` (`owner_id`, `parent_id`),
  `POST /api/properties/{id}/duplicate`, `PUT /api/properties/{id}` (`parent_id`),
  `GET /api/owner-statements` (relevé, `landlord_id`), commande `payouts:send-owner-statements`.
- Notification neuve : `NotificationCode::PropertyAssignedToOwner` (`property.assigned_to_owner`),
  réutilisée par TCK-999 et TCK-1000.

## Direction UX / Artistique

Formulaire de bien, agence `standard`, personnel tenant `properties.create` : un choix « Bailleur »
facultatif avec recherche parmi les bailleurs actifs, l'agence étant le choix par défaut (« bien de
l'agence »). Formulaire de bail : la ligne « Bailleur » nomme le titulaire du bien choisi, jamais
l'utilisateur courant. Rien de neuf pour un bailleur ni pour une agence `individual`. L'invitation
depuis le formulaire est TCK-1000.

## Décisions du porteur (2026-10-19)

1. **Q1 a** — l'agence peut garder un bien en propre : le choix du bailleur est **facultatif**, et le
   relevé et l'avis suivent la règle du reversement.
2. **Q2 a** — un bien saisi pour un bailleur invité reste au nom de son auteur et passe au bailleur
   quand il accepte l'invitation : **TCK-1000**, sur l'amendement d'ADR-0036.
3. **Q3 a** — le titulaire d'un lot se fixe **dès sa création** ; le rattachement ne réécrit jamais
   `user_id`.
4. **Q4 a** — rattacher au bien de B un lot qui appartient à un autre bailleur → 422.
5. **Q5 a** — un geste « changer le titulaire » pour les biens déjà saisis au nom du personnel :
   **TCK-999**.
6. **Q6 a** — le bailleur est prévenu par une notification qu'un bien a été saisi à son nom.

Ce que la session en a tiré (ADR-0036, amendement) : le rattachement d'un lot **tenu par le
personnel** sous le bien d'un bailleur est refusé aussi (422), puisqu'il ne peut plus réécrire le
titulaire ; le lot passe d'abord par « changer le titulaire » (TCK-999).

## Contraintes strictes (métier)

- **Le titulaire se juge côté API** : un bailleur `active` de l'agence du bien, sinon 422 et aucun
  bien créé. Jamais un bailleur d'une autre agence, jamais un profil `draft`, `inactive` ou
  `blocked`, jamais un membre du personnel désigné par ce champ.
- **Un bailleur ne désigne que lui-même** (ADR-0031 § 2) : une proposition (`createsProposal`) qui
  porte `owner_id` est refusée en 422.
- **Agence `individual`** : le titulaire reste le créateur (features § 1.12, TCK-284) ; `owner_id`
  est refusé en 422.
- **Le corps du bail ne choisit pas le bailleur** : `LeaseService` continue d'ignorer `landlord_id`
  envoyé et le tire du bien.
- **Une seule règle de bénéficiaire** (Q1) : le reversement, le relevé et l'avis mensuel jugent le
  bénéficiaire par le **même** prédicat (bailleur, ou personnel de l'agence pour un bien qu'elle
  garde), écrit une fois et appelé trois fois.
- **ADR-0036 amendé** : ce ticket n'écrit `user_id` qu'à la création (bien, copie, lot). Il ne code
  ni le transfert à l'acceptation (TCK-1000) ni le geste (TCK-999).
- La désignation est journalisée (`activity('Property')`, évènement `owner_designated`, auteur et
  bailleur) : elle décide à qui vont des loyers.

## Delta à produire

Lot A — désignation, bail, copie et lot :

- [ ] `StorePropertyRequest` : champ facultatif `owner_id` (identifiant d'utilisateur), validé par
  une règle qui exige un `OwnerProfile` `active` de l'agence du bien ; champ `parent_id` ouvert à
  la création, jugé par `PropertyPolicy::updateParent` comme à la mise à jour ; codes
  `property.owner_not_in_agency` et `property.owner_designation_forbidden`.
- [ ] `PropertyController::store` : `user_id` = `owner_id` validé, sinon le titulaire du parent
  quand c'est un bailleur de l'agence (lot), sinon l'auteur ; un `owner_id` différent du titulaire
  bailleur du parent → 422 ; refus pour une proposition et pour une agence `individual` ;
  journalisation `owner_designated` ; notification `property.assigned_to_owner` au bailleur.
- [ ] `PropertyController::update` (`parent_id`) : 422 `property.parent_owner_mismatch` quand le
  parent a un bailleur pour titulaire et que le lot en a un autre (bailleur ou personnel) ;
  `user_id` jamais réécrit.
- [ ] `PropertyDuplicationService` : la copie prend le titulaire de la source quand c'est un
  bailleur de l'agence de la source (notification comme à la saisie), sinon l'acteur.
- [ ] `NotificationCode::PropertyAssignedToOwner`, ses textes `fr` et `en`, `wo` = texte français
  (wolof en pause), canaux comme `owner_statement.available`.
- [ ] Tests : `PropertyOwnerDesignationTest` (AC1 à AC4, AC9, AC10), `PropertyDuplicationOwnerTest`
  (AC6), `PropertyChildOwnerTest` (AC7).

Lot B — le relevé suit le reversement (Q1) :

- [ ] Un prédicat unique du bénéficiaire, appelé par `PayoutService::create`,
  `OwnerStatementPolicy::view` et `SendOwnerStatements`.
- [ ] Test `OwnerStatementBeneficiaryTest` : pour un même bien, le bénéficiaire du reversement est
  le lecteur du relevé et le destinataire de l'avis (AC5, AC8).

Lot C — écrans :

- [ ] Formulaire de bien : le choix du bailleur, dans les seules agences `standard` et pour le seul
  personnel tenant `properties.create`, avec `fields[owner_profiles]` restreint ; à la création
  d'un lot, le bailleur du parent est repris et non modifiable.
- [ ] Formulaire de bail : la ligne « Bailleur » lit le titulaire du bien choisi.
- [ ] Libellés `fr` et `en`, `wo` = texte français.
- [ ] Tests Vitest du choix (envoi de `owner_id`, absent par défaut) et du libellé du bail.

## Critères d'acceptation

Chaque test est rouge sans son correctif (ablation consignée dans les notes).

- [ ] AC1 — Agence `standard`, un agent, un bailleur B actif : l'agent crée un bien avec
  `owner_id` = B → 201, `properties.user_id` = B en base ; pour B, `GET /api/properties` le liste,
  `GET /api/properties/{id}` → 200, et B a une notification `property.assigned_to_owner` qui cite
  ce bien. *Un champ accepté puis ignoré échoue sur `user_id` ; une notification envoyée à l'auteur
  échoue sur le destinataire.*
- [ ] AC2 — `owner_id` = un bailleur d'une autre agence, un profil `draft`, `inactive` ou
  `blocked`, ou un agent de l'agence → 422, aucun bien créé (compte inchangé), aucune notification.
- [ ] AC3 — B, bailleur sans `properties.create`, propose un bien avec `owner_id` = un autre
  bailleur → 422 ; sans le champ, le bien proposé a B pour titulaire.
- [ ] AC4 — L'agent crée un bail sur le bien de AC1 en envoyant `landlord_id` = lui-même → 201,
  `leases.landlord_id` = B ; pour B, `GET /api/leases` → `total = 1`. Le formulaire de bail affiche
  le nom de B (test front qui échoue sur le libellé « utilisateur courant »).
- [ ] AC5 — Un loyer de ce bail est payé : `POST /api/payouts` vers B → 201 ; le relevé de B lu par
  l'admin → 200 et `gross` = ce loyer ; `payouts:send-owner-statements` pour la période → un avis à
  B. *Rejoue la mesure de P50.01, qui rendait 0 partout.*
- [ ] AC6 — L'admin duplique le bien de B → la copie a `user_id` = B ; dupliquer un bien dont le
  titulaire est du personnel garde le comportement actuel (titulaire = l'acteur).
- [ ] AC7 — L'agent crée un lot avec `parent_id` = le bien de B, sans `owner_id` → `user_id` = B,
  et B ouvre le lot (`GET /api/properties/{lot}` → 200) qu'il lit dans
  `GET /api/properties/{bien}/children`. Avec `owner_id` = un autre bailleur → 422. Rattacher par
  `PUT` au bien de B un lot d'un autre bailleur, ou un lot tenu par le personnel → 422, `parent_id`
  et `user_id` inchangés en base.
- [ ] AC8 — L'agent crée un bien sans `owner_id` → `user_id` = l'agent (bien de l'agence) ; un loyer
  payé sur un bail de ce bien : le relevé de l'agent est lisible par l'admin (200, aujourd'hui 403)
  et `payouts:send-owner-statements` lui envoie l'avis ; un utilisateur qui n'est ni bailleur ni
  personnel de l'agence → relevé 403 et aucun avis.
- [ ] AC9 — Agence `individual` : `owner_id` envoyé → 422 ; sans lui, titulaire = le créateur.
- [ ] AC10 — La désignation laisse une ligne `activity_log` `Property` / `owner_designated` (auteur,
  bailleur) et aucune ligne `updated` qui changerait `user_id`.

## Hors périmètre

- Le geste « changer le titulaire » (TCK-999) et le transfert à l'acceptation d'une invitation,
  avec l'invitation depuis le formulaire (TCK-1000).
- Le rattachement d'un compte à la fiche du locataire (P15.01).
- Le bail d'un agent parti et la revue de la passation (TCK-616).
- Les collaborateurs `co_owner` d'un bien.

## Notes d'implémentation

_(à remplir par implementing-specs)_

- À la fusion : retirer de `docs/models-spec.md` §3 la marque « à venir » de la désignation du bailleur à la saisie et du titulaire bailleur d'un lot (ligne `user_id`), et mettre à jour la phrase « Aujourd'hui » (passe `/sync-specs` 015, MD7).
