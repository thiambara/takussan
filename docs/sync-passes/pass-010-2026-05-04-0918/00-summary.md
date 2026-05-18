# Passe 010 — Stabilité post-pass-009 (recommandations R1–R7 non appliquées)

- **Date :** 2026-05-04 09:18 UTC
- **Branche :** `dev`
- **Passe précédente :** [`pass-009-2026-05-04-0153`](../pass-009-2026-05-04-0153/00-summary.md)

## Delta source depuis pass-009

**Aucun.** Les deux fichiers source sont strictement identiques à pass-009 :

- `docs/features.md` — sha1 `b6902e37` (inchangé)
- `docs/models-spec.md` — sha1 `7a7cdd31` (inchangé)

Aucun commit touchant ces fichiers depuis pass-009 (vérifié via `git log -- docs/features.md docs/models-spec.md` ; dernier commit pertinent : `c852fb5 chore(sync-specs): pass 009`).

## Compteurs

| Axe | ✅ | ⚠️ | ❌ |
|-----|----|----|----|
| Features → Modèles | 193 | 15 | 0 |
| Modèles → Features | 39 | 0 | 2 |
| **Total** | **232** | **15** | **2** |

**Δ vs passe 009 :** 0 / 0 / 0 — aucun changement.

## Top 5 points critiques (inchangés)

1. **❌ BankStatement absent de models-spec.md** — modèle existant dans le code (`app/Models/BankStatement.php` + controller + migration), supportant §1.5 P2 « Rapprochement bancaire semi-automatique ». Cf. R1 de pass-009.
2. **❌ BankStatementLine absent de models-spec.md** — même situation. Cf. R2 de pass-009.
3. **⚠️ §1.5 P2 « Passerelle de paiement »** — `Integration` existe, intégrations réelles (Wave/OM/Stripe) partielles.
4. **⚠️ §2.5 « Reporting & tableaux de bord »** — applicatif pur (pas de modèle dédié).
5. **⚠️ §1.3 P3 « Annulation avec remboursement automatisé »** — `BookingPayment.refund_amount` existe, workflow non implémenté.

## Statut de convergence

**Toujours rompu** — les 2 ❌ persistent. La passe 010 reproduit à l'identique les recommandations R1–R7 de la passe 009 (cf. `03-recommendations-models-spec.md`) sans changement de fond.

Les 15 ⚠️ restent tous justifiés (P3 / applicatif pur / hors périmètre MVP).

## Recommandations non appliquées de la passe précédente

**Toutes les 7 recommandations R1–R7 de pass-009 sont non appliquées.**

| ID | Action | Statut |
|----|--------|--------|
| R1 | Ajouter `BankStatement` (§40) à models-spec.md | ⏳ non appliqué |
| R2 | Ajouter `BankStatementLine` (§41) à models-spec.md | ⏳ non appliqué |
| R3 | Ajouter 4 enums (BankStatementSourceFormat, BankStatementStatus, BankStatementLineDirection, BankStatementLineMatchStatus) | ⏳ non appliqué |
| R4 | Contrainte unicité `bank_statements.reference_number` | ⏳ non appliqué |
| R5 | Index `bank_statements` + `bank_statement_lines` | ⏳ non appliqué |
| R6 | Documenter le morph manuel `BankStatementLine.matched_payment_*` | ⏳ non appliqué |
| R7 | Aligner `ConversationType` enum (spec ↔ code) | ⏳ non appliqué |

## Note organisationnelle

Pass-010 est la **première passe de stabilité** depuis la rupture de convergence en pass-009. Si une passe 011 ultérieure constate à nouveau un delta source nul et R1–R7 toujours non appliquées, recommander un gel des passes automatiques jusqu'à action humaine — comme cela avait été fait entre pass-004 et pass-006.
