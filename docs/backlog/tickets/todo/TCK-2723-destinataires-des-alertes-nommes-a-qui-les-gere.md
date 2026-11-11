---
id: TCK-2723
title: "Les noms des destinataires d'une alerte ne se lisent que par qui gère les alertes ; les autres en lisent le nombre"
status: todo
phase: P2
family: back
estimate: S
wave: 87
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2627]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#65-thresholdalert-"
tags: [back, alertes, indicateurs, confidentialite, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'admin qui règle une alerte voit qui elle préviendra ; l'agent qui consulte la liste des alertes voit combien de
personnes elle prévient, sans la liste nominative des admins.

## Contexte

Suivi de TCK-2627. `GET /api/threshold-alerts` et `GET /api/threshold-alerts/{id}` (`ThresholdAlertController`, lecture
ouverte au **personnel** de l'agence, `AgencyIndicatorPolicy::view`) rendent `recipients {count, users [{id, name}]}`
calculés par `ThresholdAlertReading::forAlerts()` — **à tout le personnel, agents compris**. Le ticket d'origine disait
« l'admin ». L'écriture (`store`, `update`, `destroy`) est réservée à `AgencyIndicatorPolicy::create/update/delete`
(`managesIndicatorsOf`). Aucun écran du front ne lit encore `recipients.users` (relevé `grep` du 2026-11-11 : seul
`components/admin/super/alerts.tsx` lit un `recipients`, celui des règles d'alerte de la plateforme, autre objet).

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tout »).**

- **a) (recommandé)** `recipients.users` au seul lecteur qui peut **modifier** l'alerte (la règle de l'écriture) ;
  `recipients.count` à tous ses lecteurs.
- b) statu quo : les noms au personnel entier.

## Contrat de données

- `recipients` : `{count, users}` pour qui passe `AgencyIndicatorPolicy::update` sur l'alerte (et le super-admin) ;
  `{count, users: []}` pour les autres lecteurs — la clé reste (même forme), la liste est vide.
- Mêmes réponses pour `index`, `show`, `store` et `update` (toutes passent par `withReading`).

## Contraintes strictes (métier)

- Le jugement est fait **par alerte et par lecteur** (une page peut mêler des agences pour le super-admin), sans requête
  par ligne (un jugement par agence de la page).
- `count` ne change pas de valeur selon le lecteur.

## Delta à produire

- [ ] `ThresholdAlertReading::forAlerts()` : `users` vidé quand `$reader` ne passe pas `update` sur l'agence de
      l'alerte.
- [ ] Tests : `ThresholdAlertRecipientsVisibilityTest`.

## Critères d'acceptation

- [ ] AC1 — Agence à deux admins actifs (Awa, Moussa) : un agent du personnel lit une alerte avec `recipients = {count:
      2, users: []}` ; l'admin Awa la lit avec `users` = les deux noms.
- [ ] AC2 — Le jugement est exactement `AgencyIndicatorPolicy::update` : un membre du personnel qui la passe sans être
      admin (rôle personnalisé) lit les noms ; un membre qui ne la passe pas, quel que soit son profil, lit `users: []`.
- [ ] AC3 — La page de 20 alertes coûte le même nombre de requêtes pour l'agent et pour l'admin.

## Hors périmètre

- Une cloche déjà reçue avant le retrait de `reports.view_agency` reste lisible avec sa valeur (suivi mineur de
  TCK-2627, non traité).
- Les destinataires des règles d'alerte de la plateforme (super-admin).

## Notes d'implémentation

_(à remplir par implementing-specs)_
