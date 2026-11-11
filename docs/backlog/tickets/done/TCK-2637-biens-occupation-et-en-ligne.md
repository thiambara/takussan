---
id: TCK-2637
title: "L'API dit pour chaque bien s'il est occupé, par qui, si le loyer du mois est rentré, et s'il est en ligne"
status: done
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2638, TCK-2639, TCK-2678]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
tags: [back, properties, leases, audit-ux, app]
---

## Objectif utilisateur

L'agence et le bailleur savent, pour chaque bien de la liste et sur sa fiche, s'il est occupé, par qui et jusqu'à quand, si le loyer du mois est rentré, depuis quand il est vacant, et s'il est réellement visible du public.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** (audit famille 4, § 1 ; re-mesuré dans le code) :

- `GET /api/properties` (`PropertyController@index` → `Property::buildQuery`) n'a **aucune donnée d'occupation**. Il n'existe ni bail courant, ni locataire, ni état du loyer, ni date de début de vacance. Seule la relation `Property::leases(): HasMany` (`Property.php:1022`) existe.
- Le prédicat « visible du public » existe : `scopePublic` (`Property.php:607-624`). Il exige agence active, `visibility = public`, `is_test = false`, `published_at` non nul et un statut hors `NON_PUBLIC_STATUSES`. Il est servi comme **filtre** (`filter[public]`, `:734`) mais jamais comme **champ** d'une ligne. Le front ne peut donc pas l'afficher sans le recopier.
- La tuile « Publiés » compte `filter[public]=1`. La pastille de ligne ne lit que `visibility` (`PropertyList.tsx:577-599`, libellé « Publié » / « Brouillon »). Le même mot recouvre donc deux mesures.

**À servir** (consommé par TCK-2638 et TCK-2639) :

- **Bloc `occupancy`** sur `GET /api/properties` et `GET /api/properties/{id}`, sur demande (`include=occupancy`) :
  - `state` vaut `occupied`, `notice` ou `vacant` ;
  - `lease` : `id`, `reference_number`, `type`, `start_date`, `end_date` ;
  - `tenant` : nom et téléphone ;
  - `rent` : montant et période ;
  - `current_month` : `status` (`paid`, `due`, `late` ou `none`), `due_date`, `days_late`, `late_fee_outstanding` ;
  - `vacant_since`.
- **Champ `is_online`** (booléen) sur toute ligne de bien.
- **Filtres** :
  - `filter[occupancy]=occupied|vacant|notice` ;
  - `filter[rent_late]=1` ;
  - `filter[tenant]=<texte>`, qui cherche sur le locataire du **bail en cours** seulement.
- **Tri** `sort=retard` : les retards d'abord, du plus ancien au plus récent, puis les autres biens.
- **`GET /api/properties/portfolio-summary`** : les comptes des tuiles en un seul appel, sous les mêmes portées que la liste (`user_id`, `only_mine`, `include_archived`). Clés : `total`, `occupied`, `vacant`, `vacant_over_60_days`, `rent_late`, `rent_late_amount`, `notice`, `online`.

## Contraintes strictes (métier)

