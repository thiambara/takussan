---
id: TCK-1075
title: "L'initiation d'un paiement appelle le fournisseur hors transaction, entre une réservation et un enregistrement sous verrou"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-65--durée-des-appels-sortants-synchrones-dune-requête-http-face-aux-délais-de-php-du-serveur-web-et-de-traefik"
tags: [api, paiements, verrou, delais, pistes]
---

## Contexte

Réf : **P65.02** du fichier de pistes, `validé` (V1). `PaymentGatewayService::initiate()` ouvrait
`DB::transaction`, verrouillait la ligne (`lockForUpdate`, TCK-593), puis appelait le fournisseur
dans cette transaction : jusqu'à 35 s chez Orange Money (jeton puis page), et chez Lemon Squeezy
deux appels sans délai propre (30 s chacun par défaut). La connexion PostgreSQL restait ouverte,
la ligne verrouillée, et le webhook comme `verify()` du même paiement attendaient. `verify()`
suivait déjà la règle inverse (VERIF-594 m-4).

## Décision du porteur

> un ticket dédié : initiation en trois temps (réserver sous verrou avec échéance, appeler le fournisseur hors transaction, enregistrer sous verrou en revérifiant, sur le modèle de `verify()`) et délais explicites aux deux appels Lemon Squeezy ; avant la mise en production (porteur, 2026-10-20)

## Objectif

Aucun appel au fournisseur n'a lieu dans une transaction ; deux initiations simultanées n'ouvrent
toujours qu'un checkout ; un payable réglé pendant l'appel ne reçoit pas de checkout.

## Delta à produire

- [x] `initiate()` en trois temps :
  1. sous verrou : les gardes d'avant (montant, payable, checkout ouvert, devise, fournisseur), puis
     une réservation `metadata.gateway.initiating` (jeton, fournisseur, montant, `reserved_at`,
     `expires_at`) ; montant et part de pénalité figés ici ;
  2. hors transaction : l'appel au pilote ; sur exception, la réservation est levée ;
  3. sous verrou, ligne relue : refus si la ligne n'est plus payable (409 `payment.not_payable`,
     réservation levée, checkout journalisé et non rendu) ou si une autre initiation a pris la place
     (409 `payment.checkout_in_progress`) ; sinon `recordInitiation()`, qui efface la réservation.
- [x] Une réservation vivante refuse une seconde initiation : 409 `payment.checkout_in_progress`,
      avec le même `checkout` que `refuseOpenCheckout()` (montant, devise, `retry_after` = échéance).
- [x] `config/payments.php` : `initiation_reservation_seconds` (120).
- [x] `LemonSqueezyDriver` : `connect_timeout` 5 s et `timeout` 15 s sur `GET stores/{id}` et
      `POST checkouts`, posés par les options globales du client HTTP le temps de l'appel, puis rendus.
- [x] Tests : `PaymentInitiationOutsideTransactionTest`, `LemonSqueezyHttpTimeoutTest`.

## Critères d'acceptation

- [x] AC1 : pendant l'appel au pilote, le niveau de transaction est celui d'avant la requête.
- [x] AC2 : pendant l'appel, la ligne porte la réservation, et une seconde initiation reçoit 409
      `payment.checkout_in_progress` sans appeler le pilote.
- [x] AC3 : un payable réglé pendant l'appel rend 409 `payment.not_payable`, sans `transaction_id`
      enregistré ni réservation restante.
- [x] AC4 : un échec du pilote lève la réservation ; une réservation échue ne bloque plus.
- [x] AC5 : les deux appels Lemon Squeezy portent `connect_timeout` 5 et `timeout` 15 ; un appel
      HTTP suivant garde les défauts.

## Hypothèses (mode sans humain)

- **Double clic pendant l'appel** : avant, la seconde requête attendait le verrou puis recevait le
  checkout du premier (200). Elle reçoit désormais 409 `payment.checkout_in_progress` tant que le
  premier attend son fournisseur, puis le checkout au clic suivant. C'est la conséquence directe de
  la décision (le verrou ne couvre plus l'appel) ; le front affiche déjà ce refus.
- **Échéance de 120 s** : au-delà de `max_execution_time = 60` (P65.01), pour qu'une requête tuée
  pendant l'appel ne bloque le payable que deux minutes.
- **Délais Lemon Squeezy 5 s / 15 s** : ceux d'Orange Money (`connectTimeout(5)`, `timeout(15)` pour
  le jeton) ; deux appels tiennent sous 40 s. Les valeurs ne sont écrites nulle part ailleurs.
- **La réservation s'écrit par `saveQuietly()`** : c'est un marqueur de travail, ni observateur ni
  journal d'activité. L'enregistrement final passe toujours par `save()`, comme avant.

## Hors périmètre

- Le checkout créé chez le fournisseur et laissé sans suite (étape 3 refusée) : journalisé, jamais
  rendu ; aucune annulation chez le fournisseur.
- La borne de PHP et du serveur (P65.01).

## Notes d'implémentation

- Avant correctif : 3 rouges sur 5 (pilote appelé au niveau de transaction +1 ; seconde initiation
  pendant l'appel acceptée et second checkout ouvert ; checkout d'un payable réglé pendant l'appel
  enregistré, 200). Les deux autres gardent le mécanisme neuf.
- Ablations : service de `pre-dev` → les 3 mêmes rouges ; levée de la réservation sur échec retirée
  → rouge (`initiating` reste) ; réservation vivante au lieu d'échue → 409 (la garde de la
  réservation mord) ; appel `POST checkouts` sans `bounded()` → rouge (`connect_timeout` 10, défaut
  de Laravel).
- Piège : un refus de l'étape 3 ne se lève pas dans la transaction, sinon il annule aussi la levée
  de la réservation. La transaction rend l'`ApiError`, levée après validation.
- `LemonSqueezy::api()` n'accepte aucune option : seules les options globales de la fabrique `Http`
  l'atteignent. Elles sont lues par `Closure::call` (pas d'accesseur) et rendues dans un `finally`.
- 202 tests des classes de paiement (`tests/Feature/Payments`, `PaymentGatewayInitiateTest`,
  `PaymentCheckoutReuseTest`, `PaymentCheckoutOverrideTest`, webhooks, supervision, rapprochement) :
  verts.
