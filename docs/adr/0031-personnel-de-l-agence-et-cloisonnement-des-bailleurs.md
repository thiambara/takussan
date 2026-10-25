# ADR-0031 — Le personnel de l'agence et le cloisonnement des bailleurs ; capacités sans lecteur

- **Statut** : Accepté, **amendé le 2026-10-24** (cf. § *Amendement du 2026-10-24 — délégations,
  colonnes d'auteur, colonnes de bailleur*) et **le 2026-10-25** (cf. § *Amendement du 2026-10-25 —
  l'accès suit l'appartenance*, et § *Amendement du 2026-10-25 — le contact d'un bail ou d'une
  réservation est une fiche de l'agence du bien*)
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
- une `RoleDelegation` **en vigueur** (`RoleDelegation::scopeEnVigueur`) de rôle `agent` ou
  `agency_admin` dans *A*.

La délégation compte : sans elle, une délégation `agent` conférerait des capacités (TCK-395) que
le périmètre rendrait inutilisables. Ce n'est pas un élargissement : une délégation n'a d'effet que
dans l'agence d'un profil **actif** que le délégué y possède déjà. *Amendé le 2026-10-24 : la
version d'origine disait « une délégation active (`scopeActive`) » et « un profil que le délégué y
possède », sans condition de statut ; voir l'amendement, § A.*

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

Précisions décidées par la session après la vérification adverse (2026-10-07) :

- **Suspendre ou réactiver un administrateur exige d'être soi-même admin actif de l'agence**
  (`isAgencyAdminAt`). `team.suspend` suffit pour le reste de l'équipe. Sans cette précision, la
  capacité déléguée à un rôle d'agent lui permettait d'écarter les admins non principaux.
- **Suspendre et réactiver sont symétriques.** Suspendre ne touche que les profils `active`.
  Réactiver ne touche que ceux qu'une suspension a posés : `suspended` pour l'agent et l'admin,
  `blocked` pour le bailleur. Une invitation `draft`, un profil `inactive` ou `archived` restent tels
  quels, et la demande rend 422 s'il n'y a rien à changer.
- **Un bailleur suspendu (`blocked`) dans une agence garde la lecture de ses baux et loyers** : il
  reste partie au contrat. **Il y perd les écritures** : encaisser, modifier, renouveler, résilier,
  réviser, créer un bail. Ses droits de bailleur reposent sur l'identité (`landlord_id`) ; la
  suspension les borne à la lecture dans l'agence qui l'a suspendu, et ne change rien ailleurs.

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

## Amendement du 2026-10-24 — délégations, colonnes d'auteur, colonnes de bailleur

Décisions du porteur du 2026-10-24 sur les angles 217 et 218 du fichier de pistes
(`docs/plans/2026-10-15-pistes-d-amelioration.md`). Relevé sur `54f0f14b4`.

Les trois parties ont une même cause. Un membre suspendu (`TeamMemberSuspensionService`) ou retiré
(`AgencyMemberRemovalService`) n'est plus personnel au sens du § 1. Pourtant, il garde ce qu'une
autre voie lui ouvre : sa délégation, la colonne qui le nomme auteur d'une ligne, ou la colonne de
bailleur que la saisie d'un bien lui a donnée.

### A. Une délégation ne confère rien à un délégué sans profil actif (P218.01, P218.02, P218.05 b)

**Constat.**

- Le § 3 dit qu'un profil non actif ne confère rien, mais aucun lecteur des délégations ne regarde
  les profils du délégué.
- La suspension ne touche que les profils, et ses délégations restent `active`. Le retrait, lui,
  les révoque (`AgencyMemberRemovalService.php:93-98`).
- Les lecteurs qui confèrent un droit à partir d'une délégation sont les suivants. Les deux derniers
  points vont hors du résolveur :
  - **le résolveur** `MembershipCapabilityResolver` :
    - `loadActiveDelegations` (l. 330-338), qui alimente les capacités (`delegationAllows`,
      l. 251) ;
    - la branche délégation d'`isStaffAt` (l. 486-491), donc aussi `staffAgencyId()`,
      `isMemberAt()` et `memberAgencyIds()` ;
    - l'amorce `primed` (l. 525-527) ;
    - `staffAgencyIds` (l. 588-592) ;
  - **`ContactLeadService::delegues`** (l. 117-131). Il range les délégués parmi les destinataires
    d'une demande de contact, filtrés par `joignable` seul : **un agent suspendu reçoit les
    demandes** ;
  - **`PayoutApprovers::holders`** (l. 36-39). Les délégués y sont des candidats, filtrés ensuite
    par le résolveur : **un agent suspendu délégué approuve un reversement** ;
  - **`AgentAvailability`** (l. 31, 49, 68). Il lit les absences, puis juge le remplaçant par
    `isStaffAt`.
- `RoleDelegationService::create` (l. 72-77) accepte un délégué par `hasProfileAt`, sans filtre de
  statut. `ProcessRoleDelegationsJob` (l. 20-21) active une délégation planifiée sans juger le
  délégué.

**Décision (voie « lecture », option a de P218.01).**

1. **Une délégation est en vigueur** si elle est `active()` et si, dans l'agence de la délégation,
   son délégué détient un profil d'agence **actif** : `AgentProfile`, `AgencyAdminProfile` ou
   `OwnerProfile`, selon le `scopeActive` de chacun. La règle s'écrit **une fois** :
   `RoleDelegation::scopeEnVigueur()`.
2. **Tout site qui confère un droit à partir d'une délégation lit `enVigueur()`** :
   - les quatre sites du résolveur ;
   - `ContactLeadService::delegues` ;
   - `PayoutApprovers::holders`. Le résolveur le couvrirait déjà, mais la règle n'a qu'une
     écriture ;
   - les trois lectures d'`AgentAvailability`.

   Les sites qui ne font que rassembler des agences candidates et laissent `isStaffAt` trancher
   n'ont rien à changer : `ProviderEligibility::staffAgencyIds` (l. 83) et
   `TwoFactorRequirement::requiredAtAgency` (l. 43).
3. **`active()` reste la règle du cycle de vie** : liste et état des délégations
   (`RoleDelegationController`), activation et expiration (`ProcessRoleDelegationsJob`), révocation
   au retrait, chevauchement des absences (`AgentAbsenceService`, l. 63), et
   `HasProfiles::hasActiveAgencyDelegation`. Ce dernier n'a aucun appelant de production : il sert
   aux tests qui distinguent « la ligne est active » de « le privilège est ouvert ».
4. **La réactivation rend la délégation sans geste de plus.** La suspension ne touche pas la
   délégation, et sa fenêtre court toujours. Si elle échoit pendant la suspension, le job l'expire
   comme les autres.
5. **Créer une délégation vers un délégué sans profil actif reste permis** (option a de P218.02).
   La délégation est inerte jusqu'au retour du délégué, selon le § 3. Une délégation planifiée
   pendant une suspension peut donc préparer un retour. `RoleDelegationService::create` garde
   `hasProfileAt`, un test d'**appartenance** au sens du § 3, et son commentaire le dit en citant ce
   paragraphe. **P218.05 b** (le job active une délégation planifiée vers un délégué suspendu) n'a
   rien de propre : la délégation activée reste inerte.

Le § 1 est amendé en conséquence (« en vigueur », « un profil **actif** que le délégué y possède »).

### B. L'auteur d'une ligne n'en garde que ce que son appartenance lui laisse (P218.03, P218.04, P218.05 a, garants de P217.05)

**Constat.** Plusieurs policies ont une branche « auteur » sans condition d'appartenance. Un agent
suspendu ou retiré lit et modifie donc ce qu'il a saisi :

- `InvoicePolicy` : `view` (l. 39) et `update` (l. 56), sur `issued_by_id` ;
- `PayoutPolicy::view` (l. 41), sur `issued_by_id` ;
- `BookingPolicy::view` (l. 37), sur `created_by_id` ;
- `InventoryPolicy` : `view` (l. 32), sur `conducted_by`, et `update` (l. 56), où
  `landlordWrites(conducted_by)` laisse passer l'agent pur ;
- `InvitationPolicy::view` (l. 66), sur `invited_by` ;
- `GuarantorPolicy::view` (l. 32), sur `added_by_id`. `update` et `delete` s'en remettent à `view` :
  l'agent qui a saisi des garants lit, modifie et supprime leurs nom, téléphone et courriel.

Les listes reprennent les mêmes branches : `InvoiceController.php:26`, `PayoutController.php:32`,
`BookingController.php:30`, `InventoryController.php:47` et `GuarantorController.php:25`.

`CustomerPolicy` a déjà la règle depuis TCK-591 : `isAuthorStillMember` (l. 43-48).

**Décision : une règle d'auteur.**

1. **La branche « auteur d'une ligne » d'une policy ne vaut que si la ligne est sans agence, ou si
   l'auteur est encore membre de l'agence de la ligne.** Une colonne d'auteur nomme qui a créé,
   émis, conduit, ajouté ou invité : `issued_by_id`, `created_by_id`, `conducted_by`,
   `added_by_id`, `invited_by`. Est membre celui que `MembershipCapabilityResolver::isMemberAt`
   reconnaît : personnel actif au sens du § 1, ou bailleur à profil actif.
2. **La règle s'écrit une fois**, dans `BasePolicy`, à l'image de `BailleurDuBien::est`.
   `CustomerPolicy::isAuthorStillMember` s'y rebranche. **Sa forme SQL borne les listes** : la
   colonne d'auteur, et l'agence de la ligne nulle ou comprise dans `memberAgencyIds()`.
3. **Exception : l'état des lieux** (`conducted_by`), selon la décision P190.05 :
   - en **écriture**, il garde `landlordWrites` et y **ajoute** l'appartenance :
     `landlordWrites(conducted_by, …)` et (agence nulle ou `isMemberAt`) ;
   - en **lecture** et dans la **liste**, l'auteur garde la ligne si l'agence est nulle, s'il est
     membre (`isMemberAt`), ou s'il détient dans l'agence un profil propriétaire **de tout
     statut**. Le bailleur bloqué garde ainsi la lecture (§ 2).
4. **Ce que la règle ne retire pas** :
   - le bailleur **actif** garde la facture qu'il a émise (`DepositRefundService.php:111`) : il est
     membre ;
   - le client du tunnel public, `created_by_id` de sa réservation (`BookingService.php:126`), la
     garde par la branche client de `BookingPolicy::view` (l. 40). Les documents de sa
     réservation ne changent pas (point 7) ;
   - l'émetteur actif d'une invitation garde « your pending invites ».
5. **Limite actée** : un bailleur **bloqué** perd la lecture d'une facture qu'il a émise. Le cas est
   rare (remboursement de dépôt), et `InvoicePolicy` n'a pas de branche bailleur qui la lui
   rendrait.
6. **Ordre** : la partie B suppose la partie A. Aujourd'hui, `isMemberAt` compte la délégation d'un
   suspendu. Les deux se livrent ensemble, ou A d'abord.

7. **`DocumentPolicy` sort de la règle pour l'instant** (décision du porteur du 2026-10-24, qui
   retire ces branches à l'option a de P218.03). Rien n'y change :
   - ni `uploaded_by` (`view` l. 48, `update` l. 78, `share` l. 100) ;
   - ni les branches d'auteur de `reaches` : `created_by_id` d'une réservation (l. 192),
     `added_by_id` d'une fiche client (l. 198), `conducted_by` d'un état des lieux (l. 213).

   La raison : appliquer le point 1 tel quel retirerait des lectures légitimes que personne n'a
   mesurées.
   - Le client du tunnel public n'entre dans les documents de sa réservation que par
     `created_by_id`, car `reaches` n'a pas de branche client pour une réservation (l. 189-195),
     à la différence de `BookingPolicy::view` (l. 40).
   - `uploaded_by` nomme aussi un locataire, un client ou un bailleur bloqué qui a joint une pièce.

   Une piste à mesurer de l'angle 218 les reprend. La règle de cet amendement ne s'y appliquera
   qu'après sa mesure et sa validation.

   *Réserve levée par l'amendement du 2026-10-25 (D3, P218.06), après relevé par sonde.*

### C. Les colonnes de bailleur suivent `BailleurDuBien` (P217.01 à P217.04)

Le § 2 range parmi les colonnes qui désignent le bailleur `landlord_id` et `property.user_id`. Ces
deux colonnes nomment aussi l'agent qui a saisi le bien (`PropertyController::store`), et
`LeaseService::create` le recopie en `landlord_id`. L'angle 190 a tranché (porteur, 2026-10-23,
P190.01 à P190.07, TCK-1718 et TCK-1926 à TCK-1932). Cet ADR ne l'écrivait pas encore :

