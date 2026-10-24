---
id: TCK-2040
title: "Le téléphone vérifié dans « Sécurité » l'est pour le reste de l'application"
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
tags: [web, profil, telephone, pistes]
---

## Objectif

Une vérification du numéro faite dans « Sécurité » se voit partout où le contexte
d'authentification la lit, et un numéro changé dans « Coordonnées » repasse « Sécurité » à
« non vérifié ».

## Contexte

Réf : **P202.03** du fichier de pistes, `retenu · autonome` (A1). Contrat écrit par la voisine
`ProfileContactSection`, qui pose `phone_verified_at` au contexte à sa propre vérification.

- `PhoneVerificationSection` ne posait que son état local (`setVerified(true)`) : le second
  numéro restait caché et « Coordonnées » gardait « Non vérifié ».
- Son `useState(initialVerified)` ignorait ensuite le contexte : un numéro changé dans
  « Coordonnées » restait « vérifié » dans « Sécurité ».

## Hypothèses (mode sans humain)

- L'option retenue est la première de la `Piste` (poser au contexte, lire depuis lui) ; « ne
  garder qu'une des deux vérifications » serait un choix de produit (V7), écarté par le mesureur.
- « Coordonnées » garde son état local (ses propres gestes le tiennent) et le complète par le
  contexte quand celui-ci parle du même numéro enregistré : un contexte resté sur un autre numéro
  ne la fait pas dire « vérifié ».

## Delta à produire

- [x] `PhoneVerificationSection` pose `phone_verified_at` au contexte à la vérification, et lit
  son état dans la propriété (tirée du contexte) ; sa copie locale ne vaut que pour le numéro
  qu'elle a vérifié.
- [x] `ProfileContactSection` lit aussi la vérification dans le contexte, pour le numéro enregistré.
- [x] Test sous un vrai `AuthProvider`, les deux sections montées.

## Critères d'acceptation

- [x] AC1 — Vérifié par « Sécurité », le numéro fait apparaître le second numéro et passe le badge
  de « Coordonnées » à « Vérifié ».
- [x] AC2 — Un numéro changé dans « Coordonnées » repasse « Sécurité » à « Non vérifié ».

## Hors périmètre

- L'effet sur le parcours de publication (`CoordonneesPublication`) n'est pas rendu : il lit le
  contexte, que le correctif tient désormais.
- La cause commune de l'angle (P202.01, à valider).

## Notes d'implémentation

- Test : `takussan-web/src/components/profile/__tests__/PhoneVerificationSection.contexte.tck-2040.test.tsx`.
  Avant correctif : 2 rouges (badge de « Coordonnées » resté « Non vérifié » ; « Sécurité »
  restée « Vérifié » après le changement de numéro).
- Ablation : les deux fichiers à `HEAD` → 2 rouges ; `ProfileContactSection` seul à `HEAD` →
  AC1 rouge, AC2 vert ; correctif remis → 2 verts.
- Piège : « Sécurité » porte deux badges « Vérifié » (adresse et téléphone) ; le test vise le
  bloc du téléphone.
