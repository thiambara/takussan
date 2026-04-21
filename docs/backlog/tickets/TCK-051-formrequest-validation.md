---
id: TCK-051
title: "FormRequest Base + Validation Patterns"
status: review
phase: P0
family: back
estimate: S
created: 2026-04-16
updated: 2026-04-21
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

- [x] `App\Http\Requests\BaseFormRequest` abstraite (`authorize()` fail-safe + `prepareForValidation()` récursif).
- [x] `App\Rules\PhoneRule`, `CurrencyRule`, `DateRangeRule`, `StrongPasswordRule`.
- [x] `prepareForValidation()` dans BaseFormRequest (trim récursif, nullify empty strings, descente dans les arrays).
- [x] `lang/fr/validation.php` avec messages custom localisés.
- [x] Tests : `PhoneRuleTest`, `CurrencyRuleTest`, `DateRangeRuleTest`, `StrongPasswordRuleTest`, `BaseFormRequestTest`.

## Critères d'acceptation

- [x] `PhoneRule` accepte `+221XXXXXXXXX`, `00221XXXXXXXXX`, et `7[0|5|6|7|8]XXXXXXX` local (avec ou sans espaces).
- [x] `CurrencyRule` accepte `XOF`, `EUR`, `USD` (case-insensitive) uniquement.
- [x] `DateRangeRule` rejette `date_fin < date_début` (passe si l'une des deux est absente — à combiner avec `required` si strict).
- [x] `StrongPasswordRule` exige min 8 + majuscule + minuscule + chiffre + caractère spécial.
- [x] `BaseFormRequest` trim les strings, nullify les empty strings, descente récursive dans les arrays imbriqués.
- [x] `BaseFormRequest::authorize()` défaut `false` — chaque FormRequest métier doit opter explicitement.

## Hors périmètre

- FormRequests métier spécifiques (→ tickets domaine).
- Migration des FormRequests existants (`Auth\LoginRequest`, `RegisterRequest`, etc.) vers `BaseFormRequest` — adoption au fil de l'eau.

## Notes d'implémentation

- **`authorize()` défaut = `false`** (fail-safe) : préfère un 403 explicite à un `return true` oublié en prod. Les routes publiques (login, register) doivent override à `true`.
- **`prepareForValidation()` descend dans les arrays** : nécessaire pour les payloads imbriqués (ex. `profile.bio`) — sinon les champs nested gardent leurs `"  "` non trimmés.
- **Rules non-implicites** : mes rules ne tournent PAS sur valeurs empty/null — Laravel les court-circuite. Usage attendu : `['required', 'string', new PhoneRule]` ou `['nullable', 'string', new PhoneRule]`. Les tests unitaires ciblent donc uniquement des strings non-vides.
- **`DateRangeRule`** utilise `DataAwareRule` pour accéder au champ "début" via son nom (paramètre du constructeur) — évite de figer une convention `start_date`/`end_date`.
