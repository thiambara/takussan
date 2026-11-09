---
id: TCK-2523
title: Fiche d'agent « La personne d'abord, ses biens cherchables »
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2517, TCK-2518, TCK-2519, TCK-2522]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, directory, mobile, audit-ux]
---

## Objectif utilisateur

Mettre un visage sur l'annonce : savoir avant d'écrire si l'agent parle sa langue, connaît son quartier, répond vite — et chercher dans ses biens quand il en a beaucoup.

## Contrat de données

`GET /api/public/agents/{slug}` (langues, quartiers, délai — TCK-2518 ; `canonical_slug` — TCK-2519) ; biens : liste publique avec `filter[agent]` et `facets` (TCK-2517).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=agent&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Agent, Biens filtrés, Aucun bien, Propriétaire.
- Premier écran : photo ou initiales, nom, agence cliquable, langues, quartiers, délai de réponse ; WhatsApp, Appeler, Message (le formulaire anonyme reste la voie Message).
- Recherche dans ses biens **au-delà de six biens seulement** ; mêmes composants que la fiche d'agence (TCK-2522).
- État « Aucun bien » : renvoie vers les biens de son agence (« Chez Dakar Immo, son agence »).
- Propriétaire sur option (1b) : nom abrégé, aucun numéro personnel, contact renvoyé à l'agence qui gère ses biens.

## Contraintes strictes (métier)

- Rien de l'existant ne se perd : initiales en repli, badge vérifié, rattachement à l'agence, bio, compte de biens, portefeuille Tous / À louer / À vendre avec « Voir plus », avis, état vide propre au propriétaire, vrai 404, état « indisponible ».
- Redirection 301 sur `canonical_slug` (TCK-2519).
- Filtres dans l'URL ; rendu serveur.

## Delta à produire

- [ ] Premier écran « personne » (langues, quartiers, délai).
- [ ] Recherche au-delà de six biens, état vide vers l'agence.
- [ ] Variante propriétaire sur option.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (seuil de six, renvoi vers l'agence, propriétaire sans numéro, redirection).

## Critères d'acceptation

- [ ] AC1 — Un agent à six biens n'a pas de recherche ; à sept, il l'a.
- [ ] AC2 — Une recherche sans résultat propose les biens de son agence avec leur compte.
- [ ] AC3 — La fiche d'un propriétaire sur option ne contient aucun numéro (balayage du HTML) et son bouton de contact vise l'agence.
- [ ] AC4 — Langues et délai absents : aucune ligne vide ni « — ».

## Hors périmètre

- La saisie des langues et quartiers (TCK-2524).

## Notes d'implémentation

_(à remplir par implementing-specs)_
