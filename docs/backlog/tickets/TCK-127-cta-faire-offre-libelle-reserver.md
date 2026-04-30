---
id: TCK-127
title: Fiche bien — CTA "Faire une offre" devrait être libellé "Réserver"
status: todo
phase: P2
family: bug
estimate: S
created: 2026-04-30
updated: 2026-04-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#13-réservations-courte-durée--visites
tags: [front, bug, p2, i18n, ux, property-detail]
---

## Objectif utilisateur

Le visiteur voit un bouton dont le libellé reflète l'action de réservation décrite dans la spec — "Réserver" — et non une formulation générique "Faire une offre" qui sous-entend une négociation de prix.

## Contrat de données

Aucun changement backend ni API. Correction de libellé uniquement côté frontend sur la fiche bien publique (`/properties/[slug]`).

## Direction UX / Artistique

Le libellé "Réserver" est cohérent avec la terminologie de la spec §1.3 "Demander une réservation". Il doit être appliqué sur le CTA principal de la fiche bien. Si le CTA est conditionnel (location vs vente, type de bien), s'assurer que le libellé reste approprié dans les deux cas.

## Contraintes strictes (métier)

- Le libellé affiché doit correspondre à l'action réelle déclenchée (initiation d'une réservation, pas d'une offre d'achat au sens négociation immobilière).
- Si un bien est en vente, la terminologie peut adapter : "Faire une offre" peut rester pertinent pour les transactions de vente — vérifier la logique conditionnelle existante et ne corriger que le cas location/réservation si le code distingue déjà les deux cas.

## Delta à produire

- [ ] Localiser le bouton CTA de réservation sur la fiche bien (`/properties/[slug]`)
- [ ] Corriger le libellé : `"Faire une offre"` → `"Réserver"` pour les biens en location courte durée
- [ ] Vérifier si le libellé est conditionnel selon le type de transaction (location vs vente) et adapter en conséquence
- [ ] S'assurer que le libellé est dans les fichiers de traduction i18n (fr) et non en dur dans le JSX

## Critères d'acceptation

- [ ] Le CTA sur une fiche bien en location affiche "Réserver" (ou libellé conforme à §1.3)
- [ ] Le comportement du bouton (ouverture du formulaire de réservation, guard auth) est inchangé
- [ ] Le libellé est localisé via les fichiers i18n et non codé en dur
- [ ] Aucune régression sur le tunnel de réservation

## Hors périmètre

- Refonte du tunnel de réservation
- Différenciation du CTA selon la disponibilité du bien (date, statut)

## Notes d'implémentation

_(à remplir par implementing-specs)_
