---
id: TCK-2493
title: Barre d'onglets publique au téléphone, dont les cases suivent le profil connecté
status: todo
phase: P1
family: front
estimate: L
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: [TCK-2494]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, mobile, adr-0091, audit-ux]
---

## Objectif utilisateur

Au téléphone, sur le site public, chacun trouve sous le pouce ce qui l'attend — le chercheur ses favoris et ses visites, le locataire son loyer, l'agent ses demandes — sans que trois couches flottantes recouvrent la page.

## Contrat de données

Aucun endpoint neuf. Les cases 2 et 3 se lisent dans `DISPOSITIONS[persona].onglets` (ADR-0089), les compteurs sont ceux du menu de `/app` ; le persona se résout comme dans la coque (profil actif). Règle complète : [ADR-0091](../../../adr/0091-la-navigation-mobile-du-site-public-suit-le-profil.md) § Décision 2 à 4.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=navigation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Par profil », « Anonyme », « Locataire », « Agent », « Compte », « Moi chercheur », « Moi agent », « Fiche ».
- Forme « barre classique » : cinq cases égales, icône et libellé toujours visibles ; la case active se lit par une forme et un poids, pas par la seule couleur.
- « Moi » porte l'avatar en initiales et ouvre l'espace du persona : sélecteur d'espace en tête s'il y en a plusieurs, « Publier un bien » en tête pour les pros, groupes de la disposition, puis langue, aide, légal, déconnexion. « Compte » (anonyme) : connexion par numéro, ce que le compte garde, publier gratuitement, réglages.
- Le comparateur devient une pastille « Comparer N » au-dessus de la barre ; le bouton « Messagerie » flottant disparaît.
- Accueil connecté : une carte de rappel du persona en tête (loyer dû pour le locataire, prochaine visite pour l'agent…), validée par le porteur le 2026-11-08.
- ⚑ Écart de charte accepté (ADR-0091) : la règle « une seule couche d'action en bas à la fois » s'écrit dans `docs/design-guidelines.md`.

## Contraintes strictes (métier)

- Sous `lg` seulement ; rien de la page n'est caché sous la barre (dernier bouton atteignable, cf. TCK-503), zone sûre respectée.
- Absente sur la fiche d'un bien (sa barre d'actions la remplace), dans les tunnels (visite, paiement, revendication, publication), sur les pages par lien et sur la carte plein écran.
- Une case inaccessible au persona cède sa place à la destination suivante de sa disposition, jamais un cadenas (même règle que TCK-2481).
- L'anonyme n'a pas de compteur sur Messages ; Messages et Moi demandent une session, Compte et Favoris non (favoris de l'appareil).
- Changer d'espace change la barre sans recharger la page.

## Delta à produire

- [ ] Barre d'onglets publique, dérivée de la disposition du persona (une seule source avec `/app`).
- [ ] Écrans « Compte » (anonyme) et « Moi » (connecté, par persona).
- [ ] Règle des couches : pastille du comparateur, retrait du bouton Messagerie flottant, masquage de la barre là où une autre couche d'action vit.
- [ ] Carte de rappel du persona en tête de l'accueil connecté.
- [ ] Retrait du menu hamburger public (son contenu passe dans Compte / Moi).
- [ ] Règle écrite dans `docs/design-guidelines.md`.
- [ ] Tests : cases par persona (les huit lignes du tableau d'ADR-0091), case inaccessible remplacée, absence sur fiche et tunnels, `nav` nommée et `aria-current`.

## Critères d'acceptation

- [ ] AC1 — À 390 px, chaque persona voit exactement les cases du tableau d'ADR-0091 ; à 1024 px, ni barre ni réserve de hauteur.
- [ ] AC2 — Sur une fiche et sur `/pay/[token]`, aucune barre d'onglets ni pastille du comparateur.
- [ ] AC3 — Avec trois biens au comparateur, la surface recouverte en bas de l'accueil mesure au plus la barre plus la pastille (mesure au navigateur, comparée au relevé de l'audit).
- [ ] AC4 — Un compte agent à deux espaces voit sa barre passer de « Demandes · Visites » à « Mes biens · Demandes » en changeant d'espace depuis « Moi ».
- [ ] AC5 — Le dernier élément focalisable de l'accueil et de la liste est atteignable au-dessus de la barre à 360 et 390 px.

## Hors périmètre

- L'en-tête de bureau et le menu « Mon espace » (TCK-2494).
- Le contenu des pages Favoris, Messages ou Publier.
- Le choix des onglets par l'utilisateur.

## Notes d'implémentation

_(à remplir par implementing-specs)_
