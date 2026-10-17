---
id: TCK-780
title: "Les trois routes en double (verify-phone, phone/resend, notifications/preferences) retirées"
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
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons"
tags: [back, routes, code-mort, pistes]
---

## Contexte

Réf : **P13.08** du fichier de pistes, `validé` (critère accordé : V8, avec V2 cité au même
classement). Trois routes doublent une route gardée, sur la même action : `POST auth/verify-phone`
(`phone/verify-otp`), `POST auth/phone/resend` (`phone/send-otp`), `GET|PUT notifications/preferences`
(`me/notification-preferences`). Aucune n'a d'appelant dans le front ni dans `app/` ; seuls des tests
les visent.

## Décision du porteur

retirer les trois doublons (verify-phone, phone/resend, notifications/preferences) ; un test qui les vise passe sur la route gardée ; terminate reste ; reste : leases/{l}/terminate et les autres routes sans appelant

## Reste à faire

leases/{l}/terminate et les autres routes sans appelant

## Delta à produire

- [x] `routes/api/auth.php` : `verify-phone` et `phone/resend` retirées.
- [x] `routes/api/notifications.php` : `notifications/preferences` (GET et PUT) retirée.
- [x] `PhoneVerificationTest` et `NotificationPreferenceTest` visent `phone/verify-otp`,
      `phone/send-otp` et `me/notification-preferences`.

## Critères d'acceptation

- [x] AC1 — Aucune des trois routes n'est plus enregistrée ; les routes gardées le sont toujours.
- [x] AC2 — Les tests de vérification du téléphone et des préférences passent sur les routes gardées.

## Hors périmètre

- `leases/{l}/terminate`, qui reste (décision), et les autres routes sans appelant (reste).
- ADR-0033 cite `phone/resend` parmi les écrivains du numéro : chemin fermé à l'agent, signalé au
  rapport.

## Hypothèses (mode sans humain)

- Un client hors du front (application tierce) n'a pas été cherché, comme à la mesure : aucun n'est
  documenté dans le dépôt.

## Notes d'implémentation

- Ablation : `routes/` remis à l'état d'avant → `RoutesEnDoubleRetireesTest` rougit ; correctif
  remis → vert, et les 35 classes qui citent la vérification du téléphone ou les préférences vertes
  (333 tests).
- `test_both_endpoints_require_auth` visait déjà les deux formes de chaque route : une fois les
  chemins repointés, ses lignes en double sont retirées.
