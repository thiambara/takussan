---
id: TCK-2430
title: "Les empreintes HMAC hors du Radar dépendent d'APP_KEY : une rotation rouvre des désinscriptions et des crédits de bienvenue"
status: todo
phase: P1
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2414]
blocks: []
spec_refs:
  features: []
  models: []
tags: [api, securite, donnees-personnelles, rotation-de-cle]
---

## Objectif utilisateur

Faire tourner `APP_KEY` (fuite, départ d'un administrateur) ne rouvre aucun droit et n'oublie aucun refus : un abonné
désinscrit le reste, un numéro qui a reçu son crédit de bienvenue ne le reçoit pas deux fois.

## Contexte

TCK-2414 a donné à l'empreinte des refus du Radar une clé dédiée, reconnue sous ses anciennes clés. L'inventaire fait
pour lui (2026-10-30) a trouvé d'autres empreintes HMAC sous `config('app.key')`, hors du Radar, que ce ticket ne
touchait pas. Laravel relit `APP_PREVIOUS_KEYS` pour déchiffrer (cast `encrypted`) et pour les URL signées, **pas** pour
un `hash_hmac` écrit à la main.

| Empreinte | Ce qu'une rotation casse | Sens de la panne |
|---|---|---|
| `AlertSubscriber::contactHash()` | `eraseContact()` supprime par `contact_hash` : une désinscription après rotation laisse vivantes les demandes confirmées avant | ouvert (envois après désinscription) |
| `AlertSubscriber::mailboxHash()` | plafonds et limiteur par boîte remis à zéro | ouvert, borné |
| `PhoneFingerprint::of()` (`WelcomeCreditService`) | `credit_welcome_grants.phone_hash` ne reconnaît plus le numéro : second crédit de bienvenue | ouvert (financier) |
| `PayoutMethod::fingerprint()` | l'empreinte approuvée ne correspond plus à l'exécution : versement bloqué | fermé |
| `VisitNotifier` (plafond SMS de visite) | compteurs du cache remis à zéro | ouvert, borné à la fenêtre |
| `WebhookJournal::bodyDigest()`, `VisitorFingerprint` | rapprochements historiques perdus | sans effet de droit |
| `PhoneVerificationService` (code SMS haché) | codes en cours invalidés | fermé, quelques minutes |

## Delta à produire

- [ ] Décider, empreinte par empreinte, entre une clé dédiée, la reconnaissance sous `APP_PREVIOUS_KEYS` (le patron de
      `RadarPhone::hmacs()`), ou rien.
- [ ] Au minimum, les deux pannes ouvertes à effet durable : la désinscription des alertes et le crédit de bienvenue.
- [ ] Le runbook de rotation d'`APP_KEY` (`docs/infra/hebergement.md`) dit quoi garder dans `APP_PREVIOUS_KEYS`, et
      combien de temps.

## Critères d'acceptation

- [ ] AC1 — Après une rotation d'`APP_KEY` avec l'ancienne dans `APP_PREVIOUS_KEYS`, une désinscription supprime aussi
      les demandes confirmées avant la rotation.
- [ ] AC2 — Après la même rotation, un numéro qui a reçu son crédit de bienvenue ne le reçoit pas une seconde fois.

## Hors périmètre

- L'empreinte des refus du Radar et le lien de réclamation : TCK-2414.
