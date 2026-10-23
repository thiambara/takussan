---
id: TCK-1919
title: "Une ligne de relevé déjà importée par un autre relevé est marquée, et confirmer une ligne retire la suggestion des autres sur le même paiement"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-157--lignes-de-relevé-importées-face-au-rapprochement"
tags: [back, front, rapprochement, migration, pistes]
---

## Contexte

Réf : **P157.06** du fichier de pistes, `validé` par le porteur (critère V7 accordé ; la migration
additive est nommée dans la décision).

Deux relevés qui se chevauchent donnaient deux lignes `suggested` sur le même paiement. Après la
confirmation de la première, la seconde restait « suggérée » sur un paiement rapproché ailleurs, et
sa confirmation rendait 422 « This payment is already reconciled to another line. ». Rien ne
signalait que la seconde ligne reprenait une transaction déjà importée.

## Décision du porteur

validé — validation du porteur (2026-10-23) : marquer, ne pas sauter : migration additive `bank_statement_lines.duplicate_of_line_id` (nullable) et badge ; à la confirmation d'une ligne, les autres lignes suggérées sur le même paiement repassent `unmatched`

## Contrat de données

- Migration neuve : `bank_statement_lines.duplicate_of_line_id`, `foreignId` nullable vers
  `bank_statement_lines`, `nullOnDelete`, indexée ; `down()` la retire. Aucune ligne existante
  n'est réécrite.
- À l'analyse (`ParseBankStatementJob`, dans la transaction), une ligne du relevé dont la
  `reference`, `posted_at`, `amount` et `direction` égalent ceux d'une ligne d'un **autre** relevé
  de la **même agence** reçoit l'`id` de la plus ancienne. La ligne reste dans le relevé et reste
  rapprochable.
- Hypothèse : une ligne sans référence n'est jamais marquée (deux virements du même montant le même
  jour sont plausibles, rien ne les distingue). La devise n'entre pas dans la comparaison : la
  décision nomme quatre champs.
- `BankStatementLineResource` rend `duplicate_of_line_id` ; la colonne entre dans `$queryFields`
  et dans `BANK_LINE_FIELDS` côté front.
- `ReconciliationManager::confirmMatch()` : dans la transaction, les autres lignes `suggested` sur
  le même paiement (type et id) repassent `unmatched`, sans paiement ni confiance.
- Front : badge `admin.reconciliation.detail.duplicate` (ton « attention ») sur la ligne marquée.
  Le `wo` reprend le français (wolof en pause).

## Delta à produire

- [x] Migration `2026_10_23_223500_add_duplicate_of_line_id_to_bank_statement_lines`.
- [x] `BankStatementLine` (`fillable`, `$queryFields`), `BankStatementLineResource`.
- [x] `ParseBankStatementJob::marquerLesDoublons`.
- [x] `ReconciliationManager::confirmMatch` : retrait des suggestions concurrentes.
- [x] Front : type, champ, badge, trois clés i18n.

## Critères d'acceptation

- [x] AC1 — relevé 1 `F1` 150 000 au 01/04 ; relevé 2 avec la même ligne → marquée vers la ligne
  du relevé 1, gardée ; une autre ligne et un débit de même référence mais d'autre date ne sont
  pas marqués ; une ligne identique d'une autre agence n'est pas désignée.
- [x] AC2 — les deux lignes suggérées sur la même échéance ; confirmer la première → la seconde
  `unmatched`, sans paiement ni confiance.
- [x] AC3 — `GET …/lines?fields[bank_statement_lines]=…,duplicate_of_line_id` rend la marque.
- [x] AC4 — l'écran du relevé montre le badge sur la seule ligne marquée.

## Hors périmètre

- La ligne de `docs/models-spec.md` sur la colonne neuve : spec fermée à l'implémenteur, à écrire
  en session.
- Les lignes déjà importées avant ce ticket ne sont pas marquées rétroactivement.

## Notes d'implémentation

- La marque se pose en une seule requête `UPDATE … SET duplicate_of_line_id = (SELECT min(o.id) …)`
  bornée par `whereExists`, servie par l'index `(posted_at, amount)` ; `LargeBankStatementParseTest`
  reste vert.
- Ablation : appel de `marquerLesDoublons` retiré → AC1 rouge ; retrait des suggestions neutralisé
  (`whereRaw('false')`) → AC2 rouge ; badge retiré → test front rouge. Remis → verts.
