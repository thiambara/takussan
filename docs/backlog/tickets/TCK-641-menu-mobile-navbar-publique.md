---
id: TCK-641
title: Menu mobile de la navbar publique refait — sans Louer/Acheter, avec « Mes biens »
status: done
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

- [x] Panneau mobile de la navbar publique redessiné, sans Louer/Acheter
- [x] Entrée « Mes biens » gardée par l'accès à la page
- [x] Libellés `fr`/`en`/`wo`
- [x] Tests : absence de Louer/Acheter, présence/absence de « Mes biens » selon l'accès

## Critères d'acceptation

- [x] AC1 — À 390 px, connecté, le panneau ne contient aucun lien Louer ni Acheter
- [x] AC2 — Un utilisateur qui peut ouvrir `/app/properties` voit « Mes biens », qui y mène
- [x] AC3 — Un utilisateur qui ne peut pas l'ouvrir ne voit pas l'entrée
- [x] AC4 — Anonyme, le panneau propose toujours la connexion
- [x] AC5 — Aucune barre de défilement horizontale à 360 px

## Hors périmètre

- La navbar publique à la taille ordinateur (hors l'affichage du solde, TCK-642)
- La barre de recherche Acheter | Louer de l'accueil

## Notes d'implémentation

- Le panneau mobile garde « Publier une annonce » comme seul appel plein ; « Mes biens » est gardé par `peutOuvrirMesBiens` (`lib/navigation/acces-app.ts`), éprouvé contre la garde réelle de `/app/properties/layout.tsx` sur les 128 combinaisons de rôles — pas une recopie.
- `navLinks` (`data/navigation.ts`) et les clés `nav.links.*`, `nav.sidebar.sections.catalog` retirés : plus aucun lecteur produit.
- Garde de contraste de la surface publique (TCK-458) : un fond translucide est évalué au pire pixel du sous-jacent ; `bg-primary/10` et `hover:bg-muted/50` rendaient 1,00:1 et 3,87:1 → aplats opaques (`bg-primary`, `bg-muted`).
- Vérifié au navigateur le 2026-10-14 (390 et 360 px, 1366 px) : ni Louer ni Acheter, `scrollWidth = innerWidth`, aucun élément du panneau ne déborde.
