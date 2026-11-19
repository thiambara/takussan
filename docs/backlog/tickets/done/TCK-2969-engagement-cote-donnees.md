---
id: TCK-2969
title: "L'engagement côté données : la table, le type du registre et sa carte, noter, confirmer, annuler, et l'objet clos qui annule"
status: done
phase: P2
family: back
estimate: L
wave: 96
created: 2026-11-19
updated: 2026-11-19
depends_on: []
blocks: [TCK-2970, TCK-2971, TCK-2972, TCK-2975, TCK-2978, TCK-2987]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#32-task-
tags: [back, messagerie, le-fil, engagements, adr-0130, adr-0128]
---

## Objectif utilisateur

- **Le personnel de l'agence** note, depuis un message du fil, la promesse d'un participant (« je
  repasse jeudi à 10 h »). Elle devient un engagement que tous les lecteurs du fil voient vivre.
- **Le porteur** confirme l'engagement noté pour lui, avec la date notée ou une autre. Tout autre
  participant note sa propre promesse.
- **Tous** : quand l'intervention, le bail, la réservation ou le bien est clos, ses engagements en cours
  sont annulés, et le fil le dit.

## Contrat de données

Le contrat est [ADR-0130](../../../adr/0130-l-engagement-est-un-objet-du-fil.md), §§ 1, 2, 3 (pour noter
et confirmer) et 7.

- **Table `commitments`**, avec les colonnes de l'ADR § 1 :
  - `conversation_id` : FK, `cascadeOnDelete` ;
  - `source_message_id` : FK `messages`, `nullOnDelete` ;
  - `object_type` (chaîne, une clé de `SujetsDuFil`) et `object_id`, tous deux nullables ;
  - `agency_id` : FK ;
  - `holder_id` ;
  - `beneficiary_id` : nullable ;
  - `created_by_id` ;
  - `title` : 160 caractères au plus ;
  - `due_at` ;
  - `status` : enum `CommitmentStatus` ;
  - `confirmed_at`, `kept_at`, `kept_by_id`, `cancelled_at`, `cancelled_by_id` ;
  - `cancel_reason` : un code ;
  - `reopened_at`, `reopened_by_id`, `reopen_reason` (texte, 500 caractères au plus),
    `party_reopened_at` (le droit unique de réouverture, PARTAGÉ entre porteur et bénéficiaire, que le
    personnel ne consomme pas — décision du porteur du 2026-11-19), `overdue_at` ;
  - les marqueurs `due_soon_sent_at`, `overdue_signalled_at`, `relances` (entier, défaut 0) et
    `last_relance_at`, qu'écrit TCK-2970.

  Index `(conversation_id, status, due_at)`, `(holder_id, agency_id, due_at)` et
  `(object_type, object_id)`. `down()` supprime la table.
- **Registre** : `SujetsDuFil` gagne `commitment` (`modele` `Commitment`, `lecture` `view`, `sujet`
  faux, non posable). `ObjetsDesMessages` le résout. La projection est celle de l'ADR § 2 :
  - `id`, `title`, `status`, `etat`, `due_at` ;
  - `confirmed_at`, `kept_at`, `reopened_at`, `reopen_reason` ;
  - `holder.id`, `holder.name`, `beneficiary.id`, `beneficiary.name` ;
  - `object.type`, `object.id` ;
  - `abilities`.

  `etat` est l'état dérivé : `proposed`, `open`, `late`, `kept` ou `cancelled`.
- **Codes** : les neuf codes de l'ADR § 2 entrent **tous** dans `CodesDuFil` dans ce ticket, avec
  `attend` et `eteint` tels que la table de l'ADR les déclare. `CloturesDuFilArchitectureTest` les
  juge : `SANS_CLOTURE` reste vide. Seuls `noted`, `confirmed` et `cancelled` sont émis par ce
  ticket.
