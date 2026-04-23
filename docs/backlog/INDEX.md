# Backlog — Takussan

> Vue kanban projetée depuis les frontmatters des `tickets/*.md`.
> À l'avenir cet index pourra être régénéré automatiquement — en attendant, le
> maintenir à la main quand un ticket change de `status`.
>
> **Convention d'ID** : `TCK-NNN` (séquentiel, jamais réutilisé).
> **Template** : voir [`_template.md`](_template.md).
> **Archive** : [`_archive/`](_archive/).

## Légende

| Champ | Valeurs |
|---|---|
| `status` | `todo` · `doing` · `review` · `done` · `blocked` · `obsolete` |
| `phase` | `P0` · `P1` · `P2` · `P3` · `EF` (évolution future) |
| `family` | `back` · `front` · `applicatif` · `technique` · `evolution` |
| `estimate` | `S` ≤2j · `M` 3–5j · `L` 6–10j · `XL` >10j |

> ⚠️ **Section "Partiellement implémenté"** — le code est sur `dev` mais le ticket n'est pas
> fermable en l'état. Voir la rubrique `## État réel (audit 2026-04-22)` dans chaque
> ticket pour le delta restant. Statut frontmatter reste `todo` tant que le gap n'est pas
> clos.

---

## 📋 Todo

_(vide — Vague 3 a vidé le backlog Todo)_

## 🔶 Partiellement implémenté (code sur dev, delta résiduel)

