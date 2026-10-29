---
id: TCK-2390
title: "Radar : l'annonceur réclame ses annonces depuis le lien du message, par code SMS à son numéro"
status: todo
phase: P1
family: full
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2388, TCK-2389]
blocks: [TCK-2394]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
    - "docs/features.md#21-authentification--comptes"
  models: []
tags: [api, front, radar, onboarding, public, adr-0077, adr-0033]
---

## Objectif utilisateur

Un annonceur qui préfère vérifier lui-même ouvre le lien reçu, voit ses annonces déjà remplies,
se connecte avec un code reçu par SMS, corrige ce qu'il veut et publie.

## Contexte

Option « réclamé par l'annonceur » de l'arbitrage du porteur du 2026-10-26 (option c, construite en
premier). [ADR-0077](../../adr/0077-le-radar.md) §3 et §6 : la connexion par code SMS est la preuve
d'accord la plus forte. Le même lien sert l'annonceur publié pour lui qui veut activer son compte.

## Contrat de données

- Le message d'accord (TCK-2388) et le second message (TCK-2389) portent un lien signé, propre à
  l'annonceur, à durée limitée.
- `GET /api/radar/claims/{token}` (public) — les annonces couvertes, sans le numéro en clair
  (masqué) ni aucune donnée interne du Radar (nature, indices, verdicts).
- `POST /api/radar/claims/{token}/otp` — envoie le code SMS **au numéro de l'annonceur seulement**.
- `POST /api/radar/claims/{token}/confirm` — code, acceptation des conditions (version), annonces
  retenues et corrigées → espace créé (ou retrouvé), biens publiés, preuve `otp` enregistrée.

## Direction UX / Artistique

Une page d'accueil chaleureuse et sans friction, lisible sur un téléphone d'entrée de gamme : « vos
annonces sont prêtes », les biens en cartes, un seul champ (le code), puis la publication. Aucun
jargon de plateforme. Si le compte existe déjà (publié pour lui), la même page devient
« activez votre compte ».

## Contraintes strictes (métier)

- **Le code est envoyé au seul numéro de l'annonceur**, jamais à un numéro saisi sur la page.
- Limitation de fréquence du code et du lien, comme la connexion par téléphone existante.
- **La page publique ne révèle ni le numéro complet, ni la nature présumée, ni rien d'autre du
  Radar.**
- Le lien expire (durée en configuration) et devient inutilisable après un STOP ou une révocation.
- La confirmation enregistre l'acceptation des conditions avec leur version et l'horodatage
  (même mécanisme que l'inscription), et une preuve `radar_consents` de type `otp`.
- **Numéro déjà inscrit** : la page invite à se connecter au compte existant, et la publication se
  fait dans **un espace individuel neuf ou existant de cet utilisateur, à son choix** ; jamais
  sans sa connexion.
- Création de l'espace par `HostIndividualOnboardingService`, publication par le `RadarPublisher`
  de TCK-2389.

**Héritées de TCK-2388** (démarchage et preuve d'accord) :

- `accord.v2.<locale>.md` = `accord.v1` + la ligne « Vous préférez vérifier vous-même avant ?
  {lien_reclamation} » (décision 1 de TCK-2388). `ConsentMessageComposer::CLAUSES_VERSION` avance
  à `accord.v2` ; chaque message garde sa version (`radar_outreaches.clauses_version`), donc les
  messages déjà envoyés restent `accord.v1`.
- La v1 dit « ces annonces » même pour une annonce seule : à reprendre en v2, avec la relecture de
  l'avocat.
- La preuve `otp` est une ligne `radar_consents` (`proof = otp`, `RadarConsentProof::Otp`, déjà dans
  l'enum), confirmée par la connexion elle-même — sans capture ni vérification IA.

## Delta à produire

- [ ] `App\Services\Radar\ClaimLinks` (signature, expiration, révocation).
- [ ] Contrôleur public `App\Http\Controllers\Public\RadarClaimController` · FormRequests
      `RequestRadarClaimOtpRequest`, `ConfirmRadarClaimRequest` · routes publiques limitées en
      fréquence.
- [ ] Front : page publique de réclamation, localisée (`/[locale]/…`), `noindex`.
- [ ] Tests : `RadarClaimTest` (lien expiré, révoqué, après STOP ⇒ refus ; la réponse ne contient
      ni le numéro complet ni la nature ; le code part au numéro de l'annonceur ; confirmation ⇒
      preuve `otp` + conditions acceptées ; numéro inscrit ⇒ connexion exigée).

## Critères d'acceptation

- [ ] AC1 — `GET /api/radar/claims/{token}` ne contient ni le numéro en clair ni aucun champ de
      nature ou de verdict.
- [ ] AC2 — Après STOP, le lien rend 410.
- [ ] AC3 — Une confirmation réussie publie les annonces retenues, enregistre une preuve `otp` et
      l'acceptation des conditions avec leur version.
- [ ] AC4 — Pour un annonceur déjà publié pour lui, la confirmation active le compte (numéro
      vérifié) et le crédit de bienvenue est attribué.

## Hors périmètre

- La relance d'activation (TCK-2394).

## Notes d'implémentation

_(à remplir par implementing-specs)_
