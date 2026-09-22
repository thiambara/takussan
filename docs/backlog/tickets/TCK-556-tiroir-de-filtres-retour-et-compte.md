---
id: TCK-556
title: "Tiroir de filtres mobile : le geste retour défait un filtre au lieu de fermer le tiroir, et « Voir les résultats » ne dit pas combien"
status: todo
phase: P2
family: front
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, filtres, historique, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur règle ses filtres dans le tiroir, sait combien de biens il va voir
avant de le fermer, et le referme par le geste retour de son téléphone sans perdre ses choix.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats F1 à F3), à 360 × 740.

- **F2** — chaque puce touchée dans le tiroir applique le filtre et **empile** une entrée
  d'historique (choix de TCK-335, étape 5). Mesuré : deux puces → `history.length` + 2 ; un
  `history.back()` tiroir ouvert rend `type=villa` au lieu de `type=villa,house`, et **le tiroir
  reste ouvert**. Sur Android, le geste retour — le réflexe pour fermer un panneau — défait donc un
  filtre, sous le tiroir, sans que la personne le voie.
- **F1** — le bouton de pied du tiroir dit « Voir les résultats » alors que le total, déjà connu de
  la page, est caché par le tiroir (90 % de la hauteur).
- **F3** — la recherche libre en cours (`q=Dakar`) n'apparaît nulle part dans le tiroir.

Revue adverse intégrée : le `push` de TCK-335 est juste **tiroir fermé** (retour = défaire le dernier
filtre posé depuis la page) ; il n'est faux que tiroir ouvert. Et `q` ne doit pas être recopié dans
le champ « Ville » : c'est du texte libre, pas une ville.

## Contrat de données

Aucun endpoint. Le compte est `meta.total` de la recherche courante, déjà appliquée en direct.

## Direction UX / Artistique

- Tiroir ouvert, le geste retour **ferme le tiroir** et rien d'autre.
- Le bouton de pied annonce le nombre de biens (« Voir 140 biens ») et le cas zéro.
- La recherche libre en cours est rappelée en tête du tiroir, retirable d'un geste.

## Contraintes strictes (métier)

- Tiroir fermé, le comportement d'historique de TCK-335 est inchangé.
- Fermer le tiroir par le geste retour ne retire aucun filtre posé pendant qu'il était ouvert.
- Libellés et pluriels via next-intl (`fr`/`en`/`wo`).

## Delta à produire

- [ ] Geste retour tiroir ouvert = fermeture du tiroir, filtres conservés.
- [ ] Bouton de pied portant le compte courant, avec un libellé propre au cas zéro.
- [ ] Rappel de la recherche libre en tête du tiroir, avec retrait.
- [ ] Tests : retour tiroir ouvert ; compte dans le bouton ; retrait de `q` depuis le tiroir.

## Critères d'acceptation

- [ ] AC1 — tiroir ouvert, toucher « Villa » puis « Maison », puis `history.back()` : le tiroir est
      fermé et l'URL contient toujours `type=villa,house` (ou son équivalent encodé).
- [ ] AC2 — tiroir fermé, le retour arrière défait le dernier filtre comme aujourd'hui (test de
      TCK-335 toujours vert).
- [ ] AC3 — le libellé du bouton de pied contient le total affiché par le compteur de la page, et
      change quand un filtre le change.
- [ ] AC4 — sous `q=Dakar`, le tiroir affiche « Dakar » en tête ; le retirer fait disparaître `q`
      de l'URL ; le champ « Ville » reste vide.

## Hors périmètre

- Un mode « brouillon » où rien ne s'applique avant validation (non retenu : la page applique déjà
  en direct, et le compte dans le bouton suffit à informer).
- Le contenu des sections de filtres.

## Notes d'implémentation

_(à remplir par implementing-specs)_
