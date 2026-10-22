---
id: TCK-1320
title: "La fin d'une délégation de rôle est inclusive : une date seule est retirée à la fin du jour, heure de Dakar"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#66-roledelegation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-128--dates-des-charges-utiles-de-notification-et-leur-lecture-par-le-front"
tags: [back, permissions, delegation, pistes]
---

## Contexte

Réf : **P128.01** du fichier de pistes, `validé` (V2 et V7 accordés).

Décision du porteur : la fin d'une délégation est inclusive : « jusqu'au 25 » est retirée à la fin du 25, heure de Dakar

Le champ « Fin » de la création d'une délégation est un `<input type="date">` : l'API recevait
`2026-10-25`, le rangeait à 00:00 et `ProcessRoleDelegationsJob` retirait le rôle au début du jour
que la notification annonce comme dernier (« jusqu'au 25 octobre 2026 »).

## Objectif utilisateur

Le bénéficiaire garde le rôle délégué pendant tout le dernier jour annoncé.

## Contrat de données

`POST /api/agencies/{agency}/role-delegations` : un `ends_at` sans heure (`YYYY-MM-DD`) se range
à 23:59:59 de ce jour, heure de Dakar ; un instant explicite reste rangé tel quel. Aucun
changement de schéma ni de forme de réponse.

## Delta à produire

- [x] `RoleDelegationService::create` : une date de fin seule devient la fin de ce jour dans
  `Africa/Dakar`.
- [x] Test `RoleDelegationFinInclusiveTest` (date seule et instant explicite).

## Critères d'acceptation

- [x] AC1 — `ends_at = 2026-10-25` → rangée `2026-10-25 23:59:59` (Dakar), notification
  `params.ends_at = 2026-10-25`.
- [x] AC2 — le job la laisse active à 12:00 et 23:59 le 25, et l'expire le 26 à 00:00:01.
- [x] AC3 — un `ends_at` avec heure est rangé sans changement.

## Hors périmètre

- Le libellé du champ « Fin » côté front (la décision ne le change pas).
- La date de début (`starts_at`) : une date seule reste le début du jour, ce qui est déjà inclusif.
- Les délégations déjà rangées à 00:00 : aucune réécriture de données.

## Notes d'implémentation

- Ablation : `'ends_at' => $data['ends_at']` remis dans le service → AC1 rouge (« Failed asserting
  that two strings are identical », rangée à 00:00:00) ; correctif remis → vert.
- La borne de durée (`before_or_equal` à 366 jours) se juge avant la conversion : une date seule
  au dernier jour permis passe, et finit au plus 24 h au-delà de la borne en instant.
