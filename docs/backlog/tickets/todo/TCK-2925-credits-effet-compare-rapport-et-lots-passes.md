---
id: TCK-2925
title: "Crédits : « × plus de vues que la semaine d'avant », le « Rapport des 30 derniers jours » et les « Lots épuisés ou expirés »"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2923, TCK-2924]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#95-creditlot-"
tags: [front, credits, boost, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'agence voit ce qu'une mise en avant lui a rapporté par rapport à avant, relit le détail sur 30 jours, et retrouve ses lots passés.

## Contrat de données

- `GET /api/credits/boosts` : `views_7d`, `views_prev_7d` (TCK-2923).
- `GET /api/credits/boosts/report?days=30` et `GET /api/credits/lots?filter[state]=…` (TCK-2924).
- La spec ne détaille pas ces trois éléments : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** : `app-credits`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-credits.tsx`, visionneuse `?p=app-credits&a=a`, **e0 « Crédits »** :
  - ligne « {n} × plus de vues que la semaine d'avant » (ton succès) sous les mesures d'une mise en avant (`:139`) — **téléphone et bureau** ;
  - action « Rapport des 30 derniers jours » de la carte « En avant en ce moment » (`:333`) — **bureau** ;
  - action « Lots épuisés ou expirés » de la carte « Lots de crédits » (`:387`) — **bureau** (au téléphone, la ligne « Lots » mène au même contenu).
- Audit : `audit-f6-agence-entree.md`, § app-credits e0 ; fiche TCK-2664 (`ecarts_acceptes` a-0, renvoi à TCK-2663 jamais tenu).

## Contraintes strictes (métier)

- Le ratio n'est rendu que si `views_prev_7d > 0` ; sinon aucune ligne (jamais « Infinity × » ni « 0 × »). Arrondi à une décimale, virgule décimale.
- Le rapport et les lots passés s'ouvrent en panneau droit au bureau, en plein écran au téléphone, comme Historique / Lots aujourd'hui.
- Libellés `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Ligne de comparaison sous chaque mise en avant.
- [ ] Rapport des 30 derniers jours (série par jour + totaux par mise en avant).
- [ ] Lots épuisés ou expirés (liste, état, date).
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Une mise en avant à `views_7d: 30`, `views_prev_7d: 10` porte « 3,0 × plus de vues que la semaine d'avant » ; à `views_prev_7d: 0`, aucune ligne de comparaison n'est rendue.
- [ ] AC2 — À 1440, « Rapport des 30 derniers jours » ouvre un panneau listant 30 jours et, par mise en avant, les totaux de la période égaux à ceux de l'API.
- [ ] AC3 — « Lots épuisés ou expirés » ouvre la liste des lots `spent` et `expired` (état et date lisibles) ; un lot dépensable n'y paraît pas. Liste vide → phrase d'état vide.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2664 mise à jour : les trois entrées d'`ecarts_acceptes` couvertes sont retirées.
- [ ] AC-F2 — À 390 × 844 et 1440 × 900 (densité ×0,9), `fidelite compare` sur e0 ne rend aucun écart non expliqué.
- [ ] AC-F3 — À 1024 et 768, aucun défilement horizontal du document.

## Hors périmètre

- L'achat de crédits (« Recharger · Bientôt » reste).

## Notes d'implémentation

_(à remplir par implementing-specs)_
