# ADR-0059 — Changer l'agent responsable passe par un seul service ; la passation verrouille les biens avant les lignes ; seule l'ancienne réattribution porte la signature que la réparation lit

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-603](../backlog/tickets/TCK-603-agent-responsable-bulk-assign-et-biens-a-la-passation.md)
- **Applique** : [ADR-0036](0036-l-agent-responsable-est-le-collaborateur-principal.md) (l'agent responsable est le
  collaborateur `agent` principal) et [ADR-0053](0053-l-agent-principal-est-une-marque-unique-par-bien.md) (la marque
  et son service de désignation)

## Contexte

Relu sur `dev` à `ddc8f8e4` (2026-10-08), après la fusion de TCK-504.

- ADR-0036 décide **quoi** : l'agent responsable est la marque de TCK-504, `properties.user_id` reste le
  propriétaire, `ResponsibleAgentAssigner::assign()` est le seul service, et la passation transmet
  `responsible_properties` et `held_properties`. Il ne dit pas **comment** quatre points se tiennent sous
  concurrence et dans le temps :
  1. **L'ordre des verrous de la passation.** `AgentHandoverService::move()` (TCK-591) verrouille ses lignes de
     collaboration (`FOR UPDATE`) sans jamais prendre le verrou du bien ; `PrimaryAgentDesignator` prend le
     bien **puis** les lignes. verif-504 a mesuré que désigner un principal **après** les lignes de la passation
     créerait l'ordre lignes → bien, inverse du service : un interblocage (`40P01`) possible.
  2. **Le cas de collision** (ADR-0053, « Conséquences ») : le repreneur collabore déjà au bien, la ligne du
     partant est supprimée, et sa marque tombe dans le repli au lieu de passer au repreneur.
  3. **Ce qui distingue un bien « du partant ».** `held_properties` est `user_id = le partant` ; or un membre du
     personnel peut aussi être **bailleur** de la même agence, et ses propres biens portent le même `user_id`.
  4. **La signature que la réparation lit.** `activity_log` `Property` / `updated` / `old.user_id ≠
     attributes.user_id` n'a été écrite, jusqu'ici, que par `assignAgent` (grep des écritures de `user_id` :
     `PropertyController::store` et la duplication la posent à la création, évènement `created`). Les deux
     nouvelles écritures de `user_id` — la passation et la réparation elle-même — la reproduiraient si elles
     passaient par le journal du modèle, et la réparation **annulerait la passation** au passage suivant.
- La règle de cible de TCK-587 vit en ligne dans `assignAgent` (`isStaffAt($target, $property->agency_id ??
  $actor->agency_id)`), et **ne juge rien** quand aucune agence n'est déterminée : un particulier pouvait
  désigner n'importe quel compte.

## Décision

### 1. Un seul service, une seule règle de cible

`App\Services\Property\ResponsibleAgentAssigner::assign(Property $property, User $target, ?User $actor):
ResponsibleAgentAssignment` — `?User` parce que la commande de réparation n'a pas d'acteur (même choix que
`PrimaryAgentDesignator`). Dans l'ordre :

1. `DB::transaction`, puis `Property::whereKey()->lockForUpdate()` (piège PostgreSQL n° 2) — le verrou est
   réentrant dans la transaction d'un appelant qui l'a déjà pris.
2. **La règle de cible** : `ResponsibleAgentAssigner::cibleAdmise(Property, User, ?User $actor): bool` —
   personnel **actif** (`isStaffAt`) de l'agence du bien, à défaut de celle du profil actif de l'acteur ;
   **sans agence déterminée, refus**. C'est la seule méthode qui l'écrit, appelée par `assign()` — donc par
   l'unitaire, le lot, la passation et la réparation. Refus : `422 user.not_in_active_agency` (le code que
   TCK-588 a donné à la règle de 587).
3. La ligne de la cible, relue sous le verrou :
   - absente → créée, `role = agent`, `invited_at = now()` ;
   - `viewer` ou `manager` → passe en `agent` (ADR-0036 §2), sous le verrou du bien déjà tenu — c'est la
     condition d'O6 (verif-504) : une écriture de rôle sans le verrou du bien rouvrirait la 23514 ;
   - `co_owner` → `422 property.responsible_agent_co_owner`, rien n'est écrit ;
   - `agent` → rien.
