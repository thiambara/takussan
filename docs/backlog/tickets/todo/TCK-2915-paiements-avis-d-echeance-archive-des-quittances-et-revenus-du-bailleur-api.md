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

**2026-11-15 — implémentation (agent, vague 92).** Prémisses re-mesurées. Trois diffèrent : (1) **aucun jour de versement d'agence n'existait** (« sinon celui de l'agence ») — ajouté comme réglage `agencies.settings.payout_day` (1-28, `AgencySettings`, écrit par `PATCH /api/agencies/{id}`) et branché dans la fiche de l'agence, section Règles › Reversements (« Jour de versement aux bailleurs », `JourDeVersement`, hors du droit `payouts.approve` qui ne garde que le seuil ; schéma, envoi seulement modifié, erreur `settings.payout_day` sous son champ, 3 clés i18n). (2) **Le canal SMS de l'AC4 n'existe pas** : `ReminderChannel` = `whatsapp` | `call` (ADR-0105) ; testé sur WhatsApp. (3) `masked_identifier` ne porte que la fin du numéro (« •••• 4521 »), pas le nom de la banque (« CBAO ») : `payout_method_kind` est servi à côté.

**ADR** — ADR-0105 amendé (§ « Amendement du 2026-11-15 ») AVANT le code : le bailleur lit dans SON relevé `{at, channel, by_name}` des relances NOTÉES des échéances en retard de la période ; jamais `note`, `subject`, ni l'id de l'auteur (liste blanche) ; les rappels automatiques n'y sont pas (il reçoit déjà le sien). `LeasePaymentPolicy::remind` et `include=reminders` inchangés. ADR-0099 amendé : dossiers virtuels `receipts:all` / `receipts:lease:{id}`.

**Avis d'échéance (AC1, AC2)** — `SendLeasePaymentReminders::remindable()` : la sélection du job extraite (ouverte, hors caution, hors restitution), que `claim()` et `App\Services\Payments\NextDueNotice` lisent. Date = MIN(`due_date` ≥ aujourd'hui, Dakar) des échéances sans `metadata.reminder_due_soon_sent_at` (clé lue dans `LeasePaymentReminderReader::automaticKeys()`) − `DUE_SOON_DAYS`, une requête par page. Servie en `occupancy.next_due_notice_date` (`include=occupancy`, branche « bail lisible » ; `null` pour un bien vacant) et `next_due_notice_date` du bail (`include=due_summary`, liste ET fiche). Une échéance due dans moins de 3 jours et pas encore avisée rend une date passée (le job la rattrape).

**Archive (AC3)** — `ArchiveDuCoffre::dossierDesQuittances()` : union des dossiers `receipts:{année}` déjà jugés par le coffre ; jamais listé (liste, recherche, compteurs inchangés). Sans quittance (ou bail d'un autre) : 422 `document.archive_empty`. `FORME` élargie ; colonne `folder` (40) suffisante ; l'archive préparée la construit (job exécuté dans le test, 14 PDF ; nom de téléchargement `documents.zip`, rien ne lit une année dans la clé). ⚠ Les quittances ne sont dans le coffre que du **locataire** (`tenantLeases()`) : le bailleur et le personnel reçoivent 422 — l'écran ne propose « Tout télécharger » qu'au locataire.

**Relevé du bailleur (AC4-AC6)** — `next_payout.payout_method_kind` / `payout_method_masked` (le moyen du reversement, sinon la destination figée — `payout_method_source: payout` —, sinon le moyen par défaut du bailleur VÉRIFIÉ pour l'agence, seule destination qu'une approbation accepte — `default` — ; rien de vérifié : `null`) ; `payouts[].payment_method` et `.nature` ; `payouts_count` ; `payout_rule {day, source: mandate|agency|null}` (`App\Services\Payout\PayoutDay`, une résolution, que lit aussi `GET /api/me/payout-methods` → `meta.payout_day` + `meta.payout_day_source` : le jour d'agence y sert désormais de repli) ; par bien `lease_reference`, `photo_url` (vignette `thumbnail`, filigrane respecté, `null` sans photo), `reminders[]`. `LeasePaymentReminderReader::forPayments()` (lecture groupée, que `summaries()` lit aussi). Instantané envoyé : ces champs ne sont pas figés, servis au jour ; un instantané plus ancien reçoit moyen et nature de ses reversements et le compteur, sans rectificatif. Types front complétés : `OwnerStatement` (`invoice.ts`), `OccupationDuBien.next_due_notice_date` (`types/property.ts`), `BailDeLaListe.next_due_notice_date` (`leases-file.ts`), `meta.payout_day_source` (`useMyPayoutMethods`). `next_due_notice_date` de l'occupation suit la règle de `lease` (absent pour qui ne lit pas le bail) : `PropertyOccupancyVisibilityTest` le garde (`PRIVES`).

Tests : `NextDueNoticeDateTest`, `DocumentVaultReceiptsArchiveAllYearsTest`, `OwnerStatementRemindersTest`, `OwnerStatementPayoutDetailsTest` (18 tests), `PropertyOccupancyVisibilityTest` (clé ajoutée aux privées), front `admin-schemas.test.ts` (TCK-2915). 21 ablations, toutes rouges puis restaurées (md5) ; AC2 : `DUE_SOON_DAYS = 4` rougit le test littéral (2 déc.) et laisse vert le test relatif à la constante. Joués aussi : `OwnerStatementSnapshotTest`, `OwnerStatementSnapshotUnchangedTest`, `OwnerStatementPropertiesTest`, `OwnerStatementTest`, `PropertyOccupancy{,QueryCount,Visibility}Test`, `LeaseIndexQueryCountTest`, `LeasePaymentReminderTest`, `SendLeasePaymentRemindersTest`, `AgencySettingsBooleensStockesTest`, `AgencySettingAccessorTest`, `OwnerMandateTermsTest`, `OwnerStatement{Remaining,Balance,Beneficiary}Test`, `OwnerDetailMoneyTest`, `OwnerProfileShowTest`, `OwnerDetailCollectionsCountTest`, `OwnerProfileListFiguresTest`, `PayoutMethodTest`, `ImpersonationPayoutMethodsTest`, `DocumentVaultArchiveTest`, `ArchiveAsynchroneDuCoffreTest`, les trois balayages et les trois gardes d'architecture ; front : `admin-schemas`, `agence/fiche`, `admin-agency/fiche/__tests__` ; `tsc`, `check:i18n`, gardes racine et front vertes. `docs/features.md` / `docs/models-spec.md` laissés à `/sync-specs`.
