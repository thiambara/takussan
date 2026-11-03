---
id: TCK-209
title: "Super-admin — Onboarding agence (création + admin initial)"
status: done
phase: P1
family: applicatif
estimate: M
wave: 23
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-145]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#112-agence--équipe
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#1-user
tags: [back, front, super_admin, p1]
---

## Contexte

Aujourd'hui les agences sont créées par seed/SQL ou par auto-inscription publique (TCK-022). Pour onboarder un partenaire stratégique, le support doit ouvrir un terminal — il n'existe aucun parcours dans la console super-admin pour provisionner une agence et son `agency_admin` initial. Conséquence : le canal d'acquisition B2B est freiné et chaque création échappe à l'audit cross-tenant.

## Objectif utilisateur

Un super-admin lance un wizard depuis `/super-admin/agencies` qui crée l'agence, son `agency_admin` initial (avec invitation par email) et journalise l'opération — en un parcours unique, sans ligne de commande.

## Contrat de données

Endpoints à exposer :

- `POST /api/admin/agencies` — body `{ agency: {name, slug, type, email, phone, address}, admin: {first_name, last_name, email, language} }` → renvoie l'agence et l'utilisateur créés
- L'invitation `agency_admin` réutilise le flow d'invitation existant (TCK-015) — token + email "Activez votre compte"

## Direction UX / Artistique

Wizard en 2 étapes (`Agence` → `Admin initial` → `Récap`). Validation inline. Bouton final "Créer et inviter l'admin" non répétable (loading + disabled). Toast de succès avec lien vers la fiche `/super-admin/agencies/[id]` (TCK-208) à l'arrivée. Cohérent avec le shell super-admin (couleur d'accent dédiée).

## Contraintes strictes (métier)

- Endpoint super-admin-only — sous `/api/admin/`, gardé par `EnsureSuperAdmin`.
- Transaction unique : si l'envoi d'invitation échoue, rollback de l'agence et de l'admin (état cohérent obligatoire).
- L'agence créée a `status=active` et `verified=false` par défaut — la vérification reste un acte manuel ultérieur.
- Activity log obligatoire : événement `super_admin_agency_provisioned` avec `actor_id`, `agency_id`, `admin_user_id`.
- Le slug est généré côté serveur (unique, déterministe à partir du nom) — le wizard l'affiche et permet de l'écraser.
- L'email admin est validé : si déjà existant en base avec un autre profil, refuser (409) avec message clair.

## Delta à produire

- [ ] Migration : aucune — réutilise schémas existants
- [ ] FormRequest `Api\Admin\StoreAgencyOnboardingRequest`
- [ ] Service `App\Services\Admin\AgencyProvisioningService` (transactionnel)
- [ ] Endpoint `POST /api/admin/agencies` → `Admin\AgencyOnboardingController@store`
- [ ] Resource `Admin\AgencyProvisioningResource` (renvoie agency + admin)
- [ ] Activity log événement `super_admin_agency_provisioned`
- [ ] Frontend : composant wizard `AgencyOnboardingDialog` accessible depuis le bouton "Nouvelle agence" sur `/super-admin/agencies`
- [ ] Frontend : redirect / lien vers `/super-admin/agencies/[id]` après succès
- [ ] Tests backend : succès, échec validation, échec collision email admin, rollback si invitation échoue, 403 hors super-admin
- [ ] Tests UI : flow happy path, gestion erreur 409, bouton non répétable

## Critères d'acceptation

- [ ] `POST /api/admin/agencies` crée agence + admin + invitation en une transaction (échec → aucun résidu en base)
- [ ] L'admin créé a le rôle `agency_admin` scopé sur la nouvelle agence (`team_id = agency.id`)
- [ ] Un email d'invitation est envoyé avec un lien d'activation valide ≤ 7 jours
- [ ] Un agency_admin tentant `POST /api/admin/agencies` reçoit 403
- [ ] L'événement `super_admin_agency_provisioned` apparaît dans `/super-admin/audit`
- [ ] Le wizard ne soumet pas deux fois en cas de double-clic

## Hors périmètre

- KYC documentaire / vérification post-onboarding (extension de spec requise)
- Plans, quotas, facturation plateforme (extension de spec requise)
- Import en masse d'agences (CSV) — out of scope

## Notes d'implémentation

L'invitation initiale réutilise le broker de reset password existant : token court (60 min) et notification localisée déjà câblée.
