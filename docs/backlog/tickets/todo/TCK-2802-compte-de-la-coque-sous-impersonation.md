---
id: TCK-2802
title: "Sous impersonation, la coque de /app pose aussi le compte qu'elle a lu quand /api/auth/me dépasse sa borne"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#29-administration--configuration"
tags: [front, auth, session, impersonation, fragilite, suite-de-tck-2765, audit-ux, app]
---

## Objectif utilisateur

Le super-admin qui voit la console « en tant que » un agent voit ce que voit l'agent, même quand l'API répond
lentement. Aujourd'hui, il peut voir l'état vide d'un visiteur sous la navigation de l'agent.

## Contrat de données

**Origine.** Écart consigné par TCK-2765 (section « Écarts », décision 2 du lot) : le correctif y laisse
l'impersonation ouverte, comme le voulait son AC2.

**Constat, relu sur HEAD (`ebc494478`, fichiers sans modification locale) le 2026-11-14 :**

- `src/app/layout.tsx` (l. 117-135) : sous le cookie `IMPERSONATION_COOKIE`, `token` vaut `undefined` (TCK-600,
  ADR-0055 § 6 : aucun jeton exposé à la page). La lecture de `/me` y est bornée à `DELAI_ME_RACINE_MS` comme hors
  impersonation. Au-delà, `initialUser` vaut `null`, et `AuthProvider` reçoit `initialToken={null}`.
- `src/components/auth/CompteDeLaCoque.tsx` : la pose n'a lieu que si `user === null && token !== null`. Sous
  impersonation, `token` est toujours `null`, et rien ne se pose. Son en-tête le dit (« ⚠ Pendant une impersonation… »).
- La coque `(dashboard)/layout.tsx` a pourtant lu le compte de la cible (`getMeAction()`), et elle rend sa
  navigation. Les lecteurs de `useAuth().user` (l'état vide de la messagerie, entre autres) rendent un visiteur.

C'est le défaut de TCK-2765, restreint à l'impersonation.

**Aucun changement d'API.** Seul le serveur du front sait qu'une impersonation est en cours : le cookie est
`httpOnly`.

## Direction UX / Artistique

Rien de visible ne change hors du cas décrit. Sous impersonation lente, la console dit la même chose dans sa coque et
dans son contenu : le compte de la cible.

## Contraintes strictes (métier)

- **Le jeton reste absent de la page sous impersonation** (TCK-600, invariant d'ADR-0055). Le correctif ne transmet
  aucun jeton au navigateur. Le signal « session d'impersonation » vient du serveur, qui lit le cookie.
- **TCK-2765 reste vrai** : hors impersonation, sans jeton, rien ne se pose ; un compte déjà posé n'est jamais
  remplacé ; une déconnexion ou un 401 de `refreshUser` survenus après le montage ne sont pas annulés.
- La distinction entre « impersonation » et « session fermée » ne se déduit pas de l'absence de jeton : elle est
  dite explicitement par le serveur.
- Le compte posé est celui de la cible, celui que la coque a lu. Jamais celui de l'opérateur.

## Delta à produire

- [ ] La coque de `/app` sait, côté serveur, qu'une impersonation est en cours, et le transmet à la pose du compte.
- [ ] La pose du compte accepte ce signal à la place du jeton. Ses autres gardes ne changent pas.
- [ ] L'en-tête de `CompteDeLaCoque` et la section « Écarts » de TCK-2765 sont mis à jour : l'écart est fermé.
- [ ] Tests vitest, à côté de ceux de TCK-2765.

## Critères d'acceptation

- [ ] AC1 — Le VRAI layout `(dashboard)` (`getMeAction` → l'agent cible), sous un cookie d'impersonation, avec
  `AuthProvider initialUser={null} initialToken={null}` : l'état vide de la messagerie est celui du personnel
  (« Écrire à un client »), pas celui du visiteur. Le test lit le texte présent, pas l'absence de l'autre.
- [ ] AC2 — Même montage, SANS cookie d'impersonation et sans jeton : rien ne se pose, l'état vide est celui du
  visiteur. C'est l'AC2 de TCK-2765, rejoué tel quel, et il reste vert.
- [ ] AC3 — Sous impersonation, une déconnexion (ou la sortie d'impersonation qui vide le contexte) après le montage
  n'est pas annulée par la pose.
- [ ] AC4 — Aucun jeton n'apparaît dans le rendu ni dans les props sérialisées vers le client sous impersonation. Le
  test cherche la valeur du cookie d'authentification dans la charge rendue.
- [ ] AC5 — Vérifié par ablation, une à la fois : un signal d'impersonation toujours faux rend AC1 rouge ; un signal
  toujours vrai rend AC2 rouge.

## Hors périmètre

- La valeur de `DELAI_ME_RACINE_MS` et le temps de réponse de `/api/auth/me`.
- Le HTML du premier rendu serveur, qui reste celui du visiteur jusqu'à l'hydratation (même limite que TCK-2765).
- Toute autre règle de l'impersonation (durée, lecture seule, bannière).

## Notes d'implémentation

_(à remplir par implementing-specs)_
