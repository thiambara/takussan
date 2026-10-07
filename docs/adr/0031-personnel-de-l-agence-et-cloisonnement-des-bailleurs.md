# ADR-0031 — Le personnel de l'agence et le cloisonnement des bailleurs ; capacités sans lecteur

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-587](../backlog/tickets/TCK-587-cloisonnement-bailleurs-capacites-jamais-lues.md)
- **Précise** : le principe non négociable n° 2 (« l'agence est la frontière d'isolation »),
  [ADR-0002](0002-role-est-un-profil-polymorphe.md) et [ADR-0003](0003-capacites-enum-code-defined.md).

## Contexte

Le principe n° 2 dit qu'une capacité se juge pour un couple *(utilisateur, agence)*. Il ne dit pas
**qui, dans l'agence, a le périmètre de l'agence**, et le code a répondu « tout le monde » sans
l'avoir décidé. Mesuré sur `dev` (`32dd0b39`, re-mesure de l'analyse du 2026-10-06) :

- `User::getAgencyIdAttribute()` rend l'agence du profil actif **quel que soit son type**, donc aussi
  d'un `OwnerProfile`. Les policies de onze ressources (bail, loyer, versement, facture, réservation,
  document, état des lieux, visite, bien, client, garant) accordent lecture et écriture sur
  `$user->agency_id === $model->agency_id`, et six `index` filtrent par
  `orWhere('agency_id', $user->agency_id)`. Un bailleur rattaché à une agence lit et modifie les
  baux, loyers et versements **de tous les autres bailleurs de cette agence** ; il marque « traité »
  son propre versement (`PayoutPolicy::update`).
- Le dépôt avait déjà reconnu ce défaut et fermé deux instances (messagerie, TCK-565 ; exports), pas
  la classe. Les tests ne le voient pas : le shim `User::setAgencyIdAttribute()` fabrique un
  `OwnerProfile`, et ≥ 155 fixtures `User::factory()->create(['agency_id' => X])` nomment `$agent`
  un bailleur.
- Un profil **suspendu** garde tout : `MembershipCapabilityResolver::roleAllows()` lit le rôle de
  tout profil du user dans l'agence sans filtre de statut, `isAgentAt()` / `isAgencyAdminAt()` /
  `isOwnerAt()` ne filtrent que `deleted_at`, et l'auto-bascule de `ResolveActiveProfile` comme le
  repli de `getAgencyIdAttribute()` retiennent un profil quel que soit son statut — alors que le
  chemin explicite (`ActiveProfileResolver::resolve()`) le refuse.
- Sur les 45 cas de `Capability`, **31 n'atteignent aucune décision** : ni `canActAt()`, ni
  `can('x.y')`, ni une méthode `*Capability()` dont l'ability est réellement invoquée. L'éditeur de
  rôles les sert toutes ; retirer `payouts.approve` à un rôle n'y change rien.

## Décision

**Le périmètre d'une agence appartient à son personnel actif ; un bailleur n'a que ses propres
ressources ; un profil non actif ne confère rien ; et toute capacité du catalogue est soit jugée par
un geste, soit inscrite à un inventaire qui ne peut que décroître.**

### 1. Le personnel de l'agence — un seul prédicat

Est **personnel** de l'agence *A* l'utilisateur qui, *A* étant l'agence de son profil actif
(contrat de TCK-146 : `User::$agency_id`, profil actif puis auto-bascule), y détient :

- un `AgentProfile` ou un `AgencyAdminProfile` **actif** (`scopeActive`) ; **ou**
- une `RoleDelegation` **active** (`RoleDelegation::scopeActive`) de rôle `agent` ou `agency_admin`
  dans *A*.

La délégation compte : sans elle, une délégation `agent` conférerait des capacités (TCK-395) que
le périmètre rendrait inutilisables. Ce n'est pas un élargissement : une délégation n'a d'effet que
dans l'agence d'un profil que le délégué y possède déjà.

Le prédicat s'écrit **une fois** : `MembershipCapabilityResolver::staffAgencyId(User): ?int`, qui
rend l'agence du profil actif si l'utilisateur y est personnel, sinon `null` ; `User::staffAgencyId()`
en est le relais. Toute clause de périmètre d'agence le lit ; aucune ne réécrit l'expression.
`MessagingReach::isActiveStaffAt()` y est rebranché.

