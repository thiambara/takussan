---
id: TCK-799
title: "SMS : échec sans fournisseur journalisé, tentative écrite sans notification, seau des codes critiques, 503 à la signature de bail"
status: done
phase: P2
family: back
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-sms-qui-échoue-ne-laisse-ni-trace-ni-alerte"
tags: [back, sms, notifications, pistes]
---

## Contexte

Réf : **P11.05** du fichier de pistes, `validé` par le porteur (critères accordés : V7, puis V4
après le reclassement du 2026-10-17).

`SmsRouterDriver` rend `no_provider_available` sans rien journaliser ; une tentative sans
`notification_id` (contact sans compte, code de signature de bail) n'est jamais écrite, la
colonne `notification_delivery_attempts.app_notification_id` étant non nulle ; le code de
signature de bail partage le seau de 5 SMS par heure avec les rappels, et
`LeaseSignatureService::sendCode()` répond `channel: sms` même quand rien n'est parti.

## Décision du porteur

`Log::warning` quand aucun fournisseur n'est disponible ; migration qui rend `notification_delivery_attempts.app_notification_id` nullable, et tentative écrite sans notification (le `down()` supprime les lignes sans notification) ; seau séparé pour les codes critiques ; 503 lisible si rien n'est parti

## Objectif utilisateur

Un SMS qui ne part pas laisse une trace et une alerte, et le signataire d'un bail sait que son
code n'est pas parti au lieu d'attendre un SMS qui ne viendra pas.

## Contraintes strictes

- Migration **neuve** ; la migration de création de la table n'est pas modifiée. Son `down()`
  supprime les lignes sans notification avant de rétablir la contrainte non nulle.
- Une tentative sans notification s'écrit sans verrou de notification (il n'y en a pas) et
  jamais ne lève (TCK-767).
- Le seau critique garde la même borne (`sms.rate_limit.per_user_per_hour`) : seule la clé change.
- Le 503 ne vaut que lorsque le canal SMS a répondu et que rien n'est parti : sous
  `Notification::fake()`, rien n'est connu, rien ne change.

## Delta à produire

- [x] Migration `2026_10_17_160000_make_notification_delivery_attempts_notification_nullable`.
- [x] `SmsRouterDriver` : `Log::warning('[sms.router] aucun fournisseur disponible', …)`, et
      `appendAttempt()` écrit la tentative quand `notification_id` est nul.
- [x] `SmsChannel::withinRateLimit()` : clé `sms-channel:critical:…` pour un SMS critique.
- [x] `LeaseSignatureCodeNotification::afterSending()` retient si le SMS est parti ;
      `LeaseSignatureService::sendCode()` lève un 503 `lease_signature.sms_not_sent` sinon.
- [x] Tests : `SmsFailureTraceTest`.

## Critères d'acceptation

- [x] AC1 — Une chaîne sans fournisseur journalise un `warning` (numéro réduit à ses 4 derniers
      chiffres).
- [x] AC2 — Un SMS sans notification écrit sa tentative, `app_notification_id` nul.
- [x] AC3 — Un SMS critique ne consomme pas le seau des SMS ordinaires, et inversement.
- [x] AC4 — `POST /api/leases/{lease}/signature/otp` rend 503 `lease_signature.sms_not_sent` quand
      le SMS n'est pas parti, 202 quand il est parti.

## Hors périmètre

- Les autres envois de code par SMS (vérification du numéro, suppression de compte, connexion
  par téléphone) : la piste ne vise que la signature de bail.
- La purge des tentatives sans notification à la suppression d'un compte
  (`AccountDeletionService` ne purge que par notification) : relevé au rapport.
- La métrique proposée par la `Piste` : la décision du porteur ne la retient pas.
- `docs/models-spec.md` § 69 dit la colonne non nulle : à resynchroniser (`/sync-specs`).

## Notes d'implémentation

- **Ablation** (`SmsFailureTraceTest` + `LeaseSignatureTest`, 52 tests) : `SmsRouterDriver` remis
  seul → 3 rouges (AC1, AC2) ; `SmsChannel` seul → 1 rouge (AC3) ; `LeaseSignatureService` seul →
  1 rouge (AC4) ; migration retirée → 2 rouges (`QueryException`, colonne non nulle). Correctif
  remis : 52 verts. `down()` puis `up()` joués par un test de mesure retiré : la ligne sans
  notification est supprimée, la colonne redevient non nulle, la clé étrangère reste.
- **Piège** : Laravel envoie à chaque canal une **copie** de la notification (`clone`). Le
  résultat du SMS revient par `afterSending()` dans un `ArrayObject` partagé par les copies, et
  non dans une propriété scalaire, qui restait sur la copie.
- **Piège** : l'écriture sans notification passe par `DB::transaction()` comme l'autre chemin.
  Sans ce point de sauvegarde, un identifiant fournisseur en double (les faux HTTP des tests en
  rendent un seul) abandonnait la transaction de l'appelant : 2 rouges en 25P02
  (`SmsRouterDriverTest`, `ContactSansCompteTest`) avant ce correctif.
- **Hypothèse** : le 503 vaut aussi quand le canal refuse avant tout fournisseur (borne horaire
  du seau critique) : rien n'est parti. Un échec ambigu ou un envoi différé compte comme parti.
- Le code reste émis avant l'envoi : après un 503, le renvoi attend 60 s comme après un envoi.
