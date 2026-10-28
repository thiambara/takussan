---
id: TCK-2389
title: "Radar : « Publier pour lui » crée l'espace individuel de l'annonceur et publie ses annonces sur un accord confirmé — et les textes juridiques le disent"
status: todo
phase: P1
family: full
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2387, TCK-2388]
blocks: [TCK-2390, TCK-2391, TCK-2394]
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#210-pages-légales-publiques"
  models:
    - "docs/models-spec.md#97-creditwelcomegrant-"
tags: [api, front, radar, publication, onboarding, juridique, adr-0077]
---

## Objectif utilisateur

Le super-admin publie en un geste toutes les annonces qu'un annonceur a accepté de voir sur
Takussan, et l'annonceur se retrouve avec un espace à son nom, joignable par les visiteurs, sans
avoir rien eu à faire.

## Contexte

Chemin rapide décidé par le porteur le 2026-10-26 : l'annonceur répond « OUI » sans cliquer, et le
super-admin publie pour lui en créant son compte. [ADR-0077](../../adr/0077-le-radar.md) §6 ; le
compte est l'espace individuel du bouton « Publier » (`features.md` § 1.12,
`HostIndividualOnboardingService`). Ce ticket pose aussi les clauses juridiques rédigées dans le
[plan](../../plans/2026-10-26-radar-et-socle-ia.md#les-textes-juridiques--clauses-à-poser) : la
règle du dossier `content/legal` veut qu'elles entrent avec le code qu'elles décrivent.

## Contrat de données

- `GET /api/admin/radar/advertisers/{advertiser}/publication-preview` — compte à créer (nom,
  numéro, « Espace de {prénom} »), annonces couvertes par un accord valide, photos récupérables
  par annonce, rapprochements, et le motif de blocage éventuel.
- `POST /api/admin/radar/advertisers/{advertiser}/publish` — `{listing_ids[]}`, sous
  `Idempotency-Key` (ADR-0072) ; rend l'utilisateur, l'espace et les biens créés.
- `GET /api/admin/radar/advertisers/{advertiser}/published-message` — le second message `wa.me`
  (« vos annonces sont en ligne : …, activez votre compte : … »).

## Direction UX / Artistique

Un geste lourd présenté comme tel : un écran de vérification qui dit exactement ce qui va être créé
au nom de quelqu'un (le compte, l'espace, chaque bien avec ses photos) et ce qui alerte (doublons,
photos manquantes), puis une confirmation explicite. Après publication, un récapitulatif avec les
liens publics et le message prêt à envoyer.

## Contraintes strictes (métier)

- **L'API refuse (422) toute annonce qui n'est pas couverte par un accord confirmé et non
  révoqué** de cet annonceur ; l'écran n'est pas la garde.
- **Geste réservé à `super_admin`** : nouveau `PlatformAbility::RadarPublish`.
- **Un numéro qui appartient déjà à un utilisateur** (téléphone principal ou secondaire vérifié,
  ou non) : 422, seule la réclamation est proposée. Le Radar ne touche jamais un compte existant.
- **L'utilisateur est créé sans mot de passe** et son numéro **non vérifié** ; il se connecte par
  code SMS (ADR-0033), ce qui vérifie le numéro.
- **L'espace se crée par `HostIndividualOnboardingService`**, pas par un chemin parallèle.
- **Aucun crédit de bienvenue à la création** : `CreditWelcomeGrant` suit la vérification du
  numéro, comme pour tout le monde.
- **Photos téléchargées avant la transaction** (par le `UrlFetcher`, SSRF compris), puis versées
  à la chaîne des médias, ce qui produit leurs empreintes (ADR-0054). Une annonce sans aucune
  photo récupérable bloque sa publication ; l'opérateur peut en déposer à la main.
- **Une transaction** pour l'utilisateur, l'espace et les biens ; rejouée sous la même clé, la
  requête rend le résultat de la première.
