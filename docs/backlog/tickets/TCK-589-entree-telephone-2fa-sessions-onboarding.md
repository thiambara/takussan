---
id: TCK-589
title: "Le code SMS ne part vers aucun numéro, un compte bloqué se reconnecte et les sessions n'expirent jamais : connexion par téléphone, 2FA là où l'argent circule, sessions bornées, onboarding qui dit vrai"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
    - docs/features.md#29-administration--configuration
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#48-invitation-
tags: [back, front, auth, otp, sms, 2fa, sessions, onboarding, invitations, sécurité, adr-requise]
---

## Objectif utilisateur

- **Visiteur / client** : entrer avec son seul numéro de téléphone et un code reçu par SMS, et
  retrouver après l'inscription le bien qu'il voulait réserver.
- **Prestataire, bailleur, agent invités** : recevoir l'invitation par SMS quand ils n'ont pas
  d'e-mail, puis finir leur onboarding (l'étape « code SMS » est aujourd'hui infranchissable).
- **Admin d'agence / super-admin** : ne pas pouvoir émettre un reversement, toucher une
  intégration ou la console plateforme sans second facteur, sur une session qui a une fin.
- **Agent, bailleur, admin qui démarre** : voir ce qu'il peut réellement faire, revenir sur le bon
  profil, savoir ce qui reste à faire pour mettre l'agence en service.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 — points V6, V7 (visiteur), C10 (client), P9
