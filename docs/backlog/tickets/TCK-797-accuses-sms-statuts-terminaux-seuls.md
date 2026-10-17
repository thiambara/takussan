---
id: TCK-797
title: "Accusés SMS poussés : seuls les statuts sûrement terminaux s'écrivent, les autres s'ignorent avec un avertissement"
status: done
phase: P2
family: bug
estimate: S
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-36--webhooks-de-statut-sms-et-whatsapp"
tags: [back, sms, webhooks, pistes]
---

## Contexte

Réf : **P36.03** du fichier de pistes, `validé` (critère accordé : V7, écrire la table des
statuts terminaux tant que le vocabulaire des fournisseurs n'est pas lu). Orange écrivait
`failed` pour `MessageWaiting` et pour tout statut inconnu (`DeliveredToNetwork`,
`DeliveryUncertain`…), Mtarget poussé pour tout `Status` différent de 3 (absent compris), LAM
pour un `status` absent ou inconnu. La sonde de santé comptant les `failed` de l'heure, un
intermédiaire gonflait le taux d'échec.

## Décision du porteur

n'écrire que les statuts sûrement terminaux, par une table explicite par fournisseur ; tout autre statut est ignoré avec un `Log::warning`

## Delta à produire

- [x] Une table par contrôleur (`TERMINAL_STATUSES`, `STATUSES` pour LAM) ; un statut hors table
      répond 200, n'écrit rien, annote le journal (`matched_count = 0`) et émet un
      `Log::warning` « statut non terminal ou inconnu ignoré ».
- [x] Tests par fournisseur ; les deux tests Mtarget qui prenaient `Status=5` pour un échec
      passent à 6.

## Critères d'acceptation

- [x] AC1 — Orange : `DeliveredToNetwork`, `DeliveryUncertain`, `MessageWaiting`,
      `DeliveryNotificationNotSupported` et un statut inconnu laissent la tentative `sent`, avec un
      avertissement chacun ; `MessageWaiting` après `DeliveredToTerminal` laisse `delivered`.
- [x] AC2 — Mtarget poussé : 0, 1, 2, 5, 99 et un `Status` absent laissent `sent` ; 1 après 3
      laisse `delivered` ; 4 et 6 s'écrivent `failed`.
- [x] AC3 — LAM : 16 (UNKNOWN) et un `status` absent laissent `sent`, avec un avertissement ;
      2, 12 et 23 s'écrivent `failed` avec leur texte.

## Hors périmètre

- Établir le vocabulaire réel d'Orange Sénégal et du push Mtarget sur leur documentation
  (P36.06 pour Orange).
- WhatsApp et le pulling Mtarget, qui ignoraient déjà les intermédiaires.

## Hypothèses (mode sans humain)

- Tables retenues, faute de documentation des fournisseurs dans le dépôt : Orange
  `DeliveredToTerminal` → `delivered`, `DeliveryImpossible` → `failed` (vocabulaire OneAPI) ;
  Mtarget 3 → `delivered`, 4 et 6 → `failed` (codes de l'opérateur cités par
  `DlrReportApplier`) ; LAM 6 → `delivered`, 2, 12, 23 → `failed` (docblock du contrôleur).
- `DeliveryNotificationNotSupported` dit qu'aucun accusé ne viendra, pas que le SMS a échoué :
  il s'ignore, au lieu d'être écrit `failed` comme avant.
- LAM SENT (4) reste écrit `sent` : c'est l'état de la tentative à l'envoi, il n'annonce aucun
  échec, et la précédence de TCK-796 l'empêche d'effacer un `delivered`.

## Notes d'implémentation

- Ablation : les trois contrôleurs remis à l'état de TCK-796 → 6 rouges sur
  `tests/Feature/Http/Webhook` ; remis → 41 verts.
- `retUrlEmisParLePilote()` lit la dernière requête sortante (`Http::recorded()->last()`) :
  `assertSent` rendait la première, et un test qui envoie plusieurs SMS rejouait le `ret_url` du
  premier.