- **Une colonne de bailleur ne désigne son bailleur que selon `BailleurDuBien::est`** : la ligne est
  sans agence, ou il détient un profil propriétaire dans l'agence, de tout statut. La règle vaut en
  lecture. En écriture, c'est **`bailleurEcrit`**, qui refuse en plus le bailleur bloqué. Dans une
  liste, c'est **`BailleurDuBien::restreindre`**.
- L'agent qui a saisi le bien agit au titre du **personnel**, sous ses capacités, et seulement s'il
  est actif. Suspendu ou retiré, il n'est plus rien pour ces lignes.
- Une colonne d'**auteur** (partie B) n'est pas une colonne de bailleur. `landlordWrites` reste la
  règle d'écriture des colonnes d'auteur (P190.05), complétée par l'appartenance.

Les lecteurs que l'angle 190 n'avait pas relus suivent la même règle. L'amendement du 2026-10-25
(D1) l'étend à tous les lecteurs de ces deux colonnes :

- **P217.01** : `MaintenanceRequest::scopeVisibleTo`, clause du bien (l. 175),
  `BailleurDuBien::restreindre`. Le scope sert `MaintenanceRequestController` (l. 51, 81) et
  `ConversationAccess::constrainListing` (l. 164).
- **P217.02** : la liste des conversations se ferme par P217.01, dans le même ticket. Aucune règle
  propre.
