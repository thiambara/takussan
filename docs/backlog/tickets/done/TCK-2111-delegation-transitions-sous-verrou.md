---
id: TCK-2111
title: "Les transitions d'une délégation de rôle se jugent sur la ligne verrouillée"
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
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#66-roledelegation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-211--gestes-décriture-qui-jugent-le-statut-sur-le-modèle-lié-hors-verrou"
tags: [api, delegations, concurrence, pistes]
---

## Objectif

`RoleDelegationService::revoke`, `activate` et `expire` relisent la délégation sous `lockForUpdate`
dans leur transaction et jugent le statut sur elle : une délégation révoquée pendant le passage de
`ProcessRoleDelegationsJob` n'est plus réactivée.

## Contexte

Réf : **P211.06** du fichier de pistes, `retenu · autonome` (A1).

- La tâche planifiée charge `readyToActivate()` / `readyToExpire()` puis appelle `activate` /
  `expire` sur chaque modèle chargé ; ces méthodes jugeaient `status` sur ce modèle et écrivaient
  par `markActive` / `markExpired`, sans condition sur la ligne. Une révocation faite entre le
  chargement et l'appel était écrasée (`active`, `revoked_at` conservé) et le délégataire prévenu.

## Hypothèses (mode sans humain)

- La piste propose une mise à jour conditionnelle ou un verrou relu : le verrou relu est retenu,
  patron des autres entrées de l'angle (TCK-1822). Sur un statut qui ne permet plus le geste, la
  méthode ne fait rien, comme avant sur le modèle reçu.
- Le modèle reçu est rafraîchi après une transition faite : `markX` le mettait à jour avant, ses
  appelants peuvent le relire.

## Delta à produire

- [x] `revoke`, `activate`, `expire` : statut jugé sur la ligne relue sous verrou ; écriture,
  événement et journal faits sur elle, seulement si la ligne a été prise.

## Critères d'acceptation

- [x] AC1 — Délégation `scheduled` chargée par `readyToActivate()`, révoquée derrière : `activate`
  la laisse `revoked`, sans `activated_at`, sans `RoleDelegationActivated`.
- [x] AC2 — Délégation `active` chargée par `readyToExpire()`, révoquée derrière : `expire` la laisse
  `revoked`, sans `RoleDelegationExpired`.
- [x] AC3 — Seconde révocation sur un modèle périmé : rien, `revoked_by` du premier, un seul
  `RoleDelegationRevoked`.
- [x] AC4 — Témoin : une délégation programmée s'active toujours.

## Hors périmètre

- Les autres gestes de l'angle 211 (tickets à part).

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Api/Permissions/RoleDelegationSousVerrouTest.php`. Avant
  correctif : AC1 à AC3 rouges (statut écrasé, second révoqueur inscrit).
- Ablation : `RoleDelegationService.php` remis à `HEAD` → 3 rouges ; correctif remis → 4 verts.
