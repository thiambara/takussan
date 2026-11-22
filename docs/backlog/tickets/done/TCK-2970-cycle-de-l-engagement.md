---
id: TCK-2970
title: "Le cycle de l'engagement : reporter, déclarer tenu, rouvrir une fois, relancer, et le retard qui devient un geste attendu du porteur"
status: done
phase: P2
family: back
estimate: L
wave: 96
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2969]
blocks: [TCK-2971, TCK-2972, TCK-2987]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#32-task-
tags: [back, messagerie, le-fil, engagements, adr-0130, planificateur]
---

## Objectif utilisateur

- **Le porteur** déclare sa promesse tenue, ou propose une autre date. Il est rappelé la veille ; en
  retard, il retrouve le fil dans « À vous » et reçoit au plus trois relances, dans le fil.
- **Celui à qui la promesse est faite** la déclare tenue lui aussi (« C'est fait »).
- **L'autre partie** (celle qui n'a pas déclaré) peut rouvrir une fois, avec un motif, un engagement
  déclaré tenu qui ne l'est pas.
- **Le personnel de l'agence** tranche toujours : il déclare tenu, rouvre, accorde une nouvelle date et
  relance à la main.

## Contrat de données

Le contrat est [ADR-0130](../../../adr/0130-l-engagement-est-un-objet-du-fil.md), §§ 3 et 4. Les neuf
premiers codes sont au catalogue depuis TCK-2969. Ce ticket ajoute les deux codes de la question
« Tenu ? » :
- `commitment.check_requested` : `attend`, il attend le bénéficiaire ;
- `commitment.not_kept_yet` : `eteint` `check_requested`.

Il ajoute aussi `check_requested` aux `eteint` de `rescheduled`, `kept` et `cancelled`.

- **Migration** `add_check_requested_at_to_commitments` : `check_requested_at` (timestamp nullable).
  `down()` retire la colonne.

