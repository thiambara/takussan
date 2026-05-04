# 03 — Recommandations models-spec.md

> Passe 010 — 2026-05-04 09:18 UTC
> `docs/models-spec.md` est inchangé depuis pass-009 (sha1 `7a7cdd31`).
> Les 7 recommandations R1–R7 issues de pass-009 sont **reportées à l'identique** ci-dessous, faute d'application.

---

## ❌ Gaps critiques (reconduits de pass-009)

### R1 — Ajouter BankStatement

**Modèle à ajouter :** `BankStatement` 🆕 — numéro 40 après les profils polymorphes.

**Justification :** Le modèle `app/Models/BankStatement.php` existe dans le code avec un controller (`Api/Accounting/BankStatementController.php`), une migration, et supporte §1.5 P2 « Rapprochement bancaire semi-automatique ». Il est absent de `models-spec.md`.

**Colonnes à documenter (basées sur le modèle existant) :**

| Colonne | Type | Description |
|---------|------|-------------|
| id | bigint PK | Identifiant |
| agency_id | FK agencies | Agence concernée |
| reference_number | string | Numéro de référence unique |
| source_format | BankStatementSourceFormat enum | Format source (csv, ofx, pdf, manual) |
| status | BankStatementStatus enum | Statut (draft, imported, reconciling, reconciled, disputed) |
| statement_date | date | Date du relevé |
| period_start | date | Début période couverte |
| period_end | date | Fin période couverte |
| opening_balance | decimal(14,2) | Solde d'ouverture |
| closing_balance | decimal(14,2) | Solde de clôture |
| currency | Currency enum | Devise |
| imported_by | FK users | Utilisateur ayant importé |
| imported_at | datetime | Date d'import |
| reconciliated_at | datetime | Date de rapprochement final |
| metadata | json | Données complémentaires |
| deleted_at | datetime | Soft delete |
| created_at | datetime | |
| updated_at | datetime | |

**Relations :**
- `agency()` → belongsTo Agency
- `lines()` → hasMany BankStatementLine
- `importer()` → belongsTo User (via `imported_by`)

**Contrainte :** `reference_number` unique.

### R2 — Ajouter BankStatementLine

**Modèle à ajouter :** `BankStatementLine` 🆕 — numéro 41.

**Justification :** Même situation que BankStatement — existe dans le code, absent de la spec.

**Colonnes à documenter (basées sur le modèle existant) :**

| Colonne | Type | Description |
|---------|------|-------------|
| id | bigint PK | Identifiant |
| bank_statement_id | FK bank_statements | Relevé parent (cascadeOnDelete) |
| transaction_date | date | Date de la transaction |
| value_date | date | Date valeur |
| description | text | Libellé bancaire |
| reference | string | Référence bancaire |
| amount | decimal(14,2) | Montant |
| currency | Currency enum | Devise |
| direction | BankStatementLineDirection enum | Sens (credit, debit) |
| match_status | BankStatementLineMatchStatus enum | Appariement (unmatched, matched, partial, ignored) |
| matched_payment_type | string | Type de paiement apparié (booking_payment, lease_payment) |
| matched_payment_id | bigint | ID du paiement apparié (morph manuel) |
| notes | text | Notes |
| metadata | json | Données complémentaires |
| created_at | datetime | |
| updated_at | datetime | |

**Relations :**
- `bank_statement()` → belongsTo BankStatement
- `matched_payment()` → morphTo manuel (BookingPayment, LeasePayment)

### R3 — Ajouter les enums manquants

| Nom | Valeurs | Utilisé par |
|-----|---------|-------------|
| **BankStatementSourceFormat** 🆕 | csv, ofx, pdf, manual | BankStatement.source_format |
| **BankStatementStatus** 🆕 | draft, imported, reconciling, reconciled, disputed | BankStatement.status |
| **BankStatementLineDirection** 🆕 | credit, debit | BankStatementLine.direction |
| **BankStatementLineMatchStatus** 🆕 | unmatched, matched, partial, ignored | BankStatementLine.match_status |

### R4 — Contraintes d'unicité

| Table | Colonnes | Type |
|-------|----------|------|
| bank_statements | `reference_number` | unique |

### R5 — Index recommandés

| Table | Colonnes | Justification |
|-------|----------|---------------|
| bank_statements | `agency_id`, `status` | Relevés par agence |
| bank_statements | `statement_date` | Tri chronologique |
| bank_statement_lines | `bank_statement_id` | Lignes d'un relevé |
| bank_statement_lines | `match_status` | Lignes non rapprochées |
| bank_statement_lines | `(matched_payment_type, matched_payment_id)` | Recherche du paiement apparié |

### R6 — Documenter le morph manuel

`BankStatementLine.matched_payment_type` + `matched_payment_id` sont un morph manuel (comme `AppNotification.referenceable`). À documenter dans la section « Règles d'invariance » (Règle 3 morph manuel).

### R7 — Conversation.type enum : divergences

L'enum `ConversationType` dans models-spec.md (§Enums) liste `direct, group, booking, lease, property` mais le modèle Conversation documenté (`models-spec.md §18`) n'en liste aucune en clair. Les valeurs dans le code sont `direct`, `group`, `support`. La spec doit être alignée.

**Recommandation :** Vérifier `app/Models/Enums/ConversationType.php` et aligner models-spec.md (soit retirer `booking, lease, property`, soit ajouter `support`, soit les deux).

---

## Résumé des actions (identique à pass-009)

| # | Action | Impact |
|---|--------|--------|
| R1 | Ajouter BankStatement (§40) | Résout le ❌ principal |
| R2 | Ajouter BankStatementLine (§41) | Résout le ❌ secondaire |
| R3 | Ajouter 4 enums | Complétude enums |
| R4 | Contrainte unicité bank_statements.reference_number | Complétude contraintes |
| R5 | Index bank_statements + bank_statement_lines | Complétude index |
| R6 | Documenter le morph manuel BankStatementLine | Complétude règles d'invariance |
| R7 | Aligner ConversationType enum | Cohérence spec ↔ code |

Après application de R1–R7 : **convergence rétablie**, 0 ❌, tous les ⚠️ justifiés.
