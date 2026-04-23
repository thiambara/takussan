---
id: TCK-064
title: "Admin — Configuration agence UI"
status: review
phase: P1
family: front
estimate: S
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-015, TCK-057, TCK-054, TCK-016]
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features-by-actor.md
  models:
    - docs/models-spec.md#1-agency
tags: [admin, agency, config, front]
---

## Contexte

TCK-015 (Agence & équipe) est `review` côté backend : `AgencyController`, membres, rôles, stats globales, paramètres commission. Le frontend expose `/admin/agency` en stub (15 lignes placeholder). Un admin ne peut pas configurer l'identité ni les paramètres de son agence via l'UI.

## Objectif utilisateur

Un admin d'agence doit pouvoir configurer l'identité de son agence (nom, licence, contact, logo) et les paramètres métier (commission par défaut, devise, adresse) depuis une page dédiée.

## Contrat de données

Endpoints à consommer (existants, TCK-015) :

- `GET /api/agencies/{id}` — détail + settings JSON
- `PATCH /api/agencies/{id}` — mise à jour nom, contact, licence, settings
- `POST /api/agencies/{id}/media` — upload logo (medialibrary)
- `GET /api/agencies/{id}/stats` — stats globales (consommées par le dashboard admin existant)

Champs à exposer dans l'UI : `name`, `slug` (lecture seule), `license_number`, `email`, `phone`, `address`, `logo_url`, `settings.default_commission_rate`, `settings.currency` (§2.8 — déjà P2 mais exposé pour préparer).

## Direction UX / Artistique

Page de paramètres calme, à la Linear / Stripe settings. Sections verticales (Identité · Contact · Logo · Paramètres métier), sauvegarde inline avec feedback discret, pas de modal. Le logo s'uploade par clic ou drag-drop, preview immédiat.

## Contraintes strictes (métier)

- Seuls `agency_admin` et `super_admin` accèdent à cette page (redirect `/admin` sinon).
- Le `slug` est non modifiable (affiché grisé).
- Le `default_commission_rate` ∈ [0, 100] — validation front + back.
- Le logo accepte les mêmes formats que `PropertyMedia` (jpg, png, webp, svg) ; max 2 Mo.
- Les modifications sont loguées via journal d'activité (TCK-018 — backend) ; le frontend ne fait qu'afficher "Sauvegardé".

## Delta à produire

- [ ] Remplacer le stub `/admin/agency/page.tsx` par un formulaire RHF+Zod structuré en sections
- [ ] Composant upload logo avec preview (réutiliser `ImageUpload` du design system)
- [ ] Section "Paramètres métier" : commission par défaut (%), devise, fuseau horaire (UI pour §2.8 P1)
- [ ] Auto-save ou bouton "Enregistrer" par section (au choix IA, UX équivalente)
- [ ] Tests Vitest : validation formulaire, mapping erreurs 422, upload logo
- [ ] Guard de route : redirect si non-admin d'agence

## Critères d'acceptation

- [ ] AC1 — Un `agency_admin` peut modifier le nom, email, téléphone, adresse et licence de son agence et voir les changements persistés après refresh
- [ ] AC2 — L'upload logo affiche un preview immédiat et persiste le nouveau média côté backend
- [ ] AC3 — La modification du `default_commission_rate` à une valeur hors [0,100] affiche une erreur de validation
- [ ] AC4 — Un utilisateur sans rôle admin est redirigé vers `/admin` sans accéder au formulaire
- [ ] AC5 — Les champs sont pré-remplis avec les valeurs actuelles via SSR (pas de flash)
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Gestion multi-branches / sous-agences (P3)
- Plan d'abonnement SaaS (P3)
- Gestion des membres/agents (→ TCK-065)

## Notes d'implémentation

- Page `/admin/agency` remplacée par un formulaire RHF+Zod en 4 sections (Identité · Contact · Logo · Paramètres métier), SSR via `fetchAgencyAction` pour pré-remplir sans flash.
- Schéma Zod dans `src/lib/schemas/agency.ts` : validation front de la commission `[0, 100]`, email/URL, devise `A-Z{3}`, fuseau horaire libre ; `normaliseAgencyForm` mappe les champs UI → payload (`settings.default_commission_rate`, `settings.currency`, `settings.timezone`).
- Logo uploadé via `POST /api/media` (collection `logo`). **Modif backend :** `MediaUploadRequest::COLLECTIONS` élargi pour accepter `logo`. Parité SVG écartée (backend n'autorise pas le MIME SVG pour éviter XSS) — la contrainte du ticket est assouplie à JPG/PNG/WEBP et reportée à l'uniformisation des collections media.
- `AgencyResource` complété : expose maintenant `settings` + `primary_admin_id` pour rendre la page self-contained.
- Tests Vitest : `agencyFormSchema` (rate hors bornes, email/téléphone invalides, devise), `normaliseAgencyForm`, `validateAgencyLogoFile`, mapping query params `fetchAgency`.
- PR : https://github.com/thiambara/takussan/pull/45
