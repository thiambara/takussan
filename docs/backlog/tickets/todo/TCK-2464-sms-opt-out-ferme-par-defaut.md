---
id: TCK-2464
title: "Le canal SMS est ouvert par défaut : une notification non critique sans smsEventType() passerait outre l'opt-out"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-11-03
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#99-notificationpreference-
tags: [back, sms, notifications, consentement, dette]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai, défaut latent inchangé.** Seul commit cité : deceeacf0 (création).

- `SmsChannel::isOptedIn()` (`:181-192`) rend toujours `true` sans événement, **et** pour tout
  notifiable qui n'est pas un `User` ; `SupportsSms` n'exige toujours pas `smsEventType()`.
  `WhatsappChannel::isOptedIn()` (`:325-333`) a la même forme.
- Les implémenteurs sont **cinq classes**, pas sept : quatre critiques (`LeaseSignatureCodeNotification`,
  les trois `AccountDeletion*` par `RepliSmsSansEmail`) et `CodedNotification` (`smsEventType()`
  jamais vide). Aucune notification touchée aujourd'hui.
- Reste à faire : `SupportsSms` exige `smsEventType(): string` (ou refus + journal) ; événement
  absent ⇒ `false` + `Log` pour un non critique ; branche non-`User` rendue explicite ; même
  traitement (ou motif écrit) pour WhatsApp ; test AC1/AC2 avec ablation.
- **Décision attendue du porteur** (seulement si l'on veut aller au-delà) : la branche non-`User`
  (abonné d'alerte sans compte, consentement porté par la confirmation, ADR-0050) reste-t-elle
  ouverte (a) comme exception motivée écrite (recommandé), ou (b) se ferme-t-elle aussi, au prix
  des SMS des abonnés sans compte ?

## Objectif utilisateur

Qu'un utilisateur qui a coupé les SMS d'un événement n'en reçoive jamais — y compris pour une
notification écrite demain par quelqu'un qui aura oublié de la rattacher à un événement.

## Contrat de données

Aucune donnée nouvelle. `SmsChannel::isOptedIn()` (`takussan-api/app/Notifications/Channels/SmsChannel.php:181-192`)
rend `true` — **envoie** — quand la notification ne déclare pas d'événement (`resolveEventType()`
vide). L'interface `SupportsSms` (`app/Notifications/Concerns/SupportsSms.php`) n'exige pas
`smsEventType()`. Le consentement est donc tenu par convention, pas par le code.

Seconde branche ouverte, relevée le 2026-11-16 : `! $notifiable instanceof User` → `true` (abonné
d'alerte sans compte, `AnonymousNotifiable`). À trancher explicitement : fermée par défaut, elle
couperait les SMS des abonnés sans compte (consentement porté par la confirmation, ADR-0050) — en
faire une exception motivée, pas un `true` implicite.

**Défaut LATENT, mesuré le 2026-11-03 : aucune notification n'est touchée aujourd'hui.** Les cinq
classes qui implémentent `SupportsSms` (« sept notifications » jusqu'au 2026-11-16, non reproduit) sont soit critiques (`isCriticalSms() = true` :
`LeaseSignatureCodeNotification`, les trois `AccountDeletion*` par `RepliSmsSansEmail` — elles
passent outre la préférence par conception), soit des `CodedNotification`, dont `smsEventType()`
rend `preferenceEvent() ?? value`, jamais vide. Le ticket ferme la porte avant que la prochaine
notification la franchisse.

## Contraintes strictes (métier)

- Le SMS **critique** (code de signature, avis de suppression de compte) reste envoyé sans
  préférence : ce comportement est voulu et ne bouge pas.
- Fermé par défaut : sans événement déclaré, une notification non critique **n'est pas envoyée**
  par SMS, et le refus se trace (journal), il ne se tait pas.

## Delta à produire

- [ ] `SupportsSms` exige `smsEventType(): string` (ou `SmsChannel` refuse et journalise quand il manque)
- [ ] `SmsChannel::isOptedIn()` : événement absent ⇒ `false` pour un non critique
- [ ] Test : une notification non critique sans événement n'est pas envoyée, et le refus est journalisé ;
      une critique sans événement l'est toujours
- [ ] Relire le pendant WhatsApp (`WhatsappChannel`) : même question, même réponse, ou une ligne
      qui dit pourquoi il diffère

## Critères d'acceptation

- [ ] AC1 — une notification de test non critique, sans `smsEventType()`, n'atteint pas le driver SMS (fake)
- [ ] AC2 — **ablation** : remettre `return true;` dans la branche « pas d'événement » fait rougir AC1
- [ ] AC3 — les cinq classes SMS existantes (« sept » jusqu'au 2026-11-16) envoient exactement comme avant (leurs tests inchangés et verts)

## Hors périmètre

- Les heures calmes, les plafonds de débit et le routage des fournisseurs SMS.
- Le contenu de la préférence (`notification_preferences`) : inchangé.

## Notes d'implémentation

_(à remplir par implementing-specs)_
