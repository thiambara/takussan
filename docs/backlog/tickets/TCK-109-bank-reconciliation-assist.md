---
id: TCK-109
title: "Rapprochement bancaire semi-automatique"
status: done
phase: P2
family: applicatif
estimate: L
wave: 12
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-028, TCK-077, TCK-079]
blocks: []
spec_refs:
  features:
    - docs/features.md#15-transactions--paiements
  models:
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#25-invoice-
tags: [back, front, accounting, reconciliation]
---

## Objectif utilisateur

Permettre à un comptable / admin d'agence d'importer un relevé bancaire
(CSV ou OFX) et de voir s'afficher pour chaque ligne du relevé une
proposition d'appariement automatique avec une `BookingPayment`,
`LeasePayment` ou `Invoice` existante, qu'il valide ou ajuste
manuellement avant de marquer comme rapproché — sans créer
mécaniquement des écritures non vérifiées.

## Contrat de données

**Backend — Migrations** :

- Table `bank_statements` :
  - `id`, `agency_id`, `uploaded_by` (FK users), `source_format` (enum:
    `csv` | `ofx`), `file_path`, `bank_name` (nullable),
    `account_iban` (nullable, hashed/masked stored), `period_start`,
    `period_end`, `lines_count`, `status` (enum: `processing` |
    `ready_for_review` | `partially_reconciled` | `reconciled` |
    `archived`), `created_at`, `updated_at`.
- Table `bank_statement_lines` :
  - `id`, `bank_statement_id` (FK), `posted_at` (date), `amount`
    (decimal 12,2), `direction` (enum: `credit` | `debit`),
    `currency` (char 3), `label` (text), `reference` (string,
    nullable), `counterparty` (string, nullable), `raw_payload`
    (json), `match_status` (enum: `unmatched` | `suggested` |
    `confirmed` | `ignored`), `matched_payment_type` (enum: `booking_payment` |
    `lease_payment` | `invoice`, nullable), `matched_payment_id`
    (nullable, polymorphique simple), `match_confidence` (int 0–100,
    nullable), `confirmed_at`, `confirmed_by`.
- Index : `(bank_statement_id, match_status)`,
  `(matched_payment_type, matched_payment_id)`.

**Endpoints** :

- `POST /api/agencies/{agency}/bank-statements` (multipart : `file`,
  `format`) — admin/compta uniquement. Stocke le fichier, lance le job
  d'import.
- `GET /api/agencies/{agency}/bank-statements` — liste paginée filtrable.
- `GET /api/bank-statements/{id}` — détail + lignes (paginées,
  fields/filter spatie).
- `POST /api/bank-statement-lines/{id}/match` body
  `{ payment_type, payment_id }` — confirme manuellement un appariement.
- `DELETE /api/bank-statement-lines/{id}/match` — annule l'appariement.
- `POST /api/bank-statement-lines/{id}/ignore` — marque ignoré (ex:
  frais bancaires, virements internes).
- `POST /api/bank-statements/{id}/finalize` — clôture le relevé
  (status → `reconciled` ou `partially_reconciled`).

**Pipeline d'import** :

- Job `App\Jobs\Accounting\ParseBankStatementJob` :
  - Parse CSV (config champs : date, label, montant, direction) ou OFX
    (lib `omnipay-ofx`-style ou parser custom).
  - Crée les lignes en base.
  - Enqueue `MatchBankStatementJob` derrière.
- Job `App\Jobs\Accounting\MatchBankStatementJob` :
  - Pour chaque ligne, calcule un score d'appariement contre les
    `BookingPayment`, `LeasePayment`, `Invoice` non encore réconciliés
    de l'agence sur fenêtre `posted_at ± 7 jours`.
  - Heuristiques : exact match montant + référence (>95), exact match
    montant + counterparty similaire (80–95), montant + date proches
    (60–80), en dessous → `unmatched`.
  - Stocke `match_confidence` + suggestion ; ne confirme jamais
    automatiquement.
- Service `App\Services\Accounting\ReconciliationMatcher`.
- Service `App\Services\Accounting\StatementParser` (driver-based:
  `CsvDriver`, `OfxDriver`).

**Effet de la confirmation** :

