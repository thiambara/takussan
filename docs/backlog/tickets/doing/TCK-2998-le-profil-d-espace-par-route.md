---
id: TCK-2998
title: Le profil d'espace de chaque page de /app, et le formulaire en saisie
status: doing
phase: P2
family: front
estimate: M
wave: null
created: 2026-11-22
updated: 2026-11-22
depends_on: [TCK-2995, TCK-2996]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, mobile, clavier, coque, adr-0136]
---

## Objectif utilisateur

Au téléphone, chaque page de `/app` fait de l'écran ce que son type demande. Dans un formulaire (un nouveau bail, un
nouveau client), le bouton « Continuer » reste au-dessus du clavier pendant la frappe, et l'en-tête cède sa place.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0136.

## Delta

- `profilDEspace` et `estFormulaire` dans `plein-ecran.ts` ; `formeDeLaRoute` les lit.
- `AppShell` : `data-espace`, et l'abonnement à la mesure sur tout profil.
- `globals.css` (sous `md`, en saisie) : la barre d'action sur le clavier, l'en-tête collé sur `--vue-top`, et
  l'en-tête d'un formulaire en 44 px sans sa ligne d'étape (`EnTeteMobile`, `ligne-d-etape`).

## Critères d'acceptation

- [x] AC1 — Toutes les pages de `src/app/(dashboard)/app` ont un profil. « formulaire » couvre exactement les
      créations et le plein écran (test qui parcourt l'arborescence).
- [x] AC2 — En émulation 390 × 844 (clavier de 336 px), sur `/app/leases/new` :
      - en-tête : de 0-56 à 0-44, ligne d'étape repliée ;
      - barre d'action : de 771-844 à 435-508 ;
      - avec un décalage de 150 px : en-tête à 150-194, barre à 585-658 ;
      - clavier fermé, tout revient ;
      - sans clavier, la barre reste à 771-844.
- [x] AC3 — Hors des créations, au téléphone :
      - sur une page « liste » qui s'édite (`/app/profile/contact`, la barre « Enregistrer » de TCK-2635), la barre
        passe de 775-844 à 439-508 et, avec le décalage, à 589-658 ;
      - sur la recherche de `/app/properties`, la barre d'onglets part et l'en-tête reste à 0-56.
- [x] AC3 bis — Rien ne bouge au bureau (1280, souris) ni sur une tablette tactile (820 × 1180), sur
      `/app/leases/new` comme dans la conversation de `/app/messages`.
- [x] AC3 ter — Chaque acteur, sur son propre compte (émulation 390 × 844, clavier de 336 px, haut du clavier à 508,
      relevé du 2026-11-22 sur `dev` après #1715) :
      - **agent** (`agent1@dakarimmo.sn`) : « Nouveau bail », AC2 ;
      - **prestataire** (`provider1@dakarimmo.sn`) : le refus d'une intervention (`/app/maintenance`), champ à 295-361
        et « Confirmer le refus » à 369-413 ; la barre d'onglets part ;
      - **bailleur** (`owner5@dakarimmo.sn`) : une conversation de `/app/messages`, profil `conversation`, cadre de
        0-844 à 0-508, en-tête de 56 à 44 px, composeur de 748-844 à 412-508 ; tout revient clavier fermé ;
      - **client** (`customer@agency1.demo.takussan.sn`) : la note d'un favori (`/app/favorites`), champ à 260-326 et
        actions à 334-370 ; la barre d'onglets part ;
      - **administrateur d'agence** (`admin@agency1.demo.takussan.sn`) :
        - « Nouveau client » (panneau plein écran, profil `formulaire`) : « Continuer » de 744-844 à 408-508, en-tête de
          56 à 44 px, et avec le décalage le panneau à 150-658 ;
        - les réglages de bail (`/app/agency/lease-settings`, profil `liste`) : la barre « 1 modification non
          enregistrée » de 711-780 (au-dessus des onglets) à 439-508, et elle revient clavier fermé ;
      - **visiteur** : la recherche du site public (TCK-2997).
- [x] AC4 — Tests vérifiés par ablation (coque, CSS, en-tête, et `profilDEspace` sans le plein écran).
- [ ] AC5 — Sur l'iPhone du porteur : dans « Nouveau bail », « Continuer » se pose sur le clavier.

## Reste sur dev

- **AC5** : la vérification sur l'iPhone du porteur (ADR-0133 : le téléphone juge la géométrie du clavier). Le code
  est fusionné ; le ticket passe `done` une fois le constat écrit ici.