- **P217.03** : `PaymentController::history`, branche des loyers (l. 69),
  `BailleurDuBien::restreindre(…, 'landlord_id')`, la forme de `LeaseController.php:39`.
- **P217.04** : `LeasePaymentPolicy::update` (l. 35), `bailleurEcrit` à la place de
  `landlordWrites`. Cette ability garde aussi `initiate`, `verify` et `providers`
  (`PaymentGatewayController.php:33, 55, 80`). L'agent créateur seul perd la main ; le bailleur
  bloqué reste refusé.

### Conséquences de l'amendement

- Un membre suspendu ne garde plus rien par sa délégation : ni capacité, ni périmètre, ni
  approbation de reversement, ni demande de contact. Sa réactivation lui rend tout, sans geste.
- Un membre suspendu ou retiré perd les lignes qu'il a saisies dans l'agence. Il garde celles qui
  sont sans agence, et le personnel actif les reprend. Le bailleur actif, le locataire et le client
  ne perdent rien. Le bailleur bloqué ne perd que la facture qu'il a émise.
- Une branche « auteur » neuve passe par la règle de la partie B, et une colonne de bailleur neuve
  par `BailleurDuBien`.

### Application de l'amendement

- A : `RoleDelegation::scopeEnVigueur()` ; les sites du point A.2 ; le commentaire de
  `RoleDelegationService::create`.
