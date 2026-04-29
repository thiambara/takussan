---
id: TCK-123
title: Seeders — corriger incohérences type/surface des propriétés de démo
status: todo
phase: P3
family: bug
estimate: S
created: 2026-04-29
updated: 2026-04-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [technique, bug, p3, seeders, demo-data]
---

## Objectif utilisateur

Les données de démo reflètent des biens réalistes : une démo ou un test QA ne doit pas présenter de studios de 17 m² avec 5 chambres ou des appartements de type "Usine".

## Contrat de données

Les incohérences identifiées dans les seeders (PropertyFactory ou seeders dédiés) :
- "Studio meublé à Yoff" : 5 chambres, 17 m² (studio ↔ 5 chambres incohérent)
- "Appartement meublé F1 à Hann Maristes" : `type = Ferme`
- "Appartement meublé F2 à Grand-Yoff" : `type = Usine`
- "Bel appartement 4 chambres - Liberté 6" : `type = Hôtel`
- 3 × "Propriété Premium Featured" sans adresse ni photos réelles

## Direction UX / Artistique

N/A — corrections dans les seeders/factories, pas de changement UI.

## Contraintes strictes (métier)

- Les corrections doivent être appliquées dans les factories ou seeders, pas dans la base de données directement.
- Les types de bien doivent correspondre aux valeurs de l'enum `PropertyType` (cf. `docs/models-spec.md#3-property`).
- Les studios/F1 : surface ≥ 15 m², chambres = 1.

## Delta à produire

- [ ] Localiser les définitions des biens incohérents dans `database/factories/PropertyFactory.php` ou les seeders
- [ ] Corriger les associations nom↔type↔surface↔chambres incohérentes
- [ ] Ajouter des adresses (lat/lng Dakar) et des photos placeholder aux 3 biens "Propriété Premium Featured" sans données
- [ ] Lancer `php artisan migrate:fresh --seed` en local et vérifier la cohérence visuelle sur la homepage

## Critères d'acceptation

- [ ] Aucun bien seedé n'a un type incompatible avec son nom (studio ≠ ferme, appartement ≠ usine)
- [ ] Aucun bien seedé n'a une surface irréaliste pour son nombre de chambres
- [ ] Les biens "Premium Featured" ont une adresse et au moins une photo
- [ ] `php artisan migrate:fresh --seed` s'exécute sans erreur

## Hors périmètre

- Refonte complète du volume ou de la variété des données seed
- Ajout de nouveaux biens seed

## Notes d'implémentation

_(à remplir par implementing-specs)_
