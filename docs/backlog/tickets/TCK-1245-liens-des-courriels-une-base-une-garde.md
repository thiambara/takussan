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
  sur une base du front à barre finale (`actionUrl` sur la base, chemin sans `//`, `page.tsx`
  résolue dans `takussan-web/src/app`) ; inventaire des classes à `->action(` ; repli de la base.

## Critères d'acceptation

- [x] AC1 — les 16 courriels à bouton (dont `VerifyEmail`) mènent à une page du front.
- [x] AC2 — une classe neuve à bouton absente du test rougit l'inventaire.
- [x] AC3 — sans `app.frontend_url`, la base se replie sur `app.url` partout, `CodedNotification`
  compris.

## Hors périmètre

- Les autres lecteurs de `app.frontend_url` hors courriels : `return_url` des pilotes Wave et Orange
  Money, `IcsCalendarRenderer`, `ErasedAccountListings` (`frontend_url` sans repli).
- Les liens écrits dans le corps Markdown des courriels (seul `actionUrl` est lu).
- Les deux téléchargements signés servis par l'API (`ActivityLogExportReady`, `ReportExportReady`),
  excusés par leur nom dans le test.
- ⚠ Le test lit `takussan-web/src/app` depuis la suite de l'API : un renommage de page côté front
  ne déclenche pas API CI, et la clé d'attestation d'ADR-0063 ne couvre pas ce dossier. Il rougit à
  la prochaine exécution de la suite qui n'est pas attestée.

## Notes d'implémentation

- Rouge avant correctif : base `https://front.exemple.test/` → `AccountDeletionRequested` et
  `AccountDeletionReminder` rendaient `…//app/profile` (2 rouges sur 19).
- Ablation : les deux classes rendues à leur écriture d'origine → 2 rouges ; `CodedNotification`
  rendue à son écriture sans repli → 1 rouge ; remis → vert.
- La résolution des pages reprend celle de la garde des cibles, à une différence près : un segment
  réel (`fr`, `42`) prend un dossier dynamique simple seulement quand aucun dossier littéral ne
  porte son nom — sinon `[locale]` happerait `/app`.