- **Routes** :
  - `POST /api/conversations/{conversation}/commitments` : corps `{source_message_id?, holder_id,
    beneficiary_id?, title, due_at}`, avec `due_at` en instant ISO strict (`InstantIso`, TCK-2967).
    `object_type` et `object_id` sont posés par le serveur depuis le fil (sujet, sinon
    `property_id`), jamais lus du corps. La route écrit la carte `commitment.noted` par
    `EvenementsDuFil::carte` (l'auteur est celui qui note) et rend 201 avec la projection ;
  - `GET /api/conversations/{conversation}/commitments` : les engagements du fil pour un lecteur du
    fil, triés « en retard, puis par échéance, puis clos ». Chaque ligne est la projection ;
  - `POST /api/commitments/{commitment}/confirm` : corps `{due_at?}`, réservé au porteur d'un
    engagement `proposed`. Une autre date remplace `due_at`. La route écrit `commitment.confirmed`
    seul : la nouvelle date se relit par la projection ;
  - `POST /api/commitments/{commitment}/cancel` : réservé à qui l'a noté ou au personnel. L'engagement
    est `proposed` ou `open`. La route écrit `commitment.cancelled` avec `reason` `by_author` ou
    `by_staff`.
- **Refus** (422 avec un code, sous `LangGroupParity`) :
  - `commitment.no_agency` : le fil n'a pas d'agence ;
  - `commitment.team_note_source` : le message source est une note d'équipe ;
  - `commitment.source_elsewhere` : le message source est d'un autre fil ;
  - `commitment.holder_not_participant` et `commitment.beneficiary_not_participant` ;
  - `commitment.not_yours` : un participant hors personnel note pour un autre que lui ;
  - `commitment.due_in_past` : l'échéance passée, à la création comme à la confirmation ;
  - `commitment.invalid_state` : le geste ne va pas avec l'état.

  Et en 403 : écrire dans un fil qu'on ne peut pas écrire (`ConversationAccess::allowsWriting`) ;
  le super-admin, pour tout geste ; l'impersonation, par le middleware.
- **Clôture de l'objet** (ADR § 7) : un observateur unique, branché par une boucle sur les quatre types
  rattachables (`maintenance_request`, `lease`, `booking`, `property`), à côté de
  `FermeLeFilDeSonObjet` dans `AppServiceProvider::bootObservers()`. Il agit sur `updated` (si
  `status` a changé et entre dans la liste du type) et sur `deleted`. Après le COMMIT, il passe en
  `cancelled` (`cancel_reason = object_closed`) les engagements `proposed` ou `open` de l'objet, et
  écrit `commitment.cancelled` (`reason: object_closed`) dans le fil de chacun. Un échec est
  rapporté, sans jamais remonter au geste de l'objet (patron de `FilDeLObjet::parler`).
- **Temps réel** : rien de neuf. Chaque écriture est un message du fil, et `message.created` rafraîchit
  les cartes (`useCartesEnDirect`).

## Contraintes strictes (métier)

- **Lecture** : `CommitmentPolicy::view` = `ConversationAccess::allows($user, $commitment->conversation)`.
  Aucune autre route ne rend un engagement dans ce ticket.
- **`data` ne porte que des codes et des dates** : ni titre, ni motif, ni nom.
  `CodesDuFilArchitectureTest` passe sur les codes neufs.
- **Un engagement est une table à lui** : aucune ligne de `tasks`, aucun lecteur de `tasks` ne le voit.
- **Le personnel** est le personnel actif de l'agence de l'engagement (`PersonnelDeLAgence::estPersonnel`
  sur `agency_id`) qui lit le fil.
- Une écriture de l'objet par requête ne déclenche pas la clôture. Le relevé de l'ADR (2026-11-19)
  n'en trouve aucune pour ces statuts ; un test par type passe par le chemin réel de clôture.

## Delta à produire

- [ ] Migration `create_commitments_table` (`up` et `down`).
- [ ] `App\Models\Commitment`, `App\Models\Enums\CommitmentStatus`, sa factory, `Auditable` (sans
  `title` ni `reopen_reason` au journal).
- [ ] `App\Policies\CommitmentPolicy` : `view`, et une méthode par geste (`confirm`, `cancel`).
- [ ] `App\Http\Resources\CommitmentResource::forViewer($lecteur)` : la ressource que résout
  `ObjetsDesMessages::resoudre` (un `match` sans défaut, l. 199-211 : le type sans branche lève), et
  que rendent les listes. `abilities` y est calculé par la policy pour le lecteur ; `etat` y est
  dérivé.
- [ ] `SujetsDuFil` (`commitment`), `ObjetsDesMessages` (résolution), `CodesDuFil` (les neuf codes).
- [ ] `CommitmentController` (`store`, `index` du fil, `confirm`, `cancel`), avec ses FormRequests
  (`StoreCommitmentRequest`, `ConfirmCommitmentRequest`). Les règles de `ProtectedActionsCoverageTest`
  et de `PlatformAnyRouteExempt` s'appliquent aux routes neuves.
- [ ] L'observateur de clôture et sa table « type → statuts clos » (une constante).
- [ ] `DateInventoryByValueTest` : les dates de la projection.
- [ ] Tests :
  - `NoterUnEngagementTest` : chaque refus de la liste ; le personnel note pour autrui (`proposed`) ;
    un participant note la sienne (`open`) ; objet posé depuis le sujet, puis depuis le bien ; carte
    écrite ;
  - `CycleDeLEngagementTest` (confirmer et annuler) : porteur seulement ; autre date ; `invalid_state` ;
    super-admin refusé ;
  - `LectureDesEngagementsTest` : la liste du fil et la carte pour un lecteur du fil, refusées à un
    non-lecteur. `RelectureDesObjetsTest` est étendu au type `commitment` (un non-lecteur reçoit
    `indisponible`) ;
  - `ClotureDesEngagementsTest` : un cas par ligne de la table (intervention `closed` puis `cancelled`,
    bail `expired`, réservation `cancelled`, bien `archived`, suppression), plus une réservation
    `completed` qui n'annule rien et un engagement `kept` qui reste `kept`.

## Critères d'acceptation

- [ ] **AC1** — Un engagement noté depuis une note d'équipe est refusé (422
  `commitment.team_note_source`). *Ablation : retirer la garde laisse naître un engagement que le
  locataire lit dans `GET …/commitments`, et le test rougit.*
