---
id: TCK-2051
title: "Un compte sans e-mail reçoit ses avis de suppression par SMS, et l'export asynchrone du journal lui est refusé par un code"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#23-notifications"
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-193--comptes-et-invitations-sans-e-mail-face-aux-textes-et-avis-bâtis-sur-l-e-mail"
tags: [api, notifications, sms, rgpd, audit, pistes]
---

## Objectif

Un compte créé par téléphone n'est plus laissé sans nouvelles : les avis de sa suppression de
compte lui arrivent par SMS, et un export du journal qu'il ne pourrait jamais recevoir lui est
refusé avant d'être lancé.

## Contexte

Réf : **P193.04** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : le découpage du délégué, sur la liste complète des 10 classes à `via()` = `['mail']` ; avis de suppression par SMS au numéro vérifié, export asynchrone refusé par un code sans e-mail, `reminder_sent_at` posé seulement si un canal existe

Le découpage du délégué (ligne `Mesure` du 2026-10-23, delegue) : (1) une garde qui énumère les
notifications à `via()` = `['mail']`, les rend pour un compte sans e-mail, avec une liste
d'exceptions justifiées ; (2) la cloche quand `email` est nul pour les avis d'invitation expirée
ou acceptée ; (3) les avis de suppression, les exports et `reminder_sent_at`, tranchés par le
porteur ci-dessus.

`MailChannel::send` sort sans rien faire quand le destinataire n'a pas d'adresse : ni exception,
ni repli, ni journal.

## Hypothèses (mode sans humain)

- « Sans e-mail » se lit comme `MailChannel` le lit : `users.email` nul ou vide. Une adresse
  présente mais non vérifiée reçoit toujours le courriel, comme aujourd'hui.
- Les dix classes sont celles dont `via()` rend `['mail']` (relevé : les trois avis de
  suppression, le code de suppression, l'activation du gérant, les trois avis d'export, les deux
  avis d'invitation). Les deux classes du cadre (`ResetPassword`, `VerifyEmail`) rendent aussi
  `['mail']` et sont les exceptions que la `Piste` nomme.
- L'export de données personnelles (`DataExportReadyNotification`) n'est pas refusé : son fichier
  s'atteint aussi par la liste des exports et son relais de téléchargement (TCK-1519). L'export
  de la console (`ReportExportReadyNotification`) vise un opérateur, qui a toujours un e-mail.
  Seul l'export du journal d'audit n'a pas d'autre chemin que le lien du courriel.
- Le SMS est critique (`isCriticalSms`) : un avis de suppression ne dépend pas d'une préférence.
- Le texte du SMS ne porte pas de lien : il dit de se connecter avant la date pour annuler.

## Delta à produire

- [x] `RepliSmsSansEmail` : `via()` = `mail` avec une adresse, sinon `SmsChannel` au numéro
  vérifié, sinon aucun canal ; posé sur les trois avis de suppression, avec leur `toSms()`.
- [x] Textes `sms` des trois avis (`fr`, `en` ; `wo` recopie le français).
- [x] `account:execute-deletions` : sans canal, le rappel n'est ni envoyé, ni marqué, ni compté.
- [x] `GET /api/activity-logs/export` au-delà de 5 000 lignes : `422 activity_log.export_needs_email`
  pour un compte sans e-mail, avant la mise en file.
- [x] Garde : `AvisSansEmailTest`, dont l'énumération des notifications `['mail']` seules.

## Critères d'acceptation

- [x] AC1 — Les trois avis de suppression partent par SMS au numéro vérifié d'un compte sans
  e-mail ; un compte à e-mail reçoit le courriel et aucun SMS.
- [x] AC2 — Un rappel sans canal laisse `reminder_sent_at` nul ; avec un numéro vérifié, il est
  marqué.
- [x] AC3 — L'export asynchrone du journal d'un compte sans e-mail rend 422 codé et ne met rien en
  file.
- [x] AC4 — Toute notification qui reste `['mail']` pour un compte sans e-mail figure dans la liste
  d'exceptions de la garde, avec sa raison.

## Reste à faire

- La cloche (`database`) des avis d'invitation expirée ou acceptée quand l'invitant n'a pas
  d'e-mail (point 2 du découpage) : elle demande un code de notification neuf, ses textes et leur
  rendu par la cloche. Les deux classes figurent en exception dans la garde, marquées « reste ».

## Hors périmètre

- Le texte du front qui dirait ce refus autrement que par le message de l'API.

## Notes d'implémentation

- Reproduit avant correctif : 4 rouges sur 5 (énumération : les trois avis de suppression en plus
  des exceptions ; 0 SMS sur 3 ; `reminder_sent_at` posé sans canal ; 202 au lieu de 422).
- Ablation : `app/` et `lang/` remis à `HEAD`, trait retiré → 4 rouges ; correctif remis → 5 verts.
- L'énumération instancie chaque notification sans constructeur et saute celles dont `via()` lit
  l'état de la notification : elle voit les `via()` constants, ce qui est le cas mesuré.