- Le contact principal de chaque bien est le numéro de l'annonceur (`PropertyContact`) : le bouton
  WhatsApp de l'annonce le joint directement.
- `radar_listings.property_id` et l'étape `published` sont écrits ; `properties` ne reçoit aucune
  colonne.
- Acte journalisé au nom du super-admin.
- **Textes juridiques** : l'article 6.3 entre dans `terms.ts`, les ajouts de `privacy.ts` (§ 2.3,
  § 3, précision du § 4.3, § 6, § 9) aussi, en `fr` et `en`, et `VERSION_DOCUMENTS` avance. Le
  texte est celui du plan, les passages ⚠ y restent marqués pour la relecture de l'avocat.

**Héritées de TCK-2388** (démarchage et preuve d'accord) :

- La couverture d'une annonce se lit par `App\Services\Radar\RadarConsentCoverage`
  (`coveredListingIds()`, `coveredAmong()`) : un accord **confirmé et non révoqué**
  (`RadarConsent::scopeValid()`) ; c'est elle que le refus 422 ci-dessus interroge.
- Un annonceur `do_not_contact` n'a plus d'accord valide : le STOP révoque ses accords
  (`revoked_at`) et ferme ses annonces.
- Le contact principal du bien est `radar_advertisers.phone` (E.164 compact).

## Delta à produire

- [ ] `PlatformAbility::RadarPublish`.
- [ ] `App\Services\Radar\AdvertiserProvisioner` (refus d'un numéro inscrit, utilisateur sans mot
      de passe, appel de `HostIndividualOnboardingService`).
- [ ] `App\Services\Radar\RadarPublisher` (contrôle des accords, photos d'abord, transaction,
      biens, contact principal, liens Radar).
- [ ] Contrôleur `RadarPublicationController` · FormRequest `PublishRadarListingsRequest` · route
      sous le middleware d'idempotence.
- [ ] `takussan-web/src/content/legal/terms.ts` (article 6.3, `fr` et `en`), `privacy.ts`
      (ajouts), `editeur.ts` (`VERSION_DOCUMENTS`) ; `__tests__/textes.test.ts` vert.
- [ ] Front : écran de vérification, confirmation, récapitulatif et second message.
- [ ] Tests : `RadarPublishTest` (sans accord ⇒ 422 ; accord révoqué ⇒ 422 ; annonce hors du
      message ⇒ 422 ; numéro inscrit ⇒ 422 ; `support` ⇒ 403 ; rejeu idempotent ⇒ un seul
      compte), `AdvertiserProvisionerTest` (sans mot de passe, numéro non vérifié, espace
      `individual`, présenté `owner` par `PublicProfileFacts::rolesPublics`, aucun
      `CreditWelcomeGrant`), `RadarPublisherPhotosTest` (aucune photo ⇒ bloqué ; photos dans les
      médias avec empreinte).

## Critères d'acceptation

- [ ] AC1 — Sans accord confirmé couvrant chaque annonce demandée, `publish` rend 422 et rien n'est
      créé.
- [ ] AC2 — Avec accord : un utilisateur sans mot de passe, un espace `individual`, un bien publié
      par annonce, chacun avec le numéro de l'annonceur pour contact principal.
- [ ] AC3 — Aucun `CreditWelcomeGrant` n'existe après la publication ; il apparaît à la première
      vérification du numéro.
- [ ] AC4 — Deux requêtes sous la même `Idempotency-Key` créent un seul compte.
- [ ] AC5 — Un numéro déjà porté par un utilisateur rend 422 sans rien modifier de ce compte.
- [ ] AC6 — La page `/fr/legal/terms` affiche l'article 6.3 et la date de version avancée.

## Hors périmètre

- La réclamation par l'annonceur (TCK-2390), la révocation (TCK-2391).
- La publication sous mandat Takussan (TCK-2394).

## Notes d'implémentation

_(à remplir par implementing-specs)_
