---
id: TCK-268
title: "Console super-admin — revue des demandes d'upgrade agence"
status: todo
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

_(à remplir par implementing-specs)_
