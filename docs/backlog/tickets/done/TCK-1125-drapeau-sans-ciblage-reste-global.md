---
id: TCK-1125
title: "Un drapeau enregistré depuis la console sans ciblage reste global"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, front, feature-flags, super-admin, pistes]
---

## Contexte

Réf : **P98.01** du fichier de pistes, `retenu · autonome` (A1 : TCK-219 écrit qu'un drapeau
s'active « globalement ou pour un segment », et l'écran affiche « Global » pour ce corps).

Le dialogue « Configurer » envoie toujours `{roles: [], rollout_percentage: 0}` sans ciblage ;
le contrôleur le stocke tel quel, et `FeatureFlagEvaluator::evaluate()` ne tient pour « sans
restriction » que `[]`. Enregistrer `host_auto_space` sans rien toucher l'éteint pour tout le
monde, et `media_watermark`, lu sans utilisateur, ne peut plus s'allumer depuis la console. Le
dialogue n'ayant pas de champ d'agences, il effaçait aussi les `agency_ids` posés autrement.

## Objectif utilisateur

Le super-admin qui active un drapeau sans ciblage l'active pour tous, comme l'écran l'affiche.

## Delta à produire

- [x] `FeatureFlagEvaluator::normalizeSegments()` : des segments sans rôle, sans agence et à 0 %
      valent `[]` ; `evaluate()` l'applique (lignes déjà écrites comprises).
- [x] `FeatureFlagController::update()` stocke les segments normalisés.
- [x] `FeatureFlagSegmentDialog` renvoie les `agency_ids` déjà posés.
- [x] Tests : `FeatureFlagTest` (API), `FeatureFlags.test.tsx` (front).

## Critères d'acceptation

- [x] AC1 — `PATCH /api/admin/feature-flags/host_auto_space` avec le corps du dialogue sans
      ciblage stocke `[]`, et le drapeau est vrai pour un utilisateur quelconque et sans utilisateur.
- [x] AC2 — une ligne déjà écrite `{roles: [], agency_ids: [], rollout_percentage: 0}` s'évalue vraie.
- [x] AC3 — un ciblage par rôle reste un ciblage (stocké tel quel, faux hors du rôle).
- [x] AC4 — enregistrer depuis le dialogue un drapeau qui porte des `agency_ids` les renvoie.

## Hors périmètre

- La colonne « Segments » affiche « Global » pour un ciblage par rôle à 0 % : affichage à part.
- Aucun champ d'agences neuf dans le dialogue.

## Notes d'implémentation

- Ablation : `FeatureFlagEvaluator.php`, `FeatureFlagController.php` et `feature-flags.tsx` rendus
  à `pre-dev` → 1 rouge API (6 tests) et 1 rouge front (3 tests) ; correctif remis → verts.
- `->value('segments_json')` rend la chaîne JSON brute, sans le cast du modèle : le test lit la
  colonne par `->first()`.
