---
id: TCK-124
title: Fiche bien — auth bypass sur "Demander une visite" et "Signaler"
status: review
phase: P1
family: bug
estimate: S
created: 2026-04-30
updated: 2026-04-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#111-avis--réputation
    - docs/features.md#21-authentification--comptes
tags: [front, bug, p1, auth, security, property-detail]
---

## Objectif utilisateur

Un visiteur anonyme tente de demander une visite ou de signaler une annonce, et est invité à se connecter avant d'accéder au formulaire.

## Contrat de données

Les actions concernées appellent des endpoints protégés côté backend (Sanctum) — aucun changement API requis. Le garde manquant est uniquement côté frontend : les formulaires s'ouvrent sans vérifier l'état d'authentification.

- "Demander une visite" → ouvre un sheet/modal sans guard — devrait d'abord vérifier `isAuthenticated`
- "Signaler cette annonce" → ouvre un formulaire de signalement sans guard — même problème

## Direction UX / Artistique

Cohérence avec le comportement déjà en place pour "Faire une offre" : une modale "Connexion requise" ou une redirection directe vers `/auth/login?redirect=<current-url>` est acceptable. Choisir le pattern déjà utilisé dans la fiche bien pour "Faire une offre".

## Contraintes strictes (métier)

- Un visiteur non connecté ne doit jamais pouvoir soumettre une demande de visite (§1.3).
- Un visiteur non connecté ne doit jamais pouvoir soumettre un signalement (§1.11 P2 "Signaler un avis inapproprié").
- Le guard doit être côté frontend au clic du bouton — pas seulement côté backend (pour éviter l'appel réseau inutile et l'UX dégradée).
- Après authentification, l'utilisateur doit revenir à la fiche bien sans perdre son intention.

## Delta à produire

- [ ] Localiser le handler du bouton "Demander une visite" sur la fiche bien (`/properties/[slug]`)
- [ ] Ajouter un guard `isAuthenticated` : si non connecté, déclencher le flow auth (modale ou redirect) avant d'ouvrir le formulaire de visite
- [ ] Localiser le handler du bouton "Signaler cette annonce" sur la fiche bien
- [ ] Ajouter un guard `isAuthenticated` : même comportement que ci-dessus
- [ ] S'assurer que le comportement est cohérent avec le guard déjà en place sur "Faire une offre"

## Critères d'acceptation

- [ ] Cliquer "Demander une visite" sans être connecté n'ouvre pas le formulaire de visite
- [ ] Cliquer "Signaler cette annonce" sans être connecté n'ouvre pas le formulaire de signalement
- [ ] Les deux boutons déclenchent le même mécanisme d'auth que "Faire une offre"
- [ ] Une fois connecté, l'utilisateur peut accéder aux formulaires normalement
- [ ] Aucune régression sur le fonctionnement des deux formulaires pour un utilisateur authentifié

## Hors périmètre

- Refonte du mécanisme d'authentification (modal vs redirect) — uniformisation éventuelle dans un ticket UX séparé
- Validation côté backend (déjà en place via Sanctum)

## Notes d'implémentation

- **PropertyVisitDialog.tsx** : ajout d'un guard `!user` early return avec une gate dialog "Connectez-vous pour visiter" + lien `/auth/login?redirect=/properties/${slug}`. Suppression des champs invités (name/email/phone) et de la logique conditionnelle dans le submit handler.
- **PropertyReportButton.tsx** : ajout de `useAuth()`, check `user` dans `handleClick()` → si null, affiche une gate dialog "Connexion requise" au lieu du formulaire de signalement.
- Les deux composants suivent le même pattern que `PropertyContactMessageDialog.tsx`.
- Correction du chemin `/login` → `/auth/login` dans les 4 composants concernés (PropertyVisitDialog, PropertyReportButton, PropertyContactMessageDialog, PropertyReservationDialog) — le chemin `/login` n'existe pas, la page de login est à `/auth/login`.
