---
id: TCK-1245
title: "Une seule fonction pour les liens du front dans les courriels, et un test qui rend chaque bouton"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [back, notifications, garde, pistes]
---

## Contexte

Réf : **P97.05** du fichier de pistes, `retenu · autonome` (A5 : garde neuve sans seuil ; la
fonction commune reprend la forme majoritaire `?:`).

`scripts/check-notification-target-paths.mjs` ne lit que `NotificationTarget::PATHS`. Les liens
écrits à la main dans les `toMail()`, les vues et les Mailables n'étaient gardés par rien, et trois
écritures de la base coexistaient : `frontend_url ?: app.url` (la plupart), `config('app.frontend_url',
config('app.url'))` (repli qui ne joue jamais, sans `rtrim`) et `frontend_url` sans repli
(`CodedNotification`).

## Objectif utilisateur

Aucun changement visible : un bouton de courriel qui mènerait hors du front, ou vers une page qui
n'existe pas, fait rougir la suite.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- Les chemins et les requêtes des liens ne changent pas ; seule la base est unifiée.

## Delta à produire

- [x] `App\Support\LienFront` (`base()`, `vers()`), employée par les 15 `toMail()` qui bâtissaient
  une base, `InvitationMailable`, `InvitationService` (lien du SMS), les liens de vérification et de
  réinitialisation d'`AppServiceProvider`, la vue du résumé et `NotificationUnsubscribeController`.
- [x] `tests/Feature/Notifications/LiensDesCourrielsTest.php` : chaque `toMail()` à bouton rendu
  sur une base du front à barre finale (`actionUrl` sur la base, chemin sans `//`, chemin égal à
  celui que déclare `CHEMINS_DU_FRONT`) ; inventaire des classes à `->action(` ; repli de la base.
- [x] `scripts/check-mail-button-paths.mjs` (garde neuve) lit `CHEMINS_DU_FRONT` et résout chaque
  chemin en `page.tsx` par le `pageDe` de la garde des cibles (`{locale}` lu comme `{id}`) : le test
  dit où mène le bouton, la garde dit que la page existe.

## Critères d'acceptation

- [x] AC1 — les 16 courriels à bouton (dont `VerifyEmail`) mènent à une page du front.
- [x] AC2 — une classe neuve à bouton absente du test rougit l'inventaire.
- [x] AC3 — sans `app.frontend_url`, la base se replie sur `app.url` partout, `CodedNotification`
  compris.

## Hors périmètre

- ⚠ **Le branchement de `scripts/check-mail-button-paths.mjs` dans `.github/workflows/repo-ci.yml`**,
  qui nomme ses gardes une à une : chemin fermé à l'implémenteur. D'ici là, la garde tourne dans le
  rituel `for g in scripts/check-*.mjs` et avant chaque push des agents, pas en CI.

- Les autres lecteurs de `app.frontend_url` hors courriels : `return_url` des pilotes Wave et Orange
  Money, `IcsCalendarRenderer`, `ErasedAccountListings` (`frontend_url` sans repli).
- Les liens écrits dans le corps Markdown des courriels (seul `actionUrl` est lu).
- Les deux téléchargements signés servis par l'API (`ActivityLogExportReady`, `ReportExportReady`),
  excusés par leur nom dans le test.

## Notes d'implémentation

- Rouge avant correctif : base `https://front.exemple.test/` → `AccountDeletionRequested` et
  `AccountDeletionReminder` rendaient `…//app/profile` (2 rouges sur 19).
- Ablation : les deux classes rendues à leur écriture d'origine → 2 rouges ; `CodedNotification`
  rendue à son écriture sans repli → 1 rouge ; remis → vert.
- Première version : le test PHP résolvait lui-même les `page.tsx` en lisant `takussan-web/src/app`.
  `scripts/check-ci-attestation.mjs` l'a refusé — la suite de l'API ne doit lire que ce que sa clé
  d'attestation couvre. La résolution est passée dans la garde du dépôt, qui lit déjà les deux côtés.
- Ablation de la garde : `/app/overview-mort` dans `CHEMINS_DU_FRONT` → `✗ ThresholdAlertTriggered →
  /app/overview-mort`, exit 1 ; remis → `✓ 16 boutons de courriel`.