- [ ] **AC2** — Un participant hors personnel ne peut noter que pour lui. *Ablation : retirer la
  garde → rouge.*
- [ ] **AC3** — La carte et chaque événement d'un engagement portent
  `metadata.object = {type: 'commitment', id}`, jamais le sujet du fil. Leur `data` ne contient ni
  le titre ni un nom (assertion sur le `metadata` brut).
- [ ] **AC4** — Chaque ligne de la table des clôtures a son test, et chacune rougit quand on retire sa
  ligne de la constante. La réservation `completed` n'annule rien.
- [ ] **AC5** — La projection rendue à un locataire lecteur du fil ne contient aucune clé de contact
  (`RelectureDesObjetsTest`, à toute profondeur). Un lecteur qui ne lit pas le fil reçoit
  `indisponible`.
- [ ] **AC6** — Aucune requête de `tasks` ne change. `php bin/impacted-tests.php --run` est vert sur
  les tests des services de tâches.
- [ ] Pint propre. `CloturesDuFilArchitectureTest`, `CodesDuFilArchitectureTest`, `LangGroupParityTest`,
  `FormRequestEtendBaseFormRequestTest` et les tests des fichiers touchés sont verts.

## Hors périmètre

- Reporter, déclarer tenu, rouvrir, relancer, et la commande planifiée : TCK-2970.
- La file « Retard », la pastille, la liste transverse et la fiabilité : TCK-2971.
- L'écran : TCK-2972 et TCK-2973.
- Un engagement proposé par le copilote (lot 4).
- Modifier le titre d'un engagement : TCK-2970 (`PUT`).

## Notes d'implémentation

Relevé et livré le 2026-11-19 sur `feat/le-fil-lots-3-5` (arbre partagé, lots 3 à 5 en parallèle).

**Prémisse re-mesurée** — conforme, à trois précisions près :