- Confirmer un match d'une ligne `credit` sur un `BookingPayment` /
  `LeasePayment` / `Invoice` met à jour le payment :
  `bank_reconciled_at = posted_at`, `bank_statement_line_id = line.id`.
  Pas d'altération du `status` du payment (déjà géré ailleurs — TCK-028 /
  TCK-077 / TCK-079).
- Migrations additives sur les 3 tables payment :
  `bank_reconciled_at` (datetime, nullable),
  `bank_statement_line_id` (FK, nullable).

**Frontend** :

- Page `Compta → Rapprochement bancaire` (admin agence + rôle compta).
- Liste des relevés importés (statut, période, % réconcilié).
- Détail relevé : tableau des lignes avec colonnes Date, Label, Montant,
  Suggestion (avec confidence), Actions (Confirmer / Modifier /
  Ignorer).
- Modal de modification : recherche manuelle d'un payment
  (autocomplete sur référence, montant, locataire).
- Drop-zone d'upload CSV/OFX avec preview avant import.
- Indicateur global : `X / Y lignes rapprochées`.

## Direction UX / Artistique

**Ambiance** : interface comptable, dense mais lisible. Pas de
gamification ; le rapprochement est un travail sérieux. Tableaux
spacieux, badges de status sobres, pas d'animation festive sur
"100 % réconcilié".

**Hiérarchie** :
- Suggestion forte (confidence ≥ 90) : ligne en surbrillance verte
  pâle avec bouton "Confirmer" prominent.
- Suggestion moyenne (60–89) : ligne neutre avec bouton "Confirmer"
  + "Modifier".
- Pas de suggestion : ligne neutre, bouton primaire "Trouver un
  paiement", secondaire "Ignorer".
- Ligne ignorée : grisée, badge "Ignoré".
- Ligne confirmée : verte, badge "Rapproché".

**Upload** : drop-zone simple, format détecté automatiquement (CSV vs
OFX), preview "10 premières lignes parsées" avant validation, message
d'erreur clair si parsing échoue.

**Pas de prescription technique** : choix de table/grid lib, modal,
state — laissé à l'IA implémenteur.

## Contraintes strictes (métier)

- **Aucune confirmation automatique** : même un score 100, l'humain
  doit cliquer "Confirmer". Le système suggère, l'humain décide.
- **Idempotence import** : importer deux fois le même fichier
  (hash sha256) sur la même agence → 422 "Relevé déjà importé". Le hash
  est stocké sur `bank_statements`.
- **Devise** : la devise de la ligne doit matcher la devise du payment
  ciblé (cohérent TCK-084). Mismatch = appariement refusé.
- **Scope agence** : une ligne ne peut être appariée qu'à un payment
  appartenant à la même agence. Vérifié en service ET en policy.
- **Reversibilité** : un appariement confirmé peut être annulé (DELETE)
  tant que le relevé n'est pas `reconciled` (finalisé). Après
  finalisation, lecture seule.
- **Audit** : chaque confirmation, modification, ignoration produit un
  ActivityLog avec acteur + ligne + payment cible.
- **Sécurité fichiers** : les fichiers de relevés sont stockés sur le
  storage privé (cf. TCK-016/105) avec URL signée TTL court ; pas
  d'accès public.
- **Anonymisation des labels** : ne jamais exposer dans une notification
  ou un email le contenu d'une ligne (peut contenir IBAN, identifiants
  tiers).
- **Performance import** : un fichier 5000 lignes doit s'importer +
  matcher en < 60 s (asynchrone).
- **Pas de double rapprochement** : un payment ne peut être rapproché
  qu'à une seule ligne. Validé en base via index unique partiel
  `(bank_statement_line_id) where bank_statement_line_id is not null`
  sur chaque table payment (3 index unique).
- **OFX et CSV** : OFX pris en charge en V1, CSV avec mapping configurable
  agence (séparateur, colonne dates, colonne montant, sign convention).
  Stocker le mapping sur `agencies.bank_csv_mapping` (json, nullable).

## Delta à produire

