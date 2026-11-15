---
id: TCK-2888
title: "Agenda : « dans 45 min » sur la carte du jour, « · 1ʳᵉ visite » sur l'événement, le client et le quartier sur l'occupation, le lien iCal, « Copier » et « Ajouter à Google Agenda / Apple Calendrier » à la réouverture"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_
