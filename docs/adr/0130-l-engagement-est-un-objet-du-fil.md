# ADR-0130 — L'engagement est un objet du fil : une table à lui, un type du registre, un retard qui devient un geste attendu

- **Statut** : Accepté le 2026-11-19. Décisions du porteur du même jour :
  - la table `commitments`, et non `tasks` (§ 1). C'est un écart au plan, qui disait « s'adosse à
    `Task` » ;
  - 1a : la fiabilité se lit par le seul personnel, en compte ;
  - 2 « a + b » : le porteur **et** le bénéficiaire déclarent l'engagement tenu, l'autre partie rouvre
    une fois avec un motif, et le personnel tranche toujours ;
  - 3a : un objet clos annule ses engagements.

  Modalités : décisions de la session, à revoir. Ce sont :
  - qui peut noter (§ 2) ;
  - le report par le porteur sans l'accord de l'autre partie (§ 3) ;
  - la cadence : rappel à 24 h, retard signalé toutes les 5 minutes, 3 relances à 3 jours (§ 4) ;
  - la préséance `retard` > `vous`, et « Traité » sans effet sur `retard` (§ 5).
- **Date** : 2026-11-19
- **Tickets** : lot 3 du [plan « Le Fil »](../plans/2026-11-17-le-fil.md), TCK-2969 à TCK-2973 et TCK-2987 (vague 96)
- **Va avec** : [ADR-0128](0128-le-fil-est-l-interface-des-objets.md) (le fil est l'interface des objets, § 7 la boîte), [ADR-0129](0129-le-socle-temps-reel-signale-et-l-api-sert.md) (le socle temps réel)
- **S'appuie sur** : [ADR-0068](0068-le-fil-d-un-prospect-suit-le-contact-principal-du-bien.md) (le fil d'un prospect), [ADR-0031](0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md) (personnel de l'agence)

## Contexte

Le plan veut qu'une promesse faite dans un fil (« je repasse jeudi à 10 h », « je paie le 12 ») devienne
un objet suivi : un porteur, une échéance, un objet rattaché, un état et des relances. Il voulait aussi
qu'elle « s'adosse à `Task`, déjà rattachable à n'importe quel objet ».

Relevé sur `feat/le-fil-lots-3-5` (`cc4c6bcae`) le 2026-11-19. **`Task` ne porte pas un engagement tel
quel** :

- **Le rattachement.** Le schéma l'accepte (`nullableMorphs('taskable')`,
  `2026_04_17_160029_create_tasks_table.php`). La route, elle, ne rattache qu'à un bien ou à un client
  (`StoreTaskRequest::TASKABLE_TYPES`, l. 42-45). Les remboursements y ajoutent une réservation par
  service (`Task::scopeParentInAgency`). `taskable_type` stocke une **classe**, alors qu'ADR-0128 § 1
  exige une **clé du registre** fermé (`SujetsDuFil`) : ni bail, ni intervention.
- **Le porteur.** Une tâche est assignée à l'appelant ou au personnel de l'agence du parent
  (`TaskController::authorizeAssignee`, « `task.assignee_not_staff` »). Le porteur d'un engagement est
  souvent un locataire, un prestataire ou un bailleur.
- **La lecture.** `TaskPolicy::view` (l. 34-58) n'ouvre une tâche qu'à son créateur, à son assigné
  personnel, au suppléant ou au lecteur d'équipe. Un engagement doit se lire de tout lecteur du fil.
- **Le retard.** `Task::scopeOverdue` juge au jour, dans le fuseau de Dakar (« une tâche due ce matin
  est du jour »), et se dit la seule définition du mot. Une promesse pour « jeudi 10 h » est en retard
  à 10 h 01.
