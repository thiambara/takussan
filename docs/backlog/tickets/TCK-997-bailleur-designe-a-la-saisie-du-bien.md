---
id: TCK-997
title: "Le bailleur se désigne à la saisie du bien : le bail, les reversements, le relevé, la copie et le lot le suivent (P15.06, P50.01 à P50.03)"
status: done
phase: P1
family: applicatif
estimate: L
wave: null
created: 2026-10-19
updated: 2026-10-25
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

## Validation du porteur (2026-10-25)

Recopiée mot pour mot du statut de chaque piste :

- P15.06 : validation du porteur (2026-10-25) : décisions 1a à 6a du porteur (2026-10-19), consignées dans TCK-997, TCK-999 et TCK-1000, V1 et V7 accordés ; les biens déjà saisis ne changent pas de titulaire en silence au déploiement
- P50.01, P50.02 et P50.03 : validation du porteur (2026-10-25) : TCK-997 tel qu'écrit (décisions 1a à 6a du porteur, 2026-10-19), V1 accordé
- P232.07 : validation du porteur (2026-10-25) : dans le prédicat unique de bénéficiaire de TCK-997, la branche du personnel exige un profil actif ; la branche du bailleur garde l'appartenance
- P232.05 (sa seconde moitié, la première relevant d'un autre lot) : validation du porteur (2026-10-25) : les deux clauses de baux de l'effacement bornées par `BailleurDuBien` ; `agenciesOwingPayout` aligné sur le prédicat de bénéficiaire de P232.07 (TCK-997)

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

- [x] `StorePropertyRequest` : champ facultatif `owner_id` (identifiant d'utilisateur), validé par
  une règle qui exige un `OwnerProfile` `active` de l'agence du bien ; champ `parent_id` ouvert à
  la création, jugé par `PropertyPolicy::updateParent` comme à la mise à jour ; codes
  `property.owner_not_in_agency` et `property.owner_designation_forbidden`.
- [x] `PropertyController::store` : `user_id` = `owner_id` validé, sinon le titulaire du parent
  quand c'est un bailleur de l'agence (lot), sinon l'auteur ; un `owner_id` différent du titulaire
  bailleur du parent → 422 ; refus pour une proposition et pour une agence `individual` ;
  journalisation `owner_designated` ; notification `property.assigned_to_owner` au bailleur.
- [x] `PropertyController::update` (`parent_id`) : 422 `property.parent_owner_mismatch` quand le
  parent a un bailleur pour titulaire et que le lot en a un autre (bailleur ou personnel) ;
  `user_id` jamais réécrit.
- [x] `PropertyDuplicationService` : la copie prend le titulaire de la source quand c'est un
  bailleur de l'agence de la source (notification comme à la saisie), sinon l'acteur.
- [x] `NotificationCode::PropertyAssignedToOwner`, ses textes `fr` et `en`, `wo` = texte français
  (wolof en pause), canaux comme `owner_statement.available`.
- [x] Tests : `PropertyOwnerDesignationTest` (AC1 à AC4, AC9, AC10), `PropertyDuplicationOwnerTest`
  (AC6), `PropertyChildOwnerTest` (AC7).

Lot B — le relevé suit le reversement (Q1) :

- [x] Un prédicat unique du bénéficiaire, appelé par `PayoutService::create`,
  `OwnerStatementPolicy::view` et `SendOwnerStatements`.
- [x] Test `OwnerStatementBeneficiaryTest` : pour un même bien, le bénéficiaire du reversement est
  le lecteur du relevé et le destinataire de l'avis (AC5, AC8).
- [x] P232.07 (porteur, 2026-10-25) : « dans le prédicat unique de bénéficiaire de TCK-997, la branche du personnel exige un profil actif ; la branche du bailleur garde l'appartenance ».
- [x] Le reste de P232.05 (porteur, 2026-10-25) : « `agenciesOwingPayout` aligné sur le prédicat de bénéficiaire de P232.07 (TCK-997) ». Dans `AccountDeletionService` ; `collectOpenObligations` n'est pas touchée ici (lot D1).
- [x] Contrainte de P15.06 (porteur, 2026-10-25) : « les biens déjà saisis ne changent pas de titulaire en silence au déploiement ». Aucune migration de données ne réécrit `user_id`.

Lot C — écrans :

- [x] Formulaire de bien : le choix du bailleur, dans les seules agences `standard` et pour le seul
  personnel tenant `properties.create`, avec `fields[owner_profiles]` restreint ; à la création
  d'un lot, le bailleur du parent est repris et non modifiable. *(Aucun écran ne crée de lot —
  `grep -rn parent_id takussan-web/src` → 0 : la reprise est tenue par l'API, AC7.)*
- [x] Formulaire de bail : la ligne « Bailleur » lit le titulaire du bien choisi.
- [x] Libellés `fr` et `en`, `wo` = texte français.
- [x] Tests Vitest du choix (envoi de `owner_id`, absent par défaut) et du libellé du bail.

## Critères d'acceptation

Chaque test est rouge sans son correctif (ablation consignée dans les notes).

- [x] AC1 — Agence `standard`, un agent, un bailleur B actif : l'agent crée un bien avec
  `owner_id` = B → 201, `properties.user_id` = B en base ; pour B, `GET /api/properties` le liste,
  `GET /api/properties/{id}` → 200, et B a une notification `property.assigned_to_owner` qui cite
  ce bien. *Un champ accepté puis ignoré échoue sur `user_id` ; une notification envoyée à l'auteur
  échoue sur le destinataire.*
- [x] AC2 — `owner_id` = un bailleur d'une autre agence, un profil `draft`, `inactive` ou
  `blocked`, ou un agent de l'agence → 422, aucun bien créé (compte inchangé), aucune notification.
- [x] AC3 — B, bailleur sans `properties.create`, propose un bien avec `owner_id` = un autre
  bailleur → 422 ; sans le champ, le bien proposé a B pour titulaire.
- [x] AC4 — L'agent crée un bail sur le bien de AC1 en envoyant `landlord_id` = lui-même → 201,
  `leases.landlord_id` = B ; pour B, `GET /api/leases` → `total = 1`. Le formulaire de bail affiche
  le nom de B (test front qui échoue sur le libellé « utilisateur courant »).
- [x] AC5 — Un loyer de ce bail est payé : `POST /api/payouts` vers B → 201 ; le relevé de B lu par
  l'admin → 200 et `gross` = ce loyer ; `payouts:send-owner-statements` pour la période → un avis à
  B. *Rejoue la mesure de P50.01, qui rendait 0 partout.*
- [x] AC6 — L'admin duplique le bien de B → la copie a `user_id` = B ; dupliquer un bien dont le
  titulaire est du personnel garde le comportement actuel (titulaire = l'acteur).
- [x] AC7 — L'agent crée un lot avec `parent_id` = le bien de B, sans `owner_id` → `user_id` = B,
  et B ouvre le lot (`GET /api/properties/{lot}` → 200) qu'il lit dans
  `GET /api/properties/{bien}/children`. Avec `owner_id` = un autre bailleur → 422. Rattacher par
  `PUT` au bien de B un lot d'un autre bailleur, ou un lot tenu par le personnel → 422, `parent_id`
  et `user_id` inchangés en base.
- [x] AC8 — L'agent crée un bien sans `owner_id` → `user_id` = l'agent (bien de l'agence) ; un loyer
  payé sur un bail de ce bien : le relevé de l'agent est lisible par l'admin (200, aujourd'hui 403)
  et `payouts:send-owner-statements` lui envoie l'avis ; un utilisateur qui n'est ni bailleur ni
  personnel de l'agence → relevé 403 et aucun avis.
- [x] AC9 — Agence `individual` : `owner_id` envoyé → 422 ; sans lui, titulaire = le créateur.
- [x] AC10 — La désignation laisse une ligne `activity_log` `Property` / `owner_designated` (auteur,
  bailleur) et aucune ligne `updated` qui changerait `user_id`.

## Hors périmètre

- Le geste « changer le titulaire » (TCK-999) et le transfert à l'acceptation d'une invitation,
  avec l'invitation depuis le formulaire (TCK-1000).
- Le rattachement d'un compte à la fiche du locataire (P15.01).
- Le bail d'un agent parti et la revue de la passation (TCK-616).
- Les collaborateurs `co_owner` d'un bien.

## Notes d'implémentation

Implémenté le 2026-10-25 par l'implémenteur (lot L12a), branche `feat/tck-997-bailleur-designe-a-la-saisie`
depuis `origin/pre-dev`. Commits : `8947b5597` (lot A), `4fef72314` (ADR-0036, amendement du
2026-10-25), `7c3af271e` (lot B), `8ab79c71b` (lot C).

**Où vit la règle.**

- `App\Services\Property\TitulaireALaSaisie` : le titulaire à la saisie, au lot et à la copie, et
  l'annonce (`owner_designated` + `property.assigned_to_owner`). `StorePropertyRequest` ouvre
  `parent_id` à la création : le parent doit exister, être de l'agence visée, laisser une
  profondeur ≤ `HierarchyService::MAX_DEPTH`, et l'auteur doit pouvoir le modifier — sinon **403**,
  y compris pour un parent absent (pas d'oracle d'existence).
- `App\Services\Payout\BeneficiaireDuReversement::est` : le prédicat unique (bailleur de tout
  statut, ou personnel actif par `isStaffAt`), lu par `PayoutService::create`,
  `PayoutPreparationService::prepare`, `OwnerStatementPolicy::isLandlordAt` (hors branche
  effacée de TCK-2015, inchangée), `SendOwnerStatements` et `AccountDeletionService::agenciesOwingPayout`.
  `collectOpenObligations` n'est pas touchée (lot D1).
- Aucune migration : aucun `user_id` existant n'est réécrit (contrainte de P15.06).

**Ablations** (chaque test rouge sans son correctif, puis rétabli vert) :

- Lot A — A1 `user_id` = l'auteur : AC1, AC4, AC10 et deux AC7 rouges ; A2 sans contrôle du
  bailleur actif : 7 cas d'AC2 ; A3 proposition / `individual` admises : AC3, AC9 ; A4 sans 422 au
  `PUT parent_id` : 2 ; A5 copie à l'acteur : AC6 ; A6 sans annonce : 4 ; A7 sans héritage du
  parent : 1 ; A8 sans contrôle parent ≠ `owner_id` à la création : 1 ; A9 `update` du parent non
  exigé : 1 ; A10 sans règle « même agence » : 1 ; A11 sans borne de profondeur : 1.
- Lot B — B1 relevé limité à `OwnerProfile` : AC8 ; B2 avis limité à `OwnerProfile` : AC8 ; B3
  reversement, personnel de tout statut : P232.07 ; B4 préparation, idem : P232.07 ; B5 effacement
  sans le prédicat : 2 ; B6 personnel de tout statut dans le prédicat : rouge ; B7 bailleur actif
  seulement : le test du bailleur bloqué rouge.
- Lot C — F1 `avecBailleur` qui ignore le choix : 2 rouges (unitaire et parcours) ; F2 l'assistant
  qui n'envoie pas le choix : 1 ; F3 invité sans compte proposé : 1 ; L1 la ligne du bail qui nomme
  l'utilisateur courant : 2 ; P1 page sans exiger `properties.update_any` : 1 ; P2 page sans
  exiger une agence `standard` : 2.

**Choix faits, à relire.**

- L'écran n'offre le choix du bailleur qu'au personnel qui tient `properties.create` **et**
  `properties.update_any` : le bien désigné n'est plus le sien, et les écritures qui suivent la
  création dans l'assistant (équipements, photos, contacts) exigent `update` sur lui — l'agent du
  rôle système, qui n'a pas `update_any`, verrait son parcours échouer après la création. L'API,
  elle, accepte `owner_id` de tout personnel tenant `properties.create`, comme le ticket l'écrit.
  Corollaire : un agent sans `update_any` qui désigne B par l'API perd l'édition du bien.
- Le choix liste **tous** les bailleurs actifs (toutes les pages), sans champ de recherche :
  `filter[search]` des profils propriétaires ne cherche que `employer` (TCK-601), il ne trouverait
  aucun nom. Un bailleur invité sans compte (`user_id` nul) n'est pas proposé (Q2, TCK-1000).
- Aucun écran ne crée de lot (`grep -rn parent_id takussan-web/src` → 0) : « le bailleur du parent
  repris et non modifiable » n'a pas d'écran ; l'API le tient (AC7).
- Créer un lot exige `update` sur le parent (`updateParent`, comme au `PUT`) : l'agent d'AC7 tient
  `properties.update_any`.
- Un compte qui est à la fois bailleur et personnel de l'agence n'est pas désignable (« jamais un
  agent de l'agence ») ; tout `owner_id` sur une proposition → 422, même le sien.
- Le lot et la copie annoncent la désignation (`via` = `parent` ou `duplicate`) comme la saisie.
- La garde `!proposition` de la page est redondante avec la capacité (une proposition ne tient pas
  `properties.create`) : elle évite une lecture, aucun test ne la distingue.

**Vérifications.** API : les quatre classes du ticket et 30 classes voisines (propriété, reversement,
relevé, effacement, notifications, contrat du front, baux) vertes ; Pint propre. Front : 66 fichiers
voisins verts (570 tests), `tsc --noEmit`, `npm run lint`, `check:i18n`, `check:i18n-namespaces`,
`check:classes-emises` propres. Gardes du dépôt vertes. La suite entière n'a pas été lancée
(consignes : c'est la session qui la lance).

- *Fait le 2026-10-25, à la fusion de pre-dev dans la branche.* À la fusion : retirer de `docs/models-spec.md` §3 la marque « à venir » de la désignation du bailleur à la saisie et du titulaire bailleur d'un lot (ligne `user_id`), et mettre à jour la phrase « Aujourd'hui » (passe `/sync-specs` 015, MD7).
