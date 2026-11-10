---
id: TCK-2628
title: "Une page « Rapports » à onglets remplace Vue agence, Statistiques, Indicateurs, Alertes et Exports — vue d'ensemble par persona, une série par graphique"
status: todo
phase: P1
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2618, TCK-2624, TCK-2625]
blocks: [TCK-2629]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, rapports, dashboard, navigation, adr-0089, audit-ux, app]
---

## Objectif utilisateur

Une seule entrée, « Rapports », pour ce que l'agence encaisse, ce qu'elle a en retard et comment travaille l'équipe ; pour l'agent, ses commissions et son pipeline ; pour le bailleur, ce que son patrimoine rapporte. Le rapport se consulte le lundi, la journée vit sur l'accueil : deux pages, deux rythmes (décision 1 b).

## Contrat de données

Aucun endpoint neuf dans ce ticket. Les lectures sont celles des vues actuelles :

- `GET /api/dashboard/agency` (tuiles, KPI personnalisés TCK-2373, séries de 12 mois) ;
- `GET /api/dashboard/agent` (portée `?scope=agency` sous `reports.view_agency`) ;
- `GET /api/dashboard/owner` (ouverte à l'admin qui détient `reports.view_agency`, TCK-2260 ; enrichie pour l'hôte) ;
- l'occupation avec sa base (`eligible_count`, `occupied_count`) de TCK-2626, dès qu'elle est livrée. Avant, le chiffre garde son libellé d'aujourd'hui.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-rapports&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Vue d'ensemble (admin) », « Agent, portée « Moi » », « Bailleur ».
- **Onglets par persona** (`ONGLETS_*` de la maquette) :
  - admin d'agence : « Vue d'ensemble · Équipe · Impayés · Exports · Alertes » ;
  - agent : « Vue d'ensemble · Commissions · Pipeline · Exports », avec la portée « Moi / Agence » sous `reports.view_agency` ;
  - bailleur et hôte : « Vue d'ensemble · Reversements · Exports ».
- **Une URL par onglet**, partageable, sous la même entrée de menu. Au téléphone, les onglets défilent horizontalement et collent sous l'en-tête. Au bureau, ce sont des onglets de page.
- **Période** : puces « Ce mois · Mois dernier · 12 mois », collantes au téléphone.
- **Vue d'ensemble** :
  - les chiffres en 2 colonnes au téléphone (4 au bureau), **chacun un lien** vers sa liste ;
  - le total et la variation au-dessus de chaque courbe (« +8 % sur octobre ») ;
  - **une série par graphique**. « Commissions et baux signés » et « Cashflow et occupation » deviennent deux graphiques, ou des onglets de graphique au téléphone (« Revenus · Occupation · Impayés ») ;
  - graduations arrondies (« 100 M », « 50 M »).
- **Couleurs de graphique** : les jetons `--chart-1…4` actuels échouent à la validation catégorielle (relevé de la maquette). Une seule série par graphique n'en demande qu'une ; toute série supplémentaire passe la validation d'abord.
- **Admin, « À traiter »** : il quitte la vue d'ensemble pour l'accueil (TCK-2624). La vue d'ensemble garde « Équipe ce mois » (lien vers l'onglet Équipe) et « Invitations sans réponse ».
- **« Activité récente »** de la Vue agence : ses quatre compteurs (réservations en attente, interventions ouvertes, clients, membres) restent des liens, sous le nom « En chiffres », et non plus « Activité récente ».
- **Placement dans le menu** (décision du porteur) :
  - admin : « Rapports » remplace « Vue agence » en tête ;
  - agent : dans « Gestion » ;
  - bailleur : après l'accueil.

  « Statistiques », « Indicateurs », « Alertes » et « Exports » quittent le menu.
- **Téléphone (360–390)** : une colonne, un graphique à la fois. **Bureau (≥ 1280)** : grille de chiffres sur 4 colonnes dès `lg`, graphiques côte à côte.

## Contraintes strictes (métier)

**Pas de régression : chaque fonction des vues actuelles a sa place.**

