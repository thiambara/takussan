---
id: TCK-603
title: "Changer l'agent responsable sans déposséder le bailleur : bulk-assign, réattribution unitaire, réparation des biens réattribués, biens du partant à la passation (complément de TCK-591, après TCK-504)"
status: done
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
- [x] `PropertyBulkAssignRequest`, `PropertyBulkAssignService`, route `bulk-assign` déclarée avant
      `{property}` (`routes/api/properties.php`), sur le modèle de `bulk-visibility` (TCK-591).
- [x] `PropertyController::assignAgent` (corps, l.238-259) : **supprimer**
      `$property->update(['user_id' => $target->id])` (l.254) ; à la place, désigner la cible
      **agent responsable** selon l'ADR « agent responsable » (Delta 0 ; option retenue par défaut :
      la cible devient le collaborateur `agent` marqué principal par le service de TCK-504 — ligne
      `property_collaborators` créée si absente, `role = agent`, `invited_at = now()` ; une ligne
      existante d'un autre rôle : traitement tranché par l'ADR, 504 n'admettant que `agent` en
      principal ; l'ancien principal reste collaborateur, sans la marque, `commission_share`
      intact). Le tout sous
      `DB::transaction`, ligne parent verrouillée (`Property::whereKey()->lockForUpdate()`, piège
      PostgreSQL n°2). La réponse charge `owner` et `PrimaryPropertyContact::eagerLoads()`.
- [x] Règle de cible : celle de **TCK-587** (Contraintes 9), appelée par `assignAgent` **et** par
      `PropertyBulkAssignService` — 591 ne la réécrit pas ; en lot, son refus devient
      `invalid_target`. Le contrôle maison l.247-251 (`$target->agency_id === $agencyId`) disparaît.
- [x] `PropertyBulkAssignService` : même désignation que l'unitaire (un seul service
      `App\Services\Property\ResponsibleAgentAssigner::assign(Property, User $target, User $actor)`
      appelé par les deux), **jamais** d'écriture de `user_id` ; cible déjà responsable →
      `unchanged`. Journal : `activity('Property')`, évènement `responsible_agent_changed`
      (`property_id`, ancien et nouveau responsable) — la trace qui manquait au geste.
- [x] **Réparation des biens déjà réattribués** — commande
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
- [x] Front : les trois actions passent par `bulk-*` ; bilan chiffré et motivé (`invalid_target`
      dit que la cible n'est pas du personnel actif de l'agence) ; seuls les refus restent
      sélectionnés ; la liste est rafraîchie dès qu'au moins un bien a changé, succès partiel
      compris. Le geste s'intitule « Changer l'agent responsable » ; la liste et la fiche distinguent
      propriétaire et agent responsable (`owner` / `primary_contact`).

**2. Passation — les biens du partant**
- [x] Catégories de biens de `AgentHandoverService::transfer()` (TCK-591, Contraintes 3) :
      `responsible_properties` → `ResponsibleAgentAssigner` vers le repreneur (jamais `user_id`) ;
      `held_properties` (`user_id` = le partant) → `user_id` ← repreneur du personnel de la même
      agence, selon la question 2 d'ADR-0036. Un bien dont `user_id` est un bailleur n'entre dans
      aucune des deux catégories par son `user_id`. Les deux catégories quittent `pending` de
      `GET …/portfolio` ; l'assistant front les transmet comme les autres.

**3. Mesure**
- [ ] **→ au porteur** (un vrai téléphone, hors d'atteinte d'un agent : CDP ne pilote pas le `<select>` natif). AC15 de TCK-591, sa part restante : sur un **vrai téléphone**, changer l'étape d'un client
      **au doigt** dans le `<select>` natif (carte du pipeline et fiche) — CDP ne pilote pas le
      sélecteur natif ; le reste d'AC15 est mesuré dans 591.

## Critères d'acceptation

