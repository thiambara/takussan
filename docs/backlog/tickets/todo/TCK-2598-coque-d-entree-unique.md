---
id: TCK-2598
title: "Une seule coque pour l'entrée : l'intention en titre, l'avancement du parcours, le bouton collé au-dessus du clavier"
status: todo
phase: P1
family: front
estimate: L
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2600, TCK-2604, TCK-2608, TCK-2611, TCK-2613]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#onboarding-parcours"
  models: []
tags: [front, auth, onboarding, mobile, audit-ux, app]
---

## Objectif utilisateur

Le nouveau venu traverse la connexion, le code, son prénom, l'orientation, l'invitation ou la publication sans que l'écran change trois fois de visage, voit où il en est du parcours entier, et garde toujours le bouton principal sous le pouce — même clavier ouvert.

## Contrat de données

Aucun endpoint. La coque reçoit de chaque page son intention (titre de la barre), sa position dans le parcours (pas courant / total, compte compris) et, au bureau, l'objet à montrer dans le panneau (le bien, l'agence qui invite, l'aperçu de l'annonce) ; sans objet, pas de panneau décoratif.

## Direction UX / Artistique

- Maquettes de référence (la coque est commune aux cinq pages de la famille) : `/fr/playground/maquettes?p=app-entree-connexion&a=a`, `?p=app-entree-publier&a=a`, `?p=app-entree-orientation&a=a`, `?p=app-entree-invitation&a=a`, `?p=app-entree-assistants&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- **Téléphone (360-390 px)** : barre de 56 px — retour à gauche, l'intention en titre (« Publier votre bien », « Rejoindre Dakar Immo »), l'avancement en pastilles à droite ; plus de bandeau photo de 236 px. Le bouton principal est collé en bas, et remonte au-dessus du clavier quand un champ a le focus (le modèle est le pied collant de l'assistant de publication). Aucune barre d'onglets publique (règle des couches, ADR-0091).
- **Bureau (≥ 1280 px)** : colonne de formulaire de 480 px ; le panneau voisin porte l'objet de l'intention ; la photo de villa et le slogan disparaissent. Les colonnes se posent dès `lg`, jamais dès `md`.
- La flèche de retour est celle, unique, que la famille 3 aligne sur tout le produit (README de l'audit, § Maquettes) — ce ticket ne la redessine pas.
- Quitter (✕ ou « Quitter ») demande confirmation dès qu'une saisie existe, et dit où la reprendre.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).

Pas de régression — la coque remplace la mise en page de `(auth)/layout.tsx`, d'`OnboardingShell`, de `/publish` (`BarreDeMarque`) et de `/invitations` ; ces fonctions restent :

- « Retour » vers la page publique quittée, mémorisée ou dans l'historique (TCK-568) ; logo vers l'accueil ; arrivée en haut de page ; session périmée refermée à l'arrivée sur `/auth/*` après avoir demandé au serveur (`ReinitialiserSessionClient`).
- `noindex` et titre d'onglet traduit sur chaque page ; « Retour au site » des écrans d'onboarding.
- Le fournisseur de toasts reste monté sur `/publish` (sans lui, Base UI lève au rendu, mémoire « ToastProvider : quatre coques + /publish »).
- Les frontières de dictionnaire par segment (`messagesPour(...)`, TCK-337) ne s'élargissent pas : la coque ne tire aucun espace de libellés dans le socle commun.
- La note de pied « Vos réponses sont enregistrées au fur et à mesure » ne paraît que sur un écran qui écrit vraiment un brouillon.
- Libellés neufs en `fr`/`en`/`wo` (`wo` = le français tel quel, wolof en pause) ; ton : vouvoiement partout ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10) ; la maquette tutoie, elle n'est pas une référence de ton.

## Delta à produire

- [ ] Coque d'entrée : barre (retour, intention, avancement, sortie), zone de contenu, pied collé suivant le clavier, panneau d'objet au bureau.
- [ ] Bascule des pages `/auth/*`, `/onboarding/*`, `/publish`, `/invitations/accept` sur la coque, contenus inchangés (chaque page est refaite par son propre ticket).
- [ ] Confirmation de sortie quand une saisie existe.
- [ ] Tests : retour vers la page quittée, `noindex`, toasts montés sur `/publish`, confirmation de sortie avec et sans saisie, absence de la barre d'onglets publique.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, champ numéro focalisé et clavier émulé (`visualViewport` réduit de 336 px), le bas du bouton « Recevoir un code » est dans la zone visible (mesure au navigateur, comparée au relevé de l'audit : bouton à 594 px, sous le clavier).
- [ ] AC2 — À 1280 px, la colonne de formulaire mesure 480 px ± 8 et aucune image décorative n'est chargée sur `/auth/login` sans intention (vérifié au réseau).
- [ ] AC3 — Sur `/onboarding/intention` avec une saisie en cours, « Quitter » ouvre une confirmation ; sans saisie, il sort directement.
- [ ] AC4 — Le poids du dictionnaire servi sur `/auth/login` ne dépasse pas celui mesuré sur `dev` avant le ticket de plus de 2 %.
- [ ] AC5 — `/publish` rend sans frontière d'erreur avec un toast déclenché au premier rendu.

## Hors périmètre

- Le contenu de chaque écran (TCK-2600, TCK-2604, TCK-2608, TCK-2611, TCK-2613).
- La flèche de retour elle-même et la coque de `/app` (famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
