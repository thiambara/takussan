---
id: TCK-2957
title: "Le fil rattaché à son objet : subject_type / subject_id, le registre SujetsDuFil, la reprise des fils d'intervention, le fil fermé à la suppression de son objet"
status: todo
phase: P1
family: back
estimate: M
wave: 94
created: 2026-11-17
updated: 2026-11-17
depends_on: []
blocks: [TCK-2958, TCK-2960]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#21-maintenancerequest-
tags: [back, messagerie, le-fil, registre, migration, adr-0128]
---

## Objectif utilisateur

- **Toute partie d'un objet (intervention, bail, réservation)** : le fil de cet objet est relié à lui
  une fois pour toutes, et il cesse d'accepter des messages quand l'objet est supprimé.

## Contrat de données

- ADR-0128 § 1 (le lien générique, le registre fermé, la fermeture par observateur). Plan
  `docs/plans/2026-11-17-le-fil.md`, lot 1, ligne 1.1.
- `conversations` gagne `subject_type` et `subject_id`. **`subject_type` porte une clé du registre**
  (`maintenance_request`, `lease`, `booking`), jamais un nom de classe.
- ⚠ **`conversations.subject` existe déjà : c'est le titre du fil** (`Conversation::$fillable`,
  `ConversationResource`). Une relation `subject()` serait masquée par l'attribut. Le nom de la
  relation ou de l'accesseur est donc autre (`objetDuSujet()`, par exemple), et ce n'est pas un
  `morphTo` (la colonne ne porte pas de classe, et un `morphMap` global toucherait les autres
  relations polymorphes du dépôt).
- `ConversationResource` rend `subject_type` et `subject_id` (nuls pour un fil sans sujet).

## Contraintes strictes (métier)

