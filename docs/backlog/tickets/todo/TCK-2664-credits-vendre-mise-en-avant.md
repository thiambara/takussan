---
id: TCK-2664
title: "Crédits : vendre la mise en avant depuis la page du solde"
status: todo
phase: P1
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2663]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#92-boostproduct-"
    - "docs/models-spec.md#95-creditlot-"
    - "docs/models-spec.md#96-creditmovement-"
tags: [front, credits, boost, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin voit son solde, ce que ses mises en avant ont rapporté, et met un bien en avant sans quitter la page.

## Contrat de données

- Solde, lots, historique : `GET /api/credits` (existant).
- Offres et coûts : `GET /api/boost-products` (existant ; les prix viennent de l'API, jamais du code).
- Mises en avant en cours et suggestions : `GET /api/credits/boosts`, `GET /api/credits/suggestions` (TCK-2663).
- Mettre en avant : `POST /api/properties/{property}/boosts` (existant, `StorePropertyBoostRequest`), avec ses refus (solde insuffisant, Remontée pas encore disponible : `bump_available_at`).
- Biens à choisir : la liste des biens publiés de l'agence, recherche par titre ou référence, filtrée côté serveur.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-credits&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Crédits » et « Mettre en avant », téléphone et bureau.
- **Téléphone** : carte du solde (crédits, prochaine expiration « 60 expirent le 24 déc. »), bouton primaire « Mettre un bien en avant », « Recharger · Bientôt » inerte ; « En avant en ce moment » (photo, bien, offre, jours restants, vues, contacts) ; « À pousser » (« 3 biens sans contact depuis 30 jours ») ; « Ce que ça coûte » (la grille des offres) ; liens « Historique » et « Lots de crédits ». L'historique devient une liste : opération et objet (lien vers le bien), ± crédits à droite, date et motif dessous.
- **Mettre en avant** : plein écran en deux temps au téléphone (1 · Quel bien ? les suggestions d'abord, recherche ; 2 · Quelle mise en avant ? les offres et leur coût, « Il vous restera 40 crédits »), bouton collant « Mettre en avant · 20 crédits » ; au bureau, un dialogue large : biens à gauche, offres à droite, résumé et confirmation en bas.
- **Bureau** : en-tête avec solde, expiration et bouton primaire, grille des offres à droite ; tableau « En avant en ce moment » (Bien, Offre, Fin, Vues, Contacts, Visites) ; « À pousser » ; puis lots et historique, en deux colonnes dès `lg`.

## Contraintes strictes (métier)

Fonctions existantes à garder (`credits/page.tsx`, `CreditsPanel.tsx`, `boost/api.ts`, `BoostDialog`) :

- Solde ; lots (origine, restant sur initial, expiration ou « sans expiration ») ; historique paginé (date et heure, opération, ± crédits, objet, motif) ; états chargement, erreur avec « Réessayer », lots vides, historique vide.
- Le bouton « Mettre en avant » de la page d'un bien (`PropertyHeaderActions`) reste ; les deux points d'entrée suivent les mêmes règles que `BoostDialog`.
- Menu : visible de l'admin seulement (`voitLePortefeuille`), module masquable par l'agence. Un membre qui ouvre l'URL sans `boost.spend` voit une page qui le lui dit, jamais une erreur brute (l'API rend 403).
- « Recharger » n'est pas une action (`aria-disabled`, mention « Bientôt ») : l'achat est la phase 2 d'ADR-0061. **Décision 14** : quand l'achat existera, son prix s'affichera en F CFA à cet endroit ; aujourd'hui aucun prix en F CFA n'est inventé.
- Pas de « × la semaine d'avant » : la mesure n'existe pas (TCK-2663).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement.

## Delta à produire

- [ ] Page Crédits refaite (téléphone et bureau) avec les sections ci-dessus.
- [ ] Parcours « Mettre un bien en avant » en deux temps depuis la page.
- [ ] Historique en liste au téléphone, objet lié au bien.
- [ ] État « réservé » pour un membre sans `boost.spend`.
- [ ] Tests : grille lue de l'API ; confirmation qui appelle la route du bien et met le solde à jour ; refus « solde insuffisant » rendu ; « Recharger » inerte ; état réservé.

## Critères d'acceptation

- [ ] AC1 — Si l'API rend une Vedette 7 jours à 25 crédits, la grille affiche 25, pas 20 (aucun prix codé en dur).
- [ ] AC2 — Confirmer « Vedette 7 jours » sur un bien envoie `POST /api/properties/{id}/boosts` avec l'offre choisie, puis le solde affiché baisse du coût sans rechargement de la page.
- [ ] AC3 — Avec 10 crédits, l'offre à 20 est désactivée avec sa raison affichée à côté (« Il vous manque 10 crédits »).
- [ ] AC4 — À 390 px, une ligne d'historique tient sur trois lignes de texte au plus et le motif est à l'écran.
- [ ] AC5 — Un agent qui ouvre `/app/credits` lit une phrase qui dit que la page est réservée, et aucun message d'erreur générique.

## Hors périmètre

- L'achat de crédits et son prix (phase 2).
- Le rapport détaillé d'une mise en avant.
- La pastille de boost dans la liste des biens (approche C, non retenue ; la liste relève de la famille 4).

## Notes d'implémentation

_(à remplir par implementing-specs)_
