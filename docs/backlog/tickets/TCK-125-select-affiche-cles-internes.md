---
id: TCK-125
title: UI Select — dropdowns affichent les clés internes au lieu des labels
status: done
phase: P2
family: bug
estimate: S
created: 2026-04-30
updated: 2026-04-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#111-avis--réputation
tags: [front, bug, p2, i18n, select, ui]
---

## Objectif utilisateur

Quand un visiteur sélectionne une option de tri sur `/properties` ou choisit un motif dans le formulaire de signalement, le bouton du select affiche le label lisible en français — pas la clé interne (`relevance`, `price_asc`, `spam`, etc.).

## Contrat de données

Aucun changement backend. Le problème est un manque de mapping `value → label` dans les composants Select côté frontend.

Selects affectés identifiés lors du QA :
- Dropdown de tri sur `/properties` : valeurs affichées `relevance`, `price_asc`, `created_desc` au lieu de "Pertinence", "Prix ↑", "Plus récent"
- Motif dans le formulaire "Signaler cette annonce" : valeur affichée `spam` au lieu de "Spam"

## Direction UX / Artistique

Le trigger du Select (bouton fermé) doit toujours afficher le label français de l'option sélectionnée. Même pattern que la correction déjà appliquée aux selects CRM dans TCK-121 (base-ui `Select.Root` avec `items={options}` pour que `SelectValue` affiche le libellé).

## Contraintes strictes (métier)

- Le fix doit être cohérent avec la solution déjà en place pour les selects CRM (TCK-121) pour ne pas créer deux patterns divergents.
- Les valeurs transmises à l'API ne doivent pas changer — seul l'affichage du trigger est concerné.

## Delta à produire

- [ ] Localiser le composant Select du tri sur `/properties` et appliquer la prop `items` avec les options `{ value, label }` pour que `SelectValue` affiche le label
- [ ] Localiser le composant Select du motif dans le modal/form "Signaler cette annonce" et appliquer le même fix
- [ ] Vérifier l'absence d'autres selects affectés sur les pages publiques (fiche bien, homepage)

## Critères d'acceptation

- [ ] Sélectionner "Prix ↑" dans le dropdown de tri affiche "Prix ↑" sur le bouton du select (pas `price_asc`)
- [ ] Sélectionner "Plus récent" affiche "Plus récent" (pas `created_desc`)
- [ ] Sélectionner "Pertinence" affiche "Pertinence" (pas `relevance`)
- [ ] Dans le formulaire de signalement, sélectionner "Spam" affiche "Spam" (pas `spam`)
- [ ] Les valeurs envoyées à l'API restent inchangées (`price_asc`, `relevance`, `spam`…)
- [ ] Aucune régression sur les selects CRM déjà corrigés par TCK-121

## Hors périmètre

- Ajout de nouvelles options de tri
- Correction des selects dans le back-office (non concernés par ce rapport QA visiteur)

## Notes d'implémentation

Scope élargi par rapport au ticket initial (2 selects → 9 selects sur l'ensemble du système) : `PropertyReportButton`, `PaymentsHistoryFilters` (×2), `SearchToolbar` (×2), `SearchFilters`, `DocumentShareDialog`, `DocumentsFilters` (×2), `PropertyListFilters` (via `FilterSelect` helper), `Navbar`. Pattern uniforme : `items={OPTIONS_ARRAY}` sur `<Select>` (= `SelectPrimitive.Root`), même approche que le fix TCK-117 sur `FormSelect.tsx`. Aucun changement côté valeurs API ni logique.