- **Vue agence** :
  - période ;
  - tuiles (y compris les KPI personnalisés) ;
  - revenus et occupation sur 12 mois ;
  - état dégradé quand une lecture échoue (`AgencyDegradedState`) ;
  - mise en service (déplacée vers l'accueil, TCK-2622) ;
  - « À traiter » (déplacé vers l'accueil, TCK-2624).
- **Vue agent** :
  - portée « Moi / Agence » sous `reports.view_agency` (`?scope=agency`), avec des liens qui portent la portée ;
  - tuiles ;
  - commissions (ce mois, cumul annuel, « Détail par bail ») ;
  - pipeline par étape ;
  - commissions et baux signés sur 12 mois.

  Les **priorités, visites du jour et tâches** de la vue agent partent dans « Aujourd'hui » (famille 5), et non dans Rapports.
- **Vue bailleur** :
  - tuiles ;
  - portefeuille (disponibles, loués, autres) ;
  - prochains reversements ;
  - cashflow et occupation sur 12 mois.

  Les demandes en attente partent dans l'accueil (TCK-2624).
- **Ma situation** (locataire, client) est absorbée par l'accueil (TCK-2625). Le locataire et le client n'ont **pas** de Rapports.
- **Le prestataire n'a pas de Rapports** (spec § 2.5).
- **Les anciennes adresses** (`/app/overview`, `/app/overview/agency`, `/agent`, `/owner`, `/kpis`, `/alerts`, `/exports`) redirigent vers l'onglet équivalent, avec leurs paramètres (`scope`, période). Un lien d'e-mail, de notification ou de favori ne casse pas.
- **Gardes d'accès** : chaque onglet garde la garde de la page qu'il remplace. Un onglet que le persona ne peut pas ouvrir n'est pas rendu (jamais un cadenas).
- **Module `analytics`** masqué par l'agence (`hidden_modules`, aujourd'hui `kpis`, `alertes`, `exports`) : il masque les onglets correspondants, et l'entrée « Rapports » reste tant qu'il reste un onglet. Amendement du 2026-11-10 de [ADR-0089](../../../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) ; page Rapports : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md).
- **Aucune destination perdue** : test qui compare le jeu d'`href` accessibles avant et après, par persona. Les anciennes entrées sont devenues des onglets.
- Libellés en français (« Indicateurs », jamais « KPIs ») en `fr`/`en`/`wo` (`wo` = le français tel quel) ; vouvoiement.

## Delta à produire

- [ ] La page « Rapports » : onglets par persona, une URL par onglet, période, vue d'ensemble par persona (admin, agent avec portée, bailleur et hôte).
- [ ] Entrée « Rapports » dans le catalogue et les dispositions. Retrait de « Vue agence », « Statistiques », « Indicateurs », « Alertes » et « Exports » du menu. Module `analytics` appliqué aux onglets.
- [ ] Redirections des sept anciennes adresses.
- [ ] Graphiques : une série par graphique, graduations arrondies, total et variation.
- [ ] Tests :
  - onglets exacts par persona ;
  - redirections avec paramètres ;
  - un agent sans `reports.view_agency` sans portée « Agence » ;
  - module `analytics` masqué : onglets « Exports » et « Alertes » absents ;
  - jeu d'`href` avant / après ;
  - un graphique ne porte qu'une série.

## Critères d'acceptation

- [ ] AC1 — Admin d'agence `standard` à 1280 : la colonne commence par « Accueil » puis « Rapports », et ne contient ni « Vue agence », ni « Statistiques », ni « Indicateurs ». La page Rapports porte les onglets « Vue d'ensemble, Équipe, Impayés, Exports, Alertes », dans cet ordre.
- [ ] AC2 — `/app/overview/agent?scope=agency` rend une redirection vers l'onglet « Vue d'ensemble » de l'agent, avec la portée « Agence » sélectionnée.
- [ ] AC3 — Une agence qui masque `analytics` : la page de son admin n'a ni « Exports » ni « Alertes », et `/app/overview/alerts` mène à la vue d'ensemble, et non à une page vide.
- [ ] AC4 — Bailleur : la vue d'ensemble dit « 5 biens loués sur 5 en location » à côté du taux, quand TCK-2626 est livré. Elle n'affiche jamais « 54 disponibles » et « 100 % » sans leur base sur le même écran.
- [ ] AC5 — À 390, le graphique « Revenus » n'a qu'une série, et ses graduations sont des multiples ronds (« 50 M », « 100 M »), sans « 101 394 241 ».
- [ ] AC6 — Un locataire et un prestataire n'ont aucune entrée « Rapports », et `/app/overview` les mène à `/app`.

## Hors périmètre

- Les onglets « Équipe », « Impayés », « Exports », « Alertes » et « Personnaliser les chiffres » (TCK-2629).
- Le rapport mensuel envoyé seul (ambition de l'audit, non retenue).
- Les pages Commissions (famille 6) et Pipeline (famille 5) : les onglets de l'agent montrent l'analyse et mènent à ces pages.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
