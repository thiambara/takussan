# Recommandations — `docs/models-spec.md` (Passe 004)

> Cette passe ne formule **aucune nouvelle recommandation** sur `models-spec.md`. Le fichier source n'a pas été modifié depuis la passe 001 (commit `57bd3ed`), et toutes les recommandations émises en passe 001 restent strictement actionnables. C'est la **troisième passe consécutive** sans aucune évolution côté source.

---

## Statut des recommandations héritées de la passe 001

### Nouveaux modèles à créer

| Réf. | Modèle | Motivation (feature) | Statut |
|------|--------|----------------------|--------|
| R1 | `PropertyAvailability` (bloquage manuel de créneaux) | §1.3 P1 | ⏳ non appliquée |
| R2 | `LeaseAmendment` (option A) **ou** `Lease.parent_lease_id` (option B) | §1.4 P2 | ⏳ arbitrage A/B pendant |
| R5 | **`DocumentShareLink`** (token + expiration) | §1.10 P1 ❌ | ⏳ **BLOQUANT** |
| R6 | **`Task` / `Reminder`** (morphTo) | §1.6 P2 ❌ | ⏳ **BLOQUANT** |
| R8 | `BankTransaction` + rapprochement (option A) ou repousser (option B) | §1.5 P2 | ⏳ arbitrage A/B pendant |
| R9 | `AgentAvailability` / `AgentLeave` (option A) ou repousser (option B) | §1.12 P2 | ⏳ arbitrage A/B pendant |
| R11 | `EmailTemplate` / `NotificationTemplate` | §2.3, §2.9 | ⏳ non appliquée |
| R14 | `PermissionDelegation` (si maintenu P2) | §2.2 P2 | ⏳ non appliquée |
| R15 | **`Setting`** (clé / valeur typée, scope) | §2.9 P2 ❌ | ⏳ **BLOQUANT** |
| R16 | **`Integration`** (fournisseur, credentials chiffrés) | §2.9 P2 ❌ | ⏳ **BLOQUANT** |
| R17 | `PropertyViewLog` (option A) pour historique consulté | §1.2 P2 | ⏳ non appliquée |
| R21 | `MaintenanceQuote` (option A) ou `estimated_cost` étendu (option B) | §1.8 P2 | ⏳ arbitrage A/B pendant |

### Extensions de modèles existants

| Réf. | Cible | Ajout proposé | Statut |
|------|-------|---------------|--------|
| R3 | `PropertyCollaborator` | colonne `commission_share` (decimal) | ⏳ non appliquée |
| R4 | `PropertyVisit` | `VisitType.self_guided/hybrid`, `duration_minutes`, `agent_id` | ⏳ non appliquée |
| R7 | `Customer` | `pipeline_stage` (option A) ou `CustomerStatus` étendu (option B) | ⏳ **BLOQUANT** — arbitrage |
| R10 | `LeasePayment` | exposer `late_fee` explicitement (convention + index) | ⏳ arbitrage pendant |
| R12 | `Review` | `reply_content`, `replied_by_id`, `replied_at` | ⏳ non appliquée |
| R13 | `UserCustomerRelationship` | `is_primary` + contrainte d'unicité par customer | ⏳ non appliquée |
| R19 | `Agency` | `parent_agency_id` (option A) ou modèle `Branch` (option B) | ⏳ arbitrage A/B pendant |

### Extensions d'enums

| Réf. | Enum | Ajout | Statut |
|------|------|-------|--------|
| R18 | `ConversationType` | `support` | ⏳ non appliquée |

### Clarifications / configuration

| Réf. | Sujet | Statut |
|------|-------|--------|
| R20 | Politique de conservation RGPD (suppression douce vs purge) | ⏳ non appliquée |
| R22 | Index manquants sur `Booking(property_id, start_date)` et `LeasePayment(lease_id, due_date)` | ⏳ non appliquée |
| R23 | Documenter `onDelete` FK pour cascades critiques (Property, Lease, User) | ⏳ non appliquée |

---

## Total recommandations `models-spec.md`

- **Total :** 23 (12 nouveaux modèles + 7 extensions + 1 extension enum + 3 clarifications)
- **Résolues depuis passe 001 :** 0
- **Restantes :** 23
- **Dont bloquants MVP (❌ ou arbitrage critique) :** R5, R6, R7, R15, R16

Aucune nouvelle recommandation n'est introduite par la passe 004. Se reporter à [`pass-001-2026-04-14-0033/03-recommendations-models-spec.md`](../pass-001-2026-04-14-0033/03-recommendations-models-spec.md) pour le texte intégral des propositions.

## Séquence d'application recommandée

Pour maximiser la résorption des ❌ lors de la passe 005 :

1. **Sprint bloquants** : R5, R6 (ou R7), R15, R16 — supprime 4 à 5 ❌ d'un coup.
2. **Sprint arbitrages A/B** : trancher R2, R8, R9, R19, R21 puis implémenter l'option retenue.
3. **Sprint extensions latentes** : R3, R4, R10, R12, R13, R18 — réduit les ⚠️ sans changer la structure.
4. **Sprint hygiène** : R22, R23 (index et FK) — faible risque, impact qualité élevé.
5. **Sprint optionnel** : R1, R11, R14, R17, R20 — selon arbitrage produit sur les P2/P3.

## Note organisationnelle

Si aucun changement n'est appliqué avant la passe 005, il est recommandé de **surseoir** à l'exécution de `/sync-specs` jusqu'à ce qu'au moins une recommandation bloquante soit traitée. Les passes d'audit sans évolution source ne produisent plus d'information exploitable.
