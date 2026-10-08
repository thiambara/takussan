---
id: TCK-603
title: "Changer l'agent responsable sans déposséder le bailleur : bulk-assign, réattribution unitaire, réparation des biens réattribués, biens du partant à la passation (complément de TCK-591, après TCK-504)"
status: doing
phase: P1
family: full
estimate: L
wave: 73
created: 2026-10-07
updated: 2026-10-08
depends_on: [TCK-504, TCK-591]
blocks: []
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#112-agence--équipe
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#9-usercustomerrelationship
    - docs/models-spec.md#32-task-
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#21-maintenancerequest-
    - docs/models-spec.md#66-roledelegation-
tags: [back, front, bulk, passation, propriété, sécurité, intégrité]
---

# TCK-603 — Changer l'agent responsable sans déposséder le bailleur

## Objectif utilisateur

Un admin d'agence change l'agent responsable d'un ou de plusieurs biens **sans toucher à leur
propriétaire** ; un agent qui quitte l'agence transmet aussi les biens qu'il tient. Les biens déjà
réattribués par l'ancien geste retrouvent leur bailleur.

## Contexte

Ce ticket est la **part de TCK-591 qui dépend de TCK-504** (la marque de collaborateur `agent`
principal), sortie de 591 le 2026-10-07 pour que 591 fusionne sans l'attendre. Le diagnostic est
celui de TCK-591, Contexte §7 (« la réattribution dépossède le bailleur ») et §8 (passation) ; il
n'est pas recopié ici. La décision qui gouverne le tout est
[ADR-0036](../../adr/0036-l-agent-responsable-est-le-collaborateur-principal.md) : l'agent responsable est le
collaborateur principal de TCK-504, jamais `properties.user_id` (le propriétaire).

Ce que TCK-591 a déjà livré et que ce ticket consomme :
- `POST properties/bulk-visibility` (requête, service, bilan par codes `updated` / `failed`,
  transaction) : `bulk-assign` suit le même modèle ;
- le bilan front des actions en masse (`PropertyList.tsx` : bilan chiffré et motivé, seuls les
  refus restent sélectionnés, rafraîchissement dès qu'un bien a changé) pour archiver et dépublier ;
  « Changer l'agent responsable » y reste **unitaire** ;
- `AgentPortfolio` / `AgentHandoverService` : la catégorie `held_properties` est **comptée**
  (inventaire, garde `agency_member.portfolio_not_empty`), **pas transmise** ; `responsible_properties`
  n'existe pas encore ;
- l'assistant de passation front (`HandoverWizard`) affiche une catégorie non transmissible
  (`pending`) et exige l'aveu `leave_unassigned` pour elle.

**Écart re-mesuré dans 591** : spatie/activitylog est en **v5.1** — les changements de champs vivent
dans la colonne `activity_log.attribute_changes`, **plus** dans `properties`. La commande de
réparation lit donc `attribute_changes->'old'->>'user_id'` / `attribute_changes->'attributes'->>'user_id'`,
et non `properties->…` comme l'écrivait le Delta d'origine.

## Delta à produire

*Les renvois « Contraintes n », « Contexte n » et « Delta 0 » ci-dessous visent **TCK-591**, dont ce
Delta est extrait tel quel.*

**1. Réattribution (unitaire et en lot)**
- [ ] `PropertyBulkAssignRequest`, `PropertyBulkAssignService`, route `bulk-assign` déclarée avant
      `{property}` (`routes/api/properties.php`), sur le modèle de `bulk-visibility` (TCK-591).
- [ ] `PropertyController::assignAgent` (corps, l.238-259) : **supprimer**
      `$property->update(['user_id' => $target->id])` (l.254) ; à la place, désigner la cible
      **agent responsable** selon l'ADR « agent responsable » (Delta 0 ; option retenue par défaut :
      la cible devient le collaborateur `agent` marqué principal par le service de TCK-504 — ligne
      `property_collaborators` créée si absente, `role = agent`, `invited_at = now()` ; une ligne
      existante d'un autre rôle : traitement tranché par l'ADR, 504 n'admettant que `agent` en
      principal ; l'ancien principal reste collaborateur, sans la marque, `commission_share`
      intact). Le tout sous
      `DB::transaction`, ligne parent verrouillée (`Property::whereKey()->lockForUpdate()`, piège
      PostgreSQL n°2). La réponse charge `owner` et `PrimaryPropertyContact::eagerLoads()`.
