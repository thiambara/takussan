---
id: TCK-2888
title: "Agenda : « dans 45 min » sur la carte du jour, « · 1ʳᵉ visite » sur l'événement, le client et le quartier sur l'occupation, le lien iCal, « Copier » et « Ajouter à Google Agenda / Apple Calendrier » à la réouverture"
status: done
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: [TCK-2886, TCK-2887]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#72-calendarfeed-"
tags: [front, calendar, agenda, ical, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

L'agent voit combien de temps il lui reste avant son prochain rendez-vous, sait si une visite est une première, lit qui séjourne où sur l'occupation, et retrouve son lien d'abonnement quand il en a besoin.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-agenda e0, e2, e3, e4, e5). Les données arrivent par TCK-2886 (client, quartier, rang) et TCK-2887 (lien relisible, sous ADR).

## Contrat de données

- `GET /api/calendar` : `customer_name`, `neighborhood` (séjours), `visit_rank` (visites) — TCK-2886.
- `GET /api/me/calendar-feed` : `url` — TCK-2887.

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-agenda`, approche **a** — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-agenda-a.tsx` et `app-agenda-pieces.tsx` ; écrans **e0 Mon agenda — jour**, **e2 Occupation des biens**, **e3 Mois (admin)**, **e4 Événement**, **e5 Abonnement iCal** ; téléphone et bureau.

- **Les deux formats** — manque : e0, « dans 45 min » dans la tête de la prochaine carte du jour ; e4, « · 1ʳᵉ visite » après le visiteur ; e2 et e3, le nom du client sur la barre d'un séjour (à la place de « N nuits · référence ») et le quartier sous le titre du bien (colonne des biens) ; e5 rouverte, le lien, « Copier » et « Ajouter à Google Agenda » / « Apple Calendrier ».
- Un flux sans lien relisible (créé avant TCK-2887) garde l'écran actuel avec « Générer un nouveau lien ».

## Contraintes strictes (métier)

- « dans N min » seulement pour un événement du jour à venir dans les 2 h ; au-delà, l'heure seule.
- Les liens Google / Apple reprennent le schéma de l'écran de création (abonnement `webcal://` et ajout par URL Google).
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Tête de la carte du jour : « dans N min ».
- [ ] Fiche d'événement : rang de visite.
- [ ] Occupation et mois : nom du client, quartier.
- [ ] Abonnement rouvert : lien, Copier, Google, Apple.
- [ ] Tests de composant : « dans 45 min » à H−45, absent à H−3 h ; « 1ʳᵉ visite » pour `visit_rank = 1` seulement ; écran iCal avec et sans `url`.

## Critères d'acceptation

- [ ] AC1 — À 390, une visite dans 45 min porte « dans 45 min » dans la tête de sa carte.
- [ ] AC2 — La fiche d'une première visite dit « {visiteur} · 1ʳᵉ visite » ; une deuxième ne le dit pas.
- [ ] AC3 — À 1440, la barre du séjour d'Awa Diop porte « Awa Diop » ; la colonne des biens montre le quartier sous chaque titre.
- [ ] AC4 — Rouvrir « S'abonner à mon agenda » montre le lien, « Copier » (copie le lien), « Ajouter à Google Agenda » et « Apple Calendrier ».
- [ ] AC5 — Vérifier au navigateur, avec une agence qui a des séjours confirmés et en attente, une fin de bail et une intervention : barres continues, hachure des séjours en attente, « +N séjours », échéances et le compte « N séjours en cours » du lien Occupation (e0, e2, e3) ; corriger si absents.
- [ ] AC6 — Vérifier au navigateur, bureau, la ligne « maintenant » et « + Planifier » au survol d'un créneau de la semaine (e0) ; corriger si absents.
- [ ] AC7 — À 390, la pastille « 14 j » de l'Occupation porte son chevron et ouvre le choix de la période (14 j, 30 j) ; l'écart « sans chevron (décision) » de TCK-2597 est retiré.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2888.json` : écrans e0, e2, e3, e4, e5 de `app-agenda` (a), téléphone et bureau, avec séjours.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- Les filtres et la légende (e1, conformes).

## Notes d'implémentation

2026-11-15 — agent d'implémentation (vague 92).

**Prémisse re-mesurée** : conforme. `CalendarEvent` portait déjà `customer_name`, `visit_rank`, `neighborhood`
(TCK-2886) et `CalendarFeedState.url` (TCK-2887). La barre de l'occupation disait « {n} nuits · {référence} »,
celle du mois « Séjour · {bien} » ; la colonne des biens lisait `fields[properties]=id,title` sans adresse ;
« 14 j » était un libellé figé (écart « décision produit » de TCK-2597) ; la feuille iCal ne montrait le lien
qu'à sa génération. Écart au ticket : l'agenda n'est pas sous `app/(dashboard)/app/agenda` mais
`components/calendar/CalendarPage.tsx` + `components/agenda/`.

**Livré** :
- « dans N min » : `reboursDuProchain` (`lib/agenda/agenda.ts`) — le prochain événement À HEURE du jour
  (visite, tâche, intervention ; jamais un séjour ni une journée entière), seulement si le jour affiché est
  aujourd'hui à Dakar et à ≤ 120 min ; le compte est `compteARebours` de « Ma journée » (TCK-2856).
  Téléphone : à droite du type, dans la tête de la carte (`JourDeLAgenda`, jour et mois) ; bureau : dans la
  tête de la carte du jour (`SemaineDeLAgenda`), comme l'`action` de la maquette. Au-delà de 60 min :
  « dans 1 h 20 ». Libellés `agenda.jour.dansMinutes` / `dansHeures` (même formulation que
  `journee.chronologie` : l'agenda ne déclare pas l'espace `journee`, garde `check-i18n-namespaces` verte).
- Fiche : « {visiteur} · 1ʳᵉ visite » pour `visit_rank === 1` seulement (pas de « 2e visite » : hors ticket).
- Occupation : barre « {client} » / « {client} · en attente » quand `customer_name` est servi, sinon l'ancien
  libellé (bailleur) ; quartier sous le titre au bureau (« Ngor · Libre jusqu'au 12 »), après le titre au
  téléphone (« Studio meublé · Mermoz »). Source : `include=address` sur les trois lectures de biens de
  l'agenda (`location.quarter`, précédent `useBiensEnLigne`), repli sur le `neighborhood` d'un événement.
  Mois : « Séjour · {bien} · {client} ».
- iCal : lien = celui de la génération, sinon `url` relu ; Copier, Google, Apple à la réouverture ; sans lien
  relisible (`null` ou absent) : l'écran d'avant avec « Générer un nouveau lien ». À la révocation, l'état en
  cache passe à `{ active: false }` (sinon le lien relu restait affiché jusqu'à la relecture). Texte « Copiez-le
  maintenant : il ne sera plus affiché » devenu faux : clé `onceOnly` supprimée, `secret` à la place ; docblocks corrigés.
- AC7 : `MenuDeDuree` (« 14 j ▾ » → 14 j / 30 j), `?duree=30` dans l'URL (effacé au changement de mode) ;
  fenêtre, pas et plage suivent ; colonnes dynamiques au téléphone, à 30 j un numéro de jour sur trois (et
  aujourd'hui) — 11 px par case.
- Fidélité : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2888.json` (non relevée, consigne du porteur) ;
  dans `TCK-2597.json`, retrait des écarts « nom du client », « quartier », « lien iCal dès l'ouverture »,
  « 14 j sans chevron » et de l'alias « Séjour · Villa Almadies ».

**AC5, AC6, AC-F2 — non mesurés au navigateur** (consigne du porteur) : relus au code et aux tests — barres
continues et « +N séjours » (`MoisDeLAgenda`, `CalendarPage.test.tsx`), hachure de l'attente, losanges et
points, compte du lien Occupation (`LienOccupation`), ligne « maintenant » (`data-slot="maintenant"`) et
« + Planifier une visite » au survol d'un créneau (`Creneau`, `group-hover`) : présents, rien à corriger.

**Mesures** : `CalendarPage.tck-2888.test.tsx` (9), `rebours.tck-2888.test.ts` (5),
`CalendarSubscription.tck-2888.test.tsx` (4) et les 8 fichiers voisins (agenda, calendrier, iCal) : 63 verts.
Ablations une à une, restaurées par `cp`, md5 vérifié : horizon de 2 h retiré → « trois heures » rouge ;
rebours non rendu (téléphone / bureau) → AC1 rouge ; rang ignoré → AC2 rouge ; client retiré de la barre →
« Awa Diop » rouge ; quartier de l'adresse retiré → 2 tests rouges ; lien relu ignoré → AC4 rouge ; cache non
vidé à la révocation → « révoqué » rouge ; fenêtre figée à 14 j → AC7 rouge ; client retiré du mois → rouge.
eslint, `tsc --noEmit`, `check:i18n`, toutes les gardes `scripts/check-*.mjs` (racine et web) vertes.
