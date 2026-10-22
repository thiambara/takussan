---
id: TCK-1172
title: "La route des webhooks Lemon Squeezy refuse tout sans secret de signature, et la sonde le dit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, payments, webhooks, lemon-squeezy, health, pistes]
---

## Contexte

Réf : **P98.08** du fichier de pistes, `validé` (V1 et V5 cités par le classement, accordés).

Décision du porteur : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Le contrôleur du paquet `lemonsqueezy/laravel` n'ajoute son middleware de signature que si
`config('lemon-squeezy.signing_secret')` est rempli (`LEMON_SQUEEZY_SIGNING_SECRET`). Le
`signing_secret` saisi dans la console n'y est poussé que par les appels sortants du pilote : sans
la variable, un corps non signé atteignait le gestionnaire du paquet, quoi que dise la console.

## Objectif utilisateur

Un webhook Lemon Squeezy de la plateforme n'est traité que signé ; l'opérateur voit, dans la santé
du système, une configuration où la route refuse tout.

## Delta à produire

- [x] Middleware `RequireLemonSqueezySigningSecret` sur la route, après le journal : 403 quand le
      secret de configuration est vide.
- [x] Sonde `lemon_squeezy_webhook` de `HealthcheckService` : `degraded`
      (`signing_secret_missing`) quand une intégration Lemon Squeezy de plateforme active existe et
      que le secret de configuration est vide.
- [x] Tests : `LemonSqueezyWebhookJournalTest`, `HealthcheckProbesTest`.

## Critères d'acceptation

- [x] AC1 — secret vide, intégration de plateforme active, `POST` non signé : 403, ligne du
      journal `rejected`, non rejouable, et `WebhookReceived` n'est pas émis (le gestionnaire du
      paquet ne traite rien, aucune échéance soldée).
- [x] AC2 — la sonde est `ok` sans intégration active ou avec un secret, `degraded` sinon.
- [x] AC3 — les cas signés (juste, faux, rejeu) sont inchangés.

## Hors périmètre

- Pousser le `signing_secret` de la console dans la configuration sur la route entrante : ADR-0046
  § 6 rattache cette route au secret de la configuration.
- Une carte « Lemon Squeezy » à l'écran Santé : comme `whatsapp`, `scheduler` et `proxies`, la
  sonde n'a pas de carte, mais compte dans le statut global.
- Les valeurs des environnements : elles ne se voient pas d'ici.

## Notes d'implémentation

- Choix : « refuser la route », la première voie de la piste ; 403, le statut d'une signature
  fausse, pour que la ligne du journal soit `rejected` comme elle.
- ⚠ Un environnement sans `LEMON_SQUEEZY_SIGNING_SECRET` refuse désormais tous les webhooks
  Lemon Squeezy de la plateforme : à vérifier sur la préproduction avant la promotion.
- Le test existant « sans secret, rien n'est authentifié » attendait 200 : il attend 403 et
  qu'aucun `WebhookReceived` ne soit émis.
- Ablation : route et `HealthcheckService` rendus à `pre-dev` → 1 rouge dans chacune des deux
  classes (200 au lieu de 403 ; sonde absente) ; correctif remis → 5/5 et 18/18.
  `PaymentDriverErrorLeakTest`, `LemonSqueezyEventListenerTest`, `ListenerSideEffectsRunOnceTest`,
  `TrustedProxiesTest` verts.
