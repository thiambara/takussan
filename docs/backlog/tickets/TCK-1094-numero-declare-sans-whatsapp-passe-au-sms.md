---
id: TCK-1094
title: "Un numéro déclaré sans WhatsApp passe au SMS, et sa colonne WhatsApp se verrouille"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-72--accusés-failed-reçus-après-coup-sms-et-whatsapp"
tags: [back, front, notifications, whatsapp, pistes]
---

## Contexte

Réf : **P72.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7, la
déclaration de l'utilisateur décide du canal mobile qu'il reçoit).

L'utilisateur déclare si son numéro reçoit WhatsApp (`users.phone_whatsapp`, `models-spec.md`
§ 1), mais ni `PreferenceResolver` ni `WhatsappChannel` ne lisent la colonne : un utilisateur qui
a dit « non » reçoit ses relances d'impayé par WhatsApp, activé par défaut (TCK-588).

### Décision du porteur

> passer au SMS dans `resolveMobileChannel()` quand `phone_whatsapp === false` (`null` garde le défaut), et verrouiller la colonne WhatsApp de la matrice des préférences avec son motif affiché (règle de TCK-588) ; un test par valeur (porteur, 2026-10-20)

## Objectif

`phone_whatsapp === false` écarte WhatsApp du routage mobile et verrouille la case WhatsApp de
chaque événement, avec son motif ; `true` et `null` ne changent rien.

## Contrat de données

La matrice de `GET /api/me/notification-preferences` gagne une valeur de `reason` :
`phone_without_whatsapp` (case `whatsapp`, `locked: true`, `enabled: false`).

## Contraintes strictes

- `null` (« non dit ») garde la préférence ou le défaut actuel.
- Aucun texte wolof neuf : la clé `wo` porte le français tel quel (pause du wolof).
- **Hypothèse** : la règle vit dans `shouldSend(…, 'whatsapp')`, que `resolveMobileChannel()`
  appelle en premier. Une case verrouillée « éteinte » ne doit honorer aucun envoi : la placer
  dans `resolveMobileChannel()` seul laisserait partir par WhatsApp les envois qui lisent
  `shouldSend()` en direct (`WhatsappChannel::isOptedIn()`, `SavedSearchMatchesNotification`).

## Delta à produire

- [x] `PreferenceResolver::shouldSend()` : `whatsapp` refusé quand `phone_whatsapp === false`.
- [x] `PreferenceResolver::matrixFor()` : case `whatsapp` verrouillée, motif `phone_without_whatsapp`.
- [x] `NotificationPreferencesMatrix` : le motif s'affiche (`reasons.phoneWithoutWhatsapp`, fr/en/wo).
- [x] Tests : un par valeur (`false`, `true`, `null`) sur `resolveMobileChannel()`, la matrice
      verrouillée et ouverte, le motif affiché au front.

## Critères d'acceptation

- [x] AC1 — `phone_whatsapp = false`, téléphone vérifié, sans préférence : `resolveMobileChannel($user, 'lease_payment_overdue')` rend `sms`.
- [x] AC2 — même résultat avec une préférence WhatsApp explicitement allumée.
- [x] AC3 — `true` et `null` rendent `whatsapp`.
- [x] AC4 — la matrice verrouille la case WhatsApp (`phone_without_whatsapp`) et laisse le SMS cochable ; `true` et `null` la laissent ouverte.
- [x] AC5 — la case verrouillée du front est inactive et porte « Votre numéro est déclaré sans WhatsApp. ».

## Hors périmètre

- Les envois critiques de `WhatsappChannel`, qui sautent `isOptedIn()` : un message critique
  passe encore par WhatsApp à un numéro déclaré sans (noté dans le rapport, non mesuré).
- Le numéro secondaire (`secondary_phone_whatsapp`).

## Notes d'implémentation

- Ablation API : `PreferenceResolver.php` rendu à `HEAD` → 3 rouges (`false` → `whatsapp`, avec
  et sans préférence ; case non verrouillée) ; correctif remis → 20/20.
- Ablation front : `NotificationPreferencesMatrix.tsx` rendu à `HEAD` → 1 rouge (aucun `title`) ;
  correctif remis → 10/10.
- `User::saving` remet `phone_whatsapp` à `null` quand le numéro change : les tests posent la
  valeur après la création, par `forceFill`.