- B : la règle d'auteur de `BasePolicy` et sa forme SQL ; les policies et les listes du constat B ;
  `CustomerPolicy` rebranchée. `DocumentPolicy` reste telle quelle (point B.7).
- C : `MaintenanceRequest::scopeVisibleTo`, `PaymentController::history` et
  `LeasePaymentPolicy::update`.
- Tests : un agent **suspendu** (`TeamMemberSuspensionService::suspend`), un agent **retiré**
  (`AgencyMemberRemovalService::remove`), et pour témoins un agent actif, un bailleur actif et un
  bailleur bloqué. Le délégué suspendu est réactivé et retrouve sa délégation.

## Amendement du 2026-10-25 — l'accès suit l'appartenance

Décisions du porteur du 2026-10-25, prises en bloc sur les angles 218, 223, 232 et 233 du fichier de
pistes (`docs/plans/2026-10-15-pistes-d-amelioration.md`). Relevé sur `b4d905cd3`.

Les quatre décisions prolongent l'amendement du 2026-10-24. Une colonne qui nomme quelqu'un (le
bailleur, l'auteur, le demandeur, le téléverseur) ne lui ouvre une ligne que si son appartenance à
l'agence le permet encore. L'amendement précédent avait énuméré les lecteurs et les colonnes qu'il
relevait. Cette énumération laissait d'autres lecteurs hors de la règle : ils sont relevés ici.

### D1. La partie C vaut pour tous les lecteurs de `landlord_id` et de `properties.user_id`

**Constat** (angle 232). Plusieurs lecteurs, hors policy et hors liste, tenaient encore l'agent qui a
saisi un bien d'agence pour son bailleur :

- `DashboardRoleResolver` donnait la vue du bailleur à tout compte qui a créé un bien. Son périmètre
  `PortfolioScope::landlord` comptait biens, baux, loyers, impayés et dépôts par la seule colonne
  (P232.01) ;
- `ExportDataService::scopeToActor` exportait, à un bailleur d'une agence B, les biens, baux et
  loyers qu'il avait saisis comme agent d'une agence A (P232.06) ;
- `DataExportBuilder` versait dans l'archive RGPD de l'agent les baux qu'il avait saisis, locataire
  et loyer compris, agent actif compris (P232.02) ;
- `ConversationAccess` tenait l'agent créateur suspendu pour « partie » aux fils du bail et du bien,
  et le suspendu en recevait l'avis des messages (P232.03) ;
- `AccountDeletionService` comptait les baux saisis parmi les obligations de bailleur de l'agent,
  agent retiré compris, ce qui l'empêchait d'effacer son compte (P232.05).

**Décision.**

1. **La partie C vaut pour tous les lecteurs de `leases.landlord_id` et de `properties.user_id`**, et
   pas seulement pour ceux qu'elle énumère : `BailleurDuBien::est` pour une ligne,
   `BailleurDuBien::restreindre` pour une liste ou un agrégat.
2. **L'agent actif n'est pas le bailleur de ce qu'il a saisi**, même là où il n'agit pas comme
   personnel. Il le reste à l'archive RGPD et à l'effacement, selon le précédent TCK-1017 : l'export
   d'accès d'un membre ne contient plus les données des tiers qu'il a créées.
3. **Ce que voit l'agent écarté n'est pas à inventer.** Sans la branche du bailleur, le résolveur du
   tableau de bord tombe sur la vue client, comme pour tout compte sans rôle.

**Ce que la règle ne retire pas.** Les témoins mesurés sont les suivants : le particulier sans
agence, l'hôte d'une agence `individual` (profil propriétaire), le bailleur bloqué (profil
propriétaire de tout statut) et le bailleur d'une agence B qui est agent suspendu d'une agence A.
Aucun n'y perd une ligne qui le désigne comme bailleur.

**Ce qui n'est pas gardé** :

- `payouts.landlord_id` nomme le **bénéficiaire** d'un reversement, pas le bailleur d'un bien. Ses
  lecteurs suivent la règle du reversement (P232.07, TCK-997) : le « net reversé » du tableau de
  bord, les reprises, l'obligation `payout_upcoming` et `agenciesOwingPayout` de l'effacement.
- Les lignes de l'archive RGPD par `collector_id` et `created_by_id` vont à l'angle 247.
- Le retiré n'est pas couvert par la branche « contexte » de `ConversationAccess`. Ses profils sont
  supprimés en douceur, et `inactiveOnlyAgencyIds` ne les lit pas. C'est le retrait qui lui fait
  quitter les fils du bail et les groupes du bien (TCK-1711, TCK-2021). Un fil
  `type = property` sans bail n'est pas quitté et reste ouvert. Ce type n'a aucun écrivain dans le
  code, et la règle ne le garde pas.

### D2. La partie B s'étend à `requester_id` et à `submitted_by`

**Constat** (angle 233). B.1 énumère cinq colonnes d'auteur. Deux autres nomment aussi du personnel :

- `requester_id` d'une intervention : le membre suspendu ou retiré qui l'a ouverte la lit, la liste,
  et confirme ou conteste la réparation (P233.03) ;
- `submitted_by` d'une demande de passage en agence professionnelle : l'administrateur suspendu ou
  retiré la révoque encore, et la révocation est finale (P233.04).

**Décision.**

1. **`requester_id`** : la branche du demandeur vaut si le bien est sans agence, si le demandeur est
   membre (`isMemberAt`), ou s'il n'a jamais tenu de profil de personnel dans l'agence, profils
   supprimés compris. Elle s'applique sur les trois sites de `MaintenanceRequestPolicy` (`view`,
   `respondToResolution`, `actorsOf`) et sur la liste `MaintenanceRequest::scopeVisibleTo`. La
   règle de B ne vise que le personnel : le locataire et le client demandeurs gardent tout, et
   l'agent actif sans capacité garde sa demande.
