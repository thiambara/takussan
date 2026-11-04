---
id: TCK-1815
title: "La création d'un garant n'écrit plus `metadata`"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#27-guarantor-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-181--tableaux-sans-borne-rangés-en-jsonb-et-relus-en-entier"
tags: [back, validation, guarantor, pistes]
---

## Contexte

Réf : **P181.07** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

**Décision du porteur (déléguée)** : validé (délégué) — retirer `metadata` des règles de `StoreGuarantorRequest` (aucun lecteur ni émetteur, comme `UpdateGuarantorRequest`), la colonne et le modèle restant inchangés ; garde : un test qui envoie `metadata` au `POST /api/guarantors` et constate qu’il n’est pas écrit ; reste : fermer `metadata` des intégrations sur les clés lues, et poser un `max:` à `segment.roles` et `segment.agency_ids`

`POST /api/guarantors` acceptait `metadata` (`nullable|array`, sans borne) et l'écrivait par
`Guarantor::create($data)` ; rien ne le lit ni ne le rend, ni l'API ni le front, et la modification
ne l'accepte pas.

## Reste à faire

fermer `metadata` des intégrations sur les clés lues, et poser un `max:` à `segment.roles` et `segment.agency_ids`

## Delta à produire

- [x] `StoreGuarantorRequest::rules()` : retrait de la règle `metadata`. La colonne, le `fillable`
      et le cast de `Guarantor` restent.
- [x] `GuarantorTest::test_create_does_not_write_metadata` : `metadata` envoyé → 201, colonne nulle.

## Critères d'acceptation

- [x] AC1 — Un `POST /api/guarantors` portant `metadata` rend 201 et la ligne a `metadata` nul.

## Hors périmètre

- Le reste ci-dessus (intégrations, annonces), gardé par le porteur.
- Les deux autres requêtes qui écrivent un garant (modification, ajout d'un garant neuf à un bail)
  n'acceptent pas `metadata` (lu : `grep metadata` sur les porteurs de `BorneLesChampsDuGarant`).

## Notes d'implémentation

- Ablation : la règle remise, le test neuf rougit (`metadata` écrit) ; retirée, `GuarantorTest`
  10/10 et `GuarantorFieldLengthTest` 3/3.
- `validated()` ne rend que les clés qui ont une règle : le retrait suffit, sans toucher au
  contrôleur.
