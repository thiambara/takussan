---
id: TCK-2363
title: "Un compte bloqué ne reçoit que les avis de son compte, par tous les chemins d'envoi"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-1350]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#1-user"
  adr:
    - "docs/adr/0032-l-api-n-ecrit-plus-de-prose.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-239--avis-envoyés-hors-de-notificationservicesend-vers-un-compte-bloqué"
tags: [api, notifications, comptes, pistes]
---

## Contexte

Réf : **P239.01** du fichier de pistes (angle 239 : avis envoyés hors de
`NotificationService::send`, vers un compte bloqué), `validé` par le porteur le 2026-10-25.
Critères accordés : V3 et V7.

TCK-1350 (P88.04) a posé qu'un compte bloqué ou supprimé ne reçoit que les codes de son compte,
mais seulement dans `NotificationService::send()` et `CodedNotification::via()` ; les envois
directs (`Notification::send`, `->notify()`) étaient hors de son périmètre. Mesuré par le mesureur
(db3e25230) : un locataire `blocked` reçoit la pénalité de retard (`database`, `mail`, `broadcast`)
et le rappel d'état des lieux à J+7 (`database`, `mail`) ; un administrateur d'agence `blocked`
au profil actif reçoit l'alerte de seuil (`database`, `mail`).

## Décision du porteur

validation du porteur (2026-10-25) : un écouteur de `NotificationSending` coupe tout envoi vers un compte non joignable, sauf une liste fermée d'avis de compte (blocage, réactivation, fin d'impersonation, effacement, réinitialisation du mot de passe, export prêt) ; les avis du bail au locataire bloqué sont coupés

## Delta à produire

- [x] `App\Listeners\Notifications\RienPourUnCompteNonJoignable`, écouteur de `NotificationSending`
  posé à côté de `RienPourUnCompteEfface` : `false` pour un `User` non joignable
  (`PrimaryPropertyContact::joignable()`), sauf une `CodedNotification` dont le code
  `reachesUnreachableAccount()`, ou une classe de `AVIS_DU_COMPTE`.
- [x] ADR-0032 amendé (2026-10-25) et sa ligne de `docs/adr/README.md`.
- [x] `docs/features.md` § 2.3 : la règle, et `docs/features-by-actor.md` régénéré.
- [x] Test `RienPourUnCompteNonJoignableTest`.

## Choix de l'implémenteur

- « Effacement » couvre les quatre classes `AccountDeletion*` : demande, rappel, code de
  confirmation, exécution. Le code de confirmation ne part qu'à un compte connecté, ce qu'un compte
  bloqué n'est plus ; le laisser passer ne retire rien à un appelant légitime.
- « Export prêt » est `DataExportReadyNotification` seul, l'export des données du compte que
  nomme la piste. `ActivityLogExportReadyNotification` et `ReportExportReadyNotification` sont des
  avis de travail d'agence, et sont coupés.
- La liste fermée vit en constante de l'écouteur ; les trois codes de compte restent ceux de
  `NotificationCode::reachesUnreachableAccount()`, la liste de TCK-1350, pour qu'il n'y en ait
  qu'une.

## Critères d'acceptation

- [x] AC1 — Famille bail : locataire `blocked`, `NotifyTenantOfLateFee::handle()` → aucun
  `NotificationSent` vers lui ; locataire actif → l'avis part.
- [x] AC2 — Famille rappel : locataire `blocked`, `tenant-onboarding:remind` → aucun canal ;
  actif → l'avis part.
- [x] AC3 — Famille alerte : administrateur d'agence `blocked` au profil actif,
  `dashboard:check-alerts` → aucun canal ; actif → l'avis part.
- [x] AC4 — Un compte bloqué reçoit encore l'avis de blocage (code) et la réinitialisation du mot
  de passe, par courriel.
- [x] AC5 — Chaque classe `Notification` de `app/` est classée : avis du compte ou coupée. Une
  notification neuve casse le test tant qu'elle ne l'est pas.

## Hors périmètre

- Le courrier envoyé hors des notifications (`Mail::to()`, mailables) : il ne passe pas par
  `NotificationSending`.
- Le statut `inactive`, qui reste joignable.

## Notes d'implémentation

- Les tests jouent les vrais canaux et comptent les `NotificationSent` : `Notification::fake()`
  ne déclenche pas `NotificationSending`, et un test sous fake serait vert sans l'écouteur.
- Rouge avant correctif : 5 tests sur 9 (les trois cas `blocked` par famille, et les deux tests de
  l'écouteur, faute de classe). Ablations : `handle()` qui rend toujours `null` → les trois cas
  `blocked` et le test de la liste fermée rouges ; `handle()` qui rend toujours `false` pour un
  compte non joignable → le test des avis du compte et celui de la liste fermée rouges ; une
  notification retirée de la liste des coupées → le test d'énumération rouge, qui la nomme.
