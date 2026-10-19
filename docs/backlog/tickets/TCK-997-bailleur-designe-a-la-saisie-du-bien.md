---
id: TCK-997
title: "Le bailleur se désigne à la saisie du bien : le bail, les reversements, le relevé, la copie et le lot le suivent (P15.06, P50.01 à P50.03)"
status: blocked
phase: P1
family: applicatif
estimate: L
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
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
constats mesurés le 2026-10-19, décisions du porteur du même jour (P15.06 : prioritaire, à cadrer
avant de le confier, 2026-10-15).

- **Titulaire** : `properties.user_id` (`Property::owner()`), dont tirent le bail (`LeaseService::create`,
  `landlord_id = $property->user_id`), la liste « mes biens » du bailleur (`PropertyController::index`),
  `PropertyPolicy::view` et `update`, le reversement (`PayoutService::create`, `PayoutCalculator`) et
  le relevé (`OwnerStatementPolicy`, `SendOwnerStatements`).
- **Bailleurs actifs de l'agence** : `OwnerProfile` `status = active`, `user_id` non nul, de
  l'agence du bien ; lus par `GET /api/owners` (agences `standard` seulement, TCK-284).
- **Invitation** : `POST /api/agencies/{agency}/owners/invite` (TCK-256) crée un `OwnerProfile`
  `draft` **sans** `user_id` : un invité n'a pas de compte tant qu'il n'a pas accepté.
- Endpoints touchés : `POST /api/properties`, `POST /api/properties/{id}/duplicate`,
  `PUT /api/properties/{id}` (`parent_id`), `GET /api/owner-statements` (relevé, `landlord_id`),
  commande `payouts:send-owner-statements`. Aucun endpoint neuf, sauf réponse contraire à Q2 ou Q5.

## Direction UX / Artistique

Formulaire de bien, agence `standard`, personnel tenant `properties.create` : un choix « Bailleur »
avec recherche parmi les bailleurs actifs, et l'entrée « Inviter un nouveau bailleur » que
l'en-tête de `PropertyForm.tsx` prévoit depuis TCK-256 (`InviteOwnerSheet`, comportement selon Q2).
Formulaire de bail : la ligne « Bailleur » nomme le titulaire du bien choisi, jamais l'utilisateur
courant. Rien de neuf pour un bailleur ni pour une agence `individual`.

## Contraintes strictes (métier)

- **Le titulaire se juge côté API** : un bailleur `active` de l'agence du bien, sinon 422 et aucun
  bien créé. Jamais un bailleur d'une autre agence, jamais un profil `draft`, `inactive` ou
  `blocked`, jamais un membre du personnel désigné par ce champ.
- **Un bailleur ne désigne que lui-même** (ADR-0031 § 2) : une proposition (`createsProposal`) qui
  porte un autre titulaire est refusée en 422.
- **Agence `individual`** : le titulaire reste le créateur (features § 1.12, TCK-284) ; le champ est
  refusé en 422.
- **Le corps du bail ne choisit pas le bailleur** : `LeaseService` continue d'ignorer `landlord_id`
  envoyé et le tire du bien.
- **Une seule règle de bénéficiaire** (P50.02) : le reversement, le relevé et l'avis mensuel
  jugent le bénéficiaire par le **même** prédicat, écrit une fois et appelé trois fois.
- **ADR-0036 § 4** : hors création, seule la passation réécrit `user_id`, « jamais d'un bailleur,
  jamais vers un bailleur ». La désignation à la création et la copie (une création) la respectent ;
  le rattachement d'un lot (une mise à jour) ne la respecte pas : voir Q3. **Aucune écriture de
  `user_id` hors création n'est codée sans l'amendement d'ADR écrit d'abord.**
- La désignation est journalisée (`activity('Property')`, évènement `owner_designated`, auteur et
  bailleur) : elle décide à qui vont des loyers.
- **Spec** : la désignation n'est écrite ni dans `features.md` § 1.1 ni dans `models-spec.md` § 3,
  dont la colonne `user_id` dit encore « sur un bien d'agence, aussi bien le membre du personnel
  qui l'a saisi ». Une PR de spec, une fois Q1 à Q5 tranchées, précède l'implémentation.

## Delta à produire

Lot A — désignation, bail et copie (P15.06, P50.01, P50.03 en partie) :

