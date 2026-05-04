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
| 008 | 2026-04-14 | [`pass-008-2026-04-14-2102`](./pass-008-2026-04-14-2102/00-summary.md) | Stabilité post-convergence — 3e passe consécutive sans changement |
| 009 | 2026-05-04 | [`pass-009-2026-05-04-0153`](./pass-009-2026-05-04-0153/00-summary.md) | Convergence rompue — profils polymorphes + BankStatement/BankStatementLine absents de la spec |

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
| 008 | 2026-04-14 | ~170 | 33 | 191 | 12 | 0 | 0 | 0 | 0 |
| 009 | 2026-05-04 | **~208** | **39** | **232** | **15** | **2** | **+41** | **+3** | **+2** |

## Statut de convergence

**Convergence rompue à la passe 009** suite aux ajouts post-profils polymorphes (TCK-138→142).

Les 2 ❌ concernent **BankStatement** et **BankStatementLine** — ces modèles existent dans le code (`app/Models/`) avec controllers et migrations, mais sont absents de `models-spec.md`. Les 15 ⚠️ sont tous justifiés (P3/futur, applicatif pur, hors périmètre MVP).

7 recommandations (R1–R7) dans la passe 009 permettront de rétablir la convergence. Une fois appliquées : 0 ❌, 0 ⚠️ non justifiés.
