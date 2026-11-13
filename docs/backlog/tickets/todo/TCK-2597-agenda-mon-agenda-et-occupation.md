---
id: TCK-2597
title: "Agenda : « Mon agenda » (le jour au téléphone, la semaine au bureau) et « Occupation des biens » — les séjours sortent des rendez-vous"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2585, TCK-2586, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#72-calendarfeed-"
tags: [front, calendar, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent ouvre l'agenda pour savoir où il doit être maintenant et voit sa journée tout de suite ; le bailleur et l'admin voient quels biens sont occupés, sans que les séjours noient les rendez-vous.

## Contrat de données

- `GET /api/calendar` (existant) : « Mon agenda » demande `types[]=visit&types[]=task` (+ `mine`) ; « Occupation » demande `types[]=booking&types[]=lease_event&types[]=maintenance` — **re-mesuré** : c'est le front qui choisit les types (`IndexCalendarRequest.php:36-53`), donc sortir les séjours des rendez-vous ne demande aucun changement d'API ; `mine` n'agit de toute façon pas sur les réservations (`CalendarEventCollector.php:170-188`).
- Événements de visite avec visiteur et adresse (TCK-2585).
- Liste des biens pour l'occupation et le filtre : l'index des biens de la console (`fields[properties]=id,title,…`) — fin du filtre déduit des événements et nommé d'après l'un d'eux (`CalendarPage.tsx:138-149`).
- Abonnement iCal : `GET|POST|DELETE /api/me/calendar-feed` (existant).
- « Planifier une visite » : TCK-2586, préremplie du jour et de l'heure touchés.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-agenda&a=a` — écrans « Mon agenda — jour », « Filtres et légende », « Occupation des biens », « Mois (admin) », « Événement », « Abonnement iCal » ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Bascule « Mon agenda / Occupation des biens » ; sélecteur « Moi / Agence » dans l'en-tête (il remplace la case « Mes rendez-vous », qui reste dans la feuille de filtres) ; « + » dans l'en-tête.
- **Téléphone (360-390 px)** : **vue Jour par défaut**, bande de 7 jours avec points au-dessus ; liste du jour : « 10:57 ● Visite · Local Dakar-Plateau · Abdoulaye Cissé » avec Itinéraire, Appeler, WhatsApp ; repliée en bas « Occupation : 8 séjours en cours ▸ » ; bouton « Filtres (n) » qui ouvre une feuille (types, bien, légende) — la journée commence sous l'en-tête, plus à 1 500 px (relevé de l'audit).
- **Bureau (≥ 1280 px)** : **Semaine par défaut pour l'agent** (créneaux 8 h-20 h, visites et tâches en blocs, panneau du jour à droite) ; **Mois pour l'admin et le bailleur**, séjours en **barres continues** sur plusieurs jours, visites en puces, « +N » qui ouvre le jour.
- Occupation : un bien par ligne ; au bureau, 30 ou 31 colonnes de jours, séjours en barres avec le nom du client, échéances de bail en losanges, interventions en points ; au téléphone, une barre de 14 jours par bien (séjours en aplats, nuits libres en blanc) ; toucher ouvre le bien.
- Chaque événement dit son **type en mots** (« Visite », « Tâche », « Séjour », « Fin de bail », « Intervention ») ; cinq couleurs distinctes (plus deux verts voisins) ; l'état actif d'une bascule de type ne se lit pas qu'à la couleur ; « en attente » lisible sur le fond du jour.
- Toucher un créneau vide → « Planifier une visite à 15:00 ».

## Contraintes strictes (métier)

