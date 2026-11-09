---
id: TCK-2514
title: Pages par lien « La carte au centre » : document, confirmation et désinscription dans la coque de lien
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2513, TCK-2505]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, liens, mobile, audit-ux]
---

## Objectif utilisateur

Ouvrir un lien reçu par SMS ou courriel et faire l'unique chose qu'il promet — télécharger, confirmer, se désinscrire — en sachant de quoi il s'agit, sans la marketplace autour.

## Contrat de données

- Document partagé : `share/{token}` et son téléchargement, inchangés.
- Alertes : `GET /api/public/search-alerts/by-token`, `POST …/frequency` (TCK-2513), `confirm` et `unsubscribe` existants ; désinscription d'une alerte de compte (`saved-searches/{id}/unsubscribe`, URL signée) et du résumé : inchangées.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=liens&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Chaque page est **une carte** : pictogramme, titre qui dit ce qui va se passer, une phrase, une action sous le pouce. Coque de lien nue de TCK-2505.
- Confirmation et désinscription d'alerte montrent les critères (pastilles) et « N biens déjà en ligne ».
- La désinscription propose d'abord « Plutôt une fois par semaine », puis « Me désinscrire » — les deux visibles, aucun des deux caché.
- Chaque cul-de-sac (lien expiré, invalide, déjà utilisé) a deux issues : « Rechercher des biens » et « Besoin d'aide ? ».
- Vouvoiement.

## Contraintes strictes (métier)

- L'action ne part qu'au clic, jamais au chargement.
- Tout ce que les pages font reste : mot de passe d'un document sans le mettre dans l'URL ; nom, taille, date limite et téléchargements restants ; erreurs de mot de passe et de téléchargement ; désinscription « sans compte » (tout s'arrête, contact effacé) et « avec compte » (seule cette alerte) ; désabonnement du résumé ; `noindex` et `no-referrer`.
- Les erreurs passent par `ErrorState` (plus de `<p role="alert">` fait main).
- **Le titre de la désinscription sans compte dit ce qu'elle fait** : elle arrête toutes les alertes de ce contact, et ne s'intitule plus « Ne plus recevoir cette alerte ».
- L'état commun « lien mort » sert aussi la réclamation (TCK-2512).

## Delta à produire

- [ ] Gabarit « carte de lien » commun, posé dans la coque de TCK-2505.
- [ ] Document partagé, confirmation d'alerte, désinscriptions (sans compte, avec compte, résumé) migrés dessus.
- [ ] Critères et compte affichés ; choix hebdomadaire.
- [ ] État commun des liens morts, avec ses deux issues.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (rien ne part au chargement, choix hebdomadaire, titres corrigés, état mort).

## Critères d'acceptation

- [ ] AC1 — Charger la page de désinscription n'émet aucun `POST` (vérifié sur les requêtes du test).
- [ ] AC2 — « Plutôt une fois par semaine » appelle `frequency` et laisse l'abonné inscrit ; « Me désinscrire » appelle `unsubscribe`.
- [ ] AC3 — Un jeton inconnu affiche l'état « lien mort » avec ses deux issues, sans critères.
- [ ] AC4 — Aucune de ces pages ne porte la recherche, les favoris, le comparateur ni la barre d'onglets.

## Hors périmètre

- L'émetteur nommé d'un document partagé (approche B, non retenue).
- La coque de lien elle-même (TCK-2505).

## Notes d'implémentation

_(à remplir par implementing-specs)_
