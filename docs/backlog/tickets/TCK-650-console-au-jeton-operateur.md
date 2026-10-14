---
id: TCK-650
title: Les paramètres globaux et les étiquettes de la console agissent au jeton de l'opérateur
status: review
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
  écrivent en tant que la cible : aucune élévation (l'API rejuge), mais les écritures globales
  rendent 403.

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

- [x] Les lectures et écritures de `/super-admin/settings/global` passent au jeton de l'opérateur.
- [x] Les lectures et écritures de `/super-admin/tags` passent au jeton de l'opérateur, sans
      toucher la lecture des étiquettes faite par les formulaires de bien de `/app`.
- [x] Une garde (test ou script) casse si l'arbre `(super-admin)` — ou un composant qu'il rend —
      appelle une action serveur qui lit `getToken()`.
- [x] Tests : un test par écran qui pose les DEUX cookies (opérateur et impersonation) et constate
      que l'API reçoit le jeton de l'opérateur ; un test qui constate que les formulaires de bien
      reçoivent toujours celui de la cible.

## Critères d'acceptation

- [x] AC1 — avec les cookies d'opérateur et d'impersonation posés, chaque lecture et chaque écriture
      de `/super-admin/settings/global` porte le Bearer de l'opérateur (et non celui de la cible).
- [x] AC2 — même constat pour `/super-admin/tags`, lecture, création, modification, suppression.
- [x] AC3 — avec les mêmes cookies, la lecture des étiquettes des formulaires de bien de `/app`
      porte le Bearer de la **cible** : une correction qui basculerait tout le module à l'opérateur
      fait rougir ce critère.
- [x] AC4 — rendre à une page `(super-admin)` une action au jeton courant fait rougir la garde
      (vérifié par ablation).

## Hors périmètre

- Le route handler `/api/super-admin/[...path]` et le layout de la console, déjà au jeton de
  l'opérateur.
- Les actions des autres écrans de `/app` pendant une impersonation.
- Toute modification de l'API.

## Notes d'implémentation

- **Un module à part, `app/actions/console.ts`**, plutôt que deux sources de jeton dans
  `admin-settings.ts`/`admin-tags.ts` : la garde juge par module, et un module qui mélange les deux
  jetons se relit mal. Les quatre actions de paramètres ont quitté `admin-settings.ts` ; les trois
  écritures d'étiquettes ont quitté `admin-tags.ts`, qui ne garde que `fetchTagsAction` (formulaires
  de bien de `/app`, au jeton courant).
- **Garde** : `src/app/(super-admin)/super-admin/__tests__/jeton-operateur.test.ts` parcourt le
  graphe d'imports de `(super-admin)` (192 fichiers) et refuse toute action d'un module qui lit
  `getToken(` — commentaires retirés, puisque `console.ts` NOMME `getToken()`. Deux exceptions
  nommées par action : `getMeOperateurAction` (au jeton opérateur, dans un module mixte) et le
  dialogue d'enrôlement 2FA de `GardeDoubleFacteur` (partagé avec `/app`, inatteignable : le layout
  refuse un opérateur sans second facteur).
- **Ablation** (vitest) : page des étiquettes rebranchée sur `admin-tags` → garde rouge ;
  `console.ts` sur `getToken` → 10 rouges ; `admin-tags` basculé à l'opérateur → AC3 rouge.
- **Mesure à l'API, 2026-10-14** (le contexte de ce ticket disait « la console se vide », c'était
  faux, corrigé) : la cible LIT aussi les clés globales (`GET /api/settings` 200, clé visible), donc
  un rendu de page ne distingue pas les deux jetons ; l'écart est à l'ÉCRITURE — `PUT` d'une clé
  globale : 403 au jeton de la cible, 422 au jeton de l'opérateur (clé du catalogue, refus attendu).
  Pages rendues en 200 avec leur contenu, avec et sans cookie d'impersonation (super-admin de
  démonstration, 2FA posée le temps de la mesure puis rendue, jetons `verif-tck650` révoqués).
- `depends_on: TCK-648` est en `review` sur la même branche (non fusionnée) : implémenté à la suite,
  à la demande.