**Pas de régression** (`CalendarPage.tsx`, `CalendarSubscription.tsx`, audit § 7) :
- vues Mois, Semaine, Jour, Liste (30 jours) ; Précédent / Aujourd'hui / Suivant ; tout dans l'URL (`view`, `date`, `types`, `property`, `mine`) — la vue par défaut ne s'applique que sans `view` dans l'URL ;
- « Mes rendez-vous » pour le personnel, coché d'emblée pour un agent non admin ; bascules des cinq types (jamais toutes éteintes) ; filtre par bien avec bandeau des filtres actifs ; légende ; gris = demande ou signature en attente ;
- Mois : deux événements par jour puis « +N autres », points au téléphone, panneau du jour ;
- fiche d'événement (feuille au téléphone, panneau au bureau) : type, état, titre, dates, référence, durée, « Voir le bien », « Ouvrir la réservation / le bail / la tâche / l'intervention / la visite » — **enrichie** du visiteur et de l'adresse pour une visite ;
- « Planifier une visite » dans l'en-tête ;
- abonnement iCal personnel (agent, admin d'agence) : créer, copier, Google Agenda, Apple (`webcal:`), dernier accès, révoquer ;
- audiences : personnel, bailleur, prestataire (interventions seules — sans « Mon agenda » de visites).
- **Décision 8 de l'audit** : pour l'agent, les séjours sortent de « Mon agenda » vers « Occupation » ; pour l'hôte et le bailleur en courte durée, ils restent visibles, repliés en fin de journée.
- Libellé unique « Agenda » (au lieu de « Calendrier » au menu — l'entrée du menu est de la famille 3) ; heure de Dakar ; i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Bascule Mon agenda / Occupation ; vues par défaut selon l'écran et le persona ; feuille de filtres.
- [ ] Vue Occupation (bureau et téléphone).
- [ ] Séjours en barres continues dans la vue Mois.
- [ ] Événements enrichis ; couleurs et libellés de type ; créneau vide → planification.
- [ ] Filtre par bien nourri par l'index des biens.
- [ ] Tests : agent au téléphone sans `view` → Jour ; `?view=month` respecté ; « Mon agenda » ne demande pas `booking` ; Occupation demande `booking,lease_event,maintenance` ; barre continue d'un séjour de 23 nuits (un élément, pas 23) ; abonnement iCal intact ; prestataire sans visites.

## Critères d'acceptation

- [ ] AC1 — À 390 px, l'agent ouvre `/app/calendar` : la visite de 10:57 est visible sans défiler, avec son visiteur ; aucun séjour dans la liste du jour, « Occupation : N séjours en cours ▸ » replié en bas.
- [ ] AC2 — À 1280 px, l'agent ouvre sur la Semaine, l'admin sur le Mois ; dans le Mois, le séjour du 2 au 24 novembre est une seule barre par semaine traversée (compte d'éléments au DOM).
- [ ] AC3 — Le filtre « Tous les biens » liste les biens par leur vrai titre, y compris un bien sans événement dans la période.
- [ ] AC4 — Toucher le créneau vide de 15:00 mercredi en vue Semaine ouvre la planification sur mercredi 15:00.
- [ ] AC5 — L'abonnement iCal se crée, se copie et se révoque comme avant.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2597.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les disponibilités déclarées de l'agent.
- Un endpoint d'occupation côté API (inutile : l'occupation se compose des événements et de la liste des biens).
- Le libellé du menu (famille 3).

## Notes d'implémentation

- **Deux vues d'une même page, dans l'URL.** `mode` (`agenda` | `occupation`) s'ajoute à `view`, `date`, `types`, `property`, `mine` (TCK-1740). La vue choisie s'écrit toujours, même égale au défaut (son défaut dépend de l'écran et de la personne : un lien copié s'ouvre pareil partout) ; changer de mode efface `types` et `view`. Rien ne se lit avant que l'écran soit connu (`useSyncExternalStore`, `null` au serveur) : sans quoi le téléphone demanderait la semaine du bureau puis la journée.
- **La partie pure** vit dans `src/lib/agenda/agenda.ts` (personas, types par mode, vue par défaut, journée avec créneaux libres d'au moins 60 min arrondis au quart d'heure, semaine en couloirs, résumé) et `src/lib/agenda/occupation.ts` (nuits d'un séjour, barres d'une rangée sur pistes avec « +N », état d'un bien, résumé). Les jours sont des `AAAA-MM-JJ` de Dakar, les heures l'heure murale de Dakar.
- **Décision 8 de l'audit** : l'agent ouvre « Mon agenda » sur `visit,task` ; les séjours du jour sont lus à part, sur UN jour (`types[]=booking`, `start_date = end_date`), seulement pour le compte replié « Occupation : N séjours en cours ▸ ». L'admin et le bailleur gardent les cinq types ; au mois, les séjours sont des barres (une par semaine traversée, deux pistes puis « +N séjours ») et sortent des puces et des points.
- **Occupation** : l'API n'a pas d'endpoint d'occupation (hors périmètre) ; la vue compose `GET /api/calendar` (`booking,lease_event,maintenance`, le mois au bureau, 14 jours au téléphone) avec l'index des biens — d'abord ceux que touchent les événements (`filter[id]` en liste), puis le parc en location par titre (`filter[contract_type]=rent`, 20 par page, « Voir plus de biens »).
- **Filtre « Bien »** : l'index des biens par leur titre (`fields[properties]=id,title`, `sort=title`), cherché au serveur dès deux caractères (`filter[search]`) ; le titre d'un bien venu de l'URL se relit par `filter[id]`.
- **Écarts de donnée** : l'événement `booking` de `/api/calendar` ne porte pas le nom du client — la barre dit « {n} nuits · {référence} » à l'occupation et « Séjour · {bien} » au mois ; la démo n'a ni séjour ni échéance de bail. Le lien iCal ne se montre qu'à sa génération (TCK-591) : la feuille propose de le générer.
- **Mois** : `MoisDeLAgenda` au bureau (une carte de sept colonnes ; par semaine, les séjours en barres puis deux puces par jour « 10:57 · Visite » et « +N », qui ouvre le jour ; le panneau du jour ne s'ouvre qu'au toucher d'un jour et se referme), `MoisCompact` au téléphone (initiales, un disque par jour, trois points au plus, sans les séjours) suivi de la journée choisie, l'occupation repliée en tête.
- **Occupation** : le résumé (« 1 séjour en cours · 1 bien libre ce soir ») est la description de la tête de page au bureau, et reste collé en haut au téléphone ; la période du téléphone se dit « 10–23 nov. » avec la pastille « 14 j ». L'état et le chargement viennent de `useOccupationDesBiens`, partagé par la tête de page et la vue.
- **Abonnement iCal** : `CalendarSubscription` est réécrit pour la feuille (plus de prop `enFeuille`) — le lien émis s'affiche une fois avec « Copier » et les boutons Google et Apple ; actif, les lignes « Créé le », « Dernier accès », « Contenu », puis « Révoquer le lien » et « Générer un nouveau lien ». Le flux contient tous les types que l'agent voit (`CalendarFeedService::events`, `mine: true`) : l'intro et « Contenu » le disent, pas « vos visites et vos tâches ».
- **Barre de période du téléphone** : la période se dit court (« Nov. 2026 », « 9–15 nov. » pour la semaine, « 10–23 nov. » ou « 24 déc. – 6 janv. » pour l'occupation : sur deux années, sans l'année) par `Intl.DateTimeFormat.formatRange` (l'ordre suit la locale : « Nov 10 – 23 ») ; le menu de vue dit « Sem. » ; sous 24rem, flèches de 36 px et barre sans gouttière ; au-delà, la période passe sur deux lignes plutôt que d'être tronquée. Balayé à 360, 375 et 390 sur dix libellés longs.
- **Supprimés** : `WeekView.tsx`, `DayView.tsx`, `EventDetailSheet.tsx`, `MonthView.tsx` et son test responsive (remplacés par `SemaineDeLAgenda`, `JourDeLAgenda`, `FicheDEvenement`, `MoisDeLAgenda`, utilisés par la seule page). L'en-tête, « Planifier une visite » et l'abonnement quittent `page.tsx` pour l'agenda lui-même.
