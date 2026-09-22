---
id: TCK-557
title: "La pagination de la liste des biens est faite de <button> sans href : pages 2 et suivantes introuvables par un robot, cibles de 36 px"
status: todo
phase: P1
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
tags: [front, mobile, pagination, seo, a11y]
---

## Objectif utilisateur

Un visiteur change de page d'un tap sûr, sait où il en est, peut ouvrir une page dans un nouvel
onglet — et un moteur de recherche atteint les biens des pages suivantes par la liste.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat G1).

- `Pagination` rend des `<button onClick>` : aucun `href`. Les pages 2 et suivantes de
  `/properties` ne sont atteignables par aucun lien — un robot ne les suit pas, un visiteur ne peut
  ni les ouvrir dans un onglet ni copier leur adresse. TCK-432 a rendu les biens présents dans le
  HTML de la première réponse ; la pagination, elle, ne l'est toujours pas.
- Les cibles font 36 × 36 px ; rien n'indique « page X sur Y ».
- Au changement de page, la vue remonte en haut du document (`h1` à 101 px), au-dessus des contrôles,
  plutôt qu'au début des résultats.

Revue adverse intégrée : un « voir plus » en défilement infini a été écarté — il casserait la
restauration du défilement (TCK-335) et l'exploration par les robots. La pagination numérotée reste ;
elle devient faite de liens.

## Contrat de données

Aucun endpoint. `meta.current_page` et `meta.last_page`, déjà reçus.

## Direction UX / Artistique

- Des liens de page, dont la navigation reste instantanée côté client.
- Cibles de 44 px, position courante lisible (« Page 2 sur 5 »).
- Après un changement de page, la vue arrive au début des résultats.

## Contraintes strictes (métier)

- Chaque lien de page porte l'URL complète : filtres courants conservés, `page` mis à jour, `page=1`
  omis — la même forme que la canonique (`lib/canonique`).
- La restauration du défilement au retour arrière (TCK-335) n'est pas dégradée.

## Delta à produire

- [ ] Pagination rendue en liens `href`, interceptés pour une navigation client.
- [ ] Cibles de 44 px et indication de la page courante sur le total.
- [ ] Défilement vers le début des résultats après changement de page.
- [ ] Tests : `href` de chaque page ; conservation des filtres ; `page=1` omis.

## Critères d'acceptation

- [ ] AC1 — dans le HTML **servi** de `/fr/properties?contract_type=rent` (avant hydratation), un
      `<a href>` mène à `…contract_type=rent&page=2` (ordre des paramètres indifférent).
- [ ] AC2 — le lien de la page 1 ne contient pas `page=`.
- [ ] AC3 — à 360 px, chaque cible de pagination mesure au moins 44 × 44 px, et la pagination tient
      sur une rangée sans débordement **au pire cas** : page 5 d'au moins 10 pages (la forme
      actuelle y rend 9 éléments, soit 428 px pour 328 disponibles — le nombre d'éléments affichés
      sous `md` doit donc baisser).
- [ ] AC4 — après passage en page 2, le haut de la première carte est dans le viewport, sous la `nav`.
- [ ] AC5 — un retour arrière depuis une fiche ouverte en page 2 restaure la position de défilement.

## Hors périmètre

- `rel="next"`/`rel="prev"` et la canonique (TCK-433).
- Le nombre de résultats par page.

## Notes d'implémentation

_(à remplir par implementing-specs)_
