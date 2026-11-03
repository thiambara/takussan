---
id: TCK-2115
title: "Un identifiant de route connectée hors de `bigint`, ou non numérique, rend 404, et non 500"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#2-domaines-applicatifs-transverses"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-215--identifiants-numériques-de-route-hors-de-bigint-sur-les-routes-connectées"
tags: [back, routes, erreurs, pistes]
---

## Contexte

Réf : **P215.01** du fichier de pistes, `retenu · autonome` (A1). La liaison implicite passait la
valeur du chemin telle quelle à `where id = ?` : vingt chiffres levaient `SQLSTATE[22003]` (hors de
`bigint`), `abc` `22P02`, et environ 380 routes connectées rendaient 500, chacune avec une ligne
`query_exception` au niveau `error`. L'attendu est écrit : un modèle introuvable rend `http.not_found`
(TCK-588), et TCK-1851 l'a appliqué aux routes publiques par `[0-9]{1,18}`.

## Objectif utilisateur

Une URL tapée de travers, tronquée ou balayée par un robot rend un 404, et le journal ne porte plus
d'erreur de serveur pour elle.

## Contrat de données

Aucun changement pour un identifiant réel : 18 chiffres couvrent tout `bigint` atteignable par une
séquence. Une liaison par un autre champ que la clé (`{x:slug}`) n'est pas jugée.

## Delta à produire

- [x] `App\Models\Concerns\RefusesImpossibleRouteKeys` : `resolveRouteBindingQuery` rend une requête
  vide quand le champ lié est la clé entière et que la valeur ne suit pas `^[0-9]{1,18}$`.
- [x] Porté par `AbstractModel`, `User` et `ConversationParticipant`.
- [x] `{media}` se lie au modèle de Spatie, hors de ce trait : contrainte `[0-9]{1,18}` sur
  `media/{media}`, `media/{media}/sign`, `media/{media}/file` et `kyc/documents/{media}`.
- [x] Garde : `tests/Feature/Routes/IdentifiantsDeRouteHorsBigintTest.php`, qui balaie chaque route
  `api/*` à paramètre sous un super-admin, avec vingt chiffres, `9223372036854775808` et `abc`.

## Critères d'acceptation

- [x] AC1 — aucune route `api/*` à paramètre ne rend 5xx sur ces trois valeurs (hors des actions
  typées `int`, laissées à P215.02).
- [x] AC2 — `GET /api/properties/9223372036854775807` (borne de `bigint`) rend toujours 404 par la
  recherche, et une clé valable se lie toujours, en chaîne ou en entier.

## Hypothèses

- Les 26 routes `whereNumber()` relevées par la piste s'en remettent à la liaison : vingt chiffres
  passent la contrainte et sont refusés par le trait. Elles ne sont pas réécrites.

## Notes d'implémentation

- Reproduction : sur `9216f4643`, ~385 routes en 500 sur vingt chiffres et sur `9223372036854775808`,
  ~360 sur `abc`.
- Ablation : `app/` et `routes/` rendus à `pre-dev` → les trois cas du balayage et le test des
  familles de modèles rouges ; remis → 5/5.
- Piège : la surcharge vise `resolveRouteBindingQuery`, et non `resolveRouteBinding`, pour couvrir
  les liaisons imbriquées et `SoftDeletes` (`resolveSoftDeletableRouteBinding`). Un champ qualifié
  (`table.id`, liaison par `BelongsToMany`) est ramené à sa colonne avant la comparaison.
- Chaque requête du balayage tourne dans un point de sauvegarde annulé : une erreur SQL abandonnerait
  sinon la transaction du test, et toutes les routes suivantes avec elle.
