---
id: TCK-796
title: "Accusés SMS poussés : la précédence du pulling, un statut de rang inférieur ne fait plus reculer la tentative"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-795]
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

Réf : **P36.02** du fichier de pistes, `validé` (critère accordé : V7, la piste renverse le
« last-write » écrit comme choisi pour le SMS dans `DeliveryAttemptUpdater`). Les trois routes
SMS poussées appelaient `applyStatus` sans `statusPrecedence`, quand le pulling Mtarget
(`DlrReportApplier`) passe `[sent, delivered, failed]` pour le même fournisseur : un `sent`
tardif ou rejoué effaçait un `delivered` et son `delivered_at`.

## Décision du porteur

la précédence du pulling `[sent, delivered, failed]` sur les trois routes SMS poussées, dite dans le docblock de l'updater ; un test par route

## Delta à produire

- [x] `DeliveryAttemptUpdater::SMS_STATUS_PRECEDENCE`, dite dans son docblock.
- [x] Les contrôleurs Orange, Mtarget et LAfricaMobile la passent à `applyStatus` (le rejeu de
      `WebhookReplayer` passe par le même `process()`).
- [x] Un test par route.

## Critères d'acceptation

- [x] AC1 — LAM : `status=6` puis `status=4` laisse `delivered` et `delivered_at`.
- [x] AC2 — Orange : `DeliveryImpossible` puis `DeliveredToTerminal` laisse `failed` et sa raison.
- [x] AC3 — Mtarget poussé : `Status=5` puis `Status=3` laisse `failed` et sa raison.

## Hors périmètre

- Les statuts intermédiaires écrits comme des échecs (P36.03) : tant qu'ils le sont, un
  intermédiaire reçu avant `delivered` fige la tentative en `failed`, ce que P36.03 traite.
- `DlrReportApplier` garde sa propre liste, identique.

## Hypothèses (mode sans humain)

- Les routes Orange et Mtarget n'écrivent jamais `sent` : la précédence n'y a d'effet observable
  que sur `failed` suivi de `delivered`, qui reste `failed` (rang le plus haut, comme dans le
  pulling). C'est ce que gardent AC2 et AC3.

## Notes d'implémentation

- Ablation : les trois `statusPrecedence:` retirés → les trois tests neufs rougissent ; remis →
  verts (`tests/Feature/Http/Webhook`, `tests/Feature/Services/Sms`, `tests/Feature/Webhooks` :
  125 verts).
