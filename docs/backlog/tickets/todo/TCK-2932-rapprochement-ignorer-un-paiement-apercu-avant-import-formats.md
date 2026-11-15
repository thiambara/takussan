---
id: TCK-2932
title: "Rapprochement : ignorer un paiement sans ligne de banque, lire un relevé avant de l'importer, et servir les formats et banques pris en charge"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2933]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
    - "docs/models-spec.md#41-bankstatementline-"
tags: [back, rapprochement, banque, import, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin sort du « reste à rapprocher » un paiement qui n'aura jamais de ligne de banque, voit ce que l'outil a lu d'un relevé avant de l'importer, et sait quels relevés l'outil sait lire.

## Contrat de données

Écarts de TCK-2675 (`c-1`) et de l'écran e0 (« Ignorer » remplacé par « Chercher » : « aucune route n'ignore un paiement »). Relevé du 2026-11-15 : `POST bank-statement-lines/{line}/ignore` ignore une **ligne** de relevé, rien n'ignore un **paiement** ; l'import (`CsvDriver`, `OfxDriver`) écrit dès l'envoi, sans lecture préalable ; aucune route ne dit les formats ni les banques.

- `POST /api/reconciliation/ignored-payments` (`payable_type`, `payable_id`, motif codé `cash_kept` / `other_account` / `other` + texte) et `DELETE /api/reconciliation/ignored-payments/{id}` pour défaire ; le paiement ignoré sort de `pending-payments` et des compteurs « À rapprocher ». Les paiements du reste à rapprocher sont polymorphes (`ReconciliationOverviewController@pendingPayments` les clé par `classe:id`) : d'où une table, pas une colonne.
- `POST /api/bank-statements/preview` (même corps que l'import) : rend le nombre de lignes lues, ignorées (avec leur raison, comme `ParseTally`), la période et les 10 premières lignes **sans rien écrire**.
- `GET /api/reconciliation/supported-formats` : les formats lus (`csv` avec colonnes réglables, `ofx`) et la liste des **banques à préréglage validé**.

## Contraintes strictes (métier)

- **[D-67](../../../ardoise.md#d-67--aucun-relevé-wave-business-ni-orange-money-réel-na-servi-à-régler-limport-des-relevés)** (décision du porteur, 2026-10-06) : aucun préréglage de colonnes n'est écrit sans un export réel du fournisseur. La liste des banques ne contient **que** des banques dont un export réel a été lu et dont le préréglage est éprouvé par un test sur ce fichier (anonymisé). Tant qu'aucun n'est fourni, la liste est vide et seuls les formats sont rendus. Le ticket demande les exports au porteur (CBAO, Ecobank, SGBS, Wave Business, Orange Money) dans sa PR.
- `preview` n'écrit rien : aucun `bank_statements`, aucune ligne, aucun média conservé.
- Ignorer un paiement est journalisé (qui, quand, motif) et réservé à `payments.reconcile`, dans l'agence.

## Delta à produire

- [ ] Migration `create_reconciliation_ignored_payments_table` (`agency_id`, `payable_type`, `payable_id` unique ensemble, `reason`, `note`, `ignored_by`, horodatage) ; `down()` juste ; modèle au `models-spec.md`.
- [ ] Routes d'ajout / retrait ; exclusion dans `pendingPayments` et `overview`.
- [ ] `preview` (driver en mode lecture seule).
- [ ] `supported-formats` (registre des préréglages, vide aujourd'hui).
- [ ] Tests : `ReconciliationIgnorePaymentTest`, `BankStatementPreviewTest` (aucune écriture), `SupportedFormatsTest`.

## Critères d'acceptation

- [ ] AC1 — Ignorer un paiement en espèces avec le motif `cash_kept` le retire de `GET /api/reconciliation/pending-payments` et décrémente « À rapprocher » de `overview` ; le `DELETE` l'y remet. Un agent sans `payments.reconcile` reçoit 403 ; un paiement de l'agence B, 404.
- [ ] AC2 — `POST /api/bank-statements/preview` avec un CSV de 12 lignes dont 2 illisibles rend `read: 10`, `skipped: 2` (raisons), la période et 10 lignes ; le nombre de lignes de `bank_statements` et `bank_statement_lines` est inchangé.
- [ ] AC3 — `GET /api/reconciliation/supported-formats` rend `csv` et `ofx`, et `banks: []` tant qu'aucun préréglage éprouvé n'existe ; un préréglage ajouté avec son fichier de test y paraît.

## Hors périmètre

- L'écran (TCK-2933). Écrire un préréglage sans export réel (interdit par D-67).

## Notes d'implémentation

**Livré (2026-11-15).** Cinq routes, toutes sous `agencies/{agency}` comme le reste du rapprochement
(le contrat du ticket écrivait `/api/reconciliation/…` en abrégé) :

| Route | Rôle |
|---|---|
| `GET …/reconciliation/ignored-payments?period=YYYY-MM&per_page=` | les gestes de l'agence, le plus récent d'abord — **ajoutée** : sans elle, l'écran (TCK-2933) ne retrouve pas l'`id` à passer au `DELETE` après un rechargement |
| `POST …/reconciliation/ignored-payments` | `payable_type` (`lease_payment`/`booking_payment`), `payable_id`, `reason` (`cash_kept`/`other_account`/`other`), `note` (exigée pour `other`, 500 car.) → 201 |
| `DELETE …/reconciliation/ignored-payments/{id}` | défait le geste → 204 |
| `POST …/bank-statements/preview` | même corps que l'import → `source_format`, `read`, `skipped`, `skipped_by_reason`, `skipped_lines` (rang + raison, 50 au plus), `period {start,end}`, `lines` (10, montants en chaîne décimale), `already_imported` |
| `GET …/reconciliation/supported-formats` | `formats` (dérivés de `BankStatementSourceFormat` : `csv` colonnes réglables, `ofx`) et `banks` (vide) |

- **Argent** : ignorer n'écrit QUE la ligne de `reconciliation_ignored_payments`. Le paiement n'est
  ni mis à jour ni « touché » (test : la ligne `lease_payments` est identique, horloge avancée de
  5 min pour qu'un `touch()` se voie — ablation par `touch()` : rouge). La synthèse classe le
  paiement `ignored` (nouvelle clé `ignored` de `overview`, la somme des quatre classes reste
  `payments_total`), APRÈS « confirmé passerelle » et « rapproché à la main » : un paiement ignoré
  puis rapproché compte rapproché.
- **Journal** : `activity_log` sur le paiement, événements `payment_ignored` / `payment_unignored`
  (motif, note, id du geste) ; libellés front `admin.audit.events.payment_ignored|payment_unignored`.
- **Refus** : agent sans `payments.reconcile` 403 ; paiement d'une autre agence 404
  `reconciliation.payment_not_found` ; geste d'une autre agence 404
  `reconciliation.ignored_payment_not_found` ; paiement hors du reste à rapprocher (passerelle,
  rapproché, non payé, caution rendue) 422 `reconciliation.payment_not_pending` ; déjà ignoré 422
  `reconciliation.payment_already_ignored` (paiement verrouillé : pas de 500 sur l'index unique).
- **Aperçu** : le pilote de l'import, avec le mapping de l'agence, sur le fichier temporaire de la
  requête ; aucun relevé, ligne, média ni job. `ParseTally` garde désormais la raison de chaque ligne
  sautée (`missing_value`, `invalid_date`, `invalid_amount`, `invalid_direction`, `invalid_currency`,
  `unreadable`) — un code, jamais une valeur. `skip()` sans argument reste valable. Un fichier déjà
  importé n'est pas refusé : `already_imported: true`. Le refus d'encodage (CSV non UTF-8) vaut aussi.
  Le corps est partagé : `StoreBankStatementRequest::bodyRules()`. Un fichier que le pilote ne peut
  pas ouvrir (en-tête aux colonnes vides ou en double — le `;;` final des exports) rendait 500 : il
  rend 422 `reconciliation.preview_unreadable`, rien d'écrit.
- **Liste des gestes** : seuls les gestes EN EFFET (paiement encore payé, hors passerelle, non
  rapproché) y paraissent ; son total sur un mois est le `ignored` de la synthèse (test).
- **Banques (D-67)** : `BankPresetRegistry::PRESETS` est vide ; un préréglage dont le fichier
  d'épreuve manque n'est pas servi, et `SupportedFormatsTest` lit chaque préréglage déclaré sur son
  fichier (zéro ligne sautée). **À demander au porteur dans la PR : un export réel (anonymisé) de
  CBAO, Ecobank, SGBS, Wave Business et Orange Money.**

**Écarts au ticket** : colonne `ignored_by_id` et non `ignored_by` (la relation `ignoredBy` heurterait
la colonne : `RelationSansCollisionDeColonneTest`) ; route de liste ajoutée (ci-dessus) ;
`payable_type` porte la classe, comme `bank_statement_lines.matched_payment_type`.

**Mesures** : `ReconciliationIgnorePaymentTest` 7 verts, `BankStatementPreviewTest` 6 (la garde compte
les lignes de TOUTES les tables avant/après), `SupportedFormatsTest` 5, `StatementParserTest` 20,
`ReconciliationOverviewTest` + `ReconciliationPendingPaymentsTest` 19, `BankCsvMappingTest`,
`OfxDeuxAImportTest`, `BankStatementPipelineTest` verts ; gardes d'architecture, trois balayages,
`LangGroupParityTest`, `FormRequestEtendBaseFormRequestTest`, `RelationSansCollisionDeColonneTest`,
`CasDEnumReservesTest`, `NamespaceAccessGuardTest`, `gen-features-by-actor --check` verts. Ablations (une à une) : exclusion du reste à rapprocher, écriture dans l'aperçu, `touch()` du
paiement, filtre du fichier d'épreuve, filtre « en effet » de la liste — toutes rouges, restaurées au md5.
