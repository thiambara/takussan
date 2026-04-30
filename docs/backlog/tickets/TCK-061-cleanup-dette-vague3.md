---
id: TCK-061
title: "Cleanup & dette technique post-Vague 3"
status: done
phase: P2
family: technique
estimate: S
created: 2026-04-23
updated: 2026-04-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#14-favoris--comparaison
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#5-booking
tags: [cleanup, tech-debt, orphans, spec-divergence]
---

## Contexte

Pendant la livraison de la Vague 3 (PRs #34–#38 + sync #39), plusieurs manquements, divergences spec/impl et bugs pré-existants ont été identifiés mais volontairement laissés hors scope des PRs concernées pour garder les groupes indépendants et les PRs merge-ables. Ce ticket les regroupe pour un pass de cleanup unique.

La plupart de ces items sont déjà tracés ailleurs (notes d'implé des tickets TCK-038 / TCK-043 / TCK-047, historique INDEX 2026-04-23, commentaire inline `src/lib/queries/saved-searches.ts:11-12`) — ce ticket consolide les actions.

## Objectif

Clore la dette introduite ou exposée par la Vague 3 : supprimer les composants orphelins, réconcilier les divergences spec/impl, fixer le bug `DashboardController::tenantStats()` et documenter les règles métier actuellement hard-codées côté front.

## Delta à produire

### A. Composants orphelins à supprimer (frontend)

Wave 3 a introduit des composants canoniques dans `src/components/property/` et laissé leurs prédécesseurs en place mais non référencés.

- [ ] `src/components/HomePage.tsx` — remplacé par `components/property/HomepageDiscovery.tsx` (cf. note TCK-038)
- [ ] `src/components/home/PropertyCard.tsx` — doublon non référencé (grep à confirmer avant `rm`)
- [ ] `src/components/properties/PropertyCard.tsx` — doublon non référencé
- [ ] `src/hooks/useFavorite.ts` — vérifier usage : si uniquement consommé par les orphelins ci-dessus, supprimer
- [ ] `src/app/actions/property.ts#toggleFavoriteAction` — si `useFavorite.ts` est supprimé et qu'aucun autre appelant ne subsiste, retirer la fonction

Procédure obligatoire avant chaque suppression : `grep -rn "<nom_symbole>" takussan-web/src` pour confirmer l'absence d'import. `npm run build` doit rester vert.

### B. Divergences spec ↔ implémentation à réconcilier

- [ ] **Saved searches — `notify` (spec) vs `notification_frequency` (back/front)** : TCK-047 parle d'un booléen `notify`, le backend expose l'enum `notification_frequency` ∈ `off|daily|weekly|instant` (cf. commentaire `src/lib/queries/saved-searches.ts:11-12`). Décision attendue : mettre à jour la spec TCK-047 pour refléter l'enum backend (source de vérité), puis `/sync-specs`.
- [ ] **Favoris — chemin de route** : note TCK-047 signale une divergence de path favoris entre spec et implé. Vérifier (`routes/api/*.php` côté back, `src/lib/queries/favorites.ts` côté front), retenir la version qui fait foi, aligner l'autre.
- [ ] **Homepage search — param incohérent** : TCK-038 AC mentionne `/properties?search={query}`, la Navbar pousse `city=`, le backend expose `q=`. Trois noms pour un même concept. Décision : retenir `q=` (aligné back + spatie query builder), mettre à jour la Navbar (`src/components/layout/Navbar.tsx`) et la spec TCK-038.

### C. Règles métier hard-codées à spec-er ou déplacer

- [ ] **TCK-043 — acompte 30 %** : le tunnel `/bookings` (`takussan-web/src/app/(public)/bookings/page.tsx`) calcule l'acompte en multipliant le total par 0.3 côté client. Aucune règle backend. Deux options :
  - Documenter la règle dans `docs/features.md#13-réservations-courte-durée--visites` et conserver le calcul client (acceptable si la règle est stable).
  - Déplacer le calcul backend via `GET /api/bookings/{booking}/quote` ou au sein de `BookingPaymentRequest` (préférable si la règle doit varier par type de bien ou contrat).
- [ ] **TCK-043 — redirect anonyme manuel** : note d'implé indique un push manuel vers `/auth/login?redirect=/bookings?property=<slug>` plutôt que `useRequireAuth`. Décider si ce pattern devient la norme pour les flows "le bien d'abord, puis le login" ou si on standardise sur `useRequireAuth` partout.

### D. Bugs pré-existants exposés par la Vague 3

- [ ] **`DashboardController::tenantStats()` — champ inexistant** : `takussan-api/app/Http/Controllers/Api/DashboardController.php:108` filtre `MaintenanceRequest::where('reported_by_id', $userId)`. Le modèle `MaintenanceRequest` n'expose pas de colonne `reported_by_id` (cf. `database/migrations/*maintenance_requests*` + `$fillable`). Bug pré-existant (pas introduit par Vague 3) mais mis en lumière par TCK-032. Corriger en utilisant le champ réel (vérifier `customer_id` ou la relation `requestedBy`) + ajouter un test `DashboardControllerTest::test_tenant_stats_counts_open_maintenance`.

### E. Traçabilité (pas d'action code)

- [ ] `session-expired` 401 redirect RSC — déjà corrigé par PR #40 (route handler `src/app/api/auth/session-expired/route.ts`). Mentionné ici pour clôture documentaire uniquement.

## Critères d'acceptation

- [ ] Les 4 composants / hooks orphelins listés en §A sont supprimés ou justifiés (s'il reste un usage légitime, le noter dans ce ticket)
- [ ] La spec TCK-047 reflète `notification_frequency` (pas `notify`) — validation via `/sync-specs` sans warning résiduel
- [ ] La Navbar et la spec TCK-038 utilisent le même nom de param que le backend pour la recherche plein-texte
- [ ] La règle "30 % acompte" est soit documentée dans `features.md`, soit déplacée backend
- [ ] `DashboardController::tenantStats()` ne référence plus de colonne inexistante, et un test couvre le nombre d'`open_maintenance` retourné pour un `Customer` donné
- [ ] `npm run build` et `php artisan test` restent verts après chaque suppression

## Hors périmètre

- Refactor global des PropertyCards (harmonisation API des props) — hors scope, se fait si besoin dans un ticket dédié
- Mise à jour du memory `project_pr_target_branch.md` (opération non-code)
- Révision des règles métier de réservation au-delà de l'acompte (annulation, remboursement, délais) → P3 futur

## Notes d'implémentation

### A. Composants orphelins supprimés

Audit réel (grep `from.*<path>`) : périmètre élargi à 10 fichiers orphelins vs les 4 listés initialement. Un consommateur de `components/home/PropertyCard` (`PropertySimilar.tsx`) a été migré vers le canonique `components/property/PropertyCard` avant suppression.

Supprimés :

- `src/app/page.tsx.backup` — fichier de sauvegarde
- `src/components/HomePage.tsx` — remplacé par `components/property/HomepageDiscovery.tsx`
- `src/components/home/PropertyCard.tsx` — remplacé par `components/property/PropertyCard.tsx`
- `src/components/home/CategoryGrid.tsx` — non référencé
- `src/components/home/Hero.tsx` — non référencé (HomepageDiscovery a son propre Hero)
- `src/components/home/PropertyGrid.tsx` — non référencé
- `src/components/properties/PhotoGallery.tsx` — non référencé
- `src/components/properties/PropertyCard.tsx` — doublon, référencé uniquement depuis `page.tsx.backup`
- `src/components/properties/PropertySkeleton.tsx` — non référencé
- `src/components/search/PropertiesPage.tsx` — remplacé par `components/property/PropertiesDiscoveryPage.tsx`

Conservés (bien vivants) :

- `src/hooks/useFavorite.ts` + `src/app/actions/property.ts#toggleFavoriteAction` — utilisés par la fiche bien `(public)/properties/[slug]/page.tsx`. La note TCK-047 les qualifiait d'orphelins par erreur.
- `src/components/home/Footer.tsx` + `Navbar.tsx` — consommés par HomepageDiscovery et PropertiesDiscoveryPage.

Le dossier `src/components/properties/` a été supprimé (devenu vide).

### B. Divergences spec réconciliées

- **TCK-047** : contrat favoris aligné sur `POST /api/favorites { property_id }` + `DELETE /api/favorites/{property}` (au lieu de `POST/DELETE /api/properties/{property}/favorite` qui n'existe pas). Saved searches documentées avec `notification_frequency: 'off'|'daily'|'weekly'|'instant'` (au lieu de `notify: bool`) + note sur le défaut `off`.
- **TCK-038** : param de recherche documenté explicitement : le champ « Où cherchez-vous ? » de la Navbar pousse `city={query}` (localisation), `q=` est réservé à un futur champ mot-clé fulltext. Les AC/Delta/Notes ont été mis à jour.
- **Favoris — route path** : aucune divergence réelle côté code (`src/lib/queries/favorites.ts` est aligné sur le back). La note TCK-047 faisait référence à la divergence spec ticket vs spec back, maintenant résolue via le point ci-dessus.

### C. Règle métier documentée + refactor léger

- `docs/features.md §1.3` : la ligne « Paiement d'acompte et solde » mentionne désormais explicitement « acompte = 30 % du total », avec une note sur l'évolution vers `GET /api/bookings/quote` si la règle doit varier.
- `BookingTunnel.tsx:87` : le `0.3` magique est remplacé par une constante nommée `BOOKING_DEPOSIT_RATE` (au-dessus du composant) avec un commentaire pointant vers la spec et la future migration backend. Aucun changement de comportement.
- **Redirect anonyme booking** : choix conservé tel quel (`push manuel` vers `/auth/login?redirect=/bookings?property=<slug>`). Pas de standardisation vers `useRequireAuth` dans ce pass — décision reportée pour éviter de changer le flow sans besoin immédiat.

### D. Bug `DashboardController::tenantStats()`

- `app/Http/Controllers/Api/DashboardController.php:108` : `where('reported_by_id', $userId)` → `where('requester_id', $userId)`. Le modèle `MaintenanceRequest` expose la colonne `requester_id` (cf. migration `2026_04_17_160019_create_maintenance_requests_table.php:15`).
- Test de régression : `tests/Feature/Api/DashboardStatsTest::test_tenant_stats_counts_open_maintenance_by_requester` — crée 2 open + 1 completed pour le tenant connecté + 1 open pour un autre user, vérifie que `data.open_maintenance === 2`.
- **Pourquoi le test existant ne détectait pas** : `test_tenant_stats` n'asserte que la structure (`['active_lease', 'overdue_payments']`), pas le champ `open_maintenance`, et SQLite levait l'erreur uniquement si la clause était exécutée avec un `Customer` présent + aucune table retournant avant l'appel.

### E. Bonus — réparations cross-cutting

Trois items hors scope strict du ticket mais détectés pendant l'exécution :

- `src/lib/queries/__tests__/properties.test.ts:105` — bloc `it(...)` non fermé avant `describe('boundsToString')` suivant, provoquait un `PARSE_ERROR` en lint et un test file ignoré. Corrigé (ajout du `});\n});` manquant) : frontend passe de 96 → 108 tests Vitest verts, lint de 1 erreur → 0 erreur.
- `takussan-api/vendor/barryvdh/laravel-dompdf` manquant localement alors que `composer.lock` le référence. Pas de correctif code — juste `composer install` pour aligner l'environnement. Les 2 tests `ExportControllerTest::test_pdf_*_export_returns_pdf` passent après install.
- Aucun changement de code backend requis au-delà du fix §D.

### Vérifications finales

- `./vendor/bin/pint` : `{"result":"pass"}`
- `php artisan test --filter=DashboardStatsTest` : 6/6 verts (incluant la régression)
- `npm run lint` : 0 erreurs, 5 warnings pré-existants (non introduits par ce ticket)
- `npm run test -- --run` : 108/108 verts (12 fichiers)
- `npm run build` : clean, toutes les routes RSC build sans erreur

### Suivi optionnel

- `useFavorite.ts` contient le bug mineur signalé par la note TCK-047 (il envoie `favoriteId` au `DELETE` alors que le back attend `property_id`). Bug non reproduit dans un test — à suivre dans un ticket P3 si le comportement devient gênant, ou absorbé quand la fiche bien basculera sur `FavoriteButton` (canonique).
