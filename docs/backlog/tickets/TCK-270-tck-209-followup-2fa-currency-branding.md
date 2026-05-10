---
id: TCK-270
title: "TCK-209 follow-up — 2FA recommandé + choix devise + branding dès activation"
status: todo
phase: P1
family: applicatif
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#28-internationalisation--préférences"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, front, super-admin, agency, onboarding, p1]
---

## Objectif utilisateur

Compléter le parcours d'onboarding agence livré par TCK-209 (déjà `done`) avec 3 améliorations identifiées dans le discovery onboarding 2026-05-10 : proposition (non bloquante) de 2FA TOTP au nouveau `agency_admin`, choix de la devise agence dès le step 1 du wizard, et accessibilité immédiate du branding (logo) et du sous-domaine.

## Contrat de données

**1. Devise dans le wizard d'onboarding agence (super-admin)**
- Endpoint TCK-209 `POST /api/admin/agencies` — étendre body avec `agency.currency` (enum `Currency`, default `XOF`).
- Frontend : ajouter un select "Devise" dans le step 1 du wizard super-admin.

**2. 2FA recommandé pour le nouvel agency_admin**
- Wizard d'onboarding du nouvel admin (post-acceptation invitation TCK-209) : ajouter un step optionnel "Sécurisez votre compte avec un 2FA" (skippable). Si `User.role = agency_admin`, proposer mais ne pas forcer.

**3. Branding & sous-domaine dès activation**
- Aucun changement backend (les endpoints `PATCH /api/agencies/{agency}` + upload logo via medialibrary existent déjà).
- Frontend : ajouter un bandeau "Personnalisez votre agence" dans le dashboard `agency_admin` post-activation, lien vers `/app/settings/agency/branding` (page logo + sous-domaine + couleurs primaires) — accessible **dès** `kind = standard` ou `kind = individual` (pas de paywall MVP).

## Direction UX / Artistique

- **Devise** : select positionné après le nom et avant l'email dans le step 1 du wizard agence super-admin. Default XOF visible.
- **2FA recommandé** : step inséré après le step "Vérification email" du wizard agency_admin. Layout : illustration "bouclier", titre "Renforcez la sécurité de votre agence", body 1 phrase, 2 boutons : "Configurer maintenant" / "Plus tard".
- **Branding** : bandeau dashboard agency_admin avec icône palette, "Personnalisez votre agence avec votre logo et vos couleurs", CTA "Configurer".

## Contraintes strictes (métier)

- 2FA reste **non bloquant** pour `agency_admin` (différence avec super-admin TCK-264 où c'est bloquant).
- Devise XOF par défaut si non précisée.
- Le bandeau branding disparaît une fois le logo uploadé (signal de complétion).
- Pas de modification de TCK-209 (déjà done) — ce ticket ajoute, ne modifie pas.
- Activity log : `agency_admin_2fa_offered`, `agency_admin_2fa_enrolled` (si validé), `agency_branding_initialized`.

## Delta à produire

- [ ] Backend : étendre `POST /api/admin/agencies` (TCK-209) pour accepter `currency` — modifier le FormRequest et le service de création.
- [ ] Frontend : ajout select devise dans step 1 du wizard super-admin agence
- [ ] Frontend : nouveau step "2FA recommandé" dans le wizard onboarding agency_admin (réutilise `<TotpEnrollment>` créé en TCK-264)
- [ ] Frontend : bandeau "Personnalisez votre agence" sur dashboard agency_admin (disparaît si logo présent)
- [ ] Page `/app/settings/agency/branding` (logo + sous-domaine + couleur primaire) — peut déjà exister partiellement, à vérifier
- [ ] Tests backend : création agence avec/sans currency
- [ ] Tests frontend : step 2FA skippable, bandeau branding apparait/disparait selon présence logo
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Wizard super-admin agence (TCK-209) propose le choix de devise en step 1, default XOF.
- [ ] AC2 — Le nouvel `agency_admin` voit un step 2FA optionnel pendant son onboarding ; le skip n'empêche pas d'arriver sur le dashboard.
- [ ] AC3 — Activation du 2FA via ce step génère secret + 8 codes de récupération (affichés une seule fois).
- [ ] AC4 — Dashboard `agency_admin` post-activation affiche le bandeau branding ; il disparaît dès qu'un logo est uploadé.
- [ ] AC5 — Activity log entries appropriées.

## Hors périmètre

- Modification de TCK-209 lui-même (déjà mergé).
- Workflow 2FA bloquant pour agency_admin — non souhaité pour MVP.
- Paywall ou logique freemium sur branding/sous-domaine — pas de quotas MVP.

## Notes d'implémentation

_(à remplir par implementing-specs)_
