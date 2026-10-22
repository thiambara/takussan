---
id: TCK-1502
title: "L'agenda garde l'heure murale UTC, épinglée des deux côtés"
status: done
phase: P2
family: tech
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-94--réponses-composées-à-la-main-dans-les-contrôleurs--dates-hors-adr-0018"
tags: [back, front, calendar, dates, adr-0018, pistes]
---

## Contexte

Réf : **P94.02** du fichier de pistes, `validé` (critère accordé : V6).

`GET /api/calendar` émet `start`/`end` par `toDateTimeString()` (`2026-10-18 21:54:01`), et le
front les lit en heure locale du navigateur (`parseServerDate`). Aucun test n'épinglait ce
contrat : un passage « naïf » du collecteur à `iso()` décalerait toutes les heures de l'agenda
d'un navigateur hors UTC sans qu'aucun test rougisse.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

## Choix de l'implémenteur

La `Piste` offre deux voies sans en recommander une (la recommandation de la première voie est
celle du délégué, non de la piste). La plus étroite est retenue : **la seconde voie**, la forme
murale reste et devient le contrat écrit de l'agenda. Aucune heure affichée ne change, aucune
réponse de l'API ne change.

## Reste à faire

L'exception nommée dans le texte d'ADR-0018 (§ « Ce que ça NE couvre PAS ») : chemin fermé à
l'implémenteur (`docs/adr/`), au porteur. En attendant, l'exception est écrite dans le docblock de
`CalendarEventCollector` et de `parseServerDate`.

## Delta à produire

- [x] `tests/Feature/Calendar/CalendarWallClockFormTest.php` : visite et réservation, `start`/`end`
  exacts en `Y-m-d H:i:s`, et la forme vérifiée sur chaque événement rendu.
- [x] `src/lib/__tests__/calendar-date.heure-murale.test.ts` : navigateur forcé à `Europe/Paris`
  (précondition vérifiée), la forme murale lue à l'heure écrite, la forme à fuseau décalée.
- [x] Docblocks du collecteur et de `parseServerDate` : le contrat et ses deux tests.

## Critères d'acceptation

- [x] AC1 — le collecteur passé à `iso()` sur un seul champ fait rougir le test API.
- [x] AC2 — `parseServerDate` qui lirait la forme murale en UTC fait rougir le test front sous
  `Europe/Paris`.

## Hors périmètre

- La première voie (`iso()`/`calendarDate()` et formatage à Dakar), non retenue.
- `parseServerDate('2026-10-18')` (date seule, sans heure) est lue en UTC par `new Date`, à
  l'inverse de ce que disait son docblock ; le collecteur n'émet jamais cette forme.

## Notes d'implémentation

- Le contrat existait déjà : les deux tests sont verts avant correctif, c'est l'ablation qui les
  prouve. Ablation API : `start` de la visite passé à `->utc()->format(DATE_ATOM)` → 1 rouge
  (`'2026-10-18T21:54:01+00:00'` au lieu de `'2026-10-18 21:54:01'`). Ablation front :
  `parseServerDate` qui suffixe `Z` → 1 rouge sur 3 (21 h lue 23 h à Paris). Remis → verts.