- **Routes** :
  - `PUT /api/commitments/{commitment}` : corps `{title?, due_at?}`, réservé au porteur et au
    personnel, sur un engagement `open` (en retard compris). Un `due_at` neuf, futur
    (`commitment.due_in_past` sinon), écrit `commitment.rescheduled` avec `data.due_at`. Un titre seul
    n'écrit aucun événement ;
  - `POST /api/commitments/{commitment}/kept` : réservé au porteur, au bénéficiaire et au personnel
    (décision 2 « a + b »), sur un engagement `open`. Pose `kept_at` et `kept_by_id`, et pose `overdue_at = due_at` s'il est vide et que
    `kept_at > due_at`. Écrit `commitment.kept` ;
  - `POST /api/commitments/{commitment}/reopen` : corps `{reason}` (3 à 500 caractères), sur un
    engagement `kept`.
    - **L'autre partie** le peut une fois : le porteur ou le bénéficiaire, s'il n'est pas celui qui a
      déclaré tenu (`kept_by_id`). Le droit est **partagé** entre les deux parties : la garde lit
      `party_reopened_at` (vide, sinon 422 `commitment.already_reopened`). Ce champ est posé par la
      seule réouverture d'une partie.
    - Le personnel le peut toujours, sans poser `party_reopened_at`.
    - Celui qui a déclaré tenu ne rouvre pas sa propre déclaration (403).
    - Sans bénéficiaire, seul le personnel rouvre.
    - Tout autre appelant : 403.

    L'engagement repasse `open` (`kept_at` et `kept_by_id` nuls). Pose `reopened_at`, `reopened_by_id` et
    `reopen_reason`. Écrit `commitment.reopened` avec `action_for = [porteur]` ;
  - `POST /api/commitments/{commitment}/not-yet` : réservé au bénéficiaire d'un engagement `open` dont
    la question « Tenu ? » est posée (`check_requested_at` non nul). Écrit `commitment.not_kept_yet`,
    qui clôt la question et laisse l'engagement `open`. Sans question posée : 422
    `commitment.invalid_state` ;
  - `POST /api/commitments/{commitment}/remind` : réservé au personnel, sur un engagement `open` en
    retard. Écrit `commitment.reminded` (`action_for = [porteur]`) ; au plus une fois par 24 h (429
    `commitment.reminded_recently`, d'après `last_relance_at`). Ne change pas `relances`.
- **Commande `commitments:signal`**, planifiée toutes les 5 minutes (`withoutOverlapping`). Chaque
  passage prend la ligne sous verrou et vérifie son marqueur, sur le patron de
  `SendTaskDueReminders::notifyFor` :
  - **rappel** : un engagement `open` dont `due_at` tombe dans les 24 h à venir, noté plus de 24 h
    avant l'échéance, `due_soon_sent_at` vide → `commitment.due_soon` (`action_for = [porteur]`) ;
  - **retard** : `open`, `due_at < maintenant`, `overdue_signalled_at` vide → `commitment.overdue`
    (`action_for = [porteur]`). Pose `overdue_signalled_at`, et `overdue_at` s'il est vide ;
  - **relances** : `open`, en retard, `relances < 3`, et 3 jours écoulés depuis `last_relance_at` (ou,
    sans relance, depuis `overdue_signalled_at`) → `commitment.reminded`. Incrémente `relances` et
    pose `last_relance_at` ;
  - **« Tenu ? »** : un engagement `open` avec un bénéficiaire, dont l'échéance est passée d'une heure,
    et `check_requested_at` vide → `commitment.check_requested`, avec `action_for = [bénéficiaire]`.
    Pose `check_requested_at`. Sans bénéficiaire, rien.
- **Les marqueurs tombent quand `due_at` change** (`Commitment::booted`, patron de `Task::booted`) :
  `due_soon_sent_at`, `overdue_signalled_at`, `relances`, `last_relance_at` et `check_requested_at`. **`overdue_at` ne tombe
  jamais** : c'est l'historique que lit la fiabilité (TCK-2971).
- Les `abilities` de la projection (TCK-2969) gagnent `update`, `keep`, `reopen`, `not_yet` et `remind`, jugées par
  la policy pour le lecteur.
- Refus : 422 `commitment.invalid_state` pour un geste qui ne va pas avec l'état. Le super-admin est
  refusé (403) pour tout geste, et l'impersonation par le middleware.

## Contraintes strictes (métier)

- **Décision 2 « a + b » du porteur** (ADR-0130 § 3) :
  - le porteur, le bénéficiaire et le personnel déclarent tenu ;
  - l'autre partie rouvre **une fois**, avec motif, et ce droit est partagé entre porteur et
    bénéficiaire ;
  - le personnel tranche toujours ;
  - un engagement sans bénéficiaire ne se rouvre que par le personnel.
- **« En retard » n'est pas un statut stocké** : aucune colonne `status = late`. La commande n'écrit que
  des événements et des marqueurs.
- **Aucune notification poussée** : un rappel et une relance sont des événements du fil
  (`EvenementsDuFil::ecrire`, qui ne notifie pas).
- **Idempotence** : deux passages simultanés de la commande n'écrivent qu'un événement par marqueur.
- **Une clôture par objet** : un `commitment.kept` éteint les attentes de **son** engagement et de
  lui seul. Deux engagements en retard dans le même fil restent deux gestes distincts.
- Tests à **horloge figée** (`Carbon::setTestNow` / `travelTo`), jamais d'attente réelle.

## Delta à produire

- [ ] La migration `add_check_requested_at_to_commitments`, et les deux codes de « Tenu ? » dans
  `CodesDuFil`.
- [ ] `CommitmentController` : `update`, `kept`, `reopen`, `notYet`, `remind`, et leurs FormRequests
  (`UpdateCommitmentRequest`, `ReopenCommitmentRequest`) ; `CommitmentPolicy` : `update`, `keep`,
  `reopen`, `notYet`, `remind`.
- [ ] `Commitment::booted` : la chute des marqueurs.
- [ ] Commande `commitments:signal` (`App\Console\Commands\SignalCommitments` ou un job appelé par la
  commande, au choix), planifiée dans `routes/console.php`.
- [ ] Codes d'erreur sous `LangGroupParity` ; `PlatformAnyRouteExempt` et `ProtectedActionsCoverageTest`
  pour les routes neuves.
- [ ] Tests :
  - `DeclarerTenuTest` : le porteur, le bénéficiaire et le personnel le peuvent ; un autre participant
    est refusé ; `overdue_at` est posé quand l'engagement est tenu après l'échéance ;
  - `RouvrirUnEngagementTest` :
    - tenu par le porteur, rouvert une fois par le bénéficiaire, puis 422 ;
    - tenu par le bénéficiaire, rouvert par le porteur ;
    - après une réouverture par une partie, l'autre est refusée (le droit est partagé) ;
    - le déclarant ne rouvre pas sa propre déclaration ;
    - le personnel rouvre deux fois ;
    - le personnel rouvre, puis une partie rouvre encore une fois ;
    - motif exigé ;
    - sans bénéficiaire, seul le personnel ;
  - `ReporterUnEngagementTest` : `rescheduled` et chute des marqueurs ; `overdue_at` conservé ;
  - `SignalDesEngagementsTest`, horloge figée :
    - rappel à 24 h, et pas de rappel pour un engagement noté moins de 24 h avant l'échéance ;
    - retard une fois ;
    - relances à J+3, J+6 et J+9, puis plus rien ;
    - deux passages successifs : un seul événement ;
    - un engagement reporté après son retard est signalé de nouveau à sa nouvelle échéance ;
  - `QuestionTenuTest`, horloge figée :
    - à l'échéance + 1 h, la question attend le bénéficiaire seul : le fil est non lu pour lui, et
      `vous` sauf s'il est déjà `retard` (TCK-2971) ;
    - « Oui, c'est fait » (`kept`) clôt la question ;
    - « Pas encore » la clôt et laisse l'engagement `open` ;
    - aucune question sans bénéficiaire ;
    - une question par échéance, et une nouvelle après un report ;
  - `GesteAttenduDuPorteurTest` :
    - après `overdue`, le fil est non lu et `vous` pour le porteur seul (`FileDuFil`), et
      `meta.gestes` le compte ;
    - `kept` le libère ;
    - deux engagements en retard du même fil : tenir l'un laisse l'autre attendu ;
    - `reopened` le remet en attente.

## Critères d'acceptation

- [ ] **AC1** — L'autre partie rouvre une fois, et toute réouverture suivante par une partie est
  refusée en 422 `commitment.already_reopened`. Une réouverture du personnel ne consomme pas ce
  droit. *Ablations : retirer la garde → rouge ; garder sur `reopened_at` au lieu de
  `party_reopened_at` → rouge ; un droit par partie au lieu d'un droit partagé → rouge.*
- [ ] **AC2** — Le bénéficiaire déclare tenu, et un participant hors des deux parties et hors
  personnel ne le peut pas. Ni lui ni le déclarant ne rouvrent. *Ablations : retirer le bénéficiaire
  de `keep` → rouge ; accorder `reopen` à tout participant → rouge ; laisser le déclarant rouvrir →
  rouge.*
- [ ] **AC3** — `commitment.overdue` attend le porteur seul : le bénéficiaire et le personnel n'ont pas
  ce fil en `vous` à cause de lui. *Ablation : `action_for` de tous les participants → rouge.*
- [ ] **AC4** — Tenir l'un de deux engagements en retard du même fil laisse l'autre attendu. *Ablation :
  un `metadata.object` posé sur le sujet du fil → rouge.*
- [ ] **AC5** — Trois relances au plus, espacées de 3 jours, et aucune en double sur deux passages.
  *Ablation : retirer la borne de `relances`, puis le verrou → rouge.*
- [ ] **AC6** — Reporter fait tomber les marqueurs, jamais `overdue_at`. *Ablation : `overdue_at`
  remis à nul au report → rouge.*
- [ ] **AC7** — « Tenu ? » attend le bénéficiaire seul, une heure après l'échéance, une fois par
  échéance. « Pas encore » et « tenu » le clôturent. *Ablations : `action_for` du porteur au lieu du
  bénéficiaire → rouge ; retirer `check_requested` des `eteint` de `kept` → rouge ; sans marqueur →
  deux questions, rouge.*
- [ ] Pint propre ; tests des fichiers touchés verts ; `CloturesDuFilArchitectureTest` vert.

## Hors périmètre

- La file « Retard » des autres lecteurs, la pastille qui en compte une part, la liste transverse et
  la fiabilité : TCK-2971.
- Les rappels réglables (« la veille 18:00 », « 1 h avant ») et l'interrupteur des relances par fil
  (ADR-0130, « ce que ça ne règle pas »).
- Le relais WhatsApp ou SMS d'un rappel (lot 5).
- Un délai pour rouvrir.

## Notes d'implémentation

Relevé et livré le 2026-11-19 sur `feat/le-fil-lots-3-5` (arbre partagé, lots 3 à 5 en parallèle), sur le
socle de TCK-2969 (colonne `party_reopened_at`).

**Prémisse re-mesurée** — conforme ; précisions et écarts :

- **« Pas encore » n'a pas d'état répondu au ticket.** `check_requested_at` doit rester posé après la réponse
  (sinon la commande repose la question cinq minutes plus tard), si bien qu'il ne dit pas « question
  ouverte ». Sans colonne neuve : `Commitment::questionTenuOuverte()` lit la dernière trace de la question au
  fil parmi `check_requested` et les codes qui l'éteignent (dérivés de `CodesDuFil::clotures()` :
  `not_kept_yet`, `kept`, `rescheduled`, `cancelled`), une requête. Un second « Pas encore » rend 422
  `commitment.invalid_state`, de même qu'un « Pas encore » après « tenu » puis réouverture : la question n'est
  pas reposée après une réouverture (une par échéance). `abilities.not_yet` suit la même règle (requête faite
  pour le seul bénéficiaire).
