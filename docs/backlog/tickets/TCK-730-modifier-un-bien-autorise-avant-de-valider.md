---
id: TCK-730
title: "Modifier un bien autorise avant de valider (403, plus 422), et une garde fige les FormRequests qui échappent au refus par défaut"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-3--isolation-entre-agences-et-autorisation"
tags: [back, properties, authorization, validation, pistes]
---

## Contexte

Réf : **P03.05** du fichier de pistes, `validé` par le porteur (critères accordés : V2 et V8).

`UpdatePropertyRequest` étend `FormRequest` et non `BaseFormRequest`, et son `authorize()` rend
`user() !== null`. Le contrôleur n'appelle `authorize('update')` qu'après la validation : un
compte connecté sans droit sur le bien qui envoie un corps invalide à `PUT|PATCH
/api/properties/{property}` reçoit 422 et les noms des champs, au lieu de 403. 27 autres
FormRequests (hors `Admin/` et `Auth/`) étendent aussi `FormRequest` directement, et rien
n'empêche d'en ajouter une 29ᵉ.

## Décision du porteur

UpdatePropertyRequest seule, et une garde neuve qui fige les 27 autres ; reste : les 27 autres FormRequests, une à une

## Reste à faire

les 27 autres FormRequests, une à une

## Objectif utilisateur

Un compte sans droit sur un bien reçoit 403 quand il tente de le modifier, quel que soit le corps
envoyé, et n'apprend rien des règles de validation du bien.

## Contraintes strictes (métier)

- La règle reste dans `PropertyPolicy::update()` : `authorize()` ne fait que l'appeler.
- Un appelant autorisé reçoit les mêmes réponses qu'avant, 422 compris.
- La normalisation du corps ne change pas : `UpdatePropertyRequest::prepareForValidation()`
  redéfinit déjà celle de `BaseFormRequest` sans l'appeler, et le middleware global fait le trim et
  la conversion `""` → `null` (`takussan-api/CLAUDE.md`, § Validation).

## Delta à produire

- [x] `UpdatePropertyRequest` étend `BaseFormRequest` ; `authorize()` délègue à
  `can('update', $this->route('property'))`.
- [x] `AuthorizationPrecedesValidationTest` : un cas « intrus → 403 » (PUT et PATCH) et son
  versant « autorisé → 422 ».
- [x] Garde neuve `tests/Unit/Architecture/FormRequestEtendBaseFormRequestTest.php` : refuse
  tout FormRequest de `app/Http/Requests` (hors `Auth/` et `Admin/`) qui étend `FormRequest`
  hors de la liste figée des 27, et rougit quand un fichier de la liste ne l'étend plus.

## Critères d'acceptation

- [x] AC1 — Membre d'une autre agence, corps `{type: chateau, price: cher}` : `PUT` et `PATCH
  /api/properties/{id}` → 403.
- [x] AC2 — Super-admin, même corps → 422 sur `type` et `price`.
- [x] AC3 — Un FormRequest neuf qui étend `FormRequest` fait rougir la garde, avec son nom.
- [x] AC4 — Un fichier de la liste figée qui n'étend plus `FormRequest` fait rougir la garde.

## Hors périmètre

- Les 27 autres FormRequests : « Reste à faire » ci-dessus.
- Le `$this->authorize('update', $property)` du contrôleur reste : il ne change aucun résultat, et
  `check-controller-authorization.mjs` lit les contrôleurs.

Hypothèses (mode sans humain) :
- la garde est un test PHPUnit et non un `scripts/check-*.mjs` : le Repo CI énumère ses gardes
  une à une dans `.github/workflows/repo-ci.yml`, chemin fermé à l'implémenteur ; un test
  d'architecture est joué par l'API CI sans y toucher ;
- son champ est celui de la mesure de P03.05 : hors `Auth/` (connexion et inscription, appelées
  sans compte) et `Admin/` (derrière le middleware `super-admin`).

## Notes d'implémentation

- Ablation : `UpdatePropertyRequest` remis à l'état d'origine → 2 rouges (`property update denies
  before it validates`, 422 au lieu de 403 ; la garde, qui nomme `UpdatePropertyRequest.php`) ;
  remis, 23 verts.
- Versant expirant de la garde éprouvé : `UpdatePropertyRequest.php` ajouté à la liste figée après
  le correctif → `la liste figee ne garde que des fichiers…` rouge ; retiré.
