---
id: TCK-2637
title: "L'API dit pour chaque bien s'il est occupé, par qui, si le loyer du mois est rentré, et s'il est en ligne"
status: todo
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
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
- **Sparse fieldsets** : `occupancy` et `is_online` se demandent comme tout champ (`fields[properties]=…,is_online`, `include=occupancy`). Rien n'est servi quand on ne le demande pas.
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

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
