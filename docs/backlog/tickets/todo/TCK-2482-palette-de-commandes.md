---
id: TCK-2482
title: Palette de commandes ⌘K / Ctrl K — destinations, action principale, files « À traiter », bascule de profil, pages récentes
status: todo
phase: P2
family: front
estimate: M
wave: 82
created: 2026-11-05
updated: 2026-11-05
depends_on: [TCK-2479]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#profils--contexte-actif-tck-138--tck-142"
  models: []
tags: [front, navigation, coque, adr-0089, clavier]
---

## Objectif utilisateur

Aller n'importe où dans son espace, ou changer d'espace, en tapant trois lettres — sans chercher
dans le menu.

## Contrat de données

- Le catalogue et la composition (TCK-2477, TCK-2478) : la palette liste toutes les destinations
  ACCESSIBLES, « Plus » et complément compris.
- Les pastilles « À traiter » (TCK-2479).
- `GET /api/me/profiles` et `PATCH /api/me/active-profile` (déjà utilisés par le `ProfileSwitcher`)
  pour « Passer à : Bailleur · Agence X ».
- Pages récentes : mémorisées sur l'appareil (`localStorage`, lecture et écriture sous `try/catch`).

## Direction UX / Artistique

- S'ouvre par ⌘K / Ctrl K et par un bouton de recherche de la barre haute.
- Résultats groupés : Actions (➊), À traiter, Aller à, Espaces, Récents.
- Recherche sur les libellés traduits ET sur des synonymes déclarés dans les messages (« loyer » →
  Paiements, « clients » → CRM).
- Clavier d'abord : flèches, Entrée, Échap ; aucune souris requise.

## Contraintes strictes (métier)

- **Aucune nouvelle dépendance**, et aucune dépendance Radix (`cmdk` est exclu) : `Dialog` de Base UI
  et motif ARIA combobox/listbox.
- N'affiche jamais une destination inaccessible ; ne cherche aucune donnée métier (biens, clients)
  dans cette version.
- Ne capture pas ⌘K quand le focus est dans un champ qui l'utilise déjà (à relever : éditeurs riches).
- Synonymes et libellés dans les trois langues (le wolof porte le français tel quel).

## Delta à produire

- [ ] Palette, ouverture clavier et bouton.
- [ ] Sources : catalogue composé, action principale, « À traiter », espaces, récents.
- [ ] Synonymes i18n et recherche tolérante aux accents (`é` = `e`).
- [ ] Tests : ouverture/fermeture et retour du focus ; filtrage ; synonymes ; bascule de profil ;
      inaccessibles absents ; rôles ARIA.

## Critères d'acceptation

- [ ] AC1 — Ctrl K ouvre la palette, Échap la ferme et rend le focus à l'élément précédent.
- [ ] AC2 — Chez un locataire, taper « loyer » propose Paiements en premier.
- [ ] AC3 — Une destination sous « Plus » est trouvée ; une destination inaccessible au compte ne
      l'est jamais (ablation : lister le catalogue brut fait rougir le test).
- [ ] AC4 — « Passer à : … » bascule le profil actif et recompose le menu.
- [ ] AC5 — axe : aucune violation sur la palette ouverte.

## Hors périmètre

- Recherche dans les données (biens, clients, baux) — un ticket suivant, sur Meilisearch.
- Actions d'écriture autres que ➊ et la bascule de profil.

## Notes d'implémentation

_(à remplir par implementing-specs)_
