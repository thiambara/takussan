---
id: TCK-650
title: Les paramètres globaux et les étiquettes de la console agissent au jeton de l'opérateur
status: todo
phase: P1
family: front
estimate: S
wave: 78
created: 2026-10-14
updated: 2026-10-14
depends_on: [TCK-648]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, impersonation, adr-0055, adr-0064]
---

## Objectif utilisateur

Un super-admin qui impersonne un utilisateur garde, dans sa console, la main sur les paramètres
globaux et les étiquettes : la console agit toujours en son nom, jamais en celui de la cible.

## Contrat de données

- Consommés, inchangés : `/api/settings` (éditeur brut de la table `settings`) et `/api/tags`.
- Règle : ADR-0055 §6 (TCK-600) — la console lit **toujours** avec le jeton de l'opérateur, même
  pendant une impersonation ; l'espace applicatif lit en tant que la cible. Le layout de
  `/super-admin` et le route handler `/api/super-admin/[...path]` la tiennent déjà.
- Écart mesuré le 2026-10-14 : `/super-admin/settings/global` (TCK-648) et `/super-admin/tags`
  passent par les actions serveur de `admin-settings.ts` et `admin-tags.ts`, qui lisent
  `getToken()` — le cookie d'impersonation d'abord. Pendant une session, ces deux écrans lisent et
  écrivent en tant que la cible : aucune élévation (l'API rejuge), mais la console se vide ou rend
  des 403 sur les écritures globales.

## Direction UX / Artistique

Aucun changement visible hors impersonation. Pendant une impersonation, les deux écrans se
comportent exactement comme sans elle.

## Contraintes strictes (métier)

- Le jeton de l'opérateur, et le profil actif de l'opérateur (jamais celui que l'impersonation
  neutralise), accompagnent chaque lecture et chaque écriture de ces deux écrans.
- `fetchTagsAction`, lue aussi par les formulaires de bien de `/app/properties`, **garde** le jeton
  courant (la cible pendant une impersonation) : l'espace applicatif ne change pas de règle.
- L'éditeur des intégrations de `/app/agency/integrations` reste au jeton courant : c'est une page
  de l'espace applicatif.

## Delta à produire

- [ ] Les lectures et écritures de `/super-admin/settings/global` passent au jeton de l'opérateur.
- [ ] Les lectures et écritures de `/super-admin/tags` passent au jeton de l'opérateur, sans
      toucher la lecture des étiquettes faite par les formulaires de bien de `/app`.
- [ ] Une garde (test ou script) casse si l'arbre `(super-admin)` — ou un composant qu'il rend —
      appelle une action serveur qui lit `getToken()`.
- [ ] Tests : un test par écran qui pose les DEUX cookies (opérateur et impersonation) et constate
      que l'API reçoit le jeton de l'opérateur ; un test qui constate que les formulaires de bien
      reçoivent toujours celui de la cible.

## Critères d'acceptation

- [ ] AC1 — avec les cookies d'opérateur et d'impersonation posés, chaque lecture et chaque écriture
      de `/super-admin/settings/global` porte le Bearer de l'opérateur (et non celui de la cible).
- [ ] AC2 — même constat pour `/super-admin/tags`, lecture, création, modification, suppression.
- [ ] AC3 — avec les mêmes cookies, la lecture des étiquettes des formulaires de bien de `/app`
      porte le Bearer de la **cible** : une correction qui basculerait tout le module à l'opérateur
      fait rougir ce critère.
- [ ] AC4 — rendre à une page `(super-admin)` une action au jeton courant fait rougir la garde
      (vérifié par ablation).

## Hors périmètre

- Le route handler `/api/super-admin/[...path]` et le layout de la console, déjà au jeton de
  l'opérateur.
- Les actions des autres écrans de `/app` pendant une impersonation.
- Toute modification de l'API.

## Notes d'implémentation

_(à remplir par implementing-specs)_
