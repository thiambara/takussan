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

> **Vagues 4 → 6 livrées et mergées sur `dev`** — 16 tickets (TCK-062 → TCK-077) passés en `review` via 10 PRs parallèles. Backlog MVP vidé. Voir section Review.
> **Vague 8 livrée** — 5 tickets (TCK-079 / 080 / 083 / 084 / 085) passés en `review` via 5 PRs parallèles ciblant `dev`. Voir section Review.

### Vague 9 — P1 résiduels + P2 baux & paiements

_(vide — Vague 9 entièrement passée en review)_

### Vague 10 — P2 CRM / Messaging / Maintenance

_(vide — TCK-097 en cours)_

### Vague 11 — P2 modération / discovery / transverses

_(vide — TCK-104 en cours)_

### Vague 12 — P2 perf / médias / permissions / compta

- [TCK-105](tickets/TCK-105-cdn-modern-image-formats.md) — CDN + webp/avif `S · P2 · technique` **[review]**
- [TCK-106](tickets/TCK-106-property-photo-watermark.md) — Watermark auto photos biens `S · P2 · applicatif` **[review]**
- [TCK-107](tickets/TCK-107-search-autocomplete.md) — Autocomplétion recherche `S · P2 · front` **[review]**
- [TCK-108](tickets/TCK-108-permission-temporary-delegation.md) — Délégation temporaire permissions `M · P2 · applicatif`
- [TCK-109](tickets/TCK-109-bank-reconciliation-assist.md) — Rapprochement bancaire semi-automatique `L · P2 · applicatif`

### Vague 13 — Bugs QA (rapport-test-qa-1.md)

- [TCK-112](tickets/TCK-112-fix-documents-field-root-context.md) — Fix runtime `/app/documents` FieldRootContext manquant `S · P0 · bug` **[review]**
- [TCK-115](tickets/TCK-115-super-admin-no-agency-empty-states.md) — Super_admin sans agence — états vides sur overview/bookings/leases/visits `M · P1 · bug` **[review]**
- [TCK-116](tickets/TCK-116-admin-sidebar-routes-404-doublon.md) — Admin sidebar — routes 404 + doublon Équipe `S · P1 · bug`

### Vague 13 — Bugs QA visiteur anonyme (visiteur-anonyme-qa.md)

- [TCK-125](tickets/TCK-125-select-affiche-cles-internes.md) — UI Select — dropdowns affichent les clés internes au lieu des labels `S · P2 · bug` **[review]**

### Vague 14 — Refonte design system

_(TCK-129 passé en review)_

### Vague 15 — Câblage des zones UI stub (StubPlaceholder / "Bientôt disponible")

_(vide — TCK-137 en doing)_

### Vague 16 — Profils polymorphes (User → Profiles)

> Évolution architecturale : passage du couple `UserType` (enum) + rôles spatie au modèle de profils polymorphes (`OwnerProfile`, `AgentProfile`, `BrokerProfile`, `ServiceProviderProfile`). Préalable : valider la spec (TCK-138) avant tout code.

_(vide — TCK-146 en review)_

### Vague 17 — Bugs smoke test agent (2026-05-04)

> Smoke test browser exhaustif sur le compte `agent1@dakarimmo.sn` (rôle Agent · Dakar Immo). 21 anomalies recensées dans `docs/smoke-tests/agent-smoke-test-2026-05-04.md` (2 P0 bloquants, 4 P1 dégradés, 12 P2 i18n/format, 3 P3 polish). 11 tickets de fix groupés par scope.

- [TCK-148](tickets/TCK-148-publish-bien-enum-localisation-et-erreur-500.md) — Publication de bien : enums envoyés en EN, 500 sur création, alerte parasite à l'édition `M · P1 · applicatif` **[review]**
- [TCK-149](tickets/TCK-149-customer-detail-include-fields-spatie-400.md) — Fiche client dashboard — 400 sur include/fields Spatie `S · P1 · back`
- [TCK-150](tickets/TCK-150-favorites-401-race-after-login.md) — Favoris — 401 immédiat après login (race condition token) `S · P1 · front`
- [TCK-151](tickets/TCK-151-pagination-controls-listings-totaux.md) — Pagination listings — total tronqué (clients) et boutons absents (états des lieux) `S · P1 · front`
- [TCK-152](tickets/TCK-152-dashboard-page-titles-localisation-dedup.md) — Dashboard — titres de page non localisés et suffixe Takussan dupliqué `S · P1 · front`
- [TCK-153](tickets/TCK-153-formats-devise-date-harmonises.md) — Formats devise & date — harmonisation FR site-wide `M · P1 · front`
- [TCK-154](tickets/TCK-154-i18n-dashboard-labels-anglais-restants.md) — Dashboard — chaînes anglaises résiduelles & libellés bruts `M · P1 · front`
- [TCK-155](tickets/TCK-155-documents-base-ui-button-warning.md) — Documents — warning a11y Base UI Button (`nativeButton`) `S · P2 · front`
- [TCK-156](tickets/TCK-156-bookings-detail-rbac-display-cree-le.md) — Fiche réservation — masquer le CTA review pour l'agent et afficher la date de création `S · P1 · front`
- [TCK-157](tickets/TCK-157-property-edit-photos-section-doublon.md) — Fiche bien (édition) — section Photos dupliquée `S · P2 · front`
- [TCK-158](tickets/TCK-158-dashboard-detail-headings-semantiques.md) — Pages détail dashboard — hiérarchie de headings (h1/h2 dupliqués ou manquants) `S · P2 · front`

## 🔶 Partiellement implémenté (code sur dev, delta résiduel)

