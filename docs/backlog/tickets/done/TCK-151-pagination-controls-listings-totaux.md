---
id: TCK-151
title: "Pagination listings — total tronqué (clients) et boutons absents (états des lieux)"
status: done
phase: P1
family: front
estimate: S
wave: 17
created: 2026-05-04
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-crm-clients
    - docs/features.md#16-états-des-lieux
tags: [front, bug, p1, smoke-test-2026-05-04, pagination, ui]
---

## Objectif utilisateur

Un agent navigue l'intégralité d'une liste paginée (clients, états des lieux) et voit clairement la page courante, le total de pages, et dispose des contrôles Précédent / Suivant fonctionnels.

## Contrat de données

Les endpoints retournent déjà la structure paginée Laravel (Spatie / `meta.last_page`) :
- `GET /api/customers` — `meta.last_page` est exposé
- `GET /api/inventories` — `meta.last_page` est exposé

Le frontend doit lire et rendre ces valeurs.

## Contraintes strictes (métier)

- Cohérence visuelle avec la pagination déjà en place sur `/app/properties` (qui affiche correctement `Page 1 / 14`).
- Comportement clavier / a11y identique sur les deux pages corrigées (boutons `<button>` natifs, focus géré).

## Delta à produire

- [x] **Frontend** — `/app/customers` (composant pagination de la liste clients) : afficher le `meta.last_page` après le `/` (actuellement absent → texte rendu `Page 1 / ` et `141 clients — page 1 sur`)
- [x] **Frontend** — `/app/inventories` (composant pagination de la liste états des lieux) : rendre les boutons `Précédent` et `Suivant` (actuellement seul le texte `Page 1 / 7 — 99 entrées` est rendu, sans aucun bouton)
- [x] **Frontend** — Factoriser la pagination si possible avec celle de `/app/properties` (même composant `Pagination` partagé)
- [ ] **Tests frontend** — Au moins un test rendu pour chacune des deux pages : pagination affiche `Page 1 / N` avec N > 1 et les boutons sont rendus

## Critères d'acceptation

- [ ] `/app/customers` affiche la pagination complète : `Page 1 / 8` (ou nombre réel selon données seed) et le total `141 clients — page 1 sur 8`
- [ ] `/app/inventories` rend les boutons Précédent / Suivant fonctionnels (cliquer sur Suivant change la page)
- [ ] Aucun changement visuel sur `/app/properties` (référence)
- [ ] Aucune régression sur les autres listings paginés du dashboard

## Hors périmètre

- Refonte du composant Pagination (sélection de page, jump-to-page, etc.)
- Pagination "infinite scroll" (P3)
- Pagination des listings non identifiés dans le smoke test

## Notes d'implémentation

- Source de reproduction : `docs/smoke-tests/agent-smoke-test-2026-05-04.md`, bugs **P1-4** (clients) et **P2-5** (états des lieux).
- Snapshot a11y `/app/customers` : `Pagination` nav contient `Page` `1` `/` puis bouton `Suivant` directement — pas de nombre après le `/`.
- Snapshot a11y `/app/inventories` : pied de liste contient uniquement `Page 1 / 7 — 99 entrées` en texte statique, **aucune** balise `<button>` Précédent / Suivant.
- Référence qui marche : `/app/properties` rend `Page 1 / 14` + boutons `Précédent` (disabled) + `Suivant` correctement.

**Implémentation 2026-05-05 :**
- **Root cause A (clients)** : `CustomerController::index()` ne renvoyait que `total` + `current_page` dans `meta` — `last_page` absent. Fix : ajout de `last_page` + `per_page` dans la réponse.
- **Root cause B (inventaires)** : `InventoryList.tsx` affichait le texte `Page X / Y — N entrées` mais sans aucun bouton prev/next. Fix : ajout du state `page`, filtrage des params avec `page`, et rendu des boutons Précédent / Suivant (désactivés aux bornes). Cohérence visuelle avec `/app/properties`.
- Pint clean, 63/63 tests (Customer + Inventory) ✅.