- **Les lecteurs.** Environ quatorze endroits de `app/` lisent `tasks` sans distinguer de genre :
  - le tableau de bord de l'agent (`DashboardAgentService`, l. 156-221) ;
  - la performance d'équipe (`TeamPerformanceService:113`) ;
  - le calendrier (`CalendarEventCollector:376`) ;
  - la chronologie et le journal d'une fiche client (`CustomerTimeline:299,350`,
    `CustomerActivityFeed:72`) ;
  - la prochaine action et la relance d'une fiche (`CustomerNextActionQuery:70`,
    `CustomerFollowUpQuery:128`) ;
  - la passation et le portefeuille d'un agent (`AgentHandoverService:310`, `AgentPortfolio:83`,
    `ErasedMemberPortfolio:99`) ;
  - le calcul d'un reversement (`PayoutCalculator:233`) ;
  - le rappel de 24 h (`SendTaskDueReminders:55`) ;
  - le remboursement d'une réservation (`BookingRefundTaskService:121`).

  Dans la même table, la promesse d'un locataire entrerait dans la journée de l'agent, dans ses
  statistiques et dans son agenda, sauf exclusion écrite à chacun de ces endroits.

**Ce que le fil sait déjà faire** (lots 1 et 2) :

- un événement attend un geste par son `action_for` (`EvenementsDuFil::ecrire`) ;
- un code déclaré `attend` doit avoir une clôture déclarée (`eteint` dans `CodesDuFil`,
  `CloturesDuFilArchitectureTest`) ;
- la règle du dépassement se juge **par objet** (`NonLus::gesteAttenduDe`, égalité de
  `metadata->'object'`) ;
- la file d'un fil se dérive en SQL pour chaque lecteur (`FileDuFil`, `CASE` l. 268-271), et la
  pastille compte les gestes attendus (`meta.gestes`, l. 182-185).

## Décision

**Un engagement est un objet à lui, `Commitment`, inscrit au registre du fil sous le type `commitment`.
Il naît dans un fil, s'y montre en carte relue pour chaque lecteur, y parle par des événements codés,
et chaque geste passe par sa route à lui. Son retard devient un geste attendu de son porteur, et une
file « Retard » pour ceux à qui il est dû.**

### 1. Une table à lui, qui reprend de `Task` ce qui a fait ses preuves

- Table `commitments`. **Décision du porteur du 2026-11-19**, sur le relevé du contexte : elle n'utilise
  pas la table `tasks` (voir « Options écartées »). **Écart au plan**, qui disait que l'engagement
  « s'adosse à `Task`, déjà rattachable à n'importe quel objet » : il reprend de `Task` du code et des
  patrons, pas sa table.
- Ce qu'elle reprend de `Task` :
  - le fuseau des échéances (`Task::DUE_TIMEZONE`, pour composer une échéance donnée en date seule) ;
  - le marqueur d'un rappel posé sous verrou de ligne, qui tombe quand l'échéance change
    (`SendTaskDueReminders`, `Task::booted`) ;
  - le journal d'activité (`Auditable`).
- **Colonnes** :
  - `conversation_id` (exigé) : le fil où l'engagement est né. Un engagement n'existe pas hors d'un fil ;
  - `source_message_id` (facultatif) : le message d'où il a été noté ;
  - `object_type` et `object_id` (facultatifs) : une clé du registre `SujetsDuFil`. Par défaut, le
    sujet du fil, sinon son bien (`conversations.property_id`) ;
  - `agency_id` (exigé) : l'agence du fil à la création (`EquipeDuFil::agence`). Un fil sans agence
    n'accepte pas d'engagement (422 `commitment.no_agency`) ;
  - `holder_id`, le **porteur** : un participant actif du fil ;
  - `beneficiary_id`, **envers qui** : un participant actif, ou nul. Nul, l'engagement est pris envers
    l'agence ;
  - `created_by_id` ;
  - `title` : une phrase courte, en texte libre ;
  - `due_at` : un **instant**. Une échéance en date seule vaut la fin de ce jour à Dakar, et le front la
    compose ;
  - `status` : `proposed` (à confirmer), `open`, `kept` ou `cancelled` ;
  - les instants du cycle de vie (dont `party_reopened_at`, § 3) et les marqueurs du § 4.
- **« En retard » n'est pas un statut** : c'est `status = open` et `due_at < maintenant`, jugé à
  l'instant. Une seule définition, que lisent la carte, la boîte, la liste et la fiabilité.

### 2. Un type du registre, une carte relue, des codes déclarés

- `SujetsDuFil` gagne `commitment` :
  - il n'est ni sujet ni posable ;
  - il se lit comme son fil : `CommitmentPolicy::view` vaut `ConversationAccess::allows` sur
    `conversation_id` ;
  - sa projection porte l'identifiant, le titre, l'état dérivé, `due_at`, le porteur et le bénéficiaire
    (`id` et nom, sans contact), l'objet rattaché (type et identifiant), et les `abilities` du lecteur.