(prestataire), AD8, AD19 (admin d'agence), S4, S9 (super-admin), O16 (propriétaire), A20 (agent).
**Chaque constat a été re-mesuré sur `e3ab4a4e`** ; trois défauts graves, absents des rapports,
ont été trouvés en le faisant (1.1, 4.1, 4.2).

### 1. Le code de vérification du téléphone n'est envoyé à personne

1.1 Les rapports affirment que « l'envoi d'un code par SMS existe déjà ». **C'est faux** :
`PhoneVerificationService::sendSms()` est un pilote `log-stub` qui écrit le code dans le journal
(`app/Services/Auth/PhoneVerificationService.php:74-84`), et aucun binding ne le remplace (grep).
Le relais SMS réel existe (`SmsRouterDriver`, pilotes Mtarget / LAfricaMobile / Orange), mais
n'est pas branché sur l'OTP. TCK-537 l'avait noté parmi ses écarts hors politique.
1.2 Conséquence : en `production`, `sendOtp()` ne rend pas le code (`:54`) et rien ne l'envoie ;
or les onboardings bailleur, agent, prestataire et hôte **exigent** un téléphone vérifié
(`app/Services/Onboarding/OwnerOnboardingService.php:42-58`). L'étape est infranchissable.
1.3 Hors `production`, les quatre services acceptent un **code fixe `123456`**
(`AgentOnboardingService.php:100`, `OwnerOnboardingService.php:104`,
`ServiceProviderOnboardingService.php:110`, `HostIndividualOnboardingService.php:146`) — le
commentaire dit « local/testing », la garde dit `! production`, et vaut donc pour toute
préproduction. Une connexion par téléphone bâtie sur ce service hériterait de ce contournement.
1.4 `SmsChannel` ne peut pas porter un code : il refuse tout envoi vers un utilisateur dont
`phone_verified_at` est nul, même critique (`app/Notifications/Channels/SmsChannel.php:58-60`).

### 2. Connexion et inscription par e-mail seulement (V7, C10)

- `LoginRequest` exige `email` (`app/Http/Requests/Auth/LoginRequest.php:25`), la connexion cherche
  par e-mail (`AuthController.php:48`), l'inscription exige un e-mail unique
  (`RegisterRequest.php:27`). Les routes `phone/send-otp` / `verify-otp` sont **authentifiées**
  (`routes/api/auth.php:38,57-60`) : elles vérifient le numéro d'un compte, elles ne connectent pas.
- `users.email` est `NOT NULL` (`database/migrations/0001_01_01_000000_create_users_table.php:17`)
  alors que `docs/models-spec.md` le déclare nullable ; `users.phone` n'a **aucune unicité**
  (`2026_04_15_210400_add_fields_to_users_table.php:23`) : un même numéro peut figurer sur
  plusieurs comptes aujourd'hui.
- Aucun verrou par compte : `metadata.locked_at` / `failed_login_attempts` ne sont **écrits par
  personne** — seul `UserSupportService::unlock` les lit (`app/Services/Admin/UserSupportService.php:28-39`).
  La connexion n'est bornée que par IP (`throttle:5,10`, `routes/api/auth.php:27`).

### 3. Invitations par e-mail seulement (P9)

`invitations.email` est `NOT NULL` (`2026_05_10_000001_create_invitations_table.php:24`) ;
`InviteAgentRequest:26`, `InviteOwnerRequest:25`, `InviteServiceProviderRequest:25` exigent
l'e-mail, et le téléphone n'y est qu'un `nullable|string|max:30` **sans** `TelephoneJoignable`.
L'envoi, la relance et le rappel passent par `Mail::to()` seul (`InvitationService.php:219, 388, 460`).

### 4. Entrée et sortie de session

4.1 **Un compte bloqué se reconnecte.** `UserAdminController::block` pose `status = blocked` et
supprime les jetons (`UserAdminController.php:73-74`), mais `AuthController::login` ne lit jamais
`status` (`:46-99`) — grep `UserStatus` : aucun lecteur à l'authentification. Le mot de passe
suffit à rouvrir une session.
4.2 **L'inscription ne connecte pas (V6 aggravé).** `register` ne rend pas de jeton
(`AuthController.php:40-43`, retiré par `a4c01808` « user must verify email first », et gardé par
`AuthRegistrationTest.php:29`). Le front appelle pourtant `openSession(token, user)` avec un jeton
`undefined` (`takussan-web/src/app/(auth)/auth/register/page.tsx:49-54`) ; `set-token` sans jeton
**efface** le cookie (`src/app/api/auth/set-token/route.ts:17-19`) ; « Renvoyer » sur
`/auth/verify-email` échoue en `missingToken` (`src/app/actions/auth.ts:12-17`). Et la
justification ne tient pas : aucune route n'exige `email_verified_at` (grep `verified`), le même
utilisateur se connecte aussitôt par `/auth/login`.
4.3 **Le bien est perdu (V6).** La boîte de réservation anonyme ne propose que « Se connecter »
(`properties/[slug]/components/PropertyReservationDialog.tsx:49-70`) ; le lien « Créer un compte »
de la connexion n'emporte pas `redirect` (`(auth)/auth/login/page.tsx:278-283`) ; l'inscription
envoie sur `/auth/verify-email` (`register/page.tsx:54`), qui n'en lit pas.
4.4 **Jetons sans fin (S9, TCK-537).** `config/sanctum.php:53` → `'expiration' => null` ; les trois
`createToken()` de connexion ne posent pas d'`expires_at` (`AuthController.php:93`,
`OAuthController.php:66`, `AbstractOAuthController.php:105`) ; seul l'impersonation en pose un.
Le cookie vit 7 jours (`set-token/route.ts:5`) ; aucun `sanctum:prune-expired` planifié.
`platform.session_max_minutes` est déclaré (`app/Domain/Settings/EditablePlatformSettings.php:95`)
et lu par personne. Le seul step-up du dépôt est celui de la suppression de compte
(`DeletionStepUpService`).

### 5. 2FA facultative partout, même pour l'argent (S4, AD8)

- `EnsureSuperAdmin` ne vérifie que le profil (`app/Http/Middleware/EnsureSuperAdmin.php:26-38`) ;
  le front ne teste que `force_2fa_at_first_login` (`(super-admin)/super-admin/layout.tsx:48`).
- `TwoFactorController::disable` accepte **le seul mot de passe** (`:94-119`), pour tout le monde.
  Une entrée `updated` générique est écrite par `LogsActivity` (`User.php:42, 324`) — mais aucun
  événement nommé, aucune alerte.
- `force_2fa_reconfigure`, posé par la réinitialisation du support (`UserSupportService.php:48`),
  n'est lu **nulle part** (grep `app/`, `routes/`, `config/`, `takussan-web/src`).
- `GET /two-factor/recovery-codes` et `.../regenerate` (`routes/api/auth.php:72-73`) rendent les
  codes de secours sans confirmation : une session volée suffit à contourner le TOTP.
- `app/Http/Middleware/` ne contient aucun middleware d'exigence 2FA. L'onboarding admin propose
  la 2FA en `mode="recommended"` avec `onSkip` (`components/onboarding/AgencyAdminOnboardingWizard.tsx:106-110`).
  Celui qui émet des reversements et gère les clés Wave/OM peut s'en passer.

### 6. Onboarding qui ne dit pas vrai (O16, A20, AD19)

