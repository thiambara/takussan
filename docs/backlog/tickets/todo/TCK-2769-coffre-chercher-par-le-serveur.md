---
id: TCK-2769
title: "Coffre de documents : chercher dans le coffre par le serveur — `filter[search]` sur `GET /api/me/document-vault`, documents générés compris"
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
tags: [back, front, documents, recherche, suite-de-tck-2656, audit-ux, app]
---

## Objectif utilisateur

Le locataire, le bailleur et le prestataire cherchent « contrat », « quittance de mars » ou « assurance »
depuis leur coffre et y retrouvent **tout** ce que le coffre leur montre. Cela comprend les documents
générés par Takussan, pas seulement les pièces qu'ils ont eux-mêmes déposées.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 14 : ticket de suivi (recherche dans le coffre).

**Constat (2026-11-13).** La maquette du coffre (`app-documents` a) porte un champ « Chercher un document ».
`GET /api/me/document-vault` n'a aucun filtre de recherche. TCK-2656 (décision 2, option (c), tranchée par
le chef d'équipe) a donc posé à la place un geste « Rechercher ». Il ouvre `/app/documents?vue=recherche` :
la liste `GET /api/documents` cherchée par `filter[search]`, que ces profils avaient avant le coffre.

Cette recherche ne voit que les documents **téléversés** que la liste rend à l'appelant. Elle ignore :

- les entrées générées du coffre (contrat, états des lieux, quittances, relevés, attestations) ;
- les pièces que l'agence a déposées sur le bail du locataire.

**Delta côté API.** `filter[search]` sur `GET /api/me/document-vault`, jugé par le serveur :

- la recherche plein texte (Meilisearch) pour les pièces téléversées, bornée par le périmètre du coffre et sa
  règle de lecture (`restreindreAuxLecteursDInternes`, règle d'auteur) ;
- une correspondance sur le libellé de la catégorie et la période pour les entrées générées.

Le libellé d'une entrée générée est aujourd'hui composé par le front. Ce ticket doit donc trancher où il
vit, pour que le serveur cherche ce que l'utilisateur lit.

**Delta côté front.** Le champ « Chercher un document » de la maquette dans le coffre. La requête est envoyée
au serveur (`filter[search]`), gardée dans l'URL, et le geste « Rechercher » de TCK-2656 est retiré.

## Contraintes strictes

- **Jamais de filtre côté client sur le coffre chargé** : la recherche passe par le serveur.
- Pas de reconnaissance de texte (OCR) : on cherche dans les noms, descriptions, catégories et périodes,
  jamais dans le contenu d'un fichier.
- Une pièce interne d'une fiche client (TCK-2759) n'est jamais trouvable par qui ne la lit pas.

## Critères d'acceptation

1. Le locataire qui cherche « quittance » trouve ses quittances générées de l'année. Une régression qui ne
   chercherait que les téléversements échoue.
2. « assurance » trouve la pièce « Assurance habitation » qu'il a déposée, et pas celle d'un autre bail.
3. L'agent suspendu qui a déposé une pièce interne ne la trouve pas (même règle que TCK-2759 r4).
4. Le total et la pagination sont ceux du serveur.

## Hors périmètre

- La recherche de la bibliothèque de l'agence (inchangée).
- L'archive « Tout télécharger » (TCK-2770).
