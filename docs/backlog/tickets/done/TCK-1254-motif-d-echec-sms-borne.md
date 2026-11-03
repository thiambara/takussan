---
id: TCK-1254
title: "Accusé SMS en échec : le motif du fournisseur est borné à la colonne, plus de 500"
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
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-124--colonnes-bornées-remplies-par-une-valeur-dérivée-ou-recopiée"
tags: [api, sms, webhooks, colonnes-bornees, pistes]
---

## Contexte

Réf : **P124.02** du fichier de pistes, `retenu · autonome` (A1).

Les accusés SMS de LAfricaMobile (`text`), de Mtarget poussé et relevé (`StatusText`) passent leur
motif d'échec tel quel à `DeliveryAttemptUpdater::applyStatus()`, qui l'écrit dans
`notification_delivery_attempts.failure_reason`, un `varchar(255)`. Au-delà de 255 caractères,
l'écriture lève : le webhook rend 500 et la tentative reste `sent`. Le pendant WhatsApp est borné
depuis TCK-1046.

## Objectif

Un motif d'échec de plus de 255 caractères est écrit tronqué, et l'échec est enregistré.

## Delta à produire

- [x] `DeliveryAttemptUpdater::applyStatus()` : `mb_substr($failureReason, 0, 255)`, point de
      passage commun des trois voies.
- [x] Un test par voie : `LAfricaMobileSmsWebhookTest`, `MtargetSmsWebhookTest`,
      `MtargetDlrPullingTest`.

## Critères d'acceptation

- [x] AC1 — Rappel LAM `status=2` et `text` de 300 caractères → 200, tentative `failed`, motif de
      255 caractères.
- [x] AC2 — Même chose pour Mtarget poussé (`Status=6`) et relevé (`sms:pull-mtarget-dlr`).

## Hors périmètre

- `SmsPullMtargetDlr` applique les rapports d'une page sans `try` : un autre rapport fautif
  arrêterait encore la relève (constat de la piste, déduit, hors du correctif qu'elle propose).

## Notes d'implémentation

- Les tests écrivent 300 `é` : la borne est en caractères, comme pour WhatsApp, et un `substr`
  d'octets aurait coupé un caractère (même défaut que P124.03).
- Ablation : `DeliveryAttemptUpdater.php` remis à `HEAD` → 1 rouge dans chacune des trois classes
  (500, ou 22001 `value too long` pour la relève) ; correctif remis → 11, 14 et 19 verts.
