---
id: TCK-1996
title: "apiRequest côté serveur porte le profil actif du cookie : pages, mises en page et actions de /app lisent et écrivent dans l'espace choisi"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-174--lectures-serveur-sans-profil-actif-et-le-navigateur-non-plus"
  tickets:
    - "docs/backlog/tickets/TCK-143-frontend-multi-profile-switcher.md"
tags: [front, multi-profil, auth, pistes]
---

## Contexte

Réfs : **P174.02**, **P174.03** du fichier de pistes, `validé`.

Les lectures et les écritures serveur de `/app` (pages, mises en page, actions serveur) appelaient
`apiRequest` avec le seul jeton. `apiRequest` avait un repli serveur pour la langue, l'IP et
l'agent du visiteur, aucun pour le profil actif. Un appel serveur ne porte pas les cookies du
navigateur : l'API ne voyait ni indice ni cookie, et n'auto-bascule que pour une seule agence. Pour
un agent de deux agences (mesuré par l'explorateur et le mesureur) : listes des biens et des
clients à 0, fiches en 403, indicateurs et alertes en 403 `agency.staff_only`, création d'un bien
refusée en 403.

## Décision du porteur

- P174.02 : « validation du porteur (2026-10-23) : la piste telle qu'écrite : repli serveur de l'indice dans `apiRequest` ; même ticket que P174.03 ; à faire avant P174.01 »
- P174.03 : « validation du porteur (2026-10-23) : le même correctif que P174.02, dans le même ticket ; garde : un test API qui crée le bien avec l'indice et vérifie son agence »

## Objectif utilisateur

Un compte présent dans plusieurs agences voit et modifie, dans les pages serveur de `/app`, les
données de l'espace qu'il a choisi.

## Contrat de données

`apiRequest`, côté serveur et pour un appel authentifié (jeton passé) qui ne nomme aucun profil
(ni `activeProfileId`, ni en-tête `X-Active-Profile-Hint` ou `X-Profile-Id`), pose
`X-Active-Profile-Hint` à la valeur de `getActiveProfileId()` (`src/lib/session.ts`) : le cookie
`active_profile_id`, rien pendant une impersonation (TCK-600, invariant 11). Côté API, rien ne
change : `ResolveActiveProfile` ignore un indice invalide et retombe sur l'auto-bascule.

## Contraintes strictes (métier)

- L'appelant qui passe son profil, un indice ou un `X-Profile-Id` l'emporte.
- Aucun indice pendant une impersonation, ni sans jeton, ni dans le navigateur (P174.01).

## Delta à produire

- [x] `src/lib/api.ts` : `resolveServerActiveProfile()` et le repli dans `apiRequest`.
- [x] Test vitest `api.profil-actif-serveur.tck-1996.test.ts` (sous `next/headers` simulé).
- [x] Test API `CreationParUnAgentDeDeuxAgencesTest` : sans indice 403, avec l'indice 201 et le bien
  rangé dans l'agence du profil.

## Critères d'acceptation

- [x] AC1 — cookie de profil présent, appel serveur authentifié sans profil → en-tête posé.
- [x] AC2 — `createProperty` (écriture d'action serveur) part avec l'indice.
- [x] AC3 — impersonation, profil passé par l'appelant, `X-Profile-Id`, sans cookie, sans jeton :
  aucun indice ajouté (ou celui de l'appelant).
- [x] AC4 — API : agent de deux agences, création sans indice → 403 ; avec l'indice de A → 201,
  bien dans A.

## Hors périmètre

- Les appels du navigateur (P174.01), et les clés de requête du navigateur (P197.04, P197.05).
- Les rendus serveur ne sont pas rendus dynamiques par ce repli : `apiRequest` lisait déjà
  `headers()` côté serveur (IP, agent du visiteur).

## Notes d'implémentation

- La règle d'impersonation se prend de `profilActifEspaceApplicatif` (`src/lib/impersonation.ts`,
  déjà importé par `api.ts`, sans dépendance), sur `cookies()` de `next/headers` importé à l'appel.
  ⚠ Piège payé (réparation de la PR #1365) : la première version importait à l'appel
  `@/lib/session`, qui importe `next/headers` en **statique** ; `api.ts` étant aussi chargé côté
  client, `next build` (Turbopack) refusait le graphe — « You're importing a module that depends on
  "next/headers" » — alors que `tsc`, ESLint et vitest étaient verts. Un import statique de
  `profiles.ts` aurait, lui, créé le cycle `api.ts` → `profiles.ts` → `api.ts`.
- Hors requête (build, script) ou sous un `next/headers` simulé sans `cookies`, le repli rend
  `undefined` (même garde que `resolveVisitorIp`).
- Ablation : `src/lib/api.ts` rendu à `HEAD` → 2 rouges sur 7 (les deux cas où l'indice doit être
  posé) ; correctif remis → 7/7. Le test API n'a pas d'ablation côté API : il garde le contrat que
  le repli suppose (le 403 sans indice est son versant négatif).
