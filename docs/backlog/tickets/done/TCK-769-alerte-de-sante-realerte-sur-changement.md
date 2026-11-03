---
id: TCK-769
title: "L'alerte de santé ré-alerte quand les sondes en échec ou leur niveau changent, et les nomme"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-14--observabilité--ce-quon-ne-verrait-pas-en-production"
tags: [back, alertes, observabilite, pistes]
---

## Contexte

Réf : **P14.05** du fichier de pistes, `validé` (critère accordé : V7). `ops_health_degraded`
reposait sur un booléen (`status !== 'ok'`) : un passage de `degraded` à `failed` ne déclenchait
rien, et en préproduction la sonde `mail` (`MAIL_MAILER=log`) tient la santé à `degraded` en
permanence. Le message d'alerte ne portait que l'événement, l'acteur et l'objet.

## Décision du porteur

ré-alerter quand l'ensemble des sondes en échec ou leur niveau change ; properties.failing dans le message

## Delta à produire

- [x] `EvaluateOperationalAlerts::transition()` accepte une signature de l'état actif ; la santé
      passe le statut global et la liste triée `sonde → niveau`. Les deux autres alertes gardent
      le passage de « non » à « oui ».
- [x] `AlertRuleService` ajoute au message « — sondes en échec : mail (degraded), … » quand
      l'activité porte `properties.failing`. Clé `notifications.admin_alert.failing_suffix` en
      fr et en ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16).

## Critères d'acceptation

- [x] AC1 — `degraded` puis `failed` : deux alertes.
- [x] AC2 — une sonde de plus en échec : deux alertes.
- [x] AC3 — même ensemble au même niveau, dans un autre ordre : une seule alerte.
- [x] AC4 — le message envoyé nomme chaque sonde en échec et son niveau.

## Hypothèses (mode sans humain)

- Le statut global fait partie de la signature, avec les sondes : c'est le « niveau » de la
  décision.
- Au premier passage après le déploiement, l'état mémorisé est encore le booléen d'avant : une
  santé déjà dégradée alerte une fois de plus. Coût jugé acceptable (une alerte).

## Notes d'implémentation

- Ablation : signature retirée → AC1 et AC2 rouges ; suffixe retiré → AC4 rouge ; remis → 5 verts.
