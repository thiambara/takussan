---
id: TCK-107
title: "Autocomplétion recherche"
status: todo
phase: P2
family: front
estimate: S
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-024, TCK-052, TCK-039]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#3-property
tags: [back, front, search, autocomplete]
---

## Objectif utilisateur

Permettre à un visiteur (Hero de la home, barre de recherche globale) ou
à un utilisateur connecté de trouver instantanément un quartier, une
ville ou un type de bien en tapant 1 à 3 caractères, via un dropdown
qui suggère les correspondances pertinentes triées et regroupées par
catégorie.

## Contrat de données

**Backend — Endpoint léger** :

- `GET /api/search/suggest?q={terme}&limit=10`
- Public (pas d'auth requise) avec rate-limit dédié (ex: 60 req/min/IP).
- Réponse JSON groupée par type :

  ```json
  {
    "data": {
      "cities":       [{ "label", "slug", "count" }],
      "neighborhoods":[{ "label", "city", "slug", "count" }],
      "property_types":[{ "label", "value", "count" }]
    }
  }
  ```

- Sources de données :
  - `cities` / `neighborhoods` : agrégation sur `properties.city`,
    `properties.neighborhood` ou table `addresses` filtrée sur
    `properties.status = published`.
  - `property_types` : enum `PropertyType` (TCK-024) filtré sur ceux qui
    ont au moins 1 résultat publié.
- Recherche tolérante : insensible à la casse et aux accents (collation /
  `unaccent`), prefix-match minimum, fuzzy-match optionnel via
  `LIKE`/`SIMILARITY`.
- Tri : par `count` desc puis label alpha.
- Pas de pagination — `limit` global (max 30, default 10).

**Performance** :

- Cache HTTP `Cache-Control: public, max-age=60` + cache applicatif
  (Redis) clé `search:suggest:{q}` TTL 5 min.
- Requête doit répondre en P95 < 80 ms.

**Frontend** :

- Dropdown headless contrôlé par un debounce 150 ms.
- Composant intégré sur le Hero de la home (TCK-039) et la barre de
  recherche globale du layout authentifié.
- Touche Enter ou clic sur une suggestion → redirige vers la page
  résultats (TCK-052) avec les bons filtres préfillés (ville,
  quartier, ou type).
- États : idle / loading / empty / error / results.
- Accessibilité : combobox ARIA, navigation clavier (haut/bas/Enter/Esc).

## Direction UX / Artistique

**Ambiance** : "search-as-you-type" rapide, premium, calme. Le dropdown
ne masque pas le hero, il glisse subtilement en dessous. Aucune
transition longue (> 120 ms).

**Hiérarchie visuelle** :
- Groupes labellisés ("Villes", "Quartiers", "Types") séparés visuellement.
- Chaque suggestion : label en gras + sous-info (ville pour les quartiers)
  + nombre de biens disponibles à droite (badge discret).
- Highlight en bold sur la sous-chaîne tapée par l'utilisateur dans le label.

**États** :
- Empty (pas de résultat) : message "Aucun résultat pour « X »" + 2
  liens fallback ("Voir toutes les villes", "Tous les types").
- Loading : skeleton 3 lignes, max 250 ms (sinon pas de skeleton).
- Error : silencieux côté UI, log console + retry transparent au prochain
  keystroke.

**Pas de prescription technique** : le choix librairie (combobox lib,
state management) revient à l'IA implémenteur.

## Contraintes strictes (métier)

- **Aucune donnée privée exposée** : seuls les biens `published` et non
  archivés sont comptés ; aucun accès aux brouillons, biens d'agences
  privées non publiées, etc.
- **i18n** : labels groupes traduits (fr/en/wo) ; les résultats viennent
  de la base et ne sont pas traduits côté client.
- **Anti-abus** : rate-limit 60 req/min/IP ; au-delà → 429.
- **`q` minimum 1 caractère** ; en dessous, l'endpoint renvoie un objet
  vide sans erreur.
- **Pas de PII** : aucune suggestion ne doit contenir un nom de
  propriétaire, un email ou un numéro de téléphone.
- **Latence** : P95 < 80 ms côté API ; côté frontend, le dropdown doit
  s'afficher dans les 200 ms après le dernier keystroke.
- **Cohérence** : un clic sur "Dakar" doit produire les mêmes résultats
  que le filtre `city=Dakar` sur la page de recherche (TCK-052).

## Delta à produire

- [ ] Route `routes/api/search.php` : `GET /search/suggest`
- [ ] Controller `SearchSuggestController` (single action)
- [ ] Service `App\Services\Search\SuggestService` (3 résolveurs : cities, neighborhoods, types)
- [ ] FormRequest `SuggestRequest` (`q` string min:1 max:50, `limit` int max:30)
- [ ] Index DB : `properties (status, city)` / `properties (status, neighborhood)` si manquants
- [ ] Cache Redis avec invalidation soft (TTL 5 min)
- [ ] Tests `SearchSuggestTest` (5+ cas : prefix, accents, empty q, rate-limit, sécurité brouillons)
- [ ] Composant frontend autocomplete (dropdown + combobox)
- [ ] Intégration Hero home (TCK-039)
- [ ] Intégration barre recherche globale layout authentifié
- [ ] Hook côté frontend pour appeler l'endpoint avec debounce + abort controller
- [ ] Tests Vitest comportement debounce + navigation clavier
- [ ] i18n fr/en/wo (`search.suggest.*`)

## Critères d'acceptation

- [ ] AC1 — `GET /api/search/suggest?q=da` retourne au minimum les
  villes commençant par "da" (ex: Dakar) avec `count` > 0
- [ ] AC2 — la requête `?q=daka` et `?q=Dakar` retournent les mêmes
  résultats (insensible casse + accents)
- [ ] AC3 — un bien `status=draft` ne fait jamais remonter sa ville dans
  les suggestions (vérifié dans test)
- [ ] AC4 — réponse P95 < 80 ms sur dataset de 10k biens (mesuré en CI ou
  bench local)
- [ ] AC5 — au-delà de 60 req/min depuis la même IP : 429
- [ ] AC6 — sur le Hero, taper "Dak" affiche le dropdown < 200 ms après
  le dernier keystroke avec les groupes Villes / Quartiers / Types
- [ ] AC7 — cliquer sur une suggestion "Dakar" redirige vers la page
  résultats avec `?city=Dakar` ; le contenu correspond au filtre direct
- [ ] AC8 — navigation clavier : flèches haut/bas naviguent, Enter
  sélectionne, Esc ferme le dropdown

## Hors périmètre

- Recherche full-text avancée (Elasticsearch / Meilisearch) — la V1 reste
  sur Postgres LIKE / unaccent ; ticket dédié si volume l'exige.
- Suggestions personnalisées par historique utilisateur — feature P3.
- Suggestion d'agences ou d'agents — pas demandé pour la barre publique.
- Recherche vocale, mobile-only patterns — séparés.
- Autocomplétion sur l'éditeur de fiche bien (côté admin) — peut réutiliser
  l'endpoint mais UI différente, ticket dédié si besoin.

## Notes d'implémentation

_(à remplir par implementing-specs)_
