---
id: TCK-068
title: "Admin — Paramètres globaux & intégrations"
status: done
phase: P2
family: front
estimate: M
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-023, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#26-setting
    - docs/models-spec.md#27-integration
tags: [admin, settings, integrations, front]
---

## Contexte

TCK-023 (admin configuration) est `done` côté backend : endpoints CRUD pour `settings` (paramètres globaux clé-valeur) et `integrations` (API keys tiers : Wave, Stripe, Orange Money, Mailgun…). La page `/admin/settings` existe en stub (15 lignes). Un admin ne peut pas configurer la plateforme via l'UI.

## Objectif utilisateur

Un super admin doit pouvoir consulter et modifier les paramètres globaux de la plateforme (branding, features flags, limites) et gérer les clés d'intégration tierces (API keys, secrets, webhooks).

## Contrat de données

Endpoints à consommer (existants, TCK-023) :

- `GET /api/settings` — liste paramètres (filter[group], filter[key])
- `PATCH /api/settings/{key}` — mettre à jour une valeur
- `GET /api/integrations` — liste intégrations configurées (provider, is_active, last_checked_at)
- `POST /api/integrations` — ajouter une intégration
- `PATCH /api/integrations/{id}` — mise à jour config
- `POST /api/integrations/{id}/test` — test de connexion
- `DELETE /api/integrations/{id}`

Les secrets (API keys, tokens) ne sont jamais retournés en clair après création — le backend expose un champ masqué (`********`).

## Direction UX / Artistique

Page de paramètres structurée par groupes, à la Vercel / GitHub settings. Navigation latérale secondaire (Général · Email · Notifications · Intégrations · Feature flags). Pour les intégrations : cartes par provider (logo + statut + bouton "Configurer") façon Zapier.

## Contraintes strictes (métier)

- Seuls `super_admin` accèdent à cette page.
- Les secrets ne s'affichent jamais en clair après save ; seul le remplacement est possible.
- Le bouton "Tester la connexion" appelle `/integrations/{id}/test` et affiche le résultat (vert/rouge + message backend).
- La modification d'un setting sensible (ex: `maintenance_mode=true`) demande une confirmation explicite.

## Delta à produire

- [ ] Remplacer le stub `/admin/settings/page.tsx` par une page structurée avec sous-sections
- [ ] Sous-page `/admin/settings/integrations` : cartes par provider + formulaires de config
- [ ] Composant `SecretInput` (affichage masqué, remplacement contrôlé)
- [ ] Bouton "Tester la connexion" avec feedback (loading → success/error)
- [ ] Section "Feature flags" (P3 côté back, simple table {key, enabled, description})
- [ ] Tests Vitest : rendu sections, masquage secrets, flow test connexion

## Critères d'acceptation

- [ ] AC1 — Un `super_admin` peut consulter tous les paramètres groupés par catégorie
- [ ] AC2 — La modification d'un paramètre persiste et confirme visuellement
- [ ] AC3 — L'ajout d'une intégration Wave ou Stripe avec clé API fonctionne ; la clé n'est plus visible après save
- [ ] AC4 — Le bouton "Tester la connexion" affiche OK (vert) ou KO (rouge + message d'erreur backend)
- [ ] AC5 — Un non-`super_admin` est redirigé
- [ ] AC6 — `npm run build` + `npm run test` verts

## Hors périmètre

- Configuration des templates email (UI dédiée) — à traiter au sein de cette page en "Email settings" si besoin, sinon ticket séparé
- Mode maintenance programmé (P3)
- Implémentation des providers de paiement eux-mêmes (→ ticket séparé Wave/Orange/Stripe P2)

## Notes d'implémentation

- Page `/admin/settings` refactorisée : nav secondaire (Général · Tags · Intégrations) + `SettingsManager` (table clé/valeur, filtre par scope, édition inline, confirmation explicite pour clés sensibles `maintenance_mode`/`feature_flags`). Seul `super_admin` peut éditer les settings `global` (check front + back).
- Sous-page `/admin/settings/integrations` : `IntegrationsManager` en cartes par provider (toggle actif, tester, configurer, supprimer). Dialog partagé create/edit, `SecretInput` avec toggle afficher/masquer, payload `edit` omet `credentials` si vide pour préserver le secret stocké.
- **Nouvelle route backend :** `POST /api/integrations/{id}/test` → `IntegrationController@test`. Version minimaliste (actif + credentials non vide) ; les vraies vérifs par provider (Wave, Stripe…) relèvent d'un ticket paiement P2. Route `PATCH` aliasée ajoutée pour cohérence avec les autres routes.
- **Robustesse legacy :** `credentials` est castée `encrypted:array` côté modèle mais le contrôleur existant fait `json_encode` avant création — `test()` normalise donc string→array en lecture pour ne pas casser sur des rows historiques.
- Feature flags : pas d'implémentation dédiée — les drapeaux sont gérés comme des settings `feature_flags:*` classiques via l'UI existante. Ticket P3 pour une table dédiée si besoin.
- Tests Vitest : rendu carte provider, flow test success/failure, masquage du secret jusqu'au clic "Afficher". Test PHP : `test_test_endpoint_reports_ok_with_credentials` + `test_test_endpoint_reports_ko_when_inactive`.
- PR : https://github.com/thiambara/takussan/pull/45
