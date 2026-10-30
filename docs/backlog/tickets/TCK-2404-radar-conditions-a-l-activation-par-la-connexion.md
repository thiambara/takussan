---
id: TCK-2404
title: "Radar : le compte créé par le Radar et activé par la connexion ordinaire se voit présenter les conditions"
status: done
phase: P1
family: full
estimate: S
wave: 80
created: 2026-10-29
updated: 2026-10-30
depends_on: [TCK-2390]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
    - "docs/features.md#21-authentification--comptes"
  models: []
tags: [api, front, radar, onboarding, legal, adr-0077, adr-0033]
---

## Objectif utilisateur

L'annonceur dont le Radar a publié les annonces pour lui, et qui active son compte en se connectant
par code SMS depuis `/auth/login` plutôt que par le lien du message, accepte les conditions
d'utilisation à ce moment-là, comme l'article 6.3 des CGU le lui promet.

## Contexte

Relevé pendant TCK-2390 (2026-10-29). L'article 6.3 de `takussan-web/src/content/legal/terms.ts` dit :
« Vous l'activez en vous connectant avec un code reçu par SMS à ce numéro ; les présentes Conditions
vous sont alors présentées pour acceptation. » TCK-2390 le rend vrai sur **la page de réclamation**
(`/[locale]/claim/{jeton}` : case des conditions, `PublishReadiness::recordTerms` à la confirmation,
version comprise). Mais la connexion par téléphone ordinaire (`POST /api/auth/phone/verify-code`)
ouvre aussi ce compte (amendement d'ADR-0033 §3, TCK-2389), sans rien présenter : les conditions ne
sont enregistrées qu'à la première publication faite par l'utilisateur lui-même
(`PropertyController`, `accept_terms`). Mesuré : `grep -rn recordTerms takussan-api/app` — quatre
appels dans `PropertyController`, un dans `RadarClaims`, aucun dans la connexion.

## Delta à produire

- [x] À la première connexion d'un compte du Radar (`is_new_account` faux, compte désigné par un
      `radar_advertisers.user_id`, `terms_accepted_at` nul), les conditions sont présentées pour
      acceptation avant l'entrée dans l'espace, et leur acceptation enregistrée avec leur version.
- [x] Retirer la ligne « Fermer TCK-2404 » de « Avant la mise en production » du `README` de
      `content/legal`.

## Critères d'acceptation

- [x] AC1 — Un compte du Radar activé par `/auth/login` (code SMS) ne voit pas son espace avant
      d'avoir accepté les conditions ; l'acceptation porte `terms_version`.
- [x] AC2 — Un compte qui a déjà accepté (réclamation, ou publication) n'est pas interrogé de nouveau.

## Hors périmètre

- La page de réclamation elle-même (TCK-2390, livrée).

## Notes d'implémentation

- **La garde est dans l'API, sur le modèle de `requires_2fa`** (`PhoneLoginService::authenticate`) :
  le bon code d'un compte désigné par un `radar_advertisers.user_id` dont `terms_accepted_at` est nul
  rend 200 `{requires_terms: true, terms_version}` — code **non consommé**, rien d'écrit (ni
  `phone_verified_at`, ni `last_login_at`, ni jeton). Le même code reposé avec `terms_version`
  égale à `PublishReadiness::TERMS_VERSION` ouvre la session et date l'acceptation par
  `PublishReadiness::recordTerms`. Une autre version vaut absence : la réponse est rejouée.
- **Avant le second facteur** : un TOTP ne survit pas à la lecture des conditions. Le front garde la
  version acceptée et la renvoie avec le second facteur.
- **La réclamation (TCK-2390) passe sa propre case** : `RadarClaims::confirm` transmet son
  `terms_version` (déjà validé) à `authenticate`, sans quoi l'activation par la page rendait
  `requires_terms` à son tour (ablation : `RadarClaimTest` AC4, deux rouges).
