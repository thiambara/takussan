---
id: TCK-2114
title: "Un PATCH partiel ne réactive plus un gabarit coupé ni n'efface les bornes d'un plan"
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
    - "docs/features.md#23-notifications"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#43-plan-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-214--formulaires-dédition-qui-renvoient-en-entier-une-colonne-json-quils-ne-montrent-quen-partie"
tags: [api, super-admin, notifications, abonnements, pistes]
---

## Contexte

Réf : **P214.02** du fichier de pistes, `validé (délégué)` (V7 accordé).

Deux routes du super-admin remplaçaient ce qu'un appel partiel n'envoyait pas :
`PATCH /api/admin/notification-templates/{event}/{channel}` lisait un `is_active` absent comme
`true` et réactivait un gabarit coupé ; `PATCH /api/admin/plans/{plan}` remplaçait `limits` en
entier, et `limits: {max_agents: 5}` effaçait les deux autres bornes. La console renvoie tout
aujourd'hui : le défaut était latent.

## Décision du porteur (déléguée)

`is_active` absent du `PATCH` d'un gabarit garde l'état que la lecture rend (`$rows->first()?->is_active ?? true`, `NotificationTemplateService.php:40`) ; `limits` d'un `PATCH` de plan fusionné clé par clé avec les bornes en base, une clé envoyée à `null` retirée, comme `settings` (TCK-593) ; `limits: null` en entier garde son sens d'aujourd'hui (le plan n'a plus de bornes) ; tests : gabarit coupé puis `PATCH` des seuls `templates` → reste coupé ; plan à trois bornes puis `limits: {max_agents: 5}` → les deux autres gardées

## Delta à produire

- [x] `NotificationTemplateService::update` : `is_active` absent prend l'état des lignes en base,
  `true` s'il n'y en a aucune.
- [x] `PlanController::update` : `limits` (tableau) fusionné par `array_replace` sur les bornes en
  base, les clés à `null` retirées ; `limits: null` écrit tel quel.

## Critères d'acceptation

- [x] AC1 — Gabarit coupé, puis `PATCH` des seuls `templates` → `is_active` reste `false`, en
  réponse et en base (`NotificationTemplateTest::test_un_patch_sans_is_active_garde_un_gabarit_coupe`).
- [x] AC2 — Gabarit jamais écrit, `PATCH` sans `is_active` → actif.
- [x] AC3 — Plan à trois bornes, `limits: {max_agents: 5}` → les deux autres gardées ;
  `{max_branches: null}` → retirée ; `PATCH` sans `limits` → inchangé ; `limits: null` → `null`
  (`BillingPlansTest::test_un_patch_de_limits_partiel_garde_les_autres_bornes`).

## Hors périmètre

- P214.01 (réassignation d'abonnement qui perd dérogations et essai) : à valider, V1.

## Notes d'implémentation

- Ablation : les deux correctifs retirés (`app/` rendu à `pre-dev`) → AC1 rouge (« Failed asserting
  that true is identical to false ») et AC3 rouge (`limits` réduit à `{max_agents: 5}`), AC2 vert ;
  remis → verts.