4. `PrimaryAgentDesignator::designate()` — qui juge l'éligibilité (`422 property.primary_not_eligible`), déplace
   la marque, journalise `property.primary_agent_designated` et invalide la fiche publique.
5. `changed = false` (la cible portait déjà la marque) : aucune écriture, aucun journal. Sinon,
   `activity('Property')`, évènement **`responsible_agent_changed`** : `agency_id`, `property_id`,
   `previous_user_id` (qui répondait avant, marque ou repli), `user_id`, `previous_role` (si la ligne existait
   sous un autre rôle), `row_created`.
6. Il n'écrit **jamais** `properties.user_id`.

Un refus est une `ApiError` : toute écriture faite avant (ligne créée, rôle changé) est annulée avec la
transaction du service — un point de sauvegarde quand l'appelant en a ouvert une.

### 2. Le lot

`POST /api/properties/bulk-assign` (`property_ids` 1 à 100, distincts ; `user_id`), sur le modèle de
`bulk-visibility` : chaque ligne passe `update` de `PropertyPolicy` (la règle de l'unitaire), puis le service.

- **Une transaction pour le lot, un point de sauvegarde par bien.** Une `ApiError` de règle (cible refusée,
  co-propriétaire, inéligible) annule son seul bien et le range en `failed` / `invalid_target` ; toute autre
  exception annule le lot entier.
- **Les biens sont traités par identifiant croissant** : deux lots qui se recouvrent prennent leurs verrous
  dans le même ordre, sans cycle.
- **Bilan en codes** : `updated` / `updated_ids`, `unchanged` / `unchanged_ids` (cible déjà responsable),
  `failed` (`not_found | forbidden | invalid_target`).

### 3. La passation : les biens d'abord, les lignes ensuite

Deux catégories s'ajoutent aux transmissibles, avec leurs requêtes dans `AgentPortfolio` :

- **`responsible_properties`** : les biens de l'agence dont la ligne `agent` **marquée** est celle du partant.
  Transmises par `ResponsibleAgentAssigner` vers le repreneur. La marque, et non le repli : c'est le choix de
  l'agence qui se transmet ; un bien sans marque suit sa ligne de collaboration (catégorie `collaborations`),
  et le repli avec elle.
- **`held_properties`** : les biens de l'agence dont `user_id` = le partant, **sauf s'il porte un profil
  propriétaire de l'agence** (non supprimé, quel qu'en soit le statut) — alors aucun : ses biens ne se
  distinguent pas, par la colonne, de ceux qu'il a saisis, et la règle « jamais d'un bailleur » l'emporte.
  Transmises par l'écriture de `user_id` ← repreneur, que la requête a déjà jugé personnel actif de l'agence ;
  **jamais vers un repreneur qui porte un profil propriétaire de l'agence** (« jamais vers un bailleur ») : les
  biens restent alors au partant et sont comptés désassignés.

**L'ordre des verrous** : avant toute catégorie, la passation verrouille **en une requête, par identifiant
croissant**, tous les biens que touchent `responsible_properties`, `held_properties` et `collaborations`
(celles qui ont un repreneur) ; puis elle traite, dans cet ordre, `tasks`, `visits`, `maintenance` (aucune ne
verrouille un bien ni une ligne de collaboration), `responsible_properties`, `held_properties`,
`collaborations` et `customers`. Elle prend donc bien → lignes,
l'ordre du service et du contrôleur des collaborateurs — jamais lignes → bien. Deux passations simultanées
verrouillent leurs biens dans le même ordre.

**La collision** : une ligne du partant **marquée** dont le repreneur collabore déjà au bien voit la marque
passer à la ligne du repreneur par `ResponsibleAgentAssigner` (sous le verrou déjà tenu), **puis** est
supprimée. Un repreneur `co_owner` du bien est refusé par le service : la ligne est supprimée et la marque
tombe dans le repli, comme avant — le bien est compté dans `unassigned.collaborations`.

### 4. La signature de réparation n'appartient qu'à l'ancien `assignAgent`

Toute écriture de `properties.user_id` hors création se fait **journal du modèle coupé**
(`$property->disableLogging()`), et se journalise sous son propre évènement :