- **Registre fermé.** Un type absent de `SujetsDuFil` est refusé, que ce soit à l'écriture d'un
  sujet ou à sa résolution. Aucune chaîne venue d'une requête n'est résolue hors du registre : ni
  `new $type`, ni `$modele->{$nom}()`, ni `Relation::getMorphedModel()` sur une entrée libre
  (mémoire « nom venu de l'URL jamais appelé »).
- Le registre décrit, par type : le modèle, le droit de lecture (`view` de la politique de l'objet),
  et **si le type peut être sujet d'un fil**. Les tickets suivants y ajoutent des types qui
  ne sont pas des sujets (objets de cartes : TCK-2958, TCK-2961, TCK-2964). Ce ticket pose les trois
  types sujets : `maintenance_request`, `lease`, `booking`.
- **Pas de clé étrangère** sur le lien générique. Les trois clés existantes (`property_id`,
  `lease_id`, `maintenance_request_id`) restent et gardent leur sens de **contexte**.
  `maintenance_request_id` n'est pas retiré.
- **La fermeture.** `conversations.status = closed` (cas `ConversationStatus::Closed`, réservé
  aujourd'hui, posé par aucun chemin) devient le statut d'un fil dont l'objet est supprimé :
  - suppression douce **et** définitive d'un objet du registre — les trois types sujets sont en
    `SoftDeletes` (`Lease`, `Booking`, `MaintenanceRequest`) : l'événement `deleted` couvre les deux ;
  - `restored` remet le fil à `active` **s'il avait été fermé par la suppression** de cet objet ;
  - un fil `closed` **n'accepte plus d'écriture** : `ConversationAccess::allowsWriting` rend `false`,
    donc l'envoi répond 403 (`SendMessageConversationRequest::authorize` lit déjà `allowsWriting`) et
    `abilities.can_send_message` de `ConversationController::show` (TCK-2374) cache la saisie ;
  - **la lecture ne change pas** (rien ne change à `allows`). Relevé : un fil d'intervention dont la
    demande est supprimée en douceur est déjà illisible, parce que `maintenanceAllows` lit la relation
    `maintenanceRequest`, nulle pour un objet supprimé. Ce ticket ne le change pas. À l'inverse, une
    suppression **définitive** remet `maintenance_request_id` à nul (`nullOnDelete`) et le fil
    redevient lisible par ses participants : `closed` y ferme au moins l'écriture.
- L'observateur est branché **par une boucle sur les types sujets du registre**, pas par une ligne
  par modèle : un type ajouté au registre est fermé sans autre code.

## Delta à produire

- [ ] Migration `add_subject_to_conversations_table` :
  - `subject_type` `string(40)` nul, `subject_id` `unsignedBigInteger` nul ;
  - index nommé explicitement `conversations_subject_idx` sur `(subject_type, subject_id)` (piège
    n° 3 des noms > 63 caractères) ;
  - **reprise** dans la même migration, en SQL pur : `subject_type = 'maintenance_request'`,
    `subject_id = maintenance_request_id` pour tout fil qui porte `maintenance_request_id` ;
  - `down()` : supprime l'index puis les colonnes.
- [ ] `App\Services\Messaging\SujetsDuFil` : la table fermée type → modèle → lecture → sujet, et
  ses accès (`types()`, `typesSujets()`, `modele(string)`, `typeDe(Model)`, `resoudre(string, int)`,
  `peutLire(User, Model)`). Un type inconnu lève une exception de logique, jamais un `null` muet
  qu'un appelant prendrait pour « objet supprimé ».
- [ ] `Conversation` : `subject_type`, `subject_id` dans `$fillable` ; l'accesseur de l'objet
  (résolu par le registre, suppression douce comprise) ; un scope `deSujet(Model $objet)`.
- [ ] `GroupConversationService::create` gagne un paramètre nommé `sujet: ?Model`, écrit par le
  registre. `SyncMaintenanceConversation::open` le passe : **un fil d'intervention neuf naît avec
  son sujet**, la reprise de la migration ne couvre que les anciens.
- [ ] `App\Observers\FermeLeFilDeSonObjet` (`deleted`, `restored`), branché dans
  `AppServiceProvider` sur chaque modèle de `SujetsDuFil::typesSujets()`. La fermeture se marque
  dans `conversations.metadata` (une clé qui dit « fermé par la suppression de son objet ») : c'est
  ce que `restored` relit pour ne rouvrir que ce qu'il a fermé.
- [ ] `ConversationAccess::allowsWriting` : `false` pour un fil `closed`.
- [ ] `ConversationResource` : `subject_type`, `subject_id`.
- [ ] Tests :
  - `SujetsDuFilTest` — chaque type résout son modèle ; un type inconnu est refusé ; aucun nom de
    classe n'est accepté comme type ;
  - `ConversationSubjectMigrationTest` — un fil d'intervention existant reçoit son sujet, un fil
    sans intervention n'en reçoit pas ;
  - `SyncMaintenanceConversationTest` (existant, complété) — le fil ouvert à la première
    assignation porte `subject_type = maintenance_request` et l'identifiant de la demande ;
  - `FilFermeALaSuppressionTest` — **un jeu de données tiré de `SujetsDuFil::typesSujets()`** :
    pour chaque type, suppression douce → `closed` et `allowsWriting` faux pour un participant qui
    pouvait écrire ; restauration → `active` ; un fil d'un autre objet du même type n'est pas touché ;
    suppression définitive → `closed` ;
  - `FilFermeEcritureTest` — sur un fil `closed` dont l'objet existe (fermé par le test), l'envoi
    répond 403 et `abilities.can_send_message` vaut `false`, la lecture reste permise.

## Critères d'acceptation

- [ ] **AC1** — Après la migration, tout fil qui porte `maintenance_request_id` porte le sujet
  correspondant, et aucun autre fil n'a de sujet.
- [ ] **AC2** — Un fil d'intervention créé par la première assignation porte son sujet.
  *Ablation : retirer le paramètre `sujet:` de l'appel dans `SyncMaintenanceConversation::open` rend
  le test rouge* (la reprise de la migration ne peut pas le cocher : le fil est créé après).
- [ ] **AC3** — Pour **chaque** type sujet du registre, supprimer l'objet ferme son fil et seulement
  le sien ; le restaurer le rouvre. *Ablation : retirer le branchement de l'observateur d'un seul
  type (sortir ce type de la boucle) rend rouge la ligne de ce type et elle seule.*
- [ ] **AC4** — Un fil `closed` refuse l'envoi (403) et cache la saisie ; ses règles de lecture sont
  celles d'aujourd'hui. *Ablation : retirer la condition `closed` de `allowsWriting` rend rouges
  `FilFermeEcritureTest` et la ligne `allowsWriting` de chaque type.*
- [ ] **AC5** — `SujetsDuFil::resoudre('App\\Models\\User', 1)` et `resoudre('user', 1)` sont refusés.
- [ ] **AC6** — `restored` ne rouvre que ce que la suppression a fermé : un fil **du même objet**,
  posé `closed` par le test sans la marque de suppression, reste `closed` après la restauration de
  cet objet. *Ablation : rouvrir sans lire la marque rend ce test rouge.*
- [ ] Pint propre ; `php artisan test` des classes touchées vert.

## Hors périmètre

- Les salles du bail et de la réservation (création, membres, accès) : TCK-2960.
- Les cartes, les événements, la relecture par lecteur : TCK-2958.
- Le retrait de `maintenance_request_id` (ADR-0128 § 1 : non retiré par cet ADR).
- Un geste « fermer un fil » à la main : seul l'objet ferme son fil.

## Notes d'implémentation

### Re-mesure (2026-11-18, arbre `feat/le-fil`)

- **`SyncMaintenanceConversationTest` n'existe pas.** Le test du fil d'intervention est
  `tests/Feature/Maintenance/MaintenanceConversationTest.php` (TCK-592) : c'est lui qui est complété (AC2).
- `ConversationStatus::Closed` était **gardé réservé** par `tests/Unit/Architecture/CasDEnumReservesTest.php`
  (TCK-1307) : la réserve est levée (docblock du cas et liste du test), puisque `FermeLeFilDeSonObjet` le pose.
- `conversations.lease_id` est `nullOnDelete`, `maintenance_request_id` aussi (FK de `2026_04_17_160033`) :
  aucune cascade ne supprime un fil avant que l'observateur le ferme.
- **Suppressions sans événement** : aucun chemin de `app/` ne supprime `Lease`, `Booking` ou
  `MaintenanceRequest` par requête (grep des `->delete()` / `->forceDelete()` sur requête ou relation). En
  revanche, `maintenance_requests.property_id` est `cascadeOnDelete` en base : la suppression DÉFINITIVE
  d'un bien supprime ses demandes sans événement, et leurs fils ne seraient pas fermés. Hors périmètre (le
  bien est en suppression douce dans l'application) ; noté dans l'en-tête de l'observateur.
- AC1 dit « tout fil qui porte `maintenance_request_id` » : la reprise inclut les **directes** qui en
  portent un (`FilDeLInterventionParLaRelationTest` en crée). À savoir pour l'index unique partiel de
  TCK-2960 : il doit viser les types `lease`/`booking` (ou le type `group`), sinon une directe et un groupe
  d'une même demande le violeraient.

### Choix

- `SujetsDuFil` est **statique, sur une constante** : les jeux de données de PHPUnit tournent avant le
  démarrage de l'application, et AC3 tire ses lignes de `typesSujets()`. Seul `peutLire` lit la Gate.
- `resoudre()` rend l'objet **supprimé en douceur compris** (`withTrashed`) ; `null` seulement pour une ligne
  absente ; un type inconnu lève `LogicException`. Accesseur de plus que la liste du ticket :
  `typeDuSujet(Model)`, qui refuse un type du registre qui ne peut pas être sujet (pour les types de cartes à
  venir) — c'est lui qu'écrivent `GroupConversationService::create` et le scope `deSujet`.
- Le registre est aussi fermé **à l'écriture du modèle** : `Conversation::booted()` refuse (`saving`) un
  `subject_type` hors des types sujets, ou un type sans identifiant.
- `Conversation::objetDuSujet()` est une méthode, pas une relation (l'attribut `subject` est le titre).
- `GroupConversationService::create(sujet:)` est le **dernier** paramètre : aucun appelant positionnel ne bouge.
- `allowsWriting` refuse un fil `closed` **avant** le passe-droit du super-admin : personne n'écrit dans le
  fil d'un objet supprimé.
- L'observateur ne ferme que les fils non `closed` et ne marque que ceux-là
  (`metadata.ferme_par_suppression_de_son_objet = true`) ; `restored` ne rouvre que les fils marqués et
  retire la marque.
- `docs/models-spec.md` § 18 n'est pas touché : le delta ne le demande pas, c'est `/sync-specs` après fusion.

### Mesures


Classes de l'agent (2026-11-18, charge 2-5 sur 8 cœurs) : `SujetsDuFilTest`, `ConversationSubjectMigrationTest`,
`FilFermeALaSuppressionTest`, `FilFermeEcritureTest`, `MaintenanceConversationTest`, `CasDEnumReservesTest` —
**33 verts, 133 assertions**. Rouges avant le code : 15 sur 16 (le témoin actif de `FilFermeEcritureTest` était
vert : il ne dépend pas du correctif). Gardes : `RessourceUniqueResolueTest`, `ExistsSurTableASuppressionDouceTest`,
`AgencyIdIsIndexedTest`, `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`,
`DateInventoryByValueTest` — 37 verts. Pint propre.

Ablations (une à une, restauration par `cp`, md5 vérifié) :

| Retiré | Rouge |
|---|---|
| `sujet: $mr` dans `SyncMaintenanceConversation::open` (AC2) | `test_le_fil_ouvert_a_la_premiere_assignation_porte_son_sujet` |
| `lease` sorti de la boucle de `bootObservers` (AC3) | les 3 lignes `lease` de `FilFermeALaSuppressionTest`, et elles seules (6 vertes) |
| la condition `closed` de `allowsWriting` (AC4) | `FilFermeEcritureTest` (le témoin reste vert) ; les 7 tests de suppression, chaque type compris |
| la lecture de la marque dans `restored` (AC6) | les 3 lignes de `test_la_restauration_ne_rouvre_que_ce_que_la_suppression_a_ferme` |
| `resoudre` qui accepte un nom de classe (AC5) | `test_un_type_inconnu_est_refuse`, `test_aucun_nom_de_classe_n_est_accepte_comme_type` |
| le `WHERE` de la reprise (AC1) | `test_tout_fil_d_intervention_recoit_son_sujet_et_aucun_autre` |
| la garde `saving` de `Conversation` | `test_un_fil_ne_s_ecrit_pas_avec_un_sujet_hors_registre` |

Non joué par l'agent (règle de charge) : les autres classes qui couvrent `ConversationAccess`,
`GroupConversationService` et `ConversationResource` — c'est la CI de la PR.

Contre-vérifications de fin :

- **Chemins d'écriture d'un message** : l'envoi (`SendMessageConversationRequest`), le message initial
  (`ConversationWriter::post`, qui rejoue `allowsWriting`) et l'ouverture d'un groupe depuis un fil
  (`ConversationPolicy`, l. 41) lisent tous `allowsWriting`. Hors règle : le contact public d'une annonce
  (directe de prospect, jamais de sujet) et les avis système (sans auteur).
- **Suppressions sans événement**, re-mesurées sur des chaînes multi-lignes (`grep -A8`) : aucune dans `app/`.
- **Autres écrivains de `conversations.maintenance_request_id`** : aucun. `SyncMaintenanceConversation::open`
  est le seul appelant qui le passe ; `POST /api/conversations` le refuse (`prohibited`) ; `createFromDirect`
  ne le recopie pas. Les seeders n'en écrivent pas.
- `peutLire` a désormais un cas positif (le locataire lit son bail) ; ablation `return false` → rouge.
