# ADR-0092 — Une agence mise en avant par ville et par instant, gardée par la base ; la place se voit sans changer l'ordre de l'annuaire

- **Statut** : Accepté le 2026-11-09 (décision 1a du porteur, audit UX famille 1 ; écrit à l'implémentation de TCK-2520)
- **Date** : 2026-11-09
- **Tickets** : TCK-2520 (la place offerte), TCK-2525 (la vente, qui amendera [ADR-0061](0061-credits-d-espace-et-boost-des-annonces.md))
- **Prolonge** : [ADR-0061](0061-credits-d-espace-et-boost-des-annonces.md) — la mise en avant d'un **bien** ; celle-ci porte sur une **agence**, et ne se vend pas encore

## Contexte

La maquette retenue de l'annuaire (`?p=annuaire&a=d`) garde la liste dense des agences et place en tête **une** vitrine « Mise en avant » : couverture de trois biens, note, délai de réponse, baux du mois. Trois questions structurelles en sortent, qu'aucun document ne tranchait :

1. **Combien de vitrines ?** La maquette n'en montre qu'une, et la décision 5a du porteur dit « une seule en tête, signalée ». Deux places qui se chevauchent sur la même ville rendraient deux « Mise en avant » au même instant.
2. **La place change-t-elle le rang ?** Une place achetable qui remonte l'agence dans la liste fait du classement une enchère : la décision 1a (2026-11-09) l'exclut — l'agence apparaît **dans la vitrine ET à son rang**.
3. **Que devient la place d'une agence suspendue ?** [ADR-0048](0048-effet-d-une-suspension-d-agence.md) retire une agence suspendue du site ; une place réservée ne doit pas la ramener.

Une règle d'unicité tenue par le code seul se viole par deux écritures concurrentes (les deux lisent « libre », les deux insèrent) : c'est le défaut que le piège n° 2 de l'API documente pour les agrégats.

## Décision

1. **Table `agency_spotlights`** (agence, ville du référentiel `geo_city_id` — `null` pour l'annuaire sans filtre de ville —, `starts_at`, `ends_at` exclue, opérateur, motif). Une ligne est une place, passée, présente ou future ; aucun statut : l'instant de la lecture dit si elle est active.
2. **Au plus une place par ville et par instant, gardée par PostgreSQL** : contrainte d'exclusion `EXCLUDE USING gist (geo_city_id WITH =, tsrange(starts_at, ends_at) WITH &&)`, plus une seconde, partielle, `EXCLUDE USING gist (tsrange(starts_at, ends_at) WITH &&) WHERE (geo_city_id IS NULL)` — `=` ne joint pas deux `NULL`. L'égalité sur un entier dans un index GiST exige l'extension **`btree_gist`**, extension de confiance (`trusted`) depuis PostgreSQL 13 : le propriétaire de la base la crée sans superutilisateur, comme `pg_trgm` (TCK-2392). `tsrange` et non `tstzrange` : les colonnes sont des `timestamp` sans fuseau, et `tstzrange()` sur elles dépend du `TimeZone` de la session — une expression d'index doit être immuable. La période est ramenée en UTC avant d'être comparée et rangée : un décalage gardé tel quel serait rangé en heure murale. Le code vérifie le chevauchement avant d'écrire pour rendre un 422 lisible ; la contrainte reste le seul arbitre d'une course, et sa violation rend le même 422.
3. **La place ne touche pas au classement.** `spotlight` est une racine de la réponse de `GET /api/public/agencies`, à côté de `data` ; la liste garde son tri déclaré, l'agence mise en avant y garde son rang. Aucun tri ne lit `agency_spotlights`.
4. **L'éligibilité se juge à la lecture, sans écriture, par la requête même de `data`.** La place n'est émise que si l'agence passe le filtre de la liste **pour cette ville** (active, `standard`, au moins un bien public — et, sous `filter[city]`, au moins un bien public dans cette ville) : une agence sans bien public à Dakar n'a pas la vitrine de Dakar, même si sa place y court ; suspendre une agence la retire de la vitrine à la requête suivante, sa place restant intacte — et la retrouvant à la levée de la suspension si la période court encore. L'offre ne vérifie pas que l'agence opère dans la ville : ce qu'elle publie bouge pendant la période, la lecture tranche à chaque requête.
5. **La ville du filtre se résout par son nom**, `filter[city]` étant un nom de ville : la ville du référentiel de ce nom (`GeoAddressCanonicalizer::villeParNom`, unique dans le pays). Un nom ambigu ou inconnu n'a pas de vitrine ; sans filtre, la place de `geo_city_id` nul.
6. **Offerte seulement, par le super-admin** : `GET/POST/DELETE /api/admin/agency-spotlights`, rangées avec la console des crédits et boosts (ADR-0061, TCK-633 lot F) — même garde (`super-admin`, aucun geste plateforme délégué), écritures sous second facteur récent (`ProtectedActions::STEP_UP`), journal `super_admin_agency_spotlight_granted` / `…_revoked`.

## Conséquences

- Une seule vitrine par ville est une **propriété de la base**, vraie quel que soit le chemin d'écriture — y compris l'achat de TCK-2525, qui devra composer avec une place offerte qui chevauche (son amendement d'ADR-0061 le tranche).
- `btree_gist` entre dans le schéma : le `down()` de la migration la retire, ce qui échouerait si une autre table venait à en dépendre — il faudra alors l'ôter de ce `down()`.
- Une agence suspendue garde des places « actives » en base qui ne s'affichent pas : une statistique qui compterait les places en compterait d'invisibles. La vente (TCK-2525) devra dire si elle rembourse.
- Pas de mise en avant d'un agent : elle n'est pas demandée, et la table ne la prévoit pas.

## Application

- Migration `2026_11_09_110100_create_agency_spotlights_table` (extension, deux contraintes d'exclusion, `CHECK (ends_at > starts_at)`), modèle `App\Models\AgencySpotlight`.
- `App\Http\Controllers\Api\Admin\AdminAgencySpotlightController` et ses FormRequests ; `PublicAgencyController::index` pour la racine `spotlight`.
- Gardé par `tests/Feature/Directory/AgencySpotlightTest.php` : chevauchement refusé (par la requête ET par la base), agence suspendue, `individual`, sans bien public ou sans bien public dans la ville jamais émise sans écriture sur la place, rang inchangé, période ramenée en UTC.
