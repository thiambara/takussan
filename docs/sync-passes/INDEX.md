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

## Tableau d'évolution

| Passe | Date | Features analysées | Modèles analysés | ✅ | ⚠️ | ❌ | Δ ✅ | Δ ⚠️ | Δ ❌ |
|-------|------|--------------------|------------------|----|----|----|-------|-------|-------|
| 001 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | — | — | — |
| 002 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | 0 | 0 | 0 |
| 003 | 2026-04-14 | ~170 | 28 | 156 | 22 | 9 | 0 | 0 | 0 |

## Statut de convergence

**Non atteinte** — 22 ⚠️ et 9 ❌ encore actionnables à l'issue de la passe 003 (identique à pass-001 et pass-002, aucun fichier source modifié depuis trois passes). Les 19 recommandations sur `features.md` (A1–A9, B1–B8, C1–C2) et 23 recommandations sur `models-spec.md` (R1–R23) issues de la pass-001 restent à arbitrer puis appliquer manuellement.

**Alerte organisationnelle :** deux passes de vérification consécutives (002 et 003) sans aucune évolution des fichiers source. Si la pass-004 constate à nouveau zéro évolution, prioriser l'arbitrage humain des recommandations bloquantes (R5, R6, R7, R15, R16) avant toute nouvelle exécution de `/sync-specs`.
