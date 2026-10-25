---
id: TCK-2042
title: "Accepter une invitation en étant connecté relit le compte et ses profils"
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
tags: [web, invitations, profils, pistes]
---

## Objectif

Après une invitation acceptée par un compte connecté, le navigateur connaît le profil qu'elle
ajoute (`useAuth().user.roles`, liste des profils) avant d'arriver dans l'assistant.

## Contexte

Réf : **P202.04** du fichier de pistes, `retenu · autonome` (A1). Contrat écrit par les assistants
qui créent un profil (`AgentOnboardingWizard`, `ServiceProviderOnboardingWizard`,
`HostIndividualWizard`), qui font `await refreshUser()`.

- La branche connectée d'`AccepterInvitation` faisait `router.push(destination)` seul ; la
  `Navbar`, `PaymentsTabs`, `VisitsList` et `MaintenanceList` lisent `user.roles`.

## Hypothèses (mode sans humain)

- La relecture se fait avant la navigation, comme la `Piste` le dit : la destination est
  l'assistant du profil activé, qui peut lire les rôles dès son montage.

## Delta à produire

- [x] Branche connectée : `await refreshUser()`, puis invalidation de `profilesKeys.all`, puis
  `router.push`.
- [x] Test de la relecture et de son ordre ; le test existant monte un `QueryClientProvider`.

## Critères d'acceptation

- [x] AC1 — Connecté, invitation acceptée : `refreshUser` est appelé avant `router.push`, et
  `['me', 'profiles']` est invalidée.

## Hors périmètre

- La cause commune de l'angle (P202.01, à valider).
- La branche non connectée, qui ouvre déjà une session neuve par `openSession`.

## Notes d'implémentation

- Test : `takussan-web/src/app/invitations/accept/__tests__/AccepterInvitation.relecture.tck-2042.test.tsx`.
  Avant correctif : rouge, l'ordre relevé est `['push …']` sans `refreshUser`.
- Ablation : `AccepterInvitation.tsx` à `HEAD` → rouge ; remis → vert.
- `AccepterInvitation.test.tsx` monte désormais un `QueryClientProvider` (le composant lit
  `useQueryClient`), comme la mise en page racine le fournit.
- Piège : importer `profilesKeys` depuis `useProfiles` tirait les espaces `profile` et `ui` dans la
  frontière i18n `invitations` (`check:i18n-namespaces` rouge) ; la clé est redéclarée dans le
  composant, comme `credits-solde.ts` le fait pour la même raison.
