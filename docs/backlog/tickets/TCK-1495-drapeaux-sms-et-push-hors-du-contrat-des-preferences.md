---
id: TCK-1495
title: "`notifications_sms_enabled` et `notifications_push_enabled` quittent le contrat des préférences"
status: done
phase: P2
family: cleanup
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-107--champs-de-contact-du-profil--lus-par-les-chemins-qui-envoient-ou-seulement-affichés"
tags: [back, notifications, contrat, pistes]
---

## Contexte

Réf : **P107.02** du fichier de pistes, `validé` (critère V7 accordé).

`PATCH`/`PUT /api/me/notification-preferences` écrivaient et rendaient trois drapeaux plats sur
`users`. Aucun envoi ne lit ceux du SMS et du push (la matrice de `PreferenceResolver` commande ces
canaux) : un client de l'API qui posait `notifications_sms_enabled: false` croyait le SMS coupé.

## Décision du porteur

validé — porteur (2026-10-22) : retirer de la requête et de la réponse `notifications_sms_enabled` et `notifications_push_enabled`, sans lecteur ; garder `notifications_email_enabled` tant que P11.08 n'est pas tranchée ; colonnes gardées, `models-spec.md` corrigé

## Delta

- [x] `UpdateNotificationPreferencesRequest` : `FLAT_KEYS` et règles réduits à
  `notifications_email_enabled`. Une clé SMS ou push envoyée n'est plus validée, donc plus écrite.
- [x] `NotificationPreferenceController::payloadFor` : les deux clés quittent la réponse.
- [x] Colonnes, `fillable`, casts et journal d'activité de `User` inchangés.

## Reste à faire

- La correction de `docs/models-spec.md:405-407` (« Alertes SMS/push activées ») pour dire
  qu'aucun envoi ne lit ces deux drapeaux : le fichier est fermé à l'implémenteur, elle revient à
  `/sync-specs` ou au porteur.

## Critères d'acceptation

- [x] AC1 — `GET` rend `notifications_email_enabled`, plus les deux autres clés.
- [x] AC2 — `PATCH {notifications_sms_enabled: false, notifications_push_enabled: false}` rend 200,
  sans les clés, et les colonnes gardent leur valeur.
- [x] AC3 — `notifications_email_enabled: 'peut-être'` rend toujours 422.

## Notes d'implémentation

- Ablation : contrôleur et requête rendus à leur version d'avant → 2 rouges dans
  `NotificationPreferenceTest`, remis → 9/9.
- Une clé envoyée hors règles n'est pas refusée (`validated()` l'ignore) : un client qui l'envoie
  encore reçoit 200, sans effet, ce qu'il recevait déjà en substance.
