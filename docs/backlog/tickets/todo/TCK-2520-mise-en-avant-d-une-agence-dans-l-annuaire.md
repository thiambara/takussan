---
id: TCK-2520
title: Mise en avant d'une agence dans l'annuaire, par ville et période, offerte par la plateforme
status: todo
phase: P1
family: full
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2521, TCK-2525]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#124-agencyspotlight-"
tags: [back, front, super-admin, directory, audit-ux]
---

## Objectif utilisateur

Une agence peut occuper la vitrine de l'annuaire d'une ville ; le chercheur la voit signalée comme telle, sans que l'ordre de la liste en soit changé.

## Contrat de données

- Table `agency_spotlights` (cf. `spec_refs.models`) : agence, ville (`geo_city_id`, `null` = annuaire sans ville), période ; au plus une place active par ville et par instant — contrainte d'exclusion `EXCLUDE USING gist (geo_city_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` (extension `btree_gist` ; une ville `null` se garde par un index d'exclusion partiel à part, `=` ne joignant pas deux `NULL`).
- Super-admin : `GET/POST/DELETE /api/admin/agency-spotlights` (capacité de plateforme sur la mise en avant, TCK-633 lot F), journalisé ; un chevauchement → 422 lisible.
- Public : `GET /api/public/agencies?filter[city]=…` émet `spotlight` (l'agence active pour cette ville, avec sa `cover` de TCK-2518) à côté de la liste, **sans retirer l'agence de son rang** (décision 1a du porteur, 2026-11-09). Une agence suspendue ou inactive n'est jamais émise.

## Direction UX / Artistique

- Console super-admin : une section « Mise en avant d'agences » dans la page des crédits et boosts — liste, ville, période, motif, bouton « Offrir » ; formes et champs de la console existants.
- Public : servie par TCK-2521.

## Contraintes strictes (métier)

- **Offerte seulement.** La vente de la place en crédits est TCK-2525, qui commence par un **amendement d'ADR-0061** (la mise en avant s'étend d'un bien à une agence).
- Une seule vitrine par ville : jamais deux « Mise en avant » en tête.
- Le classement de la liste ignore les places (aucun tri par place).

## Delta à produire

- [ ] Migration (avec `btree_gist`) + modèle `AgencySpotlight`.
- [ ] Routes super-admin + FormRequests + journal.
- [ ] `spotlight` dans l'annuaire public.
- [ ] Section de console super-admin.
- [ ] Tests (chevauchement refusé, agence suspendue jamais émise, rang inchangé).

## Critères d'acceptation

- [ ] AC1 — Deux places qui se chevauchent sur Dakar : la seconde est refusée (422), la base n'en garde qu'une.
- [ ] AC2 — L'agence mise en avant à Dakar apparaît dans `spotlight` ET à son rang dans `data`, au même rang que sans la place.
- [ ] AC3 — Suspendre l'agence la retire de `spotlight` à la requête suivante, sans écriture sur la place.

## Hors périmètre

- La vente en crédits : TCK-2525 (amendement d'ADR-0061 d'abord).
- La mise en avant d'un agent.

## Notes d'implémentation

- **Décision écrite : [ADR-0092](../../../adr/0092-une-agence-mise-en-avant-par-ville-gardee-par-la-base.md)** (une place par ville et par instant gardée par la base, la place ne change pas le rang, éligibilité jugée à la lecture).
- **Prémisse corrigée : `tsrange`, pas `tstzrange`.** Les colonnes `starts_at`/`ends_at` sont des `timestamp` sans fuseau (convention du dépôt) ; `tstzrange()` sur elles dépend du `TimeZone` de la session et n'est pas immuable, donc refusée dans une expression d'index. Deux contraintes d'exclusion : `agency_spotlights_city_no_overlap` (`geo_city_id WITH =`) et `agency_spotlights_nocity_no_overlap` (partielle `WHERE geo_city_id IS NULL`, car `=` ne joint pas deux `NULL`), plus `CHECK (ends_at > starts_at)`. `btree_gist` créée par la migration (extension `trusted`), retirée par son `down()`.
- **Fuseau** : la période est ramenée en UTC avant la vérification et l'écriture (`StoreAgencySpotlightRequest::periode()`) — colonnes `timestamp` sans fuseau ; `2026-12-01T00:00:00+02:00` est rangé `2026-11-30 22:00:00`.
- **Message de chevauchement neutre** (« Une place est déjà réservée pour cette ville sur cette période. »), juste aussi quand la place prise est celle de la même agence ; `wo` = texte français.
- **Squelettes de chargement invisibles sur le fond de la console** (relevé de la revue) : défaut antérieur d'un composant partagé, hors de ce ticket → TCK-2534.
- **Course** : `StoreAgencySpotlightRequest` vérifie le chevauchement pour un 422 lisible ; la violation `23P01` de la contrainte, attrapée sous un point de sauvegarde (`DB::transaction` imbriquée), rend le même 422 sur `starts_at` (`credits.spotlight.overlap`). Ablation : le contrôle de la requête retiré, le test reste vert par la base ; la traduction de `23P01` retirée aussi, il rougit.
- **`spotlight` est une racine de `GET /api/public/agencies`**, à côté de `data` et `meta` — `null` sans place active ou éligible. Émise sur toutes les pages et quel que soit `filter[search]` : elle dépend de la ville seule.
- **La ville du filtre se résout par son nom** (`GeoAddressCanonicalizer::villeParNom`) — `filter[city]` est un nom ; un nom inconnu ou ambigu n'a pas de vitrine. Sans filtre de ville : la place de `geo_city_id` nul.
- **Éligibilité = la requête de `data`, ville comprise** (corrigé après la revue adverse) : `agencesDeLAnnuaire()` (active, `standard`, au moins un bien `publicPortfolio`) PLUS `filtrerParVille()` (au moins un bien public dont l'adresse porte le nom de la ville du filtre) servent à la fois la liste et la vitrine. Une agence mise en avant à Dakar sans bien public à Dakar (tout à Thiès) a `spotlight: null` ; une agence suspendue disparaît de la vitrine sans écriture sur sa place. L'offre n'impose pas que l'agence opère dans la ville : la lecture tranche, à chaque requête.
- **Routes** : `GET/POST /api/admin/agency-spotlights`, `DELETE /api/admin/agency-spotlights/{spotlight}`, rangées dans `routes/api/admin-credits.php` (super-admin seul) ; écritures sous `ProtectedActions::STEP_UP` ; journal `super_admin_agency_spotlight_granted` / `…_revoked`. `filter[when]=current|upcoming|past` sur la liste. Le motif est obligatoire (5 à 255 caractères).
- **Console** : onglet « Agences mises en avant » de `/super-admin/boosts/agences` (`AdminAgencySpotlights.tsx`). La date de fin est saisie **incluse** et convertie en borne exclue (minuit du lendemain) à l'envoi — gardé par le test du composant (ablation : rouge).
- **Tests** : `tests/Feature/Directory/AgencySpotlightTest.php` (11), `src/components/boost/admin/__tests__/AdminAgencySpotlights.test.tsx` (3).
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (vitrine = requête de `data` ville comprise) et § 2.9 (console, routes, UTC, chevauchement) ; `docs/models-spec.md` § 124 (`tsrange`, deux contraintes d'exclusion, ADR-0092).
