---
id: TCK-017
title: Internationalisation & préférences
status: todo
phase: P0
family: applicatif
estimate: S
created: 2026-04-15
updated: 2026-04-15
depends_on: []
blocks: [TCK-007, TCK-011]
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#1-user
tags: [back, front, i18n, locale, preferences]
---

## Contexte

La plateforme cible le marché sénégalais (FR par défaut) avec support EN et Wolof. Les colonnes `preferred_language` et `timezone` existent déjà sur le modèle User. Ce ticket couvre la mise en place de l'infrastructure i18n et des préférences utilisateur.

## Objectif

Mettre en place le support multilingue (FR, EN, WO), la sélection de langue par utilisateur, et les formats localisés.

## Delta à produire

### P0 — MVP bloquant

- [ ] Fichiers de traduction Laravel : `lang/fr/`, `lang/en/`, `lang/wo/` (messages, validation, pagination)
- [ ] Middleware `SetLocale` basé sur `preferred_language` de l'utilisateur ou header `Accept-Language`
- [ ] Fichiers i18n Next.js : `fr.json`, `en.json`, `wo.json` (labels UI)
- [ ] Sélecteur de langue dans le header (persisté via `preferred_language`)
- [ ] Tests : `LocaleMiddlewareTest`

### P1

- [ ] Fuseau horaire utilisateur appliqué aux réponses API (par défaut `Africa/Dakar`)
- [ ] Format de date et nombre localisé côté React (`Intl.DateTimeFormat`, `Intl.NumberFormat` avec locale dynamique)
- [ ] Tests : `TimezoneFormattingTest`

### P2

- [ ] Devise configurable par agence (XOF par défaut, EUR, USD) dans `Agency.settings`

### P3

- [ ] Conversion multi-devises avec taux de change (→ TCK-007)
- [ ] Traduction automatique des contenus utilisateurs (→ TCK-011)

## Critères d'acceptation

- [ ] L'API répond avec les messages d'erreur dans la langue de l'utilisateur
- [ ] Le sélecteur de langue persiste le choix et recharge les traductions Next.js
- [ ] Les dates sont formatées selon le fuseau horaire de l'utilisateur
- [ ] Le Wolof (wo) est supporté même si les traductions sont partielles

## Hors périmètre

- Conversion multi-devises avec taux de change (→ TCK-007)
- Traduction automatique des contenus (→ TCK-011)

## Notes d'implémentation

_(à remplir par implementing-specs)_
