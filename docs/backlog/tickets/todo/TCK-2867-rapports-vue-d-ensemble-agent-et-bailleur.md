---
id: TCK-2867
title: "Rapports, vues d'ensemble : « Voir le tableau » des graphiques, « 12 mois », « Agence ▾ » (l'espace), « ⋯ › Exporter » au téléphone, l'équipe complète (total, demandes traitées, délai de réponse), la série « Impayés » ; le détail par bail de l'agent ; les demandes en attente et la courbe « Attendu » du bailleur"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2865]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, rapports, audit-ux, app]
---

## Objectif utilisateur

L'admin lit son agence sur la période et la portée qu'il choisit, avec les chiffres lisibles en tableau ; l'agent voit ce que chaque bail lui rapporte ; le bailleur compare l'encaissé à l'attendu et voit ce qui attend sa réponse.

## Contrat de données

- `period=last_12_months`, `median_response_minutes`, `totals`, `timeseries.overdue`, `timeseries.expected` : **livrés par TCK-2865**.
- « Agence ▾ » : l'espace actif et le choix d'espace de la coque (`/api/me/profiles`, `PATCH /api/me/active-profile`), déjà servis.
- Déjà servis : `leads_handled` (team-performance) ; commissions par bail (`GET /api/commissions?filter[beneficiary_id]=…&include=lease.property`, `CommissionEntry::$requestFilterable`) ; files du bailleur (`AFaireBailleur`, lectures existantes).

Relevé (audit-f3-coque.md, app-rapports e0, e7, e8 ; « Écarts couverts » 7, 8, 9, 10, 14) : `GraphiquesDuRapport.tsx:91-118` sans `action` (« Voir le tableau » consigné non traité par TCK-2801) ; pas de puce « 12 mois » ni de « Agence ▾ » ; en-tête masqué sous `md` sans « ⋯ » ; `EquipeDuMois.tsx` colonnes `properties_managed, visits_completed, leases_signed, commissions_earned` seulement ; `EnsembleAgent.tsx` et `OngletDesCommissions.tsx` : un lien au lieu du « Détail par bail » ; `EnsembleBailleur.tsx` sans « Demandes en attente » (renvoyé à l'accueil) ni « Attendu ».

## Direction UX / Artistique

**Référence de fidélité** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-rapports.tsx` et `app-rapports-pieces.tsx`, approche a :

- **e0 « Vue d'ensemble (admin) »** :
  - **les deux formats** : puces Ce mois · Mois dernier · **12 mois** (l. 97) ; **« Voir le tableau »** sur chaque graphique (`app-rapports-pieces.tsx` l. 322), qui montre les mêmes chiffres en tableau accessible ; le sélecteur **« Agence ▾ »** (l. 120, tête du bureau ; portée sous la période au téléphone) : le nom de l'espace actif, qui ouvre le choix d'espace de la coque (l'audit, écart 9 : « l'agence se choisit dans la coque ») — une agence seule : le nom sans menu ;
  - **téléphone** : le menu « ⋯ » de l'en-tête avec « Exporter » ; la série **« Impayés »** dans le segment des graphiques ;
  - **bureau** : le tableau « Performance de l'équipe » aux colonnes Agent · Biens gérés · **Demandes traitées** · Visites · Baux signés · Commissions générées · **Délai de réponse** (l. 160) et sa ligne de total « Équipe · 5 agents ».
- **e7 « Agent, portée « Moi » »** : **« Détail par bail »** — liste au téléphone ; tableau Bail · Client · Signé le · Loyer · Commission · Versement au bureau ; aussi dans l'onglet « Commissions » ; au bureau, le pipeline et « Mes commissions · 12 derniers mois » côte à côte dès `xl` (l. 752-757).
- **e8 « Bailleur »** : le bloc **« Demandes en attente »** (Visites à confirmer, Réservations, Devis, Avis sans réponse, chacun avec son verbe) ; la courbe **« Attendu »** superposée à l'encaissé, avec sa légende (`LegendeAttendu`, l. 846).

## Contraintes strictes (métier)

- « Voir le tableau » : un `table` avec en-têtes de mois, les mêmes valeurs que le graphique ; refermable.
- « Agence ▾ » n'ouvre un menu que s'il existe un autre espace ; changer d'espace recharge les rapports de cet espace.
- « Demandes en attente » du bailleur réutilise les lectures et gestes de l'accueil (`AFaireBailleur`), sans deuxième implémentation ; elle reste aussi sur l'accueil.
- Délai de réponse `null` → « — » avec une infobulle « pas assez de conversations ».
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] « Voir le tableau » ; puce « 12 mois » ; « Agence ▾ » ; « ⋯ › Exporter » (téléphone) ; série « Impayés ».
- [ ] Tableau de l'équipe complet avec total.
- [ ] « Détail par bail » (vue d'ensemble de l'agent et onglet « Commissions ») ; disposition bureau pipeline + « Mes commissions ».
- [ ] Bailleur : « Demandes en attente » et « Attendu ».
- [ ] Tests : tableau d'un graphique ; puce 12 mois → `period=last_12_months` ; colonnes et total de l'équipe ; détail par bail avec commission et versement ; légende « Attendu ».

## Critères d'acceptation

- [ ] AC1 — « Voir le tableau » du graphique « Encaissé » rend un `table` de 12 colonnes de mois dont les valeurs sont celles de la série.
- [ ] AC2 — Puce « 12 mois » : la requête porte `period=last_12_months`, la ligne de période dit les douze mois.
- [ ] AC3 — À 1440, admin : le tableau de l'équipe a les colonnes « Demandes traitées » et « Délai de réponse », et une dernière ligne « Équipe · 5 agents ».
- [ ] AC4 — Admin de deux agences : « Agence ▾ » porte le nom de l'agence active ; « › Thiès Properties » bascule l'espace et rend les rapports de Thiès. Admin d'une seule agence : le nom, sans menu.
- [ ] AC5 — À 390, l'en-tête porte « ⋯ » avec « Exporter » ; le segment des graphiques propose « Impayés ».
- [ ] AC6 — Agent avec deux baux signés ce mois : « Détail par bail » liste les deux avec leur commission ; le même détail est dans l'onglet « Commissions ».
- [ ] AC7 — Bailleur : « Demandes en attente » liste ses visites à confirmer avec leur verbe ; le graphique porte la légende « Attendu » et deux séries.
- [ ] AC8 — Vérifier au navigateur (audit, non vérifiables) : la bascule « Moi / Agence » avec un agent qui a `reports.view_agency` ; la carte « Mise en service » d'une agence non prête — corriger si absentes.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2867.json` : app-rapports e0, e7, e8, téléphone et bureau.
- [ ] AC-F2 — Zéro écart non expliqué ; rien de ce qui précède n'est « motivé », « consigné » ni renvoyé.
- [ ] AC-F3 — À 1024 et 768 : `scrollWidth − innerWidth = 0` ; les tableaux défilent dans leur conteneur.

## Hors périmètre

- Impayés, alertes, exports, personnalisation : TCK-2868.

## Notes d'implémentation

_(à remplir par implementing-specs)_
