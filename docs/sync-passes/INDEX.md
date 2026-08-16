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
| 010 | 2026-05-04 | [`pass-010-2026-05-04-0918`](./pass-010-2026-05-04-0918/00-summary.md) | Stabilité post-009 — sources inchangées, R1–R7 toujours non appliquées *(vrai le 2026-05-04, périmé depuis — cf. la re-mesure du 2026-08-16 plus bas)* |

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
| 010 | 2026-05-04 | ~208 | 39 | 232 | 15 | 2 | 0 | 0 | 0 |

## Statut de convergence

> ⚠️ **Ce bloc a menti pendant plus de trois mois, et il faut d'abord dire en quoi.** Il annonçait
> « **R1–R7 toujours non appliquées** » — état figé au 2026-05-04, jamais rouvert. **Re-mesuré le
> 2026-08-16 (TCK-310) : six des sept l'étaient déjà, dont les deux ❌ qui motivaient à elles seules
> la rupture de convergence.** Un lecteur qui prenait cette ligne pour argent comptant refaisait un
> travail livré depuis trois mois, ou classait la spec bien plus fausse qu'elle ne l'était.
>
> *Un statut daté d'une passe et jamais re-mesuré n'est pas un statut : c'est un souvenir.* La
> passe 010 était honnête **le jour où elle a été écrite** ; c'est de l'avoir laissée parler au
> présent qui a coûté.

### Re-mesure du 2026-08-16 (TCK-310)

**Portée, dite explicitement : ce n'est PAS une passe 011.** Aucune nouvelle matrice de corrélation
n'a été produite ; les compteurs ✅/⚠️/❌ du tableau ci-dessus s'arrêtent donc à la passe 010, et il
serait faux d'en publier de nouveaux sans avoir refait l'analyse croisée. Ce qui a été re-mesuré,
c'est **le sort des sept recommandations R1–R7**, une par une, contre le code et contre
`models-spec.md`.

| ID | Action de pass-009 | État mesuré le 2026-08-16 |
|----|--------------------|---------------------------|
| R1 | Ajouter `BankStatement` (§40) | ✅ **appliqué** — `models-spec.md` §40 |
| R2 | Ajouter `BankStatementLine` (§41) | ✅ **appliqué** — `models-spec.md` §41 |
| R3 | Ajouter les 4 enums bancaires | ✅ **appliqué**, et avec les **vraies** valeurs du code — pass-009 les avait *déduites* (`pdf`, `manual`, `draft`, `imported`, `matched`, `partial`…) ; aucune de ces valeurs n'existe dans `app/Models/Enums/` |
| R4 | Unicité `bank_statements.reference_number` | ⛔ **sans objet** — la colonne `reference_number` **n'existe pas** sur `bank_statements`. La recommandation portait sur un schéma déduit du nom du modèle. L'unicité réelle est `(agency_id, file_hash)`, et elle est documentée |
| R5 | Index `bank_statements` + `bank_statement_lines` | ✅ **appliqué** — les cinq index documentés correspondent à ceux des migrations `2026_04_28_000001` / `000002` |
| R6 | Documenter le morph `matched_payment_*` | ✅ **appliqué** — §41. La *justification* de R6 était fausse : ce morph est un `morphTo()` **standard**, pas le morph manuel d'`AppNotification` ; il ne relève donc pas de la Règle 3 |
| R7 | Aligner l'enum `ConversationType` | ✅ **appliqué le 2026-08-16** — c'était la **seule** recommandation encore vivante. Le cas `support` manquait dans la spec ; ajouté d'après `app/Models/Enums/ConversationType.php` |

**Ce que cette re-mesure apprend au-delà du décompte :** quatre des sept recommandations décrivaient
un schéma que pass-009 avait **déduit du nom des modèles**, sans lire les migrations —
`reference_number`, `transaction_date`, `statement_date`, et huit valeurs d'enum inventées. Elles ont
été « appliquées » en documentant le schéma réel, qui ne leur ressemble pas. *Une recommandation
produite par déduction se solde en la mesurant, pas en l'exécutant.*

### Ce qui reste ouvert

La rupture de convergence signalée en pass-009 portait sur deux modèles absents. Le **même défaut, à
une autre échelle**, a été mesuré le 2026-08-16 : **seize** modèles de premier niveau sur 62
n'étaient mentionnés nulle part dans `models-spec.md` (dette D-18, TCK-310). Ils y sont désormais,
décrits d'après le code et les migrations.

La garde `scripts/check-models-spec.mjs` (Repo CI) casse désormais le build si un modèle de premier
niveau n'est mentionné nulle part dans `models-spec.md`. **C'est ce qui remplace une passe manuelle
sur cet axe précis** : une divergence de ce type ne peut plus attendre trois mois qu'on relance
`/sync-specs`. Les autres axes — features → modèles, ⚠️ justifiés — restent, eux, du ressort d'une
passe.