- **L'objet d'un message d'engagement est l'engagement**, jamais le sujet du fil
  (`metadata.object = {type: 'commitment', id}`). `NonLus` et les clôtures se jugent par objet : deux
  engagements d'un même fil ne se périment jamais l'un l'autre.
- `CodesDuFil` déclare :

  | Code | Nature | `attend` (le porteur, sauf mention) | `eteint` |
  |---|---|---|---|
  | `commitment.noted` | carte, posée par qui l'a noté | — | — |
  | `commitment.confirmed` | événement | — | — |
  | `commitment.due_soon` | événement, le rappel avant l'échéance | oui | — |
  | `commitment.overdue` | événement | oui | `due_soon` |
  | `commitment.reminded` | événement, la relance | oui | `due_soon` |
  | `commitment.rescheduled` | événement | — | `due_soon`, `overdue`, `reminded`, `reopened` |
  | `commitment.kept` | événement | — | `due_soon`, `overdue`, `reminded`, `reopened` |
  | `commitment.reopened` | événement | oui | `due_soon` |
  | `commitment.cancelled` | événement | — | `due_soon`, `overdue`, `reminded`, `reopened` |
  | `commitment.check_requested` | événement, « Tenu ? » au bénéficiaire (§ 3) | oui (le **bénéficiaire**) | — |
  | `commitment.not_kept_yet` | événement, le bénéficiaire répond « Pas encore » | — | `check_requested` |

  Les neuf premiers codes entrent au catalogue avec TCK-2969. Les deux derniers arrivent avec TCK-2970,
  qui ajoute aussi `check_requested` aux codes que clôturent `rescheduled`, `kept` et `cancelled`.

  - `data` ne porte que des codes et des dates : `due_at` pour `rescheduled`, et pour `cancelled` un
    `reason` qui vaut `by_author`, `by_staff` ou `object_closed`.
  - **Le titre et le motif d'une réouverture ne sont jamais dans `data`** : ce sont des textes libres,
    gardés sur l'objet et relus par la projection.
- **Un geste passe par la route de l'engagement** (`/api/commitments/{id}/…`), jamais par une route de
  la messagerie (ADR-0128 § 4). Chaque geste écrit son événement, et le signal `message.created`
  rafraîchit la carte chez les autres lecteurs (`useCartesEnDirect`).
- **Noter** : on ne note un engagement que depuis un message `visibility = all`. Depuis une note
  d'équipe, c'est 422 `commitment.team_note_source`.
  - Le personnel actif de l'agence du fil note pour tout participant actif. L'engagement naît
    `proposed`, sauf si le porteur est l'auteur.
  - Un autre participant ne note que sa propre promesse, qui naît `open`.
  - Le porteur d'un engagement `proposed` le confirme, avec l'échéance notée ou une autre.

### 3. Qui déclare l'engagement tenu (décision 2 du porteur)

Décision 2 « a + b » du porteur :

- **Le porteur et le bénéficiaire** déclarent tous deux l'engagement tenu (`open`, en retard compris).
  `kept_by_id` garde qui l'a déclaré.
- **L'autre partie** peut le **rouvrir une fois**, avec un motif (3 à 500 caractères). C'est celle des
  deux, porteur ou bénéficiaire, qui ne l'a pas déclaré tenu. Si le personnel l'a déclaré tenu, c'est
  l'une ou l'autre.
  - Ce droit unique est **partagé entre les deux parties**. La garde lit `party_reopened_at`, que pose
    la seule réouverture d'une partie. Une seconde est refusée en 422 `commitment.already_reopened`.
  - Celui qui a déclaré tenu ne rouvre pas sa propre déclaration (403). Le personnel le fait pour lui
    si c'était une erreur.
  - Une réouverture du personnel ne consomme pas le droit des parties.
  - Rouvert, l'engagement repasse `open`, et `commitment.reopened` attend de nouveau le porteur.
  - Un engagement pris envers l'agence (sans bénéficiaire) est déclaré tenu par le porteur. Seul le
    personnel le rouvre.
