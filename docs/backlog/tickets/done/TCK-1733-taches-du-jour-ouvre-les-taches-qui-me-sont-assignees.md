---
id: TCK-1733
title: "« Tâches du jour » ouvre les tâches du jour qui me sont assignées dans l'agence active, et non celles que j'ai créées pour d'autres"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-167--tuiles-et-lignes-cliquables-des-tableaux-de-bord--ce-que-le-lien-ouvre-face-à-ce-que-le-nombre-compte"
tags: [api, front, dashboard, tasks, pistes]
---

## Contexte

Réf : **P167.04** du fichier de pistes.

La tuile « Tâches du jour » de l'aperçu de l'agent compte les tâches **assignées** à l'agent,
`open` ou `in_progress`, échues aujourd'hui, dont le parent est dans l'agence active
(`DashboardAgentService`). Son lien, `/app/tasks?filter[due]=today`, ouvrait la liste « Mes
tâches », dont le périmètre comprend aussi les tâches que l'agent a **créées** pour d'autres, et
celles de ses autres agences.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

La recommandation du délégué s'applique : « faire porter au lien la portée du compte par un
filtre d'API neuf `filter[assigned_to]=me` restreint à l'agence active, en gardant les closes du
jour dans la liste comme TCK-591 l'a écrit, plutôt que d'élargir le compte aux tâches créées pour
d'autres ».

Choix de l'implémenteur, là où la recommandation ne dit rien : la portée ne s'affiche pas dans la
liste (aucun libellé neuf) ; elle reste dans l'URL et s'y garde quand l'échéance change, et la
page « Mes tâches » sans paramètre rend la liste d'avant.

## Delta à produire

- [x] API : `Task::scopeParentInAgency(?int)`, la borne d'agence des tâches du tableau de bord de
      l'agent (parent client, bien ou réservation, supprimés en douceur compris), lue désormais par
      `DashboardAgentService` et par le filtre neuf.
- [x] API : `filter[assigned_to]=me` sur `GET /api/tasks` — assignées à l'appelant, parent dans son
      agence active (`staffAgencyId()`) ; toute autre valeur ne rend rien.
- [x] Front : le lien de la tuile porte `&filter[assigned_to]=me` ; la page `/app/tasks` le lit et
      le passe à `MyTasks`, qui l'envoie à l'API et le garde dans l'URL.

## Critères d'acceptation

- [x] AC1 — une tâche assignée, une close, une créée pour un collègue et une d'une autre agence,
      toutes du jour : la tuile dit 1, la liste du lien rend l'assignée et la close, et ses lignes
      ouvertes sont autant que la tuile.
- [x] AC2 — `filter[assigned_to]` à une autre valeur, ou en liste : aucune ligne.
- [x] AC3 — le lien de la tuile porte `filter[due]=today&filter[assigned_to]=me` ; la page lit la
      portée ; la liste l'envoie et la garde en changeant d'échéance.

## Hors périmètre

- Les tâches de remboursement, dont le parent est une réservation : la tuile les compte, mais la
  liste « Mes tâches » ne les montre à aucun agent (sa borne de base, `parentAgencyIn`, ne connaît
  que les clients et les biens). Écart antérieur, non touché ici.

## Notes d'implémentation

- Avant le correctif : `TachesDuJourLienTest` rendait 400 (filtre inconnu) ; côté front, 7 rouges
  (lien nu, portée ni lue ni envoyée).
- Ablation : filtre retiré de `Task::customQueryFilters()` → les 2 tests API rouges ; les quatre
  fichiers sources du front rendus à `pre-dev` → les 7 mêmes rouges ; remis → verts.
- Le test API fixe le profil actif par `X-Profile-Id` : un agent de deux agences n'a pas d'agence
  active sans lui, et le tableau de bord rend 403.
