---
id: TCK-051
title: "FormRequest Base + Validation Patterns"
status: todo
phase: P0
family: back
estimate: S
created: 2026-04-16
updated: 2026-04-16
depends_on: [TCK-048]
blocks: [TCK-034, TCK-020, TCK-026, TCK-027]
spec_refs:
  features: []
  models: []
tags: [back, infrastructure, validation, formrequest, rules]
---

## Objectif utilisateur

Toute entrée utilisateur est validée de manière cohérente via des FormRequests avec règles réutilisables.

## Contrat de données

- `BaseFormRequest` abstraite : `authorize()` par défaut via Policy, `prepareForValidation()` commun
- Règles réutilisables dans `App\Rules\` :
  - `PhoneRule` : format téléphone sénégalais (+221 ou 77/78/76/75/70)
  - `CurrencyRule` : XOF, EUR, USD
  - `DateRangeRule` : date début < date fin
  - `StrongPasswordRule` : min 8, majuscule, minuscule, chiffre, spécial
- `prepareForValidation()` : trim strings, nullify empty strings, cast booleans
- Messages de validation localisés (FR par défaut)

## Direction UX / Artistique

**Ticket backend — pas de Direction UX.**

## Contraintes strictes (métier)

- Toute FormRequest métier hérite de `BaseFormRequest`
- `authorize()` doit toujours être implémenté (jamais `return true` en prod)
- Règles custom testées unitairement
- Messages d'erreur en français

## Delta à produire

- [ ] `App\Http\Requests\BaseFormRequest` abstraite
- [ ] `App\Rules\PhoneRule`, `CurrencyRule`, `DateRangeRule`, `StrongPasswordRule`
- [ ] `prepareForValidation()` dans BaseFormRequest (trim, nullify, cast)
- [ ] Fichiers lang FR pour messages validation custom
- [ ] Tests : `PhoneRuleTest`, `CurrencyRuleTest`, `DateRangeRuleTest`, `StrongPasswordRuleTest`, `BaseFormRequestTest`

## Critères d'acceptation

- [ ] `PhoneRule` accepte +221XXXXXXXXX et 77/78/76/75/70XXXXXX
- [ ] `CurrencyRule` accepte XOF, EUR, USD uniquement
- [ ] `DateRangeRule` rejette date_fin < date_début
- [ ] `StrongPasswordRule` exige min 8 + majuscule + minuscule + chiffre + spécial
- [ ] `BaseFormRequest` trim les strings et nullify les empty strings

## Hors périmètre

- FormRequests métier spécifiques (→ tickets domaine)
