---
id: TCK-2799
title: "Une épingle sur une ancienne entrée de statistiques mène à « Rapports », et les restes de la vue agence quittent le dépôt"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2628]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
tags: [front, dette, code-mort, menu, epingles, suite-de-tck-2628, audit-ux, app]
---

## Objectif utilisateur

Une personne qui avait épinglé « Vue agence », « Statistiques », « KPIs », « Alertes » ou « Exports » retrouve, au même
endroit de son menu, une épingle « Rapports ». Aujourd'hui, depuis TCK-2628, ces épingles disparaissent sans bruit : le
composeur du menu ignore un identifiant inconnu, et l'API ne valide que le format des épingles, pas une liste blanche
(relevé de TCK-2628, décision D5 ; [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md),
amendement du 2026-11-14 § 5).

## Delta

1. **Migration au composeur** : `vue-agence`, `statistiques`, `kpis`, `alertes` et `exports` se lisent `rapports`, une
   seule fois même si plusieurs étaient épinglées, à la place de la première. Si `rapports` est déjà épinglée, les
   anciennes s'effacent. La persona sans Rapports (locataire, client, prestataire) n'en reçoit aucune.
2. **Code mort** : supprimer `AgencyQueues`, `AgencyKpis`, `AgencyActivityFeed`, `AgencyRevenueSnapshot` et leurs tests,
   après avoir vérifié par recherche qu'aucun montage ne les importe ; ce que leurs tests tenaient et que les onglets de
   Rapports ne tiennent pas est porté sur les onglets avant suppression.
3. **Clés orphelines** : purger les clés `nav.sidebar.*` des anciennes entrées (fr, en, wo) que plus aucun code ne lit.

## Critères d'acceptation

- AC1 — Un test du composeur : `['vue-agence','kpis']` épinglées pour l'admin → une seule épingle `rapports`, à la
  position de `vue-agence`. Ablation : retirer la table de correspondance → rouge.
- AC2 — `['rapports','statistiques']` → `['rapports']`.
- AC3 — Locataire avec `['statistiques']` épinglée → aucune épingle.
- AC4 — `rg 'AgencyQueues|AgencyKpis|AgencyActivityFeed|AgencyRevenueSnapshot' takussan-web/src` ne rend rien.
- AC5 — `node scripts/check-i18n.mjs` vert, et aucune des clés purgées n'est lue (recherche dans `src`).
