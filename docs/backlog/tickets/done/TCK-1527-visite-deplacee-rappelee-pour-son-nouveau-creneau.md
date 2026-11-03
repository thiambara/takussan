---
id: TCK-1527
title: "Une visite déplacée reçoit les deux rappels de son nouveau créneau"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-visite-reportée-garde-ses-marques-de-rappel--le-nouveau-créneau-ne-reçoit-ni-le-rappel-de-la-veille-ni-celui-de-lheure"
tags: [api, visits, reminders, scheduler, pistes]
---

## Contexte

Réf : **P169.01** du fichier de pistes, `retenu · autonome` (A1).

`SendPropertyVisitReminders` pose `metadata.reminder_24h_sent_at` et `metadata.reminder_1h_sent_at`
sur la visite et saute toute visite qui porte la marque de la fenêtre, quelle que soit l'heure
rappelée. Ni le report du visiteur (`VisitSchedulingService::rescheduleOrFail`) ni le déplacement
par l'agence (`PropertyVisitController::update`) ne touchaient ces marques : une visite reportée
après ses rappels n'était plus jamais rappelée.

## Objectif utilisateur

`docs/features.md` (§ 1.3) : « Rappels automatiques avant visite […] 24 h et 1 h avant ». Une
visite déplacée est rappelée 24 h et 1 h avant son **nouveau** créneau.

## Delta à produire

- [x] `PropertyVisit::REMINDER_MARKERS` et un crochet `updating` : quand `scheduled_at` change, les
  deux marques sont retirées de `metadata`. Un seul point pour tous les gestes qui déplacent l'heure
  (option « en un seul point sur le modèle » de la Piste).
- [x] `SendPropertyVisitReminders` lit ses clés dans cette constante.
- [x] `tests/Feature/Visits/RappelsDeVisiteApresReportTest.php`.

## Critères d'acceptation

- [x] AC1 — rappels partis, report par le visiteur (`POST …/reschedule`), confirmation : les deux
  rappels du nouveau créneau partent.
- [x] AC2 — rappels partis, déplacement par l'agence (`PATCH`) : les deux rappels du nouveau créneau
  partent.
- [x] AC3 — une modification sans changement d'heure garde les marques : aucun rappel en double.

## Hors périmètre

- La marque est par visite, pas par destinataire : un agent réaffecté après le rappel de la veille
  n'en reçoit aucun. Noté « à vérifier » par l'explorateur, non mesuré ; non traité ici.

## Notes d'implémentation

- Hypothèse : le retrait ne touche que les deux marques ; les autres clés de `metadata` restent, et
  une visite sans marque n'est pas réécrite (`metadata` nul reste nul).
- Avant correctif : AC1 et AC2 rouges (« 2 is identical to 3 » : aucun rappel de la veille du
  nouveau créneau). Ablation (garde `isDirty('scheduled_at')` remplacée par un retour immédiat) :
  les deux mêmes rouges ; correctif remis → 3/3.