_(vide — TCK-038 / TCK-039 absorbés par Vague 3 PR #36)_

## 🚧 Doing

_(vide)_

## 👀 Review

> **Vague 1** — PRs mergées sur `dev` 2026-04-22 (#24, #25, #26, #27 + sync #28). Statut reste `review` jusqu'à confirmation AC.
> **Vague 2** — PRs mergées sur `dev` 2026-04-22 (#29, #30, #31, #32 + sync #33).
> **Vague 3** — PRs ouvertes vers `dev` 2026-04-23 (#34, #35, #36, #37, #38) en attente de merge.

### Phase 0 — Fondation Frontend — Vague 1 [PR #25](https://github.com/thiambara/takussan/pull/25) · Vague 2 [PR #32](https://github.com/thiambara/takussan/pull/32)

- [TCK-055](tickets/TCK-055-layout-navigation.md) — Layout System + Navigation `M · P0 · front` (PR #32)
- [TCK-056](tickets/TCK-056-auth-middleware-protection.md) — Auth Middleware + Route Protection `S · P0 · front` (PR #25)
- [TCK-057](tickets/TCK-057-api-client-react-query.md) — API Client + Data Fetching (React Query) `S · P0 · front` (PR #25)
- [TCK-058](tickets/TCK-058-i18n-setup.md) — i18n Setup (FR/EN/WO) `S · P0 · front` (PR #25)
- [TCK-059](tickets/TCK-059-form-patterns-validation.md) — Form Patterns + Validation (Zod + RHF) `S · P0 · front` (PR #32)

### Phase 1 — Socle Backend — Vague 1 [PR #24](https://github.com/thiambara/takussan/pull/24) (identité) · [PR #26](https://github.com/thiambara/takussan/pull/26) (property) · Vague 2 [PR #29](https://github.com/thiambara/takussan/pull/29) (identity+i18n)

- [TCK-014](tickets/TCK-014-roles-permissions.md) — Rôles & permissions `M · P0 · applicatif` (PR #24)
- [TCK-015](tickets/TCK-015-agency-team.md) — Agence & équipe `M · P0 · applicatif` (PR #29)
- [TCK-016](tickets/TCK-016-media-files.md) — Médias & fichiers `M · P0 · applicatif` (PR #24)
- [TCK-017](tickets/TCK-017-i18n-preferences.md) — Internationalisation & préférences `S · P0 · applicatif` (PR #29 back + #32 front)
- [TCK-022](tickets/TCK-022-notifications.md) — Notifications `M · P0 · applicatif` (PR #24)
- [TCK-035](tickets/TCK-035-property-address-media.md) — Property — Adresse & médias `S · P0 · back` (PR #26)
- [TCK-036](tickets/TCK-036-property-tags-collabs-price.md) — Property — Tags, collaborateurs & prix `M · P0 · back` (PR #26)

### Phase 2 — Front Public & Discovery — Vague 3 [PR #36](https://github.com/thiambara/takussan/pull/36)

- [TCK-038](tickets/TCK-038-homepage-discovery.md) — Page d'accueil & découverte `S · P0 · front` (PR #36)
- [TCK-039](tickets/TCK-039-search-results.md) — Liste résultats de recherche `M · P0 · front` (PR #36)
- [TCK-047](tickets/TCK-047-share-saved-searches-front.md) — Favoris, carte & partage — Frontend `M · P1 · front` (PR #36)

### Phase 2 — Front Dashboard Agent — Vague 3 [PR #37](https://github.com/thiambara/takussan/pull/37)

- [TCK-041](tickets/TCK-041-dashboard-agent-properties.md) — Dashboard Agent — Layout & biens `M · P0 · front` (PR #37)
- [TCK-042](tickets/TCK-042-dashboard-agent-crm.md) — Dashboard Agent — CRM `M · P0 · front` (PR #37)

### Phase 3 — Opérations Métier — Vague 1 [PR #26](https://github.com/thiambara/takussan/pull/26) (favorites) · [PR #27](https://github.com/thiambara/takussan/pull/27) (ops) · Vague 2 [PR #30](https://github.com/thiambara/takussan/pull/30) (payments) · [PR #31](https://github.com/thiambara/takussan/pull/31) (maintenance+inventory back) · Vague 3 [PR #34](https://github.com/thiambara/takussan/pull/34) (ops front) · [PR #35](https://github.com/thiambara/takussan/pull/35) (maintenance+inventory front)

- [TCK-026](tickets/TCK-026-short-term-bookings.md) — Réservations courte durée (backend) `M · P1 · back` (PR #27)
- [TCK-027](tickets/TCK-027-long-term-leases.md) — Location longue durée — baux (backend) `L · P1 · back` (PR #27)
- [TCK-028](tickets/TCK-028-transactions-payments.md) — Transactions & paiements `L · P1 · applicatif` (PR #30)
- [TCK-029](tickets/TCK-029-messaging.md) — Communication & messagerie (backend) `M · P1 · back` (PR #27)
- [TCK-030](tickets/TCK-030-maintenance-requests.md) — Maintenance & interventions `M · P1 · applicatif` (PR #31 back + #35 front)
- [TCK-031](tickets/TCK-031-inventory-inspections.md) — État des lieux & inventaires `M · P1 · applicatif` (PR #31 back + #35 front · export PDF reporté P2)
- [TCK-033](tickets/TCK-033-reviews-reputation.md) — Avis & réputation `M · P2 · applicatif` (PR #27)
- [TCK-043](tickets/TCK-043-bookings-frontend.md) — Réservations — Frontend tunnel `M · P1 · front` (PR #34)
- [TCK-044](tickets/TCK-044-leases-frontend.md) — Baux — Frontend gestion `M · P1 · front` (PR #34)
- [TCK-045](tickets/TCK-045-messaging-frontend.md) — Messagerie — Frontend `M · P1 · front` (PR #34)
- [TCK-046](tickets/TCK-046-favorites-map.md) — Favoris & carte interactive (backend) `M · P1 · back` (PR #26)

### Reporting transverse — Vague 3 [PR #38](https://github.com/thiambara/takussan/pull/38)

- [TCK-032](tickets/TCK-032-reporting-dashboards.md) — Reporting & tableaux de bord `L · P1 · applicatif` (PR #38 — P1+P2+P3 full)

## ✅ Done

### Phase 0 — Fondation Backend

- [TCK-048](tickets/TCK-048-base-model-api-response.md) — API Response Infrastructure (base resource + error handler) `M · P0 · back`
- [TCK-049](tickets/TCK-049-spatie-permission-activitylog.md) — Spatie Permission + ActivityLog Setup `M · P0 · back`
- [TCK-050](tickets/TCK-050-spatie-medialibrary-upload.md) — Spatie MediaLibrary + Upload Infrastructure `S · P0 · back`
- [TCK-051](tickets/TCK-051-formrequest-validation.md) — FormRequest Base + Validation Patterns `S · P0 · back`
- [TCK-052](tickets/TCK-052-scout-search-infrastructure.md) — Laravel Scout + Search Infrastructure `S · P0 · back`
- [TCK-053](tickets/TCK-053-test-infrastructure.md) — Test Infrastructure + Base Test Classes `M · P0 · back`

### Phase 0 — Fondation Frontend

- [TCK-054](tickets/TCK-054-design-system-components.md) — Design System + Component Library `M · P0 · front`

### Phase 1 — Socle Backend

- [TCK-013](tickets/TCK-013-auth-accounts.md) — Authentification & gestion de comptes `L · P0 · applicatif`
- [TCK-018](tickets/TCK-018-audit-trail.md) — Audit & traçabilité `S · P0 · applicatif`
- [TCK-020](tickets/TCK-020-crm-customers.md) — CRM & relation client `L · P0 · applicatif`
- [TCK-021](tickets/TCK-021-documents-contracts.md) — Documents & contrats `M · P0 · applicatif`
- [TCK-023](tickets/TCK-023-admin-configuration.md) — Administration & configuration `M · P0 · applicatif`
- [TCK-024](tickets/TCK-024-search-filters.md) — Recherche & filtres (backend) `M · P0 · applicatif`
- [TCK-034](tickets/TCK-034-property-crud-base.md) — Property — Modèle & CRUD base `M · P0 · back`

### Phase 2 — Front Public

- [TCK-040](tickets/TCK-040-property-detail.md) — Fiche bien immersive `M · P0 · front`
- [TCK-060](tickets/TCK-060-auth-pages-oauth.md) — Cycle auth front + OAuth multi-provider `M · P0 · applicatif`

---

## Graphe de dépendances

```
── Phase 0 : Fondation Backend ──
TCK-013 (auth)
TCK-013 ──▶ TCK-048 (BaseModelTrait + API Response)
TCK-013 ──▶ TCK-049 (Spatie Permission + ActivityLog)
TCK-048 ──▶ TCK-050 (Spatie MediaLibrary + Upload)
TCK-048 ──▶ TCK-051 (FormRequest Base + Validation)
TCK-048 ──▶ TCK-052 (Laravel Scout + Search)
TCK-048 + TCK-049 ──▶ TCK-053 (Test Infrastructure)

── Phase 0 : Fondation Frontend ──
TCK-013 ──▶ TCK-054 (Design System + Components)
TCK-054 ──▶ TCK-056 (Auth Middleware + Route Protection)
TCK-054 + TCK-056 ──▶ TCK-055 (Layout System + Navigation)
TCK-054 + TCK-056 ──▶ TCK-057 (API Client + React Query)
TCK-054 ──▶ TCK-058 (i18n Setup)
TCK-054 + TCK-057 ──▶ TCK-059 (Form Patterns + Validation)

── Phase 1 : Socle Backend ──
TCK-013 + TCK-049 ──▶ TCK-014 (roles)
TCK-013 + TCK-014 + TCK-049 ──▶ TCK-015 (agency)
TCK-013 + TCK-050 ──▶ TCK-016 (media)
TCK-058 ──▶ TCK-017 (i18n)
TCK-013 + TCK-049 ──▶ TCK-018 (audit)
TCK-013 + TCK-014 + TCK-015 + TCK-016 + TCK-048 + TCK-051 ──▶ TCK-034 (property CRUD)
TCK-034 + TCK-050 ──▶ TCK-035 (property address+media)
TCK-034 ──▶ TCK-036 (property tags+collabs+price)
TCK-013 + TCK-014 + TCK-048 + TCK-051 ──▶ TCK-020 (CRM)
TCK-013 + TCK-016 ──▶ TCK-021 (documents)
TCK-013 ──▶ TCK-022 (notifications)
TCK-013 + TCK-014 + TCK-049 ──▶ TCK-023 (admin config)
TCK-034 + TCK-052 ──▶ TCK-024 (search backend)

── Phase 2 : Front Public & Dashboard ──
TCK-054 + TCK-055 + TCK-058 + TCK-024 ──▶ TCK-038 (homepage)
TCK-054 + TCK-055 + TCK-057 + TCK-024 ──▶ TCK-039 (search results)
TCK-054 + TCK-055 + TCK-057 + TCK-035 ──▶ TCK-040 (property detail)
TCK-054 + TCK-055 + TCK-056 + TCK-057 + TCK-036 ──▶ TCK-041 (dashboard agent — biens)
TCK-054 + TCK-055 + TCK-056 + TCK-057 + TCK-020 ──▶ TCK-042 (dashboard agent — CRM)
TCK-013 + TCK-054 + TCK-055 + TCK-056 + TCK-057 + TCK-058 + TCK-059 ──▶ TCK-060 (cycle auth front + OAuth)

── Phase 3 : Opérations Métier ──
TCK-034 + TCK-020 + TCK-048 + TCK-051 ──▶ TCK-026 (bookings back)
TCK-054 + TCK-056 + TCK-057 + TCK-059 + TCK-026 ──▶ TCK-043 (bookings front)
TCK-034 + TCK-020 + TCK-048 + TCK-051 ──▶ TCK-027 (leases back)
TCK-054 + TCK-056 + TCK-057 + TCK-059 + TCK-027 ──▶ TCK-044 (leases front)
TCK-026 + TCK-027 ──▶ TCK-028 (transactions)
TCK-013 + TCK-034 ──▶ TCK-029 (messaging back)
TCK-054 + TCK-056 + TCK-057 + TCK-059 + TCK-029 ──▶ TCK-045 (messaging front)
TCK-034 + TCK-027 ──▶ TCK-030 (maintenance)
TCK-034 + TCK-027 ──▶ TCK-031 (inventory)
TCK-034 + TCK-027 + TCK-028 ──▶ TCK-032 (reporting)
TCK-013 + TCK-034 ──▶ TCK-033 (reviews)
TCK-034 + TCK-024 ──▶ TCK-046 (favorites + map back)
TCK-054 + TCK-056 + TCK-057 + TCK-046 + TCK-024 ──▶ TCK-047 (favorites + map + share front)
```

---

## Règles

1. **Un ticket ne recopie jamais une spec** — il pointe via `spec_refs` vers
   `features.md` / `models-spec.md`.
2. **`depends_on`** = autres tickets, pas des specs.
3. **L'IA refuse de démarrer** un ticket dont les `depends_on` ne sont
   pas `done`.
4. **Info manquante dans la spec** → PR sur la spec, pas dans le ticket.
5. **Post-déblocage EF** → lancer une passe `/sync-specs` après merge.
6. **Backend prescriptif, Front intentionnel** — les implementation specs prescrivent
   l'architecture côté Laravel (migrations, contrôleurs, routes, tests). Côté Next.js,
   elles reprennent la Direction UX + Contrat de données + Contraintes strictes du ticket,
   sans jamais prescrire noms de composants, structure de dossiers ou choix de state management.

## Historique

- **2026-04-15** — Création domaines : 21 tickets (TCK-013 → TCK-033) couvrant les 21 domaines de `features.md`.
- **2026-04-15** — Migration initiale : 12 tickets extraits de `_archive/warnings-backlog.md`.
- **2026-04-16** — Refonte backlog IA : scission TCK-019 (XL) → TCK-034/035/036, scission TCK-025 (L) → TCK-038/039/040, ajout TCK-037 (Design System), extraction frontends TCK-041→045, conversion TCK-026/027/029 en backend-only, nouveau template avec family back/front.
- **2026-04-16** — Ajout TCK-046 (favoris & carte backend) + TCK-047 (favoris, carte & partage frontend) pour couverture P1 complète de features.md §1.2.
- **2026-04-16** — Refonte fondation : suppression TCK-001→012 (P2/P3/EF améliorations futures) + TCK-037 (absorbé). Création Phase 0 : TCK-048→053 (6 back fondation) + TCK-054→059 (6 front fondation). Mise à jour dépendances tous tickets existants.
- **2026-04-20** — Ajout TCK-060 : refonte complète du cycle auth front (7 pages) + câblage OAuth multi-provider (Google, Facebook, Apple via Socialite) avec state CSRF.
- **2026-04-21** — Réconciliation INDEX vs réalité : TCK-013 (auth) + TCK-040 (fiche bien) + TCK-060 (auth front + OAuth) passés en `done` — tous livrés sur `master`/`dev`.
- **2026-04-22** — Audit complet backlog vs code (5 agents d'audit parallèles) : 13 tickets passés en `done` — les 8 ex-`review` (TCK-018, 048–054) déjà mergés sur `dev`, plus 5 tickets implémentés hors workflow (TCK-020 CRM, TCK-021 Documents, TCK-023 Admin, TCK-024 Search, TCK-034 Property CRUD). Nouvelle section `🔶 Partiellement implémenté` pour 17 tickets où du code est sur `dev` mais un delta résiduel subsiste (liste explicite des gaps par ticket). Section Todo réduite à 12 tickets vraiment non démarrés. Dédoublonnage TCK-050/051/052 (apparaissaient Todo + Review). Aucun changement de code applicatif.
- **2026-04-22** — Vague 1 livrée (4 agents parallèles sur worktrees) : 13 tickets passés en `review` via 4 PRs indépendantes. PR #24 (B-USER : TCK-014, 022), PR #25 (F : TCK-056, 057, 058), PR #26 (B-PROP : TCK-035, 036, 046), PR #27 (B-OPS : TCK-016, 026, 027, 029, 033). Total ~90 nouveaux tests backend + 1 PR frontend (lint/build OK, tests front reportés — scaffold sans runner). Pint clean partout.
- **2026-04-22** — Vague 2 livrée (4 agents parallèles sur worktrees) : 7 tickets passés en `review` via 4 PRs indépendantes. PR #29 (B-IDENTITY : TCK-015 rôle membre + stats, TCK-017 SetLocale + lang fr/en/wo), PR #30 (B-PAYMENTS : TCK-028 `POST /payments`, `GET /payments/history`, guards de transitions au niveau modèle), PR #31 (B-OPS : TCK-030 completion workflow + medialibrary `completion_photos`, TCK-031 JSON schema `rooms.*.elements.*` validé), PR #32 (F : TCK-055 route groups `(public)`/`(auth)`/`(dashboard)` + Navigation/UserMenu, TCK-059 RHF+Zod + `useApiForm` + mapping 422, TCK-017 front `LanguageSwitcher` câblé + `PATCH /users/me` + Intl helpers). Backend : 669 → 677 tests verts (32 nouveaux) sans régression, Pint clean. Frontend : 22 tests Vitest + lint/build OK. Pages Next.js pour TCK-030/031 explicitement reportées Vague 3.
- **2026-04-23** — Vague 3 livrée (5 agents parallèles sur worktrees) : 9 tickets passés en `review` via 5 PRs indépendantes ciblant `dev`. PR #34 (G-OPS : TCK-043 tunnel réservation multi-étapes, TCK-044 baux + échéancier + paiements + garants, TCK-045 messagerie chat avec polling 3s visibility-aware + pièces jointes). PR #35 (G-MAINT : TCK-030/031 frontends — dashboard maintenance + inventaires avec RoomEditor dynamique par pièce + elements.*.state). PR #36 (G-DISCOVERY : TCK-038 homepage Hero + featured/latest, TCK-039 `/properties` avec filtres URL-synced + toggle liste/carte Leaflet, TCK-047 favoris + carte interactive + partage Web Share API + recherches sauvegardées). PR #37 (G-DASHBOARD : TCK-041 dashboard agent biens CRUD + formulaire multi-section + photos, TCK-042 CRM clients pipeline + notes timeline + documents ; ancien stub `/app/crm` → redirect 308 vers `/app/customers`). PR #38 (G-REPORTING : TCK-032 full P1+P2+P3 — 4 controllers dashboard par rôle + `KpiConfig` + `ThresholdAlert` + commande scheduled hourly + notification + 8 pages `/app/overview/*` avec charts SVG homegrown, 677 → 775 tests backend verts ; composer deps ajoutées : dompdf + laravel-excel). Frontend Vitest : 22 → 199 tests verts cumulés (tous PRs additifs). Divergences spec frontend captées dans les notes des tickets (favorites route path, saved_search `notification_frequency` vs `notify`, Navbar `q=` vs `search=`). Orphelins identifiés (cleanup ticket à suivre) : `src/components/home/PropertyCard.tsx`, `src/components/properties/PropertyCard.tsx`, `src/hooks/useFavorite.ts`, `src/app/actions/property.ts#toggleFavoriteAction`.
