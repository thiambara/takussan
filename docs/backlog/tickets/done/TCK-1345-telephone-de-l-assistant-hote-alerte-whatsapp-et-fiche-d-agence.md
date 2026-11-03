---
id: TCK-1345
title: "Téléphones : numéro de l'assistant hôte comparé au compte, alerte WhatsApp jugée par `TelephoneJoignable`, E.164 publié par la fiche d'agence"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-125--téléphones-écrits-sans-normalisation-et-leurs-lecteurs"
tags: [api, web, telephone, onboarding, alertes, pistes]
---

## Contexte

Réf : **P125.06** du fichier de pistes, `validé` (V2 accordé).

Trois écarts de lecture d'un téléphone :

1. `phone_otp.phone` était exigé par l'onboarding de l'hôte particulier, puis jamais lu : le code
   vérifie `users.phone`.
2. L'alerte de recherche par WhatsApp n'exigeait que la forme E.164 : `+330612345678` passait,
   que `TelephoneJoignable` refuse partout ailleurs.
3. La fiche publique d'une agence émettait `agencies.phone` brut dans le JSON-LD, et en `tel:`
   après le seul retrait des blancs : `77 123 45 67` publiait `tel:771234567`.

## Décision du porteur

> porteur (2026-10-22) : comparer `phone_otp.phone` au numéro du compte (refus s'il diffère), avec P114.04 ; le reste de la Piste tel qu'écrit

## Delta à produire

- [x] `HostIndividualOnboardRequest` : `phone_otp.phone` différent de `users.phone` (blancs
      ignorés) → 422 sur le champ, message `onboarding.host_individual.errors.phone_mismatch`.
- [x] `StorePublicSearchAlertRequest` : le numéro WhatsApp, sans ses blancs, est jugé par
      `TelephoneJoignable::defaut`.
- [x] Front : `telephonePublie()` (`lib/phone.ts`) rend l'E.164 quand la valeur s'y ramène
      (forme nationale composée sous `+221`), sinon la valeur sans blancs ; lu par le `tel:` de
      `ContactSheet` et le `telephone` de `jsonLdAgence`.

## Critères d'acceptation

- [x] AC1 — Compte `+221770000000`, `phone_otp.phone = +221779999999` avec un code valide → 422
      `phone_otp.phone`, aucune agence, compte non vérifié ; de même pour un compte déjà vérifié.
- [x] AC2 — Le numéro du compte, espacé (`+221 77 000 00 00`), passe (201).
- [x] AC3 — Alerte WhatsApp : `+330612345678` et `+22177123456` → 422 ; `+221 77 123 45 67` → 202.
- [x] AC4 — Agence `77 123 45 67` → `tel:+221771234567` et `telephone: +221771234567`.

## Hypothèses

- P114.04 (même fichier, numéro d'angle pair) appartient à l'autre instance de l'implémenteur :
  ce ticket ne fait que la comparaison décidée. Sa décision (« le numéro saisi s'écrit sur le compte
  puis se vérifie par code ») est déjà le parcours de l'assistant (`phoneSendOtpAction` écrit
  `users.phone` avant l'envoi), et reste compatible avec ce refus.
- Le message de refus est un texte neuf court ; le wolof étant en pause, `wo` porte le français.
- Seul le JSON-LD de l'agence change : `users.phone` est déjà en E.164 (`jsonLdAgent` inchangé).

## Hors périmètre

- Les autres assistants (`OwnerOnboarding`, `AgentOnboarding`, `ServiceProviderOnboarding`) qui
  portent aussi `phone_otp` : non cités par la piste.
- Normaliser `agencies.phone` à l'écriture (V4, écarté par TCK-1257).

## Notes d'implémentation

- Ablations : comparaison neutralisée → 2 rouges sur 13 ; jugement `TelephoneJoignable` neutralisé →
  1 rouge sur 22 ; `telephonePublie` réduit au retrait des blancs → 2 rouges (forme nationale, JSON-LD
  et `tel:`) ; remis → verts.
