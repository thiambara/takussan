---
id: TCK-2430
title: "Les empreintes HMAC hors du Radar dépendent d'APP_KEY : une rotation rouvre des désinscriptions et des crédits de bienvenue"
status: done
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

- [x] Décider, empreinte par empreinte, entre une clé dédiée, la reconnaissance sous `APP_PREVIOUS_KEYS` (le patron de
      `RadarPhone::hmacs()`), ou rien.
- [x] Au minimum, les deux pannes ouvertes à effet durable : la désinscription des alertes et le crédit de bienvenue.
- [x] Le runbook de rotation d'`APP_KEY` (`docs/infra/hebergement.md`) dit quoi garder dans `APP_PREVIOUS_KEYS`, et
      combien de temps.

## Critères d'acceptation

- [x] AC1 — Après une rotation d'`APP_KEY` avec l'ancienne dans `APP_PREVIOUS_KEYS`, une désinscription supprime aussi
      les demandes confirmées avant la rotation.
- [x] AC2 — Après la même rotation, un numéro qui a reçu son crédit de bienvenue ne le reçoit pas une seconde fois.

## Hors périmètre

- L'empreinte des refus du Radar et le lien de réclamation : TCK-2414.
- La clé d'empreinte distincte d'`APP_KEY`, la commande de ré-chiffrement et la réécriture des empreintes anciennes :
  [TCK-614](TCK-614-rotation-d-app-key-et-cle-d-empreinte-distincte.md).

## Prérequis du porteur

Aucun secret ni variable neuve. Une seule consigne, écrite dans `docs/infra/hebergement.md` : à une rotation d'`APP_KEY`,
l'ancienne va **en tête** d'`APP_PREVIOUS_KEYS` et n'en sort pas avant TCK-614.

## Notes d'implémentation

- **Re-mesure (2026-10-30, `dev` `9f7bffea9`)** : les sites du tableau sont exacts, sans autre HMAC sous `app.key`
  hors du Radar (`grep -rn "hash_hmac\|app\.key" app`). Deux précisions : `WebhookJournal::bodyDigest()` n'a **aucun
  lecteur** (la colonne `body_sha256` n'est qu'écrite) ; `VisitorFingerprint` dédoublonne aussi les signalements d'avis
  anonymes, pour la vie de l'avis (au pire, un signalement de plus après une rotation). Le ticket voisin TCK-614 (todo,
  2026-10-08) portait déjà la clé distincte et le ré-chiffrement : il reste ouvert pour cela.
- **`App\Support\AppKeyHmac`** : `of()` écrit sous la clé courante, `all()` lit sous la courante puis
  `APP_PREVIOUS_KEYS`. Tous les sites du tableau y passent, et `AppKeyHmacPointUniqueTest` (Architecture) refuse toute
  autre lecture de la clé dans `app/`, `config/`, `database/`, `routes/` et `bootstrap/`, hors `RadarPhone`,
  `ClaimLinks` (ADR-0082) et `config/app.php` ; plancher, pas preuve : la concaténation lui échappe. Une clé `base64:`
  se lit telle qu'écrite et sous sa forme canonique (une ancienne recopiée sans son `=` reste reconnue). Un contact
  indéchiffrable n'empêche pas la désinscription (sous l'empreinte stockée), WhatsApp compris : la ligne
  `whatsapp_contacts` qu'on ne retrouve plus sans le numéro reste alors en base (ADR-0084 §2).
- **Lectures tolérantes** : `eraseContact()` (empreinte stockée + toutes celles du contact déchiffré),
  `scopeForContact()`, `SavedSearchController::claim()`, `AccountDeletionService`, les deux plafonds de
  `RecordPublicSearchAlert`, `WelcomeCreditService::grant()` (recherche avant l'`insertOrIgnore`),
  `RadarActivationReminders::welcomeCredits()`, `PayoutService::assertApprovedDestination()`.
- Décision structurelle écrite en [ADR-0084](../../adr/0084-les-empreintes-sous-app-key-se-lisent-sous-ses-anciennes-cles.md).

## Décisions prises en autonomie, à revoir

- **Lecture sous `APP_PREVIOUS_KEYS`** (retenu) plutôt qu'une clé dédiée `APP_HMAC_KEY` (écarté) : aucun secret de plus,
  une rotation est sûre dès aujourd'hui, et une clé dédiée posée seule perdrait les octrois des comptes anonymisés comme
  une rotation. La clé dédiée reste à TCK-614.
- **Une désinscription gagne toujours** (retenu) plutôt que la seule empreinte stockée (écarté) : `eraseContact()`
  supprime sous toutes les empreintes reconnues du contact.
- **Versement approuvé reconnu sous une ancienne clé** (retenu) plutôt que laissé bloqué (écarté : panne fermée, mais
  rien ne justifie de bloquer la même destination).
- **Rien pour le plafond SMS de visite, l'empreinte de visiteur, l'empreinte du corps d'un webhook et le code SMS**
  (retenu) plutôt qu'une lecture tolérante (écarté) : pannes bornées à une fenêtre ou sans effet de droit.
- **Pas de commande de réécriture des empreintes** (retenu) plutôt qu'un `rehash` comme `radar:rehash-phones` (écarté) :
  l'ancienne clé ne peut pas quitter `APP_PREVIOUS_KEYS` avant le ré-chiffrement d'ADR-0044, qui n'existe pas ; la
  réécriture va avec lui dans TCK-614. Pas de ticket neuf : TCK-614 la porte déjà.
- **Garde Architecture du point unique** (retenu) plutôt que la seule documentation (écarté) : un HMAC écrit demain à la
  main sous `app.key` rouvrirait la panne sans bruit.
- **Clé lue aussi sous sa forme base64 canonique** (retenu, vérification adverse M3) plutôt que refuser une ancienne clé
  recopiée sans son `=` (écarté : Laravel la déchiffre, la refuser serait plus restrictif pour l'exploitant) ; l'écriture
  garde la chaîne telle qu'écrite. `RadarPhone` et `ClaimLinks` ne sont pas touchés : le runbook dit « à l'identique ».
- **ADR-0084 « Proposé »** (retenu) plutôt qu'un amendement d'ADR-0082 (écarté : ADR-0082 porte la clé du Radar, cette
  décision-ci n'ajoute aucune clé).