Le profil actif n'a pas besoin d'être lui-même un profil de personnel : un utilisateur à la fois
bailleur et agent de *A* est personnel de *A* quel que soit celui des deux profils que
l'auto-bascule a retenu.

### 2. Le bailleur est cloisonné à ses ressources

À l'intérieur d'une agence, **un bailleur ne voit et ne touche que ce qui le désigne** :
`landlord_id`, `property.user_id`, `created_by_id`, `issued_by_id`, `added_by_id`. Les ressources
d'un autre bailleur de la même agence lui sont étrangères, au même titre que celles d'une autre
agence. C'est une **précision** du principe n° 2, pas une exception : l'agence reste la frontière
d'isolation entre agences, et le personnel est ce qui la franchit à l'intérieur.

Les collaborateurs d'un bien (`co_owner`, `viewer`) restent hors du périmètre ici décidé.

Conséquences d'application retenues par défaut (le porteur a donné son feu vert le 2026-10-07) :

- **Le bénéficiaire ne gère jamais son propre versement**, même s'il est aussi personnel ; dans une
  agence `individual`, l'hôte à la fois admin et bailleur ne marque pas ses propres versements.
- **Le bailleur propose un bien à son agence** : `POST /api/properties` lui crée un brouillon privé
  (`draft` + `private` imposés), qu'il ne peut ni publier ni rendre public ; le personnel tenant
  `properties.publish` le publie, et les admins actifs de l'agence sont notifiés.
- **Annuler une facture exige `invoices.write_off`**, l'envoyer `invoices.send`, la marquer payée
  `payments.record` : finance réservée selon `docs/features.md` §2.5.
- **Exporter le CRM, les paiements, les baux ou les biens exige `crm.export`, `payments.export` ou
  `reports.export`** ; chaque export est journalisé. Le bailleur garde l'export de *ses* biens et
  baux.
- **Suspendre un membre se fait dans l'agence**, jamais sur le compte : la suspension pose le statut
  non actif sur ses profils de l'agence et révoque les jetons dont le profil actif y est ; bloquer un
  compte (`users.status`) redevient un geste du super-admin seul.

### 3. Un profil non actif ne confère rien

Un profil `suspended`, `draft`, `inactive`, `blocked` ou `archived` ne confère **ni capacité**
(`roleAllows()` ne lit que les profils `->active()`), **ni périmètre** (`staffAgencyId()`),
**ni rôle au sens d'`isAgentAt()` / `isAgencyAdminAt()` / `isOwnerAt()`**, **ni auto-bascule**
(`ResolveActiveProfile` et le repli de `getAgencyIdAttribute()` appliquent la règle du chemin
explicite). Les sites qui testent une **appartenance** et non un droit — doublon d'invitation,
réactivation, liste d'équipe, visibilité de l'agence — emploient `hasProfileAt()`, sans filtre de
statut, et le disent. La suspension prend effet à la requête suivante, sans cache à invalider.

### 4. Capacités sans lecteur : un inventaire, une garde, un cliquet

Un cas de `Capability` est **lu** s'il atteint une décision : `canActAt(Capability::X)`,
`can('x.y')`, ou une méthode `*Capability()` de policy **dont l'ability est invoquée**. Un nom de
route, un docblock, une liste blanche de `resolvePlatform()` ne lisent rien.

