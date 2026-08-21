---
id: TCK-341
title: "Le catalogue public se recalcule pour chaque visiteur"
status: todo
phase: P2
family: technique
estimate: S
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [back, performance, cache]
---

## Objectif utilisateur

Deux visiteurs anonymes qui demandent la même page de résultats ne la font pas calculer deux fois.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md) — il y était **tombé sans
passer par « hors périmètre »**, et c'est justement le défaut que ce dépôt poursuit ailleurs.
Constat reproduit ([audit](../../qa/audit-recherche-navigation-2026-08-21.md) §6) :

```
GET /api/public/properties/search  →  Cache-Control: no-cache, private
                                      ni ETag, ni max-age
GET /api/search/suggest            →  Cache-Control: max-age=60, public   ← le bon modèle, à côté
```

## Contraintes strictes (métier)

- Le catalogue public est **anonyme et en lecture seule** : rien n'y dépend de l'utilisateur.
  ⚠ Sauf la LOCALE, depuis TCK-335 : la réponse varie désormais avec `Accept-Language`. Le
  `Vary` doit le refléter, sinon un visiteur anglophone reçoit le cache d'un francophone.
- Un `ETag` profite à **tout visiteur** et **survit à un rechargement de page** — ce qu'un cache
  React Query en mémoire ne fait pas. C'est moins cher et ça traite davantage la cause.
- La compression HTTP n'a **pas** pu être vérifiée depuis le dépôt (`artisan serve` ne compresse
  pas, la configuration du serveur n'est pas versionnée). À mesurer sur
  `preview.api.takussan.com` dans le même passage.

## Delta à produire

- [ ] `ETag` + `Cache-Control: public, max-age=<n>` sur `/public/properties/search` et
      `/public/properties/{slug}`
- [ ] `Vary: Accept-Language, Origin`
- [ ] Mesurer la compression sur l'environnement de préproduction et conclure

## Critères d'acceptation

- [ ] AC1 — une seconde requête identique portant `If-None-Match` rend **304**
- [ ] AC2 — deux locales différentes ne partagent pas la même entrée de cache
- [ ] AC3 — aucune surface authentifiée ne devient cacheable par ce changement

## Hors périmètre

- Un cache applicatif (Redis) devant Meilisearch.

## Notes d'implémentation

_(à remplir par implementing-specs)_
