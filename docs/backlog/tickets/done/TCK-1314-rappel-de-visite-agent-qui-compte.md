---
id: TCK-1314
title: "Rappel de visite : l'agent qui ne compte plus est écarté, les admins actifs le remplacent"
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
    - "docs/features.md#23-notifications"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-126--destinataires-déquipe-choisis-sans-juger-le-profil-actif"
tags: [api, visites, notifications, profils, pistes]
---

## Contexte

Réf : **P126.02** du fichier de pistes, `validé`.

`SendPropertyVisitReminders` ajoute l'agent de la visite aux destinataires du rappel dès qu'il
existe, sans le jugement que `VisitNotifier::agencyRecipients` applique au même agent pour les
autres avis de la visite (M2) : un agent suspendu de l'agence du bien reçoit le rappel, et aucun
admin n'est prévenu à sa place.

## Décision du porteur

« validé — porteur (2026-10-22) : écarter l'agent qui n'est plus utilisable par le prédicat d'`agencyRecipients`, et ne rappeler les admins actifs que si un agent était assigné et ne compte plus ; la visite non attribuée garde son comportement »

Critère accordé : V7.

## Objectif

Le rappel de visite juge l'agent comme `agencyRecipients`, et ne se replie sur les admins actifs
de l'agence que pour un agent assigné qui ne compte plus.

## Delta à produire

- [x] `VisitNotifier::agentUtilisable(PropertyVisit)` : le prédicat d'`agencyRecipients`, sorti
      en méthode publique (`agencyRecipients` l'appelle).
- [x] `SendPropertyVisitReminders` : part « agence » du rappel = l'agent s'il est utilisable ;
      s'il est assigné et ne l'est pas, les admins actifs de l'agence du bien ; sans agent, rien.
- [x] Tests dans `PropertyVisitWorkflowTest`.

## Critères d'acceptation

- [x] AC1 — Agent au profil `suspended` dans l'agence du bien → aucun rappel à l'agent, un rappel
      à l'admin actif ; le visiteur reçoit le sien.
- [x] AC2 — Agent actif → rappel à l'agent, rien à l'admin.
- [x] AC3 — Visite non attribuée → rien à l'admin (comportement inchangé).

## Hors périmètre

- Le repli entier d'`agencyRecipients` (personnel `crm.view_all`, contact principal) : la décision
  borne le repli aux admins actifs.
- Les autres pistes de l'angle 126.

## Notes d'implémentation

- Hypothèse : « admins actifs » se lit par `ContactLeadService::agencyAdmins` (profil
  `active` et compte joignable), la liste d'admins que P126.05 rend unique. Les délégués du rôle
  `agency_admin` n'y sont pas, comme dans cette liste aujourd'hui.
- Bien sans agence et agent injoignable : aucune agence où chercher des admins, rien n'est envoyé
  côté agence.
- Ablation : `SendPropertyVisitReminders.php` remis à `HEAD` → 1 rouge (AC1) sur 17 ; correctif
  remis → 17/17 verts.
