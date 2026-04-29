---
id: TCK-117
title: i18n — traduire les chaînes anglaises restantes du back-office
status: todo
phase: P1
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
tags: [front, bug, p1, i18n, translations]
---

## Objectif utilisateur

L'utilisateur francophone du back-office ne voit plus de chaînes en anglais dans l'interface.

## Contrat de données

Aucun changement backend. Corrections dans les fichiers de traduction front (`messages/fr.json` ou équivalent) et/ou dans les composants.

## Direction UX / Artistique

Toutes les chaînes doivent correspondre au glossaire métier francophone déjà en place dans le reste de l'interface.

## Contraintes strictes (métier)

Les clés i18n doivent être ajoutées dans le fichier de traduction FR — ne pas hardcoder les chaînes directement dans les composants.

## Delta à produire

- [ ] **Formulaire "Publier un bien"** — Options des selects "Type de bien" (`apartment`, `villa`, `house`…) et "Type de contrat" (`rent`, `sale`) : ajouter les traductions FR correspondantes dans le dictionnaire et utiliser `t()` dans le composant
- [ ] **Page Messagerie `/app/messages`** — Bouton "+New group" → "+Nouveau groupe" ; placeholder "Select a conversation to view messages." → version FR
- [ ] **Header dashboard** — Placeholder de la barre de recherche "Search a city, neighborhood..." → version FR
- [ ] Auditer les autres placeholder/label/button dans le back-office pour détecter d'éventuelles chaînes anglaises résiduelles

## Critères d'acceptation

- [ ] Le formulaire de création de bien n'affiche plus de valeurs de select en anglais
- [ ] La page messagerie n'affiche plus "+New group" ni "Select a conversation…"
- [ ] Le header du dashboard n'affiche plus le placeholder anglais
- [ ] Aucune régression sur les pages déjà traduites

## Hors périmètre

- Ajout d'une langue supplémentaire (wolof, anglais)
- Traduction des contenus saisis par les utilisateurs (titres de biens, descriptions)

## Notes d'implémentation

_(à remplir par implementing-specs)_
