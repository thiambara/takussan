---
id: TCK-2638
title: "Liste des biens en deux modes : Gestion (occupé, vacant, en retard) et Annonces (en ligne, vues)"
status: todo
phase: P1
family: front
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2637]
blocks: [TCK-2678]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, properties, mobile, audit-ux, app]
---

## Objectif utilisateur

Le gestionnaire voit d'un coup d'œil ce qui est occupé, vacant ou en retard. L'agent commercial voit ce qui est en ligne et ce que ses annonces rapportent. Aucun geste de la liste actuelle ne se perd.

## Contrat de données

Endpoints consommés :

- `GET /api/properties`, avec `include=occupancy`, le champ `is_online`, les filtres `occupancy`, `rent_late` et `tenant`, et le tri `retard` (TCK-2637) ;
- `GET /api/properties/portfolio-summary` pour les tuiles et les pastilles, en **un** appel (TCK-2637) ;
- les filtres, tris et actions existants de la liste : publier, dupliquer, booster, statut, archiver, supprimer, actions groupées ;
- `GET /api/me/quota` pour la jauge du mode Annonces.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-biens&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Liste — mode Gestion » et « Liste — mode Annonces », au téléphone et au bureau.
  - Le bien « Villa 5 chambres · Ouest Foire » de la maquette est une donnée fictive.
- **Sélecteur segmenté « Gestion · Annonces »** en tête :
  - le mode est mémorisé sur l'appareil et repris dans l'URL (un lien garde le mode) ;
  - il n'est pas proposé à un compte qui n'a aucun bien à louer.
- **Gestion, téléphone** :
  - pastilles défilantes comptées : « Tous », « Occupés », « Vacants », « Loyer en retard », « Préavis » ;
  - cartes compactes (vignette de 72 px à gauche), sur trois lignes :
    1. titre · quartier ;
    2. locataire et « bail jusqu'au … », ou « Vacant depuis N j », ou « Sans locataire » ;
    3. loyer **avec sa période** et l'état du mois (« Payé ✓ », « En retard de 6 j » en rouge, « Vacant » en ambre + « Publier l'annonce »).
- **Gestion, bureau** :
  - quatre tuiles cliquables : « Occupés n / total », « Vacants n · dont k depuis plus de 60 j », « Loyers en retard n · montant à encaisser », « Préavis n » ;
  - tableau : Bien (vignette, titre, quartier) · Bailleur · Locataire et fin de bail · Loyer / mois · Ce mois · Agent · « ⋯ » ;
  - tri « Retards d'abord » ;
  - recherche « Bien, locataire, bailleur, référence… ».
- **Annonces** :
  - pastilles « En ligne », « À valider », « Brouillons », « Hors ligne » ;
  - cartes à grande photo (3:2), avec le prix et sa période, la pastille « En ligne » et la visibilité, les vues et les favoris ;
  - le quota, discret en bas de liste au téléphone, en jauge fine au bureau.
- **Vocabulaire** ([décision 6](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10), [ADR-0097](../../../adr/0097-en-ligne-est-un-etat-derive.md)) :
  - « En ligne » ne se dit que de `is_online` ;
  - le mot « Publié » ne s'affiche plus comme état ;
  - la visibilité se dit « Public / Privé » et c'est un réglage ;
  - le libellé du statut `published` est **« Validé »** (décidé par le porteur le 2026-11-10, ADR-0097 § 4) ;
  - le motif d'un bien hors ligne est porté par TCK-2678 (décidé le 2026-11-10), pas par ce ticket.
- **Titre** :
  - « Biens » pour l'agence ;
  - « Mes biens » pour le bailleur, avec un seul libellé pour son geste de création, « Proposer un bien à mon agence » (en-tête comme barre). La bascule « Mes biens » ne lui est pas proposée.
