---
id: TCK-1185
title: "Une seule fonction pour les liens du front dans les courriels, et un test qui rend chaque bouton"
status: done
phase: P1
family: technique
estimate: M
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [api, notifications, email, garde, pistes]
---

## Contexte

Réf : **P97.05** du fichier de pistes, `retenu · autonome` (A5 : garde neuve sans seuil).

`scripts/check-notification-target-paths.mjs` ne lit que `NotificationTarget::PATHS`. Une quinzaine
de liens de console sont écrits à la main dans les `toMail()`, les Mailables et les vues, sur trois
écritures de la base : `rtrim(config('app.frontend_url') ?: config('app.url'), '/')` (la plupart),
`config('app.frontend_url', config('app.url'))` (suppression de compte, vue du résumé) — qui ne se
replie jamais, la clé étant toujours définie, et colle une seconde barre derrière une base finie par
`/` — et `config('app.frontend_url')` sans repli (`CodedNotification`). Aucune garde n'aurait vu
P97.01 (bouton sur l'hôte de l'API).

## Objectif utilisateur

Le bouton de chaque courriel mène à une page qui existe, sur l'hôte du front.

## Contrat de données

Aucun endpoint. Avec `app.frontend_url` posée sans barre finale, aucun lien ne change.

## Contraintes strictes (métier)

- La forme majoritaire (`?:` puis `rtrim`) devient la seule ; elle ne change aucun lien quand
  `app.frontend_url` est posée.
- La résolution d'un chemin en page est celle de la garde JS : groupe `(x)` transparent, segment
  dynamique `[x]`, catch-all `[...x]` exclu, `page.tsx` au bout.

## Delta à produire

- [x] `App\Support\FrontendUrl` (`base()`, `to()`).
- [x] Substitution dans les 15 classes de `app/Notifications` qui bâtissent un lien du front,
      `InvitationMailable`, les deux rappels de `AppServiceProvider` (vérification d'e-mail,
      réinitialisation), `NotificationUnsubscribeController` et la vue du résumé.
- [x] `tests/Feature/Notifications/MailActionLinksTest.php` : chaque `toMail()` à bouton rendu sur
      un destinataire de fabrique, avec `app.frontend_url` posée puis vide ; les liens de
      `InvitationMailable` et du résumé ; toute classe à `->action(` éprouvée ou exemptée.

## Critères d'acceptation

- [x] AC1 — avec `app.frontend_url` posée, chaque bouton commence par elle et son chemin résout une
      page de `takussan-web/src/app`.
- [x] AC2 — avec `app.frontend_url` vide, chaque bouton se replie sur `app.url` (plus de lien
      relatif) ; le résumé n'a plus de double barre.
- [x] AC3 — une classe neuve de `app/Notifications` qui pose un bouton fait rougir le test tant
      qu'elle n'est ni éprouvée ni exemptée avec sa raison.

## Hors périmètre

- Les liens du front hors courriel (`Services/Payments/*Driver`, `LeasePaymentLinkService`,
  `IcsCalendarRenderer`, `ErasedAccountListings`, `InvitationService`) : ils gardent leur écriture,
  signalé dans la PR.
- Étendre la garde JS aux chemins des courriels : le test PHP la double sur les liens rendus, avec
  le précédent de `SearchWolofReviewSheetTest`, qui lit déjà `takussan-web`.

## Notes d'implémentation

- Choix : la résolution du chemin vit dans le test PHP, sur l'URL réellement rendue, plutôt que dans
  `check-notification-target-paths.mjs`, qui aurait dû deviner des chemins bâtis par concaténation.
  Revers : la clé d'attestation de l'API (ADR-0063) ne lit pas `takussan-web` ; une page retirée du
  front ne fait rejouer ce test qu'au prochain changement de l'API.
- Avant correctif : 5 rouges — `AccountDeletionRequested/Reminder` et `CodedNotification` en lien
  relatif sous `app.frontend_url` vide, la vue du résumé en `…//app/notifications` et en lien
  relatif.
- Ablation : `FrontendUrl::base()` sans repli sur `app.url` → les deux jeux « vide » rougissent ;
  remis → vert.
