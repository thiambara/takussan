# ADR-0048 — Une agence suspendue disparaît du site et ne s'écrit plus ; ses locataires paient encore

- **Statut** : Accepté, **amendé le 2026-10-22, le 2026-10-24 et le 2026-10-25** (cf. § *Amendement
  du 2026-10-24 — l'effacement du dernier administrateur* et § *Amendement du 2026-10-25 — le titre
  d'administrateur principal ne se transmet par aucun geste*)
- **Date** : 2026-10-08
- **Tickets** : [TCK-600](../backlog/tickets/TCK-600-console-plateforme-gouvernance-et-exploitation.md)

## Contexte

Mesuré le 2026-10-08 sur `dev` (`bef65b3e`) :

- **Suspendre n'écrit qu'un statut.** `AgencyModerationController::suspend` → `transition()` pose
  `agencies.status = suspended` et une activité ; aucun motif, aucune notification.
- **Personne ne lit ce statut en aval.** `Property::scopePublic` et `shouldBeSearchable` ignorent
  l'agence (26 appels du premier, dont la réservation `BookingService.php:71`) ;
  `ActiveProfileResolver` ne juge que le statut du profil ; `MembershipCapabilityResolver` ne lit
  aucun statut d'agence. Seuls lecteurs : l'annuaire (`PublicAgencyController.php:123`,
  `PublicProfileFacts.php:237`, qui exigent déjà `status = active`) et les compteurs de la console.
- **Une seule sortie** de `suspended` : `verify`, qui touche aussi la vérification KYC.
- `agencies.status` vaut `active` par défaut à la création (migration `2026_04_17_160002`, et les
  quatre créateurs du code) ; `inactive` n'est posé que par `unverify`.

## Décision

**La visibilité publique d'un bien d'agence suit `agencies.status = active`. Le verrou d'écriture ne
vaut que pour `suspended`. Ce qui sert un tiers qui n'y est pour rien — le locataire qui paie,
l'export des données — continue.**

1. **Visibilité.** `Property::scopePublic` et `shouldBeSearchable` exigent `agency_id` nul **ou**
   une agence `active` (même règle que l'annuaire) : `inactive` et `suspended` masquent la liste,
   la fiche (404), la réservation et l'index. `makeAllSearchableUsing` charge `agency`.
2. **Index.** La suspension (et toute sortie d'`active`) dispatche
   `SyncAgencyPropertiesSearchIndex`, qui appelle `unsearchable()` par lots sur les biens de
   l'agence ; la levée appelle `searchable()` (seuls les biens indexables y entrent, par
   `shouldBeSearchable`).
3. **Verrou d'écriture.** `EnsureAgencyWritable` (groupe `api`, après `ResolveActiveProfile`) : une
   méthode non sûre sous un profil actif d'une agence `suspended` → **423 `agency.suspended`** (le
   code que rend `abort_code`, et qu'éprouvent les tests). Liste blanche nommée : `api/auth/*`,
   `api/me/*` (son propre compte, ses exports, sa demande d'effacement), les exports de données. Les
   lectures passent.

   **Une agence suspendue ne reçoit plus de travail** (verif-600 O2, décision de session). Le
   prestataire assigné ne porte aucun profil d'agence, et le verrou ci-dessus ne le voyait pas : il
   acceptait une intervention dont le bailleur, lui, ne pouvait plus approuver le devis. Le même
   middleware juge donc aussi l'agence de l'**intervention** visée, quand l'écrivain en est le
   prestataire assigné (`MaintenanceRequest::lockedForProvider()`). Toute écriture rend 423
   `agency.suspended` :
   - accepter, refuser ;
   - soumettre un devis ;
   - changer le statut, démarrer, terminer ;
   - joindre les photos « avant » ;
   - modifier la demande ;
   - poster un message sur son fil ;
   - joindre une pièce par `POST /api/media`, jugé dans `MediaController::authorizeAttach()`
     puisque la cible est dans le corps.

   Retirer une pièce d'intervention ne lui est ouvert dans aucun état (`MediaPolicy::delete`). La
   lecture reste ouverte : fiche, devis, fil.

   Écritures qui restent ouvertes, nommées :
   - **Marquer le fil lu, le mettre en sourdine, l'archiver.** Ces gestes portent sur l'état de la
     personne, pas sur un travail pour l'agence.
   - **Aucun geste de l'intervention elle-même**, y compris « refuser » et « terminer ». Les deux
     ont été pesés :
     - refuser rendrait la demande à un donneur d'ordre qui ne peut plus la réassigner ;
     - terminer déclencherait la confirmation du demandeur et ce que TCK-594 en lit.

     Ils attendent la levée, qui ne perd rien : la suspension est réversible et les données restent
     en place. Les fermer est une **décision de session** (validée en revue de TCK-600), et elle
     est elle-même réversible. `EnsureAgencyWritable::interventionVisee()` verrouille toute
     écriture qui porte `{maintenanceRequest}`. Rouvrir l'un des deux revient donc à y exempter
     sa route par son nom. Le test du geste dans `AgencySuspensionProviderLockTest` doit alors
     devenir un témoin ouvert.
   - Comme pour les membres, le verrou ne vaut que pour `suspended` : une agence `inactive` reçoit
     encore.
4. **Second chemin.** `MembershipCapabilityResolver` refuse toute capacité d'**écriture** dans une
   agence `suspended` — par profil comme par délégation — et garde les capacités d'**export**
   (`crm.export`, `payments.export`, `reports.export`, et la lecture `crm.view_all`). Un membre
   multi-agences qui agirait sur l'agence suspendue depuis le profil d'une autre est refusé là.
5. **Ce qui continue.** Les paiements des locataires (`LeasePayment`, réservation déjà payée) restent
   acceptés : un locataire n'a pas de profil d'agence, le verrou ne le voit pas. L'export reste
   permis. Les reversements sont **gelés par TCK-594**, pas ici.
6. **Levée.** `POST /api/admin/agencies/{agency}/reinstate` (motif requis) ramène `active` sans
   toucher à la vérification ; `suspend` exige désormais un motif. Les admins de l'agence reçoivent
   `AgencySuspendedNotification` / `AgencyReinstatedNotification` (base + courriel), le motif figure
   dans l'activité.

## Alternatives écartées

- **Masquer seulement `suspended`** : `inactive` (`unverify`) aurait gardé des annonces publiques à
  une agence que la plateforme ne vérifie plus, alors que l'annuaire la cache déjà ; deux règles de
  visibilité pour une même agence.
- **Verrouiller aussi `inactive`** : `inactive` est l'état d'une agence que la plateforme ne garantit
  plus, pas d'une agence sanctionnée ; geler son back-office empêcherait la mise en conformité qui la
  ramènerait à `active`.
- **Suspendre aussi les paiements entrants** : le locataire paierait la sanction de son agence, et
  les retards (pénalités, relances) courraient contre lui.
- **Un statut par bien (dépublier en masse)** : la levée aurait dû republier à la main, sans savoir
  quels biens l'étaient avant.

## Conséquences

- Une agence `inactive` voit ses biens quitter le site jusqu'à sa re-vérification.
- Les membres d'une agence suspendue lisent tout et n'écrivent rien ; le front montre un bandeau
  « lecture seule » et retire les gestes d'écriture plutôt que de laisser le 423 tomber au clic.
- Le compteur `properties_count` de l'agence ne bouge pas : la règle est une lecture, pas une
  écriture.

## Application

- `app/Models/Property.php` (`scopePublic`, `shouldBeSearchable`, `makeAllSearchableUsing`),
  `app/Jobs/Search/SyncAgencyPropertiesSearchIndex.php`, `app/Http/Middleware/EnsureAgencyWritable.php`,
  `app/Services/Membership/MembershipCapabilityResolver.php`,
  `app/Http/Controllers/Api/Admin/AgencyModerationController.php`.
- Tests : `AgencySuspensionTest`, `AgencySuspensionSearchIndexTest`, `AgencySuspendedWriteLockTest`, `AgencySuspensionProviderLockTest` (O2).

## Amendement du 2026-10-22 — une agence ne se supprime pas, elle sort du cycle de vie par son statut

Décision du porteur du 2026-10-22, sur les pistes P129.01 à P129.06 (angle 129 du fichier de
pistes, `docs/plans/2026-10-15-pistes-d-amelioration.md`). Relevé sur `pre-dev` (`fbf2acedf`).

**Constat.** Cet ADR range la fin d'activité d'une agence dans `agencies.status` ; une seconde voie
la contournait :

- `DELETE /api/agencies/{agency}` (`routes/api/agencies.php:30`) mène à
  `AgencyController::destroy` (`AgencyController.php:147-159`). L'action est ouverte au super-admin
  et à l'admin principal, et n'écrit que `$agency->delete()` (l. 156), suppression douce
  (`SoftDeletes`, `Agency.php:34`).
- **Aucun appelant.** Le front n'appelle pas cette route ; seuls `AgencyTest.php:190-210`
  l'exercent, et ils ne vérifient que `assertSoftDeleted`.
- **Ni restauration, ni vue.** Aucune route ne restaure une agence, et aucun contrôleur de la
  console ne lit les agences par `withTrashed()` ou `onlyTrashed()` : une agence supprimée disparaît
  de la console.
- **Ce qui continue après la suppression**, mesuré par l'explorateur et le mesureur avec un témoin
  sans suppression :
  - **les membres** : profils intacts, `POST /api/customers` → 201 dans l'agence supprimée, mais
    `POST /api/properties` → 403, parce que `MembershipCapabilityResolver::resolveDirect` ne trouve
    plus l'agence (l. 182) (P129.01) ;
  - **l'argent** : pénalités et relances de loyer (P129.02) ;
  - **les invitations** : relancées et acceptées (P129.03) ;
  - **l'abonnement** : l'essai passe `active` (P129.05).
- **Rien n'est verrouillé ni annoncé.** La suppression ne passe par aucun état de cet ADR :
  - pas de verrou d'écriture (`EnsureAgencyWritable` lit `status`) ;
  - pas de motif ni d'avis aux admins.

  Seul l'index a été remis en accord, par P129.04 (TCK-1277) : `AgencyObserver::deleted()` et
  `restored()` (`AgencyObserver.php:95-103`) mettent `SyncAgencyPropertiesSearchIndex` en file, et
  le job relit l'agence par `withTrashed()` (l. 48).

**Décision.**

1. **La route `DELETE /api/agencies/{agency}` est retirée**, avec `AgencyController::destroy` et les
   deux tests d'`AgencyTest.php:190-210` qui l'exercent. Aucune autre voie de l'API ne supprime une
   agence : le seul `$agency->delete()` de `app/` est celui de `destroy`.
2. **La fin d'activité d'une agence passe par son statut**, avec les effets que cet ADR leur donne :
   - `inactive` : biens masqués du site et de l'index, back-office ouvert ;
   - `suspended` : de plus, écriture verrouillée en 423 `agency.suspended`, motif requis, admins
     avertis.

   Les deux sont réversibles, se voient dans la console et gardent l'agence joignable par la liaison
   de route `{agency}`.
3. **Aucun geste neuf n'est créé ici.** Les transitions restent celles de la console
   (`AgencyModerationController`, `routes/api/admin.php:90-97`) :
   - `unverify` pose `inactive` et retire la vérification ;
   - `suspend` pose `suspended`.

   Une agence qui veut cesser son activité le demande à la plateforme. Un geste de clôture ouvert à
   l'admin de l'agence serait une transition de plus du cycle de vie : il demanderait son propre
   amendement.

**Ce que deviennent les pistes.**

- **P129.01** (membres qui lisent et écrivent dans une agence supprimée), **P129.02** (pénalités et
  relances) et **P129.05** (abonnement) : **sans objet**, aucune agence ne se supprime plus.
- **Pour une agence `inactive` ou `suspended`**, ce sont les règles de cet ADR qui valent :
  - **les loyers** : le locataire paie encore (§ 5), donc pénalités et relances courent comme pour
    toute agence, ce qu'écarte déjà l'alternative « suspendre aussi les paiements entrants » ;
  - **l'abonnement** : l'agence reste joignable par la liaison de route, et la console peut donc
    l'annuler (`POST /api/admin/agencies/{agency}/subscription/cancel`, `routes/api/admin.php:88`,
    `AgencySubscriptionController.php:37`). La suppression, elle, la rendait injoignable
    (déduit en P129.05, non mesuré).
- **La fin d'essai** (décision du porteur du 2026-10-22, V1).
  `AgencySubscriptionService::processTrialExpirations` (l. 86-109) ne lit pas le statut de
  l'agence. **L'essai d'une agence `inactive` ou `suspended` ne se convertit pas** : une agence
  sortie d'activité ne commence pas à être facturée. Le job la saute, et l'essai échu se convertit
  au premier passage qui suit son retour à `active`. Garde : un test du job par statut.
- **P129.03** (invitations ouvertes) est validée à part et n'est pas tranchée ici. Sa révocation
  « à la suppression » n'a plus d'émetteur une fois la route retirée. Le refus d'accepter en 410
  l'invitation d'une agence qui n'existe plus vaut toujours pour les agences déjà supprimées, s'il
  en existe.
- **P129.04** (TCK-1277) reste en place : l'observateur et le `withTrashed()` du job ne coûtent rien
  et couvrent une suppression faite hors de l'API.

**Les agences déjà supprimées.**

- **Dev local : aucune.** Relevé le 2026-10-22 sur la base de développement de `docker-compose.yml`
  (`select count(*) filter (where deleted_at is not null), count(*) from agencies` → `0|4`). Cette
  base est un jeu de seeders : elle ne dit rien d'un environnement servi.
- **Production : rien à reprendre.** L'API n'y a jamais servi (voir `CLAUDE.md`, § Workflow git).
- **Préproduction : à relever avant toute reprise** (même requête, en lecture), et le relevé n'a pas
  été fait ici. S'il y en a, leur sort se décide sur ce relevé : restaurer en `inactive` ou laisser
  supprimé. Pour une agence laissée supprimée, il faut aussi régler ses profils, ses invitations et
  ses échéances encore actifs.

**Ce qui garde.**

- Un test de routes, sur le modèle de `tests/Feature/Routes/RoutesEnDoubleRetireesTest.php`, exige
  deux choses :
  - que `DELETE api/agencies/{agency}` ne soit plus enregistrée ;
  - que les `DELETE` voisins sous `api/agencies/{agency}/…` (membres, délégations, absences, rôles,
    demandes de passage) le restent.
- Le test doit rougir si la route revient (ablation).
- Les deux tests de suppression d'`AgencyTest.php` sont retirés avec elle, pas réécrits.

**Ce que la décision ne change pas.**

- **`SoftDeletes` reste sur `Agency`.** L'unicité du slug compte encore les agences supprimées
  (`GeneratedAgencySlugCountsDeletedAgenciesTest`). De même, les relations qui lisent une agence par
  `withTrashed()` restent justes pour les données anciennes.
- **Les règles de cet ADR sur `inactive` et `suspended` restent les mêmes** : visibilité, index,
  verrou, second chemin, ce qui continue, levée.
- **Les suppressions de membres, de rôles et de délégations** sous `api/agencies/{agency}/…` ne
  sont pas touchées.

## Amendement du 2026-10-24 — l'effacement du dernier administrateur

Décision du porteur du 2026-10-24 sur P204.02, option b (angle 204 du fichier de pistes,
`docs/plans/2026-10-15-pistes-d-amelioration.md`), précisée le même jour sur quatre points
(points 1 à 4 ci-dessous). Relevé sur `54f0f14b4`.

**Constat.**

- **Un administrateur efface son compte sans que son agence soit regardée.** Les obligations qui
  retiennent une demande d'effacement (`AccountDeletionService::collectOpenObligations`, l. 462 et
  suivantes) sont des baux, des loyers, des factures, des réservations et des reversements, jamais
  une administration d'agence. Elles ne sont jugées qu'à la demande (`requestDeletion`,
  l. 103-108). L'exécution, 30 jours plus tard (`executeDeletion`, l. 196 et suivantes), ne les
  rejuge pas.
- **Le retrait, lui, refuse les deux cas** : l'administrateur principal
  (`AgencyMemberRemovalService.php:59`) et le dernier administrateur, compté sous verrou
  (l. 67-80).
- **Tout hôte individuel est seul administrateur et administrateur principal de son espace**
  (`HostIndividualOnboardingService`, `kind = individual`). Une obligation pour tout administrateur
  principal empêcherait donc tout hôte d'effacer son compte, alors que c'est un droit (V3).
- **Aucun geste ne transmet le titre.** `primary_admin_id` ne s'écrit qu'à la création
  (`AgencyController.php:61`, `HostIndividualOnboardingService.php:260`) et au provisionnement par
  la console (`AgencyProvisioningService.php:81`). `UserRoleController::assertRoleChangeable`
  (l. 111-116) refuse de rétrograder l'administrateur principal.

**Décision.** Le traitement porte sur chaque agence dont le compte est l'administrateur principal
(`primary_admin_id`) ou le seul administrateur actif.

1. **L'agence passe `inactive` à l'exécution de l'effacement**, dans la transaction de
   `executeDeletion`, dans trois cas :
   - c'est un espace `individual` ;
   - elle n'a plus d'autre membre actif. « Membre actif » s'entend au sens d'ADR-0031
     (`isMemberAt`) : personnel actif ou bailleur à profil actif ;
   - il n'y reste, hors le compte, que des **bailleurs** actifs, sans aucun autre personnel actif.
     Promouvoir un bailleur administrateur lui donnerait l'agence entière, et ce geste ne s'impose
     pas au compte qui part.

   Seul le statut change : `is_verified` et `verified_at` restent tels quels, à la différence
   d'`unverify`. **La transition ne part que d'`active`** : une agence `suspended` le reste, car
   passer `inactive` lèverait le verrou d'écriture posé par la plateforme. Une agence déjà
   `inactive` ne change pas.
2. **Si l'agence a un autre administrateur actif, `primary_admin_id` lui passe à l'exécution.**
   S'il y en a plusieurs, c'est **le plus ancien profil d'administrateur actif** qui le reçoit
   (`agency_admin_profiles.id` croissant). La règle est déterministe et ne demande aucun écran.
   C'est la seule écriture de `primary_admin_id` après la création et le provisionnement.
   L'agence ne change pas de statut.
3. **Si l'agence a du personnel actif mais aucun autre administrateur actif, c'est une obligation**
   de `collectOpenObligations` : la demande d'effacement est refusée en 422 et l'inventaire la
   nomme. Le compte la lève lui-même en promouvant un membre au rôle d'administrateur, par le geste
   qui existe déjà (`UserRoleController`, `setAgencyAdmin`). Le titre passe ensuite à l'exécution,
   selon le point 2.
4. **L'exécution rejuge la situation, et ne retarde jamais l'effacement.** L'obligation du point 3
   n'est jugée qu'à la demande. Si l'autre administrateur part pendant les 30 jours de grâce,
   l'exécution trouve du personnel sans autre administrateur. Elle passe alors l'agence
   `inactive`, selon le point 1 et depuis `active` seulement, plutôt que de retarder l'effacement,
   qui est un droit (V3). L'agence se relève par la console, comme toute agence `inactive`.

**Ce qui change par rapport au point 3 de l'amendement du 2026-10-22.**

- **Le point 3 disait** :
  - « aucun geste neuf n'est créé ici » ;
  - les transitions vers `inactive` et `suspended` sont celles de la console seule (`unverify`,
    `suspend`) ;
  - une agence qui veut cesser son activité le demande à la plateforme ;
  - un geste de clôture ouvert à l'admin de l'agence « demanderait son propre amendement ».
- **Ce qui change** : la console n'est plus le seul écrivain de `inactive`. L'exécution d'un
  effacement de compte (`AccountDeletionService::executeDeletion`) en est un second, dans les seuls
  cas des points 1 et 4, et depuis `active` seulement. C'est l'amendement que le point 3
  demandait pour toute transition neuve du cycle de vie.
- **Ce qui ne change pas** :
  - **aucun geste de clôture n'est ouvert à l'administrateur** : il ne ferme pas son agence, il
    efface son compte, et l'agence ne passe `inactive` que dans les cas des points 1 et 4 ;
  - une agence qui a encore des membres et veut cesser son activité le demande toujours à la
    plateforme ;
  - `suspended` reste posé par la console seule ;
  - les effets de `inactive` sont ceux de cet ADR, sans exception : biens masqués du site et de
    l'index (`AgencyObserver::syncSearchIndexOnStatusChange`, l. 75-89), back-office ouvert, essai
    non converti (amendement du 2026-10-22), loyers qui courent (§ 5) ;
  - **le retour à `active`** passe par la console, comme pour toute agence `inactive`
    (`verify`, qui exige un dossier KYC vérifié).

## Amendement du 2026-10-25 — le titre d'administrateur principal ne se transmet par aucun geste

Décision du porteur du 2026-10-25 sur P225.05 (angle 225 du fichier de pistes,
`docs/plans/2026-10-15-pistes-d-amelioration.md`) : « aucun geste neuf de transmission du titre ;
la limite est écrite dans ADR-0048 ». Prise avec P225.04 et P225.06, livrées par le même ticket
([TCK-2311](../backlog/tickets/TCK-2311-titre-d-administrateur-principal.md)). Relevé sur
`b4d905cd3`.

**Constat.**

- **`primary_admin_id` s'écrit en trois endroits** :
  - au provisionnement par la console (`AgencyProvisioningService.php:81`) ;
  - à la création de l'espace hôte (`HostIndividualOnboardingService.php:260`) ;
  - à l'exécution de l'effacement du titulaire, au profit du plus ancien autre administrateur
    actif (`ErasedAgencyAdmin::settle`, point 2 de l'amendement du 2026-10-24, TCK-2166).

  Le quatrième écrivain que citait l'amendement du 2026-10-24, `AgencyController::store`
  (`POST /api/agencies`), est **retiré** par TCK-2311 (P225.06). Aucune requête de
  `app/Http/Requests` n'accepte `primary_admin_id`, et aucune route de la console ne modifie une
  agence.
- **Les trois sorties du personnel refusent le titulaire** : le retrait
  (`agency_member.cannot_remove_primary_admin`, `AgencyMemberRemovalService.php:59`), la
  suspension (`team.suspension_primary_admin`, `TeamMemberSuspensionService.php:59`) et la
  rétrogradation (`user.role_primary_admin`, `UserRoleController.php:111`).
- **Le blocage par la plateforme ne lit pas le titre.** `UserLifecycleController::block` ne refuse
  que de se bloquer soi-même ou de bloquer un opérateur (`refuserSoiEtOperateur`), puis bloque le
  compte et retire ses jetons. L'agence garde pour titulaire un compte sans session.
- **Depuis TCK-2311 (P225.04), aucun geste d'agence n'est réservé au seul titre.** La régénération
  des filigranes, le dernier, est jugée par `AgencyPolicy::configure`, comme le logo. Partout
  ailleurs, le titre est un court-circuit doublé par une capacité : `AgencyPolicy` (`update`,
  `configure`, `removeMember`, `changeMemberRole`, `updateKyc`), `AgencyIndicatorPolicy`,
  `InvitationPolicy`, `MediaPolicy::viewRaw`, `BankStatementPolicy`, `RoleDelegationPolicy`. Un
  autre administrateur qui tient la capacité fait donc le geste sans le titulaire. Le titre sert
  encore de garde de séparation (`PlatformPayoutService::assertNotBeneficiary` par
  `SegregationOfDuties`, `StoreRoleDelegationRequest.php:80`), et de destinataire parmi d'autres.

**Décision.**

1. **Aucun geste neuf ne transmet le titre**, ni à la console, ni à l'administrateur principal.
   Le titre ne change qu'aux trois écritures du constat. Un administrateur principal qui veut
   quitter l'agence sans effacer son compte n'a pas de chemin : c'est la **limite acceptée**.
2. **`block()` ne lit pas le titre, et c'est voulu.** La plateforme doit pouvoir bloquer un
   titulaire fraudeur sans condition. Bloquer le titulaire ne transmet rien et ne change pas le
   statut de l'agence. Ses autres administrateurs gardent les gestes d'administration par leurs
   capacités.

**Ce qui n'est pas gardé.**

- Aucun test n'exige qu'aucune requête n'accepte `primary_admin_id` : une route neuve qui
  l'accepterait ouvrirait la transmission sans amender cet ADR.
- Le blocage du **seul** administrateur d'une agence n'a pas été rejoué. L'agence n'a alors plus
  personne pour l'administrer. Rien ne la passe `inactive`, et rien ne prévient la plateforme.
  Le remède existe par la console, sans geste neuf (déduit, non rejoué) :
  - réactiver le compte ;
  - ou effacer le compte (`UserLifecycleController::erase`). À l'exécution, l'effacement applique
    les points 1 et 2 de l'amendement du 2026-10-24.
- Un geste de transmission par la console seule, journalisé (`primary_admin_id` est déjà dans
  `Agency::AUDIT_ONLY`), reste la voie si un cas réel se présente. Il demanderait son propre
  amendement de cet ADR.
