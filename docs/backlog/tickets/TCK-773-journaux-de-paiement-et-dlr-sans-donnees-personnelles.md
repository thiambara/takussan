---
id: TCK-773
title: "Journaux des pilotes Wave et Orange Money et des DLR Mtarget sans données personnelles"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [back, journaux, rgpd, paiements, sms, pistes]
---

## Contexte

Réf : **P14.10** du fichier de pistes, `validé` (critère accordé : V3, ce qu'un journal garde des
données personnelles).

En cas d'échec, `WaveDriver` (checkout, verify) et `OrangeMoneyDriver` (checkout, verify, oauth)
journalisent le corps entier de la réponse du fournisseur. `DlrReportApplier` journalise le
`msisdn` en clair d'un rapport sans tentative, et le rapport brut entier (`$record->raw`) d'un
statut inconnu. TCK-613 ne couvre aucun de ces emplacements.

## Décision du porteur

statut et code du fournisseur seulement, numéro masqué, raw du DLR non journalisé

## Objectif utilisateur

Le journal d'un échec de paiement ou d'un rapport de remise SMS ne recopie ni le numéro d'un
payeur ou d'un destinataire, ni le texte libre du fournisseur.

## Contraintes strictes

- Des pilotes, le journal garde `status` et `provider_code` (`code`, `error_code` ou `error` du
  corps JSON, tronqué à 64 caractères), jamais `body`.
- Le numéro est masqué par `WebhookPayloadRedactor::maskPhone()` (`••••` + 4 derniers chiffres),
  forme déjà en usage.
- Aucun changement de ce qui est rendu au client (502 `payment.provider_unavailable`, TCK-602).

## Delta à produire

- [x] `App\Support\Logging\ProviderResponseContext::of(Response)`.
- [x] Les cinq `Log::warning` des deux pilotes passent par lui.
- [x] `DlrReportApplier` : `msisdn` masqué, `record` retiré.
- [x] `PaymentDriverErrorLeakTest` : l'assertion qui épinglait le corps au journal est inversée, plus un test du code fournisseur ; `MtargetDlrPullingTest` : deux tests.

## Critères d'acceptation

- [x] AC1 — Un échec Wave ou Orange Money journalise exactement `['status' => 400, 'provider_code' => '…']`, et le numéro du corps n'apparaît dans aucun journal.
- [x] AC2 — Un rapport sans tentative journalise `msisdn` = `••••4567`.
- [x] AC3 — Un statut inconnu est journalisé sans le rapport brut.

## Hors périmètre

- Le numéro complet journalisé par les canaux SMS et WhatsApp : c'est P11.10 (angle 11).
- Les autres pilotes (Lemon Squeezy passe déjà par `SafeExceptionContext`).

## Notes d'implémentation

- **Ablation** : les deux pilotes et `DlrReportApplier` remis à leur état d'avant → 4 rouges sur 23 ; correctif remis → 23 verts.
- `test_initiate_and_verify_never_return_the_provider_body` assertait jusqu'ici que le corps se retrouvait au journal (« le corps n'est pas perdu ») : c'est ce que la décision retire, l'assertion est inversée.