- la passation : `activity('AgentHandover')`, catégorie `held_properties`, avec les identifiants ;
- la réparation : `activity('Property')`, évènement `property.owner_restored`.

Les observateurs du modèle (invalidation de la fiche publique, index) continuent de tourner. La signature
`Property` / `updated` / `old.user_id ≠ attributes.user_id` reste donc, dans toute base, la trace de l'ancien
geste et d'elle seule.

### 5. La réparation

`properties:repair-reassigned-owners {--dry-run}`. Pour chaque bien qui porte la signature (chaîne lue par
`activity_log.id` croissant) :

- le **titulaire d'origine** est la première valeur `old.user_id` ; la **dernière cible**, la dernière valeur
  `attributes.user_id` ; les **cibles**, toutes les valeurs `attributes.user_id` différentes du titulaire
  d'origine ;
- un bien dont `user_id` vaut déjà le titulaire d'origine n'est pas touché (idempotence) ; un titulaire
  d'origine qui n'existe plus est listé (`owners_to_review`), jamais deviné ;
- sinon : `user_id` ← titulaire d'origine ; la dernière cible devient responsable par le service si elle est
  encore personnel actif de l'agence (un refus du service est compté, pas propagé) ; les baux du bien créés
  à partir de la première réattribution dont `landlord_id` est une cible : `draft` → `landlord_id` rétabli ;
  tout autre statut **listé, jamais réécrit**.
- Une transaction par bien. Sortie : `restored`, `responsible_set`, `leases_fixed`, `leases_to_review` (avec
  identifiants), `owners_to_review`. `--dry-run` n'écrit rien et annonce les mêmes comptes.

### 6. Amendements de la vérification adverse (verif-603, 2026-10-08)

**La réparation ne rend un bien qu'à un bailleur** (§5 resserré, M1, m1, m2). `user_id` vaut aussi l'agent
qui a saisi le bien (`PropertyController::store`), et l'ancien « Réattribuer » servait parfois à rendre un bien
saisi à son vrai bailleur. Rétablir « la première valeur `old` » sans la juger rendait donc le bien à un agent,
parti compris, et réécrivait le bail brouillon du bailleur à son nom. Un bien n'est restauré **que si** toutes
ces conditions tiennent ; sinon il est listé dans `owners_to_review` avec son motif, **sans aucune écriture** :

