# Index des passes de synchronisation features ↔ models-spec

> Ce fichier liste toutes les passes d'audit croisé entre `docs/features.md` et `docs/models-spec.md`.
> Chaque passe est générée par la commande `/sync-specs` et ne modifie **jamais** les deux fichiers source.

---

## Passes chronologiques

| # | Date | Dossier | Résumé |
|---|------|---------|--------|
| 001 | 2026-04-14 | [`pass-001-2026-04-14-0033`](./pass-001-2026-04-14-0033/00-summary.md) | Première passe — inventaire initial |
| 002 | 2026-04-14 | [`pass-002-2026-04-14-0313`](./pass-002-2026-04-14-0313/00-summary.md) | Vérification de stabilité — fichiers source inchangés depuis pass-001 |
| 003 | 2026-04-14 | [`pass-003-2026-04-14-0613`](./pass-003-2026-04-14-0613/00-summary.md) | Vérification de stabilité #2 — fichiers source toujours inchangés depuis pass-001 |
| 004 | 2026-04-14 | [`pass-004-2026-04-14-0904`](./pass-004-2026-04-14-0904/00-summary.md) | Vérification de stabilité #3 — seuil d'alerte organisationnelle atteint |
| 005 | 2026-04-14 | [`pass-005-2026-04-14-1204`](./pass-005-2026-04-14-1204/00-summary.md) | Vérification de stabilité #4 — alerte non suivie, gel recommandé |
| 006 | 2026-04-14 | [`pass-006-2026-04-14-2047`](./pass-006-2026-04-14-2047/00-summary.md) | **Convergence atteinte** — 42 recommandations appliquées, 0 ❌ |
| 007 | 2026-04-14 | [`pass-007-2026-04-14-2052`](./pass-007-2026-04-14-2052/00-summary.md) | **Convergence confirmée** — 2e passe sans recommandation actionnable |

## Tableau d'évolution

| Passe | Date | Features analysées | Modèles analysés | ✅ | ⚠️ | ❌ | Δ ✅ | Δ ⚠️ | Δ ❌ |
|-------|------|--------------------|------------------|----|----|----|-------|-------|-------|
| 001 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | — | — | — |
| 002 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | 0 | 0 | 0 |
| 003 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | 0 | 0 | 0 |
| 004 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | 0 | 0 | 0 |
| 005 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | 0 | 0 | 0 |
| 006 | 2026-04-14 | ~170 | **33** | **191** | **12** | **0** | **+35** | **−10** | **−9** |
| 007 | 2026-04-14 | ~170 | 33 | 191 | 12 | 0 | 0 | 0 | 0 |

## Statut de convergence

**🎯 Convergence formellement confirmée à la passe 007** (deuxième passe consécutive sans recommandation actionnable).

Les 42 recommandations de la passe 001 (A1–A9, B1–B8, C1–C2, R1–R23) ont été appliquées en une exécution coordonnée sur `features.md`, `models-spec.md` et `features-by-actor.md` (plan `piped-skipping-flute`). Les 12 ⚠️ subsistants sont tous justifiés — applicatifs purs (comparateur, passerelles paiement, rapprochement, campagnes, traduction auto) ou évolutions futures documentées (EF2 commissions, EF5 message_reads, EF9 ExchangeRate).

Aucun ❌, aucun modèle orphelin. Les passes suivantes sont **facultatives** et ne devraient être relancées qu'en cas de modification ultérieure des fichiers source.
