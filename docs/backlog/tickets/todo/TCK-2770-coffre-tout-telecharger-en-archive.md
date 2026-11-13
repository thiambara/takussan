---
id: TCK-2770
title: "Coffre de documents : « Tout télécharger » — une archive .zip d'un dossier, servie par l'API"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2656]
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
tags: [back, front, documents, archive, suite-de-tck-2656, audit-ux, app]
---

## Objectif utilisateur

Le locataire qui doit fournir ses quittances de l'année, à une banque ou à un nouveau bailleur, les récupère
en un seul geste depuis le dossier « Quittances 2026 ». Il n'a pas à les télécharger une par une.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 14 : ticket de suivi (archive .zip).

**Constat (2026-11-13).** La maquette du coffre (`app-documents` a) porte « Tout télécharger » sur le dossier
replié des quittances. Aucun endpoint ne sert d'archive. TCK-2656 (décision 3 (a)) a donc retiré le geste.

**Delta côté API.** Un endpoint qui produit l'archive `.zip` d'un dossier du coffre (`folder` = la clé du
dossier : `receipts:2026`, `lease:22`…) :

- les PDF générés y sont rendus comme par leur `download_path` ;
- les pièces téléversées passent par `PrivateMediaAccess` ;
- tout est jugé par la même règle de lecture que chaque entrée.

L'archive se construit hors de la requête si elle est lourde : file `media` et lien signé à durée courte,
comme les exports existants. Ce ticket tranche le seuil.

**Delta côté front.** « Tout télécharger » sur un dossier replié (quittances, relevés), comme la maquette.
Il porte un état en cours et un échec lisible.

## Contraintes strictes

- Une pièce interne (TCK-2759) ou refusée par la règle d'auteur n'entre jamais dans l'archive.
- Jamais de chemin local (`getPath()`) : les médias sont sur R2 en production (ADR-0029).

## Critères d'acceptation

1. L'archive de « Quittances 2026 » contient exactement les quittances que le coffre liste dans ce dossier.
2. Un dossier d'un autre locataire rend 404, pas une archive vide.
3. Une pièce interne d'une fiche client n'y figure pas.

## Hors périmètre

- La recherche dans le coffre (TCK-2769).
