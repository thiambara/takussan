---
id: TCK-2915
title: "API — paiements : la date de l'avis d'échéance (le rappel J-3), toutes les quittances d'un bail en une archive, et ce qui manque aux revenus du bailleur (relances, bail et photo par bien, moyen et compte du versement, règle de versement)"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2909]
blocks: [TCK-2908, TCK-2916, TCK-2850]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#29-bis-documentvaultarchive-"
tags: [back, paiements, quittances, avis-d-echeance, bailleur, reversements, audit-ux, app]
---

## Objectif utilisateur

Le locataire reçoit son avis d'échéance quelques jours avant chaque loyer et télécharge toutes ses quittances d'un coup ; le bailleur voit, bien par bien, qui a été relancé et quand, et sait quand et sur quel compte part son prochain versement.

## Contrat de données

Constat (vérifié à l'écriture) :

- **Avis d'échéance** : il **existe** sous la forme du rappel J-3 du job `SendLeasePaymentReminders` (chaque jour à 08:00, `DUE_SOON_DAYS = 3`, jalon `due_soon`, idempotent par `metadata.reminder_due_soon_sent_at`). Ce qui manque est **la date** de ce prochain avis : la fiche du bien n'a que l'échéance du mois (`PropertyOccupancy.php:121-126`) et le bail `next_due` (`LeaseResource.php:248-252`).
- **Quittances** : une par échéance payée (`GET leases/{lease}/receipts/{payment}/pdf`) ; l'archive du coffre ne prend qu'**un dossier**, et les quittances sont rangées par année (`receipts:{year}`, `DocumentVault.php:451-452`) — aucune archive de toutes les quittances.
- **Revenus du bailleur** (`OwnerStatementService`) : `next_payout` (`id, scheduled_at, payment_method, status, net_amount`) sans compte ; `payouts[]` sans moyen (l. 113-121) ni compte ; lignes par bien sans référence de bail ni photo.
- **Relances** : une lecture unique existe (`LeasePaymentReminderReader`, `last_reminder {at, source, channel, subject, by}`, `include=reminders` de `PaymentHistory`), mais **réservée au personnel de l'agence et au super-admin** (`PaymentHistory::withReminders`, règle de `LeasePaymentPolicy::remind` — « refuse le bailleur et le locataire »). Les montrer au bailleur **change une règle de lecture** posée par [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md) § 3. TCK-2850 (accueil du bailleur, « relancé par l'agence le … ») bute sur la même règle.

Audit (`audit-f4-patrimoine.md`) : app-paiements **e0** et **e2** (« Tout télécharger » / « Tout télécharger (.zip) » de l'historique — absent du produit ET de la fiche `TCK-2650.json`) ; **e4** (« Prochain versement prévu le … par virement » + compte, règle « Le versement part le 15… », note de relance d'un bien en retard, « Bail LS-… » et photo par bien, compteur de l'onglet Versements ; fiche `TCK-2651.json` a-4) ; app-biens **e2** (« avis d'échéance le … »).

À servir :

1. **Date de l'avis d'échéance** : `next_due_notice_date` sur l'occupation du bien et sur le bail = date de la prochaine échéance ouverte moins `SendLeasePaymentReminders::DUE_SOON_DAYS` (la constante, jamais un 3 recopié) ; nulle si l'avis de cette échéance est déjà parti.
2. **Archive de toutes les quittances** d'un bail : dossier `receipts:all` (ou `lease:{id}:receipts`) accepté par `GET me/document-vault/archive` et `POST me/document-vault/archives`.
3. **Revenus du bailleur** :
   - `next_payout.payout_method_masked` (compte, ex. « CBAO ••• 4521 ») ;
   - `payouts[].payment_method` et `payouts[].nature` (de TCK-2909) ;
   - `payouts_count` de la période ;
   - par bien : `lease_reference`, `photo_url` (vignette), et `reminders[] { at, channel, by_name }` des échéances en retard du mois, lus par `LeasePaymentReminderReader` (une source) et **ouverts au bailleur de ces échéances**, sans `subject` ni note ;
   - la règle de versement : `payout_day` du mandat (TCK-2909), sinon celui de l'agence.

## Contraintes strictes (métier)

- Aucun nouvel envoi : l'avis reste le rappel J-3 existant ; ce ticket ne sert que sa date.
- Les relances montrées au bailleur : date, canal, nom de l'auteur — jamais la note interne (`note`) de l'agence.
- L'archive des quittances suit ADR-0099 (amendement « l'archive préparée d'un dossier ») : seules les quittances que le lecteur peut ouvrir.
- Montants décimaux en base ; XOF sans sous-unité dans les documents.

## Delta à produire

- [ ] **Amender ADR-0105 § 3** avant le code : le bailleur lit la date, le canal et l'auteur des relances de ses échéances (jamais le sujet ni la note).
- [ ] `next_due_notice_date` (occupation, bail), calculé sur `SendLeasePaymentReminders::DUE_SOON_DAYS`.
- [ ] Dossier d'archive `receipts:all` dans `DocumentVault` / l'archive préparée.
- [ ] `OwnerStatementService` : compte masqué, moyen et nature des reversements, `payouts_count`, `lease_reference`, `photo_url`, `reminders[]`, règle de versement.
- [ ] Tests : `NextDueNoticeDateTest` (J-3 de la prochaine échéance ouverte ; nulle après l'envoi ; suit la constante — ablation), `DocumentVaultReceiptsArchiveAllYearsTest`, `OwnerStatementRemindersTest` (note interne absente), `OwnerStatementPayoutDetailsTest`.

## Critères d'acceptation

- [ ] AC1 — Pour une échéance ouverte du 5 déc., la fiche du bien loué et le bail rendent `next_due_notice_date = 2026-12-02` (J-3) ; une fois le rappel `due_soon` parti, la date passe à l'échéance suivante ou à `null`.
- [ ] AC2 — Changer `DUE_SOON_DAYS` change la date servie (une seule source).
- [ ] AC3 — L'archive `receipts:all` d'un locataire dont le bail a 14 échéances payées sur 2025 et 2026 contient 14 PDF.
- [ ] AC4 — Le relevé du bailleur rend, pour un bien en retard relancé par SMS le 8 nov., `reminders = [{at: 2026-11-08, channel: sms, by_name: …}]`, sans `subject` ni note ; un autre bailleur de l'agence ne voit pas ces relances.
- [ ] AC5 — `next_payout` rend le compte masqué ; chaque `payouts[]` rend `payment_method` et `nature` ; `payouts_count` égale la longueur de `payouts[]`.
- [ ] AC6 — Chaque ligne par bien rend `lease_reference` et une `photo_url` (nulle si le bien n'a pas de photo).

## Hors périmètre

- Les écrans (TCK-2908, TCK-2916).
- L'avis de versement PDF (TCK-2909).

## Notes d'implémentation

_(à remplir par implementing-specs)_