- [x] AC1 — **sécurité, prouvé par ablation** : `bulk-assign` vers un bailleur de l'agence rend ce bien
      en `failed` avec `invalid_target`, ne modifie ni `user_id` ni l'agent responsable ; vers un agent
      **suspendu** de l'agence, idem. Le refus vient de la règle de cible de **TCK-587** (Delta §3,
      AC5b), que `PropertyBulkAssignService` appelle (Contraintes 9) : on remplace l'appel par
      `true` → le bien passe en `updated`, rouge.
      *(ex-AC4 de TCK-591)*
- [x] AC2 — **sécurité** (cible de la réattribution unitaire) : `PUT /api/properties/{p}/assigned-agent`
      avec l'`user_id` d'un bailleur de A → 422 `messages.target_user_not_in_active_agency` (200
      aujourd'hui : `$target->agency_id === $agencyId`, l.248, laisse passer le bailleur) ; vers un
      agent d'une autre agence → 422. (Règle de 587, appelée ici — l'AC5b de 587 la porte aussi.)
      *(ex-AC22 de TCK-591)*
- [x] AC3 — **intégrité, prouvé par ablation** (`PropertyReassignmentKeepsOwnerTest`, consolidation) :
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
- [x] AC4 — réparation (`RepairReassignedOwnersCommandTest`) : jeu où P (`user_id` B) a été
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
- [x] AC5 — part « biens » d'AC12 de TCK-591 : passation d'un agent dont il est agent responsable
      d'un bien dont `user_id` est un **bailleur** B, et qui a saisi un bien (`user_id` = lui) :
      après `POST …/handover`, agent responsable du bien de B (`PrimaryPropertyContact::for`) =
      repreneur **avec `user_id` toujours = B** ; `user_id` du bien saisi = repreneur ; une entrée
      `activity_log` par catégorie ; une erreur injectée à mi-parcours ne déplace rien. Les autres
      catégories d'AC12 sont vertes dans 591.
- [ ] **→ au porteur** (vrai téléphone ; rien dans ce ticket ne touche ce `<select>`) — AC6 — la part « au doigt dans le `<select>` natif » d'AC15 de TCK-591, mesurée sur un vrai
      téléphone (Delta §3).

## Hors périmètre

- Tout ce que TCK-591 a livré (voir Contexte).
- Le choix de l'agent principal lui-même : TCK-504.

## Notes d'implémentation

### 2026-10-08 — re-mesure sur `ddc8f8e4` (504 fusionné), avant le code