- **Personnel.** Le ticket et l'ADR § 3 nomment `PersonnelDeLAgence::estPersonnel` (le prédicat d'un TIERS,
  sur toutes ses agences), là où `ConversationPilotageController::assign` juge l'APPELANT par
  `personnelActifDe` (agence du profil actif). Suivi à la lettre : `CommitmentPolicy::estPersonnel` =
  `estPersonnel($user, agency_id)` ET `ConversationAccess::allows`. Pour « qui note pour autrui », l'agence
  jugée est celle du fil (`EquipeDuFil::agence`), égale à `agency_id` à la création. Une seule méthode à
  changer si le porteur veut `personnelActifDe`.
- **Données des codes.** L'ADR § 2 ne fixe `data` que pour `rescheduled` (`due_at`) et `cancelled`
  (`reason`) ; les sept autres codes naissent avec `data = []`. TCK-2970 ajoutera une clé s'il en a besoin.
- **Index d'agence.** `AgencyIdIsIndexedTest` exige un index dont `agency_id` est la PREMIÈRE colonne :
  aucun des trois index du ticket ne l'est, d'où un quatrième, `(agency_id, status)`.

**Décisions d'implémentation.**

- Super-admin : refusé par `StoreCommitmentRequest::authorize` et par `CommitmentPolicy` (méthodes de geste
  appelées DIRECTEMENT, jamais par `can()` que `Gate::before` ouvrirait). Il lit la liste comme il lit le fil.
- La politique juge QUI (403) ; l'état est jugé par la route (422 `commitment.invalid_state`), sous
  `lockForUpdate`. `abilities` = qui ET état.
- Ordre des refus de `store` : `no_agency`, `source_elsewhere` (avant `team_note_source`),
  `team_note_source`, `holder_not_participant`, `beneficiary_not_participant`, `not_yours`, `due_in_past`.
  Identifiants résolus par modèle, sans règle `exists:`.
- Observateur `AnnuleLesEngagementsDeSonObjet` : décide « statut entré dans la liste » dans `updated`
  (l'état sale est perdu après le COMMIT), annule après le COMMIT, chaque engagement dans sa transaction
  sous verrou, échec rapporté. Il écrit `commitment.cancelled` par `EvenementsDuFil::ecrire` sur le fil de
  l'ENGAGEMENT (`FilDeLObjet::filDe` ne connaît pas `Commitment`). Les statuts de bien (des cas d'enum
  dans `Property::HOST_CALENDAR_CLOSED_STATUSES`) sont posés en valeurs dans la constante.
- Routes dans un fichier à elles, `routes/api/commitments.php` ; `store`, `confirm`, `cancel` rangées
  `NON_GARDE` dans `PlatformAnyRouteExempt`.
- `CommitmentStatus` déclaré dans `SANS_LIBELLE` et `SANS_UNION` (l'écran lit `etat`, TCK-2972).

**Ablations** (retrait, rouge, restauration prouvée par md5) : garde `team_note_source` (AC1) ; garde
`not_yours` (AC2) ; chacune des quatre lignes de `CLOS` et la méthode `deleted` (AC4).

**Décision du porteur (2026-11-19), reportée ici.** Le porteur ET le bénéficiaire peuvent déclarer tenu,
et l'autre partie rouvre une fois : la colonne `beneficiary_reopened_at` de l'ADR § 3 devient
`party_reopened_at`, un droit unique partagé entre les deux parties, que le personnel ne consomme pas.
Renommée dans la migration et le modèle (`fillable`, `casts`, `AUDIT_ONLY`). La projection ne l'expose pas
(le ticket ne l'y met pas) ; c'est TCK-2970 qui la pose et la lit.

**Reste.** `scripts/check-models-spec.mjs` rougit : `Commitment` n'est pas dans `docs/models-spec.md`
(`/sync-specs`, hors de ce ticket). AC6 non mesuré par `impacted-tests` (règle de charge du lot) : aucun
fichier de `tasks` n'est touché (`git diff` vide sur `Task*`).
