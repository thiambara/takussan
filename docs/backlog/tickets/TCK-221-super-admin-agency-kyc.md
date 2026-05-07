---
id: TCK-221
title: "Super-admin — KYC documentaire des agences (workflow vérification)"
status: todo
phase: P1
family: applicatif
estimate: L
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-208]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#42-kycdossier-
    - docs/models-spec.md#2-agency
tags: [back, front, super_admin, kyc, p1]
---

## Contexte

Aujourd'hui la "vérification" d'une agence est un simple flag (TCK-144 expose `verify` / `unverify` sans dossier). Sans pièces justificatives, le super-admin opère à l'aveugle et la plateforme ne peut pas tenir un standard de confiance documenté. La spec étend §1.12 avec un dossier KYC obligatoire.

## Objectif utilisateur

Une agence soumet son dossier KYC (RCCM, NINEA, pièce du dirigeant, attestations). Un super-admin instruit le dossier depuis `/super-admin/agencies/[id]/kyc`, accepte ou rejette avec motif catalogué — la décision déverrouille / bloque la vérification de l'agence.

## Contrat de données

Endpoints à exposer :

- `GET /api/admin/kyc?filter[status]=pending|submitted&filter[subject_type]=Agency` — file de modération
- `GET /api/admin/agencies/{id}/kyc` — dossier de l'agence (avec medialibrary urls signées)
- `POST /api/agencies/{id}/kyc/submit` — l'agency_admin soumet son dossier (transition pending → submitted)
- `POST /api/admin/kyc/{dossier}/verify` — super-admin (transition submitted → verified) ; déclenche l'élévation `Agency.status` vers `verified` selon la logique existante
- `POST /api/admin/kyc/{dossier}/reject` — body `{ reason }` (transition submitted → rejected)
- Upload de pièces : routes medialibrary standard sur la collection `documents` du dossier

## Direction UX / Artistique

Côté agence : page `/admin/agency/kyc` avec uploader multi-fichiers, statut en haut, motif de rejet visible si présent. Côté super-admin : intégration dans la fiche agence (TCK-208) sous un onglet "KYC" avec timeline du dossier, prévisualisation des pièces (PDF / image), boutons "Vérifier" / "Rejeter avec motif".

## Contraintes strictes (métier)

- Seul un super-admin peut transitionner vers `verified` ou `rejected`. La soumission est ouverte à l'`agency_admin` de l'agence concernée.
- Le passage à `verified` est interdit si une pièce obligatoire manque (config par type de sujet — pour `Agency` : RCCM, NINEA, pièce dirigeant).
- Aucune transition n'est possible si le dossier est `verified` (verrou) — un nouveau dossier doit être créé en cas de re-vérification (versionning par cycle).
- Activity log obligatoire sur chaque transition (`kyc_submitted`, `kyc_verified`, `kyc_rejected`).
- Les URLs des pièces sont **signées et expirent ≤ 15 minutes** — jamais d'URL publique.
- Toujours utiliser `fields[...]`, `filter[...]`, `include=`.

## Delta à produire

- [ ] Migration : table `kyc_dossiers` + collection medialibrary `documents`
- [ ] Modèle `App\Models\KycDossier` (morphTo `subject`, casts, scopes, LogsActivity)
- [ ] Service `App\Services\Kyc\KycWorkflowService` (transitions, validation des pièces obligatoires)
- [ ] Controller agency-side `Api\Agency\KycController` (`show`, `submit`, upload de pièces)
- [ ] Controller super-admin `Admin\KycController` (`index`, `show`, `verify`, `reject`)
- [ ] FormRequests, Resources
- [ ] Politique d'élévation `Agency.status` post-`verified` (réutilise `AgencyModerationService` existant)
- [ ] Notifications : `KycSubmittedToReview`, `KycVerified`, `KycRejected` (canal email + in-app)
- [ ] Activity log événements
- [ ] Frontend : page `/admin/agency/kyc` (agence) + onglet KYC dans la fiche agence super-admin (TCK-208)
- [ ] Composants : `KycDossierTimeline`, `KycDocumentUploader`, `KycReviewPanel`
- [ ] Tests backend : transitions, blocage si pièce manquante, 403 hors rôle, URL signée valide ≤ 15min
- [ ] Tests UI : upload, soumission, verify, reject avec motif

## Critères d'acceptation

- [ ] Une agence ne peut pas être `verified` sans un dossier KYC en statut `verified`
- [ ] Le super-admin ne peut pas bypass la validation des pièces obligatoires (test feature)
- [ ] Une transition vers `verified` ou `rejected` génère une entrée d'audit
- [ ] Les URLs de pièces sont signées, expirent ≤ 15min, et 403 hors `super_admin` / `agency_admin` propriétaire
- [ ] L'`agency_admin` voit le motif de rejet textuellement
- [ ] La file `/super-admin/kyc` paginée affiche les dossiers `submitted` triés par `submitted_at` ASC

## Hors périmètre

- KYC pour les profils utilisateurs (OwnerProfile, AgentProfile, BrokerProfile, ServiceProviderProfile) — réutilisera le même `KycDossier` polymorphe ; ticket dédié à filer après l'agency-side
- OCR / extraction automatique des champs (P3, ticket dédié)
- Export du dossier complet en PDF — out of scope
- Multi-cycles de vérification (re-KYC annuel) — out of scope ici

## Notes d'implémentation

_(à remplir par implementing-specs)_
