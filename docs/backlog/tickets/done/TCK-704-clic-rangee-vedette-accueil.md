---
id: TCK-704
title: "Rangée vedette de l'accueil : un clic sur une carte marque l'arrivée sponsorisée"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-18--statistiques-boost-face-aux-robots-aux-rendus-serveur-et-aux-revalidations
tags: [front, boost, homepage, pistes]
---

## Contexte

Réf : **P18.02** du fichier de pistes, `retenu · autonome` (classement A1 : le comportement attendu
est écrit dans l'ADR-0061).

L'ADR-0061 § 7 fait de la rangée vedette de l'accueil un emplacement, et l'API compte une
impression par bien qu'elle y sert (`HomepageDiscoveryService`). Le § 10 définit le clic comme
« une vue de la fiche arrivée par un lien d'emplacement » : la fiche ne le compte que si le slug a
été noté par `marquerArriveeSponsorisee`. Seul `EmplacementsSponsorises` (page `/properties`) le
note ; la rangée vedette passe par `PropertyRow`, qui ne note rien. Ses impressions ne peuvent donc
jamais devenir des clics, et le taux de clic de la console super-admin, qui somme toutes les
surfaces, est biaisé vers le bas.

Hypothèse (mode sans humain) : la piste offre deux issues ; le classement A1 du mesureur ne couvre
que la première, « marquer l'arrivée depuis la rangée vedette ». C'est elle qui est implémentée.
Tout bien servi par la rangée a compté une impression (le vivier est filtré sur `featured`) : tout
clic sur une de ses cartes est marqué, sans regarder `property.featured`.

## Objectif utilisateur

L'annonceur d'une Vedette voit compter les visites que la rangée vedette de l'accueil lui amène,
comme celles qu'amène l'emplacement de la recherche.

## Contrat de données

Aucun changement d'API. Le front réutilise `marquerArriveeSponsorisee(slug)`, que le compteur de
vue de la fiche consomme déjà (`CompteurDeVue`).

## Delta à produire

- [x] `PropertyRow` : une option `emplacementSponsorise` ; quand elle est posée, un clic sur un lien
      d'une carte note l'arrivée sponsorisée du bien de cette carte. Rien ne change à l'affichage.
- [x] `HomepageDiscovery` : la rangée vedette passe cette option, et elle seule.
- [x] Tests : `PropertyCard.robe.test.tsx` (le clic marque, et une rangée sans l'option ne marque
      rien) et `HomepageDiscovery.test.tsx` (seule la rangée vedette est un emplacement).

## Critères d'acceptation

- [x] AC1 — dans une rangée `emplacementSponsorise`, un clic sur le lien d'une carte rend
      `consommerArriveeSponsorisee(<slug de cette carte>)` vrai, une seule fois.
- [x] AC2 — dans une rangée sans l'option, le même clic ne note rien.
- [x] AC3 — sur l'accueil, la rangée vedette porte l'option ; les rangées « Près de toi »,
      « À louer », « À vendre » et « Dernières annonces » ne la portent pas.

## Hors périmètre

- La variante « ne pas compter cette rangée, et le dire dans l'ADR » de la piste.
- Le double comptage des impressions quand la ville est devinée (P18.03), les robots (P18.04).
- Distinguer les surfaces dans la console super-admin.

## Notes d'implémentation

- **Ablation** : retirer `onClickCapture` du défileur de `PropertyRow` → AC1 rouge (le slug
  n'est pas noté), le reste vert ; retirer `emplacementSponsorise` de la rangée vedette dans
  `HomepageDiscovery` → AC3 rouge ; remis → 27 verts sur les deux fichiers.
- **Piège** : la carte ne peut pas être enveloppée. `DISPOSITIONS` impose la largeur à chaque
  enfant DIRECT du défileur (`[&>*]:w-…`, `snap-start`) : un `<li>` ou un `<div>` autour de la carte
  casserait la mise en page. L'écouteur est posé une fois, en capture, sur le défileur, et le bien
  se retrouve par le rang de l'enfant qui contient le lien cliqué.
