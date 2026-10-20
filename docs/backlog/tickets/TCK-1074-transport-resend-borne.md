---
id: TCK-1074
title: "Le transport `resend` passe par un client Guzzle borné (5 s de connexion, 10 s en tout)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-65--durée-des-appels-sortants-synchrones-dune-requête-http-face-aux-délais-de-php-du-serveur-web-et-de-traefik"
tags: [api, courriel, resend, delais, pistes]
---

## Contexte

Réf : **P65.04** du fichier de pistes, `validé` (V6). Le transport `resend` de Laravel construit
son client par `Resend::client()`, qui fait `new GuzzleClient()` sans option : aucun délai total.
L'invitation part dans la requête HTTP, et sa relance dans la transaction, sous le verrou de
l'invitation (TCK-367). Le code de signature d'un bail part par courriel pendant la requête quand le
signataire n'a pas de numéro vérifié. Un Resend muet tenait ces requêtes, et le verrou, jusqu'à la
borne de PHP. La production est prescrite en `MAIL_MAILER=resend`.

## Décision du porteur

> un transport `resend` de l'application sur un `GuzzleClient` borné (`connect_timeout` 5 s, `timeout` 10 s), garde par un test qui lit les options du client ; les envois de l'invitation restent dans la requête (TCK-367) (porteur, 2026-10-20)

## Objectif

Le mailer `resend` construit par le gestionnaire de courriel envoie par un Guzzle à
`connect_timeout` 5 s et `timeout` 10 s.

## Delta à produire

- [x] `App\Mail\Transport\BoundedResendClient` : le client de `Resend::client()`, à l'identique
      (`RESEND_BASE_URL` comprise), sur un Guzzle borné.
- [x] `AppServiceProvider::bootMailTransports()` : `Mail::extend('resend', …)` rend le
      `ResendTransport` de Laravel sur ce client.
- [x] Test : `tests/Feature/Mail/ResendTransportTimeoutTest.php`.

## Critères d'acceptation

- [x] AC1 : `Mail::mailer('resend')->getSymfonyTransport()` est un `ResendTransport` dont le client
      Guzzle porte `connect_timeout` 5 et `timeout` 10.
- [x] AC2 : les envois de l'invitation restent dans la requête (aucune mise en file).

## Hypothèses (mode sans humain)

- Le test lit le client par réflexion (`ResendTransport::$resend`, `Client::$transporter`,
  `HttpTransporter::$client`) : resend-php n'expose pas son client Guzzle. Une montée de version qui
  renomme ces propriétés fera rougir le test, ce qui est voulu : la garde doit alors être revue.

## Hors périmètre

- La mise en file des courriels (invitation, code de signature) : au porteur.
- La borne de PHP et du serveur (P65.01).

## Notes d'implémentation

- Avant correctif : 1 rouge, `connect_timeout` null. Ablation (appel de `bootMailTransports()`
  retiré) → 1 rouge, remis → 1 vert.