2. **`submitted_by`** : `AgencyUpgradeRequestPolicy::revoke` juge le déposant par
   `auteurEncoreMembre($user, submitted_by, agency_id)`, la forme écrite de B.2.

Un autre lot implémente D2 et cite cet amendement.

### D3. `DocumentPolicy` entre dans la règle d'auteur, après relevé par sonde

**Constat** (P218.06). B.7 avait sorti `DocumentPolicy` de la règle « pour l'instant », faute de
mesure. Le téléverseur (`uploaded_by` : `view`, `update`, `share`, et la liste de
`DocumentController`) et les trois branches d'auteur de `reaches` (`created_by_id` d'une
réservation, `added_by_id` d'une fiche client, `conducted_by` d'un état des lieux) gardent leurs
documents sans condition d'appartenance.

**Décision.** **La réserve B.7 est levée.** La règle d'auteur s'applique à `DocumentPolicy` :
`uploaded_by` et les trois branches d'auteur de `reaches`, liste comprise. Elle vient avec la
branche client de réservation, qui rend au client du tunnel public les documents de sa réservation
sans passer par `created_by_id`, et avec l'exception de l'état des lieux (B.3). Elle s'applique
**après un relevé par sonde de chaque lecteur légitime** : client de réservation, locataire ou
client qui a joint une pièce, bailleur bloqué.

