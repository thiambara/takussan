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

> **Vagues 4 / 5 / 6 planifiées** — 16 tickets créés 2026-04-23 après audit complet code ↔ specs, séquencés en 3 vagues et 10 PRs parallèles. Vague 4 = 5 PRs indépendantes (gaps MVP frontend + sécurité). Vague 5 = 3 PRs (enablers P2). Vague 6 = 2 PRs (consomment Vague 5). Voir **Plan des vagues** ci-dessous.

### 🌊 Plan des vagues

#### Vague 4 — 5 PRs parallèles (gaps MVP + sécurité)

> Ces 5 groupes n'ont aucune dépendance interne mutuelle et peuvent démarrer simultanément sur 5 worktrees. Toutes les dépendances externes (TCK-013 à TCK-060) sont `done` ou `review` — pas de blocage.

| PR | Tickets | Surface | Estimate global |
|----|---------|---------|-----------------|
| **V4-A** Admin config | TCK-064 + TCK-066 + TCK-068 | `/admin/agency` · `/admin/settings/tags` · `/admin/settings` | M |
| **V4-B** Admin team & modération | TCK-065 + TCK-067 | `/admin/team` · `/admin/moderation` | L |
| **V4-C** Ops stubs | TCK-062 + TCK-063 | `/app/documents` · `/app/payments` | L |
| **V4-D** Sécurité & préférences | TCK-069 + TCK-070 | Profile security (2FA/sessions/OTP) + notification preferences (full-stack) | XL |
| **V4-E** Médias & duplication bien | TCK-071 + TCK-074 | Upload/reorder (front) + Property duplicate/bulk-archive (back) | M |

#### Vague 5 — 3 PRs parallèles (enablers P2)

> Débloquent la Vague 6. Indépendants entre eux — domaines différents.

| PR | Tickets | Surface | Estimate |
|----|---------|---------|----------|
| **V5-A** PDF backend | TCK-077 | Service PDF centralisé + templates quittance/facture/bail | M |
| **V5-B** Visites full-stack | TCK-075 | Backend endpoints + jobs reminders + UI planification | L |
| **V5-C** Avis front | TCK-073 | Laisser avis + répondre publiquement | M |

#### Vague 6 — 2 PRs parallèles (consomment Vague 5)

> Ne démarrent qu'après merge Vague 5 (TCK-077 → TCK-076 ; TCK-075 → TCK-072). Indépendants entre eux.

| PR | Tickets | Surface | Estimate |
|----|---------|---------|----------|
| **V6-A** Signature inventaire + PDF | TCK-076 | Canvas signature front + endpoints sign + PDF via service V5-A | M |
| **V6-B** Calendrier agrégé | TCK-072 | Vue mois/semaine/jour consolidant bookings + visites (V5-B) | M |

### Groupement thématique des tickets Todo


### Frontend — Admin dashboards & config (P1/P2)

- [TCK-064](tickets/TCK-064-admin-agency-config.md) — Admin — Configuration agence UI `S · P1 · front`
- [TCK-065](tickets/TCK-065-admin-team-management.md) — Admin — Gestion équipe (ajout/retrait agents) `M · P1 · front`
- [TCK-066](tickets/TCK-066-admin-tags-amenities.md) — Admin — Tags & amenités UI `S · P1 · front`
- [TCK-067](tickets/TCK-067-admin-moderation-ui.md) — Admin — Modération avis & signalements UI `M · P2 · front`
- [TCK-068](tickets/TCK-068-admin-settings-integrations.md) — Admin — Paramètres globaux & intégrations `M · P2 · front`

### Frontend — Ops & dashboards (P1/P2)

- [TCK-062](tickets/TCK-062-documents-frontend.md) — Documents — Frontend bibliothèque & partage `M · P1 · front`
- [TCK-063](tickets/TCK-063-payments-frontend.md) — Paiements — Frontend historique, factures, payouts `M · P1 · front`
- [TCK-072](tickets/TCK-072-calendar-agenda.md) — Calendrier agrégé agent/owner `M · P1 · front`
- [TCK-073](tickets/TCK-073-reviews-frontend.md) — Avis — Laisser & répondre publiquement `M · P2 · front`

### Applicatif — Sécurité & préférences transverses (P1)

- [TCK-069](tickets/TCK-069-profile-security-2fa.md) — Profile Security — 2FA + sessions + OTP téléphone `L · P1 · applicatif`
- [TCK-070](tickets/TCK-070-notification-preferences.md) — Préférences notifications (canaux + fréquence) `M · P1 · applicatif`
- [TCK-071](tickets/TCK-071-media-multi-upload-reorder.md) — Médias — Upload multiple + reorder drag-drop `S · P1 · front`

### Backend / full-stack — Compléments métier (P2)

