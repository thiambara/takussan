---
id: TCK-373
title: "Console agence — adopter les primitives partagées (en-tête, badge, états, pagination, table)"
status: todo
phase: P2
family: front
estimate: M
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: [TCK-357, TCK-372]
blocks: [TCK-375, TCK-376]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#25-reporting--tableaux-de-bord
tags: [front, design-system, admin, primitives]
---

## Objectif utilisateur

L'admin d'agence retrouve le même en-tête, le même badge de statut, le même état de chargement et la même pagination d'un écran à l'autre — au lieu de réapprendre la mise en page à chaque menu.

## Contexte

Les guidelines s'ouvrent sur *« Cohérence avant tout : un seul style de bouton principal, **une
seule façon d'afficher un état vide**, une seule famille d'icônes »*. Relevé le 2026-08-26 sur
la console `/admin` :

| Élément | Ce qui existe déjà | Ce que la console fait |
|---|---|---|
| En-tête de page | `layout/PageHeader` (titre, sous-titre, eyebrow, **`actions`**) | **3 pages sur 12** le montent ; 9 recopient son balisage (12 occurrences), 2 dans un `<div>` au lieu d'un `<header>`, et **aucune** n'utilise `actions` |
| Badge de statut | `ui/badge.tsx` | 4 recettes distinctes pour « succès » : `bg-emerald-100`, `bg-emerald-50 …border`, `bg-emerald-500/10 …border`, `bg-emerald-600`. Idem pour « en attente » et « erreur » |
| État d'erreur | `ErrorState` | 3 rendus : le composant (5 fichiers), une `Card` + `text-destructive`, une `div destructive/5` |
| État de chargement | `ui/skeleton.tsx` | 3 rendus : `<Skeleton>` (6 fichiers), `animate-pulse` artisanal (4), `Loader2` (19) |
| Pagination | `search/Pagination.tsx`, `super-admin/Pagination.tsx`, `property-dashboard/PropertyPagination.tsx` | **3 implémentations existantes**, et `AuditTrail` comme `TeamConsole` en réécrivent chacun une → **5 au total** |
| Table | `console/DataTable` + `ui/table`, produits par TCK-357 | 5 tables écrites à la main |

**Le « succès » mérite d'être nommé à part :** les guidelines posent *« Succès / location :
`var(--accent)` (sage `#5d6e4f`) »*. Les quatre recettes ci-dessus sont des verts Tailwind
bruts. **Aucune n'est sage.**

**Ce ticket ne crée rien.** [TCK-357](TCK-357-console-super-admin-primitives-partagees.md), en
`review` au 2026-08-26, livre `src/components/console/` — `DataTable`, `PageHeader`, `StatCard`,
`StatusBadge`, `FilterBar`, `DataState` — plus `ui/table.tsx`. C'est ce qui recadre TCK-357 : ce
n'est pas un chantier super-admin, c'est un chantier de design system dont `/admin` est le second
consommateur. Ce ticket est une **adoption**, et sa valeur est d'éprouver les primitives sur une
seconde console — une primitive qui ne sert qu'un écran n'a pas encore prouvé qu'elle en est une.

**Et il y a une convergence à faire, pas seulement une adoption.** Le dépôt porte désormais
**deux** `PageHeader` : `src/components/layout/PageHeader.tsx` (`subtitle`, `eyebrow`, `actions`)
et `src/components/console/PageHeader.tsx` (`description`, `actions`). Ils rendent presque la même
chose sous des noms de props différents. *Deux composants qui font une seule chose, c'est
exactement le défaut que ce ticket existe pour éteindre* — les laisser coexister le reconduirait
un étage plus haut.

## Contrat de données

Aucun. Seule la couche de rendu bouge ; les écrans consomment déjà leurs données.

## Direction UX / Artistique

L'action principale d'un écran se lit en tête, à côté du titre — pas au tiers de la page. « Inviter »
sur `/admin/team`, « Créer un rôle » sur `/admin/roles`, « Nouvelle facture » sur
`/admin/finances` remontent dans l'emplacement `actions` que `PageHeader` expose déjà.

Un statut se lit à la même place et dans la même couleur d'un écran à l'autre. Le sage est la
couleur du succès parce que la charte le dit ; le vert Tailwind n'a jamais été un choix, il a
été un défaut.

Les navigations par onglets qui sont en réalité des changements de route (`/admin/settings` ↔
`/admin/settings/integrations`) restent des liens — mais elles ne se recopient plus dans les
deux fichiers.

## Contraintes strictes (métier)

- `EmptyState` et `ErrorState` de `src/components/feedback/` sont les seuls autorisés :
  `scripts/check-feedback-states.mjs` casse la CI sur toute redéfinition locale.
- Aucun changement de comportement : mêmes filtres, mêmes tris, mêmes gestes, mêmes gardes par
  capacité. Un écran qui gagne ou perd une action dans ce ticket est une régression.
- Toute table large reste défilante dans son propre conteneur (acquis de TCK-371).
- Les couleurs passent par les tokens ; aucune valeur hex, aucune classe de palette brute.

## Delta à produire

- [ ] **Un seul** `PageHeader` dans le dépôt : les deux implémentations convergent, l'union de
      leurs props est conservée, et tous les appelants des deux côtés sont portés dessus
- [ ] `PageHeader` sur les 12 pages de `/admin`, avec l'action principale de chaque écran dans
      `actions`
- [ ] Badges de statut ramenés à une primitive unique, « succès » sur le sage de la charte
- [ ] États d'erreur et de chargement ramenés aux composants partagés
- [ ] Une seule pagination pour la console, prise dans les primitives partagées
- [ ] Les 5 tables portées sur la primitive de table
- [ ] Navigation par onglets de `/admin/settings*` extraite au lieu d'être recopiée
- [ ] Tests mis à jour ; les `data-testid` existants préservés

## Critères d'acceptation

- [ ] AC1 — `grep -rc 'font-display text-2xl font-bold text-foreground' 'src/app/(dashboard)/admin'`
      renvoie **0**, contre 12 le 2026-08-26, et les 12 pages montent `PageHeader`
- [ ] AC1bis — `find src -name 'PageHeader.tsx'` renvoie **un seul** fichier, et aucun écran du
      dépôt (super-admin compris) n'importe l'autre
- [ ] AC2 — au moins 3 pages passent une action dans `actions` (0 aujourd'hui)
- [ ] AC3 — une seule expression rend le statut « succès » sur toute la console, et elle est
      adossée à `--accent` ; `grep -rE 'bg-emerald-(50|100|500|600)' ` sur la surface `/admin`
      ne renvoie aucun résultat
- [ ] AC4 — `grep -rl 'animate-pulse' ` sur la surface `/admin` ne renvoie aucun résultat, et
      aucun `<table` n'y subsiste hors de la primitive
- [ ] AC5 — une seule implémentation de pagination est importée par la console ; le décompte
      global des composants de pagination du dépôt **diminue** (5 → au plus 3), et la PR le
      reporte
- [ ] AC6 — aucun écran ne perd un geste : chaque table migrée conserve tri, filtres et menu
      d'actions, éprouvé par les tests existants qui ne sont pas réécrits pour passer
- [ ] AC7 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Créer les primitives : c'est TCK-357.
- La traduction du vocabulaire `app-*` : c'est TCK-372, et ce ticket la suppose faite.
- Le graphique et les locales : TCK-374.
- Une refonte de la mise en page des écrans : ce ticket échange des composants, il ne
  redessine pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_
