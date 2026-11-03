---
id: TCK-655
title: "La langue choisie dans l'interface est persistée sur le compte (`PATCH /api/me`)"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#1-user
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo
tags: [back, front, i18n, notifications, pistes]
---

## Objectif utilisateur

Un utilisateur connecté qui choisit sa langue (fr, en, wo) dans l'interface reçoit ensuite ses
e-mails, SMS et notifications dans cette langue : le choix est écrit dans `preferred_language`,
que `User::preferredLocale()` lit pour tout envoi.

## Contrat de données

- `PATCH /api/me` accepte `preferred_language` (`sometimes`, chaîne, `in:fr,en,wo`). Absent : la
  colonne ne change pas. Présent et hors liste, vide ou `null` : 422 sur `preferred_language`.
- Aucune route neuve, aucune clé de réponse changée.
- `setLocaleAction` (front) vise `/api/me` au lieu de `/api/users/me`, route qui n'a jamais
  existé.

Réf : **P06.01** du fichier de pistes (classement A1 : TCK-017 écrit le comportement attendu,
sélecteur « persisté via `preferred_language` »).

## Contraintes strictes (métier)

- `preferred_language` est une colonne de `users`, pas une clé de `preferences` : elle n'entre
  pas dans `UpdateMeRequest::PREFERENCE_FIELDS`.
- L'ordre de résolution de la langue d'une réponse (TCK-536) ne change pas.

## Delta à produire

- [x] `UpdateMeRequest` : règle `preferred_language`.
- [x] `MeController::update()` : écrit `preferred_language` quand la clé est présente.
- [x] `takussan-web/src/app/actions/locale.ts` : chemin `/api/me`.
- [x] Tests : `MeUpdateTest` (3 cas), `locale.persistance.test.ts` (2 cas).

## Critères d'acceptation

- [x] AC1 — `PATCH /api/me {preferred_language: "wo"}` → 200, `preferred_language` = `wo`, les
      `preferences` intactes.
- [x] AC2 — `de`, `""`, `null`, `fr-FR` → 422, la colonne ne change pas.
- [x] AC3 — une requête sans la clé ne touche pas la langue.
- [x] AC4 — connecté, `setLocaleAction('wo')` envoie `PATCH /api/me` avec
      `{preferred_language: "wo"}` ; anonyme, aucun appel.

## Hors périmètre

- Renseigner `preferred_language` à l'inscription depuis `Accept-Language` (choix de produit,
  V7 ; P11.01 porte le même défaut pour les comptes inscrits par e-mail).
- Les 26 notifications qui stockent un `title` sans `code` (constat de P06.01, autre défaut).
- Le `catch {}` muet de `setLocaleAction` : gardé, le cookie reste la source de l'affichage.

## Notes d'implémentation

- Rouge avant correctif : `PATCH /api/me {preferred_language: "wo"}` rendait **200** et laissait
  `fr` (clé hors validation, ignorée en silence) ; `de` rendait 200 au lieu de 422. Côté front, le
  test lisait `/api/users/me`.
- Ablation 1, contrôleur remis à l'état d'avant (règle gardée) : AC1 rouge. Ablation 2, règle
  retirée (contrôleur gardé) : AC1 et AC2 rouges. Ablation 3, chemin front remis : AC4 rouge.