| Motif | Condition |
|---|---|
| `no_agency` | le bien n'a pas d'agence : rien ne dit si l'origine est un bailleur |
| `original_missing` | le titulaire d'origine n'existe plus, **suppression douce comprise** |
| `original_not_landlord` | il ne détient aucun profil propriétaire **non supprimé** dans l'agence du bien |
| `current_is_landlord` | le titulaire actuel détient lui-même un tel profil : le dernier geste a pu être un transfert légitime entre bailleurs |
| `designated_after` | la marque `is_primary` du bien a été posée ou changée après la première réattribution fautive (journal `property.primary_agent_designated` postérieur, ou ligne marquée dont `updated_at` l'est) : la réparation n'écrase pas un choix de l'agence |

`--dry-run` et le passage réel impriment **une ligne par bien** : `restore` (bien, titulaire actuel → d'origine,
responsable désigné, baux rétablis, baux à reprendre) ou `review` (bien, motif, titulaires actuel et d'origine).

**La source du contact est rendue par l'API** (M2). Un agent qui a saisi un bien (`user_id` = lui) et en est
l'agent principal produit `owner.id = primary_contact.id` : l'égalité d'identifiants ne dit pas d'où vient le
contact. `PropertyResource` rend `primary_contact_source` — `designated` (la ligne marquée), `invitation_order`
(le repli sur l'ordre d'invitation), `owner` (le repli sur le titulaire), `null` (personne) — sous la même
condition que `primary_contact`, **jamais sur une route `public.*`** (une donnée d'organisation d'agence). Le
vocabulaire est celui de `GET …/collaborators` ; l'écran lit ce champ, jamais une égalité d'identifiants.

**L'index précharge ce que `primary_contact` juge** (m4). Le personnel (`isStaffAt`), l'agent (`isAgentAt`) et
le bailleur (`isOwnerAt`) d'une page se jugent en trois requêtes, pour les seuls couples (utilisateur, agence)
de la page, le temps de sérialiser la page (`MembershipCapabilityResolver::primed()`), puis l'amorce est
effacée : hors de ce rappel, chaque jugement reste une requête.

**Une passation ne verrouille jamais un bien hors de son ensemble** (m3, complète §3). Entre le verrou des
biens et le traitement des lignes, un bien peut entrer dans le portefeuille du partant (une ligne validée entre
les deux). Le traiter imposerait un verrou de bien après des lignes, l'ordre exclu. Les catégories de biens ne
traitent donc que l'ensemble verrouillé, et **si le portefeuille de biens a changé** depuis, la passation est
refusée en `409 agency_member.handover_conflict` — elle n'a rien écrit et se rejoue.

## Options écartées

- **Désigner après les lignes, dans la passation** (ce que suggérait la lecture littérale de verif-504) :
  l'ordre lignes → bien est celui qui interblocke avec `designate()`. Le prendre avant ne coûte qu'une
  requête et ferme le cycle.
- **Ne verrouiller que les biens de `responsible_properties`** : le cas de collision de `collaborations`
  désigne aussi, et le ferait sous verrou de ligne.
- **Une catégorie `responsible_properties` lue par le repli** (`PrimaryPropertyContact::for() = partant`) :
  une requête impossible à compter en SQL (l'éligibilité est jugée en PHP, une requête par agent), et un
  bien sans marque suit déjà sa ligne de collaboration.
- **Écrire `user_id` par le journal du modèle** dans la passation et la réparation : la réparation relirait
  la passation comme une réattribution et rendrait le bien au partant.
- **Restaurer aussi un bien sans agence** (verif-603 le proposait) : l'origine d'un bien de particulier ne se
  distingue pas, par aucune colonne, d'un compte quelconque ; la liste coûte une vérification à la main.
- **Traiter les lignes apparues après le verrou en verrouillant leurs biens à ce moment** : bien après lignes
  et hors de l'ordre croissant de l'ensemble — deux interblocages possibles pour un cas rare ; le refus
  rejouable est plus simple et ne laisse rien à moitié fait.
- **Garder « aucune vérification » sans agence déterminée** : un particulier désignait n'importe quel compte
  comme contact de son annonce, et son téléphone sortait par `GET …/contact`.

## Conséquences

- Les quatre chemins (unitaire, lot, passation, réparation) jugent la cible au même endroit ; une ablation de
  la règle n'ouvre pourtant pas la porte à elle seule : `designate()` juge l'éligibilité, au même prédicat
  `isStaffAt`. Deux barrières, voulues — l'ablation est documentée dans le ticket.
- La passation tient les biens qu'elle touche jusqu'à sa validation : une modification concurrente d'un de ces
  biens attend. C'est un geste rare d'administrateur.
- Un membre du personnel qui est aussi bailleur de l'agence ne transmet aucun bien par `held_properties` ; ce
  qu'il a saisi pour l'agence reste à son nom jusqu'à un geste manuel. Compté zéro, il ne bloque pas son
  retrait. Aucun geste de l'API ne permet aujourd'hui ce transfert manuel : c'est un cas à traiter à la main
  en base, ou par un ticket, s'il se présente.
- `docs/models-spec.md` et `docs/features.md` ne décrivent ni `bulk-assign`, ni les deux catégories :
  `/sync-specs` après fusion.

## Application

- `App\Services\Property\ResponsibleAgentAssigner`, `ResponsibleAgentAssignment`,
  `PropertyController::assignAgent` (corps), `PropertyController::bulkAssign`,
  `App\Http\Requests\PropertyBulkAssignRequest`, `App\Services\Property\PropertyBulkAssignService`,
  `App\Services\Agency\AgentPortfolio`, `App\Services\Agency\AgentHandoverService`,
  `App\Console\Commands\RepairReassignedOwners`.
- Tests : `PropertyReassignmentKeepsOwnerTest`, `PropertyBulkAssignTest`, `RepairReassignedOwnersCommandTest`,
  `AgentHandoverPropertiesTest` ; la course passation ⟂ désignation se rejoue hors PHPUnit, à deux processus,
  sur une base jetable (notes du ticket).
