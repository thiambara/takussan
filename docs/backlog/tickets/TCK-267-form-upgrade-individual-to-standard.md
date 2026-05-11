---
id: TCK-267
title: "Form upgrade individual → standard (soumission user)"
status: done
phase: P1
family: applicatif
estimate: M
created: 2026-05-10
updated: 2026-05-11
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

### Décisions clés

- **Upload statuts** stocké via `Document` polymorph + spatie/media-library (`documents.documentable_type = AgencyUpgradeRequest::class`, collection `file`). `DocumentType::Other` faute d'enum dédié — éviter la prolifération d'enums avant qu'un cas d'usage produit ne le réclame. Le `DocumentResource` existant peut donc lister la pièce sans changement côté FE.
- **Pré-check pending applicatif** dans `AgencyUpgradeRequestService::submit()` (en plus de l'index unique partiel garanti par TCK-252). Sans ce check, la collision DB remonterait en 500 générique (`QueryException`) ; ici on lève un 422 avec le message localisé `agency_upgrade.submit.errors.pending_exists` et l'`request_id` existant pour que la FE puisse proposer "Révoquer la précédente".
- **Notification super-admins** : `AgencyUpgradeRequestSubmittedNotification` (database+mail, queueable) avec un lien `/super-admin/agency-upgrade-requests/{id}` qui ne résoud pas encore (TCK-268 livrera la console). Le service ré-implémente une mini-résolution `super_admin` (probe sous `team_id = NULL`) plutôt que d'importer `SuperAdminCooptationService` — couplage minimal entre flux upgrade et flux cooptation.
- **Policy `AgencyUpgradeRequestPolicy`** bindée explicitement (`Gate::policy(AgencyUpgradeRequest::class, ...)`) parce que `create` et `viewAny` prennent l'`Agency` en second argument (signature non auto-discoverable). Le service ré-asserte les mêmes règles défensivement pour les appels non-HTTP (jobs, console).
- **Frontend autosave** via `useWizardDraft` direct (pas `WizardReprenable`) — le formulaire est mono-step, l'overhead "stepper + boutons next/prev" n'apporte rien. La clé `agency-upgrade-{agency_id}` est enregistrée dans `WIZARD_RESUME_RULES` pour que la bannière dashboard puisse proposer "reprendre". Le fichier PDF n'est volontairement **pas** persisté dans le draft (binaire ≠ JSON), l'utilisateur le ré-attache au retour.
- **Page** ne redirige pas quand l'agence est déjà `standard` : un panneau "déjà professionnelle" est rendu, ce qui évite que les liens deep-link (notif, sidebar) renvoient une 404 ou un dashboard sans contexte. La sidebar entry "Passer en pro" est gated sur le rôle `agency_admin` côté FE et la kind est re-vérifiée côté backend.
- **Test backend** : la révocation par "autre agency_admin" force une recherche manuelle de `submitted_by` ≠ `auth_user.id` parce que `actingAsRole` recrée à chaque appel un nouvel utilisateur ; la sécurité s'évalue donc sur la combinaison policy `revoke` (creator OU agency_admin de l'agence) plutôt que sur l'identité directe.

### Fichiers touchés

**Backend (commit `8764e231`)**
- `app/Services/Agency/AgencyUpgradeRequestService.php` *(nouveau)* — submit / revoke + fan-out notif super-admins.
- `app/Http/Controllers/Api/Agency/AgencyUpgradeRequestController.php` *(nouveau)* — index / store / destroy.
- `app/Http/Requests/Agency/SubmitAgencyUpgradeRequestRequest.php` *(nouveau)* — validation multipart (PDF/JPG/PNG ≤ 10 Mo).
- `app/Http/Resources/AgencyUpgradeRequestResource.php` *(nouveau)*.
- `app/Policies/AgencyUpgradeRequestPolicy.php` *(nouveau)* — `viewAny` / `view` / `create` / `revoke`, bound explicit dans `AppServiceProvider`.
- `app/Notifications/AgencyUpgradeRequestSubmittedNotification.php` *(nouveau)* — database + mail.
- `routes/api/agencies.php` — 3 routes `agencies/{agency}/upgrade-requests[/{upgradeRequest}]`.
- `app/Providers/AppServiceProvider.php` — bind policy.
- `lang/{fr,en,wo}/agency_upgrade.php` *(nouveaux)*.
- `tests/Feature/Agency/AgencyUpgradeRequestSubmissionTest.php` *(nouveau)* — 12 tests (37 assertions) ; couvre AC1/2/3/4/6 + uploads.

**Frontend (commit `9b946ebd`)**
- `src/types/agency-upgrade.ts` *(nouveau)*.
- `src/lib/queries/agency-upgrade.ts` *(nouveau)* — sparse fieldsets + multipart submit + revoke.
- `src/components/agency/UpgradeRequestForm.tsx` *(nouveau)* — single-step + autosave via `useWizardDraft`.
- `src/components/agency/UpgradeRequestStatus.tsx` *(nouveau)* — états pending/approved/rejected/revoked + revoke CTA.
- `src/components/agency/__tests__/UpgradeRequestForm.test.tsx` *(nouveau)* — 3 tests (no-file / happy path / 422 inline).
- `src/app/(dashboard)/app/settings/agency/upgrade/page.tsx` *(nouveau)* — SSR gating + mount.
- `src/components/layout/AppSidebar.tsx` — entry "Passer en pro".
- `src/lib/wizard-drafts.ts` — règle de resume `agency-upgrade-{id}`.
- `src/messages/{fr,en,wo}.json` — branche `agency.upgrade.{page,form,status}`.

### Non-périmètre confirmé

- Console super-admin de revue → TCK-268.
- Flip `Agency.kind` à l'approbation + débloquage features → TCK-269.
- Pas de modèle `Document` créé (réutilisation du pattern existant).
