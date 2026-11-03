---
id: TCK-2098
title: "La date de réception d'une demande de droits se pré-remplit et se borne au jour UTC de l'API"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2094]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-212--dates-calendaires-et--aujourdhui--calculés-au-navigateur-face-au-jour-utc-de-lapi"
tags: [front, console, rgpd, dates, pistes]
---

## Contexte

Réf : **P212.03** du fichier de pistes, `retenu · autonome` (A1 : la borne est écrite par la règle
de l'API, `StorePrivacyRequestRequest` : `received_at` `before_or_equal:today`, en UTC).

`aujourdhui()` (`PrivacyRequestChamps.tsx`), défaut et `max` du champ `received_at` de
`CreatePrivacyRequestForm`, rendait le jour LOCAL : à l'est d'UTC, entre minuit local et minuit
UTC, la valeur par défaut était le lendemain du `today` de l'API, qui la refusait en 422.

## Delta à produire

- [x] `aujourdhui()` rend `jourDeLApi()` (TCK-2094) ; ses deux appelants n'en changent pas.
- [x] Test : `PrivacyRequestChamps.aujourdhui.p212-03.test.ts`.

## Critères d'acceptation

- [x] AC1 — À 22:30 Z le 24 octobre sous `Europe/Paris`, `aujourdhui()` rend `2026-10-24`.

## Hors périmètre

- Ce qui est conservé ou exposé d'une demande de droits : inchangé.

## Notes d'implémentation

- Ablation : `PrivacyRequestChamps.tsx` rendu à `pre-dev` → test rouge (« expected '2026-10-25'
  to be '2026-10-24' ») ; correctif remis → vert, et `PrivacyRequestsConsole.test.tsx` (7) vert.
