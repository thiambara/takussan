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

---

## 📋 Todo

### Phase 0 — Fondation Backend

- [TCK-050](tickets/TCK-050-spatie-medialibrary-upload.md) — Spatie MediaLibrary + Upload Infrastructure `S · P0 · back`
- [TCK-051](tickets/TCK-051-formrequest-validation.md) — FormRequest Base + Validation Patterns `S · P0 · back`
- [TCK-052](tickets/TCK-052-scout-search-infrastructure.md) — Laravel Scout + Search Infrastructure `S · P0 · back`

### Phase 0 — Fondation Frontend

- [TCK-054](tickets/TCK-054-design-system-components.md) — Design System + Component Library `M · P0 · front`
- [TCK-055](tickets/TCK-055-layout-navigation.md) — Layout System + Navigation `M · P0 · front`
- [TCK-056](tickets/TCK-056-auth-middleware-protection.md) — Auth Middleware + Route Protection `S · P0 · front`
- [TCK-057](tickets/TCK-057-api-client-react-query.md) — API Client + Data Fetching (React Query) `S · P0 · front`
- [TCK-058](tickets/TCK-058-i18n-setup.md) — i18n Setup (FR/EN/WO) `S · P0 · front`
- [TCK-059](tickets/TCK-059-form-patterns-validation.md) — Form Patterns + Validation (Zod + RHF) `S · P0 · front`

### Phase 1 — Socle Backend

- [TCK-014](tickets/TCK-014-roles-permissions.md) — Rôles & permissions `M · P0 · applicatif`
- [TCK-015](tickets/TCK-015-agency-team.md) — Agence & équipe `M · P0 · applicatif`
- [TCK-016](tickets/TCK-016-media-files.md) — Médias & fichiers `M · P0 · applicatif`
- [TCK-017](tickets/TCK-017-i18n-preferences.md) — Internationalisation & préférences `S · P0 · applicatif`
- [TCK-018](tickets/TCK-018-audit-trail.md) — Audit & traçabilité `S · P0 · applicatif`
- [TCK-034](tickets/TCK-034-property-crud-base.md) — Property — Modèle & CRUD base `M · P0 · back`
- [TCK-035](tickets/TCK-035-property-address-media.md) — Property — Adresse & médias `S · P0 · back`
- [TCK-036](tickets/TCK-036-property-tags-collabs-price.md) — Property — Tags, collaborateurs & historique prix `M · P0 · back`
- [TCK-020](tickets/TCK-020-crm-customers.md) — CRM & relation client `L · P0 · applicatif`
- [TCK-021](tickets/TCK-021-documents-contracts.md) — Documents & contrats `M · P0 · applicatif`
- [TCK-022](tickets/TCK-022-notifications.md) — Notifications `M · P0 · applicatif`
- [TCK-023](tickets/TCK-023-admin-configuration.md) — Administration & configuration `M · P0 · applicatif`
- [TCK-024](tickets/TCK-024-search-filters.md) — Recherche & filtres (backend) `M · P0 · applicatif`

### Phase 2 — Front Public & Dashboard

- [TCK-038](tickets/TCK-038-homepage-discovery.md) — Page d'accueil & découverte `S · P0 · front`
- [TCK-039](tickets/TCK-039-search-results.md) — Liste résultats de recherche `M · P0 · front`
- [TCK-041](tickets/TCK-041-dashboard-agent-properties.md) — Dashboard Agent — Layout & biens `M · P0 · front`
- [TCK-042](tickets/TCK-042-dashboard-agent-crm.md) — Dashboard Agent — CRM `M · P0 · front`

### Phase 3 — Opérations Métier (back + front alternés)

- [TCK-026](tickets/TCK-026-short-term-bookings.md) — Réservations courte durée (backend) `M · P1 · back`
- [TCK-043](tickets/TCK-043-bookings-frontend.md) — Réservations — Frontend tunnel `M · P1 · front`
- [TCK-027](tickets/TCK-027-long-term-leases.md) — Location longue durée — baux (backend) `L · P1 · back`
- [TCK-044](tickets/TCK-044-leases-frontend.md) — Baux — Frontend gestion `M · P1 · front`
- [TCK-028](tickets/TCK-028-transactions-payments.md) — Transactions & paiements `L · P1 · applicatif`
- [TCK-029](tickets/TCK-029-messaging.md) — Communication & messagerie (backend) `M · P1 · back`
- [TCK-045](tickets/TCK-045-messaging-frontend.md) — Messagerie — Frontend `M · P1 · front`
- [TCK-030](tickets/TCK-030-maintenance-requests.md) — Maintenance & interventions `M · P1 · applicatif`
- [TCK-031](tickets/TCK-031-inventory-inspections.md) — État des lieux & inventaires `M · P1 · applicatif`
- [TCK-032](tickets/TCK-032-reporting-dashboards.md) — Reporting & tableaux de bord `L · P1 · applicatif`
- [TCK-033](tickets/TCK-033-reviews-reputation.md) — Avis & réputation `M · P2 · applicatif`
- [TCK-046](tickets/TCK-046-favorites-map.md) — Favoris & carte interactive (backend) `M · P1 · back`
- [TCK-047](tickets/TCK-047-share-saved-searches-front.md) — Favoris, carte & partage — Frontend `M · P1 · front`

## 🚧 Doing

_(vide)_

## 👀 Review

- [TCK-048](tickets/TCK-048-base-model-api-response.md) — API Response Infrastructure (base resource + error handler) `M · P0 · back`
- [TCK-049](tickets/TCK-049-spatie-permission-activitylog.md) — Spatie Permission + ActivityLog Setup `M · P0 · back`
- [TCK-053](tickets/TCK-053-test-infrastructure.md) — Test Infrastructure + Base Test Classes `M · P0 · back`

## ✅ Done

- [TCK-013](tickets/TCK-013-auth-accounts.md) — Authentification & gestion de comptes `L · P0 · applicatif`
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