- [ ] `StorePropertyRequest` : champ `owner_id` (identifiant d'utilisateur), facultatif ou
  obligatoire selon Q1, validé par une règle qui exige un `OwnerProfile` `active` de l'agence du
  bien ; codes `property.owner_not_in_agency` et `property.owner_designation_forbidden`.
- [ ] `PropertyController::store` : `user_id` = `owner_id` validé, sinon l'auteur (selon Q1) ;
  refus pour une proposition et pour une agence `individual` ; journalisation `owner_designated`.
- [ ] `PropertyDuplicationService` : la copie prend le titulaire de la source quand c'est un
  bailleur de l'agence de la source, sinon l'acteur (comportement actuel).
- [ ] Tests : `PropertyOwnerDesignationTest` (AC1 à AC4, AC9), `PropertyDuplicationOwnerTest` (AC6).

Lot B — le relevé suit le reversement (P50.02, selon Q1) :

- [ ] Un prédicat unique du bénéficiaire (bailleur, et personnel si l'agence garde des biens en
  propre), appelé par `PayoutService::create`, `OwnerStatementPolicy::view` et
  `SendOwnerStatements`.
- [ ] Test `OwnerStatementBeneficiaryTest` : pour un même bien, le bénéficiaire du reversement est
  le lecteur du relevé et le destinataire de l'avis (AC5, AC8).

Lot C — le lot rattaché (P50.03, après Q3 et Q4) :

- [ ] Selon Q3 : héritage du titulaire au rattachement (`PropertyController::update`, `parent_id`),
  après l'amendement d'ADR-0036 § 4 ; ou titulaire posé à la création du lot.
- [ ] Test `PropertyChildOwnerTest` (AC7).

Lot D — écrans :

- [ ] Formulaire de bien : le choix du bailleur et l'invitation, dans les seules agences `standard`
  et pour le seul personnel tenant `properties.create`, avec `fields[owner_profiles]` restreint.
- [ ] Formulaire de bail : la ligne « Bailleur » lit le titulaire du bien choisi.
- [ ] Libellés `fr` et `en`, `wo` = texte français (wolof en pause).
- [ ] Tests Vitest du choix (envoi de `owner_id`) et du libellé du bail.

## Critères d'acceptation

Chaque test est rouge sans son correctif (ablation consignée dans les notes).

- [ ] AC1 — Agence `standard`, un agent, un bailleur B actif : l'agent crée un bien avec
  `owner_id` = B → 201, `properties.user_id` = B en base ; pour B, `GET /api/properties` le liste
  et `GET /api/properties/{id}` → 200. *Un champ accepté puis ignoré échoue sur `user_id`.*
- [ ] AC2 — `owner_id` = un bailleur d'une autre agence, un profil `draft`, `inactive` ou
  `blocked`, ou un agent de l'agence → 422, et aucun bien n'est créé (compte inchangé).
- [ ] AC3 — B, bailleur sans `properties.create`, propose un bien avec `owner_id` = un autre
  bailleur → 422 ; sans le champ, le bien proposé a toujours B pour titulaire.
- [ ] AC4 — L'agent crée un bail sur le bien de AC1 en envoyant `landlord_id` = lui-même → 201,
  `leases.landlord_id` = B ; pour B, `GET /api/leases` → `total = 1`. Le formulaire de bail affiche
  le nom de B (test front qui échoue sur le libellé « utilisateur courant »).
- [ ] AC5 — Un loyer de ce bail est payé : `POST /api/payouts` vers B → 201 ; le relevé de B lu par
  l'admin → 200 et `gross` = ce loyer ; `payouts:send-owner-statements` pour la période → un avis à
  B. *Rejoue la mesure de P50.01, qui rendait 0 partout.*
- [ ] AC6 — L'admin duplique le bien de B → la copie a `user_id` = B ; dupliquer un bien dont le
  titulaire est du personnel garde le comportement actuel (titulaire = l'acteur).
- [ ] AC7 — Selon Q3 et Q4 : un lot saisi par le personnel puis rattaché au bien de B a pour
  titulaire B, et B ouvre le lot qu'il lit dans `GET /api/properties/{bien}/children` (aujourd'hui
  403).
- [ ] AC8 — Selon Q1 : si l'agence garde des biens en propre, pour un bien dont un agent est
  titulaire, le relevé de cet agent est lisible par l'admin (200, aujourd'hui 403) et l'avis lui
  part ; sinon, `owner_id` absent pour le personnel d'une agence `standard` → 422.
- [ ] AC9 — Agence `individual` : `owner_id` envoyé → 422 ; sans lui, titulaire = le créateur.

## Hors périmètre

- Le rattachement d'un compte à la fiche du locataire (P15.01).
- Le bail d'un agent parti et la revue de la passation (TCK-616), et la passation elle-même
  (ADR-0036 § 4), hors Q3.
- Les collaborateurs `co_owner` d'un bien.
- Les biens et baux déjà saisis au nom du personnel, sauf réponse contraire à Q5.

## Questions ouvertes pour le porteur

Rien de ce qui suit n'est tranché par les pistes ni par la spec ; le ticket reste `blocked` tant
qu'elles sont ouvertes.

1. **Q1 — L'agence peut-elle garder un bien en propre ?** La décision de P50.02 est conditionnelle
   (« si l'agence garde des biens en propre »). Oui : `owner_id` facultatif, l'auteur reste
   titulaire par défaut, et le lot B aligne le relevé et l'avis sur le reversement. Non : `owner_id`
   obligatoire pour le personnel d'une agence `standard`, et le lot B se réduit au refus.
2. **Q2 — Un bailleur invité n'a pas de compte** (`OwnerProfile` `draft`, `user_id` nul) tant qu'il
   n'a pas accepté. La décision borne la désignation aux bailleurs actifs. Que devient le bien saisi
   pendant l'invitation ? (a) il est créé au nom de l'auteur, sans suite ; (b) il garde le profil
   invité et passe au bailleur à l'acceptation, ce qui est une écriture de `user_id` hors création
   (amendement d'ADR-0036 § 4) ; (c) l'invitation depuis le formulaire n'envoie pas le bien avant
   l'acceptation.
3. **Q3 — Le lot rattaché** : l'héritage au rattachement réécrit `user_id` vers un bailleur, ce
   qu'ADR-0036 § 4 interdit. Amender l'ADR pour ce cas, ou poser le titulaire du lot à sa création
   (`StorePropertyRequest` n'accepte pas `parent_id` aujourd'hui) ?
4. **Q4 — Un lot qui a déjà un autre bailleur** pour titulaire, rattaché au bien de B : refus
   (422), titulaire gardé, ou héritage ?
5. **Q5 — L'existant** : les biens déjà saisis au nom du personnel pour un bailleur n'ont aucune
   voie de correction. Un geste « changer le titulaire » (écriture hors création, ADR-0036), une
   commande de reprise, ou rien ?
6. **Q6 — Prévenir le bailleur** qu'un bien a été saisi à son nom : une notification, ou rien ?

## Notes d'implémentation

_(à remplir par implementing-specs)_
