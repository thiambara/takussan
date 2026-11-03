---
id: TCK-739
title: "Relances de facture et de loyer : un jalon manqué se rattrape pendant 3 jours"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-5--jobs-planifiés-et-files"
tags: [back, scheduler, notifications, pistes]
---

## Contexte

Réf : **P05.02** du fichier de pistes, `validé` par le porteur (critères accordés : V7 et V8).

Le scheduler ne rattrape pas une exécution manquée. `OverdueReminderService` ne relance une
facture que le jour exact `due_date + offset`, et `SendLeasePaymentReminders` une échéance que le
jour exact `due_date − 3`, `+ 1` ou `+ 7` : un arrêt à 08:00 ou 09:00 perd la relance pour
toujours. TCK-092 avait écrit ce non-rattrapage comme un choix de V1 ; le porteur le lève ici.

## Décision du porteur

rattrapage sur 3 jours au plus, un envoi par jalon, relances de facture et de loyer seulement

## Objectif utilisateur

Une relance de facture ou de loyer que le job n'a pas pu envoyer le jour prévu part au passage
suivant, jusqu'à 3 jours après, et une seule fois.

## Contraintes strictes (métier)

- **Hypothèse** : « 3 jours au plus » se lit comme un retard de 0 à 3 jours sur le jour prévu du
  jalon. Au-delà, le jalon est perdu, comme avant.
- **Un envoi par jalon** :
  - facture : le jalon le plus tardif dont la fenêtre contient aujourd'hui, et seulement si aucune
    relance n'est partie depuis son jour prévu (`last_reminder_sent_at`), en plus des gardes
    existantes (`reminders_sent_count`, une relance par jour) ;
  - loyer : le marqueur `reminder_<jalon>_sent_at` existant.
- Le nombre de jours de retard annoncé reste celui du jour d'envoi.
- Ni le résumé de notifications, ni le rappel de visite, ni le relevé de gérance.

## Delta à produire

- [x] `OverdueReminderService` : sélection par fenêtre, choix du jalon, garde par jalon.
- [x] `SendLeasePaymentReminders` : sélection par fenêtre pour J-3, J+1 et J+7.
- [x] Tests : un jalon manqué part le lendemain et une seule fois ; au-delà de 3 jours, rien.

## Critères d'acceptation

- [x] AC1 — Une facture dont le jalon J+3 tombait hier reçoit sa relance aujourd'hui, une fois.
- [x] AC2 — Une facture dont le jalon tombait il y a 4 jours ne reçoit rien.
- [x] AC3 — Une échéance de loyer dont le jalon J+1 tombait hier reçoit sa relance aujourd'hui,
      une fois, avec les jours de retard du jour d'envoi.
- [x] AC4 — Une échéance dont le jalon tombait il y a 4 jours ne reçoit rien.

## Hors périmètre

- `SendNotificationDigestJob`, `SendPropertyVisitReminders`, l'avis du relevé de gérance (non
  confiés par la décision).

## Notes d'implémentation
- **Ablation** : correctif retiré → 4 rouges (les deux rattrapages de facture, J+1 et J-3 de
  loyer) ; garde par jalon seule neutralisée → 1 rouge
  (`test_tck739_un_jalon_rattrape_ne_repart_pas_le_lendemain`) ; correctif remis → 39 verts sur
  les 4 classes qui lisent ces deux fichiers.
- **Piège** : `reminders_sent_count` est un compteur, pas un marqueur par jalon. Jalon J+3 perdu,
  J+7 rattrapé à J+8 : le compteur vaut 1, sous le rang 2 de J+7, et J+7 repartait à J+9. D'où la
  garde sur `last_reminder_sent_at` ≥ jour prévu du jalon.
- `test_does_not_send_at_unlisted_offset` visait J+4, devenu un rattrapage de J+3 : il vise
  désormais J+11.
