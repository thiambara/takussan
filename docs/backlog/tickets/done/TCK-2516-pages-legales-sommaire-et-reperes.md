---
id: TCK-2516
title: Pages légales « Sommaire et repères » : sommaire, ancres par partie, repère de lecture
status: done
phase: P1
family: front
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-09
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

- [x] Sommaire dérivé des titres, ancres par partie.
- [x] Repère de lecture (téléphone) et sommaire qui suit (bureau).
- [x] Canonique et `hreflang`.
- [x] Mise en page de lecture (mesure, corps, interligne).
- [x] Tests (sommaire = titres du texte, ancres stables, état « texte à fournir » inchangé, canonique présente).

## Critères d'acceptation

- [x] AC1 — Le sommaire des CGU liste exactement les titres de premier niveau du texte, dans l'ordre ; ajouter un titre au texte l'ajoute au sommaire sans autre écriture.
- [x] AC2 — `/fr/legal/terms#partie-17` ouvre la page sur « 17. Suspension et fin du compte ».
- [x] AC3 — Sans JavaScript, sommaire et ancres fonctionnent.
- [x] AC4 — Un document sans texte français affiche toujours l'état « texte à fournir ».

## Hors périmètre

- Le contenu (dénomination sociale, RCCM, NINEA…) et la relecture par l'avocat.

## Notes d'implémentation

**Relevé avant code (2026-11-09).** CGU : 21 titres `# ` en `fr` comme en `en`, même plan ;
mentions légales : titres NON numérotés (`# Éditeur`…). `TexteJuridique` rendait les titres sans
`id` ; aucune canonique ni `hreflang` sur les trois pages (`noindex, follow` seul).

- **Ancre = position, pas texte** : `partie-N` (N = rang du titre `# `), sous-parties
  `partie-N-M`. Une coquille corrigée, ou la page lue en anglais, ne cassent pas un lien partagé ;
  les mentions légales, non numérotées, ont leurs ancres aussi. Une seule fonction
  (`ancresDesTitres`) les calcule pour le sommaire ET le rendu.
- **Sans JavaScript** (AC3) : le sommaire est un composant client, mais rendu par le serveur — ses
  `<a href="#partie-N">` sont dans le HTML servi (relevé : `curl` → 3 × `href="#partie-17"`,
  1 × `id="partie-17"`, 1 × `<details>`). Le sommaire repliable du téléphone est un `<details>`
  natif. Seuls le surlignage et la barre de lecture demandent JavaScript.
- **Barre de lecture en `fixed`, pas `sticky`** : apparaissant au passage de la partie 1, une barre
  dans le flux pousserait le texte de 48 px pendant la lecture. `scroll-mt-32` sur les titres
  (Navbar fixe 69 px + barre 48 px) : relevé au navigateur, `#partie-6` et `#partie-17` posent
  leur titre à 128 px du haut, sous la barre.
- **Choisir une partie dans la feuille** : l'ancre n'est suivie qu'une fois la feuille FERMÉE
  (`onOpenChangeComplete` de base-ui) — ouverte, son verrou de défilement avalerait le saut.
- Canonique + `hreflang` par `alternatesPubliques(ROUTES_LEGALES[doc], locale)` dans
  `metadonneesLegales` ; `robots` reste écrit dans chaque `page.tsx` (`sitemap-couverture`).
- « Autres documents » : deux emplacements (puces en tête au téléphone, colonne de gauche au
  bureau), l'un `lg:hidden`, l'autre `hidden lg:block`. Le bloc du bas de page est retiré.
- Le texte de `src/content/legal/*` n'est pas touché (`git diff` vide) ; `legal.eyebrow` retiré
  des trois dictionnaires (plus lu nulle part).
- Accessibilité (revue adverse) : le lien d'ancre est le FRÈRE qui suit le titre, jamais son
  enfant — dedans, il entrait dans le nom accessible du titre (« 17. Suspension et fin du compte
  Lien vers la partie « … » »). Le titre et son lien vivent dans un `div` flex qui porte la marge ;
  l'`id` `partie-N` reste sur le titre ; le nom du lien est court et fixe (`legal.anchorLink` :
  « Lien vers cette partie »).
- Écart à la maquette : pas de ligne « Version du … · environ 17 min de lecture » sous le titre
  (la version est déjà la première ligne du texte ; une durée de lecture n'est pas demandée par le
  delta), ni de bouton flottant « Haut » (la barre d'onglets et la barre « Comparer » occupent déjà
  le bas de l'écran ; la barre de lecture rouvre le sommaire).

