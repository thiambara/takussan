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
   méthode non sûre sous un profil actif d'une agence `suspended` → **423 `agency_suspended`**. Liste
   blanche nommée : `api/auth/*`, `api/me/*` (son propre compte, ses exports, sa demande
   d'effacement), les exports de données. Les lectures passent.
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
- Tests : `AgencySuspensionTest`, `AgencySuspensionSearchIndexTest`, `AgencySuspendedWriteLockTest`.