- `PropertyController::assignAgent` est aux **l.253-277** (et non 238-259) ; l'écriture `user_id` est
  l.272. La règle de 587 y est **en ligne** (l.260-269, `isStaffAt($target, $property->agency_id ??
  $actor->agency_id)`), et son code est **`user.not_in_active_agency`** depuis TCK-588 (`abort_code`), pas
  `messages.target_user_not_in_active_agency`. `AssignableAgentRule` n'existe pas (587 a fusionné avant 591).
  Sans agence déterminée (bien sans agence, acteur sans profil d'agence) la règle **ne juge rien**.
- Deux tests du dépôt fixent le défaut : `PropertyCrudTest::test_assigns_property_agent_inside_active_agency`
  (`data.owner.id` = la cible) et `PropertyAuthorizationTest::test_le_bien_ne_se_reassigne_qu_au_personnel_actif_de_l_agence`
  (`user_id` = l'agent, l.290). Ils sont réécrits sur le nouveau contrat.
- `AgentPortfolio::PENDING = ['held_properties']`, `responsible_properties` absente ; `AgentHandoverController::show`
  rend `pending`. `AgentHandoverService::move()` verrouille ses lignes, jamais le bien (relevé de verif-504).
- Seul `assignAgent` écrit `user_id` hors création (grep `'user_id' =>` dans `app/` : `store` l.96 et la
  duplication, évènement `created`). `Property` est `Auditable` (`logFillable` + `logOnlyDirty`), activitylog
  **5.1.0** : la signature est dans `attribute_changes`.
- Front : « Réassigner » en lot est toujours un `Promise.all` d'appels unitaires (`PropertyList.tsx:118-139`,
  `:359-366`) ; les motifs `invalid_target` et `unchanged` existent déjà dans `agentCrm.bulk.reason` (591). La
  ligne de la liste affiche `owner.name` derrière le libellé « Agent : » — le propriétaire sous le nom d'agent.
- Décisions neuves → [ADR-0059](../../adr/0059-changer-l-agent-responsable-et-transmettre-les-biens-a-la-passation.md)
  (commit `d56e443f`, avant le code).

### 2026-10-08 — back livré (`a8bbe7e1`, `bc3a596a`, `85adb116`)

- **Le code d'erreur** de la règle de cible est `user.not_in_active_agency` (TCK-588) — AC2 le vérifie sous ce
  nom. La règle vit dans `ResponsibleAgentAssigner::cibleAdmise()`, seul site ; **sans agence déterminée, elle
  refuse** (avant : aucune vérification, un particulier désignait n'importe quel compte).
- **Deux barrières, voulues.** Remplacer l'appel de la règle par `true` (ablation A1a) laisse le lot **vert** :
  `designate()` refuse encore, par son éligibilité (`isStaffAt` + joignable). L'unitaire rougit (le code devient
  `property.primary_not_eligible`). La double ablation (A1b : règle ET éligibilité) fait passer le bien en
  `updated` : rouge. *L'ablation demandée par AC1 seule ne rougit donc pas le lot — un autre mécanisme le couvre.*
- **`primary_contact`** est rendu par `properties.index` et `properties.assigned-agent.update` en plus de la
  forme détail, et seulement si `agency_id` et `user_id` sont chargés (sinon la règle jugerait un bien d'agence
  comme celui d'un particulier) ; l'index charge `PrimaryPropertyContact::eagerLoads()`.
- **Passation** : les biens sont verrouillés avant toute ligne (ADR-0059 §3). Course réelle à deux processus,
  base jetable `takussan_t603_race`, quatre scénarios (collision ⟂ désignation, désignation tenue ⟂ passation,
  passation tenue ⟂ désignation, deux lots croisés) : **aucun 40P01**, invariants tenus. Ablations rejouées :
  sans le verrou préalable des biens → **40P01** (2/2) ; lot sans tri des identifiants → **40P01** (2/2).
- **Réparation** prouvée sur base jetable **semée** (`takussan_t603_seed`, 856 biens, 579 baux) : 0 signature
  dans le jeu des seeders (`restored=0`) ; sur deux cas fabriqués, `--dry-run` n'écrit rien, le réel rend
  `user_id`, désigne la dernière cible, réécrit le seul brouillon, liste le bail actif ; second passage
  `restored=0` ; seuls les deux biens fabriqués changent de (titulaire, contact).
- Ablations back : 16 mutations, 15 rouges, A1a vert (ci-dessus) ; journal dans le rapport.

### 2026-10-08 — front livré (`e54112b7`), clôture

- **« Changer l'agent responsable »** part en UN appel `bulk-assign` (`bulkAssignPropertiesAction`) ; le
  `Promise.all` d'appels unitaires est retiré, et l'action unitaire `assignPropertyAgentAction` avec lui (plus
  aucun appelant ; elle mettait l'identifiant du bien dans un chemin sans le vérifier). Bilan : changés, **déjà
  suivis par l'agent** (`unchanged`, compté à part), refus motivés ; seuls les refus restent sélectionnés.
  L'action refuse sans appel tout identifiant qui n'est pas un entier positif sûr (`../1`, `1?user_id=1`, `NaN`,
  flottant, `2^53`, liste vide) — la règle de TCK-600, non fusionné, appliquée sans l'attendre.
- **Propriétaire et agent responsable** sont nommés côte à côte dans la ligne, la carte mobile et l'en-tête de
  la fiche (`ProprietaireEtResponsable`, un seul site pour la règle de lecture) : « Agent : » affichait
  `owner`. Un `primary_contact` qui EST le propriétaire (repli de TCK-502) se lit « aucun ».
  `DASHBOARD_PROPERTY_FIELDS` demande désormais `agency_id`, sans quoi l'index ne sert pas `primary_contact`
  (éprouvé côté API et côté front).
- **`invalid_target`** dit désormais « cet agent ne peut pas en être responsable (hors du personnel actif de
  l'agence, ou copropriétaire du bien) » : le motif couvre aussi le refus `co_owner` d'ADR-0059 §1.
- **Passation** : l'assistant compte et transmet `responsible_properties` et `held_properties`, dans l'ordre de
  l'API ; `pending` est vide.
- **Reste au porteur** : AC6 (vrai téléphone) ; le passage de `properties:repair-reassigned-owners` sur la
  préproduction, `--dry-run` d'abord, après déploiement — jamais joué ici (consigne : aucun environnement
  déployé).
- Ablations front : 9 mutations (`F1`-`F9`) + 2 sur la ressource (`R1`, `R2`), toutes rouges, restauration
  vérifiée par md5 ; journal dans le rapport.

### 2026-10-08 — corrections de la vérification adverse (verif-603, REFUSÉ sur `7082cd7a`)

ADR-0059 §6 amendé **avant** le code (`9c4074fe`). Chaque point a un test nommé et une ablation qui le rougit.

- **M1 — la réparation ne rend le bien qu'à un bailleur de son agence.** Sinon le bien va en `owners_to_review`
  sans aucune écriture, avec un motif : `no_agency`, `original_missing` (suppression douce comprise — m1),
  `original_not_landlord` (aucun profil bailleur non supprimé dans l'agence — v6, v10), `current_is_landlord`,
  `designated_after` (m2). La sortie, `--dry-run` compris, donne **une ligne par bien** avec ses identifiants :
  `restore property= owner=actuel->origine responsible= leases_fixed= leases_to_review=`, ou
  `review property= reason= owner= original=`.
- **m2 — une désignation postérieure n'est jamais écrasée** : une entrée `property.primary_agent_designated`
  du journal, ou une ligne marquée dont `updated_at` suit la réattribution fautive, envoie le bien en revue.
  Le journal seul couvre le cas où la ligne désignée a disparu depuis.
- **M2 — l'API dit d'où vient le contact.** `primary_contact_source` : `designated` | `invitation_order` |
  `owner` | `null`, même vocabulaire que `GET …/collaborators`, rendu là où `primary_contact` l'est et
  **jamais sur `public.*`**. L'écran lit ce champ (liste, carte mobile, en-tête de fiche) et ne compare plus
  `owner.id` à `primary_contact.id` : un agent qui a saisi le bien et en est l'agent marqué se lit
  responsable. Le repli sur le propriétaire (`owner`) se lit « aucun » — ADR-0036 : le responsable est la ligne
  `agent`. Source absente : la moitié « responsable » ne s'affiche pas.
- **m4 — N+1 de l'index.** L'agence (logo, moyenne des avis) est préchargée et les paires d'appartenance de
  la page sont amorcées le temps du rendu (`MembershipCapabilityResolver::primed()`, vidée en `finally`).
  Sur 20 lignes, le surcoût d'`agency_id` passe de 120 requêtes à 6 ; `PropertyIndexQueryBudgetTest` le borne
  à 8 et vérifie que la ligne amorcée rend ce que rend la fiche.
- **m5 — les quatre mutations survivantes ont leur test** : agence du bien prioritaire sur celle de l'acteur
  (V2), profil bailleur supprimé qui n'exclut pas un bien saisi (V3), bail antérieur à la réattribution non
  touché (V4) ; dans le lot, une `ApiError` hors refus de cible annule tout (V5) quand les refus de cible,
  quel qu'en soit le motif, sont rangés ligne à ligne. Plus le lot sur un bien sans agence (A1a, resté vert à
  la première passe).
- **m3 — fermé localement.** Les biens touchés par `responsible_properties` et `held_properties` sont relus
  sans verrou puis comparés à l'ensemble verrouillé ; ceux des collaborations, après le verrou des lignes. Un
  bien apparu après le verrou refuse la passation entière en `409 agency_member.handover_conflict` (rien n'est
  transmis) au lieu de verrouiller un bien hors ordre. Course réelle sur base jetable `takussan_t603_race2`
  (harnais de verif-603) : 2/2 sans 40P01, la passation refuse, la désignation concurrente passe ; ablation du
  refus → **40P01** 2/2, comme la reproduction.
- **En suite** : m6 (le sélecteur propose des bailleurs et omet les agents absents de la page).
