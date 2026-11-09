---
id: TCK-2516
title: Pages légales « Sommaire et repères » : sommaire, ancres par partie, repère de lecture
status: todo
phase: P1
family: front
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#210-pages-légales-publiques"
  models: []
tags: [front, legal, mobile, audit-ux]
---

## Objectif utilisateur

Trouver la partie qui répond à sa question (« puis-je annuler ? », « qui garde mes données ? ») en deux touchers au lieu de 20 800 px de défilement, et pouvoir envoyer le lien de cette partie.

## Contrat de données

Aucun. Le texte vient de `takussan-web/src/content/legal/` ; le sommaire se dérive des titres du texte.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=legales&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Téléphone : sommaire repliable en tête ; en lisant, une barre fine dit la partie en cours (« 6. Annonces »), avance avec la lecture et rouvre le sommaire en feuille.
- Bureau : sommaire à gauche, qui suit la lecture ; colonne de lecture à 68 caractères. Téléphone : 16 px, interligne 1,7.
- Le sur-titre « Informations légales » disparaît ; « Autres documents » remonte en tête.
- La barre d'onglets publique reste (ce sont des pages du site, pas des liens).

## Contraintes strictes (métier)

- **Le texte ne change pas** : seule la mise en page change, rien à refaire relire. Le français fait foi ; la mention de traduction et l'état « texte à fournir » restent.
- Chaque partie porte une ancre stable et partageable (`#partie-6`) ; URL canonique et `hreflang` déclarées.
- Les pages restent rendues côté serveur ; le suivi de section est une amélioration (le sommaire et les ancres marchent sans JavaScript).
- La dénomination sociale manquante dans `editeur.ts` est du **contenu** à compléter avant l'ouverture publique, pas de ce ticket (spec § 2.10).

## Delta à produire

- [ ] Sommaire dérivé des titres, ancres par partie.
- [ ] Repère de lecture (téléphone) et sommaire qui suit (bureau).
- [ ] Canonique et `hreflang`.
- [ ] Mise en page de lecture (mesure, corps, interligne).
- [ ] Tests (sommaire = titres du texte, ancres stables, état « texte à fournir » inchangé, canonique présente).

## Critères d'acceptation

- [ ] AC1 — Le sommaire des CGU liste exactement les titres de premier niveau du texte, dans l'ordre ; ajouter un titre au texte l'ajoute au sommaire sans autre écriture.
- [ ] AC2 — `/fr/legal/terms#partie-17` ouvre la page sur « 17. Suspension et fin du compte ».
- [ ] AC3 — Sans JavaScript, sommaire et ancres fonctionnent.
- [ ] AC4 — Un document sans texte français affiche toujours l'état « texte à fournir ».

## Hors périmètre

- Le contenu (dénomination sociale, RCCM, NINEA…) et la relecture par l'avocat.

## Notes d'implémentation

_(à remplir par implementing-specs)_