- **Reprise sur le mauvais profil** — les liens de reprise portent l'identifiant du profil
  (`src/lib/wizard-drafts.ts:130, 139, 147` : `?owner=`, `?agent=`, `?sp=`), mais les trois pages
  prennent le PREMIER profil du type sans lire `searchParams` (`app/onboarding/owner/page.tsx:40`,
  `agent/page.tsx:40`, `service-provider/page.tsx:47`). Invité par une deuxième agence, on est
  renvoyé sur le profil déjà finalisé de la première.
- **Capacités inventées** — `agent/page.tsx:45-50` avoue ne jamais passer `invitedRole` ; le récap
  retombe sur `ROLE_PERMISSIONS.agent`, une table écrite en dur
  (`components/onboarding/AgentOnboardingWizard.tsx:554-575, 604-605`) qui annonce
  `create_visits` et ignore les rôles personnalisés. `GET /api/me/capabilities?agency_id=` existe
  (`routes/api/me.php:35`), et les libellés aussi (`admin.roles.capabilities.*`).
- **Aucune mise en service** — l'onboarding admin tient en deux étapes sans état
  (`AgencyAdminOnboardingWizard.tsx:17-26`) ; la seule relance est `BrandingBanner`, sur `/app`
  (`app/(dashboard)/app/(accueil)/page.tsx:51`), déclenchée par l'absence de logo. `/admin` ne
  dit rien du KYC, du taux de commission, de Wave/OM, de l'équipe ni du premier bien.

## Contrat de données

**Endpoints nouveaux** (`routes/api/auth.php`, publics sauf mention) :

| Route | Corps | Réponse |
|---|---|---|
| `POST /api/auth/phone/request-code` | `phone` (E.164, `TelephoneJoignable`) | **202** `{data:{retry_after}}`, **identique** que le numéro ait un compte ou non |
| `POST /api/auth/phone/verify-code` | `phone`, `code`, `device_name?`, `two_factor_code?`, `recovery_code?` | 200 `{token, expires_at, user, is_new_account}` ; ou 200 `{requires_2fa:true}` ; 422 / 423 / 429 |
| `POST /api/auth/two-factor/step-up` *(auth)* | `code` (TOTP) | 200 `{data:{valid_until}}` |
| `GET /api/agencies/{agency}/setup-status` *(auth)* | — | `{data:{complete:bool, steps:[{key, done:bool}]}}` |

**Changements de contrat** : `POST /auth/login`, `POST /auth/register` et les rappels OAuth rendent
`expires_at` à côté du jeton ; `register` **rend un jeton** (inversion de `a4c01808`, justifiée en
4.2) ; `login` rend **403 `{code:"account_blocked"}`** pour un compte `blocked`. Deux refus
nouveaux, à code stable que le front lit : **403 `two_factor_required`** et
**403 `two_factor_step_up_required`**. Les clés de `steps` : `kyc_verified`, `logo`,
`commission_rate`, `payment_integration`, `first_member`, `first_published_property`,
`admin_two_factor`. `TeamController::index` rend un booléen `two_factor_enabled` par membre.

**Modèles** : `User` (email nullable, téléphone vérifié unique), `Invitation` (téléphone),
`personal_access_tokens` (bornes de session) — décision de l'ADR, puis migrations au § Delta.

## Direction UX / Artistique

- **Téléphone d'abord** sur la connexion et l'inscription : un seul champ numéro (indicatif hors du
  champ, comme le profil), puis le code ; l'e-mail + mot de passe reste un chemin secondaire, pas
  un onglet concurrent. Le code se colle depuis le SMS (autocomplétion « code à usage unique »),
  un compte à rebours annonce le renvoi possible. Aucun message ne laisse deviner si le numéro a
  un compte.
- **L'intention survit** : du bouton « Réserver » au retour sur la fiche, quel que soit le chemin
  (connexion, inscription, téléphone, Google), la boîte se rouvre avec les dates choisies.
- **2FA exigée = un détour, pas un mur** : une 403 `two_factor_required` ouvre l'enrôlement sur
  place et ramène à l'action ; la confirmation récente demande un code dans une boîte, sans
  quitter la page. Le ton explique pourquoi (« vous touchez à l'argent de l'agence »).
- **Mise en service** : une carte sobre en tête de `/admin`, une ligne par étape, cochée ou avec
  son lien direct, une progression lisible ; elle disparaît une fois complète. Aucune étape
  inventée côté front.
