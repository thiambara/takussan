# ADR-0036 — L'agent responsable d'un bien est son collaborateur `agent` principal, jamais son propriétaire

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-591](../backlog/tickets/TCK-591-crm-agenda-agent-et-passation.md) ; dépend de
  [TCK-504](../backlog/tickets/TCK-504-agent-principal-choisi-plutot-que-deduit.md) pour son application

## Contexte

Le geste « Réattribuer » de la liste des biens, et l'endpoint unitaire `PUT
/api/properties/{p}/assigned-agent`, écrivent `properties.user_id`
(`PropertyController::assignAgent`, `$property->update(['user_id' => $target->id])`). Or cette
colonne **est** le propriétaire, relevé le 2026-10-07 sur `5f872f1f` :

- `Property::owner()` est `belongsTo(User::class, 'user_id')` (`Property.php:712-715`), et
  `docs/models-spec.md` §8 la décrit comme « Propriétaire du bien ».
- Les droits du propriétaire reposent dessus (`PropertyPolicy.php:48`, `:102`), son tableau de bord
  aussi (`DashboardOwnerService`, `Property::where('user_id', $owner->id)`), et **tout bail créé
  ensuite** en tire son bailleur (`LeaseService::create`, `'landlord_id' => $property->user_id`).

« Réattribuer » un bien proposé par un bailleur le **dépossède** donc : il perd l'accès, le bien
quitte son tableau de bord, et l'agent devient bailleur des baux à venir.

Et le « responsable » que le geste prétend changer n'est pas celui que la plateforme affiche :
aucune colonne de `properties` ne porte d'agent responsable. C'est
`App\Services\Property\PrimaryPropertyContact` (TCK-502) qui désigne qui répond pour le bien — le
collaborateur de rôle `agent` le plus anciennement invité, à défaut le propriétaire — et sert la
carte de contact, le téléphone public, le message et le lead. TCK-504 (`todo`) prévoit d'y ajouter un
**choix explicite** : une marque de principal sur `property_collaborators`, unique par bien,
réservée au rôle `agent`.

## Décision

**L'agent responsable d'un bien est le collaborateur `agent` marqué principal par TCK-504 ;
`properties.user_id` reste le propriétaire et n'est réécrit, hors création, que par la passation d'un
bien saisi par le partant.**

1. **Une seule définition (option A).** Changer l'agent responsable, c'est désigner le principal par
   le service de TCK-504 : la ligne `property_collaborators` de la cible est créée si elle manque
   (`role = agent`, `invited_at = now()`), reçoit la marque, et l'ancien principal reste
   collaborateur, **sans** la marque, `commission_share` intact. `PrimaryPropertyContact::for()` rend
   alors la cible — la carte, le téléphone, les messages et les leads suivent sans rien apprendre.
2. **Une ligne existante d'un autre rôle.** Une cible déjà collaboratrice en `viewer` ou `manager`
   passe en `agent` (son ancien rôle est journalisé) ; une cible `co_owner` est **refusée**
   (`invalid_target`) : un co-propriétaire porte un droit de propriété que la désignation ne doit pas
   effacer, et TCK-504 n'admet que `agent` en principal.
3. **Un seul service.** `App\Services\Property\ResponsibleAgentAssigner::assign(Property, User
   $target, User $actor)` est appelé par l'endpoint unitaire, par `bulk-assign` et par la passation.
   Il verrouille la ligne parent (`Property::whereKey()->lockForUpdate()`, piège PostgreSQL n° 2),
   juge la cible par la règle de TCK-587 (personnel **actif** de l'agence du bien) et journalise
   `activity('Property')`, évènement `responsible_agent_changed` (ancien et nouveau responsable).
   Il n'écrit **jamais** `properties.user_id`.
4. **Question 2 — le bien saisi par un agent qui part.** Un bien créé par un membre du personnel
   porte son `user_id` (`PropertyController::store`). À son départ, la **passation** le transmet à un
   repreneur du personnel de la même agence (catégorie `held_properties`) : sinon l'ancien agent
   garderait lecture et écriture (`PropertyPolicy`) et resterait bailleur des baux à venir. C'est la
   **seule** écriture de `user_id` hors création, avec la commande de réparation qui rétablit le
   titulaire d'origine. Jamais d'un bailleur, jamais vers un bailleur.
5. **Hors décision** : le sens de `user_id` sur un bien saisi par le personnel pour un propriétaire
   sans compte (mandat) reste celui de la spec.

## Options écartées

- **(B) Colonne `properties.responsible_agent_id`** (FK nullable, `nullOnDelete`). Écartée : un second
  « responsable » qui divergerait de `PrimaryPropertyContact` — la fiche nommerait l'un, les messages
  partiraient à l'autre, exactement l'écart que TCK-502 a fermé.
- **(C) Statu quo** — le responsable est `user_id`. Écartée : c'est le défaut. Refuser seulement le cas
  d'un bien tenu par un bailleur (`owner_held`) laisserait le mot « réattribuer » désigner un
  changement de propriétaire sur tous les autres biens.

## Conséquences

- **Ordre de fusion : TCK-504 d'abord.** La marque, son unicité et son service sont les siens. Tant
  qu'il n'est pas fusionné, `assignAgent` garde son comportement, `bulk-assign` n'existe pas, et la
  passation ne déplace pas les biens (catégories `responsible_properties` et `held_properties`) —
  TCK-591 les laisse non cochés, « attend TCK-504 ».
- Les biens déjà « réattribués » sur une base existante se réparent par
  `properties:repair-reassigned-owners` (signature `activity_log` `Property` / `updated` /
  `old.user_id ≠ attributes.user_id`) ; aucune production API n'existe, seule la préproduction peut
  en contenir.
- Les écrans disent « Changer l'agent responsable » et montrent côte à côte le propriétaire (`owner`)
  et l'agent responsable (`primary_contact`).

## Application

- À la fusion de TCK-504 : `ResponsibleAgentAssigner`, `PropertyController::assignAgent` (corps),
  `PropertyBulkAssignService`, `AgentHandoverService` (catégories de biens),
  `RepairReassignedOwners` ; tests `PropertyReassignmentKeepsOwnerTest`,
  `RepairReassignedOwnersCommandTest`, `PropertyBulkAssignTest` (AC4, AC12, AC29, AC30 de TCK-591).
