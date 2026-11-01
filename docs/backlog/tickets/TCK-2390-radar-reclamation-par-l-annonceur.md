---
id: TCK-2390
title: "Radar : l'annonceur réclame ses annonces depuis le lien du message, par code SMS à son numéro"
status: done
phase: P1
family: full
estimate: M
wave: 80
created: 2026-10-26
updated: 2026-10-29
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
  fait dans **l'espace individuel de cet utilisateur — l'existant, ou un neuf nommé sur la page** ;
  jamais sans sa connexion. *(« à son choix » retiré : décision 4a ci-dessous.)*
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

- [x] Héritée de TCK-2389 : l'annonceur dont les annonces ont été publiées pour lui a déjà un compte
      (`radar_advertisers.user_id`, sans mot de passe, numéro non vérifié), que la connexion par code
      SMS ouvre (amendement d'ADR-0033 §3). La page l'active : elle lui **présente les conditions
      d'utilisation pour acceptation**, comme l'article 6.3 de `terms.ts` le promet depuis
      TCK-2389 (décision 2a du porteur, 2026-10-29). Le même article promet que l'on peut aussi
      accepter **« en suivant le lien qu'il contient »** : le message d'accord en vigueur (`accord.v1`)
      ne porte que le lien des conditions, qui n'accepte rien ; ce ticket rend cette phrase vraie par le
      lien de réclamation signé (`{lien_reclamation}`). Il retire ensuite cette ligne de « Avant la mise
      en production » du `README` de `content/legal`.
- [x] Héritée de la revue finale de TCK-2389, **le compte Radar orphelin** : le compte A créé pour
      l'annonceur n'a jamais été activé, puis le vrai titulaire du numéro le vérifie sur un **autre**
      compte B (inscription par e-mail, puis numéro vérifié au profil ; l'index partiel
      `users_phone_verified_unique` ne voit pas A, non vérifié). La connexion par code ouvre alors B,
      A et ses biens deviennent inaccessibles, et une seconde publication verse encore dans A
      (`AdvertiserProvisioner::phoneRegistered()` rend `false` dès que `user_id` est posé). La
      réclamation doit voir ce cas, comme le « numéro déjà inscrit » : connexion exigée, puis rattacher
      à B les biens de A (ou le proposer).
- [x] Héritée de la revue finale de TCK-2389, **le nom de l'espace** : « Espace de {prénom} » prend
      le premier mot du `display_name` (profil WhatsApp ou signature d'annonce : « Agence Immo
      Dakar » ⇒ « Espace de Agence »), servi publiquement. L'aperçu de publication le montre sans
      permettre de le corriger. L'activation propose à l'annonceur de corriger son prénom et le nom
      de son espace.

- [x] `App\Services\Radar\ClaimLinks` (signature, expiration, révocation).
- [x] Contrôleur public `App\Http\Controllers\Public\RadarClaimController` · FormRequests
      `RequestRadarClaimOtpRequest`, `ConfirmRadarClaimRequest` · routes publiques limitées en
      fréquence.
- [x] Front : page publique de réclamation, localisée (`/[locale]/…`), `noindex`.
- [x] Tests : `RadarClaimTest` (lien expiré, révoqué, après STOP ⇒ refus ; la réponse ne contient
      ni le numéro complet ni la nature ; le code part au numéro de l'annonceur ; confirmation ⇒
      preuve `otp` + conditions acceptées ; numéro inscrit ⇒ connexion exigée).

## Critères d'acceptation

- [x] AC1 — `GET /api/radar/claims/{token}` ne contient ni le numéro en clair ni aucun champ de
      nature ou de verdict.
- [x] AC2 — Après STOP, le lien rend 410.
- [x] AC3 — Une confirmation réussie publie les annonces retenues, enregistre une preuve `otp` et
      l'acceptation des conditions avec leur version.
- [x] AC4 — Pour un annonceur déjà publié pour lui, la confirmation active le compte (numéro
      vérifié) et le crédit de bienvenue est attribué.

## Hors périmètre

- La relance d'activation (TCK-2394).

## Décisions du porteur (2026-10-29)

Posées en réponse aux sept points de l'implémentation ; les recommandations sont retenues, la 5 sous condition.

1. **a** — Le lien vit 30 jours (`radar.claim.link_ttl_days`), réutilisable jusqu'à son expiration.
2. **a** — La confirmation ouvre le compte, crée l'espace, date les conditions, enregistre la preuve `otp` et passe les
   annonces à `consented` ; un job publie ensuite, une fois les photos prêtes, et une annonce bloquée revient au
   super-admin. Le job est **idempotent** (rejoué, il ne publie pas deux fois) et ne publie **jamais sans un accord `otp`
   valide au moment où il s'exécute** : un STOP entre-temps arrête tout.
3. **a** — Les annonces décochées passent `refused` (`radar.claim.declined`).
4. **a** — Pas de choix d'espace : l'espace existant, ou un neuf nommé sur la page. **Corrige « un espace individuel neuf
   ou existant de cet utilisateur, à son choix »** des contraintes ci-dessus : l'invariant « un espace par administrateur
   principal » de `HostIndividualOnboardingService::autoOnboard()` ne laisse pas de choix.
5. **a, sous condition** — Les biens du compte orphelin A passent au compte B, puis A et son espace vide se suppriment
   (suppression douce, dans la même transaction, journalisée), **seulement si A n'a jamais été activé** :
   `phone_verified_at` nul ; aucune connexion (ni jeton Sanctum, ni session) ; pas de mot de passe ; aucun bien, espace
   ou adhésion autre que ceux du Radar. Sinon rien ne se déplace, la page signale le cas et le support tranche. Les
   deux branches sont testées, avec l'ablation de la condition, et ce que le déplacement laisse derrière lui
   (prospects, conversations) est vérifié.
6. **a** — Formulation neutre « votre ou vos annonces », marquée ⚠ pour la relecture de l'avocat.
7. **a** — Se corrigent : le titre, le prix et la description de chaque annonce, le prénom et le nom de l'espace.

Choix techniques acceptés : les deux portes de la publication, `publie.v2`, le lien réutilisable jusqu'à expiration, la
portée `login` des codes.

## Notes d'implémentation

- **Le jeton n'est stocké nulle part** (`ClaimLinks`) : `{annonceur}.{émis_à}.{HMAC-SHA256 tronqué à
  128 bits}`, clé dérivée d'`app.key`. L'expiration se calcule à la lecture
  (`radar.claim.link_ttl_days`, 30 jours) ; la révocation se lit dans l'état existant —
  `do_not_contact_at`, un `radar_consents.revoked_at`, ou le numéro purgé —, sans rien supposer du
  code de TCK-2391. `émis_à` est le `created_at` du message : le texte enregistré, son lien `wa.me` et
  l'aperçu de la console se recomposent donc sur la même chaîne. Jeton faux, annonceur inconnu ou
  émission dans le futur : 404 `radar.claim.invalid` indistinct (rien ne s'énumère).
- **`publie.v2` remplace `{lien_activation}` par `{lien_reclamation}`** : la page de réclamation
  active aussi le compte préparé par le Radar (état `activation`, sélection vide admise). `accord.v2`
  passe au neutre (« votre ou vos annonces »). Les messages déjà envoyés gardent leur version ; les
  tests qui fabriquent un message v1 l'épinglent.
- **Limites de fréquence — comme la connexion par téléphone, et en plus d'elle** (corrigé après la
  vérification adverse M-4 : la première version de cette note annonçait à tort « un seau par
  jeton ») : chaque route a un seau **par IP** (`throttle:30,1` la lecture, `6,1` l'envoi, `10,1`
  la confirmation), ET les seaux de la connexion par téléphone — `auth-phone-send` par réseau client
  à l'envoi, `auth-phone-verify` **par numéro** de l'annonceur à la confirmation
  (`AppServiceProvider::phoneRateLimitKey` lit le numéro par `ClaimLinks::phoneOf()`). C'est la
  limitation de `/auth/phone/*` (envoi par réseau, vérification par numéro), plus une borne par
  route : un même numéro ne gagne aucun essai en passant par la page plutôt que par `/auth/login`.
  Choix assumé : pas de seau par jeton — un jeton est signé, rien ne s'énumère, et un seau par jeton
  ne bornerait pas celui qui en détient plusieurs. Le prix : des annonceurs derrière le même CGNAT
  mobile partagent les 30 lectures par minute.
- **Courses** (vérification adverse M-2) : les trois gardes qui ne servent qu'en cas de course ont
  chacune un test déterministe, sans parallélisme réel. Un `DB::listen` joue le geste concurrent
  juste après une requête `… for update` de `claim()` : le rejugement de l'orphelin (un profil
  ailleurs, l'espace suspendu, le compte bloqué, après le verrou de l'annonceur) et le STOP relu sous
  verrou (`do_not_contact_at` posé après le verrou des annonces, donc AVANT celui de l'annonceur, dont
  la ligne est déjà lue quand le crochet s'exécute). `account_changed` se teste au début de la
  transaction de la confirmation (`TransactionBeginning`) : un compte vérifie le numéro entre la
  lecture de l'état `new` et l'ouverture de session.
- **Le nom affiché ne fait pas sortir le numéro** (vérification adverse I-1) :
  `RadarPublisher::displayNameWithoutPhone()` retire du `display_name` ce que `PhoneMasker` reconnaît,
  pour la page (`first_name`, `space_name` ; `last_name` n'est plus rendu), le compte créé par
  « Publier pour lui » et le nom de son espace ; la confirmation refuse un prénom ou un nom d'espace
  qui porte un numéro : 422 `radar.claim.name_contains_phone` avec les champs en cause (`fields`), que
  la page affiche sous chacun (le front possède le texte) ; elle prévient avant le SMS dès huit
  chiffres d'affilée, le masqueur de l'API restant le juge. Même limite que le masqueur (M-1, TCK-2410).
- **Une annonce réclamée attend le job sans se reproposer** (contrôle au navigateur) : couverte par une
  preuve `otp` valide et encore `consented`, elle sort des annonces proposées (`listings`) pour
  `publishing` — « en cours de publication », sans case ni bouton —, et une seconde confirmation qui la
  nomme rend 422 `radar.claim.listing_unavailable`, sans second job ni seconde preuve. Le job était
  déjà idempotent au rejeu ; deux jobs qui lisent l'annonce `consented` en même temps n'en publient
  qu'un : le second s'arrête sous le verrou (`radar.listing.stage_conflict`, testé). Une annonce que le
  job laisse à l'opérateur (photos ou champs manquants) reste affichée « en cours de publication »
  jusqu'à ce que l'opérateur la publie ou la close.
- **Le jeton dans `?redirect=`** (vérification adverse M-5) : `/auth/*` sert aussi
  `Referrer-Policy: no-referrer` quand `redirect` vise `/claim/…` (`has` de `next.config.ts`), sans
  changer la politique des autres pages de connexion.
- **Qui confirme** : un numéro vérifié sur un compte (`existing`) se confirme CONNECTÉ à ce compte
  — `PhoneLoginService::checkCode()` prouve le numéro sans émettre de jeton ; le mot de passe et le
  second facteur ne se contournent pas par la page. Compte neuf ou compte du Radar : visiteur anonyme
  seulement (une autre session ⇒ 403 `wrong_account`, dès l'envoi du code : aucun SMS ne part pour une
  confirmation qui serait refusée), `PhoneLoginService::authenticate()` ouvre la
  session. Dans la transaction, l'API rejuge que le compte ouvert est celui que la page annonçait
  (409 `account_changed`).
- **« Espace neuf ou existant, à son choix » n'est pas tenu** : l'invariant « un espace par
  administrateur principal » de `HostIndividualOnboardingService::autoOnboard()` ne laisse pas de
  choix. La page nomme l'espace existant ; le nom proposé d'un espace neuf (et le prénom) se
  corrigent sur la page, et renomment l'espace s'il vient d'être créé ou en état `activation`.
- **Compte orphelin (décision 5a)** : `AdvertiserProvisioner` refuse de publier encore dans le compte A
  dès qu'un autre compte B a vérifié le numéro (422 `radar.advertiser.phone_registered`). A « n'a
  jamais servi » se juge sur plus que les quatre critères de la décision, parce que chacun est une
  trace d'usage : ni numéro vérifié, ni `last_login_at`, ni jeton Sanctum, ni session (`sessions`), ni `password_set_at`, ni
  e-mail, ni bien hors de ceux du Radar pour cet annonceur, ni second espace, ni profil dans une autre
  agence, ni autre membre dans son espace, ni profil de prestataire ou de plateforme. Alors la
  réclamation par B déplace les biens de A et ce que les visiteurs y ont laissé — demandes de contact
  (agence, destinataire), prospects de son espace, visites, réservations, empreintes de photos,
  collaborations, conversations (B prend la place de A, ou A se retire où B est déjà) —, puis supprime
  (doucement) les profils de A, son espace et A, dans la transaction de la réclamation, journalisé
  (`radar_orphan_absorbed`). Un compte A bloqué, supprimé, ou dont un espace est suspendu ne se
  réunit pas non plus (vérification adverse I-2 : ses biens modérés reviendraient en ligne dans
  l'espace de B) — la règle d'`AdvertiserProvisioner::accountUnavailable()`. Sinon : état `support`, 409
  `radar.claim.support_required` à l'envoi du code comme à la confirmation, rien ne bouge. Rejugé
  sous le verrou de l'annonceur. *Non déplacé* : baux et demandes de maintenance (impossibles sans
  connexion), notifications de A (restent sur le compte supprimé).
- **Le job ne publie que sur l'accord `otp` de l'annonceur** (décision 2a) :
  `RadarConsentCoverage::coveredByOtpAmong()` relu sous verrou dans `publishClaimed` — un accord par
  capture qui couvrirait encore l'annonce ne suffit pas — et le job s'arrête net (sans attendre les
  photos) dès que `ClaimLinks::revoked()` est vrai.
- **La publication passe par un job** (`PublishClaimedRadarListings`, `afterCommit`) : les photos
  d'une annonce-URL ne se téléchargent qu'après l'accord (`PrepareRadarListingPhotos`, décision 3a),
  le job attend leur préparation en se relâchant, publie ce qui est prêt par lots sous
  `radar.publish.max_photos`, laisse le reste `consented` à l'opérateur, journalise un refus par son
  code. Une annonce décochée passe `refused` (`stage_reason` `radar.claim.declined`).
- **Preuve `otp`** : une ligne `radar_consents` par dernier message ENVOYÉ couvrant les annonces
  retenues (la couverture est par message, `RadarConsentCoverage`) ; sans annonce retenue
  (activation), le dernier message envoyé. Les conditions passent par `PublishReadiness::recordTerms`
  — l'inscription ne les enregistre pas, c'est le mécanisme existant.
- **Front** : `apiRequest` (préfixe `/api` écrit) avec le jeton de `useAuth()`, pour que le titulaire
  connecté compte ; seules les corrections partent (un texte laissé tel quel garde côté serveur le
  numéro que la page ne voit que masqué), et une correction qui garde `[TELEPHONE]` est arrêtée avant
  l'appel. Chaque code `radar.claim.*` a son libellé (`ERREURS_RECLAMATION_RADAR`, gardée par
  `codes-radar.tck-2387.test.ts`).
- **Reste ouvert** : la connexion ordinaire active aussi le compte du Radar sans présenter les
  conditions — TCK-2404, et la ligne du `README` de `content/legal` pointe désormais vers lui.

## Suites

- **Compte du Radar supprimé** : tant que `radar_advertisers.user_id` vise un compte A supprimé
  (doucement), la page rend `support` (B6, voulu : un compte supprimé par le support n'est pas
  « jamais servi ») et B ne peut plus rien réclamer — or **aucun outil du support ne remet ce champ à
  zéro**. Il faut un geste (console Radar, ou la suppression du compte qui libère l'annonceur).
- **Séparateurs du nom affiché** : `_`, `,` et `( )` entre les chiffres d'un numéro échappent au
  masqueur dans le `display_name` comme dans la description — à traiter avec le masqueur (TCK-2410).
- **L'annonce que le job laisse à l'opérateur** reste « en cours de publication » sur la page sans
  dire qu'elle attend l'opérateur.
