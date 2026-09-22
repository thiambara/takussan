---
id: TCK-558
title: "Zéro résultat : deux fois « aucun bien » et une seule issue, « Effacer tous les filtres », là où un seul filtre suffit souvent à retrouver des biens"
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
tags: [front, mobile, recherche, etat-vide, ux]
---

## Objectif utilisateur

Un visiteur dont la recherche ne donne rien retrouve des biens en retirant **le** critère de trop,
sans perdre tous les autres — ou choisit d'être prévenu quand un bien correspondra.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat E1, partie contenu ; la partie « contrôles inutiles » est
dans TCK-552), sur `?q=zzzqqq&contract_type=rent` à 360 × 740.

- Le compteur dit « 0 biens trouvés » et, dessous, l'état vide dit « Aucun bien trouvé » : la même
  affirmation deux fois.
- La seule action offerte est « Effacer tous les filtres » : retirer la transaction, les types, le
  prix et la recherche pour un seul critère fautif.
- L'état vide n'est pas le repli conjonctif de TCK-338 (`WidenedSearchNotice`), qui ne s'applique
  qu'aux termes de `q` ayant chacun des résultats.

Revue adverse intégrée : l'action de sauvegarde **reste** à zéro résultat — c'est précisément le cas
où une alerte sert.

## Contrat de données

Aucun endpoint nouveau. Les filtres actifs et leurs libellés viennent de `puceDeChaqueFiltreActif`
(TCK-340), déjà utilisée par les puces de la barre d'outils.

## Direction UX / Artistique

- Un seul énoncé du résultat nul.
- Les filtres actifs sont proposés, chacun retirable individuellement, dans l'état vide même.
- « Tout effacer » reste disponible, en second.
- La sauvegarde / alerte est proposée comme issue positive.

## Contraintes strictes (métier)

- Retirer un filtre depuis l'état vide suit exactement le même chemin que la puce de la barre
  d'outils (`onRemoveFilter`), valeurs multiples comprises (`type`, `condition`).
- Pas de requête supplémentaire pour « deviner » le filtre le plus restrictif dans ce ticket.

## Delta à produire

- [ ] État vide : un seul énoncé de résultat nul.
- [ ] Filtres actifs retirables un à un depuis l'état vide.
- [ ] « Tout effacer » en action secondaire ; sauvegarde proposée.
- [ ] Tests : retrait d'un filtre depuis l'état vide ; valeurs multiples ; un seul énoncé.

## Critères d'acceptation

- [ ] AC1 — sur `?q=zzzqqq&contract_type=rent`, le texte « 0 » / « aucun bien » n'apparaît qu'une
      fois dans `main`.
- [ ] AC2 — l'état vide propose deux retraits distincts (`zzzqqq`, Location) ; retirer `zzzqqq`
      laisse `contract_type=rent` dans l'URL et affiche des résultats.
- [ ] AC3 — sous `q=zzzqqq&type=villa,house` (zéro résultat), retirer « Villa » depuis l'état vide
      laisse `type=house` et `q=zzzqqq` dans l'URL.
- [ ] AC4 — l'action de sauvegarde est atteignable depuis l'écran à zéro résultat.

## Hors périmètre

- Le calcul serveur du « filtre le plus restrictif ».
- Le masquage du tri et de la bascule carte à zéro résultat (TCK-552).

## Notes d'implémentation

_(à remplir par implementing-specs)_