- [ ] Règle de cible : celle de **TCK-587** (Contraintes 9), appelée par `assignAgent` **et** par
      `PropertyBulkAssignService` — 591 ne la réécrit pas ; en lot, son refus devient
      `invalid_target`. Le contrôle maison l.247-251 (`$target->agency_id === $agencyId`) disparaît.
- [ ] `PropertyBulkAssignService` : même désignation que l'unitaire (un seul service
      `App\Services\Property\ResponsibleAgentAssigner::assign(Property, User $target, User $actor)`
      appelé par les deux), **jamais** d'écriture de `user_id` ; cible déjà responsable →
      `unchanged`. Journal : `activity('Property')`, évènement `responsible_agent_changed`
      (`property_id`, ancien et nouveau responsable) — la trace qui manquait au geste.
- [ ] **Réparation des biens déjà réattribués** — commande
      `properties:repair-reassigned-owners {--dry-run}` (idempotente). Source : `activity_log`
      `log_name = 'Property'`, `event = 'updated'`, `attribute_changes->'old'->>'user_id'` ≠
      `attribute_changes->'attributes'->>'user_id'` (activitylog v5.1, cf. Contexte ; seul
      `assignAgent` produit cette signature, cf. Contexte 7). Pour chaque bien : `user_id` ← la
      **première** valeur `old` de la chaîne (le titulaire d'origine) ; la **dernière** cible devient agent responsable par
      `ResponsibleAgentAssigner` si elle est encore du personnel de l'agence ; les baux du bien
      créés après la première réattribution dont `landlord_id` = une cible : `draft` → `landlord_id`
      rétabli ; tout autre statut **listé, jamais réécrit** (un bail signé est un document
      contractuel — à traiter à la main). Sortie : comptes `restored`, `leases_fixed`,
      `leases_to_review` (avec identifiants). **Environnements** : aucune production API
      (`hebergement.md:23`) — rien à réparer en production ; la commande se joue **une fois sur la
      préproduction** `takussan_preview` (`hebergement.md:80`) après le déploiement de ce ticket,
      `--dry-run` d'abord, résultat consigné dans les Notes d'implémentation ; une remise à zéro
      par le seed (`hebergement.md:213`) la rend sans objet. En local, `migrate:fresh --seed` suffit.
- [ ] Front : les trois actions passent par `bulk-*` ; bilan chiffré et motivé (`invalid_target`
      dit que la cible n'est pas du personnel actif de l'agence) ; seuls les refus restent
      sélectionnés ; la liste est rafraîchie dès qu'au moins un bien a changé, succès partiel
      compris. Le geste s'intitule « Changer l'agent responsable » ; la liste et la fiche distinguent
      propriétaire et agent responsable (`owner` / `primary_contact`).

**2. Passation — les biens du partant**
- [ ] Catégories de biens de `AgentHandoverService::transfer()` (TCK-591, Contraintes 3) :
      `responsible_properties` → `ResponsibleAgentAssigner` vers le repreneur (jamais `user_id`) ;
      `held_properties` (`user_id` = le partant) → `user_id` ← repreneur du personnel de la même
      agence, selon la question 2 d'ADR-0036. Un bien dont `user_id` est un bailleur n'entre dans
      aucune des deux catégories par son `user_id`. Les deux catégories quittent `pending` de
      `GET …/portfolio` ; l'assistant front les transmet comme les autres.

**3. Mesure**
- [ ] AC15 de TCK-591, sa part restante : sur un **vrai téléphone**, changer l'étape d'un client
      **au doigt** dans le `<select>` natif (carte du pipeline et fiche) — CDP ne pilote pas le
      sélecteur natif ; le reste d'AC15 est mesuré dans 591.

## Critères d'acceptation

- [ ] AC1 — **sécurité, prouvé par ablation** : `bulk-assign` vers un bailleur de l'agence rend ce bien
      en `failed` avec `invalid_target`, ne modifie ni `user_id` ni l'agent responsable ; vers un agent
      **suspendu** de l'agence, idem. Le refus vient de la règle de cible de **TCK-587** (Delta §3,
      AC5b), que `PropertyBulkAssignService` appelle (Contraintes 9) : on remplace l'appel par
      `true` → le bien passe en `updated`, rouge.
      *(ex-AC4 de TCK-591)*