Chaque cas est **soit lu, soit inscrit** à `App\Services\Membership\CapabilityEnforcementInventory::AWAITING`
avec le ticket (ou la dette) qui le branchera — jamais les deux, jamais aucun.
`scripts/check-capability-readers.mjs` le vérifie à chaque PR et porte un cliquet bilatéral sur la
taille de l'inventaire : il ne peut que décroître, et une baisse doit être déclarée. Le ticket qui
branche une capacité retire sa ligne dans le même commit. `GET /api/capabilities` expose
l'inventaire (`not_enforced`) et l'éditeur de rôles le dit (« sans effet pour l'instant ») ; une
capacité inscrite reste cochable, on prépare un rôle.

Les capacités **sans aucun geste** (`agency.update`, `agency.upgrade_request`, `payments.refund`,
`messaging.broadcast`, `messaging.archive`) restent au catalogue, inscrites au nom de la dette
**D-69** ; les deux réservées plateforme (`properties.moderate`, `reports.view_global`), au nom de
leur réserve.

## Alternatives écartées

- **Filtrer par type de profil actif** (« le profil actif est-il un `AgentProfile` ? ») : un agent
  qui est aussi bailleur de la même agence perdrait son périmètre quand l'auto-bascule retient
  l'`OwnerProfile` (elle retient le premier de la liste). Le prédicat regarde ce que l'utilisateur
  *est* dans l'agence active, pas le profil qui l'y a fait entrer.
- **Garder le bailleur dans le périmètre et le restreindre par capacité** (`leases.view_all`…) :
  il n'y a pas de capacité de lecture au catalogue (ADR-0003, `BasePolicy`) et en inventer une par
  ressource aurait doublé le catalogue pour exprimer une règle d'appartenance.
- **Retirer toute création de bien au bailleur** : l'état vide de son tableau de bord l'y pousse
  déjà, et l'hôte d'une agence individuelle en dépend. La proposition en brouillon privé garde le
  geste sans court-circuiter la relecture.
- **Limiter l'export de l'agent à ses clients (`added_by_id`)** : l'export est un geste de
  direction (§2.5) ; le réduire au périmètre propre aurait gardé la fuite des encaissements.
- **Supprimer du catalogue les capacités sans geste** : un rôle personnalisé qui les porte perdrait
  une ligne en base pour une décision qui n'est pas prise. L'inventaire les signale sans les retirer.
- **Laisser un membre suspendu agir et le dire dans un commentaire** (`AgencyController`, renvoi à
  TCK-278, clos sans l'avoir pris) : c'est l'état mesuré, et il rend la suspension décorative.

## Conséquences

- **Les fixtures qui fabriquent un « agent » par `['agency_id' => X]` deviennent fausses** : elles
  fabriquent un bailleur. Elles se corrigent par `withAgentProfile($agency)` ou un profil admin
  explicite — **jamais** en rendant au bailleur un accès pour faire reverdir un test.
- Le personnel n'est plus défini par l'agence du profil actif seule : un compte multi-agences sans
  profil actif n'a aucun périmètre, comme avant ; un compte dont tous les profils de l'agence sont
  suspendus n'en a plus, ce qui est nouveau et voulu.
- Les rôles personnalisés retrouvent un sens sur 15 capacités qui n'avaient aucun effet : un agent
  du rôle système **perd** l'export, l'annulation de facture, la suppression d'un bien et la
  modification du bien d'un collègue (`properties.update_any`), qu'il avait sans les tenir.
- Un geste neuf qui porte un périmètre d'agence passe par le prédicat ;
  `scripts/check-agency-scope-clause.mjs` refuse toute comparaison de `$user->agency_id` à un
  `->agency_id` qui ne l'emploie pas, sauf exemption nommée (`fichier::méthode → TCK-NNN`), refusée
  si elle est morte, sous un cliquet bilatéral.

## Application

- Prédicat : `app/Services/Membership/MembershipCapabilityResolver.php::staffAgencyId()`,
  relais `User::staffAgencyId()`.
- Profils non actifs : `roleAllows()`, `HasProfiles::isOwnerAt|isAgentAt|isAgencyAdminAt`,
  `ResolveActiveProfile` (auto-bascule), `User::getAgencyIdAttribute()` (repli).
- Inventaire : `app/Services/Membership/CapabilityEnforcementInventory.php`, exposé par
  `CapabilityController::index` (`not_enforced`).
- Gardes (Repo CI) : `scripts/check-agency-scope-clause.mjs`, `scripts/check-capability-readers.mjs`,
  toutes deux auto-éprouvées à chaque invocation.
- Tests : `OwnerIsolationWithinAgencyTest`, `InactiveProfileGrantsNothingTest`,
  `BranchedCapabilitiesTest`, `StaffAgencyIdTest`.
