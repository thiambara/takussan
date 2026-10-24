---
id: TCK-2162
title: "La vérification d'e-mail par le lien relit le compte de la session"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-202--gestes-qui-changent-apiauthme-sans-relire-le-contexte-dauthentification"
tags: [web, auth, verification-email, pistes]
---

## Objectif

Après un lien de vérification d'e-mail réussi, ouvert sous une session, le contexte
d'authentification dit l'adresse vérifiée.

## Contexte

Réf : **P202.07** du fichier de pistes, `validé` (critère V2 accordé). Le layout racine et la page
se rendent en parallèle (`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`) :
`/api/auth/me` peut être lu avant que la page n'ait vérifié, et le contexte garde alors
`email_verified_at: null` (`ProfileSecuritySection` dit l'adresse « non vérifiée »).

## Décision du porteur

validation du porteur (2026-10-24) : sur la page de succès de la vérification d'e-mail, un composant client appelle `refreshUser()` au montage quand un jeton est présent, comme TCK-2042

## Hypothèses (mode sans humain)

- « Quand un jeton est présent » : le jeton que lit la page serveur (`getToken()`), celui qui
  décide déjà du lien proposé. Sans session, rien n'est relu : il n'y a pas de compte au contexte.

## Delta à produire

- [x] Composant client `RelireLeCompteAuMontage` (`src/components/auth/`) : `refreshUser()` au
  montage, ne rend rien.
- [x] Page de succès : le composant est monté quand un jeton est présent.
- [x] Test de la page sous un vrai `AuthProvider` ; la simulation d'`useAuth` de
  `transactional-links.test.tsx` gagne `refreshUser`.

## Critères d'acceptation

- [x] AC1 — Succès sous session : `/api/auth/me` est relu une fois et le contexte porte
  `email_verified_at`.
- [x] AC2 — Succès sans session : aucune relecture.
- [x] AC3 — Lien refusé : aucune relecture.

## Hors périmètre

- L'ordre réel des deux appels au navigateur, non rendu (le défaut se règle quel qu'il soit).
- La cause commune de l'angle : TCK-2158.

## Notes d'implémentation

- Test : `takussan-web/src/app/(auth)/auth/verify-email/[id]/[hash]/__tests__/page.relecture.tck-2162.test.tsx`.
  Avant correctif : AC1 rouge (le contexte reste « non vérifiée »), AC2 et AC3 verts.
- Ablation : `page.tsx` à `HEAD` → 1 rouge ; remis → 3 verts.
- Piège : `transactional-links.test.tsx` simulait `useAuth` par `{ setUser }` seul ; le composant
  monté y levait `refreshUser is not a function`.