- [ ] AC2 — **sécurité** (cible de la réattribution unitaire) : `PUT /api/properties/{p}/assigned-agent`
      avec l'`user_id` d'un bailleur de A → 422 `messages.target_user_not_in_active_agency` (200
      aujourd'hui : `$target->agency_id === $agencyId`, l.248, laisse passer le bailleur) ; vers un
      agent d'une autre agence → 422. (Règle de 587, appelée ici — l'AC5b de 587 la porte aussi.)
      *(ex-AC22 de TCK-591)*
- [ ] AC3 — **intégrité, prouvé par ablation** (`PropertyReassignmentKeepsOwnerTest`, consolidation) :
      bien P de A, `user_id` = bailleur B, agent X collaborateur `agent` principal. `PUT
      /api/properties/{P}/assigned-agent` vers l'agent Y de A → 200 ; **`properties.user_id` = B
      inchangé** (Y aujourd'hui) ; `PrimaryPropertyContact::for(P)` = Y (X aujourd'hui, l'appel
      n'ayant touché aucun collaborateur) ; X reste collaborateur ; `GET /api/dashboard/owner` par B
      (`DashboardOwnerService.php:25`) compte toujours P ; **`POST /api/leases` sur P par Y rend
      un bail dont `landlord_id` = B** (Y aujourd'hui, `LeaseService.php:32`). Même jeu par
      `bulk-assign` sur P et sur un bien Q saisi par l'agent X (`user_id` = X) : `user_id` de P = B et
      de Q = X, inchangés, responsable = Y sur les deux. Ablation : rétablir
      `$property->update(['user_id' => $target->id])` dans `assignAgent` → rouge (`user_id` et
      `landlord_id` = Y).
      *(ex-AC29 de TCK-591)*
- [ ] AC4 — réparation (`RepairReassignedOwnersCommandTest`) : jeu où P (`user_id` B) a été
      réattribué à X puis à Y comme le faisait l'ancien `assignAgent` — deux
      `$property->update(['user_id' => …])` dans le test, qui écrivent la même signature
      `activity_log` (`Property`, `updated`, `old.user_id` ≠ `attributes.user_id`) ; `user_id` final
      Y —, avec un bail `draft` et un bail
      `active` créés ensuite (`landlord_id` = Y). `properties:repair-reassigned-owners --dry-run` :
      rien n'est écrit, la sortie annonce `restored = 1`, `leases_fixed = 1`, `leases_to_review = 1`.
      Sans `--dry-run` : `user_id` = B, responsable = Y, bail `draft` → `landlord_id` = B, bail
      `active` inchangé et listé par identifiant. Second passage : `restored = 0` (idempotente). Un
      bien dont `user_id` n'a jamais changé n'est pas touché.
      *(ex-AC30 de TCK-591)*
- [ ] AC5 — part « biens » d'AC12 de TCK-591 : passation d'un agent dont il est agent responsable
      d'un bien dont `user_id` est un **bailleur** B, et qui a saisi un bien (`user_id` = lui) :
      après `POST …/handover`, agent responsable du bien de B (`PrimaryPropertyContact::for`) =
      repreneur **avec `user_id` toujours = B** ; `user_id` du bien saisi = repreneur ; une entrée
      `activity_log` par catégorie ; une erreur injectée à mi-parcours ne déplace rien. Les autres
      catégories d'AC12 sont vertes dans 591.
- [ ] AC6 — la part « au doigt dans le `<select>` natif » d'AC15 de TCK-591, mesurée sur un vrai
      téléphone (Delta §3).

## Hors périmètre

- Tout ce que TCK-591 a livré (voir Contexte).
- Le choix de l'agent principal lui-même : TCK-504.

## Notes d'implémentation
