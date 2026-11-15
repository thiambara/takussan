---
id: TCK-2882
title: "Visites, côté personnel : la bascule « Liste · Semaine » et le filtre « Type » au bureau, la vignette de carte au-dessus de l'adresse au téléphone, « Absent » qui prévient le visiteur et propose de replanifier"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2871]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
tags: [front, visits, agenda, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent voit ses visites en liste ou sur sa semaine, filtre par type de visite, repère le lieu sur une petite carte avant de partir, et sait qu'un « Absent » prévient le visiteur avec une proposition de replanifier.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-visites e0 à e3). Relevé :

- « Liste · Semaine » : la fiche de TCK-2587 l'a renvoyé à TCK-2597, qui n'a livré la semaine que dans l'Agenda ; aucune vue Semaine dans `components/visits/par-le-temps/` ;
- filtre « Type » : absent du produit et de la fiche (seuls Agent, Bien, Période, `VisitesParLeTemps.tsx:575-638`) ;
- vignette de carte (téléphone e1, e2, e3) : classée « technique » ; aucune tuile de carte dans le produit ;
- « Absent » enregistre seulement l'absence ; la maquette dit qu'il prévient et propose de replanifier — l'API le fait par TCK-2871 ;
- le filtre « Statut · Demandées » du mode « Par le temps » avait été écarté (« justifié ») : il est dessiné, il entre ici.

## Contrat de données

- `GET /api/property-visits` avec `filter[type]` et `filter[status]` (déjà dans `PropertyVisit::$requestFilterable`), période.
- Coordonnées du bien : `address.latitude`, `address.longitude` (`PropertyVisitResource::adresse`, personnel).
- `POST /api/property-visits/{visit}/no-show` (notification `visit.no_show`, TCK-2871).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-visites`, approche **a** — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-visites-a.tsx` (bureau, `BureauListe`, l. 217-284) et `app-visites-a-mobile.tsx` (téléphone ; `CarteFictive` de `app-visites-pieces.tsx` ; l. 503 et 603 pour « Absent ») ; écrans **e0 Liste**, **e1 Détail — à confirmer**, **e2 Détail — jour J**, **e3 Détail — après l'heure**.

- **Téléphone (390)** — manque : e1, e2, e3, la vignette de carte au-dessus de l'adresse (toucher → itinéraire) ; e3, la phrase « « Absent » prévient {prénom} et propose de replanifier. » à la place de « … enregistre que {prénom} n'est pas venu ».
- **Bureau (1440)** — manque : e0, le segmenté « Liste · Semaine » (mode « Par le temps ») ; le filtre « Statut » (mode « Par le temps », défaut « Demandées ») et le filtre « Type » (mode « Par statut », défaut « Tous » ; En personne, Virtuelle, En autonomie, Hybride) ; e3, la même phrase pour « Absent ».
- **Semaine** : la vue semaine de l'Agenda (`SemaineDeLAgenda`, TCK-2597) réduite aux visites, mêmes filtres que la liste ; pas d'écran dessiné au-delà du segmenté (écart « hors maquette » motivé dans la fiche).
- **Vignette** : tuile statique (image de carte, sans bibliothèque de carte interactive) centrée sur le bien ; aucune vignette si les coordonnées manquent. Fournisseur de tuiles : celui que le site public utilise déjà pour la carte d'un bien s'il en a un, sinon OpenStreetMap avec attribution — à trancher par l'implémenteur, sans clé payante.

## Contraintes strictes (métier)

- La vignette n'est rendue qu'au personnel qui lit l'adresse (règle de `adresseLisible`, inchangée).
- La vue Semaine ne charge que la semaine affichée (une requête), sparse fieldsets.
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Segmenté Liste · Semaine et vue Semaine des visites (bureau).
- [ ] Filtres Statut (Par le temps) et Type (Par statut).
- [ ] Vignette de carte (téléphone, e1-e3).
- [ ] Texte d'« Absent » et retour de la notification.
- [ ] Tests de composant : bascule Semaine conserve les filtres ; filtre Type → `filter[type]` ; vignette absente sans coordonnées ; texte d'Absent.

## Critères d'acceptation

- [ ] AC1 — À 1440, « Semaine » montre les visites de la semaine en colonnes de jours, aux mêmes filtres que la liste ; « Liste » y revient.
- [ ] AC2 — À 1440, en mode « Par statut », le filtre « Type = Virtuelle » ne garde que les visites virtuelles (requête `filter[type]=virtual`).
- [ ] AC3 — À 390, le détail d'une visite confirmée d'un bien géolocalisé montre la vignette de carte au-dessus de l'adresse ; un bien sans coordonnées n'en montre pas.
- [ ] AC4 — À 390, « Absent » sur une visite passée dit « prévient Abdoulaye et propose de replanifier » et la notification `visit.no_show` part (TCK-2871).
- [ ] AC5 — Vérifier au navigateur, une journée avec deux visites confirmées et une visite passée sans compte rendu : la carte « prochaine visite », « Libre de … à … » et « À clore » s'affichent comme la maquette e0 (téléphone) ; corriger si non.
- [ ] AC6 — Vérifier au navigateur la barre « En cours » / « Heure passée » d'une visite commencée (`?fid=encours`) et d'une visite dont la fin est dépassée (e3, les deux formats) ; corriger si non.
- [ ] AC7 — À 1440, le bouton « Confirmer à HH:MM » d'une visite à confirmer porte son chevron, qui ouvre les autres heures libres du jour (même liste que « Proposer une autre heure ») ; l'écart « sans chevron » de TCK-2587 est retiré.
- [ ] AC8 — À 1440, la barre « En cours » d'une visite commencée garde la bulle « Je suis en route » (message WhatsApp prérempli, maquette e3) ; l'écart « vérité des données » de TCK-2587 est retiré.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2882.json` : écrans e0 à e3 de `app-visites` (a), téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- Le compte rendu (TCK-2880 ; `app-visites` e4 abandonné) ; le côté client (TCK-2883).

## Notes d'implémentation

_(à remplir par implementing-specs)_
