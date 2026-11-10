---
id: TCK-2596
title: "Aujourd'hui, la journée de l'agent : « À régler » puis la chronologie, ses chiffres en bas — et les tâches logées sans perte"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2578, TCK-2583, TCK-2585, TCK-2588, TCK-2595]
blocks: [TCK-2622]
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models:
    - "docs/models-spec.md#32-task-"
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, dashboard, tasks, visits, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent qui ouvre Takussan le matin, ou entre deux rendez-vous, voit sur un seul écran ce qu'il doit régler et où il doit être, dans l'ordre de la journée — et coche, reporte ou appelle sans changer de page.

## Contrat de données

Aucun endpoint neuf ; la page compose :
- visites du jour choisi : `GET /api/property-visits?filter[day]=&filter[mine]=1&include=property,customer` avec adresse et visiteur (TCK-2585) ;
- comptes rendus manquants : `filter[to_close]=1&filter[mine]=1` (TCK-2578) ;
- demandes qui attendent : `GET /api/contact-leads?filter[mine]=1&filter[handled]=0&filter[created_at_max]=<maintenant − 24 h>` (TCK-2583) ;
- tâches : `GET /api/tasks?filter[assigned_to]=me&filter[due]=overdue,today` (TCK-2595), et la page Tâches avec ses filtres ;
- relances : compte de `GET /api/customers?filter[follow_up]=1&filter[referent]=me` (TCK-2588) ;
- chiffres de l'ancien accueil : `GET /api/dashboard/me` (`properties_managed`, `pipeline_total`, `tasks_open`, `tasks_overdue`, `commissions_month` — `AgentMeMetrics.php:24-32`) ;
- gestes : `PATCH /api/tasks/{id}` (faite, échéance, assigné), `DELETE /api/tasks/{id}` (créateur), `POST /api/tasks`, `POST …/contacts` (TCK-2583).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-aujourdhui&a=a` — écrans « Ma journée », « Toutes les tâches », « Nouvelle tâche », « Tâche ouverte », « Journée libre » (deuxième retouche du 2026-11-10 : « Aujourd'hui » devient l'accueil de l'agent) ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- En-tête « Mardi 10 novembre » et bande de semaine défilante (L M M J V S D, chaque jour avec « 2 visites · 3 tâches » ou « Libre ») ; jour précédent / suivant ; « + » dans l'en-tête (Visite, Tâche, Client) — **aucun bouton flottant**.
- **À régler** (compté) : compte rendu manquant [Faire], demande qui attend depuis N j [WhatsApp], tâches en retard [✓][Reporter] — le retard sur sa propre ligne (« En retard depuis le 17 oct. »).
- **Chronologie** : ce qui a une heure dans l'ordre — « 10:57 · Visite · Local commercial · Dakar-Plateau · Abdoulaye Cissé » avec Itinéraire, Appeler, WhatsApp ; « 18:00 · Tâche · Relancer Yacine ».
- **Mes chiffres**, en petit au bas : une carte de quatre cases, chacune en lien vers sa liste — Biens gérés, Prospects (« N à relancer »), Tâches ouvertes (« dont N en retard »), Commissions du mois — et « Voir le rapport du mois » (pied de carte au téléphone, lien de l'intertitre au bureau).
- **Journée libre** : « Rien de prévu aujourd'hui. » + « N prospects à relancer ▸ ».
- **Toutes les tâches** (page Tâches) : pastilles En retard · Aujourd'hui · À venir · Sans échéance · Faites, avec compteurs, ouverture sur **En retard + Aujourd'hui** ; ligne : cercle à cocher, titre, **bien ou client nommé**, échéance (rouge si passée), gestes ; balayer à droite = Fait, à gauche = Reporter (Demain · Lundi · Choisir) ; toucher = « Tâche ouverte » (modifier, reporter, assigner, supprimer) ; « + » = feuille courte (titre, échéance en pastilles Aujourd'hui / Demain / Lundi / Date, rattachement prérempli quand on vient d'une fiche, d'une visite ou d'une demande).
- **Téléphone (360-390 px)** : une colonne, comme ci-dessus. **Bureau (≥ 1280 px)** : deux colonnes dès `lg` — chronologie à gauche, « À régler » et « Mes chiffres » à droite ; Tâches en trois colonnes En retard · Aujourd'hui · Cette semaine + « Plus tard » ; filtre « Assignée à » pour l'admin (TCK-2595).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md), [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md), [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md).

**Pas de régression** — l'ancien accueil de l'agent (`app/(dashboard)/app/(accueil)/page.tsx`) et « Mes tâches » (`MyTasks.tsx`, `tasks/page.tsx`, audit § 6) :
- les quatre chiffres de `DashboardMeKpis` (Biens gérés, Pipeline → « Prospects », Tâches ouvertes avec le retard, Commissions du mois) restent, chacun en lien ;
- le bandeau des brouillons d'assistant (`wizard-drafts`) reste en tête quand il y en a ;
- les raccourcis de `DashboardShortcuts` (clients, visites, calendrier, messages) restent atteignables : par les onglets, le Menu ou un lien de la page ;
- Tâches : `?filter[due]=` (Toutes, En retard, Aujourd'hui, À venir, Sans échéance) et `?filter[assigned_to]=me` (cible de la tuile « Tâches du jour ») gardés dans l'URL et conservés au changement d'échéance ; « Nouvelle tâche » (titre, date et heure, rattachement Client / Bien par recherche dès 2 caractères, 8 résultats, « Changer », bouton actif seulement avec titre et cible) ; cocher / décocher ; titre barré une fois faite ; lien vers le client ou le bien ; Appeler / WhatsApp pour un client ; « Voir plus » par 30 ; chargement, erreur avec « Réessayer », vide par filtre ; tâches d'un client toujours créées depuis sa fiche et visibles dans l'agenda ;
- une tâche ne s'assigne qu'au personnel de l'agence ; « Supprimer » n'est offert qu'au créateur.
- **Persona** : cette page est l'accueil de l'agent ; l'admin d'agence, le bailleur, le client gardent leur accueil (famille 3). La page Tâches sert tous les personas qui l'ont aujourd'hui.
- Heure de Dakar ; i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Contenu « Ma journée » (bande de semaine, À régler, chronologie, Mes chiffres, journée libre) pour l'agent.
- [ ] Page Tâches refaite (pastilles comptées, ouverture En retard + Aujourd'hui, balayage, feuille de tâche, édition, report, assignation, suppression).
- [ ] Tests : sources composées (requêtes émises avec leurs filtres) ; tri de la chronologie ; « Reporter · Demain » envoie `due_at` du lendemain 09:00 Dakar ; « Supprimer » absent pour une tâche créée par un autre ; chiffres en liens ; bandeau de brouillons présent ; `?filter[assigned_to]=me` conservé au changement d'échéance.

## Critères d'acceptation

- [ ] AC1 — À 390 px, l'agent de démo voit en premier écran « À régler » (compte rendu de la villa Liberté 6, Mouhamed qui attend depuis 8 j, deux tâches en retard) puis la visite de 10:57 avec son adresse.
- [ ] AC2 — Les quatre chiffres sont au bas de la page, chacun un lien (Biens gérés → « Mes biens », Prospects → la liste des clients filtrée sur les étapes vivantes et « Mes clients », Tâches ouvertes → Tâches, Commissions → la page des commissions ; mêmes cibles que les tuiles actuelles quand elles en ont une) ; « Voir le rapport du mois » mène à la page Rapports.
- [ ] AC3 — La tâche « Faire signer l'état des lieux d'entrée » affiche le nom du bien (plus « Un bien »).
- [ ] AC4 — Toucher le jour suivant dans la bande recharge la chronologie de ce jour (requête `filter[day]` du jour suivant au réseau).
- [ ] AC5 — À 1280 px, chronologie et « À régler » sont côte à côte ; la page Tâches s'ouvre sur En retard + Aujourd'hui.

## Hors périmètre

- **Le routage de `/app` par persona et la barre d'onglets de l'agent** (Aujourd'hui · Demandes · Clients · Messages · Menu, décision 10) : famille 3. Ce ticket livre le contenu ; sans le ticket de la coque, il est servi à l'agent sur `/app` en remplacement du contenu actuel de l'accueil, la coque restant inchangée.
- La page Rapports (famille 3) et la page Commissions (famille 6), cibles des liens.
- « 3 sans photo » et « 310 000 F à venir » (sous-lignes de la maquette sans donnée servie).
- Les tâches qui naissent seules des événements.

## Notes d'implémentation

_(à remplir par implementing-specs)_
