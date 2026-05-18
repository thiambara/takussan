---
id: TCK-189
title: Biens owner — gestion portefeuille complète
status: done
phase: P1
family: front
estimate: L
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-041, TCK-120, TCK-148]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
    - docs/models-spec.md#26-propertypricehistory-
tags: [front, owner, properties, media, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit gérer son portefeuille de biens avec les filtres, statuts, médias et sections métier attendus.

## Contrat de données

La gestion de biens s'appuie sur `Property`, `Address`, médias Spatie, tags, historique de prix, statut de publication et relations du portefeuille owner. Les listes doivent utiliser les filtres serveur et sparse fieldsets.

## Direction UX / Artistique

Interface de portefeuille dense : tableau filtrable/sortable, fiche bien structurée par sections, actions statut/publication accessibles, médias gérés sans erreur parasite.

## Contraintes strictes (métier)

- Un owner ne voit que ses biens ou ceux autorisés par son profil actif.
- Les filtres et tris doivent être serveur, pas client-side sur une liste déjà chargée.
- La publication ne doit pas contourner le workflow de modération si actif.
- Les médias existants doivent charger ou afficher une erreur contextualisée non bloquante.

## Delta à produire

- [ ] Liste `/app/properties` : ajouter tri serveur par date, prix, vues.
- [ ] Liste `/app/properties` : ajouter filtre `Inclure les archivés`.
- [ ] Fiche bien : structurer les sections adresse/localisation, médias, caractéristiques, légal/titre foncier, historique prix, statistiques vues/favoris.
- [ ] Fiche bien : afficher et gérer les transitions de statut disponibles.
- [ ] Création : distinguer `Enregistrer en brouillon` et `Soumettre/Publier`.
- [ ] Médias : corriger le chargement des photos existantes ou rendre l'erreur actionnable.
- [ ] Tests frontend sur tri/filtres, sections visibles et actions par statut.

## Critères d'acceptation

- [ ] La liste owner propose un tri date/prix/vues qui modifie la requête serveur.
- [ ] Un bien archivé n'apparaît pas par défaut et réapparaît via filtre dédié.
- [ ] La fiche bien affiche les sections métier attendues sans onglets absents.
- [ ] Les vues/favoris et l'historique de prix sont visibles si les données existent.
- [ ] Les photos existantes se chargent ou l'erreur indique une action claire.
- [ ] La création ne force pas une publication immédiate.

## Hors périmètre

- Import MLS/CSV.
- Estimation IA de prix.
- Refonte backend des modèles Property/Address.

## Notes d'implémentation

Le filtre "Inclure les archivés" ajoute `include_archived=1`; sans ce paramètre l'API exclut `status=archived` par défaut.