- [ ] Migrations : `create_bank_statements_table`, `create_bank_statement_lines_table`
- [ ] Migrations additives : `add_bank_reconciliation_to_booking_payments_table`, idem `lease_payments`, idem `invoices`
- [ ] Migration : `add_bank_csv_mapping_to_agencies_table`
- [ ] Modèles : `BankStatement`, `BankStatementLine`
- [ ] Enums : `BankStatementStatus`, `BankStatementLineMatchStatus`, `BankStatementSourceFormat`
- [ ] Services : `App\Services\Accounting\StatementParser` (+ drivers `CsvDriver`, `OfxDriver`), `ReconciliationMatcher`, `ReconciliationManager` (orchestrateur confirm/unmatch/ignore/finalize)
- [ ] Jobs : `ParseBankStatementJob`, `MatchBankStatementJob`
- [ ] Events + Listeners : `BankStatementImported`, `BankStatementLineMatched`, `BankStatementFinalized`
- [ ] Controllers : `BankStatementController`, `BankStatementLineController`
- [ ] FormRequests + Policies (`BankStatementPolicy`, `BankStatementLinePolicy`)
- [ ] Resources : `BankStatementResource`, `BankStatementLineResource`
- [ ] Routes : `routes/api/accounting.php`
- [ ] Index uniques partiels sur les 3 tables payment (anti double rapprochement)
- [ ] Tests : `BankStatementImportTest`, `ReconciliationMatcherTest` (5+ scénarios de scoring), `BankStatementLineMatchTest`, `FinalizeStatementTest`, `DuplicateImportTest`, `CrossAgencyMatchRefusalTest`
- [ ] Page frontend `Compta → Rapprochement` (liste + détail + modal modif + upload)
- [ ] Hooks fetch/mutation
- [ ] i18n fr/en/wo (`reconciliation.*`)
- [ ] Tests Vitest sur composant principal
- [ ] Documentation comptable courte `docs/finance/reconciliation.md` (workflow, règles)

## Critères d'acceptation

- [ ] AC1 — un admin importe un CSV de 100 lignes ; après job, le relevé
  passe en `ready_for_review` avec 100 lignes en base
- [ ] AC2 — pour chaque ligne avec un montant exact + référence
  exacte d'un `LeasePayment` non rapproché à ±7j, la ligne a
  `match_status=suggested` et `match_confidence >= 95`
- [ ] AC3 — confirmer un appariement met à jour
  `bank_reconciled_at` + `bank_statement_line_id` sur le payment cible ;
  un test policy vérifie qu'un agent simple ne peut pas confirmer
- [ ] AC4 — tenter de confirmer un appariement cross-agence → 403
- [ ] AC5 — tenter d'apparier une ligne EUR à un payment XOF → 422
- [ ] AC6 — réimporter le même fichier (même hash) sur la même agence
  → 422 "Relevé déjà importé"
- [ ] AC7 — ignorer une ligne la sort des suggestions et ne consomme
  pas de payment ; le compteur global "lignes restantes" décrémente
- [ ] AC8 — finaliser un relevé verrouille toutes ses lignes
  (DELETE match → 422 "relevé clôturé")
- [ ] AC9 — un payment ne peut être rapproché qu'une seule fois (test
  d'unicité base via index)
- [ ] AC10 — un fichier OFX standard de 200 lignes s'importe et matche
  en < 30 s en local
- [ ] AC11 — chaque action (import, match, unmatch, ignore, finalize)
  produit un ActivityLog
- [ ] AC12 — l'UI affiche le ratio "X / Y rapprochées" et un état clair
  pour chaque ligne (suggérée / confirmée / ignorée / non matchée)

## Hors périmètre

- Connexion bancaire directe (PSD2 / Open Banking, ex: Bridge,
  TrueLayer) — V2 ou ticket dédié.
- Génération automatique d'écritures comptables (FEC, journaux) — couvert
  par un autre ticket d'export comptable.
- ML/IA pour scoring d'appariement — V1 reste sur heuristiques
  déterministes.
- Multi-banques agrégées sur un même relevé — un relevé = un compte.
- Rapprochement intercompte (virements internes) — détecté comme
  `ignored` manuellement, pas d'auto-détection en V1.
- Réconciliation des `Payout` (TCK-079) — couvert ailleurs ou ticket
  dédié.
- UI mobile dédiée — desktop-first ; mobile responsive minimum.

## Notes d'implémentation

_(à remplir par implementing-specs)_
