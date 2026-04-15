---
id: TCK-011
title: Traduction automatique des contenus
status: blocked
phase: P3
family: applicatif
estimate: M
created: 2026-04-15
updated: 2026-04-15
depends_on: [TCK-017]
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#11-review
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#30-setting-
    - docs/models-spec.md#31-integration-
tags: [back, i18n, cache]
---

## Contexte

Issu du warning `features.md §2.8 P3` (ligne 384), justifié en passe 006 comme
applicatif (service externe). **Bloqué** sur décision produit : provider.
Recommandation technique: combo DeepL (FR/EN) + Google Translate (WO bêta).

## Objectif

Traduire automatiquement les contenus utilisateurs (descriptions de biens,
avis, messages) entre FR / EN / WO avec cache Redis pour éviter les appels
répétés.

## Delta à produire

- [ ] Trait `HasAutoTranslation` sur `Property`, `Review`, `Message`
- [ ] Service `TranslationService` (DeepL / Google)
- [ ] Cache Redis clé `translate:{source_hash}:{target_locale}` (TTL 30 j)
- [ ] Invalidation automatique sur `updated` du modèle source
- [ ] `Setting` `i18n.auto_translate_enabled` par agence
- [ ] Champ additionnel `translations: { en, wo }` dans les réponses API selon `Accept-Language`
- [ ] Config provider dans `Integration`

## Critères d'acceptation

- [ ] Une `Property.description` en FR retourne une version EN via le cache au 2ᵉ appel
- [ ] Un `Property.update` invalide l'entrée cache correspondante
- [ ] Une agence avec `auto_translate_enabled = false` ne déclenche aucun appel provider
- [ ] Les appels provider sont journalisés (quota tracking)

## Hors périmètre

- Post-édition humaine
- Traduction des `lang/` Laravel (manuel)

## Notes d'implémentation

_(à remplir par spec-coder)_