- **Personnel qui est aussi partie ou déclarant** (l'agent porteur, le cas courant) : le personnel passe
  d'abord. Il rouvre toujours, même sa propre déclaration, et ne consomme jamais `party_reopened_at`
  (ADR § 3 : « le personnel le fait pour lui si c'était une erreur »). Épinglé par
  `test_un_agent_porteur_rouvre_comme_personnel` et `test_le_personnel_rouvre_sa_propre_declaration`.
- **`reopen` rejuge QUI sur la ligne verrouillée** (`kept_by_id` a pu changer depuis la FormRequest), puis
  l'état (422 `invalid_state`), puis le droit des parties (422 `already_reopened`).
- **Report après l'échéance, avant le passage de la commande** : `update` pose `overdue_at = due_at` s'il est
  vide, comme `kept` ; sinon un porteur effacerait son retard dans la fenêtre de 5 minutes (ADR § 3).
- **Relance manuelle** : elle POSE `last_relance_at` (le 429 n'a rien d'autre à lire) sans toucher `relances` ;
  elle repousse donc la relance automatique suivante de trois jours.
- **« Noté plus de 24 h avant l'échéance »** lu sur `created_at`, à la lettre : un report vers une date proche
  déclenche `due_soon` au passage suivant (les marqueurs sont tombés).
- **Catalogue** : `check_requested` ajouté à `ENGAGEMENT_ATTENDU`, la liste des `eteint` de `rescheduled`,
  `kept` et `cancelled` — exactement les trois du ticket (elle ne sert qu'à eux).
- **Le personnel d'un engagement, aligné sur l'agence du fil sous le profil ACTIF** (demande de la session,
  2026-11-19 ; écart laissé ouvert par TCK-2969). `CommitmentPolicy::estPersonnel` jugeait par
  `PersonnelDeLAgence::estPersonnel` (un TIERS, sur toutes ses agences) : un agent d'une autre agence, participant
  au fil et personnel de l'agence du fil par un AUTRE profil, y tranchait sous son profil d'ailleurs. Il juge
  désormais `personnelActifDe(EquipeDuFil::agence($fil))` et `ConversationAccess::allows`, comme la note d'équipe
  et « Confier » (l'agence du fil, une requête par instance de fil, mémorisée en `WeakMap`). Même correction pour
  `not_yours` de `store`. `PersonnelDUneAutreAgenceTest` (4) : sous son profil d'ailleurs, il ne déclare pas tenu,
  ne reporte, n'annule, ne relance ni ne rouvre (403), ne note pas pour autrui (422) ; un bailleur agent ailleurs
  non plus ; contrôle : sous son profil de l'agence du fil, il tranche. Ablations (retour à `estPersonnel` dans
  la politique, puis dans `store`) : rouges.

**Décisions d'implémentation.**

- Cinq FormRequests (`Update`, `Keep`, `Reopen`, `NotYet`, `Remind`) : la politique appelée directement dans
  `authorize()`, comme `Confirm` et `Cancel`.
- La commande est mince (`SignalCommitments`) ; la règle vit dans `App\Services\Messaging\SignalDesEngagements`
  : `candidats()` (SQL) et `doitSignaler()` (la même règle en PHP, rejugée sur la ligne verrouillée).
  `signaler()` prend une instance éventuellement périmée : c'est l'entrée du test d'idempotence.
  Une ligne en échec est rapportée (`report`) et n'arrête pas le passage.
- Planifiée `everyFiveMinutes()->withoutOverlapping(5)`, comme `SendPropertyVisitReminders`.


**Tests** (tous verts, 2026-11-19) : `DeclarerTenuTest` (8), `RouvrirUnEngagementTest` (12), `ReporterUnEngagementTest`
(8), `SignalDesEngagementsTest` (8, dont la planification `*/5` sans chevauchement), `QuestionTenuTest` (8),
`GesteAttenduDuPorteurTest` (5, dont la relance manuelle et son 429). `LectureDesEngagementsTest` (TCK-2969)
mis à jour : la forme exacte de `abilities` gagne les cinq gestes. Gardes vertes : `CloturesDuFil`, `CodesDuFil`,
`LangGroupParity`, `ProtectedActionsCoverage`, `RessourceUniqueResolue`, `ExistsSurTableASuppressionDouce`,
`AgencyIdIsIndexed`, `FormRequestEtendBaseFormRequest`, `DateInventoryByValue`, `ImpersonationReadSweep`,
`ValeursEnListeParcoursDesRoutes`.

**Ablations** (retrait, rouge, restauration par `cp` prouvée par md5) — toutes rouges :
AC1 garde `already_reopened` retirée ; garde sur `reopened_at` au lieu de `party_reopened_at` ; un droit par
partie (refus seulement si le même rouvre) · AC2 bénéficiaire retiré de `keep` ; `reopen` à tout participant ;
déclarant autorisé · AC3 `action_for` = tous les participants · AC4 événements posés sur un objet commun du fil
(le premier engagement) · AC5 borne de `relances` retirée ; ligne non relue sous verrou (le test tenait d'abord
la même instance, que l'ablation laissait verte : il prend désormais deux instances distinctes) · AC6
`overdue_at` parmi les marqueurs qui tombent · AC7 `action_for` du porteur au lieu du bénéficiaire ;
`check_requested` retiré des `eteint` de `kept` ; marqueur `check_requested_at` ignoré ; clôture de la question
lue sur `check_requested`/`not_kept_yet` seuls (tenu puis rouvert).

**Reste.** `check-models-spec` rougit (`Commitment` absent de `docs/models-spec.md`, hérité de TCK-2969,
`/sync-specs`) ; `check-front-routes` rougit sur deux appels du copilote (`copilote.ts`, un autre ticket).
Le front (cartes, boutons « C'est fait », « Pas encore », « Rouvrir ») est à TCK-2972.
