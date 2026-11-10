---
id: TCK-2603
title: "« 1 240 recherches à Dakar cette semaine » : un chiffre vrai sur le départ de la publication"
status: todo
phase: P2
family: full
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2600]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [back, front, publish, acquisition, search-journal, audit-ux, app]
---

## Objectif utilisateur

Le propriétaire qui hésite à publier voit, sur le premier écran, combien de personnes cherchent un logement dans sa ville cette semaine.

## Contrat de données

Re-mesure : aucun endpoint public ne compte les recherches. Le journal anonyme des recherches (ADR-0088) ne sort aujourd'hui qu'en quatre usages, dont un agrégat par quartier réservé au porteur d'un lien de réclamation du Radar (amendement TCK-2511). **Une cinquième sortie exige un amendement d'ADR-0088** (amendement du 2026-11-10 de [ADR-0088](../../../adr/0088-le-journal-anonyme-des-recherches.md), « cinquième sortie »).

- **À créer** : `GET /api/public/publish/demand?city={nom}` → `{ data: { city, searches_7d } }` : nombre de recherches journalisées des 7 derniers jours dont la ville est `city` ; `searches_7d: null` sous le seuil (`publish.demand_min_searches`, 200 par défaut) ; ville absente → la ville la plus recherchée du référentiel (Dakar).
- Contrôleur `PublicPublishDemandController`, FormRequest `PublicPublishDemandRequest` (`city` facultative, ville du référentiel), cache 1 h, `throttle:public-read`.
- Front : la carte de preuves du départ de `/publish` (TCK-2600) lit cet endpoint.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-entree-publier&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écran « Départ : le bien », carte sauge à deux chiffres.
- Le chiffre est arrondi à la dizaine inférieure et groupé selon la langue (`useFormatteurs()`).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0093](../../../adr/0093-publier-sans-compte-le-brouillon-vit-dans-le-navigateur.md).
- Aucun chiffre inventé : sous le seuil, en échec ou en attente, la case du chiffre disparaît (pas de zéro, pas de squelette qui reste).
- Rien d'autre que le total ne sort : ni saisie, ni quartier, ni compte de visiteurs (règle d'ADR-0088 pour l'agrégat).
- Le second chiffre de la carte (« 0 F de commission ») n'est écrit que s'il est vrai pour un espace particulier ; sinon la carte n'a qu'un chiffre.
- Libellés en `fr`/`en`/`wo`.

## Delta à produire

- [ ] Amendement d'ADR-0088 écrit et accepté avant le code.
- [ ] Route `GET /api/public/publish/demand`, contrôleur, FormRequest, réglage `publish.demand_min_searches`, cache.
- [ ] `privacy.ts` dit la nouvelle sortie (ADR-0088 §6) et `VERSION_DOCUMENTS` avance.
- [ ] Front : la carte de preuves de `/publish`.
- [ ] Tests : `PublicPublishDemandTest` (seuil → `null`, compte des 7 jours, ville inconnue → 422, aucune autre clé dans la réponse) ; front : carte absente quand `null`.

## Critères d'acceptation

- [ ] AC1 — 199 recherches « Dakar » sur 7 jours → `searches_7d: null` ; 1 247 → `1247` ; la page affiche « 1 240 ».
- [ ] AC2 — La réponse ne contient que `city` et `searches_7d` (test de forme exacte).
- [ ] AC3 — API injoignable : le départ de `/publish` s'affiche sans la case du chiffre, sans message d'erreur.

## Hors périmètre

- Les chiffres par quartier ; la page des statistiques de marché.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
