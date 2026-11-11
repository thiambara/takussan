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
depends_on: [TCK-2600, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
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

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2603.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les chiffres par quartier ; la page des statistiques de marché.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