- [TCK-074](tickets/TCK-074-property-duplicate-bulk-archive.md) — Property — Dupliquer + archivage en lot `S · P2 · back`
- [TCK-075](tickets/TCK-075-visits-full-workflow.md) — Visites — Planification complète (types, feedback, rappels) `L · P2 · applicatif`
- [TCK-076](tickets/TCK-076-inventory-signature-pdf.md) — Inventaires — Signature deux parties + export PDF `M · P2 · applicatif`
- [TCK-077](tickets/TCK-077-pdf-templates-generation.md) — Documents — Génération PDF depuis templates `M · P2 · back`

## 🔶 Partiellement implémenté (code sur dev, delta résiduel)

_(vide — TCK-038 / TCK-039 absorbés par Vague 3 PR #36)_

## 🚧 Doing

_(vide)_

## 👀 Review

> **Vague 1** — PRs mergées sur `dev` 2026-04-22 (#24, #25, #26, #27 + sync #28). Statut reste `review` jusqu'à confirmation AC.
> **Vague 2** — PRs mergées sur `dev` 2026-04-22 (#29, #30, #31, #32 + sync #33).
> **Vague 3** — PRs ouvertes vers `dev` 2026-04-23 (#34, #35, #36, #37, #38) en attente de merge.
> **TCK-061** — Cleanup & dette Vague 3 implémenté 2026-04-23 (branche `chore/tck-061-cleanup-vague3`).

### Dette technique — Post-Vague 3

- [TCK-061](tickets/TCK-061-cleanup-dette-vague3.md) — Cleanup & dette technique post-Vague 3 `S · P2 · technique`

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

── Vague 4 : Gaps MVP + compléments P2 ──
TCK-021 + TCK-057 ──▶ TCK-062 (documents front)
TCK-028 + TCK-057 ──▶ TCK-063 (payments front)
TCK-015 + TCK-057 ──▶ TCK-064 (admin agency config)
TCK-015 + TCK-014 + TCK-057 ──▶ TCK-065 (admin team)
TCK-023 + TCK-057 ──▶ TCK-066 (admin tags)
TCK-033 + TCK-018 + TCK-057 ──▶ TCK-067 (admin moderation)
TCK-023 + TCK-057 ──▶ TCK-068 (admin settings/integrations)
TCK-013 + TCK-060 + TCK-057 ──▶ TCK-069 (2fa + sessions + OTP)
TCK-022 + TCK-057 ──▶ TCK-070 (notification prefs)
TCK-016 + TCK-054 ──▶ TCK-071 (multi-upload + reorder)
TCK-026 + TCK-027 + TCK-075 + TCK-057 ──▶ TCK-072 (calendar)
TCK-033 + TCK-057 ──▶ TCK-073 (reviews front)
TCK-034 + TCK-035 + TCK-036 ──▶ TCK-074 (property duplicate / bulk archive)
TCK-026 + TCK-022 + TCK-057 ──▶ TCK-075 (visits full)
TCK-031 + TCK-077 + TCK-057 ──▶ TCK-076 (inventory signature + PDF)
TCK-021 + TCK-027 + TCK-028 ──▶ TCK-077 (PDF templates)
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
- **2026-04-23** — Création TCK-061 (cleanup & dette technique post-Vague 3) : consolide orphelins frontend, divergences spec/impl (saved_search `notify` vs `notification_frequency`, favoris route path, homepage search param `q=`/`city=`/`search=`), règles métier hard-codées (acompte 30 %), et bug pré-existant `DashboardController::tenantStats()` référençant `reported_by_id` inexistant.
- **2026-04-23** — Audit complet code ↔ specs (backend + frontend) puis création Vagues 4/5/6 : **16 tickets** (TCK-062 → TCK-077) séquencés en **3 vagues / 10 PRs parallèles** (V4=5 PRs, V5=3 PRs, V6=2 PRs). V4 couvre les gaps MVP indépendants (admin UI, documents/paiements stubs, sécurité full-stack, médias+duplication). V5 pose les enablers P2 (PDF service, visites, avis front). V6 consomme V5 (signature inventaire PDF via V5-A, calendrier via V5-B). **Frontend Admin** (5 tickets P1/P2) : config agence, équipe, tags/amenités, modération, settings/intégrations — tous remplacent les pages stubs `/admin/*`. **Frontend Ops** (4 tickets P1/P2) : bibliothèque documents, paiements/factures/payouts, calendrier agrégé, avis utilisateurs. **Applicatif transverse** (3 tickets P1) : 2FA+sessions+OTP téléphone (full-stack), préférences notifications (full-stack), multi-upload+reorder médias. **Backend P2** (4 tickets) : duplication/archivage bien, visites planification complète (full-stack), signature inventaire + PDF, service PDF templates centralisé (quittance/facture/bail). Exclus volontairement : passerelle paiement Wave/Orange (P2 complexe, ticket dédié à venir), suppression RGPD (P2), OAuth Facebook/Apple (P2), comparateur biens (P2), pipeline prospects (P2), multi-devises (P2), hiérarchie biens (P1 modeste — à absorber dans TCK-036 si besoin), conversations groupe (P2), révision loyer (endpoint trivial — à intégrer en fermant TCK-027).
