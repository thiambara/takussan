---
id: TCK-728
title: "Une invitation a une seule langue, écrite à sa création : le français"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-29--langue-des-destinataires-sans-compte"
tags: [back, invitations, i18n, notifications, pistes]
---

## Contexte

Réf : **P29.01** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`InvitationService::preferredLocale()` rend la langue du compte du destinataire, sinon
`metadata.locale`, sinon `config('app.locale')`. Aucun appelant n'écrit `metadata.locale` : un
destinataire sans compte reçoit donc l'envoi dans la langue négociée de l'**invitant**
(`Application::setLocale()` réécrit `app.locale` à chaque requête), et la relance J+2, jouée par
`invitations:remind`, dans celle du processus. Deux langues pour la même invitation, alors que
`ContactSansCompte` pose « jamais la langue du processus » (ADR-0032 § 3).

## Décision du porteur

la langue est écrite à la création de l'invitation : `fr` explicite (`DEFAULT_LOCALE`), comme `ContactSansCompte` ; la fiche client de P29.03 l'affinera

Hypothèses (mode sans humain) :

- La langue s'écrit dans `metadata.locale` (le champ que `preferredLocale()` lisait déjà), et non
  dans une colonne : aucune migration (V4 non touché).
- Un `metadata.locale` envoyé par le client de `POST /api/invitations` est remplacé par `fr` :
  le champ n'était pas validé (`metadata` libre) et aucun écran ne l'envoie (mesuré :
  `grep -rn locale takussan-web/src | grep -i invit` → aucune écriture).
- Le compte existant du destinataire garde la priorité à l'envoi, comme avant.
- Une invitation créée avant ce ticket, sans `metadata.locale`, retombe sur `fr` et non plus sur
  `config('app.locale')`.

## Objectif utilisateur

Une personne invitée sans compte reçoit son invitation et sa relance dans la même langue, quelle
que soit la langue de l'interface de qui l'invite.

## Contraintes strictes (métier)

- Le destinataire qui a déjà un compte reçoit toujours sa langue (`preferred_language`).
- Pas de texte neuf, pas de champ de formulaire neuf.

## Delta à produire

- [x] `InvitationService::send()` : `metadata.locale = ContactSansCompte::DEFAULT_LOCALE` à la
  création, pour les quatre services par rôle et la cooptation, qui passent tous par `send()`.
- [x] `InvitationService::preferredLocale()` : repli sur `ContactSansCompte::DEFAULT_LOCALE` au
  lieu de `config('app.locale')`.
- [x] Test : `tests/Feature/Invitation/InvitationLocaleTest.php`.

## Critères d'acceptation

- [x] AC1 — Deux invitations de propriétaire créées sous `Accept-Language: en` et `wo` portent
  `metadata.locale = fr` ; leurs envois et leurs relances, jouées sous la langue de processus
  `en`, partent tous les quatre en `fr`.
- [x] AC2 — Une invitation par numéro seul, créée sous `en`, porte `metadata.locale = fr`.
- [x] AC3 — Une invitation sans `metadata.locale` est relancée en `fr` même quand `app.locale`
  vaut `en`.

## Hors périmètre

- P29.02 (langue d'une visite saisie par l'agent) et P29.03 (langue sur la fiche client).
- La validation de la forme de `metadata` dans `CreateInvitationRequest`.

## Notes d'implémentation

- Ablation, en deux temps : sans l'écriture à la création, AC1 et AC2 rougissent (« 2 failed,
  1 passed ») ; sans le repli `fr`, AC3 rougit (« 1 failed, 2 passed ») ; correctif entier remis,
  3 verts. Les trois rouges avant correctif.
- Le repli `fr` couvre à lui seul la langue d'envoi : c'est l'écriture à la création qui fige la
  langue dans la ligne, et AC1 l'observe par `metadata.locale`.
