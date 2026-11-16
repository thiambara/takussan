---
id: TCK-2925
title: "Crédits : « × plus de vues que la semaine d'avant », le « Rapport des 30 derniers jours » et les « Lots épuisés ou expirés »"
status: done
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

2026-11-15 — implémenté (agent délégué, worktree `feat/audit-manques-2026-11-15`), sur les API de TCK-2923 et TCK-2924.

- **Ligne de comparaison** (`lecture.ts::rapportDeVues`, `MisesEnAvant.tsx`) : au téléphone « 3,0 × plus de vues que la
  semaine d’avant » sous les mesures (maquette `:139`) ; au bureau « 3,0 × la sem. d’avant » sous le nombre de la
  colonne « Vues » (maquette `:357`). Nombre par `f.nombre` (virgule de la locale, `check-locale-figee`).
  **Décisions** (option la plus sûre) : la ligne n'est rendue que si (1) `views_prev_7d > 0` ; (2) la fenêtre de
  `views_7d` couvre 7 jours — fin = `ended_at` ou aujourd'hui (jamais `ends_at`), la règle de
  `BoostMeasures::viewsComparison` ; une Remontée (1 jour) ou une mise en avant commencée avant-hier ne compare pas
  1 ou 3 jours à 7 ; (3) le rapport arrondi dépasse 1,0 — « 0,5 × plus de vues » serait faux.
  **Écart de sens noté, non corrigé** : la colonne « Vues » reste `measures.clicks` (décision 1 a de TCK-2664) ; le
  rapport compare les vues de la FICHE (`property_daily_views`), comme le dit son libellé.
- **Rapport des 30 derniers jours** (`RapportEtLotsPasses.tsx::RapportDesTrenteJours`) : action de la carte « En avant
  en ce moment » au bureau → `PanneauDroit` (plein écran sous `xl`). Période, trois totaux, « Par mise en avant »
  (totaux de l'API, jamais recalculés), « Jour par jour » (30 lignes, le plus récent d'abord), légende.
  **Décision (libellés)** : jamais deux nombres sous le même mot — « Affichages » = `impressions`, « Vues » = `clicks`
  (le sens de la colonne de la page), « Consultations » = `views`. Aucune entrée au téléphone (la maquette n'en
  dessine pas). Une mise en avant terminée dit « du … au … », une en cours « depuis le … ». Le panneau garde
  titre et contenu du dernier ouvert pendant sa fermeture animée.
- **Lots épuisés ou expirés** (`ListeDesLotsPasses`) : action de la carte « Lots de crédits » au bureau → panneau ;
  au téléphone, le panneau « Lots de crédits » porte les lots passés sous les lots vivants. `GET /api/credits/lots`
  sans `filter[state]` (les deux états), `fields[credit_lots]`, 20 par page, lu seulement panneau ouvert. Ligne
  dédiée (pas `LotDeCredits`, qui dirait « Expire le … · aujourd’hui » en avertissement) : origine, pastille
  « Épuisé » / « Expiré », « N crédits reçus le … », et pour un expiré « expiré le … ». Un lot épuisé n'a pas de
  date d'épuisement dans l'API : aucune n'est inventée.
- Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2664.json` (AC-F1) : retirées les entrées « × la semaine d'avant » et
  « Rapport… / Lots épuisés… » ; celle du titre de carte réécrite (le titre ne prend plus la place de l'action) ;
  ajoutée l'absence légitime de la ligne de comparaison (vérité des données).
- Tests : `credits.tck-2925.test.tsx` (13 : 6 unitaires sur la règle, 7 sur la page) + `credits.tck-2664.test.tsx`
  (18) verts ; 10 ablations une à une, toutes rouges, restaurées au md5. `tsc`, ESLint, `check:i18n`, tous les
  `check:*` du front et `scripts/check-*.mjs` verts. Balayage des 153 tests front qui lisent les sources : 3 rouges sans lien avec les
  crédits (`fleche-de-retour-unique` sur `documents/coffre/ajout/Recadrage.tsx`, `seuils-de-saisie.parity`,
  `dashboard-me.tck-595`), plus `encre-sans-alpha` et `focus-et-contour-des-champs` sur des fichiers non modifiés.
- AC-F2 / AC-F3 **non mesurés** : pas de navigateur dans ce lot (consigne du porteur). La colonne « Vues » du bureau
  étroit (8 rem) peut passer « 3,0 × la sem. d’avant » sur deux lignes, comme la maquette (128 px).