- Récap de l'agent : les vraies capacités, groupées par domaine, avec les libellés existants.
- Mobile d'abord (360 px), i18n `fr`/`en`/`wo` pour chaque texte neuf.

## Contraintes strictes (métier)

1. **ADR avant le code** pour la connexion par téléphone (nouvelle méthode d'authentification) —
   voir le premier élément du Delta. Aucune ligne de §2 avant son acceptation.
2. **Un numéro non vérifié ne prouve rien** : la connexion par téléphone ne se rattache jamais à
   un compte dont le numéro n'est pas vérifié ; elle n'en fusionne aucun automatiquement
   (option recommandée, à confirmer par l'ADR).
3. **Aucun code fixe, aucun code dans une réponse** hors environnement `testing` : le `123456` et
   le `debug_code` disparaissent des chemins `production` **et** de préproduction. Les tests
   lisent le code par un faux pilote SMS du conteneur, jamais par la réponse HTTP.
4. **Le code ne passe pas par `SmsChannel`** (refus des numéros non vérifiés, préférences,
   heures calmes) : envoi direct par `SmsRouterDriver` avec `is_critical` et `bypass_quiet_hours`.
   Code 6 chiffres, TTL 5 min, usage unique, comparaison `hash_equals`, haché en cache.
5. **Limiteurs nommés** (`AppServiceProvider`) : par numéro **et** par IP sur l'envoi, par numéro
   sur la vérification ; 5 échecs invalident le code ; verrou du numéro après N échecs (valeurs
   dans l'ADR). Le plafond Orange 3/jour/MSISDN (`SmsRouterDriver.php:127-138`) est compté.
6. **Un compte `blocked` ou `deleted` n'ouvre aucune session**, par aucun chemin (mot de passe,
   téléphone, Google/Facebook/Apple, jeton existant) : refus à l'émission ET à l'authentification
   du jeton (`Sanctum::authenticateAccessTokensUsing`).
7. **2FA exigée** (TOTP) — plus strict, jamais moins :
   - tout profil plateforme (super-admin, et `support`/`viewer` quand TCK-600 les ouvrira) sur
     tout `/api/admin/*` ;
   - tout profil admin d'agence, et tout personnel de l'agence quand l'agence a activé
     `settings.require_team_two_factor`, sur les actions **mutantes** des familles : reversements,
     intégrations, rôles et délégations, équipe et invitations ;
   - tout compte portant `metadata.force_2fa_reconfigure`, sur toute route hors `auth/*`.
   Prédicat « personnel de l'agence » : `isAgentAt || isAgencyAdminAt` avec commentaire `TCK-587`
   tant que 587 n'a pas nommé le sien. Jamais un bailleur, jamais un client.
8. **La liste des actions protégées apparie par action de contrôleur, pas par nom de route** :
   `integrations.php:10`, `agencies.php:24` et les alias PUT/PATCH de `agency-roles.php` n'ont pas
   de nom. Une garde casse si une entrée de la liste ne correspond à aucune route, et si une route
   d'une famille protégée n'y figure pas.
9. **Step-up** : confirmation TOTP de moins de 10 min, portée **par le jeton** (pas par
   l'utilisateur : une autre session ne l'hérite pas), exigée pour les actions mutantes de la
   console plateforme (reversements, intégrations, paramètres, feature flags, super-admins,
   impersonation, réinitialisation 2FA, révocation de sessions, suppression et blocage
   d'utilisateurs) et pour la lecture / régénération des codes de secours de tout compte.
10. **La 2FA exigée ne se désactive pas** : `disable` rend 422 `two_factor_mandatory` pour un
    compte soumis au point 7 ; le renouvellement de l'appareil reste possible. Toute
    désactivation écrit un événement nommé `two_factor_disabled` et, pour un compte privilégié,
    alerte les super-admins.
11. **Sessions** : durée absolue pour tout jeton (le jeton hérité sans `expires_at` compris) et
    expiration par inactivité ; session super-admin bornée par `platform.session_max_minutes`
    lu **à l'émission du jeton**. Le cookie ne survit jamais au jeton (`maxAge` dérivé
    d'`expires_at`). L'expiration passe par le chemin 401 existant (`/api/auth/session-expired`,
    TCK-509) ; la garde `AuthContext.chemin-unique.test.ts` reste verte.
12. Aucun littéral de prose : messages SMS, erreurs et notifications en clés `__()` dans un bloc
    `auth.phone.*`, `auth.two_factor.*`, `invitations.sms.*`, `agency.setup.*` (ajouts seulement).
13. `GET /api/me/capabilities` reste un **affichage** : le récap d'onboarding n'autorise rien.

**Coordination vague 73** :
- **TCK-537** a classé « jetons Sanctum sans expiration » et « code du téléphone envoyé par aucun
  canal » parmi ses écarts hors politique, à confier à un ticket : **c'est celui-ci**. 537 n'y
  touche pas et cite 589. `RegisterRequest` est partagé : 537 y ajoute la case CGU et la preuve
  de consentement ; 589 y rend l'e-mail facultatif. La preuve de consentement devra aussi être
  écrite par la nouvelle inscription par téléphone : le second ticket fusionné l'ajoute.
- **TCK-600** : `EnsureSuperAdmin` partagé — 600 y remplace `isSuperAdmin()` par des capacités ;
  589 n'y ajoute **que** le contrôle 2FA, dans un bloc distinct placé après. 589 devient le
  lecteur de `platform.session_max_minutes` : 600 ne la retire pas et passe son `requires_restart`
  à faux. Les routes que 600 crée sous `/api/admin/users/*` et pour le retrait d'un super-admin
  entrent dans la liste step-up (une ligne, ajoutée par le second fusionné).
- **TCK-594** : la future approbation de reversement est couverte par l'appariement sur
  `PayoutController` / `PlatformPayoutController` ; si 594 crée un autre contrôleur, il l'ajoute.
- **TCK-587** change ce que « bloquer » veut dire pour un admin d'agence ; 589 fait respecter le
  statut `blocked` à l'authentification. `TeamConsole` : 587 change un libellé, 589 ajoute la
  colonne 2FA (lignes voisines).
- **TCK-588** : `InvitationService` partagé — 589 n'y touche que le canal d'envoi.
- **TCK-592** possède `ServiceProviderInvitationService` ; la page `onboarding/service-provider`
  n'étant revendiquée par personne, 589 y corrige la reprise (même défaut).
- **TCK-598** possède la fiche publique : 589 ne touche que la branche anonyme de
  `PropertyReservationDialog` et sa réouverture par intention.
- **TCK-586** possède `onboarding/host` (front) ; 589 retire le code fixe de
  `HostIndividualOnboardingService` (back, non revendiqué).

## Delta à produire

Livrable en trois PR successives : §1 + §4 + §6 (fondations et sessions), puis §5 (2FA), puis
§2 + §3 + §7 (téléphone, invitations, onboarding).

### 0. Décision

- [ ] **ADR-00NN à écrire et accepter avant le code** — « Le numéro de téléphone vérifié est-il un
      identifiant de connexion, et à quelles conditions ? ». Elle tranche : identifiant principal
      (téléphone vérifié **ou** e-mail) ; `users.email` nullable (alignement sur `models-spec`) ;
      unicité partielle du téléphone vérifié ; sort d'un numéro présent non vérifié sur des
      comptes existants (recommandé : jamais rattaché, compte neuf, `409 phone_taken` à la
      vérification ultérieure par l'ancien compte) ; pas de fusion automatique ; e-mail facultatif
      et ce qui en dépend (réinitialisation de mot de passe, step-up de suppression TCK-272,
      notifications e-mail) ; valeurs des limiteurs et du verrou ; canal (SMS seul — WhatsApp
      exclu par `features.md` §2.3) ; interaction avec la 2FA TOTP ; activation par environnement
      (`config('auth.phone_login.enabled')`, faux par défaut, allumé après un envoi réel mesuré).

### 1. Le code part vraiment

- [ ] `PhoneVerificationService::sendSms()` envoie par `SmsRouterDriver` (contexte `is_critical`,
      `bypass_quiet_hours`, `event_type = phone_otp`) ; texte en clé `auth.phone.sms_code`.
- [ ] Code haché en cache ; compteur d'échecs par code (5 → invalidé).
- [ ] Retrait du code fixe `123456` des quatre services d'onboarding ; `debug_code` rendu
      **uniquement** en `testing`. Tests existants adaptés pour lire le code via un faux pilote.
- [ ] Tests : `PhoneOtpDeliveryTest` (le routeur reçoit le numéro et un message contenant le
      code ; la réponse n'a pas de `debug_code` hors `testing` ; `123456` refusé en `staging`).

### 2. Connexion et inscription par téléphone

- [ ] Migration `make_email_nullable_and_phone_unique_on_users_table` : `email` nullable (l'index
      `users_email_lower_unique` reste valide), index unique partiel `users_phone_verified_unique`
      sur `phone` `WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL` — après un relevé
      des doublons existants dans chaque base (commande de relevé jointe à la PR).
- [ ] Routes `POST auth/phone/request-code` (`throttle:auth-phone-send`) et
      `POST auth/phone/verify-code` (`throttle:auth-phone-verify`) ; contrôleur
      `App\Http\Controllers\Api\Auth\PhoneLoginController` ; FormRequests
      `RequestPhoneLoginCodeRequest`, `VerifyPhoneLoginCodeRequest` (`TelephoneJoignable`,
      `PhoneNumber::normalize`) ; service `App\Services\Auth\PhoneLoginService` (code par numéro,
      pas par utilisateur ; création du compte au premier code valide, `phone_verified_at` posé,
      mot de passe aléatoire, `password_set_at` nul ; challenge TOTP si `two_factor_enabled`).
- [ ] Limiteurs nommés `auth-phone-send` (numéro + IP) et `auth-phone-verify` (numéro) ; verrou
      du numéro écrit dans `metadata.locked_at` du compte et lu par `login` comme par
      `verify-code` — l'action « déverrouiller » de la console agit enfin sur quelque chose.
- [ ] `PhoneVerificationController::resend` / `verify` : refus `409 phone_taken` si le numéro est
      déjà vérifié sur un autre compte.
- [ ] `DeletionStepUpService` : code de step-up par SMS pour un compte sans e-mail.
- [ ] Inventaire des chemins qui supposent un e-mail — relevé `grep -rn "Mail::to(" app` : deux
      envois de résumé sur `$user->email` (`Jobs/SendDailyNotificationDigest.php`,
      `Jobs/Notifications/BuildUserDigestJob.php`) et les trois de `InvitationService` ; plus les
      39 notifications à `toMail()` (routage `mail` à rendre nul sans e-mail) ; chacun traité, un
      test prouve qu'une notification à un compte sans e-mail ne lève pas.
- [ ] Front : connexion et inscription « téléphone d'abord », derrière le même drapeau.
- [ ] Tests : `PhoneLoginTest`, `PhoneLoginRateLimitTest`, `PhoneLoginEnumerationTest`.

### 3. Invitations par téléphone

- [ ] Migration `add_phone_to_invitations_table` : `phone` (string 30, nullable), `email`
      nullable, contrainte `invitations_email_or_phone_check` ; index `invitations_phone_status_idx`.
- [ ] `InviteAgentRequest`, `InviteOwnerRequest`, `InviteServiceProviderRequest` : `email`
      `required_without:phone`, `phone` `TelephoneJoignable` `required_without:email`.
- [ ] `InvitationService::send/resend/remindPending` : SMS (lien court vers `/invitations/{token}`)
      quand l'e-mail manque, par `SmsRouterDriver` ; dédoublonnage `liveSlotOccupant` sur le
      téléphone aussi. `acceptAsNewUser` : compte créé sur le numéro, déclaré vérifié (le lien est
      arrivé sur ce numéro), `email` nul.
- [ ] Tests : `InvitationBySmsTest` (envoi, relance, rappel, acceptation sans e-mail, doublon 409).

### 4. Entrée et sortie de session

- [ ] `AuthController::login` : 403 `account_blocked` pour `blocked` ; `Sanctum::authenticateAccessTokensUsing`
      (dans `AppServiceProvider`) refuse tout jeton d'un compte non `active` — couvre OAuth.
- [ ] `AuthController::register` rend `{token, expires_at, user}` ; `AuthRegistrationTest:29`
      inversé, avec un commentaire qui cite 4.2.
- [ ] Front : « Créer un compte » dans la boîte de réservation anonyme ; `redirect` (assaini comme
      celui de la connexion) transmis connexion → inscription → vérification d'e-mail → fiche ;
      intention `?action=reserver&debut=…&fin=…` qui rouvre la boîte pré-remplie.
- [ ] Tests : `BlockedAccountAuthenticationTest` (mot de passe, téléphone, OAuth, jeton existant).

### 5. 2FA exigée

- [ ] `App\Http\Middleware\RequireTwoFactor` (règles du point 7 des contraintes ; utilisateur lu
      par la garde `sanctum` explicitement, piège `SetLocaleMiddleware.php:63`) et
      `App\Http\Middleware\RequireRecentTwoFactor` (point 9), branchés dans `bootstrap/app.php` ;
      listes d'actions dans `App\Support\Security\ProtectedActions`.
- [ ] `EnsureSuperAdmin` : 403 `two_factor_required` si `two_factor_enabled` est faux (bloc seul).
- [ ] Réglage d'agence `settings.require_team_two_factor` (`AgencyUpdateRequest` +
      `AgencyController::update`, capacité `agency.update` ; 586 et 592 touchent d'autres blocs du
      même contrôleur, l.332-343).
- [ ] `TwoFactorController::disable` : 422 `two_factor_mandatory` (point 10) ; activité
      `two_factor_disabled` ; alerte aux super-admins pour un compte privilégié.
- [ ] `TwoFactorController::confirm` et `SuperAdminTwoFactorController::confirm` effacent
      `metadata.force_2fa_reconfigure`.
- [ ] `TeamController::index` : `two_factor_enabled` par membre (champ calculé, **pas** via
      `User::$queryFields`, qui l'exposerait à toute liste d'utilisateurs).
- [ ] Front : 403 `two_factor_required` → enrôlement sur place puis retour ; l'onboarding admin
      d'agence rend la 2FA obligatoire (plus de « passer ») ; garde du layout super-admin sur
      `two_factor_enabled` ; colonne 2FA de l'équipe ; interrupteur d'agence.
- [ ] Tests : `SuperAdminTwoFactorEnforcementTest`, `AgencyStaffTwoFactorTest`,
      `ProtectedActionsCoverageTest` (garde du point 8), `ForceTwoFactorReconfigureTest`.

### 6. Sessions bornées et step-up

- [ ] `config/sanctum.php` : `expiration` = durée absolue (recommandé 43 200 min) — couvre les
      jetons hérités par `created_at`.
- [ ] Migration `add_session_bounds_to_personal_access_tokens_table` : `idle_timeout_minutes`
      (smallint nullable), `two_factor_verified_at` (timestamp nullable).
- [ ] Émission (`login`, `register`, téléphone, OAuth) par un seul `App\Services\Auth\SessionTokenIssuer` :
      `expires_at`, inactivité (7 j ; super-admin `platform.session_max_minutes` absolus et 30 min
      d'inactivité), `two_factor_verified_at` posé quand un TOTP vient d'être saisi.
- [ ] `POST auth/two-factor/step-up` (`throttle:5,1`) ; `recovery-codes` et `regenerate` sous
      `RequireRecentTwoFactor`.
- [ ] `Schedule::command('sanctum:prune-expired --hours=24')` dans `routes/console.php`.
- [ ] Front : `set-token` dérive `maxAge` d'`expires_at` ; 403 `two_factor_step_up_required` →
      boîte de code puis rejeu de l'action.
- [ ] Tests : `TokenLifetimeTest` (absolu, inactivité, super-admin, jeton hérité),
      `StepUpTwoFactorTest` (par jeton, 10 min, codes de secours).

### 7. Onboarding qui dit vrai

- [ ] Pages `onboarding/owner`, `onboarding/agent`, `onboarding/service-provider` : lire le
      paramètre de reprise ; à défaut le premier profil `pending` ; à défaut `/app`.
- [ ] Récap de l'agent : capacités lues dans `GET /api/me/capabilities?agency_id=` de l'agence de
      l'invitation, libellés `admin.roles.capabilities.*` ; `ROLE_PERMISSIONS` supprimée.
- [ ] `GET /api/agencies/{agency}/setup-status` — `App\Http\Controllers\Api\Agency\AgencySetupStatusController`,
      service `App\Services\Agency\AgencySetupStatus`, autorisation par `agency.update` dans
      l'agence ; carte « Mise en service » sur `/admin`.
- [ ] Tests : `AgencySetupStatusTest` ; tests vitest des trois pages de reprise et du récap.

## Critères d'acceptation

- [ ] **AC1** — Hors `testing`, `POST /auth/phone/send-otp` fait appeler `SmsRouterDriver::send`
      une fois avec le numéro et un texte qui contient le code ; la réponse n'a pas de
      `debug_code`, et `123456` est refusé par les quatre onboardings. Ablation : remettre le
      pilote `log-stub` → rouge.
- [ ] **AC2** — Un numéro inconnu + code valide crée **un** compte (`phone_verified_at` posé,
      `email` nul) et rend un jeton ; le même numéro reconnecte **ce** compte (même `id`).
      Un numéro présent mais non vérifié sur un compte existant ne connecte **pas** ce compte.
- [ ] **AC3** — `request-code` rend le même statut et le même corps pour un numéro avec et sans
      compte. Au 6e code faux, le code est invalidé ; au-delà du seuil de l'ADR, le numéro est
      verrouillé (423) même avec le bon code. Ablation du verrou → rouge.
- [ ] **AC4** — Un compte `blocked` reçoit 403 `account_blocked` au mot de passe, au téléphone et
      au rappel OAuth, et son jeton antérieur rend 401. **Rouge sur `e3ab4a4e`** (le login rend
      200 aujourd'hui).
- [ ] **AC5** — Une inscription rend un jeton utilisable sur `GET /auth/me` (200). Au navigateur :
      fiche → Réserver → Créer un compte → inscription → retour sur la même fiche, boîte rouverte
      avec les dates saisies.
- [ ] **AC6** — Une invitation de prestataire avec téléphone seul part par SMS (routeur appelé,
      `Mail` jamais), s'accepte, et crée un compte sans e-mail au numéro vérifié.
- [ ] **AC7** — Un super-admin sans 2FA reçoit 403 `two_factor_required` sur `GET /api/admin/users`
      (**rouge sur `e3ab4a4e`**) ; `POST /auth/two-factor/disable` rend 422 pour lui, avec son mot
      de passe comme avec un code ; une réinitialisation par le support impose l'enrôlement à la
      connexion suivante.
- [ ] **AC8** — Un admin d'agence sans 2FA reçoit 403 `two_factor_required` sur `POST /payouts`,
      sur `PATCH /integrations/{id}` (l'alias **sans nom**) et sur `PUT /agencies/{a}/roles/{r}/capabilities` ;
      un bailleur sans 2FA n'est pas concerné ; avec l'interrupteur d'agence, un agent sans 2FA
      reçoit 403 sur ces mêmes routes. Ablation : retirer le middleware → rouge.
- [ ] **AC9** — `ProtectedActionsCoverageTest` rougit si l'on ajoute à `integrations.php` une
      route mutante absente de la liste, et si une entrée de la liste ne résout aucune route.
- [ ] **AC10** — Un jeton de plus de 30 jours, ou inutilisé depuis plus de 7 jours, rend 401 ; un
      jeton super-admin rend 401 après `platform.session_max_minutes` (valeur modifiée en test à
      2 min) et après 30 min d'inactivité ; un jeton hérité sans `expires_at` créé il y a 31 jours
      rend 401. **Rouge sur `e3ab4a4e`.**
- [ ] **AC11** — `POST /admin/users/{u}/impersonate` et `GET /auth/two-factor/recovery-codes`
      rendent 403 `two_factor_step_up_required` sans step-up, 200 dans les 10 min qui suivent un
      step-up **sur le même jeton**, 403 sur un second jeton du même utilisateur, et 403 à 10 min 01.
- [ ] **AC12** — Avec deux profils bailleur (un `active` chez A, un `pending` chez B), le lien
      `?owner=<B>` monte l'assistant sur B, et sans paramètre aussi ; idem agent et prestataire.
- [ ] **AC13** — Un agent invité avec un rôle personnalisé accordant exactement
      `properties.create` et `crm.view_all` voit **ces deux** libellés au récap, et aucun autre.
- [ ] **AC14** — `setup-status` d'une agence neuve rend les 7 étapes à `done:false` ; chacune passe
      à `true` quand sa condition est posée (KYC `verified`, logo, `commission_rate`, intégration
      active, un membre, un bien publié, 2FA de l'admin) ; un agent de l'agence reçoit 403.

## Hors périmètre

- Code par WhatsApp (exclu par `features.md` §2.3 ; modèle d'authentification Meta à faire approuver).
- Fusion de comptes en double, manuelle ou automatique (support).
- Clés d'accès (passkeys), connexion par lien magique (P3).
- Gating par capacité de la console et niveaux `support`/`viewer` : TCK-600.
- Preuve du consentement aux CGU : TCK-537.
- Ce que « bloquer » signifie pour un admin d'agence (suspension de profil) : TCK-587.
- Porte d'entrée en libre-service du prestataire (dette D-60).

## Notes d'implémentation

_(à remplir par implementing-specs)_