Un autre lot implémente D3 et cite cet amendement. Jusqu'à sa livraison, B.7 décrit le code.

### D4. Une fiche client supprimée ne relie plus deux personnes dans la messagerie

**Constat** (P223.02). Les trois jointures `customers` de la règle 2 de `MessagingReach` (le « lien
CRM ») ne filtrent pas `deleted_at`, et `CustomerController::destroy` supprime la fiche en douceur
sans toucher à ses rattachements. Après la suppression, l'agent et le client se joignent encore, et
`POST /api/conversations` ouvre un fil entre eux (201).

**Décision.** `whereNull(deleted_at)` s'applique sur les trois jointures `customers` de
`MessagingReach`. La règle s'écrit dans son docblock et dans `docs/features.md`.

Un autre lot implémente D4 et cite cet amendement.

### Les précisions des statuts, telles que le porteur les a validées

- **P232.01** : « validation du porteur (2026-10-25) : `BailleurDuBien` dans le résolveur du
  tableau de bord et dans `PortfolioScope::landlord` (partie C d'ADR-0031 étendue à tous les
  lecteurs de `landlord_id` et `properties.user_id`) »
- **P232.02** : « validation du porteur (2026-10-25) : l'archive RGPD lit les baux par
  `BailleurDuBien::restreindre`, agent actif compris (précédent TCK-1017) ; les lignes par
  `collector_id` et `created_by_id` vont à l'angle 247 »
- **P232.03** : « validation du porteur (2026-10-25) : `BailleurDuBien` dans `contextAllows` et
  `constrainContext` de `ConversationAccess`, avec la mesure du cas du retiré et de l'avis de
  `NotifyNewMessageJob` »
- **P232.05** : « validation du porteur (2026-10-25) : les deux clauses de baux de l'effacement
  bornées par `BailleurDuBien` ; `agenciesOwingPayout` aligné sur le prédicat de bénéficiaire de
  P232.07 (TCK-997) »
- **P232.06** : « validation du porteur (2026-10-25) : `BailleurDuBien::restreindre` sur les trois
  clauses de `scopeToActor`, avec le `PortfolioScope` de P232.01 »
- **P233.03** : « validation du porteur (2026-10-25) : la branche du demandeur vaut si le bien est
  sans agence, si le demandeur est membre, ou s'il n'a jamais tenu de profil de personnel dans
  l'agence ; trois sites et la liste (partie B d'ADR-0031 étendue à `requester_id`) »
