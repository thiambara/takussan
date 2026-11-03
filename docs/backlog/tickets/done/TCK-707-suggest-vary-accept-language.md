---
id: TCK-707
title: "`/api/search/suggest` déclare `Vary: Accept-Language`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-28--cache-des-pages-publiques-par-langue
tags: [back, search, cache, i18n, pistes]
---

## Contexte

Réf : **P28.01** du fichier de pistes, `retenu · autonome` (classement A1 : le comportement attendu
est écrit par TCK-341 et le commentaire de `PublicPropertyController::discovery`, « un corps qui
change avec la langue sous `public` porte `Vary: Accept-Language` »).

`SuggestController` sert `Cache-Control: public, max-age=60` sans `Vary`. Le groupe
`property_types` porte un libellé traduit dans la langue de la requête, et `useSuggest` appelle une
URL qui ne porte pas la langue : un cache HTTP peut rendre, pendant 60 s, le corps d'une autre
langue. C'est le défaut que TCK-341 a fermé sur `discovery`.

Hypothèse (mode sans humain) : le corps ne dépend pas de l'appelant (ni `SuggestService` ni
`SuggestRequest` ne lisent l'utilisateur, lu) ; `Authorization` n'entre donc pas dans le `Vary`,
comme la `Piste` le propose.

## Objectif utilisateur

Un visiteur qui change de langue voit les suggestions dans la langue choisie, jamais celles d'une
autre langue resservies par un cache.

## Contrat de données

Aucun changement de corps. La réponse porte en plus `Vary: Accept-Language` ; `Origin`, ajouté par
le middleware CORS, reste.

## Delta à produire

- [x] `SuggestController` : `Vary: Accept-Language` sur la réponse, sans écrire `Origin` en dur.
- [x] `SearchSuggestTest` : deux langues, deux corps distincts (prémisse), et `Accept-Language` et
      `Origin` présents dans le `Vary` des deux réponses.

## Critères d'acceptation

- [x] AC1 — `GET /api/search/suggest?q=ap&limit=10` sous `fr` et `en`, avec un bien `apartment`
      publié, rend deux corps distincts, chacun `public` et `Vary` contenant `Accept-Language`.
- [x] AC2 — sous une requête CORS, le `Vary` contient aussi `Origin`.

## Hors périmètre

- La garde générale qui rejouerait chaque route `Cache-Control: public` sous deux langues (évoquée
  par la `Piste`) : elle n'est pas faite ici.
- Le comportement d'un cache partagé devant `api.takussan.com`, non observé.

## Notes d'implémentation

- **Reproduction** : le test neuf, avant correctif, rend `fr — Vary émis : Origin` (prémisse
  tenue : corps `fr` et `en` distincts, tous deux `public`).
- **Ablation** : retirer `->header('Vary', 'Accept-Language')` → le test rouge sur la même
  assertion ; remis → vert, et `SearchSuggestTest` entier vert (13 tests).
- **Piège** : ne pas écrire `Origin` dans le `Vary` du contrôleur. Le middleware CORS l'ajoute
  au `Vary` existant ; le test l'exige sous une requête portant `Origin`, pour qu'un `Vary`
  écrasé plus tard ne passe pas inaperçu.
