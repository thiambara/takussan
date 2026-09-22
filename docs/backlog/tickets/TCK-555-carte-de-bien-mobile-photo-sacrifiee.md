---
id: TCK-555
title: "Carte de bien sur mobile : une photo de 117 px de haut sous quatre surimpressions — la grille à deux colonnes sacrifie le premier critère de choix"
status: todo
phase: P2
family: front
estimate: M
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: [TCK-554]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, carte-de-bien, recherche, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur juge un bien au premier coup d'œil — photo, prix, lieu, taille — en
faisant défiler la liste.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats C1, C3 à C7).

- **C1** — sous `md`, la grille est à deux colonnes : cartes de 156 à 171 px, photo de 117 à 128 px
  de haut, sur laquelle se superposent **quatre** éléments (pastille de transaction, favori,
  comparateur, « il y a X mois »).
- **C3** — le comparateur est posé sur la photo de chaque carte, collé au favori.
- **C4** — « il y a 13 mois » est affiché en surimpression sur la photo.
- **C5** — sous le filtre Location, chaque carte répète la pastille « En location ».
- **C6** — le titre réserve toujours deux lignes (`h-10`) : 20 px de vide sous un titre d'une ligne.
- **C7** — un loyer dont la période est absente s'affiche comme un prix de vente
  (« 950 000 F CFA » sans « /mois ») — cas présent dans les données de semis.

**Arbitrage de C1** — la revue adverse a retourné la correction initiale. Une colonne pleine
largeur dégage la photo mais double la longueur de la liste (~12 000 px pour 30 biens) ; une
ligne horizontale (photo à gauche, texte à droite) est plus dense mais change la silhouette de la
variante Listing de `docs/design-guidelines.md`.

> **Décision (2026-09-22) : colonne unique sous `md`.** Prise par la session d'implémentation sur
> l'instruction « implémente tout les tickets de A à Z », sans arbitrage produit préalable : c'est
> le motif le plus répandu des applications immobilières mobiles, et le seul qui garde la
> silhouette verticale de la variante Listing. **Réversible** : la ligne horizontale reste une
> alternative à éprouver si la longueur de liste se révèle coûteuse à l'usage.

## Contrat de données

Aucun endpoint. Champs déjà présents dans la réponse de liste (`contract_type`, `rent_period`,
`published_at`, `condition`).

## Direction UX / Artistique

- La photo est le premier signal : au plus **deux** éléments posés dessus (transaction ou état
  « Neuf », et le favori).
- Le comparateur **reste sur la carte** (fonction du produit, TCK-082) mais quitte la photo : action
  secondaire, loin du favori.
- L'ancienneté **reste visible** — une vieille annonce est un signal de confiance utile — mais en
  texte, dans la ligne de détails, et non sur la photo.
- La pastille de transaction est masquée quand la liste entière est filtrée sur cette transaction.
- La hauteur réservée au titre ne se justifie que si des cartes voisines doivent s'aligner : elle
  suit la disposition retenue.
- Un loyer sans période ne se lit pas comme un prix de vente.

## Contraintes strictes (métier)

- Les quatre variantes de cartes et la direction « Ancrage Local Contemporain » restent la
  référence (`docs/design-guidelines.md`) : une nouvelle silhouette mobile y est consignée.
- Bureau inchangé.
- `sizes` des images mis à jour pour la nouvelle largeur (`card-image-sizes.ts` porte le relevé).

## Delta à produire

- [ ] Disposition mobile de la carte : une colonne sous `md`.
- [ ] Surimpressions sur la photo réduites à deux au plus.
- [ ] Comparateur déplacé hors de la photo.
- [ ] Ancienneté en texte dans la ligne de détails.
- [ ] Pastille de transaction masquée sous filtre de transaction.
- [ ] Hauteur de titre réservée seulement si la disposition l'exige.
- [ ] Repli de libellé pour un loyer sans période.
- [ ] `sizes` des images recalculés.

## Critères d'acceptation

- [ ] AC1 — à 360 px, la photo de la première carte mesure au moins 210 px de haut (1,8 fois les
      117 px relevés), et la grille est à une colonne sous `md` ; à partir de `md`, le nombre de
      colonnes est inchangé.
- [ ] AC2 — au plus deux éléments sont positionnés au-dessus de la photo d'une carte.
- [ ] AC3 — le comparateur n'est pas au-dessus de la photo, et sa zone tactile ne touche pas celle
      du favori.
- [ ] AC4 — sous `contract_type=rent`, aucune carte n'affiche de pastille de transaction ; sans
      filtre de transaction, toutes l'affichent.
- [ ] AC5 — un bien en location sans `rent_period` n'affiche pas un montant nu identique à celui
      d'une vente.
- [ ] AC6 — l'ancienneté de l'annonce reste lisible sur la carte.

## Hors périmètre

- La structure du lien et des boutons (TCK-554, préalable).
- L'espacement vertical entre rangées (constat C8, retiré par la revue adverse : il suit la
  disposition retenue).
- La photo absente elle-même (données de semis sans médias).

## Notes d'implémentation

_(à remplir par implementing-specs)_