- **P233.04** : « validation du porteur (2026-10-25) : `auteurEncoreMembre($user, submitted_by,
  agency_id)` (partie B d'ADR-0031 étendue à `submitted_by`) »
- **P218.06** : « validation du porteur (2026-10-25) : la règle d'auteur d'ADR-0031 s'applique à
  `DocumentPolicy` (`uploaded_by` et les trois branches d'auteur de `reaches`, liste comprise), avec
  la branche client de réservation et l'exception de l'état des lieux, après un relevé par sonde de
  chaque lecteur légitime »
- **P223.02** : « validation du porteur (2026-10-25) : `whereNull(deleted_at)` sur les trois
  jointures `customers` de `MessagingReach`, écrit dans le docblock et dans `docs/features.md` »

### Conséquences de l'amendement

- Une colonne de bailleur neuve, ou un lecteur neuf de `landlord_id` ou de `properties.user_id`,
  passe par `BailleurDuBien`. Il n'y a pas de liste de lecteurs à tenir.
- Une colonne neuve qui nomme du personnel, comme auteur, demandeur ou déposant, passe par la règle
  de la partie B.
- L'agent qui a saisi un bien ne garde rien de ce bien comme bailleur, ni à l'archive, ni à
  l'effacement, ni au tableau de bord. Le personnel actif garde ce que ses capacités lui ouvrent.

### Application de l'amendement

- D1 : [TCK-2275](../backlog/tickets/TCK-2275-colonne-de-bailleur-chez-tous-ses-lecteurs.md).
  Les sites sont `BailleurDuBien::agences()`, `PortfolioScope` et `PortfolioMetrics`,
  `DashboardOwnerService::summary`, `DashboardRoleResolver`, `ExportDataService::scopeToActor`,
  `DataExportBuilder` (`leases.json`), `AccountDeletionService::collectOpenObligations`, ainsi que
  `ConversationAccess::contextAllows` et `constrainContext`. Le test est
  `ColonneDeBailleurAgentCreateurTest` : agent créateur actif, suspendu et retiré, avec pour
  témoins le particulier, l'hôte `individual`, le bailleur bloqué, le bailleur de B agent suspendu
  de A, et le locataire.
- D2 : [TCK-2290](../backlog/tickets/TCK-2290-demandeur-et-deposant-encore-membres.md). Le
  demandeur est jugé par `MaintenanceRequestPolicy::isRequester` (lu par `view`,
  `respondToResolution` et `actorsOf`) et par `MaintenanceRequest::scopeVisibleTo`, sur
  `MembershipCapabilityResolver::agencesDuPersonnelParti` : les agences où il a tenu un profil
  d'agent ou d'administrateur, de tout statut et supprimé compris, sans y être encore membre. Un
  profil d'agent en `draft` (invitation non acceptée) n'a pas été tenu, et une délégation n'est pas
  un profil. `BasePolicy::auteurEncoreMembre` est publique et statique, pour
  `AgencyUpgradeRequestPolicy::revoke`, qui n'hérite pas de `BasePolicy`. Les tests sont
  `DemandeurEncoreMembreTest` et `DeposantEncoreMembreTest`.
- D3 : [TCK-2295](../backlog/tickets/TCK-2295-documents-et-messagerie-suivent-l-appartenance.md).
  Le relevé par sonde a précédé le code. Il a mesuré l'agent actif, suspendu et retiré sur les
  quatre colonnes, et chaque lecteur légitime : le client du tunnel, le locataire et le client qui
  ont joint une pièce, le bailleur bloqué, l'agent sur les pièces de son propre profil. Seuls quatre
  chemins créent un `Document` : `POST /api/documents` (borné par `attachTo`), les pièces de profil
  (`ProfilePieces`), les statuts d'une demande de passage et `DocumentPdfService::store`, sans
  appelant. Tout lecteur légitime qui a téléversé sans être membre atteint donc le porteur par une
  branche qui n'est pas d'auteur. Le site est `DocumentPolicy`, en quatre points :
  - `televerseurGarde` porte la branche `uploaded_by` de `view`, `update` et `share`. Elle vaut si le
    document est sans agence, si c'est une pièce du propre profil du téléverseur, ou s'il est
    encore membre. En lecture, elle vaut aussi pour un profil propriétaire de tout statut (B.3). En
    écriture, `landlordWrites` est gardé et une branche de `reaches` en écriture suffit : le
    locataire et le client gardent les gestes sur leur pièce ;
  - l'agence d'un état des lieux est celle de son bien, faute de colonne `agency_id` ;
  - dans `reaches`, `created_by_id` et `added_by_id` passent par `auteurEncoreMembre`, et
    `conducted_by` par la forme d'`InventoryPolicy`. La branche client de réservation
    (`customer.user_id`) vaut en lecture comme pour joindre une pièce ;
  - la liste de `DocumentController::index` passe par `restreindreAuTeleverseur`, sa forme SQL.

  `isMemberAt` lit l'amorce `owner` d'une page. **Ce qui n'est pas gardé** : la recherche
  `GET /api/search/documents` filtre Meilisearch par `uploaded_by` seul, faute d'agence indexée.
  Les documents récents du tableau de bord du locataire et l'archive RGPD lisent `uploaded_by` sans
  la règle : ce sont les propres téléversements de l'utilisateur, l'archive relevant de l'angle 247.
  `agencyOf`, nul pour un état des lieux, reste tel quel pour `landlordWrites`. Le test est
  `AuteurDuDocumentEncoreMembreTest`.
- D4 : [TCK-2295](../backlog/tickets/TCK-2295-documents-et-messagerie-suivent-l-appartenance.md).
  `whereNull(deleted_at)` porte sur les trois jointures `customers` de la règle 2 de
  `MessagingReach`, écrit dans son docblock et dans `docs/features.md` (§ 1.7). Le test est
  `FicheClientSupprimeeLienCrmTest`.

## Amendement du 2026-10-25 — le contact d'un bail ou d'une réservation est une fiche de l'agence du bien

Décision du porteur du 2026-10-25 sur P226.01 (TCK-2285). Relevé sur `b4d905cd3`.

**Constat.** `LeaseService::create` (locataire, garant), `BookingService::create` (client) et
`LeaseController::attachGuarantor` jugeaient la fiche par `can('view')` seul. `CustomerPolicy::view` et
`GuarantorPolicy::view` ne lisent que l'agence **de la fiche**. Un compte agent de A et de B, sous
l'indice `agent:B`, rattachait la fiche de A qu'il avait ajoutée à un bail ou à une réservation d'un
bien de B. Le personnel de B la lisait ensuite par le bail (`?include=tenant`), alors que
`GET /api/customers/{id}` lui rendait 403. La règle d'auteur de l'amendement du 2026-10-24 ne ferme
pas ce passage : l'agent reste membre de A.

**Décision.** Quand le bien a une agence, le locataire, le garant et le client sont des fiches de
**cette agence**, en plus de `can('view')` (`App\Services\Property\ContactDeLAgenceDuBien`). L'agence
d'un garant se lit comme sa policy la lit (`GuarantorPolicy::agencyOf()`). Le refus est le 403 de
l'absent et du tiers. Pour `attachGuarantor`, c'est l'agence du **bien** du bail qui compte, et non
`leases.agency_id`. Une fiche **sans agence** ne se rattache donc pas à un bien d'agence, même par son
auteur : `BookingCustomerScopeTest` la donnait réservable par l'agent qui l'avait ajoutée. Le code
courant n'en fait naître qu'au super-admin hors agence et au tunnel.

**Ce qui ne change pas.**

- Un bien sans agence : `can('view')` seul. La règle des visites (`ClientDeLAgence`, TCK-590), qui
  n'y admet aucune fiche, n'est pas reprise : elle refuserait tout bail d'un bailleur direct.
- La réservation **pour soi** (`customer_id` = la fiche du demandeur) et le tunnel public. La fiche
  sans agence d'un client du tunnel (`CustomerService::findOrCreateFromUser`) n'est pas davantage
  refusée : le personnel de B ne la lisait déjà pas.

**Ce qui n'est pas gardé.** Le renouvellement recopie le locataire et le garant du parent sans les
rejuger. Un bail antérieur dont la fiche est d'une autre agence garde son contact.

## Amendement du 2026-10-25 (P15.01) — la fiche d'un candidat naît dans l'agence du bien

Décision du porteur du 2026-10-25 sur P15.01 (TCK-2350). Relevé sur `0282d41e7`.

**Constat.** `CustomerService::findOrCreateFromUser()`, seul écrivain de `customers.user_id` à la
candidature, à l'offre d'achat et à la réservation par `POST /api/bookings`, créait la fiche dans
l'agence **du visiteur** : `null` pour un candidat sans profil d'agence. Le personnel de l'agence du
bien ne la lisait pas (`CustomerPolicy::view`, `scopeVisibleTo`), et le bail tiré de la candidature
rendait 403 (`LeaseService::create`, puis `ContactDeLAgenceDuBien` de l'amendement précédent). La
fiche reprise était la première du compte, quelle que soit son agence.

**Décision.** Sur un bien d'agence, la fiche du candidat est une fiche de **l'agence du bien** :
relue dans cette agence seule, rattachée dans cette agence seulement sur un téléphone ou un e-mail
**vérifié** du compte (règle de TCK-1710), créée dans cette agence sinon. `added_by_id` reste le
candidat : le personnel la lit par `crm.view_all`. Un compte porte ainsi une fiche par agence, ce
que `User::tenantLeases()` et `DashboardTenantService` supposaient déjà.

Ce point modifie le § « Ce qui ne change pas » de l'amendement précédent : la fiche du tunnel n'est
plus « sans agence », et le personnel de l'agence du bien la prend pour locataire et pour client.

**Ce qui ne change pas.** Un bien sans agence garde la règle d'avant (agence du compte, première
fiche du compte). Aucune fiche existante ne change d'agence et aucun `user_id` n'est posé sur une
fiche existante hors de l'appariement vérifié : une fiche née sans agence avant cet amendement reste
telle quelle, et la candidature suivante en fait naître une dans l'agence du bien.

**Ce qui n'est pas gardé.** Une fiche née sans agence avant l'amendement reste invisible au
personnel ; rien ne la rapproche de la fiche neuve du même compte.
