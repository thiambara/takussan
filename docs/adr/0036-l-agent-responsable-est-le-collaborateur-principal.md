# ADR-0036 — L'agent responsable d'un bien est son collaborateur `agent` principal, jamais son propriétaire

- **Statut** : Accepté, **amendé le 2026-10-19** (cf. § *Amendement du 2026-10-19 — le bien passe au bailleur*)
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
   sans compte (mandat) reste celui de la spec. *Amendé le 2026-10-19 : le bailleur se désigne à la
   saisie, et deux écritures de `user_id` vers un bailleur s'ajoutent à la passation (voir
   l'amendement, en fin de document).*

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

## Amendement du 2026-10-19 — le bien passe au bailleur (TCK-997, TCK-999, TCK-1000)

**Contexte.** Le personnel saisit des biens pour les bailleurs de son agence, mais `user_id` vaut
l'auteur, et rien ne le change ensuite : le bailleur ne voit ni son bien, ni ses baux, ni son relevé,
et ses loyers se reversent à l'agent ou à personne (P15.06, P50.01 à P50.03 du fichier de pistes,
mesurés le 2026-10-19). Le porteur a tranché le même jour : le bailleur se désigne **à la saisie**
(TCK-997) ; un bien saisi pour un bailleur **invité** passe à ce bailleur **quand il accepte**
l'invitation (Q2) ; un geste **« changer le titulaire »** corrige les biens déjà saisis au nom du
personnel (Q5) ; l'agence peut garder un bien en propre (Q1) ; le titulaire d'un lot se fixe à sa
création (Q3).

**Décision.** La règle du § 4 devient : **hors création, `user_id` ne s'écrit que par trois voies,
et jamais depuis un bailleur.**

1. **La passation** (§ 4, inchangée) : du personnel qui part vers un repreneur du personnel.
2. **L'acceptation d'une invitation de bailleur** (Q2) : un bien saisi pour un bailleur invité
   reste au nom de son auteur et porte le profil invité (`properties.pending_owner_profile_id`,
   FK `owner_profiles` nullable, `nullOnDelete`, ajout réversible). À l'acceptation, dans la
   transaction qui active le profil (`InvitationService::finalizeAccept`), chaque bien qui porte
   ce profil, dans l'agence du profil, passe au bailleur : `user_id` = le compte qui accepte, le
   lien est effacé. Une invitation révoquée ou expirée efface le lien : le bien reste à l'agence.
3. **Le geste « changer le titulaire »** (Q5) : d'un membre du personnel vers un bailleur **actif**
   de l'agence du bien, par l'**admin de l'agence** seul, parce que le geste décide à qui vont des
   loyers.

Ce qui ne change pas : jamais **depuis** un bailleur (on ne retire pas son bien à un bailleur), donc
jamais d'un bailleur à un autre ; le rattachement d'un lot (`parent_id`) ne réécrit **jamais**
`user_id` (Q3) : un lot rattaché sous le bien d'un bailleur doit déjà avoir ce titulaire, sinon 422
— le porteur l'a décidé pour un lot d'un autre bailleur (Q4) ; nous l'étendons au lot tenu par le
personnel, qui passe d'abord par la voie 3. La copie d'un bien est une création : elle prend le
titulaire de la source quand c'est un bailleur de l'agence.

**Ce que le transfert entraîne** (voies 2 et 3, une seule implémentation) :

- **Baux `draft`** dont `landlord_id` est l'ancien titulaire : ils passent au bailleur dans la même
  transaction. Un brouillon n'est ni signé ni payé ; c'est la règle que TCK-616 retient pour le bail
  d'un agent parti.
- **Baux au-delà de `draft`** (signature en cours, actif, en préavis, terminé) : ils **gardent** leur
  `landlord_id`. Un bail signé nomme son bailleur, et ses paiements déjà encaissés ont leur
  bénéficiaire : les réécrire changerait un contrat sans acte des parties. Le geste (voie 3) montre
  ces baux avant confirmation ; les deux voies les portent dans le journal.
- **Reversements déjà émis** : jamais touchés, l'argent est sorti et leurs pièces sont figées
  (TCK-594). Les paiements non reversés suivent le `landlord_id` de leur bail, donc les règles
  ci-dessus.
- **Relevé et avis mensuel** : ils se calculent sur `leases.landlord_id`, et jugent le bénéficiaire
  par la même règle que le reversement (TCK-997, Q1) ; les périodes passées ne changent pas.
- **Journal et notification** : `activity('Property')`, évènement `owner_transferred` (ancien et
  nouveau titulaire, voie, baux gardés), avec le journal du modèle coupé comme pour la passation
  (ADR-0059 § 4) — sinon `properties:repair-reassigned-owners` relirait le transfert comme une
  réattribution fautive et le défairait. Le bailleur est prévenu par la notification
  `property.assigned_to_owner`, comme à la désignation (Q6).

**Ce qui reste ouvert.** La reprise par le bailleur d'un bail déjà signé au nom de l'agence (avenant
ou bail neuf) n'est pas décidée : elle se cadrera quand un cas réel se présentera. La passation
d'un membre du personnel qui tient encore un bien en attente d'invitation garde le lien : le bien
passe au repreneur, puis au bailleur à l'acceptation.

