---
id: TCK-268
title: "Console super-admin — revue des demandes d'upgrade agence"
status: done
phase: P1
family: applicatif
estimate: M
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-252, TCK-267]
blocks: [TCK-269]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
tags: [back, front, super-admin, agency, upgrade, p1]
---

## Objectif utilisateur

Un super-admin doit pouvoir **lister, consulter et reviewer** les demandes d'upgrade `individual → standard` depuis la console super-admin : approuver ou rejeter avec commentaire.

## Contrat de données

Endpoints super-admin :

- `GET /api/admin/agency-upgrade-requests` — liste avec filtres (`status`, sort par `submitted_at`)
- `GET /api/admin/agency-upgrade-requests/{id}` — détail avec docs joints (statuts PDF)
- `POST /api/admin/agency-upgrade-requests/{id}/approve` — body `{ comment?: string }`
- `POST /api/admin/agency-upgrade-requests/{id}/reject` — body `{ comment: string }` (commentaire **obligatoire** si reject)

L'approbation déclenche le flip `Agency.kind = standard` (TCK-269) — orchestré côté service.

## Direction UX / Artistique

Page `/super-admin/agency-upgrade-requests` :
- Liste avec colonnes : Agence, Soumis par, Date, Statut, Délai écoulé
- Badge couleur sur statut (pending = orange, approved = vert, rejected = rouge, revoked = gris)
- Filtres : status, fenêtre temporelle
- Clic sur ligne → page détail

Page détail `/super-admin/agency-upgrade-requests/{id}` :
- Récap demande (tous les champs légaux + scan statuts en visualiseur PDF)
- Historique de l'agence (nb biens, ancienneté, autres demandes passées)
- Boutons "Approuver" + "Rejeter" + commentaire (modal)

## Contraintes strictes (métier)

- Endpoint super-admin-only via gate `EnsureSuperAdmin`.
- Approbation : flippe `AgencyUpgradeRequest.status = approved`, `reviewed_by`, `reviewed_at`, optionnellement `review_comment`. Déclenche événement `AgencyUpgradeApproved` que TCK-269 écoute pour flip `Agency.kind`.
- Rejet : flippe `status = rejected`, commentaire **obligatoire** (validation 422 si vide).
- Notification au submitter à l'approbation et au rejet.
- Activity log : `agency_upgrade_approved`, `agency_upgrade_rejected` avec actor + target.
- Pas de re-décision : une demande approuvée/rejetée n'est plus modifiable. Si rejet, l'user peut soumettre une nouvelle demande (TCK-267).

## Delta à produire

- [ ] Endpoints super-admin (cf. ci-dessus)
- [ ] Service : `App\Services\Agency\AgencyUpgradeReviewService` (méthodes `approve`, `reject`)
- [ ] Event : `App\Events\AgencyUpgradeApproved` (consommé par TCK-269)
- [ ] Notifications : `AgencyUpgradeApprovedNotification`, `AgencyUpgradeRejectedNotification`
- [ ] Tests backend : list, detail, approve, reject (validation comment), 403 si non super-admin, event émis, activity log, notification envoyée
- [ ] Page frontend `/super-admin/agency-upgrade-requests`
- [ ] Page frontend détail `/super-admin/agency-upgrade-requests/{id}`
- [ ] Composant `<ReviewActionsModal>` (approve / reject avec commentaire)
- [ ] Composant `<PdfViewer>` (réutilisable, pour scan statuts)
- [ ] i18n FR/EN/WO
- [ ] Sidebar super-admin : lien "Demandes d'upgrade" avec badge count pending

## Critères d'acceptation

- [ ] AC1 — Un super-admin voit la liste des demandes triée par soumission, badge count pending visible dans sidebar.
- [ ] AC2 — Approbation flippe statut, déclenche event, envoie notification au submitter.
- [ ] AC3 — Rejet sans commentaire → 422 (UX bloque le bouton, backend valide).
- [ ] AC4 — Une demande déjà reviewée n'est plus actionable.
- [ ] AC5 — Activity log entries pour les 2 décisions.
- [ ] AC6 — Endpoint refuse 403 pour un user non super-admin.

## Hors périmètre

- Flip `Agency.kind` à l'approbation + débloquage features + welcome agence — TCK-269.
- Workflow de double-validation (2 super-admins) — V2.