- **Le personnel tranche toujours** : il déclare tenu, rouvre sans limite, annule ou accorde une
  nouvelle date. Le porteur peut aussi reporter son échéance, sans l'accord de l'autre partie :
  l'événement `commitment.rescheduled` le dit à tous, et un report après l'échéance laisse le retard
  dans l'historique (`overdue_at`, § 4). Le personnel, c'est le personnel actif de l'agence de l'engagement **qui lit le fil**
  (`PersonnelDeLAgence::estPersonnel` sur `agency_id`, et `ConversationAccess::allows`).
- **Le super-admin** lit l'engagement comme il lit le fil, mais n'y fait aucun geste (403). Sous
  impersonation, tout geste est refusé par `EnforceImpersonationReadOnly`.
- **La question « Tenu ? » est retenue** (maquette `fil-engagements` A, écran « À l'échéance »). Une
  heure après l'échéance d'un engagement `open` qui a un bénéficiaire, la commande du § 4 écrit
  `commitment.check_requested`, avec `action_for = [bénéficiaire]`. Le bénéficiaire répond depuis sa
  carte :
  - « Oui, c'est fait » : il déclare l'engagement tenu (`commitment.kept`) ;
  - « Pas encore » : `commitment.not_kept_yet`, qui clôt la question et laisse l'engagement `open`.

  Le bénéficiaire peut aussi déclarer « C'est fait » avant qu'on le lui demande. Un engagement pris
  envers l'agence (sans bénéficiaire) ne pose pas la question : le personnel le suit dans « Retard ».

### 4. Le retard : un événement pour le porteur, une dérivation pour les autres

- **Le porteur** : une commande planifiée, `commitments:signal` toutes les 5 minutes
  (`withoutOverlapping`), écrit sous verrou de ligne :
  - **un rappel**, `commitment.due_soon`, 24 h avant l'échéance, si l'engagement a été noté plus de
    24 h avant elle (marqueur `due_soon_sent_at`) ;
  - **le retard**, `commitment.overdue`, au premier passage après l'échéance. Marqueur
    `overdue_signalled_at` ; la commande pose aussi `overdue_at`, l'historique, si le champ est vide ;
  - **les relances**, `commitment.reminded` : tous les 3 jours après le retard, 3 au plus (`relances`
    et `last_relance_at`) ;
  - **la question « Tenu ? »** au bénéficiaire, `commitment.check_requested`, une heure après
    l'échéance (marqueur `check_requested_at`, § 3).

  Ces marqueurs tombent quand `due_at` change, comme celui d'une tâche. `overdue_at` ne tombe
  jamais.
- Le rappel, le retard et les relances portent `action_for = [porteur]` : le fil passe « À vous » pour lui, compte en
  non-lu, et entre dans `meta.gestes`. **Il n'y a aucune notification poussée** : le rappel est un
  message du fil.
- Le personnel peut aussi relancer à la main (`commitment.reminded`), une fois par 24 h au plus
  (429 `commitment.reminded_recently`). Une relance manuelle ne compte pas parmi les trois
  automatiques.
- **Les autres lecteurs** voient le retard **dérivé à la lecture**, sans attendre la commande.
- **Écart assumé** : le porteur passe « À vous » au plus 5 minutes après que le bénéficiaire a vu le
  retard. Un engagement déclaré tenu après l'échéance pose `overdue_at` s'il est vide : le retard
  compte, même si la commande n'est pas encore passée.

### 5. La file « Retard » de la boîte et la pastille (ADR-0128 § 7)

- `FileDuFil` gagne la file `retard`, toujours **en SQL**, en un nombre de requêtes constant. Un fil est
  `retard` pour le lecteur L, hors `rappel`, s'il porte un engagement en retard :
  - dont le porteur n'est pas du côté de L. Le côté se juge comme dans TCK-2967 : le personnel actif de
    l'agence forme l'équipe, tout autre lecteur est seul de son côté ;
  - et que L suit : L est son bénéficiaire, ou L est du personnel de l'agence du fil.
- **Ordre de préséance** : `rappel` > `retard` > `vous` > `attente` > `ajour`. Les files restent
  exclusives.
- **« Traité » ne sort pas un fil de `retard`** (`handled_at` ne s'y applique pas) : une promesse non
  tenue reste à suivre jusqu'à ce qu'elle soit tenue, annulée ou reportée. « Rappelez-le-moi » l'en
  sort jusqu'à l'échéance du rappel.
- Pour le porteur, son propre retard passe par l'événement du § 4. Le fil est alors `vous`.
- **Pastille** : `meta.gestes` compte les fils `vous` **ou** `retard`, hors sourdine. Chaque fil compte
  une fois, puisque les files sont exclusives. `meta.counts.retard` donne le compte de la puce.

### 6. La fiabilité d'une personne (décision 1 du porteur)

- Elle se lit en **deux entiers sur 90 jours** :
  - `kept` : les engagements `kept` sans `overdue_at` ;
  - `late` : ceux qui ont un `overdue_at`, ou qui sont `open` et échus.

  Les engagements comptés sont ceux de cette personne comme porteur, dans l'agence de l'appelant, dont
  l'échéance tombe dans les 90 derniers jours. Un engagement `proposed`, qui n'a jamais été confirmé,
  ou `cancelled` ne compte pas.
- **Jamais un score**, ni un pourcentage, ni une note, ni une liste des engagements de la personne.
- **Seul le personnel actif de l'agence** la lit, sous son profil actif. Pour tout autre lecteur, la
  clé est **absente** : la personne elle-même, un client, un bailleur, un prestataire. C'est un écart
  avec la maquette, qui la montrait à la personne « sur son propre profil » et au locataire « Moussa
  Fall ».

### 7. Un objet clos annule ses engagements (décision 3 du porteur)

Quand l'objet rattaché est clos, ses engagements `proposed` ou `open` passent `cancelled`, avec le motif
`object_closed`. Un événement `commitment.cancelled` s'écrit dans leur fil, après le COMMIT. Un objet
rouvert ou restauré ne rouvre rien.

| Type | « Clos » | Où ça se déclenche |
|---|---|---|
| `maintenance_request` | `MaintenanceStateMachine::TERMINAL` (`closed`, `cancelled`) | `updated` du modèle, si `status` a changé |
| `lease` | `SallesDuFil::BAUX_EN_LECTURE_SEULE` (`expired`, `terminated`, `renewed`) | `updated` du modèle (`ExpireEndedLeasesJob`, `EarlyTerminationService`, `LeaseService` passent par `save`) |
| `booking` | `SallesDuFil::RESERVATIONS_EN_LECTURE_SEULE` (`rejected`, `cancelled`, `expired`) ; `completed` reste ouvert, comme sa salle | `updated` du modèle |
| `property` | `Property::HOST_CALENDAR_CLOSED_STATUSES` (`archived`, `sold`) | `updated` du modèle |
| tout type | supprimé (en douceur ou non) | `deleted` du modèle |

- Un seul observateur, branché sur chaque type rattachable par une boucle, comme
  `FermeLeFilDeSonObjet` dans `AppServiceProvider::bootObservers()`. La table « type → clos » est une
  constante, avec un test par ligne.
- ⚠ Une écriture par requête (`Model::query()->update()`) ne déclenche pas l'observateur. Relevé du
  2026-11-19 : chaque clôture passe par le modèle, `update`, `save` ou `forceFill()->save()`.
  - Bail : `ExpireEndedLeasesJob:66`, `EarlyTerminationService:227`, `LeaseService:497,791`.
  - Réservation : `BookingExpirationService:200`, `BookingService:385,542`, `LeaseService:357`.
  - Intervention : affectation de `status` puis `save` (`MaintenanceRequestService`). Les deux
    `saveQuietly()` du dépôt n'écrivent que `metadata` (`MaintenanceRequest.php:146`).
  - Bien : `PropertyController:489`, `PropertyBulkArchiveService` (`forceFill()->save()`).

  Les seeders, sous `withoutEvents()`, n'annulent rien. Un test par type garde le chemin réel.

## Conséquences

- **Ce que ça coûte** :
  - une table ;
  - un type du registre, avec sa projection ;
  - onze codes au catalogue ;
  - une commande planifiée toutes les 5 minutes ;
  - une branche de plus dans la dérivation de la file (un `EXISTS` sur `commitments` par fil, avec
    un index `(conversation_id, status, due_at)`) ;
  - un observateur de clôture.
- **Ce que ça interdit** :
  - qu'un engagement apparaisse dans les tâches, le tableau de bord, l'agenda ou les statistiques
    d'équipe d'un agent ;
  - qu'une note d'équipe devienne un engagement lisible du client ;
  - que la fiabilité sorte de l'équipe ;
  - qu'un geste sur un engagement contourne sa route.
- **Ce que ça rend possible** :
  - le copilote (lot 4) propose un engagement, que le personnel note par la même route (`AiSuggestion`) ;
  - le pont (lot 5) porte les rappels et les relances à qui n'a pas l'application ;
  - une page d'agence « Engagements » se construit plus tard sur la même table.
- **Ce que ça ne règle pas** :
  - **le porteur qui quitte le fil** : son engagement reste `open`, et `action_for` ne le retient plus
    (`EvenementsDuFil::participantsActifs`). Le personnel tranche ;
  - **les rappels réglables** (« la veille 18:00 », « 1 h avant ») et l'interrupteur des relances
    automatiques par fil : un seul rappel, à 24 h ;
  - **un seuil minimal** avant d'afficher la fiabilité, et une remise à zéro ;
  - **un délai pour rouvrir** un engagement tenu : il n'y en a pas ;
  - un engagement pris dans un fil sans agence (un fil direct entre particuliers) ;
  - **la question « Tenu ? » restée sans réponse** ne revient pas au personnel (la maquette la lui
    renvoyait à 18 h) : le personnel suit l'engagement par « Retard » ;
  - **la puce d'objet de la rangée de la boîte** (`carte` de la maquette `fil-boite` D, « Devis 145 000 F
    à approuver ») : la maquette ne la lie pas aux engagements, et TCK-2968 l'avait renvoyée à ce lot.
    Elle reste hors du lot 3. Elle se relira par lecteur, puisque l'aperçu commun de la liste ne porte
    aucun montant (ADR-0128 § 3).

## Options écartées

- **(A) Les engagements dans la table `tasks`**, avec une colonne de genre. Cela supposait :
  - une exclusion écrite à chacun des ~14 lecteurs de `tasks`, où un seul oubli met la promesse d'un
    client dans la journée d'un agent ;
  - de lever la règle « assigné = personnel » (TCK-591) pour ce seul genre ;
  - d'ajouter à `TaskPolicy` une branche de lecture par le fil ;
  - de passer `taskable_type` d'une classe à une clé de registre ;
  - et une seconde définition de « en retard », à l'instant, à côté de celle au jour.

  On gardait un nom, et on payait en gardes.
- **(B) Le retard porté par une colonne de statut `overdue`**, écrite par la commande : chaque lecture
  dépendrait du passage de la commande, et le bénéficiaire verrait le retard en décalé. Ici, le
  statut stocké ne change qu'à un geste.
- **(C) Le bénéficiaire seul juge de « tenu »** : écarté par la décision 2. On lui pose la question,
  mais le porteur peut aussi déclarer, et l'autre partie garde une réouverture motivée.
- **(D) La fiabilité montrée à la personne et aux autres participants** (maquettes A et C) : écartée
  par la décision 1.

## Application

- Côté API :
  - modèle `App\Models\Commitment` et enum `CommitmentStatus` ;
  - `CommitmentResource::forViewer`, que lisent la projection (`ObjetsDesMessages::resoudre`) et les
    listes ;
  - `App\Policies\CommitmentPolicy` ;
  - le type `commitment` de `SujetsDuFil` et sa résolution dans `ObjetsDesMessages` ;
  - onze codes dans `CodesDuFil` ;
  - la commande `commitments:signal` ;
  - l'observateur de clôture ;
  - la file `retard` de `FileDuFil`.
- Côté front :
  - la carte d'engagement ;
  - le geste « Noter un engagement » ;
  - l'onglet « Engagements » de la messagerie ;
  - la puce « Retard » ;
  - le bloc de fiabilité du personnel.
- **Gardes** :
  - `CloturesDuFilArchitectureTest` : chaque code `attend` a sa clôture ;
  - `CodesDuFilArchitectureTest` : aucune clé interdite dans `data` ;
  - `RelectureDesObjetsTest` : le type `commitment` pour chaque lecteur ;
  - une matrice de non-fuite de la fiabilité et d'un engagement né d'une note d'équipe, vérifiée par
    ablation ;
  - un test par ligne de la table des clôtures.
