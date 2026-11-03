---
id: TCK-1021
title: "Un délai dépassé chez Wave ou Orange Money rend 502 `payment.provider_unavailable`, et non 500"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#31-integration-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-65--durée-des-appels-sortants-synchrones-dune-requête-http-face-aux-délais-de-php-du-serveur-web-et-de-traefik"
tags: [api, payments, pistes]
---

## Contexte

Réf : **P65.03** du fichier de pistes, `retenu · autonome` (A1). Les pilotes Wave et Orange Money
rendaient 502 `payment.provider_unavailable` sur une réponse en erreur, mais une
`ConnectionException` (délai dépassé, connexion refusée) sortait d'eux telle quelle et devenait la
500 générique de Laravel, avec le message de cURL sous `APP_DEBUG`. Le contrat attendu est déjà
écrit : celui des deux pilotes sur réponse en erreur (TCK-602) et de Lemon Squeezy sur exception.
Re-mesuré le 2026-10-20 sur `pre-dev` c3c65f7a7 par le test de garde ci-dessous : 6 rouges sur 6
avant correctif, « Expected response status code [502] but received 500 ».

## Objectif

Un fournisseur de paiement qui ne répond pas est rendu au client comme indisponible (502), et le
journal n'en garde que la forme sûre de l'exception.

## Delta à produire

- [x] `WaveDriver` : initiation et vérification passent par `reach()`, qui attrape
      `ConnectionException`, journalise `SafeExceptionContext` et rend 502
      `payment.provider_unavailable`.
- [x] `OrangeMoneyDriver` : même chose pour le jeton OAuth, l'initiation et la vérification.
- [x] `tests/Feature/Payments/PaymentDriverConnectionFailureTest.php` : un cas par pilote et par
      appel (six), par les routes `lease-payments/{id}/initiate` et `/verify`.

## Critères d'acceptation

- [x] AC1 — Pour chacun des six appels, une connexion qui échoue rend 502 et le code
      `payment.provider_unavailable`, sans « cURL » ni l'identifiant de session dans la réponse.
- [x] AC2 — Un avertissement `[<pilote>] <étape> unreachable` est journalisé une fois, avec la
      classe `ConnectionException` et la pile réduite, sans le message de cURL ni l'URL appelée.

## Hypothèses (mode sans humain)

- Le `retry(2, 200, throw: false)` de la vérification est gardé : il relance sur exception de
  connexion, et c'est après la dernière tentative que l'exception est traduite.
- À l'initiation, le 502 annule la transaction comme le faisait la 500 : l'état écrit ne change pas,
  seul le code rendu change.

## Hors périmètre

- La séparation de l'initiation hors transaction (P65.02, V1) et les délais du serveur (P65.01).

## Notes d'implémentation

- Ablation : correctif des deux pilotes retiré → 6 rouges (500 au lieu de 502) ; remis → 6 verts.
- Piège : `Http::fake(['*/oauth/v3/token' => Http::response(…), '*' => Http::failedConnection()])`
  faisait échouer le jeton lui-même (une seule requête enregistrée, vers `/oauth/v3/token`, en
  échec de connexion). Le test passe donc par une fonction de faux qui choisit selon l'URL.
