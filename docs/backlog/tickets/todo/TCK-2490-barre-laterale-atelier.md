---
id: TCK-2490
title: Barre latérale « Atelier » — une colonne pleine hauteur, une seule hiérarchie, « Aller à » et « Aujourd'hui »
status: todo
phase: P2
family: front
estimate: M
wave: 83
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2489]
blocks: [TCK-2491]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, coque, design, adr-0090]
---

## Objectif utilisateur

Une barre latérale calme et premium, lisible d'un coup d'œil, où l'on va partout (⌘K compris) sans
chercher.

## Contrat de données

Aucun endpoint neuf : `useMenuDeLEspace`, `useCompteursDuMenu`, `usePreferencesDuMenu`, les pages
récentes (`pages-recentes.ts`), le modèle « Aujourd'hui » de TCK-2489.

## Direction UX / Artistique

[ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md) §1, §3, §5, §6, §7. Référence
visuelle : la barre de Claude et la maquette « Atelier » validée le 2026-11-06 (relevé dans le
rapport de session). Calme, dense sans être serré, une seule hiérarchie ; la marque vit dans les
détails (l'icône active en couleur primaire, le « + » de l'action en pastille primaire). Lin clair et
sombre.

## Contraintes strictes (métier)

- Rien de ce que fait la barre aujourd'hui ne se perd : épingles (max, ordre, clavier), replis de
  groupe, mode icônes (auto/complet/icônes), groupe « Aussi … », « Démarrer », verrous pro, entrée
  console, carte de mise en location, carte d'offre, compteurs et leurs libellés accessibles,
  modules masqués, tiroir mobile (`onNavigate`, focus de retour).
- « Aller à » : une ligne du menu, nom accessible commençant par le texte visible, `aria-keyshortcuts`,
  ouvre la palette existante (même fonction que le bouton de la barre du haut).
- Contraste : textes ≥ 4,5:1, compteurs compris, clair ET sombre (test sur les jetons, patron
  d'`AppTopbar.a11y.test.tsx`) ; anneaux de focus visibles.
- i18n fr/en/wo ; aucun texte en dur ; `prefers-reduced-motion` respecté.

## Delta à produire

- [ ] Nouvelle présentation de la colonne (en-tête, action, « Aller à », « Aujourd'hui », groupes,
  « Récents », lignes de statut, pied du compte) et du rail replié.
- [ ] Tests adaptés + tests neufs (« Aller à », « Aujourd'hui », Récents, rail).
- [ ] Mesure au navigateur (1024, 1280, 1440 ; clair/sombre ; tiroir à 390).

## Critères d'acceptation

- [ ] AC1 — La colonne suit ADR-0090 §1/§3/§5/§6 ; captures datées au rapport (clair, sombre, replié, tiroir).
- [ ] AC2 — Chaque fonction de la liste « rien ne se perd » a un test vert (existant adapté ou neuf).
- [ ] AC3 — « Aller à » ouvre la palette au clic et ⌘K/Ctrl K ; focus rendu à la ligne à la fermeture.
- [ ] AC4 — Contrastes ≥ 4,5:1 mesurés sur les jetons (clair et sombre), test qui rougit sur un jeton trop pâle.
- [ ] AC5 — `check:*`, gardes, tsc, lint ; suites par la CI.

## Hors périmètre

La barre du haut et l'en-tête mobile (TCK-2491) ; le contenu des pages.

## Notes d'implémentation
