---
id: TCK-1468
title: "L'avis « intégration modifiée » nomme le fournisseur par son libellé"
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
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-164--paramètres-text-des-notifications-codées-qui-portent-un-code"
tags: [back, front, notifications, i18n, pistes]
---

## Contexte

Réf : **P164.01** du fichier de pistes, `retenu · autonome` (A4).

`governance.integration_changed` range le code du fournisseur (`orange_money`) dans un paramètre
`text` : l'API le rend tel quel (« L'intégration orange_money a été modifiée par Awa Diop. »), la
cloche aussi.

## Contrat de données

- Nature de paramètre neuve `NotificationCode::PARAM_PROVIDER` (`provider`), portée par le seul
  `governance.integration_changed` ; la valeur rangée reste le code (lignes déjà écrites traduites
  à la lecture).
- API : rendue par `IntegrationProviderRegistry::get($code)->label()` (repli `GenericProvider` :
  `sms_orange` → « Sms Orange »), tronquée comme un texte dans un SMS, « — » si vide.
- Cloche : pour ce seul code, libellé `adminSettings.integrations.webhookEndpoint.providers.<code>`
  (clé existante, écran des intégrations de l'agence) ; sans clé, la même règle que
  `GenericProvider::label()`, pour que la cloche et le courriel disent le même nom.
- Hypothèse : le paramètre `provider` des avis d'intervention (`maintenance.accepted`,
  `maintenance.declined`) est le nom d'un prestataire, il reste `text` et n'est pas touché.

## Delta à produire

- [x] `NotificationCode::PARAM_PROVIDER`, déclaré pour `GovernanceIntegrationChanged`.
- [x] `NotificationRenderer::provider()`.
- [x] `texteNotification.ts` : branche `provider` pour les codes de `CODES_A_FOURNISSEUR`.
- [x] Tests : `IntegrationModifieeFournisseurTest` (API), `NotificationRow.test.tsx` (cloche) ;
  `GovernanceAlertTest` attend désormais « Wave » dans le corps et `wave` dans les paramètres.

## Critères d'acceptation

- [x] AC1 — fr et en, titre, corps et SMS d'`orange_money` : ni `orange_money`, et « Orange Money » au corps et au SMS.
- [x] AC2 — un code hors registre suit le libellé générique ; un fournisseur vide rend « — ».
- [x] AC3 — la cloche rend « Orange Money », « Lemon Squeezy », « Sms Orange » ; le `provider` d'une intervention reste tel quel.

## Hors périmètre

- La nature des paramètres transmise au front (P164.05, à valider).

## Notes d'implémentation

- Ablation API : `NotificationCode.php` et `NotificationRenderer.php` remis à `pre-dev` → 3 rouges, remis → vert.
- Ablation front : `texteNotification.ts` remis à `pre-dev` → 4 rouges, remis → vert.
- Piège : `GovernanceAlertTest` épinglait le défaut (`'wave'` dans le corps) ; il garde maintenant le code dans `params` et le libellé dans le corps.
