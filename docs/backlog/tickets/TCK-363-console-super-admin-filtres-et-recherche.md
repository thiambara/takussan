---
id: TCK-363
title: "Console super-admin — sélecteur d'agence partagé, recherche temporisée, filtres réinitialisables"
status: todo
phase: P2
family: front
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-357]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, super-admin, filtres, recherche, performance]
---

## Objectif utilisateur

Le super-admin filtre par agence en la **cherchant par son nom**, voit combien de résultats son filtrage produit, et peut tout remettre à zéro d'un geste — sans que chaque frappe parte en requête.

## Contrat de données

- `GET /api/admin/agencies` sert déjà la liste paginée et filtrable par `filter[search]` : le sélecteur s'appuie dessus, avec recherche côté serveur et chargement à la demande.
- `GET /api/super-admin-users`, `GET /api/super-admin-properties`, `GET /api/admin/moderation` exposent déjà `filter[agency_id]` et rendent `meta.total`.
- Aucun endpoint à créer.

## Direction UX / Artistique

Trois défauts de la même famille, relevés le 2026-08-26 :

1. **`/users` demande de taper un identifiant d'agence à la main**, dans un `<input type="number">`. Personne ne connaît par cœur l'ID d'une agence.
2. **`/properties` et `/moderation` chargent 50 agences** (`perPage: 50`) et tronquent en silence : au-delà, l'agence cherchée est simplement absente du sélecteur, sans que rien ne le dise. Un filtre qui tait ce qu'il ne montre pas est pire qu'un filtre absent.
3. **Aucune recherche du dépôt n'est temporisée** — chaque frappe déclenche une requête (`grep -rl 'debounce\|useDeferredValue'` sur la console : zéro).

- Un `AgencyCombobox` unique, partagé par les trois écrans : saisie, recherche serveur, chargement à la demande, agence sélectionnée affichée par son nom.
- La barre de filtres porte le **compte de résultats** et une action **« réinitialiser »** — aucune des barres actuelles ne les a.
- Les filtres actifs restent lisibles d'un coup d'œil : sur `/users`, six sélecteurs alignés dans une grille ne disent pas lesquels sont posés.

## Contraintes strictes (métier)

- La temporisation de saisie ne doit pas rendre l'interface muette : l'état « recherche en cours » doit être visible pendant l'attente.
- Le sélecteur d'agence ne doit **jamais** afficher une liste tronquée sans le signaler ni permettre d'aller chercher plus loin.
- L'état des filtres passe par l'URL partout où il l'est déjà (`/properties`, `/moderation`) ; `/users` s'aligne, sa mémorisation actuelle ne portant que sur le rôle.
- Le filtrage reste côté serveur (`filter[...]`), jamais côté client sur une liste déjà récupérée — règle de dépôt.

## Delta à produire

- [ ] Composant `AgencyCombobox` (recherche serveur, chargement à la demande, valeur = id, libellé = nom)
- [ ] `/users` : champ numérique remplacé par `AgencyCombobox` ; état des filtres porté par l'URL
- [ ] `/properties` et `/moderation` : sélecteurs tronqués remplacés par `AgencyCombobox`
- [ ] Temporisation (~300 ms) sur les trois champs de recherche, avec indicateur d'attente
- [ ] `FilterBar` (TCK-357) : compte de résultats + « réinitialiser » sur `/users`, `/agencies`, `/properties`, `/moderation`
- [ ] Tests : nombre de requêtes émises pour une saisie de N caractères ; sélection d'une agence au-delà des 50 premières ; réinitialisation

## Critères d'acceptation

- [ ] AC1 — aucun écran de la console ne demande la saisie manuelle d'un identifiant d'agence
- [ ] AC2 — une agence classée au-delà du 50ᵉ rang est sélectionnable dans les trois écrans, **le test la choisissant explicitement** (un test qui ne sélectionne que parmi les 50 premières cocherait aussi l'ancien comportement)
- [ ] AC3 — une saisie de 10 caractères déclenche au plus 2 requêtes de recherche (mesuré par un espion sur `fetch`), contre 10 aujourd'hui
- [ ] AC4 — pendant l'attente de la temporisation, un état de chargement est visible
- [ ] AC5 — chaque barre de filtres affiche le compte de résultats et propose « réinitialiser » ; l'action remet tous les filtres à leur valeur par défaut et vide l'URL
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- La recherche publique et la recherche agence, servies par d'autres surfaces.
- Le tri des colonnes : TCK-357.
- Tout changement de la logique de filtrage côté API.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
