---
id: TCK-2937
title: "« Créer mon espace pro » ouvre une agence tout de suite, vérifiée ensuite"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2938]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
tags: [back, entree, orientation, agence, pro, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le professionnel qui crée son espace depuis l'orientation travaille tout de suite dans un espace d'agence (équipe, bailleurs, mandats), et la vérification de l'agence suit sous 48 h.

## Contrat de données

Écarts de TCK-2608 (`ecarts_acceptes[9]`, `[10]`) : aujourd'hui « Créer mon espace pro » ouvre un espace **individuel** puis renvoie à la demande de passage en pro (`/app/settings/agency/upgrade`, `agencies/{agency}/upgrade-requests`), revue par le super-admin. La maquette promet « Ton espace d'agence s'ouvre tout de suite : équipe, bailleurs, mandats », puis « Sous 48 h · Notre équipe vérifie l'agence (NINEA, registre du commerce) ».

- La création depuis l'orientation (`EtapePro`) produit une agence de type `standard` à l'état « non vérifiée », dont l'appelant est l'admin principal, avec les champs saisis (raison sociale, ville principale, téléphone) ; la demande de vérification (dossier KYC) est ouverte dans le même geste.

## Contraintes strictes (métier)

- **Décision structurelle** (contredit le chemin actuel « individuel puis passage en pro sur approbation », et touche ce que l'agence non vérifiée peut faire) : l'ADR s'écrit AVANT (numéro suivant libre), validé par le porteur. À y trancher : ce qu'une agence non vérifiée peut faire avant la vérification (inviter, publier, encaisser — les reversements restent suspendus comme pour toute agence non vérifiée, [ADR-0104](../../../adr/0104-l-identite-legale-de-l-agence-n-a-qu-une-source.md)) ; le sort de l'agence refusée ; la promesse « sous 48 h » (engagement de service de la plateforme, ou phrase retirée).
- La voie actuelle (espace individuel → passage en pro) reste pour qui l'a déjà.
- Unicité : NINEA ou RIB déjà portés par une autre agence → même refus que le passage en pro (TCK-601).

## Delta à produire

- [ ] ADR « l'espace pro de l'orientation est une agence, vérifiée ensuite ».
- [ ] `POST /api/me/agencies` (`MeAgencyController@store`, `StoreOwnAgencyRequest`) : agence + profil d'admin principal + dossier de vérification, dans une transaction.
- [ ] Liste des villes principales servie pour le champ (référentiel géo existant).
- [ ] Tests : `OrientationCreateAgencyTest` (agence `standard` non vérifiée, admin principal = appelant, dossier ouvert, doublon NINEA refusé, appelant déjà admin d'une agence → 409).

## Critères d'acceptation

- [ ] AC1 — Après création, l'appelant a un profil d'admin d'agence **actif** sur une agence `standard`, non vérifiée, dont il est `primary_admin_id`, et une demande de vérification en attente ; aucun espace individuel n'est créé.
- [ ] AC2 — Cette agence peut inviter un agent (route d'invitation 201) ; ses reversements restent bloqués tant qu'elle n'est pas vérifiée (test).
- [ ] AC3 — Un NINEA déjà porté par une autre agence rend 422 avec le code du doublon ; un appelant déjà admin d'une agence rend 409.

## Hors périmètre

- L'écran (TCK-2938).

## Notes d'implémentation

2026-11-15, agent d'implémentation, « valide tes choix » du porteur : à chaque point, l'option la plus sûre, écrite dans l'ADR.

**Décision.** [ADR-0125](../../../adr/0125-l-espace-pro-de-l-orientation-est-une-agence-verifiee-ensuite.md), écrit avant le code. Le numéro 0124 était déjà pris (TCK-2926).

**Livré.**

- `POST /api/me/agencies`, servi par :
  - `MeAgencyController@store` ;
  - `StoreOwnAgencyRequest` (`name`, `geo_city_id`, `phone`, `ninea`) ;
  - `OwnAgencyOpeningService`.
- Une seule transaction, avec la ligne du compte verrouillée. Elle ouvre :
  - l'agence `standard`, `active`, non vérifiée, avec `self_opened_at` ;
  - l'`AgencyAdminProfile` actif, posé comme profil actif (cookie), et un `AgentProfile`, comme l'admin de la console ;
  - le dossier KYC `pending` (`dossierForAgency`) ;
  - l'adresse « Siège » si une ville est donnée.
- 409 `agency.already_admin` ; 422 `agency.phone_unverified` (numéro vérifié exigé, ADR § 2) ; 422 `agency.ninea_taken`. Une agence ouverte en libre-service et jamais vérifiée ne compte pas comme porteuse du NINEA : un squatteur ne bloque pas le vrai titulaire.
- Aucun abonnement posé à l'ouverture : `me/subscription` et `me/quota` répondent 200 (testé).
- La restriction est levée par la PREMIÈRE vérification (`verified_at`). Une agence échue ensuite suit la règle commune.
- Ce que l'agence ne peut pas faire avant sa vérification (ADR § 5) :
  - mettre un bien en ligne : 422 `agency.unverified_publication`, posé dans `PropertyObserver` (`creating` et `updating`, exemption de modération comprise) ;
  - avoir une fiche ou un portefeuille publics : 404, par `Agency::scopeVisibleInPublicDirectory` dans `PublicAgencyController` ;
  - être reversée : règle existante `platform_payout.agency_unverified`, prouvée par un test ;
  - recevoir les crédits de bienvenue : `SpaceCreated` n'est pas déclenché.
- Migration `2026_11_15_293700_add_self_opened_at_to_agencies`.
- Événement d'activité `agency_self_opened`, avec son libellé front (`admin.audit.events.agency_self_opened`).

**Prémisses qui différaient.**

- « Même refus que le passage en pro (TCK-601) » : ce refus n'existe pas. `SharedLegalIdentifierDetector` est un signal pour la revue, jamais un refus. Le 422 est une règle neuve, propre à l'ouverture, faute de revue humaine avant elle (ADR § 3). Le détecteur gagne `nineaHolders()`.
- « Liste des villes servie » : elle existe déjà, `GET /api/public/geo/cities`. Aucune route neuve.
- Le passage en pro n'a jamais posé `is_verified` : une agence `standard` non vérifiée publie aujourd'hui. La restriction ne vise donc que les agences ouvertes en libre-service (`self_opened_at`), pour ne rien changer aux agences de la console ni aux passages en pro.
- L'admin d'agence doit avoir la 2FA pour les actions protégées (`RequireTwoFactor`). L'écran (TCK-2938) doit l'enrôler sur place à sa première 403, comme pour tout admin.

**« Sous 48 h ».** Pas promis (ADR § 8) : aucun délai de revue n'est mesuré ni engagé. L'écran dit « Notre équipe vérifie l'agence », sans délai.

**Mesures.**

- `php artisan test tests/Feature/Onboarding/OrientationCreateAgencyTest.php` : 21 verts (88 assertions), route de publication réelle comprise.
- Onze ablations, chacune rouge sans le correctif :
  - la garde de l'observateur ;
  - la garde sous l'exemption ;
  - le scope public ;
  - le refus du NINEA ;
  - le 409 ;
  - le dossier `pending` ;
  - `is_verified` à vrai (reversements et mise en ligne) ;
  - l'exception du NINEA jamais vérifié ;
  - le numéro vérifié ;
  - le bien déplacé ;
  - la première vérification (`verified_at`).
- Non-régression : `PublicAgencyIsVerifiedTest`, `PublicIndividualSpaceIsNotAnAgencyTest`, `PropertyObserverTest`, `PropertyModerationTest`, `HostAutoOnboardTest` : 34 verts.
