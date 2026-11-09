---
id: TCK-2496
title: Suggestion de recherche : lieu compris malgré une faute, compte des critères à retirer, biens nouveaux depuis une date
status: todo
phase: P1
family: back
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  models: []
tags: [back, search, suggest, audit-ux]
---

## Objectif utilisateur

Le chercheur qui tape « appart 3ch mermos » se voit compris (Mermoz) ; sans résultat, il sait combien de biens il retrouverait en retirant un critère ; en rouvrant une recherche récente, il sait combien de biens sont arrivés depuis.

## Contrat de données

`GET /api/search/suggest` (TCK-2474) et la liste publique `GET /api/public/properties`. Trois ajouts, tous **optionnels** dans la réponse (une API antérieure ne les rend pas, le front s'en passe) :

1. **`interpretation`** : un résidu qui correspond **sans ambiguïté** à un lieu que `places` trouve déjà (tolérance aux fautes de la suggestion de lieux) devient le critère de lieu ; la part correspondante de `parts` garde ses positions `from`/`to` dans la saisie (le front affiche « « mermos » lu Mermoz »).
2. **`relaxations`** : quand `interpretation.count === 0`, au plus trois critères dont le retrait rend des biens, chacun `{ key, count }`, triés par compte décroissant, calculés sous la même base que `count`.
3. **Liste publique** : filtre `filter[published_after]=<ISO 8601>` (biens publiés après cette date) ; le front l'emploie pour compter les biens nouveaux d'une recherche récente (`per_page=1`, il lit `meta.total`).

## Contraintes strictes (métier)

- Aucun lieu deviné quand deux lieux sont aussi proches de la faute : le résidu reste du texte.
- Les comptes de `relaxations` respectent les mêmes filtres de visibilité que la liste (biens publics, non test).
- Le journal des recherches (ADR-0088) ne change pas : la suggestion n'écrit toujours rien.
- Le coût d'une suggestion reste borné : `relaxations` seulement sur compte nul, trois comptes au plus.

## Delta à produire

- [ ] `App\Services\Search\SuggestService` : reprise d'un lieu tolérant dans l'interprétation ; calcul de `relaxations`.
- [ ] `App\Http\Requests\Public\SearchPublicPropertyRequest` : règle de `filter[published_after]` (date, pas dans le futur) ; application dans `PropertySearchService`.
- [ ] Tests : `SuggestInterpretationToleranteTest` (faute reprise ; ambiguïté laissée en texte), `SuggestRelaxationsTest` (compte nul → critères ordonnés ; compte non nul → absent), `PublicPropertyPublishedAfterTest`.
- [ ] Contrat de `GET /api/search/suggest` mis à jour dans `docs/features.md` § 2.4 (règles de gestion).

## Critères d'acceptation

- [ ] AC1 — `q=appart 3ch mermos` rend `criteria` avec le quartier Mermoz et aucun résidu « mermos ».
- [ ] AC2 — Une saisie dont la faute est à égale distance de deux lieux garde le mot en résidu.
- [ ] AC3 — Une saisie à compte nul rend `relaxations` non vide quand le retrait d'un critère rend des biens, et chaque `count` est celui de la liste ouverte avec ce critère retiré.
- [ ] AC4 — `filter[published_after]` exclut un bien publié la veille de la date donnée et garde un bien publié après.

## Hors périmètre

- Les variantes d'écriture tenues par l'IA (TCK-2476), inchangées.
- L'écran du téléphone (TCK-2497).

## Notes d'implémentation

_(à remplir par implementing-specs)_
