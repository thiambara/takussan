---
id: TCK-1252
title: "Rappel d'invitation : 2 jours après la dernière émission, relance comprise"
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
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-132--liens-portés-par-les-sms-et-whatsapp--hôte-validité-page-ouverte"
tags: [api, invitations, rappels, sms, pistes]
---

## Contexte

Réf : **P132.02** du fichier de pistes, `validé (délégué)`.

`InvitationService::remindPending` choisit les invitations `sent` dont `created_at` a plus de
2 jours et `last_reminded_at` est nul. `resend` remet `last_reminded_at` à nul sans toucher
`created_at` : une invitation relancée plus de 2 jours après sa création reçoit son rappel au
passage horaire suivant, juste après la relance.

## Décision du porteur (déléguée)

« validé (délégué) — le rappel part 2 jours après la dernière émission, comme l'écrit le docblock de `resend` (« so the recipient gets one again at J+2 from "now" ») : `remindPending` mesure ce délai depuis `expires_at` − `DEFAULT_TTL_DAYS`, que `send` et `resend` posent tous deux à l'émission, au lieu de `created_at` ; `resend` garde la remise à nul de `last_reminded_at`, sans colonne neuve ; tests : relance puis `remindPending` une heure après → aucun envoi, relance + 2 jours → un envoi »

Critère accordé : V7.

## Objectif

Le rappel d'une invitation part 2 jours après sa dernière émission.

## Delta à produire

- [x] `remindPending` : `expires_at <= (now − REMINDER_OFFSET_DAYS) + DEFAULT_TTL_DAYS` remplace
      `created_at <= now − REMINDER_OFFSET_DAYS`.
- [x] Docblock de `REMINDER_OFFSET_DAYS` aligné.
- [x] Test dans `InvitationBySmsTest`.

## Critères d'acceptation

- [x] AC1 — Invitation rappelée à J+3, relancée, puis `remindPending` une heure après → aucun envoi.
- [x] AC2 — Deux jours plus tard → un rappel.

## Hors périmètre

- Une colonne de date de dernier envoi (écartée par la décision).

## Notes d'implémentation

- Hypothèse : `send` et `resend` sont les seuls écrivains d'`expires_at`, toujours à `now() + 7 j`
  (relevé par le délégué, `grep -rn "'expires_at' =>" app`). Une invitation dont l'échéance serait
  posée autrement décalerait son rappel d'autant.
- Ablation : `InvitationService.php` remis à `HEAD` → 1 rouge (« aucun rappel une heure après la
  relance », 4 SMS au lieu de 3) ; correctif remis → 7/7 verts. `InvitationLifecycleTest`,
  `InvitationLocaleTest`, `InvitationSmsContentTest` verts.