- **Téléphone (360-390 px)** :
  - la case de sélection quitte la photo, cible ≥ 44 px ;
  - la barre d'actions groupées se pose en bas, à la place de la barre d'onglets, pendant une sélection ;
  - la feuille « Filtres et tri » garde son bouton collé, et son texte ne contredit plus le bouton (P3 de l'audit).
- **Bureau (≥ 1280 px)** : les colonnes du tableau naissent dès `lg`, jamais `md` (règle de la coque).

## Contraintes strictes (métier)

**Rien ne se perd** (relevé : audit famille 4, § 1, *Fonctions existantes* 1-12, lues dans `properties/(liste)/page.tsx` et `components/property-dashboard/*`). Les deux modes gardent :

- l'avertissement « numéro non vérifié » et « Vérifier mon numéro » ;
- la recherche plein texte (titre, référence, description) ;
- le tri plus récents / anciens, prix ↑↓, vues ↑↓ ;
- les bascules « Mes biens » (`only_mine`) et « Archivés » (`include_archived`) ;
- les filtres avancés : ville, prix min / max, statut, type, contrat, visibilité, agent (`user_id`), créé du / au. Les puces sont retirables, avec « Tout réinitialiser » ;
- sur la ligne : propriétaire (personnel seulement) et agent responsable, référence, ancienneté, vues, favoris, pastille « Boostée » ;
- « Modifier », et le menu « ⋯ » : Publier / Dépublier, Dupliquer, Booster, changer le statut (statuts permis), Archiver, Supprimer avec confirmation ;
- la sélection multiple et les actions groupées : Archiver, Dépublier, Changer l'agent responsable, Tout désélectionner, bilan par bien ;
- la pagination 10 / 20 / 50, Précédent / Suivant ;
- deux états vides distincts : portefeuille vide et filtre sans résultat ;
- l'entrée « Publier un bien », avec le brouillon serveur repris.

Autres contraintes :

- Changer de mode est une **vue** : recherche, filtres et page sont gardés. Un bien vacant à louer paraît dans les deux modes.
- **Écran du quota à l'entrée de création** (`/app/properties/new`, P1 de l'audit) :
  - le chiffre et sa définition sont ceux de `GET /api/me/quota`, dits tels quels (« annonces actives : en ligne ou en attente ») ;
  - le message s'adresse au rôle : l'agent ne tient ni le quota ni l'abonnement, l'admin peut changer d'offre ;
  - au téléphone, l'écran a la flèche de retour unique de la coque.
- Le loyer s'écrit toujours avec sa période. Un prix de vente n'en a pas.
- **i18n** :
  - tout libellé neuf existe en `fr`, `en` et `wo`, où le `wo` porte le texte français tel quel (wolof en pause) ;
  - vouvoiement ([décision 2c](../../../qa/audit-ux-2026-11/README.md#décisions-du-porteur-sur-la-partie-connectée-2026-11-10)) : la maquette n'est pas une référence de ton ;
  - montants et dates par `useFormatteurs()`.

## Delta à produire

- [ ] Sélecteur de mode mémorisé, avec ses deux présentations au téléphone et au bureau.
- [ ] Pastilles et tuiles du mode Gestion branchées sur `portfolio-summary`. Celles du mode Annonces branchées sur les filtres existants et `is_online`.
- [ ] Carte et ligne de tableau du mode Gestion (occupation, état du mois) et carte du mode Annonces.
- [ ] Vocabulaire « En ligne » / visibilité / statut aligné sur l'ADR, dans la liste, les filtres et les puces.
- [ ] Écran de quota de l'entrée de création, réécrit pour le rôle.
- [ ] Tests :
  - parcours des gestes dans les deux modes ;
  - parité des comptes ;
  - mode mémorisé et repris de l'URL ;
  - aucune pastille « Publié ».

## Critères d'acceptation

- [ ] AC1 — À 390 px en mode Gestion, au moins **6 biens** sont visibles dans le premier écran sous les pastilles (mesure au navigateur sur la démo).
- [ ] AC2 — Pour le bailleur de la démo, le nombre de lignes qui portent la pastille « En ligne » sur une page égale le nombre de biens de cette page que rend `filter[public]=1`. Le texte « Publié » n'apparaît nulle part dans la liste (DOM).
- [ ] AC3 — À l'ouverture du mode Gestion, le réseau montre **un** appel `portfolio-summary` et aucun appel `per_page=1` de comptage.
- [ ] AC4 — Après une recherche « Mermoz » et un filtre « Vacants » en mode Gestion :
  - passer en Annonces, puis revenir, garde la recherche ;
  - recharger la page garde le mode.
- [ ] AC5 — Chacun des gestes listés dans *Contraintes strictes* est atteignable dans les deux modes, à 390 px et à 1280 px : menu « ⋯ » d'une ligne, actions groupées sur deux biens, pagination, réinitialisation des filtres. Un test parcourt chaque geste.
- [ ] AC6 — À 1280 px, le tableau Gestion tient sans défilement horizontal, avec le « ⋯ » de fin de ligne entier.
- [ ] AC7 — Aucun loyer ne s'affiche sans période (« 1 133 862 F CFA · Location » ne se reproduit pas sur la démo).

## Hors périmètre

- La fiche du bien (TCK-2639).
- L'assistant de création lui-même (famille 2).
- Le glisser-déposer, l'appui long et la vue « Portefeuille » de direction (ambition de l'audit).
- L'étiquette du menu « Biens » / « Mes biens » dans la coque (famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
