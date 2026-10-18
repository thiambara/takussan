---
id: TCK-901
title: "Liste des documents : le fichier et la version active se lisent sur les médias préchargés, plus par deux requêtes par ligne"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-20--nombre-réel-de-requêtes-sql-par-écran"
tags: [back, performance, n+1, pistes]
---

## Contexte

Réf : **P20.05** du fichier de pistes, `retenu · autonome` (A2, A6).

`DocumentResource` rend le fichier par `getFirstMedia('file')` et la version active par
`Document::activeVersion()`. `DocumentController::index()` ne chargeait pas `media`, et
`activeVersion()` interroge la table à chaque appel : deux requêtes `media` par ligne. Le
commentaire de la ressource disait lire la version active « if the collection is loaded », ce que
le code ne faisait pas.

## Objectif utilisateur

Aucun changement visible : la liste des documents rend le même fichier et la même version active,
en un nombre de requêtes qui ne croît plus avec la page.

## Contraintes strictes

- Réponse inchangée : même `file_*`, même `active_version`.
- `Document::activeVersion()` garde sa requête directe : les chemins d'écriture (téléversement,
  restauration) l'appellent après avoir modifié la table, et une relation chargée y serait périmée.
- Aucun changement de périmètre ni de tri de la liste.

## Delta à produire

- [x] `->with('media')` dans `DocumentController::index()`.
- [x] `DocumentResource` : la version active se choisit sur la relation `media` quand elle est
      chargée, et par `activeVersion()` sinon ; le commentaire dit ce que fait le code.
- [x] `tests/Feature/Api/DocumentIndexQueryBudgetTest.php`.

## Critères d'acceptation

- [x] AC1 — `GET /api/documents` avec les champs du front (`DOCUMENT_LIST_FIELDS`) : autant de
      requêtes `media` pour 2 documents que pour 12, chacun avec un fichier et deux versions ;
      `file_name` rendu et `active_version.version_number` = 2.
- [x] AC2 — Après restauration de la version 1, la liste rend la version que `activeVersion()`
      désigne.

## Hors périmètre

- La garde générale contre la requête par ligne : P20.06.
- `GET /api/documents/{id}` (une seule ligne) : inchangé, il passe par `activeVersion()`.

## Notes d'implémentation

- **Mesure avant** : 4 requêtes `media` pour 2 documents, 24 pour 12 (deux par ligne).
- **Ablation** : correctif entier retiré → 4 → 24, rouge ; ressource seule retirée → 3 → 13 ;
  `with('media')` seul retiré → 2 → 12 ; remis → vert. Chaque moitié est donc gardée.
- `include=versions` n'est pas un include autorisé de la liste (400) : `versions` n'y est jamais
  rendu, le test ne le demande pas.
