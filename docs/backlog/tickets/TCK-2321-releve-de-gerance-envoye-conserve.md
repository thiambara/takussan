---
id: TCK-2321
title: "Le relevé de gérance envoyé est conservé : le mois clos est servi depuis son instantané, les écritures postérieures en rectificatif"
status: done
phase: P1
family: applicatif
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2151]
blocks: []
spec_refs:
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#amendement-du-2026-10-25--le-relevé-envoyé-est-conservé"
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#101-ownerstatementsnapshot-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-177--relevés-de-gérance-dune-période-close-recalculés-à-chaque-lecture"
tags: [api, web, payouts, relevé, migration, pistes]
---

## Objectif utilisateur

Le bailleur relit le relevé de gérance qu'on lui a envoyé, tel qu'il a été envoyé. Ce qui a été
enregistré depuis (un loyer encaissé après coup et daté du mois, par exemple) ne réécrit pas ce
relevé en silence : il vient à part, en rectificatif daté.

## Contexte

Réf : **P177.05** du fichier de pistes. La règle est écrite dans ADR-0039, amendement du
2026-10-25. Mesuré par la piste : relevé de septembre lu le 2 octobre `gross 220000` ; le
20 novembre, le loyer de septembre marqué payé au 15 septembre → le même relevé rend
`gross 420000`, sans avis ni trace de ce qui avait été montré.

## Décision du porteur

> validation du porteur (2026-10-25) : une table neuve `owner_statement_snapshots` (agence, bailleur, période, `payload`, `sent_at`), écrite par `SendOwnerStatements` ; la période close est servie depuis l'instantané, les écritures postérieures montrées en rectificatif

## Hypothèses (prises sans humain, les plus conservatrices)

- **L'instantané naît avec l'avis**, dans la boucle de `SendOwnerStatements`, après la garde
  d'idempotence du cache : un relevé dont l'avis n'est pas envoyé n'a pas d'instantané. Un mois
  qui en a déjà un le garde (unique, `insertOrIgnore`) : une relance après un cache vidé renvoie
  l'avis, comme avant, mais pas un second instantané.
- **Les relevés déjà envoyés n'ont pas d'instantané** : le mois clos est alors le calcul du jour,
  comme aujourd'hui. La commande n'écrit d'instantané qu'en envoyant un avis : aucun n'est fabriqué
  après coup, ni par une migration ni par une lecture.
- **L'attestation annuelle (`YYYY`) reste le calcul du jour** : la commande ne l'envoie pas.
- **Le nom du bailleur n'est pas figé** : l'instantané le retire, et la lecture remet l'identité du
  jour (agence et bailleur). Un bailleur effacé est anonymisé (TCK-2015) : un nom figé l'aurait
  gardé.
- **Le rectificatif** : `rectification` rend le calcul du jour (`as_of`, `totals`), l'écart de chaque
  total (`delta`, seuls les totaux qui bougent), et les lignes apparues (`lines.added`) ou disparues
  (`lines.removed`) par ensemble (`lease_payments`, `booking_payments`, `late_fees`,
  `service_provider_bills`, `clawbacks`). Une ligne dont un montant a changé figure aux deux. Les
  reversements listés ne sont pas comparés ligne à ligne : leur effet se lit à `delta.paid_out`.
  Nul quand rien n'a changé.
- **Aucun avis neuf** quand un rectificatif apparaît : la décision ne le demande pas.
- **Pas de modèle Eloquent** : la table se lit par le constructeur de requêtes, comme
  `payout_clawbacks` ; `models-spec.md` la décrit (§ 101).

## Delta livré

- [x] Migration additive `2026_10_25_100000_create_owner_statement_snapshots_table`, unique
      `(agency_id, landlord_id, period)`, `down()` qui supprime la table.
- [x] `OwnerStatementSnapshots::record()` (écrit par `SendOwnerStatements`) et `served()` (lu par
      `OwnerStatementController` pour le JSON, le PDF et le CSV).
- [x] PDF : « Relevé envoyé le … », et une section « Rectificatif au … » (écarts, lignes ajoutées ou
      retirées). CSV : lignes `sent_at`, `rectification_added:<ensemble>`,
      `rectification_removed:<ensemble>`, `rectification_net`.
- [x] Front (`OwnerStatementPanel`) : la date d'envoi, et l'écart des totaux en rectificatif.
- [x] ADR-0039, amendement du 2026-10-25 ; `docs/adr/README.md` ; `models-spec.md` § 101 ;
      `features.md` (le relevé envoyé est conservé).

## Tests

- `tests/Feature/Api/OwnerStatementSnapshotTest.php` (3) : le scénario mesuré (instantané écrit le
  1er octobre sans le nom du bailleur, servi sans rectificatif, puis le 20 novembre servi à
  220 000 avec un rectificatif de + 200 000 et la ligne du loyer, au JSON, au PDF et au CSV) ; sans
  instantané, septembre et l'année au jour, aucun instantané écrit ; une relance après un cache
  vidé garde l'instantané envoyé.
- `takussan-web/src/components/payments/__tests__/OwnerStatementPanel.instantane.tck-2321.test.tsx`
  (2) : la date d'envoi et l'écart ; rien sans instantané.

## Notes d'implémentation

- **Ablation**, chacune rétablie → vert 3/3 : instantané non écrit par la commande → 2 rouges ;
  instantané jamais servi → 1 rouge ; rectificatif nul → 1 rouge ; relance qui écrase l'instantané
  → 1 rouge ; nom du bailleur gardé → 1 rouge ; front sans date ni rectificatif → 1 rouge.
- `jsonb` rend `220000.0` en `220000` et réordonne les clés : la comparaison des lignes se fait sur
  une signature aux clés triées et aux nombres ramenés au centime.
