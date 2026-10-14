---
id: TCK-641
title: Menu mobile de la navbar publique refait — sans Louer/Acheter, avec « Mes biens »
status: doing
phase: P1
family: front
estimate: S
wave: 77
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#11-gestion-des-biens
  models: []
tags: [front, navigation, mobile, design]
---

## Objectif utilisateur

Un visiteur connecté qui ouvre le menu sur son téléphone rejoint en un geste ses espaces
personnels (profil, biens, crédits) depuis un panneau qui inspire confiance.

## Contrat de données

- Aucune donnée nouvelle : l'identité affichée est celle que la navbar lit déjà.
- Le solde de crédits du panneau est l'objet de TCK-642 (même branche) — ce ticket lui réserve
  sa place, il ne le câble pas.

## Direction UX / Artistique

- Retour du porteur du 2026-10-14 (capture du panneau actuel) : « faites-moi un design premium ».
- Ambiance : feuille éditoriale calme, charte « Ancrage Local Contemporain »
  (`docs/design-guidelines.md`) ; bloc identité soigné en tête, entrées à icône et cible tactile
  généreuse, séparateurs discrets, langue et déconnexion en retrait, « Publier une annonce » reste
  l'unique appel fort.
- Ordre des entrées de compte : Mon profil, **Mes biens**, puis Crédits (TCK-642).

## Contraintes strictes (métier)

- Les entrées **Louer** et **Acheter** disparaissent du panneau mobile.
- « Mes biens » mène à `/app/properties` et n'apparaît qu'à qui peut ouvrir cette page (même règle
  d'accès que la navigation de `/app`) ; jamais un lien qui mène à un refus.
- Visiteur anonyme : le panneau garde son parcours de connexion actuel.
- Libellés par next-intl (`fr`/`en`/`wo`).

## Delta à produire

- [ ] Panneau mobile de la navbar publique redessiné, sans Louer/Acheter
- [ ] Entrée « Mes biens » gardée par l'accès à la page
- [ ] Libellés `fr`/`en`/`wo`
- [ ] Tests : absence de Louer/Acheter, présence/absence de « Mes biens » selon l'accès

## Critères d'acceptation

- [ ] AC1 — À 390 px, connecté, le panneau ne contient aucun lien Louer ni Acheter
- [ ] AC2 — Un utilisateur qui peut ouvrir `/app/properties` voit « Mes biens », qui y mène
- [ ] AC3 — Un utilisateur qui ne peut pas l'ouvrir ne voit pas l'entrée
- [ ] AC4 — Anonyme, le panneau propose toujours la connexion
- [ ] AC5 — Aucune barre de défilement horizontale à 360 px

## Hors périmètre

- La navbar publique à la taille ordinateur (hors l'affichage du solde, TCK-642)
- La barre de recherche Acheter | Louer de l'accueil

## Notes d'implémentation

_(à remplir par implementing-specs)_
