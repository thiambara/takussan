---
id: TCK-1347
title: "Fiche client en édition : e-mail, téléphone, profession et type de pièce vidés partent à `null`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-149--champs-vidés-dun-patch-partiel-lus-comme--garder-"
tags: [web, crm, pistes]
---

## Contexte

Réf : **P149.02** du fichier de pistes, `validé` (V3 accordé).

`normaliseCustomerForm` rendait `undefined` pour `email`, `phone`, `occupation` vides et pour un
`id_type` vide ; `apiRequest` laisse tomber les `undefined`, et `CustomerService::update` ne
remplit que les clés reçues : vider l'un de ces champs en édition ne l'effaçait pas.

## Décision du porteur

> porteur (2026-10-22) : en édition, un champ modifié et laissé vide envoie `null` (`email`, `phone`, `occupation`, `id_type`) ; `id_number` omis tant qu'il n'est pas touché

## Delta à produire

- [x] `normaliseCustomerForm(values, initial?)` : avec `initial` (les valeurs de la fiche), un des
      quatre champs vide alors qu'il avait une valeur → `null` ; déjà vide → omis, comme avant.
- [x] `CustomerForm` passe `toDefaults(customer)` en édition ; la création n'en passe pas.
- [x] `CustomerFormPayload` : les quatre clés admettent `null`.

## Critères d'acceptation

- [x] AC1 — Édition, `email`, `phone`, `occupation`, `id_type` vidés → `null` ; `id_number` omis.
- [x] AC2 — Un champ déjà vide et laissé vide n'est pas envoyé ; en création, rien ne change.
- [x] AC3 — Dans le formulaire d'édition, vider l'e-mail et la profession → corps `email: null`,
      `occupation: null`, téléphone gardé.

## Hypothèses

- « Modifié » se lit par rapport à la valeur de la fiche à l'ouverture du formulaire : un champ
  qui avait une valeur et qui est vide à l'envoi.
- L'API accepte déjà `null` sur ces quatre clés (`UpdateCustomerRequest`, `sometimes|nullable`) :
  aucun changement côté API. Vider à la fois l'e-mail et le téléphone reste refusé par le
  formulaire (`customer.emailOrPhone`).

## Notes d'implémentation

- Piège : `not.toHaveProperty` échoue sur une clé présente à `undefined` ; les tests lisent la
  valeur (`toBeUndefined`), ce que JSON envoie réellement.
- Ablation : `efface()` rendu `undefined` → 2 rouges (normaliseur, formulaire) ; remis → verts.
