# Matrice de corrélation — Passe 004

Légende : ✅ pleinement supporté · ⚠️ partiellement supporté ou capacité latente · ❌ non supporté.

> **Note de stabilité :** ni `docs/features.md` ni `docs/models-spec.md` n'ont été modifiés depuis la passe 001 (commit `57bd3ed`). La matrice est donc identique à celles des passes 001, 002 et 003. Pour éviter la duplication de 250+ lignes inchangées, la passe 004 renvoie à la matrice de référence de la passe 003 : [`pass-003-2026-04-14-0613/01-correlation-matrix.md`](../pass-003-2026-04-14-0613/01-correlation-matrix.md).

---

## 1. Confirmation de non-évolution

Vérification automatique effectuée au début de la passe 004 :

- `git log -1 docs/features.md` → `57bd3ed` (identique passes 001–003)
- `git log -1 docs/models-spec.md` → `57bd3ed` (identique passes 001–003)
- `wc -l docs/features.md` → 399 lignes (identique)
- `wc -l docs/models-spec.md` → 1511 lignes (identique)

Aucune ligne ajoutée, retirée ou modifiée depuis trois passes.

## 2. Compteurs récapitulatifs (inchangés)

| Axe | ✅ | ⚠️ | ❌ |
|-----|----|----|----|
| Features → Modèles | 128 | 22 | 9 |
| Modèles → Features | 28 | 0 | 0 |
| **Total** | **156** | **22** | **9** |

Δ vs passe 003 : 0 / 0 / 0.
Δ vs passe 002 : 0 / 0 / 0.
Δ vs passe 001 : 0 / 0 / 0.

## 3. Inventaire des ⚠️ et ❌ restants

Les 22 ⚠️ et 9 ❌ sont strictement ceux listés dans la matrice de la passe 003. Aucun item n'a été ajouté ni retiré. Les statuts détaillés par section (§1.1 à §2.9) sont consultables dans le document de référence linké ci-dessus.

**Répartition des 9 ❌ (rappel) :**

1. `features.md §1.2 P2` — Historique des biens consultés (aucun modèle serveur).
2. `features.md §1.6 P2` — Pipeline de prospects CRM (`CustomerStatus` insuffisant).
3. `features.md §1.6 P2` — Tâches et rappels (aucun modèle `Task`).
4. `features.md §1.10 P1` — Partage sécurisé par lien temporaire (aucun modèle).
5. `features.md §1.12 P2` — Congés / dispo agents (aucun modèle).
6. `features.md §2.2 P2` — Délégation temporaire de permissions (aucun modèle).
7. `features.md §2.9 P2` — Paramètres globaux (aucun modèle `Setting`).
8. `features.md §2.9 P2` — Intégrations tierces (aucun modèle `Integration`).
9. `features.md §1.8 P3` — Contrats récurrents maintenance (P3, reporté).

**Répartition des 22 ⚠️ :** cf. matrice passe 003, sections §1.1 à §2.9.

## 4. Bilan modèles → features

Tous les 28 modèles restent rattachés à au moins une feature. Aucun orphelin. Les capacités latentes signalées lors de la passe 001 restent les mêmes :

- `Property.parent_id`, `reference_number`, `title_type`, `admin_monitored` — latents.
- `PropertyCollaborator.commission_share` — non modélisé.
- `UserCustomerRelationship.is_primary` — non évoqué.
- `Review.reported_count` — non exploité côté features.
- `LeasePayment.late_fee` — non évoqué.
- `PropertyVisit.VisitType.self_guided/hybrid`, `duration_minutes` — non évoqués.
- `ConversationType.support` — non évoqué.
- `Inventory.general_condition` — non évoqué.

Aucun changement depuis la passe 001.
