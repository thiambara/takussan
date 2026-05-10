---
id: TCK-267
title: "Form upgrade individual → standard (soumission user)"
status: todo
phase: P1
family: applicatif
estimate: M
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-248, TCK-252, TCK-250]
blocks: [TCK-268, TCK-269]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
    - "docs/models-spec.md#2-agency"
tags: [back, front, agency, upgrade, p1]
---

## Objectif utilisateur

L'`agency_admin` d'une agence individuelle qui veut **passer en agence professionnelle** (pour inviter des collaborateurs) doit pouvoir soumettre une demande depuis les paramètres de son agence avec le formulaire légal requis.

## Contrat de données

Endpoint :

- `POST /api/agencies/{agency}/upgrade-requests` — body :

  ```json
  {
    "rc": "...",
    "ninea": "...",
    "rib_pro": "...",
    "company_legal_name": "...",
    "address_fiscale": "...",
    "planned_agents_count": 5,
    "statuts_doc": "<file upload>"
  }
  ```

  Crée une `AgencyUpgradeRequest` (TCK-252) en `pending`. Le scan des statuts (PDF) est uploadé via medialibrary et attaché en `Document` morph.

- `GET /api/agencies/{agency}/upgrade-requests` — liste des demandes (max 1 pending + historique)
- `DELETE /api/agencies/{agency}/upgrade-requests/{id}` — révoque une demande pending (status = revoked)

## Direction UX / Artistique

Page `/app/settings/agency/upgrade` (ou onglet dans paramètres agence) :
- Bandeau introductif : "Pourquoi passer en agence professionnelle" (3 bénéfices : inviter une équipe, multi-admins, rôles personnalisés)
- Form complet (RC, NINEA, RIB pro, raison sociale, adresse fiscale, nombre estimé d'agents, upload statuts PDF)
- SLA affiché : "Réponse sous 5 jours ouvrés"
- État courant : "Aucune demande" / "Demande en cours depuis le X" (avec bouton "Révoquer") / "Demande approuvée le X" / "Demande rejetée le X — voir commentaire"

Form reprenable via `<WizardReprenable>` (TCK-250) avec key `agency-upgrade-{agency_id}`.

## Contraintes strictes (métier)

- L'agence cible doit avoir `kind = individual` et le user doit être `agency_admin` actif (sinon 403).
- Une seule demande `pending` autorisée à la fois (TCK-252 enforce DB).
- Tous les champs du form sont obligatoires sauf `planned_agents_count`.
- Le scan des statuts doit être un PDF ou image, taille max 10 Mo (validation FormRequest).
- Activity log : `agency_upgrade_requested` avec agency_id, submitted_by.
- À la soumission : notification à tous les super-admins (via TCK-268 listener côté console).

## Delta à produire

- [ ] Endpoint `POST /api/agencies/{agency}/upgrade-requests` + service `AgencyUpgradeRequestService::submit`
- [ ] Endpoint `GET /api/agencies/{agency}/upgrade-requests`
- [ ] Endpoint `DELETE /api/agencies/{agency}/upgrade-requests/{id}` (revoke)
- [ ] FormRequest : `SubmitAgencyUpgradeRequestRequest` (validation tous champs + upload statuts)
- [ ] Policy : `AgencyUpgradeRequestPolicy@create|view|revoke`
- [ ] Notification : `AgencyUpgradeRequestSubmittedNotification` (à tous les super-admins)
- [ ] Tests backend : soumission valide, refus si kind=standard, refus si pas agency_admin, doublon pending, révocation, upload doc, notification émise
- [ ] Page frontend `/app/settings/agency/upgrade`
- [ ] Composant `<UpgradeRequestForm>` avec autosave (TCK-250)
- [ ] Composant `<UpgradeRequestStatus>` qui affiche l'état courant
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Un agency_admin individual soumet la demande avec tous les champs et upload PDF — création OK + notification super-admins envoyée.
- [ ] AC2 — Un agency_admin standard ne voit pas la page (UI) et reçoit 403 sur l'endpoint.
- [ ] AC3 — Soumission d'une 2e demande tant que la 1ère est pending → 422 avec message clair.
- [ ] AC4 — Révocation d'une demande pending la flippe en `revoked`.
- [ ] AC5 — Form reprenable : quitter et revenir restaure la saisie.
- [ ] AC6 — Activity log entry `agency_upgrade_requested`.

## Hors périmètre

- Console super-admin de review — TCK-268.
- Flip `Agency.kind` à l'approbation + débloquage features — TCK-269.

## Notes d'implémentation

_(à remplir par implementing-specs)_
