---
id: TCK-1176
title: "Console : durée de session sans redémarrage, bascule de test sur l'état évalué, jeton Orange Money oublié à la rotation"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, front, super-admin, feature-flags, payments, pistes]
---

## Contexte

Réf : **P98.10** du fichier de pistes, `validé` (V1 et V7 accordés).

Décision du porteur : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Quatre petits écarts de la console : `platform.session_max_minutes` annonce un redémarrage qu'il ne
demande pas ; le bouton « Test » d'un drapeau part toujours de « éteint » ; le jeton OAuth Orange
Money en cache survit à la rotation des identifiants (`IntegrationConfigChanged` sans écouteur) ;
le statut public de maintenance reste en cache une minute de plus côté navigateur.

## Objectif utilisateur

Ce que la console affiche et ce qu'elle change correspondent à ce que fait le serveur.

## Delta à produire

- [x] `EditablePlatformSettings` : `requires_restart` retiré de `platform.session_max_minutes`.
- [x] `GET /api/admin/feature-flags` rend `enabled_for_me` (`FeatureFlagEvaluator::isEnabled()`
      pour l'opérateur, bascule de session comprise) ; `SessionOverrideToggle` part de lui.
- [x] Écouteur `ForgetOrangeMoneyOAuthToken` sur `IntegrationConfigChanged` : oublie le jeton en
      cache de l'intégration Orange Money ; clé partagée par `OrangeMoneyDriver::oauthTokenCacheKey()`.
- [x] Tests : `PlatformSettingsCatalogueTest`, `FeatureFlagTest`, `IntegrationAdminTest`,
      `FeatureFlags.test.tsx`.

## Critères d'acceptation

- [x] AC1 — `platform.session_max_minutes` ne porte plus `requires_restart`.
- [x] AC2 — un drapeau activé sans ciblage rend `enabled_for_me: true`, un drapeau éteint `false`,
      puis `true` après une bascule de session ; la bascule s'affiche enfoncée quand
      `enabled_for_me` est vrai.
- [x] AC3 — après un `PATCH` des identifiants d'une intégration Orange Money, le jeton en cache est
      oublié.

## Hors périmètre

- Reste : la durée publique du statut de maintenance : la piste ne fixe pas de valeur, et le retard vient du relais Next (`revalidate: 60`) puis du navigateur (`max-age=60`). Aucune valeur n'est plus étroite qu'une autre : la valeur revient au porteur.
- Le jeton n'est oublié qu'à la modification par la console super-admin, seul émetteur
  d'`IntegrationConfigChanged`.
- Le nom de la clé `platform.session_max_minutes`, qui ne dit pas qu'elle ne vaut que pour les
  sessions de super-admin.

## Notes d'implémentation

- Choix : les voies uniques de la piste pour les trois premiers points.
- `FeatureFlagController::update()` rend `index()` : il lui passe désormais la requête (oubli
  rattrapé par `test_le_corps_du_dialogue_sans_ciblage_reste_global`, 500 sinon).
- Ablation : réglage, contrôleur, écouteur et composant rendus à `pre-dev` (la clé statique du
  pilote gardée, le test la lit) → 1 rouge dans chacune des quatre classes ; correctif remis →
  7/7, 3/3, 6/6, 4/4. `EventListenerDuplicationTest`, `PaymentDriverTest`,
  `PaymentDriverConnectionFailureTest` verts.
