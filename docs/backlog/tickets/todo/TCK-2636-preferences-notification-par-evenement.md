---
id: TCK-2636
title: "Préférences de notification : une rangée par événement au téléphone (WhatsApp enfin réglable), les six événements oubliés, des en-têtes en français"
status: todo
phase: P1
family: front
estimate: S
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
tags: [front, notifications, preferences, mobile, whatsapp, audit-ux, app]
---

## Objectif utilisateur

Au téléphone, on règle « Loyer en retard » sur WhatsApp, le canal par défaut au Sénégal, sans qu'une colonne sorte de l'écran. Chaque notification que l'application envoie a son interrupteur.

## Contrat de données

Aucun endpoint neuf. Lecture et écriture existantes :

- `GET` et `PATCH /api/me/notification-preferences` ;
- la liste des canaux (`channels`, dont `whatsapp`) ;
- l'état de chaque case (`locked` et sa raison, par exemple `phone_without_whatsapp` ou KYC critique).

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- **WhatsApp hors d'atteinte à 390** : la carte de chaque groupe est en `overflow-hidden` (`NotificationPreferencesMatrix.tsx:290`), comme le cadre du tableau. L'en-tête « WhatsApp » commence à x = 373 et la carte s'arrête à 374 (mesure de l'audit, `admin-wa-m.json`). Rien ne défile.
- **Six événements de l'API sans interrupteur** : `PreferenceResolver::EVENTS` en compte 20, la liste du front 14, malgré son commentaire « Must mirror `PreferenceResolver::EVENTS` ». Manquent :
  - `lease_renewed` ;
  - `lease_early_termination` ;
  - `lease_rent_reviewed` ;
  - `invoice_reminder_sent` ;
  - `task_due_reminder` ;
  - `tenant_inventory_reminder`.

  Ces six événements partent avec les réglages par défaut, sans que l'utilisateur puisse les couper.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-profil&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écran « Préférences de notifications ».
- **Décision 7 (a) du porteur — téléphone (360–390)** :
  - une rangée par événement (« Loyer en retard »), groupée sous son titre (« Baux », « Messages »…) ;
  - sous le libellé, des **puces de canaux** cochables (« Appli · E-mail · SMS · WhatsApp ») qui passent à la ligne si besoin ;
  - une puce verrouillée est grisée, avec sa raison en sous-ligne (« Ajoutez un numéro WhatsApp », « Obligatoire pour la vérification de votre agence ») ;
  - le canal « Notification mobile » est dessiné verrouillé (« pas encore disponible ») et non absent, tant qu'il n'a pas de transport.
- **Bureau (≥ 1280)** : la matrice reste (elle a la place), avec des en-têtes en français : « Appli », « E-mail », « Notif. mobile », « SMS », « WhatsApp ». Entre `md` et `lg`, les rangées du téléphone.
- « Enregistré » s'annonce à chaque changement, comme aujourd'hui.

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- l'enregistrement à chaque case, avec « Enregistré » annoncé (`aria-live`) ;
- les cases verrouillées qui disent pourquoi ;
- WhatsApp actif par défaut pour échéance, retard, rappel de visite et statut de réservation (TCK-588) ;
- les groupes (Messages, Réservations, Baux, Maintenance, Avis, Alertes, Biens) ;
- le repli du libellé sur la valeur brute pour un canal inconnu (relevé du 2026-09-16) ;
- le fil d'Ariane « Profil / Notifications » au bureau, et la flèche unique au téléphone (TCK-2617).

**Autres règles :**

- **Les six événements** prennent place dans leur groupe :
  - « Baux » : renouvellement, résiliation anticipée, révision du loyer, relance de facture, rappel d'état des lieux d'entrée ;
  - « Alertes » : rappel de tâche.

  Les libellés sont en `fr`/`en`/`wo` (`wo` = le français tel quel).
- **Un événement que le persona ne reçoit jamais** (un client et `task_due_reminder`) peut rester affiché. Le masquer demande une règle de l'API qu'elle ne rend pas : hors périmètre.
- **Garde de parité** : la liste des événements du front ne peut plus diverger de `PreferenceResolver::EVENTS` sans qu'un test rougisse. Le test lit la constante PHP comme les gardes de recensement lisent leurs sources.
- Aucune colonne ni puce ne sort de l'écran à 360.

## Delta à produire

- [ ] Rangées par événement avec puces de canaux sous `lg`, matrice dès `lg`.
- [ ] Retrait du rognage qui cache WhatsApp ; en-têtes en français.
- [ ] Les six événements manquants, dans leur groupe, avec leurs libellés.
- [ ] Garde de parité front / API des événements.
- [ ] Tests :
  - à 390, chaque événement a ses puces, dont « WhatsApp », dans le cadre ;
  - cocher WhatsApp sur « Loyer en retard » envoie le `PATCH` attendu ;
  - une puce verrouillée n'envoie rien et montre sa raison ;
  - 20 événements rendus ;
  - la garde rougit si l'on retire un événement du front.

## Critères d'acceptation

- [ ] AC1 — À 390 × 844 (`innerWidth` relevé), la puce « WhatsApp » de « Loyer en retard » est entièrement dans le viewport, et `scrollWidth − innerWidth = 0` sur la page.
- [ ] AC2 — La toucher envoie `PATCH /api/me/notification-preferences` avec `lease_payment_overdue.whatsapp` inversé (réseau), et « Enregistré » est annoncé.
- [ ] AC3 — La page rend exactement 20 événements, autant que `PreferenceResolver::EVENTS`, dont « Rappel de tâche » et « Renouvellement du bail ».
- [ ] AC4 — À 1280, les en-têtes de la matrice sont « Appli, E-mail, Notif. mobile, SMS, WhatsApp » ; aucun « In-app » ni « Push ».
- [ ] AC5 — Ablation : retirer `task_due_reminder` de la liste du front fait rougir la garde de parité.

## Hors périmètre

- Le sommaire du profil (TCK-2635).
- Le masquage des événements selon le persona (règle à poser côté API d'abord).
- Le transport des notifications mobiles.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
