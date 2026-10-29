---
id: TCK-2389
title: "Radar : « Publier pour lui » crée l'espace individuel de l'annonceur et publie ses annonces sur un accord confirmé — et les textes juridiques le disent"
status: done
phase: P1
family: full
estimate: L
wave: 80
created: 2026-10-26
updated: 2026-10-29
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

## Décisions du porteur (2026-10-29)

1. **a** — La connexion par code SMS ouvre le compte créé par le Radar : amendement étroit
   d'[ADR-0033](../../adr/0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) §3, écrit
   avant le code. Sans lui, la contrainte 2 d'ADR-0033 ouvrait un compte neuf et vide à
   l'annonceur, et ses annonces restaient hors de portée.
2. **a** — Les textes juridiques entrent en entier ; ce qu'ils promettent et que ce ticket ne
   fait pas encore (retrait sans délai sur STOP, durées de conservation : TCK-2391 ; conditions
   présentées à l'activation : TCK-2390) est porté par ces tickets et inscrit à « Avant la mise en
   production » du `README` de `content/legal`.
3. **a** — Les photos se préparent avant la publication : l'accord confirmé met en file leur
   téléchargement dans une réserve privée de l'annonce (`radar_photos`, `photo_preparation`) ;
   l'opérateur peut en retirer, en déposer, ou relancer. `publish` ne fait aucun appel réseau :
   il copie la réserve dans `photos` (empreintes d'ADR-0054). Spec : PR #1580.
4. **a** — Un contact sur place qui répète un numéro déjà servi n'est pas servi deux fois
   (`PropertyContactNumbers`). Spec : PR #1580.
5. **a** — Une annonce relue sans titre se publie quand même : le titre se construit des champs
   structurés (type, chambres, contrat, quartier — « Appartement 3 chambres à louer — Almadies »)
   et l'aperçu le montre avant la confirmation. Sans cela, la relecture (qui n'exige pas le titre)
   menait à une impasse au moment de publier.

## Contrat de données

- `GET /api/admin/radar/advertisers/{advertiser}/publication-preview` — compte à créer (nom,
  numéro, « Espace de {prénom} »), annonces couvertes par un accord valide, photos récupérables
  par annonce, rapprochements, et le motif de blocage éventuel.
- `POST /api/admin/radar/advertisers/{advertiser}/publish` — `{listing_ids[]}`, sous
  `Idempotency-Key` (ADR-0072) ; rend l'utilisateur, l'espace et les biens créés.
- La réserve de photos d'une annonce (décision 3) : `POST /api/admin/radar/listings/{listing}/photos/fetch`
  (relance le téléchargement), `POST …/listings/{listing}/photos` (dépôt multipart),
  `DELETE …/listings/{listing}/photos/{media}` ; l'aperçu de publication la rend.
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

- [x] Amendement d'ADR-0033 §3 (décision 1), et `PhoneLoginService` qui ouvre le compte créé par le
      Radar · `PhoneLoginRadarAccountTest`.
- [x] La réserve de photos (décision 3) : migration `photo_preparation`, collection `radar_photos`,
      job `PrepareRadarListingPhotos` mis en file par l'accord confirmé, routes de relance, dépôt
      et retrait · `RadarPhotoReserveTest`.
- [x] `PropertyContactNumbers` : un numéro servi une seule fois (décision 4).
- [x] `PlatformAbility::RadarPublish`.
- [x] `App\Services\Radar\AdvertiserProvisioner` (refus d'un numéro inscrit, utilisateur sans mot
      de passe, appel de `HostIndividualOnboardingService`).
- [x] `App\Services\Radar\RadarPublisher` (contrôle des accords, photos d'abord, transaction,
      biens, contact principal, liens Radar).
- [x] Contrôleur `RadarPublicationController` · FormRequest `PublishRadarListingsRequest` · route
      sous le middleware d'idempotence.
- [x] `takussan-web/src/content/legal/terms.ts` (article 6.3, `fr` et `en`), `privacy.ts`
      (ajouts), `editeur.ts` (`VERSION_DOCUMENTS`) ; `__tests__/textes.test.ts` vert ;
      `PublishReadiness::TERMS_VERSION` suit ; `README.md` (« Avant la mise en production »).
- [x] Front : écran de vérification, confirmation, récapitulatif et second message.
- [x] Tests : `RadarPublishTest` (sans accord ⇒ 422 ; accord révoqué ⇒ 422 ; annonce hors du
      message ⇒ 422 ; numéro inscrit ⇒ 422 ; `support` ⇒ 403 ; rejeu idempotent ⇒ un seul
      compte), `AdvertiserProvisionerTest` (sans mot de passe, numéro non vérifié, espace
      `individual`, présenté `owner` par `PublicProfileFacts::rolesPublics`, aucun
      `CreditWelcomeGrant`), `RadarPublisherPhotosTest` (aucune photo ⇒ bloqué ; photos dans les
      médias avec empreinte).

## Critères d'acceptation

- [x] AC1 — Sans accord confirmé couvrant chaque annonce demandée, `publish` rend 422 et rien n'est
      créé.
- [x] AC2 — Avec accord : un utilisateur sans mot de passe, un espace `individual`, un bien publié
      par annonce, chacun avec le numéro de l'annonceur pour contact principal.
- [x] AC3 — Aucun `CreditWelcomeGrant` n'existe après la publication ; il apparaît à la première
      vérification du numéro.
- [x] AC4 — Deux requêtes sous la même `Idempotency-Key` créent un seul compte.
- [x] AC5 — Un numéro déjà porté par un utilisateur rend 422 sans rien modifier de ce compte.
- [x] AC6 — La page `/fr/legal/terms` affiche l'article 6.3 et la date de version avancée.

## Hors périmètre

- La réclamation par l'annonceur (TCK-2390), la révocation (TCK-2391).
- La publication sous mandat Takussan (TCK-2394).

## Notes d'implémentation

- **Deux portes fermées à la publication, et pourquoi.** `RadarPublisher` refuse (bloquant de
  l'aperçu, 422 de `publish`, et refus du second message) quand :
  - la connexion par téléphone est éteinte (`radar.publish.activation_unavailable`) : le compte créé
    n'a ni mot de passe ni e-mail, donc personne ne pourrait l'ouvrir ;
  - l'aperçu des codes OTP est actif hors de `APP_ENV=local` (`radar.publish.otp_preview_active`,
    décision du porteur du 2026-10-29) : quiconque connaît le numéro public de l'annonceur ouvrirait
    son compte.

  En préproduction, `OTP_PREVIEW_ENABLED` doit donc être éteint pour publier.
- **Le plafond de photos est une borne d'horloge, pas de goût.** `publish` copie la réserve et
  génère les vignettes dans sa transaction ; `docker/php.ini` fixe `max_execution_time = 60`, et
  l'image ZTS le compte en temps réel. Au-delà, l'erreur fatale saute `catch` et `finally` et
  laisse des fichiers. `radar.publish.max_photos` (30, somme des annonces d'une requête) est vérifié
  avant la première écriture (`radar.publish.too_many_photos`). La valeur n'est pas encore mesurée
  sur la préproduction.
- **Le titre construit (décision 5)** a une seule source, `RadarListingTitle::resolve()`, que
  l'aperçu et `createProperty()` appellent tous deux. Il est construit en français (c'est une donnée
  du bien) et n'est pas dédoublonné : deux annonces de même type, chambres, contrat et quartier
  portent le même titre, et seuls leurs slugs les distinguent.
- **Annonces acceptées avant le déploiement** : elles n'ont pas de réserve préparée
  (`photo_preparation` nul). L'écran offre « Récupérer les photos » ; aucune commande de rattrapage.
  La relance libère le verrou d'unicité du job (6 h) avant de le remettre en file : sans cela, une
  ligne de file détruite à la main la ferait ignorer sans le dire. C'est sûr, car
  `WithoutOverlapping` et le rang attendu sous verrou empêchent une double passe.
- **Front.** Le relais BFF attend 90 s pour la seule route `publish`. Un 409
  `idempotency.in_progress` est rejoué 8 × 3 s, ce qui peut tenir la confirmation ouverte environ
  21 s.
- **`PublishReadiness::TERMS_VERSION` avance** avec les textes : chaque hôte réaccepte les conditions
  à sa prochaine publication. C'est voulu.
- **Restes acceptés** (revue finale) :
  - une connexion par code simultanée à la transaction de publication peut créer un second compte
    au même numéro. La fenêtre est étroite ; un `pg_advisory_xact_lock` sur la forme canonique du
    numéro, pris des deux côtés, la fermerait ;
  - aucun test ne fixe qu'un compte supprimé (doux) portant le numéro n'empêche pas la publication
    (la portée `SoftDeletes` le garantit aujourd'hui).
- **Suites écrites ailleurs** :
  - dans TCK-2390 : le compte orphelin quand le titulaire vérifie son numéro sur un autre compte,
    et le nom d'espace tiré du `display_name` ;
  - dans TCK-2391 : les fichiers sans ligne `media` (de la réserve et des copies), et « retirer un
    compte Radar = le supprimer, pas le bloquer ».
