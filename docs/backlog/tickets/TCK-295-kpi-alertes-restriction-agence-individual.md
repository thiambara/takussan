---
id: TCK-295
title: "§1.12 — rendre EXPLICITE que les KPI et alertes de seuil ne sont pas réservés aux agences `standard`"
status: todo
phase: P3
family: technique
estimate: S
wave: null
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-284]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [spec, autorisation, tracabilite]
---

## Objectif utilisateur

Qu'un `agency_admin` d'agence `individual` — et surtout la prochaine personne qui lira la spec —
trouve la réponse ÉCRITE sur les KPI personnalisables et les alertes de seuil, au lieu d'avoir à
la déduire d'un silence.

## Contrat de données

Aucun changement de données. Aucun changement d'API. Aucun changement de front.

Endpoints concernés, laissés tels quels : `Api\KpiConfigController` et
`Api\ThresholdAlertController` (`routes/api/kpis-and-alerts.php`), surfaces
`/app/overview/kpis` et `/app/overview/alerts`.

## Contraintes strictes (métier)

**La décision est déjà prise, ce ticket ne la rouvre pas.** TCK-284 l'a tranchée le 2026-08-15,
section « ✅ Arbitrage produit » : ces deux écrans ne sont **pas** réservés aux agences
`standard`, et les deux entrées correspondantes ont été retirées de `PRO_ROUTES`.

Ce qui reste est la FORME de cette décision dans la spec. Aujourd'hui elle ne s'y lit que par
soustraction : §1.12 énumère une liste **fermée** de restrictions où les KPI et les alertes ne
figurent pas, puis conclut « toutes les autres capacités restent disponibles ». La réponse est
donc juste, mais elle est portée par un silence.

Or ce dépôt a déjà payé ce mécanisme exact, en sens inverse : **TCK-256 avait décidé et livré la
restriction « carnet de propriétaires » que cette même clause résiduelle NIAIT** — et la
contradiction a tenu jusqu'à ce que TCK-284 la lève. *Une règle que la spec ne nomme pas finit par
être appliquée, ou retirée, par quelqu'un qui lit la spec.* Le verrou sur les KPI et les alertes
avait précisément été ajouté par un commit (`5d40dd31`) qu'aucun ticket ne demandait.

## Delta à produire

- [ ] `docs/features.md` §1.12 : après la liste fermée des restrictions `individual`, nommer
      explicitement les KPI personnalisables et les alertes de seuil comme **disponibles**, en
      citant TCK-284 comme l'arbitrage qui l'a tranché.
- [ ] Vérifier qu'aucune autre capacité de §2.5 ne se trouve dans le même angle mort (lecture de
      la table §2.5 ligne à ligne contre la liste §1.12).

## Critères d'acceptation

- [ ] AC1 — un lecteur de `docs/features.md` §1.12 trouve la réponse sur les KPI et les alertes
      de seuil **sans avoir à raisonner par clause résiduelle**.
- [ ] AC2 — la spec, `PRO_ROUTES` (`takussan-web/src/lib/access/pro-features.ts`) et les deux
      contrôleurs restent d'accord : aucune des trois sources ne peut être lue sans retrouver la
      même réponse. `node scripts/check-pro-routes.mjs` reste vert à 7/7.
- [ ] AC3 — aucune ligne de code ne change. Un diff qui touche `app/` ou `src/` sort du périmètre
      de ce ticket.

## Hors périmètre

- **Rouvrir l'arbitrage.** Il est tranché (TCK-284). Ce ticket écrit la décision, il ne la
  rediscute pas.
- Les cinq routes `/admin/*`, `/app/overview/agency` et `/app/owners`, dont la restriction est
  tranchée, spécifiée ET gardée des deux côtés.
- L'implémentation des KPI personnalisables et des alertes de seuil elles-mêmes (§2.5, P3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
