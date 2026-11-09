---
id: TCK-2515
title: Pages d'erreur « Une issue utile » : 404 avec recherche, bien retiré avec alerte, erreur publique avec navigation
status: todo
phase: P1
family: front
estimate: S
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, erreurs, mobile, audit-ux]
---

## Objectif utilisateur

Le visiteur venu d'un lien WhatsApp vers un bien déjà loué repart avec des biens du même quartier ou une alerte, au lieu de quitter le site ; une erreur passagère ne l'enferme pas.

## Contrat de données

**Aucun endpoint neuf.** La page « plus disponible » existe (TCK-598, `bien-retire.tsx`) et `GET /api/public/properties/{slug}/status` rend déjà `state`, `contract_type`, `type`, ville, quartier et `similar` — *la note de la maquette qui demandait une route API est fausse, relevé le 2026-11-08*. « M'alerter » crée l'alerte sans compte existante (`public/search-alerts`, TCK-599) préremplie de ces critères, ou une recherche sauvegardée pour un connecté.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=erreurs&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- 404 de la racine : titre qui dit tout (plus de sur-titre « ERREUR 404 »), une recherche (simple formulaire GET, sans autocomplétion) et des raccourcis Louer, Acheter, Agences.
- Bien retiré : la raison, trois biens proches, « M'alerter » sur ce quartier, « Voir tout le quartier ».
- Erreur d'une page publique : « Réessayer » et « Retour à l'accueil », la référence technique (digest) en petit — que l'équipe retrouve dans ses journaux si on la lui donne. **Pas de « Signaler le problème »** (décision du porteur, 2026-11-08).
- Vouvoiement sur l'erreur serveur.

## Contraintes strictes (métier)

- Les statuts ne bougent pas : 404 reste 404, la page retirée reste 200 + `noindex` (TCK-598) ; aucune frontière qui rendrait 200 à un introuvable.
- Le 404 de la racine garde sa chrome légère (logo seul) : charger la navigation y doublerait le dictionnaire de tout le produit (TCK-438).
- **Un `error.tsx` sous `[locale]/(public)`** pour que la navigation reste autour d'une erreur de page (aujourd'hui seule la racine en a une).
- Corriger les liens croisés du « Bien introuvable » (« Voir les annonces » mène à `/`, « Lancer une recherche » à `/properties` : à inverser) — un défaut, pas un choix.

## Delta à produire

- [ ] 404 racine : recherche GET + raccourcis, sans sur-titre.
- [ ] Bien retiré : « M'alerter » préremplie, mise en page de la maquette.
- [ ] `error.tsx` public avec Réessayer, Retour à l'accueil, référence.
- [ ] Liens croisés corrigés.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (statuts conservés, liens corrigés, alerte préremplie avec le quartier, type et contrat du bien).

## Critères d'acceptation

- [ ] AC1 — `/fr/nexiste-pas` répond 404 et propose une recherche qui mène à `/fr/properties?…`.
- [ ] AC2 — Sur un bien loué à Mermoz, « M'alerter » ouvre l'alerte préremplie Mermoz + son type + son contrat.
- [ ] AC3 — Une erreur levée dans une page publique laisse la barre de navigation rendue, avec « Réessayer » et « Retour à l'accueil ».
- [ ] AC4 — « Voir les annonces » mène à la liste et « Lancer une recherche » à la recherche.

## Hors périmètre

- Un formulaire de signalement d'erreur.
- La règle de voix (tutoiement du 404 de découverte), non tranchée dans la charte.

## Notes d'implémentation

_(à remplir par implementing-specs)_