- ADR-0033 §3 amendé d'un paragraphe (« Les conditions avant l'entrée »).
- **Vérification adverse, corrigée** :
  - **I1** — `requires_terms` ne coûte pas d'essai au limiteur `auth-phone-verify` (4 par numéro et
    15 min) : l'essai pris avant la requête est rendu après, par `AppServiceProvider::refundPhoneVerify`
    (clé calculée par `ThrottleRequestsByNetwork::namedLimiterKey`, celle du framework). Écarté :
    `Limit::after()`, qui ne compte qu'après la requête et laisse passer une rafale entre la lecture et
    l'écriture du seau ; et `PHONE_VERIFY_PER_WINDOW = 5`, qui casse l'invariant M1 (c) (2 × 5 ≥ 10).
    Testé limiteur ALLUMÉ : le scénario de la vérification (code expiré pendant la lecture, faute de
    frappe, puis entrée) et l'absence de contournement (présentations répétées puis 4 mauvais codes → 429).
  - **I2** — l'étape « conditions » porte « Renvoyer le code » et « Changer de numéro » ; un 422 reçu
    depuis elle ramène à l'étape du code, vidée, et la version acceptée accompagne le code suivant.
  - **m2** — trace d'audit `radar_terms_accepted` (journal `Radar`, causer et sujet le compte,
    `terms_version`, `via` = nom de la route : la connexion ou la réclamation), ni numéro ni IP.
- Tests : `PhoneLoginRadarTermsTest` (8), `PhoneLoginRadarAccountTest` et `RadarPublishTest` AC3
  adaptés (le second repose maintenant le code avec la version, et prouve la garde de bout en bout
  sur un compte créé par « Publier pour lui ») ; front : `connexion-par-telephone.test.tsx` (2).

### Décisions prises en autonomie, à revoir

- **Où vit la garde** — retenu : dans l'API, aucun jeton avant l'acceptation. Écarté : une redirection
  du front après l'ouverture de session. Raison : « ne voit pas son espace » doit tenir hors de
  l'écran ; la garde se retire en une condition (`termsRequired`).
- **Quels comptes** — retenu : tout compte qu'un `radar_advertisers` désigne sans acceptation datée,
  activé ou non. Écarté : la seule première activation (numéro non vérifié). Raison : un compte du
  Radar activé avant ce ticket (préproduction) n'a rien accepté ; c'est aussi la lettre du delta.
- **Une acceptation d'une version plus ancienne** — retenue telle quelle, rien n'est redemandé.
  Écarté : réinterroger à chaque nouvelle `TERMS_VERSION`. Raison : AC2 ; la réacceptation d'une
  version nouvelle est une décision produit à part (article 19 des CGU, notification à 15 jours).
- **Ordre conditions / 2FA** — retenu : les conditions d'abord. Écarté : après le TOTP. Raison : un
  TOTP saisi expire pendant la lecture.
- **La connexion par mot de passe n'est pas gardée.** Un compte du Radar n'a pas de mot de passe
  avant d'être activé par code, et l'activation par code date désormais l'acceptation.
- **Comptes du Radar activés AVANT ce ticket (vérification adverse m1, rien de codé)** —
  préproduction seule, l'API n'a jamais servi en production. Trois voies leur restent ouvertes
  sans les conditions : le mot de passe s'ils en ont choisi un (`AuthController::login`), OAuth
  s'ils ont ajouté une adresse (`OAuthSessionOpener::open`), et surtout **les jetons déjà émis**,
  qui restent valides. Leur prochaine connexion par code les interroge ; leur première publication
  les fait accepter (`accept_terms`). Si le porteur le veut : révoquer en préproduction les jetons
  des comptes désignés par un `radar_advertisers` sans `terms_accepted_at`.
- **Le `README` de `content/legal`** : la ligne 7 est retirée sans renuméroter (fichier partagé par
  plusieurs tickets cette nuit, la numérotation avait déjà un trou en 6).
