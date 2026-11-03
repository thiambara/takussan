---
id: TCK-1288
title: "Connexion OAuth : le contrôle de collision d'e-mail compare l'adresse repliée"
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
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92--contraintes-unique-sans-garde--doublon-rendu-en-500"
tags: [api, auth, oauth, casse, pistes]
---

## Contexte

Réf : **P92.06** du fichier de pistes, `validé` (V2 accordé).

`OAuthProvisioningService::provision` refuse en 409 `auth.oauth_email_taken` un e-mail de
fournisseur déjà pris par un compte non lié — défense contre la prise de compte. Il compare
`User::where('email', $email)` à l'e-mail tel que le fournisseur le rend, alors que
`User::setEmailAttribute` écrit l'adresse repliée (`CaseInsensitive::fold(trim())`) : une casse
mixte passe le contrôle, puis `User::create` heurte l'index unique, 500.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la voie que la piste recommande, `App\Support\CaseInsensitive` (`sql()` et
`fold()` par paire, comme `UpdateProfileRequest`), avec le même `trim` que le mutateur.

## Objectif

Une adresse de fournisseur qui ne diffère que par la casse ou des espaces d'un compte existant
rend le refus prévu (409), jamais un 500.

## Delta à produire

- [x] Contrôle de collision par `CaseInsensitive::sql('email') = CaseInsensitive::fold(trim($email))`.
- [x] Test `OAuthCallbackTest::test_callback_rejects_email_collision_whatever_the_provider_casing`.

## Critères d'acceptation

- [x] AC1 — Compte `victim@example.com`, fournisseur `' Victim@Example.COM '` → 409
      `auth.oauth_email_taken`, aucun compte créé.

## Hors périmètre

- Le lien automatique d'un compte existant (refusé par conception).

## Notes d'implémentation

- Ablation : service remis à `HEAD` → 1 rouge (500) ; correctif remis → 8/8 verts.
  `FacebookOAuthTest`, `AppleOAuthTest`, `OAuthSecondFactorTest` verts.