## Notes d'implémentation

### Décisions clés

- **Event vs listener** : `App\Events\AgencyUpgradeApproved` est créé ici et
  dispatch via `AgencyUpgradeApproved::dispatch($request)` à la fin de la
  transaction d'approbation. **Aucun listener n'est implémenté dans TCK-268** —
  TCK-269 le consommera pour flipper `Agency.kind` et envoyer les notifications
  tenant/agency post-flip. L'event implémente `ShouldDispatchAfterCommit`
  pour ne firer qu'une fois la transaction effectivement commitée
  (sécurité indispensable pour TCK-269).
- **Notification submitter au reject** : envoyée via `Notification::send()`
  classique (pas via le canal templates / NotificationTemplate) — la
  notification est suffisamment simple, et l'overhead du moteur de
  template n'apporte rien tant que l'on ne donne pas la main à l'admin
  pour personnaliser le mail (V2).
- **Validation `comment` au reject** : double surface — le `RejectAgencyUpgradeRequest`
  enforce `required|min:5|max:2000` côté HTTP (422 standard), et le service
  re-valide via `ValidationException` pour les callers non-HTTP (CLI,
  queue jobs). Le frontend désactive le bouton submit tant que
  `trim().length < 5` pour éviter le round-trip 422.
- **Sidebar badge** : polling react-query à 60s (refetchInterval) +
  invalidation explicite après chaque décision via la queryKey
  `['super-admin', 'agency-upgrade-requests', 'pending-count']`. Pas de
  WebSocket — le coût d'infra ne se justifie pas pour cet usage.
- **Endpoint `pending-count`** monté **avant** les bindings
  `{upgradeRequest}` dans `routes/api/admin.php` pour ne pas être éclipsé
  par le model binding.
- **Détail enrichi** : la méthode `show()` ne renvoie pas l'`AgencyUpgradeRequestResource`
  brut — elle l'étend avec un sous-objet `agency`, `submitter`, `reviewer`,
  `documents` (avec `media_url` résolu via spatie/medialibrary) et un
  bloc `counts` (`properties`, `other_requests`). Permet à la page
  détail de tout rendre sans fan-out d'API.
- **PdfViewer minimal** : utilise un `<object data type="application/pdf">`
  natif avec fallback de téléchargement. Pas de lib externe (pdf.js,
  react-pdf) — la triage super-admin n'en a pas besoin et l'on évite
  d'alourdir le bundle.

### Fichiers touchés

**Backend** :
- `app/Events/AgencyUpgradeApproved.php` (nouveau)
- `app/Notifications/AgencyUpgradeApprovedNotification.php` (nouveau)
- `app/Notifications/AgencyUpgradeRejectedNotification.php` (nouveau)
- `app/Services/Agency/AgencyUpgradeReviewService.php` (nouveau)
- `app/Http/Controllers/Api/Admin/AgencyUpgradeRequestController.php` (nouveau)
- `app/Http/Requests/Admin/ApproveAgencyUpgradeRequest.php` (nouveau)
- `app/Http/Requests/Admin/RejectAgencyUpgradeRequest.php` (nouveau)
- `app/Policies/AgencyUpgradeRequestPolicy.php` (extension : `approve`/`reject`)
- `routes/api/admin.php` (5 routes ajoutées)
- `lang/{fr,en,wo}/agency_upgrade.php` (extension : `review.errors.*`,
  `notifications.approved.*`, `notifications.rejected.*`)
- `tests/Feature/Admin/AgencyUpgradeRequestReviewTest.php` (nouveau, 12 tests)

**Frontend** :
- `src/lib/queries/super-admin.ts` (extension : 5 fonctions + types)
- `src/components/files/PdfViewer.tsx` (nouveau, réutilisable)
- `src/components/super-admin/ReviewActionsModal.tsx` (nouveau)
- `src/components/super-admin/__tests__/ReviewActionsModal.test.tsx` (nouveau, 3 tests)
- `src/app/(super-admin)/super-admin/agency-upgrade-requests/page.tsx` (nouveau)
- `src/app/(super-admin)/super-admin/agency-upgrade-requests/[id]/page.tsx` (nouveau)
- `src/components/layout/SuperAdminSidebar.tsx` (entrée + badge count)
