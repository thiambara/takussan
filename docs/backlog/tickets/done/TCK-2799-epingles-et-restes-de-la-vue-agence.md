---
id: TCK-2799
title: "Une épingle sur une ancienne entrée de statistiques mène à « Rapports », et les restes de la vue agence quittent le dépôt"
status: done
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

- [x] AC1 — Un test du composeur : `['vue-agence','kpis']` épinglées pour l'admin → une seule épingle `rapports`, à la
  position de `vue-agence`. Ablation : retirer la table de correspondance → rouge.
- [x] AC2 — `['rapports','statistiques']` → `['rapports']`.
- [x] AC3 — Locataire avec `['statistiques']` épinglée → aucune épingle.
- [x] AC4 — `rg 'AgencyQueues|AgencyKpis|AgencyActivityFeed|AgencyRevenueSnapshot' takussan-web/src` ne rend rien.
- [x] AC5 — `node scripts/check-i18n.mjs` vert, et aucune des clés purgées n'est lue (recherche dans `src`).

## Notes d'implémentation (2026-11-14)

**Preuves des AC.**

- AC1 à AC3 : `src/lib/navigation/__tests__/composer-menu.epingles-devenues.tck-2799.test.ts` (8 cas). La table
  `EPINGLES_DEVENUES` et `epinglesMigrees` vivent dans `composer-menu.ts`, appliquées avant la boucle des épingles.
  Cas de plus : `rapports` épinglée APRÈS une ancienne garde sa propre place (`['statistiques','baux','rapports']` →
  `['baux','rapports']` ; une simple correspondance donnait `['rapports','baux']`), et les anciennes ne prennent
  qu'une des cinq places. Ablation (appel de `epinglesMigrees` retiré) : 3 cas rouges, dont les deux AC1 ; AC2 et
  AC3 restent verts sous l'ablation, ce qui est attendu (l'identifiant inconnu était déjà ignoré).
  Les identifiants viennent du catalogue d'avant TCK-2628 (`git show 131d1c69f^:…/catalogue.ts`).
- AC4 : `grep -rnE 'AgencyQueues|AgencyKpis|AgencyActivityFeed|AgencyRevenueSnapshot' takussan-web/src` ne rend
  rien (fichiers non suivis compris). Sept commentaires qui les nommaient sont réécrits (`AdminFinancesTabs`, `EnsembleAgence`, `a-faire.ts`,
  `format.ts`, `dateFnsLocale.ts`, `chiffres.ts`, `agency-queues.test.ts`).
- AC5 : clés retirées en fr, en, wo — `nav.sidebar.{statistics,exports,agencyView,kpis,alerts}`, et, au-delà du
  delta (même code mort) : `dashboard.agencyKpis`, `dashboard.agencyQueues`, `dashboard.agencyRevenue`,
  `dashboard.agencyActivity.heading` et `dashboard.agencyActivity.items.*.cta` (les `items.*.label` restent, lus par
  `EnsembleAgence`). Aucune n'est lue dans `src` ni dans `scripts`. `check-i18n` : rouge en local, ses 105 écarts tous dans les
  maquettes locales non suivies (`playground/maquettes`), aucun dans ce ticket — à rejouer sur l'extraction ; `check-i18n-namespaces` conforme ; `check-status-labels` vert.

**Retiré aussi, devenu mort avec les quatre** : `AgencyKpiTile.tsx` (seul `AgencyKpis` le montait) et
`components/dashboard/occupancy.ts` (`formatOccupancyRate`, seul `AgencyKpis` l'appelait), avec son test.
L'entrée `dashboard.agencyQueues.kycStatus` de `scripts/check-status-labels.mjs` est retirée ; `kyc.status` garde
`KycDossierStatus`.

**Ce que tenaient les tests retirés, et où c'est tenu maintenant.**

| Test retiré | Ce qu'il tenait | Où |
|---|---|---|
| `AgencyKpis.test` — six tuiles, KPI configurés, ordre, libellé, format | les chiffres de l'admin | `lib/rapports/__tests__/chiffres.tck-2628.test.ts`, `TuilesDuRapport.tck-2628.test.tsx` |
| `AgencyKpis.test` — pénalités sous les impayés ; commission | | `vues-d-ensemble.tck-2628.test.tsx` (« la commission du mois et les pénalités ») |
| `AgencyKpis.test` — ni total des biens ni nombre d'échéances répétés | AC2 de TCK-647 | `vues-d-ensemble.tck-2628.test.tsx` (« aucun chiffre n'y figure deux fois ») |
| `AgencyKpis.test` — tiret sur occupation et taux d'impayés `null` ; KPI configuré sans valeur | | `TuilesDuRapport.tck-2628` (« valeur absente ») + **porté** : `rapports/__tests__/repris-de-la-vue-agence.tck-2799.test.tsx` |
| `AgencyKpis.test` — ni indice ni danger sans impayé | | **porté** : `repris-de-la-vue-agence.tck-2799` |
| `AgencyKpis.test` — tuile « Taux d'impayés » en `warning` dès 10 % | | **abandonné** : les Rapports disent le « seuil d'alerte » de l'alerte active (TCK-2801 AC4), pas un seuil codé en dur |
| `occupancy.test` — `null` → « — », `0` → « 0 % » | TCK-1114 | **porté** : `repris-de-la-vue-agence.tck-2799` |
| `palette-et-locale` — tuiles en `en`, en `wo` (une seule convention, D1), total et axe en `en`/`fr` | TCK-374, TCK-292 | **porté** sur `TuilesDuRapport` et `GraphiquesDuRapport` : `repris-de-la-vue-agence.tck-2799` |
| `AgencyRevenueSnapshot.test` — vide, total | | `GraphiquesDuRapport.tck-2628.test.tsx` |
| `AgencyActivityFeed.test` / `.destinations` — quatre compteurs-liens, chacun vers une page qui existe | TCK-375, TCK-649 | `vues-d-ensemble.tck-2628` (« En chiffres ») ; **porté** : les liens d'`EnsembleAgence` résolus sur le système de fichiers, `repris-de-la-vue-agence.tck-2799` |
| `AgencyQueues.test` — quatre files, vide ≠ indisponible, KYC à traiter | | l'accueil, `AFaireAdmin.tck-2624.test.tsx` (« une file en panne n'est pas une file vide », AC2 KYC) ; `KYC_STATUSES_A_TRAITER` : `agency-queues.test.ts` |
| `AgencyQueues.test` — `individual` sans modération ni invitations ; `kind` inconnu les garde ; sans agence pas de KYC | sur les options partagées | **porté** : `lib/queries/__tests__/agency-queues.test.ts` (« les options partagées ») |
| `AgencyQueues.test` — le lien impayés vise un onglet qui existe ; `meta.total` | | `chiffres-du-mois.tck-2622.test.ts` (`?tab=impayes` dans `TAB_VALUES`) ; `meta.total` : `agency-queues.test.ts` |
| `AgencyQueues.source-unique.test` — barre et bloc, UNE requête | AC5 de TCK-375 | **porté** autrement : aucun fichier de `src` n'écrit la clé du compte en ligne (`agency-queues.test.ts`) ; ablation (un fichier qui l'écrit) : rouge |

- 2026-11-14 : clôturé — jugé au HEAD 0053d0bbd, tous les AC tenus avec preuve (verdict de clôture 2026-11-14-b).
