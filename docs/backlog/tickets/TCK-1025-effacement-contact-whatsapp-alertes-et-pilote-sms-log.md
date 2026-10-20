---
id: TCK-1025
title: "L'effacement retire le contact WhatsApp et les alertes sans compte du compte, et le pilote SMS `log` ne journalise plus ni le numéro ni le texte"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-57--téléphones-et-e-mails-hors-de-users-face-à-lanonymisation"
tags: [api, rgpd, sms, whatsapp, pistes]
---

## Contexte

Réf : **P57.05** du fichier de pistes, `validé` (V3). `AccountDeletionService::anonymize()` ne
cite ni `WhatsappContact` ni `AlertSubscriber` : un contact WhatsApp au numéro du compte, et une
alerte sans compte à son adresse ou à son numéro vérifiés, survivent à l'effacement. Le pilote
SMS `log` écrit le numéro complet et le texte, code de vérification compris, dans le journal.

## Décision du porteur

> supprimer à l'effacement le contact WhatsApp et les alertes sans compte au contact vérifié du compte, et masquer le code et le numéro dans le pilote `log` comme le fait `PhoneVerificationService` (`phone_suffix`) ; la durée de conservation des demandes de contact n'est pas tranchée et reste au porteur (porteur, 2026-10-19)

## Objectif

Un compte effacé ne laisse ni son numéro dans `whatsapp_contacts` ni d'alerte sans compte à son
contact vérifié, et le pilote `log` ne journalise plus un numéro entier ni un code.

## Delta à produire

- [ ] `AccountDeletionService::anonymize()` : relever, avant le `forceFill`, l'adresse si
      `email_verified_at` est posé et chaque numéro (`phone`, `secondary_phone`) dont la date de
      vérification est posée ; après, supprimer les `WhatsappContact` de ces numéros et les
      `AlertSubscriber` de ces contacts (par `contact_hash`, recherches en cascade).
- [ ] `LogSmsDriver::send()` : `phone_suffix` (4 derniers caractères) à la place de `to`, et la
      longueur du message à la place de son texte.
- [ ] Tests : `AccountDeletionExecuteTest` (contact WhatsApp, alertes), `LogSmsDriverTest`.

## Critères d'acceptation

- [ ] AC1 — Après `executeDeletion()`, aucun `WhatsappContact` au numéro vérifié du compte ; celui
      d'un autre numéro reste, et celui d'un numéro **non vérifié** du compte aussi.
- [ ] AC2 — Après `executeDeletion()`, aucune `AlertSubscriber` à l'adresse vérifiée (quelle que
      soit la casse saisie) ni au numéro vérifié du compte, ni leurs recherches ; une alerte d'un
      autre contact reste.
- [ ] AC3 — Un envoi par le pilote `log` ne laisse au journal ni le numéro complet ni le texte du
      message ; il y laisse les 4 derniers caractères du numéro.

## Hypothèses (mode sans humain)

- **« Au contact vérifié »** se lit comme `claim()` (`SavedSearchController`) : l'adresse si
  `email_verified_at`, un numéro si sa date de vérification est posée. Un numéro non vérifié peut
  appartenir à un tiers : ses contacts et alertes ne sont pas ceux du compte.
- **Le contact WhatsApp est supprimé**, quelle que soit la source de son consentement : la
  décision dit « supprimer », sans distinguer.
- **Le texte du message est remplacé par sa longueur** (`message_length`) : le masquer en partie
  ne garantit pas que le code disparaisse (sa place dans le texte dépend de la langue). C'est la
  forme que TCK-613 (contrainte 2) prévoit déjà pour ce pilote.

## Hors périmètre

- La durée de conservation des demandes de contact (`ContactLeadService`), au porteur.
- `LogWhatsappDriver`, qui journalise aussi `to` et le texte : TCK-613 le porte avec les autres
  pilotes ; la décision ne vise que le pilote SMS.

## Notes d'implémentation

_(à remplir par implementing-specs)_