_(vide — TCK-038 / TCK-039 absorbés par Vague 3 PR #36)_

## 🚧 Doing

_(vide)_

## 👀 Review

### Vague 15 — Câblage des zones UI stub

- [TCK-135](tickets/TCK-135-admin-roles-editor.md) — `/admin/roles` — Éditeur de rôles & permissions personnalisés `M · P1 · full`
- [TCK-136](tickets/TCK-136-profile-customer-search-preferences.md) — Profil locataire — Préférences de recherche & alertes `M · P1 · front`
- [TCK-137](tickets/TCK-137-profile-contact-phone-edit.md) — Profil contact — Édition téléphone `S · P1 · front`

### Vague 16 — Profils polymorphes (User → Profiles)

- [TCK-138](tickets/TCK-138-spec-polymorphic-profiles.md) — Spec — Modèle de profils polymorphes (User → Profiles) `M · EF · evolution`
- [TCK-139](tickets/TCK-139-profiles-schema-migrations.md) — Profils polymorphes — Schéma & migrations `M · EF · back`
- [TCK-140](tickets/TCK-140-profiles-models-backfill.md) — Profils polymorphes — Modèles, relations, backfill `L · EF · back`
- [TCK-141](tickets/TCK-141-profiles-active-context-api.md) — Profils polymorphes — Contexte de profil actif & API `M · EF · back`
- [TCK-142](tickets/TCK-142-profiles-refactor-drop-legacy.md) — Profils polymorphes — Refactor consumers & drop legacy UserType `L · EF · back`
- [TCK-143](tickets/TCK-143-frontend-multi-profile-switcher.md) — Frontend — Sélecteur de profil actif & contexte multi-profil `M · P0 · front`
- [TCK-144](tickets/TCK-144-backend-super-admin-namespace.md) — Backend — Namespace super_admin dédié `/api/admin/...` `L · P1 · technique`
- [TCK-145](tickets/TCK-145-frontend-super-admin-area.md) — Frontend — Espace super-admin dédié hors layout agence `M · P1 · front`
- [TCK-146](tickets/TCK-146-policies-active-profile-migration.md) — Policies & domaines résiduels — migration vers profils actifs (post-TCK-142) `M · P2 · back`

### Vague 15 — Câblage des zones UI stub (StubPlaceholder / "Bientôt disponible")

- [TCK-130](tickets/TCK-130-dashboard-app-wiring.md) — Dashboard `/app` — câblage tuiles & contenu personnalisé `M · P1 · front`
- [TCK-132](tickets/TCK-132-admin-properties-global.md) — `/super-admin/properties` — Gestion globale des biens (super_admin) `M · P1 · front`
- [TCK-131](tickets/TCK-131-dashboard-admin-agency.md) — Dashboard `/admin` agence — câblage indicateurs & vue d'ensemble `M · P1 · front`
- [TCK-133](tickets/TCK-133-admin-users-management.md) — `/admin/users` — Gestion des utilisateurs de l'agence (agency_admin) `M · P1 · front`
- [TCK-134](tickets/TCK-134-admin-finances-overview.md) — `/admin/finances` — Vue comptable de l'agence `L · P1 · front`
- [TCK-147](tickets/TCK-147-users-index-agency-scope-status-actions.md) — Backend — `/api/users` agency-scoped + block/activate ouverts à `agency_admin` `S · P1 · back`

### Vague 14 — Refonte design system

- [TCK-129](tickets/TCK-129-design-system-public-refresh.md) — Refonte design system — fondation site + homepage publique (Ancrage Local) `L · P1 · front`

### Vague 13 — Bugs QA

- [TCK-124](tickets/TCK-124-auth-bypass-visite-signalement.md) — Auth bypass — "Demander une visite" et "Signaler" accessibles sans connexion `S · P1 · bug`
- [TCK-126](tickets/TCK-126-contact-modal-vs-redirect-login.md) — Fiche bien — "Envoyer un message" devrait rediriger vers /auth/login `S · P2 · bug`
- [TCK-127](tickets/TCK-127-cta-faire-offre-libelle-reserver.md) — Fiche bien — CTA "Faire une offre" déjà libellé "Réserver" `S · P2 · bug`
- [TCK-128](tickets/TCK-128-filtres-avances-disponibilite-etage.md) — Filtres avancés — Disponibilité et Étage absents sur /properties `M · P1 · bug`
- [TCK-123](tickets/TCK-123-seed-data-property-coherence.md) — Seeders — incohérences type/surface propriétés démo `S · P3 · bug`
- [TCK-122](tickets/TCK-122-similar-properties-frontend-wiring.md) — Biens similaires — câblage frontend fiche bien `S · P2 · bug`
- [TCK-121](tickets/TCK-121-ux-footer-crm-lcp.md) — UX mineurs — footer liens cassés, filtres CRM __all__, LCP eager `S · P2 · bug`
- [TCK-120](tickets/TCK-120-property-form-missing-sections.md) — Formulaire bien — sections manquantes (adresse, médias, description, caract.) `L · P2 · bug`
- [TCK-119](tickets/TCK-119-homepage-latest-properties-sort.md) — Homepage "Derniers ajouts" = "En vedette" `S · P2 · bug`
- [TCK-118](tickets/TCK-118-search-text-filter-location.md) — Recherche homepage — texte localisation ignoré/non préservé `S · P1 · bug`
- [TCK-117](tickets/TCK-117-i18n-chaines-anglaises-backoffice.md) — i18n — chaînes anglaises restantes back-office `S · P1 · bug`
- [TCK-116](tickets/TCK-116-admin-sidebar-routes-404-doublon.md) — Admin sidebar — routes 404 + doublon Équipe `S · P1 · bug`
- [TCK-115](tickets/TCK-115-super-admin-no-agency-empty-states.md) — Super_admin sans agence — états vides sur overview/bookings/leases/visits `M · P1 · bug`
- [TCK-114](tickets/TCK-114-fix-leaflet-map-property-detail.md) — Carte Leaflet vide sur fiche bien `S · P0 · bug`
- [TCK-113](tickets/TCK-113-fix-audit-toast-provider.md) — Fix runtime `/admin/audit` Toast.Provider manquant `S · P1 · bug`
- [TCK-111](tickets/TCK-111-fix-properties-page-server-client-boundary.md) — Fix runtime `/app/properties` server/client boundary `S · P0 · bug`

### Vague 11 — Export audit trail

- [TCK-104](tickets/TCK-104-audit-trail-export.md) — Export audit trail `S · P2 · applicatif`

### Vague 11 — Digest quotidien / hebdomadaire

- [TCK-103](tickets/TCK-103-notifications-digest.md) — Digest quotidien / hebdomadaire `M · P2 · applicatif`

### Vague 11 — SMS notifications critiques (driver prod)

- [TCK-102](tickets/TCK-102-sms-notifications-driver.md) — SMS notifications critiques (driver prod) `S · P2 · applicatif`

### Vague 11 — Durcissement SMS driver

- [TCK-110](tickets/TCK-110-sms-driver-hardening-followups.md) — Durcissement SMS driver (OAuth lock, table delivery_attempts, metadata edit) `M · P2 · technique`

### Vague 11 — Historique local biens consultés

- [TCK-100](tickets/TCK-100-property-recently-viewed.md) — Historique local biens consultés `S · P2 · front`

### Vague 11 — Biens similaires

- [TCK-099](tickets/TCK-099-property-similar-suggestions.md) — Biens similaires / suggestions personnalisées `M · P2 · back`

### Vague 11 — Modération biens

- [TCK-098](tickets/TCK-098-property-moderation-approval.md) — Modération & validation avant publication bien `M · P2 · applicatif`

### Vague 10-E — Historique versions documents

- [TCK-097](tickets/TCK-097-document-version-history.md) — Historique versions documents `S · P2 · applicatif`

### Vague 10-D — Priorisation demandes maintenance — [PR #81](https://github.com/thiambara/takussan/pull/81)

- [TCK-096](tickets/TCK-096-maintenance-priority.md) — Priorisation demandes maintenance `S · P2 · applicatif` (PR #81)

### Vague 10-C — Demande de devis maintenance + validation

- [TCK-095](tickets/TCK-095-maintenance-quote-validation.md) — Demande de devis maintenance + validation `M · P2 · applicatif`

### Vague 10-B — Recherche full-text messages & documents — [PR #79](https://github.com/thiambara/takussan/pull/79)

- [TCK-094](tickets/TCK-094-fulltext-messages-documents.md) — Recherche full-text messages & documents `M · P2 · back` (PR #79)

### Vague 10-A — Segmentation & tags clients

- [TCK-093](tickets/TCK-093-customer-segmentation-tags.md) — Segmentation & tags clients `S · P2 · applicatif`

### Vague 9-F — Révision annuelle du loyer — [PR #76](https://github.com/thiambara/takussan/pull/76)

- [TCK-091](tickets/TCK-091-lease-rent-review.md) — Révision annuelle du loyer `S · P2 · applicatif` (PR #76)

### Vague 9-A — Remboursement caution fin de bail — [PR #72](https://github.com/thiambara/takussan/pull/72)

- [TCK-088](tickets/TCK-088-lease-deposit-refund.md) — Remboursement de la caution en fin de bail `S · P1 · applicatif` (PR #72)

### Vague 9-B — Hiérarchie de biens (immeuble → étages → lots) — [PR #73](https://github.com/thiambara/takussan/pull/73)

- [TCK-086](tickets/TCK-086-property-hierarchy.md) — Hiérarchie de biens (immeuble → étages → lots) `M · P1 · back` (PR #73)

> **Vague 1** — PRs mergées sur `dev` 2026-04-22 (#24, #25, #26, #27 + sync #28). Statut reste `review` jusqu'à confirmation AC.
> **Vague 2** — PRs mergées sur `dev` 2026-04-22 (#29, #30, #31, #32 + sync #33).
> **Vague 3** — PRs ouvertes vers `dev` 2026-04-23 (#34, #35, #36, #37, #38) en attente de merge.
> **TCK-061** — Cleanup & dette Vague 3 implémenté 2026-04-23 (branche `chore/tck-061-cleanup-vague3`).
> **Vague 4** — PRs mergées sur `dev` 2026-04-23 (#43, #44, #45, #46, #47 + sync #48). 11 tickets livrés.
> **Vague 5** — PRs mergées sur `dev` 2026-04-24 (#50, #51, #52 + sync #53). 3 tickets livrés.
> **Vague 6** — PRs mergées sur `dev` 2026-04-24 (#54, #55). 2 tickets livrés.
> **Vague 7** — PRs ouvertes vers `dev` 2026-04-24 (#59, #60, #61) en attente de merge. 3 tickets livrés (TCK-078 cleanup, TCK-081 OAuth, TCK-082 comparateur).
> **Vague 8** — PRs ouvertes vers `dev` 2026-04-25 (#64, #65, #66, #67, #68) en attente de merge. 5 tickets livrés (TCK-079 payments gateway, TCK-080 RGPD, TCK-083 CRM pipeline, TCK-084 multi-currency, TCK-085 group conversations).

### Vague 9-C — Pénalités de retard automatiques sur loyers — [PR #71](https://github.com/thiambara/takussan/pull/71)

- [TCK-087](tickets/TCK-087-lease-late-fees.md) — Pénalités de retard automatiques sur loyers `S · P1 · applicatif` (PR #71)

### Vague 9-D — Renouvellement bail / avenant

- [TCK-089](tickets/TCK-089-lease-renewal-amendment.md) — Renouvellement bail / avenant `M · P2 · applicatif`

### Vague 9-E — Résiliation anticipée + pénalités — [PR #75](https://github.com/thiambara/takussan/pull/75)

- [TCK-090](tickets/TCK-090-lease-early-termination.md) — Résiliation anticipée + pénalités `M · P2 · applicatif` (PR #75)

### Vague 9-G — Relance automatique factures en retard — [PR #77](https://github.com/thiambara/takussan/pull/77)

- [TCK-092](tickets/TCK-092-invoice-overdue-reminders.md) — Relance automatique factures en retard `S · P2 · applicatif` (PR #77)

### Vague 8-A — Passerelle de paiement Wave / OM / Lemon Squeezy — [PR #64](https://github.com/thiambara/takussan/pull/64)

- [TCK-079](tickets/TCK-079-payment-gateway-wave-orange.md) — Passerelle de paiement Wave / Orange Money / Lemon Squeezy `XL · P2 · applicatif` (PR #64)

### Vague 8-B — Suppression de compte RGPD — [PR #67](https://github.com/thiambara/takussan/pull/67)

- [TCK-080](tickets/TCK-080-account-deletion-rgpd.md) — Suppression de compte avec anonymisation (RGPD) `M · P2 · applicatif` (PR #67)

### Vague 8-C — Pipeline CRM kanban — [PR #68](https://github.com/thiambara/takussan/pull/68)

- [TCK-083](tickets/TCK-083-crm-prospect-pipeline.md) — Pipeline de prospects CRM (kanban + conversion) `M · P2 · applicatif` (PR #68)

### Vague 8-D — Devise par agence (XOF / EUR / USD) — [PR #65](https://github.com/thiambara/takussan/pull/65)

- [TCK-084](tickets/TCK-084-multi-currency.md) — Devise configurable par agence (XOF / EUR / USD) `M · P2 · applicatif` (PR #65)

### Vague 8-E — Conversations de groupe — [PR #66](https://github.com/thiambara/takussan/pull/66)

- [TCK-085](tickets/TCK-085-group-conversations.md) — Conversations de groupe (multi-participants) `M · P2 · applicatif` (PR #66)

### Vague 7-A — Cleanup & dette post-V1-V6 — [PR #59](https://github.com/thiambara/takussan/pull/59)

- [TCK-078](tickets/TCK-078-cleanup-dette-vagues-1-6.md) — Cleanup & dette post-Vagues 1-2-3-4-5-6 `M · P2 · technique` (PR #59)

### Vague 7-B — OAuth Facebook & Apple — [PR #60](https://github.com/thiambara/takussan/pull/60)

- [TCK-081](tickets/TCK-081-oauth-facebook-apple.md) — OAuth Facebook & Apple (Socialite) `S · P2 · applicatif` (PR #60)

### Vague 7-C — Comparateur de biens — [PR #61](https://github.com/thiambara/takussan/pull/61)

- [TCK-082](tickets/TCK-082-property-comparator.md) — Comparateur de biens côte à côte `M · P2 · front` (PR #61)

### Vague 5 — Avis front — [PR #50](https://github.com/thiambara/takussan/pull/50)

- [TCK-073](tickets/TCK-073-reviews-frontend.md) — Avis — Laisser & répondre publiquement `M · P2 · front` (PR #50)

### Vague 5 — PDF templates backend — [PR #51](https://github.com/thiambara/takussan/pull/51)

- [TCK-077](tickets/TCK-077-pdf-templates-generation.md) — Documents — Génération PDF depuis templates `M · P2 · back` (PR #51)

### Vague 5 — Visites full-stack — [PR #52](https://github.com/thiambara/takussan/pull/52)

- [TCK-075](tickets/TCK-075-visits-full-workflow.md) — Visites — Planification complète (types, feedback, rappels) `L · P2 · applicatif` (PR #52)

### Vague 6-A — Inventaires signature + PDF — [PR #55](https://github.com/thiambara/takussan/pull/55)

- [TCK-076](tickets/TCK-076-inventory-signature-pdf.md) — Inventaires — Signature deux parties + export PDF `M · P2 · applicatif` (PR #55)

### Vague 6-B — Calendrier agrégé — [PR #54](https://github.com/thiambara/takussan/pull/54)

- [TCK-072](tickets/TCK-072-calendar-agenda.md) — Calendrier agrégé agent/owner `M · P1 · front` (PR #54)

### Dette technique — Post-Vague 3

- [TCK-061](tickets/TCK-061-cleanup-dette-vague3.md) — Cleanup & dette technique post-Vague 3 `S · P2 · technique`

### Vague 4 — Admin dashboards — [PR #45](https://github.com/thiambara/takussan/pull/45)

- [TCK-064](tickets/TCK-064-admin-agency-config.md) — Admin — Configuration agence UI `S · P1 · front` (PR #45)
- [TCK-066](tickets/TCK-066-admin-tags-amenities.md) — Admin — Tags & amenités UI `S · P1 · front` (PR #45)
- [TCK-068](tickets/TCK-068-admin-settings-integrations.md) — Admin — Paramètres globaux & intégrations `M · P2 · front` (PR #45)

### Vague 4 — Admin team & modération — [PR #46](https://github.com/thiambara/takussan/pull/46)

- [TCK-065](tickets/TCK-065-admin-team-management.md) — Admin — Gestion équipe (ajout/retrait agents) `M · P1 · front` (PR #46)
- [TCK-067](tickets/TCK-067-admin-moderation-ui.md) — Admin — Modération avis & signalements UI `M · P2 · front` (PR #46)

### Vague 4 — Ops stubs documents & paiements — [PR #43](https://github.com/thiambara/takussan/pull/43)

- [TCK-062](tickets/TCK-062-documents-frontend.md) — Documents — Frontend bibliothèque & partage `M · P1 · front` (PR #43)
- [TCK-063](tickets/TCK-063-payments-frontend.md) — Paiements — Frontend historique, factures, payouts `M · P1 · front` (PR #43)

### Vague 4 — Sécurité & préférences (full-stack) — [PR #47](https://github.com/thiambara/takussan/pull/47)

- [TCK-069](tickets/TCK-069-profile-security-2fa.md) — Profile Security — 2FA + sessions + OTP téléphone `L · P1 · applicatif` (PR #47)
- [TCK-070](tickets/TCK-070-notification-preferences.md) — Préférences notifications (canaux + fréquence) `M · P1 · applicatif` (PR #47)

### Vague 4 — Médias & duplication bien — [PR #44](https://github.com/thiambara/takussan/pull/44)

- [TCK-071](tickets/TCK-071-media-multi-upload-reorder.md) — Médias — Upload multiple + reorder drag-drop `S · P1 · front` (PR #44)
- [TCK-074](tickets/TCK-074-property-duplicate-bulk-archive.md) — Property — Dupliquer + archivage en lot `S · P2 · back` (PR #44)

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

- [TCK-032](tickets/TCK-032-reporting-dashboards.md) — Reporting & tableaux de bord `L · P1 · applicatif` (PR #38 — P1+P2+P3 full ; gap `/api/dashboard/me` adaptive entry fermé pour débloquer TCK-130)

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

### Phase 2 — Front Dashboard Agent

- [TCK-042](tickets/TCK-042-dashboard-agent-crm.md) — Dashboard Agent — CRM `M · P0 · front` (PR #37)

### Phase 2 — Front Public

- [TCK-040](tickets/TCK-040-property-detail.md) — Fiche bien immersive `M · P0 · front`
- [TCK-060](tickets/TCK-060-auth-pages-oauth.md) — Cycle auth front + OAuth multi-provider `M · P0 · applicatif`

### Vague 11 — P2 modération / discovery / transverses

- [TCK-101](tickets/TCK-101-booking-request-auto-expire.md) — Expiration automatique demandes de réservation `S · P2 · applicatif`

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

── Vague 7 : Enrichissement P2 (hors-périmètre V4-V6) ──
TCK-028 + TCK-068 ──▶ TCK-079 (payment gateway Wave/OM/Lemon Squeezy)
TCK-013 + TCK-018 + TCK-069 ──▶ TCK-080 (account deletion RGPD)
TCK-060 ──▶ TCK-081 (OAuth Facebook/Apple)
TCK-039 + TCK-046 + TCK-047 ──▶ TCK-082 (property comparator)
TCK-020 + TCK-042 ──▶ TCK-083 (CRM prospect pipeline)
TCK-015 + TCK-017 + TCK-064 ──▶ TCK-084 (multi-currency)
TCK-029 + TCK-045 ──▶ TCK-085 (group conversations)

── Vague 9 : P1 résiduels + P2 baux/paiements ──
TCK-034 + TCK-035 + TCK-036 ──▶ TCK-086 (property hierarchy)
TCK-027 + TCK-028 ──▶ TCK-087 (lease late fees)
TCK-027 + TCK-028 ──▶ TCK-088 (lease deposit refund)
TCK-027 ──▶ TCK-089 (lease renewal/amendment)
TCK-027 + TCK-028 ──▶ TCK-090 (lease early termination)
TCK-027 + TCK-018 ──▶ TCK-091 (lease rent review)
TCK-028 ──▶ TCK-092 (invoice overdue reminders)

── Vague 10 : P2 CRM/Messaging/Maintenance ──
TCK-020 + TCK-042 ──▶ TCK-093 (customer segmentation tags)
TCK-029 + TCK-021 + TCK-052 ──▶ TCK-094 (fulltext messages & documents)
TCK-030 ──▶ TCK-095 (maintenance quote validation)
TCK-030 ──▶ TCK-096 (maintenance priority)
TCK-021 + TCK-062 ──▶ TCK-097 (document version history)

── Vague 11 : P2 modération/discovery/transverses ──
TCK-034 + TCK-067 ──▶ TCK-098 (property moderation approval)
TCK-034 + TCK-024 + TCK-040 ──▶ TCK-099 (property similar suggestions)
TCK-039 + TCK-040 ──▶ TCK-100 (property recently viewed)
TCK-026 ──▶ TCK-101 (booking auto-expire)
TCK-022 + TCK-069 + TCK-070 ──▶ TCK-102 (sms driver prod)
TCK-102 ──▶ TCK-110 (sms driver hardening — OAuth lock + delivery_attempts table + metadata edit)
TCK-022 + TCK-070 ──▶ TCK-103 (notifications digest)
TCK-018 ──▶ TCK-104 (audit trail export)

── Vague 12 : P2 perf/médias/permissions/compta ──
TCK-016 + TCK-050 ──▶ TCK-105 (cdn webp/avif)
TCK-016 + TCK-050 + TCK-035 ──▶ TCK-106 (property photo watermark)
TCK-024 + TCK-052 + TCK-039 ──▶ TCK-107 (search autocomplete)
TCK-014 + TCK-049 ──▶ TCK-108 (permission temporary delegation)
TCK-028 + TCK-077 + TCK-079 ──▶ TCK-109 (bank reconciliation assist)

── Vague 13 : Bugs QA ──
TCK-041 ──▶ TCK-111 (fix properties page server/client boundary)
TCK-062 ──▶ TCK-112 (fix documents FieldRootContext)
TCK-104 ──▶ TCK-113 (fix audit Toast.Provider)
TCK-040 ──▶ TCK-114 (fix Leaflet map property detail)
TCK-032 ──▶ TCK-115 (super_admin no-agency empty states)
TCK-099 ──▶ TCK-122 (similar properties frontend wiring)
TCK-035 + TCK-036 + TCK-041 ──▶ TCK-120 (property form missing sections)

── Vague 16 : Profils polymorphes (User → Profiles) ──
TCK-138 (spec polymorphic profiles) ──▶ TCK-139 (schema & migrations)
TCK-139 ──▶ TCK-140 (models, relations, backfill)
TCK-140 ──▶ TCK-141 (active profile context & API)
TCK-141 ──▶ TCK-142 (refactor consumers + drop legacy UserType)
TCK-141 ──▶ TCK-143 (frontend multi-profile switcher)
TCK-142 ──▶ TCK-144 (backend super_admin namespace)
TCK-144 ──▶ TCK-145 (frontend super-admin area)
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
- **2026-04-23** — **Vague 4 livrée** (5 agents parallèles sur worktrees, relance nécessaire après coupure quota mi-parcours) : 11 tickets passés en `review` via 5 PRs indépendantes ciblant `dev`. **PR #43** (V4-C Ops stubs : TCK-062 documents biblio/upload/partage/intégration fiche bien-bail-client, TCK-063 paiements 3 onglets historique/factures/payouts ; 35 fichiers, 144/144 Vitest). **PR #44** (V4-E Media & dup : TCK-071 MediaManager drag-drop natif HTML5, TCK-074 PropertyDuplication/BulkArchive services+policies+tests ; 23 fichiers, 14/14 tests ciblés, 114/114 Vitest). **PR #45** (V4-A Admin config : TCK-064 agency-config-form, TCK-066 tags-manager, TCK-068 settings/integrations avec test endpoint ; 40 fichiers, 17/17 tests ciblés, 146/146 Vitest). **PR #46** (V4-B Admin team & modération : TCK-065 team management + invite dialog, TCK-067 moderation workspace avec split view ; 16 nouveaux tests back + 7 Vitest). **PR #47** (V4-D Security & prefs : TCK-069 2FA/OTP/sessions via `pragmarx/google2fa`, TCK-070 NotificationPreference + PreferenceResolver + bypass notifications critiques ; 40 fichiers, 796/797 back, 122/122 Vitest — driver SMS log stub à swap prod, QR via api.qrserver.com). Nouveaux tests cumulés : ~45 back + ~47 front. Sync centrale INDEX via PR #48 après merge des 5 groupes. Divergences notables captées dans les notes tickets (TCK-064 SVG refusé XSS, TCK-066 Tag.is_active inexistant → soft-delete, TCK-069 driver SMS stub, TCK-071 HTML5 native vs @dnd-kit). Follow-ups accumulés pour ticket dette post-V4 : IntegrationController double-encode credentials, TagController role `admin` legacy vs `agency_admin` canonique, GET /api/documents/{id}/share-links manquant, picker entité DocumentUploadDialog, `Tag.is_active` migration, 2 tests pré-existants (`NotificationEmailTest`, `ExportControllerTest PDF leases`, `LeaseExportTest`), QR sans dep externe.
- **2026-04-23** — **Vague 5 livrée** (3 agents parallèles sur worktrees) : 3 tickets passés en `review` via 3 PRs indépendantes ciblant `dev`. **PR #50** (V5-C Avis front : TCK-073 — formulaire "Laisser un avis" post-booking/post-lease, section "Répondre" agent/owner sur fiche bien, `/app/profile/reviews` ; 31 fichiers test, 233/233 Vitest ; deux gaps backend flaggés follow-up — `DELETE /reviews/{id}/reply` absent, filtre `author_id=me` absent). **PR #51** (V5-A PDF backend : TCK-077 — `App\Services\Pdf\DocumentPdfService` avec `render/stream/store`, 3 endpoints `/leases/{lease}/receipts/{payment}/pdf`, `/invoices/{invoice}/pdf`, `/leases/{lease}/contract/pdf`, 4 templates Blade (`layouts/base`, `receipts/rent`, `invoices/default`, `leases/contract`), `docs/pdf-templates.md` ; 13 tests Pdf + 846/846 suite ; helper `formatCurrency` spec §2.8 absent — formatage inline). **PR #52** (V5-B Visites full-stack : TCK-075 — `VisitSchedulingService` (overlap + quota 3 visites), 3 notifications (requested/confirmed/reminder) avec `PreferenceResolver`, `SendPropertyVisitReminders` every 5 min windows 24h+1h idempotent via `metadata.reminder_*_sent_at`, `config/visits.php`, endpoints show/feedback/destroy, lang fr/en ; frontend `/app/visits` + `[id]` + tabs À venir/Passées + feedback dual-role ; 850 back + 220 front + Pint clean ; spec inconsistency `requested` vs `scheduled` résolue sur `scheduled` côté DB). Tests cumulés : 846 → 850 back (+28 ciblés Visit) et 199 → 464 front (+24 reviews, +11 visits, existants). Sync centrale INDEX via cette même PR.
- **2026-04-23** — Audit complet code ↔ specs (backend + frontend) puis création Vagues 4/5/6 : **16 tickets** (TCK-062 → TCK-077) séquencés en **3 vagues / 10 PRs parallèles** (V4=5 PRs, V5=3 PRs, V6=2 PRs). V4 couvre les gaps MVP indépendants (admin UI, documents/paiements stubs, sécurité full-stack, médias+duplication). V5 pose les enablers P2 (PDF service, visites, avis front). V6 consomme V5 (signature inventaire PDF via V5-A, calendrier via V5-B). **Frontend Admin** (5 tickets P1/P2) : config agence, équipe, tags/amenités, modération, settings/intégrations — tous remplacent les pages stubs `/admin/*`. **Frontend Ops** (4 tickets P1/P2) : bibliothèque documents, paiements/factures/payouts, calendrier agrégé, avis utilisateurs. **Applicatif transverse** (3 tickets P1) : 2FA+sessions+OTP téléphone (full-stack), préférences notifications (full-stack), multi-upload+reorder médias. **Backend P2** (4 tickets) : duplication/archivage bien, visites planification complète (full-stack), signature inventaire + PDF, service PDF templates centralisé (quittance/facture/bail). Exclus volontairement : passerelle paiement Wave/Orange (P2 complexe, ticket dédié à venir), suppression RGPD (P2), OAuth Facebook/Apple (P2), comparateur biens (P2), pipeline prospects (P2), multi-devises (P2), hiérarchie biens (P1 modeste — à absorber dans TCK-036 si besoin), conversations groupe (P2), révision loyer (endpoint trivial — à intégrer en fermant TCK-027).
- **2026-04-24** — **Vague 6 livrée** (2 agents parallèles sur worktrees, relance après coupure quota mi-parcours) : 2 tickets passés en `review` via 2 PRs indépendantes ciblant `dev`, mergées le jour même. **PR #54** (V6-B Calendrier : TCK-072 — `CalendarController` étendu avec `types[]`/`property_id`/scope collab accepté/payload enrichi ; frontend `/app/calendar` avec `{Month,Week,Day,List}View` + `EventDetailSheet` + helpers `calendar-date.ts` **custom zero-dep** (grille CSS 7×6 + date maths maison, ni `react-big-calendar` ni `fullcalendar`) ; +7 back, +32 front ; divergences flaggées — `property_ids[]` multi-select back absent, virtualisation 200+ events absente, `agency_id` param non implémenté). **PR #55** (V6-A Signature inventaire + PDF : TCK-076 — migration additive `signature_data`/`*_signature_hash`/`signed_at`, `InventorySignatureService`, endpoint `POST /sign` rétrocompat + `GET /inventories/{id}/pdf` + 409 sur PATCH signé ; frontend `SignaturePad` canvas zero-dep PNG base64 + `InventorySignatures` + `InventoryPdfButton` ; template Blade `pdf/inventories/report.blade.php` via `DocumentPdfService` (V5-A) ; +12 back, +10 front ; divergences — colonnes legacy `tenant_signed_at`/`owner_signed_at` conservées additives, PNG au lieu de SVG, follow-up archivage long terme via `DocumentPdfService::store()`). **Backlog MVP désormais vidé** (16 tickets V4→V6 livrés). Sync centrale INDEX via cette même PR.
- **2026-04-24** — Création **TCK-078** (cleanup & dette post-Vagues 1-2-3-4-5-6) : consolide les 15+ follow-ups flaggés dans les notes tickets V4/V5/V6 et l'historique INDEX. Backend : endpoints manquants (`DELETE /reviews/{id}/reply`, `author_id=me`, `property_ids[]` + `agency_id` sur `/api/calendar`, `GET /documents/{id}/share-links`), bugs pré-existants (`IntegrationController` double-encode, `TagController` rôle legacy `admin` vs `agency_admin`, 3 tests rouges `NotificationEmailTest` / `ExportControllerTest PDF leases` / `LeaseExportTest`), migration drop colonnes legacy inventaire, archivage PDF long terme via `DocumentPdfService::store()`. Frontend : retrait dép externe `api.qrserver.com`, helper `formatCurrency`, virtualisation calendrier > 200 events, picker entité `DocumentUploadDialog`, arbitrage `@dnd-kit` vs HTML5 natif. Specs : PRs sync séparées pour `#17-propertyvisit-` (`requested` vs `scheduled`), `#24-inventory-` (SVG vs PNG), `#10-tag` (`is_active` vs soft-delete). V1-V3 pas retouchées — déjà couvertes par TCK-061 (`review`).
- **2026-04-24** — **Création Vague 7 backlog** (hors-périmètre V4-V6) : 7 tickets P2 (TCK-079 → TCK-085) couvrant les items exclus volontairement des vagues précédentes. **TCK-079** (XL · applicatif) — Passerelle paiement Wave/Orange Money/Lemon Squeezy (drivers, webhook signé `X-Signature` HMAC-SHA256, idempotence, scope agence via Integration §31 ; LS = merchant of record avec package officiel `lemonsqueezy/laravel` + trait `Billable` sur Agency, reconciliation gross/fees/net ; XOF refusé sur LS). **TCK-080** (M · applicatif) — Suppression compte RGPD avec délai 30j, ré-auth + 2FA, anonymisation irréversible préservant historique comptable. **TCK-081** (S · applicatif) — OAuth Facebook + Apple (Socialite) complétant TCK-060 (Google), avec client_secret JWT dynamique pour Apple. **TCK-082** (M · front) — Comparateur 2-4 biens côte à côte, persistance localStorage, URL partageable, highlight divergences. **TCK-083** (M · applicatif) — Pipeline CRM kanban 6 stades (lead→converted/lost), drag-drop optimistic, tasks polymorphes + rappels 24h, stats conversion. **TCK-084** (M · applicatif) — Devise par agence XOF/EUR/USD, helper `formatCurrency` centralisé, Blade directive `@currency`, biens/baux existants non recalculés. **TCK-085** (M · applicatif) — Conversations groupe 3-20 participants via `ConversationType=group` + role admin/member, system messages immuables, quitter/promouvoir avec garde-fou dernier admin. Graphe de dépendances étendu (V7). Exclus volontairement (pas ticketés) : hiérarchie biens P1 modeste (à absorber dans TCK-036 si besoin), révision loyer (endpoint trivial à intégrer en fermant TCK-027), accusés lecture > 5 participants (EF avec trigger), conversion multi-devises P3, export RGPD portabilité P2 dédié, rapprochement bancaire P2 dédié, relance factures P2 dédié, campagnes email/SMS P3.
- **2026-04-24** — **Vague 7 livrée** (3 agents parallèles sur worktrees, 2 relances après watchdog stalls en fin de course — finalisation manuelle via SendMessage puis push/PR) : 3 tickets passés en `review` via 3 PRs indépendantes ciblant `dev`. **PR #59** (V7-A Cleanup dette V1-V6 : TCK-078 — `DELETE /api/reviews/{review}/reply`, `filter[author_id]=me`, `filter[property_ids][]` + `filter[agency_id]` sur `/api/calendar`, `GET /api/documents/{id}/share-links`, fix `IntegrationController` double-encode, fix `TagController` rôle legacy `admin` → permission `tags.manage`, swap QR `api.qrserver.com` → `bacon/bacon-qr-code` local, helper frontend `formatCurrency` + refactor 7 callsites ; 73 tests backend ciblés verts + 294 Vitest ; deferred : drop colonnes legacy inventory (bloqué sync spec), 3 tests pré-existants rouges → TCK-086 à créer, picker entité DocumentUploadDialog, virtualisation calendrier). **PR #60** (V7-B OAuth FB/Apple : TCK-081 — `OAuthProvisioningService` provider-agnostic, `AppleClientSecretGenerator` ES256 JWT cached 10min via `firebase/php-jwt`, `FacebookOAuthController` + `AppleOAuthController` avec signed state et provider binding, packages `socialiteproviders/{facebook,apple}` installés, 9 clés env documentées ; 18 tests OAuth verts via phpunit direct ; frontend zero-change — `<OAuthButtons>` pré-câblé dans TCK-060 avec les 3 providers). **PR #61** (V7-C Comparateur biens : TCK-082 — `CompareContext` + `useReducer` capé à 4, `useCompare` avec localStorage 24h TTL, `lib/compare.ts` helpers purs (`highlightDivergent`, `parseIdsFromUrl`), `CompareFloatingBar` + `CompareTable` desktop + `CompareCarousel` mobile swipe + `CompareEmptyState`, `/compare` server component cold-share friendly, PropertyCard toggle + toast 5e bloqué, zero nouvelle dépendance ; 6 tests backend + 44 Vitest ; backend `AllowedFilter::exact('id')` + sparse fieldsets exposés). Watchdog stream idle timeout a coupé les 3 agents pendant la phase finale tests/PR — finalisé manuellement sans perte : ticket → `review`, notes remplies, commits + push + PRs ouvertes. Divergences flaggées (non résolues ici) : specs `#17-propertyvisit-`, `#24-inventory-`, `#10-tag` — PRs sync séparées à prévoir. Sync centrale INDEX via cette même PR.
- **2026-04-25** — **Vague 8 livrée** (5 worktrees parallèles, finalisation manuelle après watchdog stalls de la session précédente — reprise worktree par worktree dans cette session) : 5 tickets P2 lourds passés en `review` via 5 PRs indépendantes ciblant `dev`. **PR #64** (V8-A Payments gateway : TCK-079 — `PaymentDriverContract` + 3 drivers (Wave / Orange Money / Lemon Squeezy via package officiel `lemonsqueezy/laravel ^1.9` + `Billable` trait sur Agency), `PaymentGatewayService` orchestrateur, controllers initiate / verify / webhook public, currency guards XOF↔LS, idempotence sur `(provider, transaction_id)` stocké dans `BookingPayment.metadata.gateway_events[]`, `LemonSqueezyEventListener` bridgant `OrderCreated` / `OrderRefunded` ; frontend `<PaymentProviderPicker>` + `/app/payments/return` 800ms loading + 15s polling 2min, `<PayOnlineButton>` dans Booking/Lease/Invoice ; 21 tests backend). **PR #67** (V8-B RGPD : TCK-080 — `AccountDeletionService` request/cancel/execute/anonymize, `AccountDeletionRequest` model + 2 migrations, command horaire `ExecuteScheduledAccountDeletions` + reminder J-7 idempotent, 3 notifications, anti-escalade 422 si baux actifs / paiements pending, anonymisation préserve historique comptable, Customer.user_id dissociated, ActivityLog 3 transitions, 2FA TOTP exigé si actif ; frontend AccountDeletionDialog 2-step + AccountDeletionBanner global avec compte à rebours dans `/app/profile/security` ; 22 tests backend). **PR #68** (V8-C CRM pipeline : TCK-083 — `GET /api/customers/pipeline-stats` (`PipelineStatsService`), reason → CustomerNote auto sur converted/lost, `tasks:send-due-reminders` horaire idempotent, frontend `/app/crm/pipeline` kanban 6 colonnes via `@dnd-kit/core ^6.3.1` (ajouté), optimistic + rollback dans `useCustomerStageMutation`, `<CustomerDetailSheet>` 4 tabs, `<PipelineStatsBar>` 4 widgets ; 14 backend + 8 vitest). **PR #65** (V8-D Multi-currency : TCK-084 — migration `add_currency_to_agencies_table` (default XOF), enum `Currency` avec metadata, `CurrencyFormatter` via NumberFormatter, `@currency` Blade directive, PDF templates updated (invoices/leases/receipts), frontend `formatCurrency` étendu (XOF/EUR/USD), hook `useAgencyCurrency`, `<Money>` component ; 8+ inline F CFA callsites refactorés ; 22 backend + 353 vitest). **PR #66** (V8-E Group conversations : TCK-085 — `GroupConversationService` create/add/remove/promote/leave avec garde "dernier admin", `SystemMessageFactory` 4 events immuables, `ConversationParticipantController`, scope check (agence du bien/bail OR intra-agency OR conversation partagée OR UserCustomerRelationship), `ConversationInviteNotification` respectant PreferenceResolver + is_muted, migration `make_messages_sender_id_nullable_for_system` ; frontend `<NewGroupDialog>` wizard 2 étapes + `<ConversationInfoSheet>` panneau latéral + `<SystemMessageBubble>` + `<ConversationList>` distingue groupes (icône Users + +N + badge "Groupe" + 🔕) ; 29 backend + 6 vitest ; user search autocomplete deferé en follow-up — V1 ship avec saisie ID + scope check serveur). Total : ~108 tests backend ciblés + 367+ vitest. Pint clean partout. Sync centrale INDEX via `chore/wave-8-index-sync` après merge des 5 groupes. Note opérationnelle : la session précédente avait été interrompue avec WIP non commité dans 4 worktrees (Group A 3 commits + branche poussée mais pas de PR ; Group B / E backend WIP non commités ; Group D 1 commit backend + WIP frontend ; Group C avait commit accidentel sur `dev` local + frontend untracked dans le main worktree). Cette session a salvagé tous les WIP, cherry-pick le commit Group C de `dev` vers la bonne branche feature, repris worktree par worktree (build/lint/tests/notes/commit/push/PR).
- **2026-04-24** — **Création Vagues 9-12 backlog** (figeage roadmap V2 complète) : 24 tickets (TCK-086 → TCK-109) couvrant le reste des features `P1` non encore livrés et l'intégralité des features `P2` non ticketées dans `features.md`. Roadmap V2 désormais close — seuls les `P3` (différenciateurs futurs) restent à ticketer après prise de décision produit post-V2. **Vague 9 — P1 résiduels + P2 baux/paiements (7 tickets)** : TCK-086 hiérarchie biens (parent_id auto-ref Property), TCK-087 pénalités retard auto loyers (job daily + % configurable), TCK-088 remboursement caution fin bail, TCK-089 renouvellement/avenant bail (parent_lease_id), TCK-090 résiliation anticipée + calcul pénalités, TCK-091 révision annuelle loyer (PATCH dédié journalisé), TCK-092 relance auto factures en retard (cadence J+3/J+7/J+15). **Vague 10 — P2 CRM/Messaging/Maintenance (5 tickets)** : TCK-093 segmentation tags clients (Tag polymorphe étendu Customer), TCK-094 full-text Scout messages+documents (`/api/search/messages` + `/api/search/documents`), TCK-095 demande devis maintenance + validation (quote_requested → submitted → approved/rejected), TCK-096 priorisation maintenance (Priority enum urgent/high/normal/low), TCK-097 historique versions documents (collection medialibrary + ActivityLog). **Vague 11 — P2 modération/discovery/transverses (7 tickets)** : TCK-098 modération avant publication bien (pending_review → approved/rejected, queue admin), TCK-099 biens similaires (`/api/properties/{id}/similar`), TCK-100 historique local biens consultés (localStorage carrousel), TCK-101 expiration auto demandes réservation (job scheduled), TCK-102 driver SMS prod (Twilio/Wave Business via Integration), TCK-103 digest quotidien/hebdo (respect `NotificationPreference.frequency`), TCK-104 export audit trail (CSV/XLSX restreint admin). **Vague 12 — P2 perf/médias/permissions/compta (5 tickets)** : TCK-105 CDN + webp/avif (Bunny/Cloudflare conversion à la volée), TCK-106 watermark auto photos biens (logo agence sur conversions Web), TCK-107 autocomplétion recherche (`/api/search/suggest` dropdown instantané), TCK-108 délégation temporaire permissions (rôle date début/fin auto-revoke), TCK-109 rapprochement bancaire semi-auto (import CSV/OFX + appariement assisté). Graphe de dépendances étendu V9-V12. Tickets `P3` non ticketés (à phaser post-V2 selon décision produit) : §1.1 suivi admin/import MLS/estimation IA, §1.2 recherche vocale, §1.3 annulation+remboursement partiel, §1.4 signature électronique bail/espace locataire, §1.5 commissions auto/comptabilité FEC, §1.6 campagnes email-SMS, §1.7 accusés lecture >5/audio-vidéo/traduction, §1.8 facturation directe/contrats récurrents, §1.9 comparaison entrée-sortie/IA dégradations, §1.10 signature électronique/OCR, §1.11 détection avis suspects/badges, §1.12 multi-branches/congés/SaaS/marketplace, §2.1 magic link, §2.2 policies dynamiques, §2.3 WhatsApp, §2.4 sémantique embeddings, §2.7 streaming vidéo, §2.8 multi-devise conversion/traduction contenus, §2.9 mode maintenance/feature flags.