- **« En ligne » n'a qu'un prédicat** ([décision 6 du porteur](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10), [ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md)). `is_online` et `filter[public]` lisent **le même code**, une méthode extraite (`Property::isOnline()` ou équivalent). La règle ne doit pas être copiée une seconde fois.
- **Bail courant** :
  - c'est un bail `active` ou `terminating` dont `start_date ≤ aujourd'hui`. Un bail `pending_signature` n'occupe pas encore le bien ;
  - c'est **la même règle** que l'occupation du jour des rapports (famille 3, TCK-2626 : `Lease::ONGOING_STATUSES` dans `PortfolioMetrics::longStayOccupancyToday`). Un seul prédicat, partagé : la tuile « occupés » de la liste et le taux d'occupation de l'accueil du bailleur ne doivent pas compter des baux différents. Le premier des deux tickets mergé l'extrait, l'autre le reprend ;
  - un bien qui a plusieurs baux courants (lots) relève de l'immeuble → hors périmètre. Le bien prend alors le bail le plus récent, et le test le documente.
- **État `notice`** : le bail courant est `terminating`, ou bien `early_termination_requested_at` est posé.
- **`vacant_since`** :
  - c'est la fin effective du dernier bail : `terminated_at`, sinon `end_date` ;
  - un bien jamais loué rend `null`. Le front dira « Sans locataire », pas « Vacant depuis ».
- **`current_month`** : il lit l'échéance de loyer du mois courant (jamais celle de caution), avec le même calcul d'`amount_due` et de `late_fee_outstanding` que `GET /api/payments/history`. Le calcul ne doit pas être copié.
- **Confidentialité** : le bloc `tenant` (nom, téléphone) n'est servi qu'à un appelant qui peut `view` le bail, avec **la même projection** que `GET /api/leases?include=tenant` pour ce même appelant. Un bailleur ne lit que le locataire de ses biens. Sans droit sur le bail, le bloc `tenant` est absent, et `state` reste servi.
- **Sparse fieldsets** : `occupancy` et `is_online` se demandent par include (`include=occupancy`, `include=online`). Rien n'est servi quand on ne le demande pas. *(Réécrit le 2026-11-11 : `fields[properties]=…,is_online` contredisait ADR-0021 — voir les Notes et l'amendement d'ADR-0097 § 1.)*
- **Performance** : une page de 50 biens se lit en un nombre **constant** de requêtes SQL, sans requête par bien.

## Delta à produire

- [ ] Relation `Property::currentLease()` (`HasOne` + `latestOfMany` sur les statuts du bail courant).
- [ ] Service `App\Services\Property\PropertyOccupancy`, qui calcule les blocs d'une page entière en lot.
- [ ] `Property::isOnline()`, partagé avec `scopePublic`. `is_online` dans `PropertyResource`.
- [ ] Filtres `occupancy`, `rent_late` et `tenant` (rappels de `buildQuery`, repli de casse par `App\Support\CaseInsensitive`). Tri personnalisé `retard`.
- [ ] Route `GET /api/properties/portfolio-summary` → `PropertyPortfolioController@summary`, sous la même autorisation que l'index.
- [ ] Tests :
  - `PropertyOccupancyTest` : occupé payé, occupé en retard de 6 j, préavis, vacant depuis la fin du bail, jamais loué ;
  - `PropertyOnlineFlagTest` : parité `is_online` ↔ `filter[public]` ;
  - `PropertyPortfolioSummaryTest` ;
  - `PropertyOccupancyVisibilityTest` ;
  - `PropertyOccupancyQueryCountTest`.

## Critères d'acceptation

- [ ] AC1 — Un bien dont le bail actif a l'échéance de novembre échue depuis 6 jours et non payée rend `occupancy.state=occupied`, `current_month.status=late`, `days_late=6` et le nom du locataire. Le même bien, une fois l'échéance payée, rend `status=paid`.
- [ ] AC2 — Sur un jeu de 8 biens qui croise statut, visibilité, `published_at`, agence suspendue et `is_test` :
  - l'ensemble des biens dont `is_online=true` est **exactement** celui que rend `filter[public]=1` ;
  - le test rougit si l'on retire une condition d'un seul des deux (vérifié par ablation).
- [ ] AC3 — Les comptes de `portfolio-summary` égalent les `meta.total` des listes filtrées correspondantes, pour l'admin d'agence, pour l'agent en `only_mine` et pour un bailleur.
- [ ] AC4 — Un agent d'une autre agence, ou un bailleur qui n'est pas celui du bail, ne reçoit ni nom ni téléphone de locataire. La réponse reste 200, sans bloc `tenant`.
- [ ] AC5 — `filter[tenant]=diouf` rend le bien dont le bail **en cours** a pour locataire « Yacine DIOUF ». Il ne rend pas un bien dont seul un bail terminé avait ce locataire.
- [ ] AC6 — Le nombre de requêtes SQL de `GET /api/properties?include=occupancy` est le même pour 10 biens et pour 50 biens.

## Hors périmètre

- L'écran (TCK-2638, TCK-2639).
- L'agrégation d'un immeuble par ses lots (« 4 lots sur 6 occupés »).
- Le sens du quota d'annonces (`QuotaResolver`, statuts « actifs ») : question ouverte de [ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md) (§ 6 : inchangé dans ce lot).
- Le libellé des statuts et de la visibilité : c'est le front qui le porte (TCK-2638, TCK-2639).

## Notes d'implémentation

**2026-11-11 — implémenté sur `feat/audit-ux-app-lot-1`.**

**Prémisse re-mesurée — ce qui diffère du ticket :**

- `scopePublic` est à `Property.php:609-625` avant ce ticket (et non 607-624). Le filtre `filter[public]` existait déjà.
- **Le bail courant suit la règle d'`Occupation` (TCK-2640), plus stricte que celle du ticket** : statut
  `active`/`terminating`, commencé, ET ni échu ni résilié (`LEAST(end_date, terminated_at) ≥ aujourd'hui`).
  C'est la règle de l'occupation du tableau de bord (TCK-2626) : un bail `active` dont le terme est passé
  n'occupe plus le bien. `Occupation` porte désormais la règle au niveau du bail (`occupying()`, `current()`) ;
  `whereOccupied()` (carnet des bailleurs) la lit. **`PortfolioMetrics::longStayOccupancyToday()` en garde une
  copie en SQL brut, identique** : non touché (voie de l'accueil) — à faire converger.
- **Plusieurs baux courants** (28 biens sur 227 occupés dans la démo, le 2026-11-11) : le plus récent par
  `(start_date, id)`. `currentLease()` est un `HasOne` contraint par `Occupation::current()` (un `NOT EXISTS`
  d'un bail courant plus récent), et non un `latestOfMany` : la même clause sert la relation, les filtres, le tri
  et le résumé, ce qu'un `ofMany` ne permettait pas en sous-requête scalaire.
- **`current_month.status`** vaut `paid`, `late`, `partial`, `due` ou `none` : c'est `RentMonthStatus::of()`,
  extraite telle quelle d'`OwnerStatementService::monthStatus()` (TCK-2649) — `partial` en plus des quatre
  valeurs du ticket. Relevé du bailleur inchangé : 280 relevés de la démo identiques octet pour octet avant/après
  (`month_status` compris).
- **`rent_late` et `sort=retard` lisent le loyer DU MOIS** (comme la ligne) : un bail dont seul un mois antérieur
  est impayé n'y entre pas (5 baux dans la démo le 2026-11-11). La relance des arriérés est TCK-2706 / l'historique.
- **`filter[occupancy]=occupied` compte les biens en préavis** : occupés + vacants = tous ; `notice` en est un
  sous-ensemble. Le bloc, lui, dit `notice` pour ces biens.
- **`is_online` se demande par `include=online`, et non par `fields[properties]=…,is_online`** comme le
  disent ce ticket (« Sparse fieldsets ») et ADR-0097 § 1 (« se demande comme tout champ »). Une première
  version l'acceptait dans `fields[]` par un mécanisme générique de champs dérivés (`HasQueryBuilder`,
  `DepartageQueryBuilder`) : refusée à la revue du 2026-11-11 — c'est la voie (b) qu'ADR-0021 a écartée le
  2026-10-20, et le mécanisme l'aurait ouverte à tout le dépôt. Retiré ; `include=online` est une inclusion
  calculée (`InclusionLueParLeControleur`, comme `include=occupancy`), sur la liste comme sur la fiche, clé
  absente sans elle ; `fields[properties]=…,is_online` rend 400. Calculé pour la page en une requête par
  `scopePublic` lui-même (`Property::onlineAmong()`, `isOnline()`). **ADR-0097 § 1 est à amender** sur ce point.
- **Requêtes (démo, 2026-11-11, super-admin)** : `include=occupancy,online` → 24 requêtes pour 10 comme pour 50
  biens ; `online` seul coûte 1 requête, `occupancy` 6 (17 sans inclusion).
- **AC4** : un agent d'une autre agence n'atteint pas le bien (`PropertyPolicy::view` refuse la fiche, 403 ; la
  liste ne le porte pas). Le cas 200 sans `tenant` est celui d'un bailleur dont le bien a changé de titulaire
  (TCK-999) ou d'un bail saisi par l'agent (`landlord_id` = l'agent, TCK-1926). Sans droit sur le bail, `lease`,
  `rent` et `current_month` sont retirés avec `tenant` (ils disent le loyer et l'arriéré).
- **`vacant_since`** : `COALESCE(terminated_at, end_date)` le plus récent des baux commencés (hors `draft`,
  `pending_signature`). Un bien jamais loué : `null`, et il n'entre pas dans `vacant_over_60_days`.
- **`rent_late_amount`** : la somme des `current_month.amount_due` des biens en retard (`amountDue()` de
  l'historique : la pénalité n'y est que si l'agence l'encaisse en ligne).
- `only_mine` n'existe que côté front (`filter[user_id]`) : le résumé lit les filtres de la liste.

**Fichiers** : `Occupation`, `PropertyOccupancy`, `PropertyListScope` (portée de l'index extraite),
`RentMonthStatus`, `PropertyRentLateSort`, `PropertyPortfolioController`, `Lease::scopeVisibleTo` (clause de
`LeaseController::index` extraite) et `scopeCurrent`.

**Reste** : les autres listes de biens (`children`, `me/owner-profiles/…/properties`, `admin/agencies/…`)
acceptent `include=occupancy,online` sans les rendre ; `vacant_over_60_days` n'a pas de filtre de liste.

