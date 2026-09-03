---
id: TCK-507
title: "Suggestions de la barre de recherche — un panneau qui ne promet que ce qu'il sait, et des types de bien tolérants à la faute"
status: doing
phase: P2
family: full
estimate: S
wave: 61
created: 2026-09-03
updated: 2026-09-03
depends_on: [TCK-335]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
tags: [front, back, search, suggest, meilisearch, i18n]
---

## Objectif utilisateur

Un visiteur qui tape « apprtement » dans la barre de recherche ne lit plus « Aucun résultat »
au-dessus d'une liste de 34 biens : le panneau lui propose « Appartement (35) » malgré la faute,
et, quand aucun terme ne correspond, lui propose de lancer la recherche plein-texte plutôt que de
lui affirmer qu'il n'y a rien.

## Contrat de données

**Prémisse mesurée le 2026-09-03** sur `?q=apprtement` (base locale) :

| Chemin | Ce qu'il rend pour « apprtement » | Pourquoi |
|---|---|---|
| `GET /api/search` (plein-texte Meilisearch) | 34 biens | tolérance à la faute du moteur : deux fautes admises dès 9 caractères |
| `GET /api/search/suggest` → `property_types` | `[]` | `SuggestService::filterPrefix` : `str_starts_with` sur le libellé normalisé, **aucune** tolérance |
| `GET /api/search/suggest` → `cities`, `neighborhoods` | `[]` | `facet-search` Meilisearch, préfixe + une faute dès 5 caractères — correct, mais « apprtement » n'est ni une ville ni un quartier |

Le panneau conclut « Aucun résultat pour « apprtement » » d'un résultat de suggestion **de
termes** vide, alors qu'il n'a jamais interrogé les annonces. Le message est faux dans le cas le
plus courant : une faute de frappe sur un mot que la recherche, elle, tolère.

Endpoints touchés : `GET /api/search/suggest` (réponse inchangée dans sa forme, groupe
`property_types` enrichi), aucun nouvel endpoint.

## Direction UX / Artistique

Le panneau de suggestion est un **suggéreur de termes**, pas un aperçu de résultats : il ne doit
jamais affirmer un compte de résultats qu'il ne connaît pas. Quand aucun terme ne correspond, il
ne se tait pas et n'accuse pas la saisie : il propose **une seule ligne d'action**, « Rechercher
« apprtement » dans les annonces », qui fait exactement ce que fait déjà la touche Entrée. Ton
sobre, même registre que les groupes existants ; les deux raccourcis « Voir toutes les villes »
et « Tous les types » disparaissent avec l'état vide qu'ils accompagnaient.

## Contraintes strictes (métier)

- Le panneau n'appelle **pas** `GET /api/search` à la frappe : cette page est déjà la page de
  résultats, et un compte de facette (« Mermoz (20) », garanti au clic) ne se mélange pas à un
  extrait d'annonce.
- Les seuils de tolérance des types sont **ceux de Meilisearch**, pour que la suggestion et la
  recherche jugent une faute de la même façon : 1 faute à partir de 5 caractères, 2 à partir
  de 9, 0 en dessous. Le préfixe strict reste prioritaire (« app » → Appartement).
- Le compte affiché à côté d'un type reste celui du filtre public (`publicFilter()`), comme
  aujourd'hui.
- Les trois langues rendent la ligne d'action ; aucune chaîne en dur.

## Delta à produire

- [ ] Service : `App\Services\Search\SuggestService::filterPrefix` devient un filtrage à deux
      passes — préfixe strict d'abord, puis distance de Levenshtein sur le libellé normalisé
      (seuils `0 / 1 / 2` selon la longueur de la saisie `< 5 / < 9 / ≥ 9`), en gardant l'ordre
      par compte et la limite par groupe.
- [ ] Tests unitaires : `tests/Unit/Services/Search/SuggestServiceTest` — « apprtement » rend
      Appartement, « dakr » (4 caractères) ne rend rien, le préfixe passe avant la faute.
- [ ] Test d'API : `tests/Feature/Api/Search/SearchSuggestTest` — une faute sur un type traduit
      rend le libellé de la locale demandée.
- [ ] Front : l'état vide de `SearchAutocomplete` remplacé par la ligne d'action « Rechercher
      « {query} » dans les annonces », qui construit la même URL que Entrée.
- [ ] i18n : clés `search.suggest.*` révisées dans `fr`, `en`, `wo` (retrait de `empty` et
      `fallback.*`, ajout de la ligne d'action).
- [ ] Tests front : `SearchAutocomplete.test.tsx` — plus aucun « Aucun résultat » ; la ligne
      d'action pousse `?q=<saisie>`.

## Critères d'acceptation

- [ ] AC1 — `GET /api/search/suggest?q=apprtement` (locale `fr`) rend `property_types` contenant
      `{label: "Appartement", value: "apartment"}` avec son compte public.
- [ ] AC2 — `GET /api/search/suggest?q=dakr` rend `property_types = []` : sous 5 caractères,
      aucune tolérance, comme le moteur.
- [ ] AC3 — `GET /api/search/suggest?q=app` rend Appartement **par le préfixe**, avant tout
      candidat à distance ; l'ordre par compte décroissant est conservé au sein d'une passe.
- [ ] AC4 — Dans la barre de recherche, une saisie sans aucun terme correspondant n'affiche
      **jamais** le texte « Aucun résultat » ; elle affiche une ligne d'action nommant la saisie.
- [ ] AC5 — Cliquer cette ligne pousse l'URL `/properties?q=<saisie>` (page retirée), identique
      à celle de la touche Entrée sans suggestion active.
- [ ] AC6 — Aucun appel réseau vers `/api/search` n'est émis par le panneau pendant la frappe.
- [ ] AC7 — Les trois dictionnaires portent les mêmes clés sous `search.suggest`.

## Hors périmètre

- Aperçu d'annonces dans le panneau de suggestion (homepage ou ailleurs) : ticket séparé si le
  besoin se confirme.
- Tolérance à la faute des villes et quartiers au-delà de ce que `facet-search` offre déjà
  (sous-chaîne, mot interne) : mesuré et documenté dans `SuggestService::facetHits`, non traité.
- Le réglage `typoTolerance` de l'index Meilisearch lui-même.

## Notes d'implémentation

_(à remplir par implementing-specs)_
