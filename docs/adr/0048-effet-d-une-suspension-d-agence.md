# ADR-0048 — Une agence suspendue disparaît du site et ne s'écrit plus ; ses locataires paient encore

- **Statut** : Accepté
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
- **Hors de cet amendement : la fin d'essai.** `AgencySubscriptionService::processTrialExpirations`
  (l. 86-109) ne lit pas le statut de l'agence. Savoir si l'essai d'une agence `inactive` ou
  `suspended` doit se convertir reste une question de facturation (V1), qui n'est pas tranchée ici.
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
