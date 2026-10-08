---
id: TCK-589
title: "Le code SMS ne part vers aucun numéro, un compte bloqué se reconnecte et les sessions n'expirent jamais : connexion par téléphone, 2FA là où l'argent circule, sessions bornées, onboarding qui dit vrai"
status: doing
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-07
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
**Chaque constat a été re-mesuré sur `e3ab4a4e`** ; des défauts graves, absents des rapports,
ont été trouvés en le faisant (1.1, 1.6, 4.1, 4.2, le verrou jamais posé du § 2). Passe de
correction du 2026-10-06 : chaque défaut du ticket a désormais sa case de Delta et son AC rouge.

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
Ce refus est voulu pour les notifications (proxy d'opt-out, AC11 du canal) ; il devient un défaut
dès qu'on y fait passer un code ou une invitation : le message est **abandonné sans erreur**
(`return null`), et le destinataire d'un code est par construction un numéro non encore vérifié.
1.5 `verifyOtp()` n'a **aucun compteur d'échecs** (`PhoneVerificationService.php:57-68`) : seul
le limiteur de route `throttle:5,1` borne les essais, et il se réarme chaque minute pendant les
5 min de vie du code.
1.6 Hors `production`, le code est **rendu dans la réponse HTTP** (`debug_code`,
`PhoneVerificationController.php:68`, depuis `PhoneVerificationService.php:54`) et affiché à
l'écran par cinq composants (`ProfileContactSection.tsx:96`, `PhoneVerificationSection.tsx:51`,
`AgentOnboardingWizard.tsx:246`, `ServiceProviderOnboardingWizard.tsx:282`,
`HostIndividualWizard.tsx:495`). Une préproduction publique livre donc le code à quiconque le
demande.

### 2. Connexion et inscription par e-mail seulement (V7, C10)

- `LoginRequest` exige `email` (`app/Http/Requests/Auth/LoginRequest.php:25`), la connexion cherche
  par e-mail (`AuthController.php:48`), l'inscription exige un e-mail unique
  (`RegisterRequest.php:27`). Les routes `phone/send-otp` / `verify-otp` sont **authentifiées**
  (`routes/api/auth.php:38,57-60`) : elles vérifient le numéro d'un compte, elles ne connectent pas.
- `users.email` est `NOT NULL` (`database/migrations/0001_01_01_000000_create_users_table.php:17`)
  alors que `docs/models-spec.md` le déclare nullable ; `users.phone` n'a **aucune unicité**
  (`2026_04_15_210400_add_fields_to_users_table.php:23`) : un même numéro peut figurer sur
  plusieurs comptes aujourd'hui. Cinq chemins posent `phone_verified_at` sans regarder ailleurs
  (`PhoneVerificationController.php:28`, `AgentOnboardingService.php:113`,
  `OwnerOnboardingService.php:117`, `ServiceProviderOnboardingService.php:125`,
  `HostIndividualOnboardingService.php:247`) : le même numéro peut être **vérifié** sur deux comptes.
- Aucun verrou par compte : `metadata.locked_at` / `failed_login_attempts` ne sont **écrits par
  personne** — seul `UserSupportService::unlock` les lit (`app/Services/Admin/UserSupportService.php:28-39`).
  Le geste « Déverrouiller » de la console (`POST /api/admin/users/{user}/unlock`,
  `routes/api/admin.php:118`) rend donc **toujours 409** (`:33`) : il agit sur un verrou que rien
  ne pose. La connexion n'est bornée que par IP (`throttle:5,10`, `routes/api/auth.php:27`).

### 3. Invitations par e-mail seulement (P9)

`invitations.email` est `NOT NULL` (`2026_05_10_000001_create_invitations_table.php:24`) ;
`InviteAgentRequest:26`, `InviteOwnerRequest:25`, `InviteServiceProviderRequest:25` exigent
l'e-mail, et le téléphone n'y est qu'un `nullable|string|max:30` **sans** `TelephoneJoignable`.
L'envoi, la relance et le rappel passent par `Mail::to()` seul (`InvitationService.php:219, 388, 460`).
Le téléphone saisi n'est donc ni validé (un numéro injoignable est stocké tel quel) ni utilisé.

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
| `POST /api/auth/phone/request-code` | `phone` (E.164, `TelephoneJoignable`) | **202** `{data:{retry_after}}`, **identique** que le numéro ait un compte ou non ; **404** drapeau éteint |
| `POST /api/auth/phone/verify-code` | `phone`, `code`, `device_name?`, `two_factor_code?`, `recovery_code?` | 200 `{token, expires_at, user, is_new_account}` ; ou 200 `{requires_2fa:true}` ; 422 / 423 / 429 ; **404** drapeau éteint |
| `POST /api/auth/two-factor/step-up` *(auth)* | `code` (TOTP) | 200 `{data:{valid_until}}` |
| `GET /api/agencies/{agency}/setup-status` *(auth)* | — | `{data:{complete:bool, steps:[{key, done:bool}]}}` |

**Changements de contrat** : `POST /auth/login`, `POST /auth/register` et les rappels OAuth rendent
`expires_at` à côté du jeton ; `register` **rend un jeton** (inversion de `a4c01808`, justifiée en
4.2) ; `login` rend **403 `{code:"account_blocked"}`** pour un compte `blocked`. Deux refus
nouveaux, à code stable que le front lit : **403 `two_factor_required`** et
**403 `two_factor_step_up_required`**. Les clés de `steps` : `kyc_verified`, `logo`,
`commission_rate`, `payment_integration`, `first_member`, `first_published_property`,
`admin_two_factor`. `TeamController::index` rend un booléen `two_factor_enabled` par membre.
`login` rend **423 `{code:"account_locked"}`** pendant un verrou. Toute vérification de
téléphone (profil, onboardings, connexion, invitation) rend **409 `{code:"phone_taken"}`** quand
le numéro est déjà vérifié sur un autre compte. Le champ **`debug_code` disparaît** de
`POST /auth/phone/send-otp` et de ses alias, dans **tous** les environnements.
`GET /api/auth/oauth/providers` gagne `data.phone_login: bool` (reflet du drapeau) : c'est par là
que le front sait s'il affiche l'entrée par téléphone.

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

0. **Tranché par le porteur le 2026-10-06 (connexion par téléphone) : « oui, mais implémente
   tout ».** La connexion et l'inscription par téléphone restent derrière
   `config('auth.phone_login.enabled')` (`PHONE_LOGIN_ENABLED`), **faux par défaut**, mais ce
   ticket livre **tout**, testé drapeau allumé : demande et vérification du code, création du
   compte au premier code, reconnexion, limiteurs et verrou par numéro, OTP branché sur
   `SmsRouterDriver`, suppression du `123456`, pages front d'entrée par téléphone, conservation de
   l'intention, invitations par SMS. **Rien n'est remis à un ticket suivant.** L'allumage par
   environnement n'est **pas** une tâche de code (voir « Après la fusion » à la fin du Delta).
   Les invitations **sans e-mail** suivent le même drapeau : un compte créé sur un numéro seul ne
   peut revenir que par téléphone ; drapeau éteint, `Invite*Request` continue d'exiger l'e-mail.
   Les corrections qui ne dépendent pas du drapeau (code réellement envoyé, `123456` et
   `debug_code` retirés, compte bloqué, verrou du mot de passe, inscription qui connecte,
   sessions, 2FA) valent **drapeau éteint**.
1. **ADR avant le code** pour la connexion par téléphone (nouvelle méthode d'authentification) —
   voir le premier élément du Delta. Aucune ligne de §2 avant son acceptation ; l'ADR consigne la
   décision du porteur ci-dessus, il ne la rouvre pas.
2. **Un numéro non vérifié ne prouve rien** (option retenue par défaut) : la connexion par
   téléphone ne se rattache jamais à un compte dont le numéro n'est pas vérifié ; elle crée un
   compte neuf ; aucune fusion automatique ; l'ancien compte qui tente ensuite de vérifier ce
   numéro reçoit 409 `phone_taken`.
3. **Aucun code fixe, aucun code dans une réponse, dans aucun environnement** — `testing`
   compris : le `123456` disparaît des quatre services, le `debug_code` de la réponse et des cinq
   composants qui l'affichent. Les tests lisent le code par un faux pilote SMS lié dans le
   conteneur, jamais par la réponse HTTP.
4. **Le code ne passe pas par `SmsChannel`** (refus des numéros non vérifiés, préférences,
   heures calmes) : envoi direct par `SmsRouterDriver` avec `is_critical` et `bypass_quiet_hours`.
   Code 6 chiffres, TTL 5 min, usage unique, comparaison `hash_equals`, haché en cache. Une
   invitation par SMS s'adresse au **numéro**, jamais au `User` qui le porterait (cf. 1.4).
   `SmsChannel` (territoire 588) n'est pas modifié.
5. **Limiteurs nommés** (`AppServiceProvider`) : par numéro **et** par IP sur l'envoi, par numéro
   sur la vérification ; 5 échecs invalident le code ; verrou du numéro après N échecs (valeurs
   dans l'ADR). Le plafond Orange 3/jour/MSISDN (`SmsRouterDriver.php:127-138`) est compté.
5 bis. **Verrou par compte, aussi pour le mot de passe** (option retenue par défaut) : 10 échecs
   consécutifs → `metadata.locked_at` posé, `failed_login_attempts` tenu ; le verrou dure 15 min
   (expiration calculée depuis `locked_at`, pour qu'un tiers ne puisse pas bloquer un compte
   indéfiniment) ; une connexion réussie remet le compteur à zéro. `UserSupportService::unlock`
   (non modifié) efface les deux clés : il agit enfin.
5 ter. **Un seul écrivain de `phone_verified_at`** :
   `PhoneVerificationService::markVerified(User, string $phone)`, qui **teste avant d'écrire** et
   lève 409 `phone_taken`. Jamais d'attrape de `UniqueConstraintViolationException` (piège
   PostgreSQL n° 1 : la transaction serait abandonnée).
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
   **Aucun délai de grâce, aucun drapeau** (option retenue par défaut) : l'exigence est active
   dès la fusion — une garde de sécurité derrière un drapeau éteint ne corrige rien ; l'admin sans
   2FA est enrôlé sur place à sa première 403.
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
    alerte les super-admins (entrée `two_factor_disabled` d'`AlertableEvents`).
11. **Sessions** : durée absolue pour tout jeton (le jeton hérité sans `expires_at` compris) et
    expiration par inactivité ; session super-admin bornée par `platform.session_max_minutes`
    lu **à l'émission du jeton**. Valeurs (option retenue par défaut) : tout compte 30 j absolus
    / 7 j d'inactivité ; super-admin `platform.session_max_minutes` (480) absolus / 30 min
    d'inactivité ; step-up valable 10 min. Le cookie ne survit jamais au jeton (`maxAge` dérivé
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
  - **`routes/api/auth.php` est à 589** ; 600 y retire **la seule ligne 42**
    (`DELETE /api/auth/account` → `UserAdminController::deleteOwnAccount`, effacement immédiat
    sans step-up — 600 AC8). 589 ne la prend pas, ne la déplace pas et n'y pose pas de
    middleware ; ses ajouts (routes téléphone, `two-factor/step-up`, middleware sur
    `recovery-codes`) sont des blocs voisins. Ordre de fusion indifférent ; le second rebase
    garde la suppression de 600.
  - **`Sanctum::authenticateAccessTokensUsing` est revendiqué par les deux** (600 Delta : « refus
    par requête des jetons d'un compte `Blocked`/`Deleted` »). Le rappel est **unique** — un
    second appel écrase le premier sans bruit. Il vit dans une seule classe
    `App\Services\Auth\AccessTokenGate` (statut + bornes de session) appelée depuis
    `AppServiceProvider` ; le premier fusionné la crée, le second y ajoute sa clause. Les deux
    tests (`BlockedUserTokenRejectedTest` de 600, `TokenLifetimeTest` et
    `BlockedAccountAuthenticationTest` d'ici) restent et doivent être verts ensemble.
  - `AlertableEvents` est à 600 : 589 y ajoute **une** entrée `two_factor_disabled` (ajout voisin).
  - `UserSupportService::unlock` / `resetTwoFactor` ne sont pas modifiés : 589 en écrit et en lit
    les clés (`locked_at`, `failed_login_attempts`, `force_2fa_reconfigure`).
- **TCK-594** : la future approbation de reversement est couverte par l'appariement sur
  `PayoutController` / `PlatformPayoutController` ; si 594 crée un autre contrôleur, il l'ajoute.
  L'approbation et le marquage payé de la console entrent dans la liste step-up (594 l'attend).
- **TCK-588** possède `SmsChannel` et `ContactSansCompte`. Si 588 a fusionné, l'invitation par SMS
  part par `NotificationService::send(ContactSansCompte::…)` (destinataire routé : la garde
  `phone_verified_at` ne s'y applique pas) ; sinon par `SmsRouterDriver` directement, et 588 la
  convertit. Le **code** à usage unique, lui, ne passe jamais par une notification.
- **TCK-592** touche `ServiceProviderOnboardingService` (assignation en fin d'onboarding) ; 589 n'y
  touche que `verifyOtp` (retrait du `123456`) et `markPhoneVerified` (appel à `markVerified`).
  Blocs distincts, ordre indifférent.
- **TCK-596 / TCK-599** réutilisent l'envoi de code de §1 s'il a fusionné avant eux ; 589 expose
  l'envoi par numéro (`PhoneLoginService`) sans le lier à un `User`.
- **TCK-587** change ce que « bloquer » veut dire pour un admin d'agence ; 589 fait respecter le
  statut `blocked` à l'authentification. `TeamConsole` : 587 change un libellé, 589 ajoute la
  colonne 2FA (lignes voisines).
- **TCK-588** : `InvitationService` partagé — 589 n'y touche que le canal d'envoi.
- **TCK-592** possède `ServiceProviderInvitationService` ; la page `onboarding/service-provider`
  n'étant revendiquée par personne, 589 y corrige la reprise (même défaut).
- **TCK-598** possède la fiche publique : 589 ne touche que la branche anonyme de
  `PropertyReservationDialog` et sa réouverture par intention.
- **TCK-586** possède `onboarding/host` (front) ; 589 retire le code fixe de
  `HostIndividualOnboardingService` (back, non revendiqué) et, dans `HostIndividualWizard`, **la
  seule branche** qui affiche `debug_code` (l.495-499), devenue morte. Ordre indifférent.

## Delta à produire

Livrable en trois PR successives, **toutes dans ce ticket** (aucune partie n'est repoussée) :
§1 + §4 + §6 (fondations et sessions), puis §5 (2FA), puis §2 + §3 + §7 (téléphone, invitations,
onboarding). Le ticket passe à `done` à la fusion de la troisième.

### 0. Décision

- [x] **ADR-00NN à écrire et accepter avant le code** — « Le numéro de téléphone vérifié est-il un
      identifiant de connexion, et à quelles conditions ? ». Il consigne la décision du porteur du
      2026-10-06 (tout livrer, derrière `config('auth.phone_login.enabled')` faux par défaut,
      allumé par environnement après un envoi réel mesuré) et tranche : identifiant principal
      (téléphone vérifié **ou** e-mail) ; `users.email` nullable (alignement sur `models-spec`) ;
      unicité partielle du téléphone vérifié ; sort d'un numéro présent non vérifié sur des
      comptes existants (option retenue par défaut : contrainte 2) ; e-mail facultatif et ce qui
      en dépend (réinitialisation de mot de passe, step-up de suppression TCK-272, notifications
      e-mail) ; valeurs des limiteurs et du verrou par numéro ; canal (option retenue par défaut :
      SMS seul — WhatsApp exclu par `features.md` §2.3) ; interaction avec la 2FA TOTP.

### 1. Le code part vraiment (vaut drapeau éteint)

- [x] `PhoneVerificationService::sendSms()` envoie par `SmsRouterDriver` (contexte `is_critical`,
      `bypass_quiet_hours`, `event_type = phone_otp`) ; texte en clé `auth.phone.sms_code`. Le
      pilote `log-stub` disparaît.
- [x] Code haché en cache ; compteur d'échecs par code dans `verifyOtp()` (5 → code invalidé,
      un nouveau doit être demandé) — vaut pour la vérification du profil comme pour la connexion.
- [x] Retrait du code fixe `123456` des quatre `verifyOtp()` d'onboarding (`Agent`, `Owner`,
      `ServiceProvider`, `HostIndividual`) et de leurs docblocks.
- [x] `sendOtp()` ne rend plus le code ; `PhoneVerificationController::resend` ne rend plus
      `debug_code` (l.68). `PhoneVerificationTest::test_send_otp_returns_debug_code_outside_production`
      est **inversé** (le champ est absent) ; `PhoneVerificationTest` et
      `HostIndividualOnboardingTest` lisent le code par le faux pilote SMS
      (`Tests\Support\FakeSmsRouter`, lié dans le conteneur).
- [x] Front : le type de l'action d'envoi perd `debug_code` ; les cinq composants de 1.6 n'ont
      plus de branche qui affiche un code (clés `otpSentDebug` / `sentDebug` / `bodyDebug`
      retirées des trois langues).
- [x] Tests : `PhoneOtpDeliveryTest`, `OnboardingFixedCodeRemovedTest`, `PhoneOtpAttemptLimitTest`.

### 2. Connexion et inscription par téléphone

- [x] Migration `make_email_nullable_and_phone_unique_on_users_table` : `email` nullable (l'index
      `users_email_lower_unique` reste valide), index unique partiel `users_phone_verified_unique`
      sur `phone` `WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL` — après un relevé
      des doublons existants dans chaque base (commande de relevé jointe à la PR).
- [x] `config/auth.php` : `phone_login.enabled` = `env('PHONE_LOGIN_ENABLED', false)` ; clé
      ajoutée **vide** à `.env.example` et à `.env.docker` (parité gardée par
      `check-env-parity.mjs`). Drapeau éteint, les deux routes ci-dessous rendent 404.
      `OAuthProviderController` rend `data.phone_login`.
- [x] Routes `POST auth/phone/request-code` (`throttle:auth-phone-send`) et
      `POST auth/phone/verify-code` (`throttle:auth-phone-verify`) ; contrôleur
      `App\Http\Controllers\Api\Auth\PhoneLoginController` ; FormRequests
      `RequestPhoneLoginCodeRequest`, `VerifyPhoneLoginCodeRequest` (`TelephoneJoignable`,
      `PhoneNumber::normalize`) ; service `App\Services\Auth\PhoneLoginService` (code par numéro,
      pas par utilisateur ; création du compte au premier code valide, `phone_verified_at` posé,
      mot de passe aléatoire, `password_set_at` nul ; challenge TOTP si `two_factor_enabled`).
- [x] Limiteurs nommés `auth-phone-send` (numéro + IP) et `auth-phone-verify` (numéro) ; verrou
      du numéro écrit dans `metadata.locked_at` du compte et lu par `login` comme par
      `verify-code` — l'action « déverrouiller » de la console agit enfin sur quelque chose.
- [x] `PhoneVerificationService::markVerified(User, string $phone)` (contrainte 5 ter) remplace
      les cinq écritures de `phone_verified_at` relevées au § 2 du Contexte ;
      `PhoneVerificationController::resend` refuse aussi `409 phone_taken` dès l'envoi, avant de
      dépenser un SMS. Ne dépend pas du drapeau.
- [x] `App\Services\Account\DeletionStepUpService` : code de step-up par SMS (même envoi qu'au
      §1) pour un compte sans e-mail.
- [x] Inventaire des chemins qui supposent un e-mail — relevé `grep -rn "Mail::to(" app` : deux
      envois de résumé sur `$user->email` (`Jobs/SendDailyNotificationDigest.php`,
      `Jobs/Notifications/BuildUserDigestJob.php`) et les trois de `InvitationService` ; plus les
      39 notifications à `toMail()` (routage `mail` à rendre nul sans e-mail) ; chacun traité, un
      test prouve qu'une notification à un compte sans e-mail ne lève pas.
- [x] Front : connexion et inscription « téléphone d'abord » (saisie du numéro, code, renvoi
      à rebours, challenge 2FA), affichées seulement quand `phone_login` est vrai ; drapeau
      éteint, les pages actuelles sont inchangées. L'intention (§4) traverse ce chemin aussi.
- [x] Tests : `PhoneLoginTest`, `PhoneLoginRateLimitTest`, `PhoneLoginEnumerationTest`,
      `PhoneLoginFlagTest`, `PhoneNumberUniquenessTest`, `AccountWithoutEmailTest` ; tests vitest
      des pages d'entrée (drapeau vrai / faux). Tous les tests §2-§3 posent le drapeau à vrai.

### 3. Invitations par téléphone

- [x] Migration `add_phone_to_invitations_table` : `phone` (string 30, nullable), `email`
      nullable, contrainte `invitations_email_or_phone_check` ; index `invitations_phone_status_idx`.
- [x] `InviteAgentRequest`, `InviteOwnerRequest`, `InviteServiceProviderRequest` : `phone` passe
      **toujours** par `TelephoneJoignable` (vaut drapeau éteint : un numéro injoignable n'est plus
      stocké) ; drapeau allumé, `email` `required_without:phone` et `phone`
      `required_without:email` ; drapeau éteint, `email` reste `required`.
- [x] `InvitationService::send/resend/remindPending` : SMS (lien court vers `/invitations/{token}`)
      *(lien : celui du courriel, `/invitations/accept?token=` — aucune des deux pages n'existe
      côté front, cf. Notes §3)* quand l'e-mail manque, adressé **au numéro** (contrainte 4 ; voie 588 ou `SmsRouterDriver`
      selon l'ordre de fusion) ; dédoublonnage `liveSlotOccupant` sur le téléphone aussi.
      `acceptAsNewUser` : compte créé sur le numéro, vérifié par `markVerified` (le lien est arrivé
      sur ce numéro), `email` nul.
- [x] Tests : `InvitationBySmsTest` (envoi, relance, rappel, acceptation sans e-mail, doublon 409,
      numéro porté par un compte non vérifié, drapeau éteint).

### 4. Entrée et sortie de session (vaut drapeau éteint)

- [x] `AuthController::login` : 403 `account_blocked` pour `blocked` et `deleted` ; le rappel unique
      `AccessTokenGate` (coordination 600) refuse tout jeton d'un compte non `active` — couvre
      OAuth (`OAuthController.php:66`, `AbstractOAuthController.php:105`, qui refusent aussi
      l'émission).
- [x] Verrou du mot de passe (contrainte 5 bis) dans `AuthController::login` : compteur
      `metadata.failed_login_attempts` sur un compte existant, `locked_at` au 10e échec, 423
      `account_locked` tant que le verrou court — **avant** la vérification du mot de passe, pour
      que le bon mot de passe n'y échappe pas ; remise à zéro au succès. Même verrou lu par
      `verify-code` (§2).
- [x] `AuthController::register` rend `{token, expires_at, user}` ; `AuthRegistrationTest:29`
      inversé, avec un commentaire qui cite 4.2.
- [x] Front : l'inscription ouvre la session avec le jeton rendu ; plus aucun appel de
      `set-token` sans jeton depuis l'inscription. « Créer un compte » dans la boîte de réservation
      anonyme ; `redirect` (assaini comme celui de la connexion) transmis connexion → inscription
      → vérification d'e-mail → fiche, et par l'entrée téléphone et Google ; intention
      `?action=reserver&debut=…&fin=…` qui rouvre la boîte pré-remplie.
- [x] Tests : `BlockedAccountAuthenticationTest` (mot de passe, téléphone, OAuth, jeton existant),
      `PasswordLoginLockTest` ; tests vitest de l'inscription et du lien « Créer un compte ».

### 5. 2FA exigée

- [x] `App\Http\Middleware\RequireTwoFactor` (règles du point 7 des contraintes ; utilisateur lu
      par la garde `sanctum` explicitement, piège `SetLocaleMiddleware.php:63`) et
      `App\Http\Middleware\RequireRecentTwoFactor` (point 9), branchés dans `bootstrap/app.php` ;
      listes d'actions dans `App\Support\Security\ProtectedActions`.
- [x] `EnsureSuperAdmin` : 403 `two_factor_required` si `two_factor_enabled` est faux (bloc seul).
- [x] Réglage d'agence `settings.require_team_two_factor` (`AgencyUpdateRequest` +
      `AgencyController::update`, capacité `agency.update` ; 586 et 592 touchent d'autres blocs du
      même contrôleur, l.332-343).
- [x] `TwoFactorController::disable` : 422 `two_factor_mandatory` (point 10) ; activité nommée
      `two_factor_disabled` (`activity('Security')->event('two_factor_disabled')`) ; entrée
      `two_factor_disabled` dans `AlertableEvents` (coordination 600).
- [x] `metadata.force_2fa_reconfigure` lu par `RequireTwoFactor` (403 `two_factor_required` hors
      `auth/*`) et par `GET /auth/me` (le front redirige vers l'enrôlement) ;
      `TwoFactorController::confirm` et `SuperAdminTwoFactorController::confirm` l'effacent.
- [x] `TeamController::index` : `two_factor_enabled` par membre (champ calculé, **pas** via
      `User::$queryFields`, qui l'exposerait à toute liste d'utilisateurs).
- [x] Front : 403 `two_factor_required` → enrôlement sur place puis retour ; l'onboarding admin
      d'agence rend la 2FA obligatoire (plus de « passer ») ; garde du layout super-admin sur
      `two_factor_enabled` ; colonne 2FA de l'équipe ; interrupteur d'agence.
- [x] Tests : `SuperAdminTwoFactorEnforcementTest`, `AgencyStaffTwoFactorTest`,
      `ProtectedActionsCoverageTest` (garde du point 8), `ForceTwoFactorReconfigureTest`,
      `TwoFactorDisableTest` ; tests vitest du layout super-admin et de l'onboarding admin.

### 6. Sessions bornées et step-up

- [x] `config/sanctum.php` : `expiration` = durée absolue (43 200 min, option retenue par
      défaut) — couvre les jetons hérités par `created_at`.
- [x] Migration `add_session_bounds_to_personal_access_tokens_table` : `idle_timeout_minutes`
      (smallint nullable), `two_factor_verified_at` (timestamp nullable).
- [x] Émission (`login`, `register`, téléphone, OAuth) par un seul `App\Services\Auth\SessionTokenIssuer` :
      `expires_at`, inactivité (7 j ; super-admin `platform.session_max_minutes` absolus et 30 min
      d'inactivité), `two_factor_verified_at` posé quand un TOTP vient d'être saisi.
- [x] `POST auth/two-factor/step-up` (`throttle:5,1`) ; `recovery-codes` et `regenerate` sous
      `RequireRecentTwoFactor`.
- [x] `Schedule::command('sanctum:prune-expired --hours=24')` dans `routes/console.php`.
- [x] Front : `set-token` dérive `maxAge` d'`expires_at` ; 403 `two_factor_step_up_required` →
      boîte de code puis rejeu de l'action.
- [x] Tests : `TokenLifetimeTest` (absolu, inactivité, super-admin, jeton hérité),
      `StepUpTwoFactorTest` (par jeton, 10 min, codes de secours), `TokenPruneScheduleTest` ;
      test vitest de `set-token`.

### 7. Onboarding qui dit vrai

- [x] Pages `onboarding/owner`, `onboarding/agent`, `onboarding/service-provider` : lire le
      paramètre de reprise ; à défaut le premier profil `pending` ; à défaut `/app`.
- [x] Récap de l'agent : capacités lues dans `GET /api/me/capabilities?agency_id=` de l'agence de
      l'invitation, libellés `admin.roles.capabilities.*` ; `ROLE_PERMISSIONS` supprimée.
- [x] `GET /api/agencies/{agency}/setup-status` — `App\Http\Controllers\Api\Agency\AgencySetupStatusController`,
      service `App\Services\Agency\AgencySetupStatus`, autorisation par `agency.update` dans
      l'agence ; carte « Mise en service » sur `/admin`.
- [x] Tests : `AgencySetupStatusTest` ; tests vitest des trois pages de reprise et du récap.

### Après la fusion — geste d'exploitation, pas une tâche de code

L'allumage de `PHONE_LOGIN_ENABLED` se fait **environnement par environnement** (onglet Dokploy,
ADR-0028), par une personne, **après un envoi réel mesuré** dans cet environnement : un code
demandé sur un numéro de test, reçu sur le téléphone, avec la trace du fournisseur. Aucune case de
ce ticket ne l'attend et aucune ne le fait ; `done` ne dit pas « allumé ». Le relevé de cet envoi
et la valeur du drapeau vont dans `docs/infra/hebergement.md` (clés d'environnement) le jour de
l'allumage. Prérequis : les clés `SMS_*` d'un fournisseur actif dans l'environnement — absentes
de la préproduction au dernier relevé (`hebergement.md:142`).

## Critères d'acceptation

Chaque AC marqué **rouge** l'est sur `e3ab4a4e` et le redevient quand on retire le correctif
nommé (ablation). AC2, AC3, AC6 (sauf le numéro injoignable) et AC17 posent
`auth.phone_login.enabled = true` ; AC2b teste les deux positions ; les autres valent drapeau
éteint.

- [x] **AC1** — `PhoneOtpDeliveryTest` : un utilisateur dont `phone_verified_at` est **nul**
      appelle `POST /auth/phone/send-otp` → le faux `SmsRouterDriver` reçoit **un** appel, avec ce
      numéro, `is_critical = true`, et un texte qui contient le code ; la réponse n'a **pas** de
      `debug_code` ; le code reçu valide `POST /auth/phone/verify-otp` (200) et
      `phone_verified_at` est posé. Même chose pour l'envoi d'un onboarding bailleur. **Rouge**
      (aujourd'hui : routeur jamais appelé, `debug_code` présent). Ablations : remettre le pilote
      `log-stub` → rouge ; envoyer par une notification sur `SmsChannel` → rouge (abandon 1.4).
- [x] **AC1b** — `OnboardingFixedCodeRemovedTest` : en environnement `testing`, `123456` (le
      faux pilote ayant émis un autre code) est **refusé (422)** par les quatre onboardings —
      agent, bailleur, prestataire, hôte. **Rouge** (accepté aujourd'hui : `testing` ≠
      `production`). Ablation : remettre la ligne dans un seul service → son cas rougit.
- [x] **AC1c** — `PhoneOtpAttemptLimitTest` : cinq codes faux sur `POST /auth/phone/verify-otp`
      (limiteur de route remis à zéro entre les appels par `RateLimiter::clear`), puis le **bon**
      code → 422 et `phone_verified_at` reste nul. **Rouge** (200 aujourd'hui). Ablation du
      compteur → rouge.
- [x] **AC2** — `PhoneLoginTest` : un numéro inconnu + code valide crée **un** compte
      (`phone_verified_at` posé, `email` nul, `password_set_at` nul) et rend un jeton valide sur
      `GET /auth/me` ; le même numéro reconnecte **ce** compte (même `id`, `is_new_account`
      faux) ; un compte `two_factor_enabled` reçoit `requires_2fa` puis se connecte avec le TOTP.
      Un numéro présent mais non vérifié sur un compte existant ne connecte **pas** ce compte.
- [x] **AC2b** — `PhoneLoginFlagTest` : drapeau éteint, `request-code` et `verify-code` rendent
      404, `GET /auth/oauth/providers` rend `phone_login: false`, et `InviteServiceProviderRequest`
      sans e-mail rend 422 ; drapeau allumé, `phone_login: true`. Vitest : la page de connexion
      n'affiche l'entrée par téléphone que si `phone_login` est vrai.
- [x] **AC3** — `PhoneLoginEnumerationTest` / `PhoneLoginRateLimitTest` : `request-code` rend le
      même statut et le même corps pour un numéro avec et sans compte. Au 6e code faux, le code
      est invalidé ; au-delà du seuil de l'ADR, le numéro est verrouillé (423) même avec le bon
      code ; le limiteur par numéro tient quand l'IP change. Ablation du verrou → rouge.
- [x] **AC4** — `BlockedAccountAuthenticationTest` : un compte `blocked` (puis `deleted`) reçoit
      403 `account_blocked` au mot de passe, au téléphone et au rappel OAuth Google, et un jeton
      émis **avant** le blocage rend 401 sur `GET /auth/me`. **Rouge** (le login rend 200).
      Ablations séparées : retirer la clause de `login` → rouge ; retirer la clause d'`AccessTokenGate`
      → rouge.
- [x] **AC5** — `AuthRegistrationTest` : `POST /auth/register` rend un `token` et un
      `expires_at`, et ce jeton rend 200 sur `GET /auth/me`. **Rouge** (aucun jeton aujourd'hui).
      Vitest : la page d'inscription ouvre la session avec le jeton reçu et n'appelle jamais
      `set-token` sans jeton ; **rouge** (`openSession(undefined, …)` aujourd'hui).
- [x] **AC5b** — Vitest : le lien « Créer un compte » de `/auth/login?redirect=/properties/x`
      porte `redirect=/properties/x` (**rouge** : `href="/auth/register"` nu) ; un `redirect`
      externe (`//evil.example`) est écarté. Au navigateur : fiche → Réserver → Créer un compte →
      inscription → retour sur la même fiche, boîte rouverte avec les dates saisies ; idem par
      l'entrée téléphone (drapeau allumé).
      **Ajouté après vérification adverse (M2)** : `"/\t/evil.com"`, `"/\n/evil.com"`,
      `"/\\/evil.com"` et `"/\t\\evil.com"` sont écartés (**rouge** sur `e59cb8b2` : rendus tels
      quels, que le navigateur résout vers `evil.com`). La destination rendue est la forme
      **résolue** : `redirection-interne.test.ts`.
- [x] **AC6** — `InvitationBySmsTest` : une invitation de prestataire avec téléphone seul part par
      SMS (envoi au **numéro**, `Mail` jamais), y compris quand ce numéro est porté par un compte
      dont `phone_verified_at` est nul ; relance et rappel aussi ; elle s'accepte et crée un compte
      sans e-mail au numéro vérifié. Un numéro injoignable (`+330612345678`) rend 422 **drapeau
      éteint comme allumé** — **rouge** (accepté aujourd'hui).
- [x] **AC7** — `SuperAdminTwoFactorEnforcementTest` / `TwoFactorDisableTest` : un super-admin sans
      2FA reçoit 403 `two_factor_required` sur `GET /api/admin/users` (**rouge**) ;
      `POST /auth/two-factor/disable` rend 422 `two_factor_mandatory` pour lui, avec son mot de
      passe comme avec un code (**rouge**, 200 aujourd'hui) ; pour un client, `disable` réussit et
      écrit une activité d'événement `two_factor_disabled` (**rouge** : seule une `updated`
      générique existe), et `AlertableEvents::has('two_factor_disabled')` est vrai. Vitest : le
      layout super-admin redirige un compte sans 2FA vers l'enrôlement (**rouge**).
- [x] **AC7b** — `ForceTwoFactorReconfigureTest` : après `POST /admin/users/{u}/reset-2fa`, le
      compte se reconnecte et reçoit 403 `two_factor_required` sur une route hors `auth/*` ;
      `GET /auth/me` expose l'obligation ; après `two-factor/confirm`, la clé est effacée et la
      route rend 200. **Rouge** (la clé n'est lue par personne).
- [x] **AC8** — `AgencyStaffTwoFactorTest` : un admin d'agence sans 2FA reçoit 403
      `two_factor_required` sur `POST /payouts`, sur `PATCH /integrations/{id}` (l'alias **sans
      nom**) et sur `PUT /agencies/{a}/roles/{r}/capabilities` (**rouge**) ; un bailleur sans 2FA
      n'est pas concerné ; avec l'interrupteur d'agence, un agent sans 2FA reçoit 403 sur ces
      mêmes routes. Ablation : retirer le middleware → rouge. Vitest : l'onboarding admin d'agence
      n'offre plus de « passer » à l'étape 2FA (**rouge**, `onSkip` aujourd'hui).
- [x] **AC9** — `ProtectedActionsCoverageTest` rougit si l'on ajoute à `integrations.php` une
      route mutante absente de la liste, et si une entrée de la liste ne résout aucune route.
- [x] **AC10** — `TokenLifetimeTest` : un jeton de plus de 30 jours, ou inutilisé depuis plus de
      7 jours, rend 401 ; un jeton super-admin rend 401 après `platform.session_max_minutes`
      (valeur modifiée en test à 2 min) et après 30 min d'inactivité ; un jeton hérité sans
      `expires_at` créé il y a 31 jours rend 401. **Rouge.** `TokenPruneScheduleTest` : le
      planificateur contient `sanctum:prune-expired` (**rouge**). Vitest : `set-token` pose un
      `maxAge` égal à `expires_at − maintenant` (**rouge** : 7 j fixes).
- [x] **AC11** — `StepUpTwoFactorTest` : `POST /admin/users/{u}/impersonate` et
      `GET /auth/two-factor/recovery-codes` rendent 403 `two_factor_step_up_required` sans
      step-up (**rouge**), 200 dans les 10 min qui suivent un step-up **sur le même jeton**, 403
      sur un second jeton du même utilisateur, et 403 à 10 min 01.
- [x] **AC12** — Avec deux profils bailleur (un `active` chez A, un `pending` chez B), le lien
      `?owner=<B>` monte l'assistant sur B, et sans paramètre aussi ; idem agent et prestataire.
      **Rouge** (premier profil du type aujourd'hui).
- [x] **AC13** — Un agent invité avec un rôle personnalisé accordant exactement
      `properties.create` et `crm.view_all` voit **ces deux** libellés au récap, et aucun autre.
      **Rouge** (`ROLE_PERMISSIONS.agent` aujourd'hui).
- [x] **AC14** — `setup-status` d'une agence neuve rend les 7 étapes à `done:false` ; chacune passe
      à `true` quand sa condition est posée (KYC `verified`, logo, `commission_rate`, intégration
      active, un membre, un bien publié, 2FA de l'admin) ; un agent de l'agence reçoit 403.
- [x] **AC15** — `PasswordLoginLockTest` : 10 mots de passe faux, puis le **bon** → 423
      `account_locked` (**rouge**, 200 aujourd'hui) ; `POST /admin/users/{u}/unlock` rend alors 200
      (**rouge**, toujours 409 aujourd'hui) et la connexion suivante 200 ; sans geste du support,
      le verrou tombe à 15 min 01 ; un succès avant le seuil remet le compteur à zéro. Ablation : ne
      lire le verrou que sur la branche d'échec → le cas « bon mot de passe → 423 » rougit.
- [x] **AC16** — `PhoneNumberUniquenessTest` : deux comptes portent le même numéro, A l'a vérifié ;
      B le vérifie par le profil **et** par l'onboarding bailleur → **409 `phone_taken`** (pas 500,
      pas 200) et `phone_verified_at` de B reste nul. **Rouge** (200 aujourd'hui). Ablation :
      retirer le test préalable de `markVerified` → 500 (violation d'index unique) → rouge.
- [x] **AC17** — `AccountWithoutEmailTest` : un compte créé par téléphone (sans e-mail) reçoit une
      notification à `toMail()` sans exception, et `POST /auth/me/deletion-request/step-up` envoie
      le code par SMS (faux routeur appelé une fois, `Mail` jamais) ; le code reçu permet de
      créer la demande de suppression.

## Hors périmètre

- Code par WhatsApp (option retenue par défaut : SMS seul — exclu par `features.md` §2.3, modèle
  d'authentification Meta à faire approuver). Amélioration, pas un défaut.
- Fusion de comptes en double, manuelle ou automatique (support). Amélioration.
- Clés d'accès (passkeys), connexion par lien magique (P3).
- Gating par capacité de la console et niveaux `support`/`viewer` : TCK-600.
- `DELETE /api/auth/account` (effacement immédiat sans step-up) : **TCK-600** le supprime (son
  AC8) ; coordination sur `routes/api/auth.php` écrite aux Contraintes.
- Preuve du consentement aux CGU : TCK-537 (y compris sur l'inscription par téléphone, cf.
  coordination).
- Ce que « bloquer » signifie pour un admin d'agence (suspension de profil) : TCK-587.
- L'**allumage** du drapeau par environnement : geste d'exploitation (fin du Delta).
- Porte d'entrée en libre-service du prestataire (dette D-60).

## Notes d'implémentation

Branche `feat/tck-589-entree-telephone-2fa`, partie de `origin/dev` à `5f872f1f` (2026-10-07).

### §0 — ADR-0033 (commit `b0682528`)

Écrit et accepté avant le code. Valeurs tranchées : limiteurs `auth-phone-send` (numéro 3/15 min et
5/24 h, IP 20/h), `auth-phone-verify` (numéro 10/15 min), 5 échecs par code, verrou à 10 échecs
consécutifs (mot de passe **ou** code) pendant 15 min ; pour un numéro sans compte, même compteur
en cache sous la clé du numéro (le 423 ne trahit pas l'existence d'un compte).

### §1 — le code part vraiment

- **Re-mesuré** : 1.1 à 1.6 exacts sur `5f872f1f`. Écart : **six** composants affichaient le code,
  pas cinq — `OwnerOnboardingWizard.tsx:215-219, 300-304` manquait à la liste de 1.6 ; et chaque
  assistant affichait le code deux fois (toast `bodyDebug` **et** ligne `devHint` sous le champ) :
  9 clés retirées par langue, pas 3. `SmsDriverInterface` n'a aucun consommateur dans `app/`
  (`SMS_DEFAULT_DRIVER=log` ne change donc rien au routeur) : en développement, sans `debug_code`
  ni `123456`, l'étape « code SMS » serait devenue infranchissable. D'où `SMS_LOG_FALLBACK`
  (`config/sms.php`) : vrai dans `.env.docker` seulement, il termine chaque chaîne par le pilote
  `log` ; vide dans `.env.example`, forcé à faux dans `phpunit.xml`.
- `PhoneVerificationService` : code haché (`hash_hmac` sur `APP_KEY`), lié au numéro auquel il a
  été envoyé, compteur d'échecs par code ; `sendOtp()` rend un booléen ; envoi direct par
  `SmsRouterDriver` (`is_critical`, `bypass_quiet_hours`, `event_type = phone_otp`), texte
  `auth.phone.sms_code`. Le même mécanisme sert un code adressé à un numéro sans compte
  (`sendCodeTo` / `verifyCodeFor`, par portée) : c'est la porte de TCK-596 / TCK-599.
- `Tests\Support\FakeSmsRouter` (sous-classe sans dépendance du vrai routeur, liée par
  `app()->instance`) et le trait `Tests\Support\ReadsPhoneCodes` : les quatre tests d'onboarding
  et `PhoneVerificationTest` lisent désormais le code dans le SMS reçu.
- **Exécutions** : `php artisan test tests/Feature/Auth/Phone tests/Feature/Auth/PhoneVerificationTest.php
  tests/Feature/Onboarding` → vert ; `npx vitest run src/components/profile src/components/onboarding`
  → 17 fichiers, 117 tests verts ; `npx tsc --noEmit` et `eslint` propres.
- **Ablations** (script `ablate.py` du scratchpad : remplace, lance, restaure) :
  - AC1 — remettre un `log-stub` dans `deliver()` → `PhoneOtpDeliveryTest` 3 rouges ; envoyer par
    `SmsChannel` (notification critique ad hoc) → rouge, 0 SMS reçu (abandon 1.4).
  - AC1c — retirer le seuil de `check()` → `cinq_codes_faux_invalident_le_code` rouge, l'autre vert.
  - AC1b — remettre le `123456` dans `OwnerOnboardingService` seul → `test_bailleur` rouge, les
    trois autres verts.

### §4 + §6 (API) — entrée et sortie de session, sessions bornées

- **Re-mesuré** : 4.1, 4.2, 4.4 exacts. `Guard::isValidAccessToken` (Sanctum 4.3.3) juge déjà
  `expires_at` et `sanctum.expiration` sur `created_at` avant le rappel : `AccessTokenGate` n'ajoute
  que le statut du compte et l'inactivité (`last_used_at ?? created_at`, mis à jour par Sanctum
  APRÈS la validation). Écart non signalé par le ticket : les rappels OAuth n'ont **aucun défi 2FA**
  (un compte `two_factor_enabled` entre par Google sans TOTP) — hors Delta, au rapport.
- `SessionTokenIssuer` (seul émetteur : login, register, OAuth ; téléphone au §2) refuse aussi un
  compte fermé : défense en profondeur. Conséquence mesurée par ablation : retirer la clause de
  `login` seule laissait l'AC4 « mot de passe » vert (l'émetteur refusait encore). Le test garde
  donc ce qui distingue les deux : le refus de `login` tombe **avant** le défi 2FA et avant toute
  écriture (`last_login_at`) — `test_le_refus_precede_le_defi_2fa_et_toute_ecriture`.
- `LoginLock` : un TOTP faux après le bon mot de passe compte aussi comme un échec (sinon le
  verrou ne bornerait pas la force brute du second facteur).
- **Exécutions** : `php artisan test tests/Feature/Auth/Session` → vert ; 16 fichiers qui émettent
  ou lisent un vrai jeton (`grep -rl "createToken\|withToken\|auth/login\|oauth/.*/callback"`)
  + `tests/Feature/Auth` → 332 tests verts.
- **Ablations** : AC4 — clause de `login` retirée → `le_refus_precede_le_defi_2fa…` rouge (2/9) ;
  clause d'`AccessTokenGate` retirée → `un_jeton_emis_avant_le_blocage_rend_401` rouge (2/7) ;
  clause de l'émetteur retirée → rappel OAuth rouge. AC15 — lecture du verrou retirée → 3/6 rouges
  dont « bon mot de passe → 423 ». AC10 — `sanctum.expiration` remis à `null` → le jeton hérité de
  31 j passe (rouge) ; clause d'inactivité retirée → 2 rouges (7 j, super-admin 30 min).


### §5 + step-up (API) — 2FA exigée

- **Re-mesuré** sur `5f872f1f` : 5.1 exact (`EnsureSuperAdmin` ne lit que le profil ; `disable`
  accepte le seul mot de passe ; `force_2fa_reconfigure` n'est **écrit** qu'à
  `UserSupportService.php:48` et lu nulle part ; `recovery-codes` aux lignes 72-73 d'`auth.php`).
  Écarts : (1) la console d'équipe `/admin/team` ne lit **pas** `GET /agencies/{a}/team` mais
  `GET /api/users` (`UserAdminController::index`, via le BFF `admin-users`) : la colonne 2FA est
  donc calculée aux **deux** endroits (une requête par page, jamais via `User::$queryFields`) ;
  (2) `AgencyController::update` remplaçait `settings` en bloc : poser l'interrupteur seul aurait
  effacé les réglages de filigrane — `settings` se fusionne désormais (`array_replace`).
- `App\Support\Security\ProtectedActions` : `FAMILIES` (fichier de routes ⇒ tout le fichier, ou
  ses seuls contrôleurs pour `agencies.php`), `AGENCY_TWO_FACTOR` (30 actions), `EXEMPT` (avec
  raison : acceptation publique d'invitation, création d'agence), `STEP_UP` (console : reversements
  plateforme, intégrations, paramètres, feature flags, cooptation, impersonation, reset 2FA,
  révocation de sessions ; codes de secours) et `STEP_UP_FOR_PLATFORM` (`UserAdminController`
  block/destroy : step-up seulement quand l'appelant est super-admin — ces actions servent aussi
  l'admin d'agence sur son équipe). `PATCH agencies/{agency}` est protégé : il porte la commission
  et l'interrupteur lui-même. `App\Support\Security\TwoFactorRequirement` dit QUI doit porter la
  2FA (lu par le middleware et par `disable`).
- `RequireTwoFactor` et `RequireRecentTwoFactor` en fin de groupe `api`, après
  `ResolveActiveProfile` (donc avant `auth:sanctum` : utilisateur lu par la garde `sanctum`).
  L'agence d'une action d'agent : `{agency}` de la route, sinon le profil actif. Bloc 2FA ajouté
  **après** celui du profil dans `EnsureSuperAdmin` (coordination 600).
- `TwoFactorController` : `disable` → 422 `two_factor_mandatory` pour un compte soumis à
  l'exigence ; activité `Security` / `two_factor_disabled` ; `stepUp` (`POST
  auth/two-factor/step-up`, `throttle:5,1`) pose `two_factor_verified_at` sur LE jeton et rend
  `{data: {valid_until}}` ; `confirm` (et `SuperAdminTwoFactorController::confirm`) efface
  `force_2fa_reconfigure`. **Renouvellement de l'appareil** (contrainte 10) : `enable` sur une 2FA
  active, sous step-up, met un nouveau secret en attente (cache chiffré, 10 min) ; `confirm` le
  prouve et le substitue, `qr` le rend. *Pas d'écran front pour ce geste* : au rapport.
- `AlertableEvents` : une entrée `two_factor_disabled`. ⚠ L'alerte part par les règles que les
  super-admins configurent ; elle ne distingue pas compte privilégié et client (un compte soumis à
  l'exigence ne peut de toute façon plus désactiver).
- Tests : la 2FA étant exigée, `actingAsRole('super_admin'|'agency_admin')` incarne désormais le
  rôle **avec** sa 2FA (surchargeable), et le super-admin agit par un vrai jeton portant un step-up
  frais (`actingAsWithStepUp`, garde `sanctum`). Nouvel état `UserFactory::withTwoFactor()`. Douze
  fichiers existants qui fabriquaient un admin à la main ont reçu `withTwoFactor()` /
  `actingAsWithStepUp()` — dont `MultiProfileStrictAccessTest` où les deux cas **403** auraient
  sinon passé pour la mauvaise raison (`two_factor_required`). `TwoFactorTest::enable_fails_if_already_enabled`
  affirme désormais 403 `two_factor_step_up_required` (c'est le renouvellement).
- **Exécutions** : `php artisan test tests/Feature/Auth/TwoFactor` → 7 classes vertes ; balayage des
  fichiers qui frappent une route protégée ou fabriquent un profil plateforme / admin
  (`grep -rlE "api/admin|/api/payouts|/api/integrations|/roles|role-delegations|/invite|/api/invitations|/api/users|/members|two-factor|agencies/"`
  puis `grep -rlE "agency_admin|AgencyAdminProfile|super_admin|PlatformProfile|two_factor|force_2fa"`,
  166 fichiers en 7 lots) → tous verts après correction des fixtures ci-dessus.
- **Ablations** :
  - AC7 — la clause `/api/admin/*` du middleware seule retirée : vert (le bloc d'`EnsureSuperAdmin`
    tient) ; le bloc seul retiré : vert (le middleware tient) ; **les deux** : rouge. Deux verrous
    indépendants, voulus. `disable` sans la clause « exigée » → 4 rouges ; événement renommé
    `updated` → 2 rouges.
  - AC7b — clause `force_2fa_reconfigure` du middleware retirée → rouge ; `unset` de `confirm`
    retiré → rouge ; champ de `UserResource` retiré → rouge.
  - AC8 — `RequireTwoFactor` retiré de `bootstrap/app.php` → 6 rouges (admin ×3, agent ×3).
  - AC9 — une route `POST integrations/{integration}/rotate` ajoutée à `integrations.php` → rouge ;
    une entrée `PayoutController@approve` (inexistante) ajoutée à la liste → rouge. La première
    exécution réelle a d'ailleurs trouvé deux oublis : `AgencyController@store` (exempté, raison
    écrite) et `@destroy` (protégé).
  - AC11 — `RequireRecentTwoFactor` retiré → 4 rouges sur 5 (le cinquième, « la connexion par
    TOTP vaut step-up », est un témoin positif). Un durcissement de `stepUpValidUntil` contre le
    jeton factice de `Sanctum::actingAs()` a été essayé puis **retiré** : son ablation laissait le
    test vert — le mock rend bien `null` sur l'attribut ; le test reste, comme garde.

### §2 — connexion et inscription par téléphone (API)

- **Re-mesuré** sur `5f872f1f` : 2.1 à 2.3 exacts (`users.email` `NOT NULL`, aucune unicité du
  téléphone, `locked_at` écrit par personne). Les « cinq chemins » qui posaient
  `phone_verified_at` passent par `markVerified` depuis §1 ; `grep` d'`app/` ne relève plus que
  des remises à nul (changement de numéro).
- Migration `2026_10_07_150200_make_email_nullable_and_phone_unique_on_users_table` : `email`
  nullable, index partiel `users_phone_verified_unique`. **Relevé des doublons** (requête dans
  l'en-tête de la migration) sur la base de développement : 302 comptes, **0** doublon. Les bases
  déployées ne sont pas mesurables d'ici : relevé à faire avant la migration (« Pour la session »).
- `PhoneLoginService` / `PhoneLoginController` / `RequestPhoneLoginCodeRequest` (404 drapeau
  éteint dans `prepareForValidation`, donc avant toute validation) / `VerifyPhoneLoginCodeRequest`.
  Écart de conception à noter : le code SMS étant à usage unique, un compte à 2FA recevait
  `requires_2fa` sur un code **déjà consommé** — `verifyCodeFor(..., consume: false)` vérifie
  sans consommer quand le TOTP manque, et le client repose le même code avec le TOTP.
- Compte créé au premier code : `first_name`/`last_name` vides (colonnes `NOT NULL`), e-mail nul,
  mot de passe machine, `password_set_at` nul, `preferred_language` = langue de la requête ;
  **aucun** événement `Registered` (il n'y a pas d'e-mail à vérifier).
- Limiteurs `auth-phone-send` (numéro 3/15 min + 5/24 h, IP 20/h) et `auth-phone-verify`
  (numéro 10/15 min), clé = numéro saisi sans espaces.
- `RegisterRequest` **n'est pas modifié** : l'inscription par téléphone EST `verify-code`. Rendre
  l'e-mail facultatif sur `/auth/register` créerait un compte à mot de passe sur un numéro **non
  vérifié**, qu'aucun chemin ne reconnecterait (contrainte 2). Coordination 537 : la preuve de
  consentement devra aussi être écrite par `PhoneLoginService::createAccount`.
- Chemins qui supposaient un e-mail : `BuildUserDigestJob` et `SendDailyNotificationDigest`
  sortent sans courriel ; `TwoFactorService::qrCodeUrl` nomme le compte par son numéro ;
  `MailChannel` ignore déjà une route nulle (relu dans `vendor`, et prouvé par
  `AccountWithoutEmailTest`) — les 39 `toMail()` n'ont donc rien à changer. `DeletionStepUpService`
  envoie le code par SMS (routeur direct) à un compte sans e-mail. `InvitationService` : §3.
- **Exécutions** : `php artisan test tests/Feature/Auth/Phone` (9 classes) → vert ;
  `tests/Feature/Auth tests/Feature/Onboarding` + 5 fichiers digest / fournisseurs OAuth → 357 verts.
- **Ablations** : AC2 — `verifiedAccount` sans `whereNotNull('phone_verified_at')` → « un numéro
  non vérifié ne connecte pas » rouge. AC3 — lecture du verrou retirée de `verify` → 2 rouges
  (avec / sans compte) ; un 423 rendu par `request-code` sur numéro verrouillé → énumération rouge ;
  limiteur `auth-phone-verify` indexé sur l'IP → « tient quand l'IP change » rouge. AC16 — test
  préalable de `markVerified` retiré → **500** (violation de l'index) sur profil et onboarding,
  rouge. AC17 — voie SMS de `DeletionStepUpService` retirée → rouge (aucun SMS, la notification
  courriel tombe sur une route nulle). AC4 (téléphone) — couvert par
  `test_le_code_sms_ne_rouvre_pas_la_session`.

### §3 — invitations par téléphone (API)

- **Re-mesuré** sur `5f872f1f` : 3.1 exact (`invitations.email` `NOT NULL`, trois `Mail::to()`
  aux lignes 219, 388, 460 ; `phone` en `nullable|string|max:30`). Écarts : (1) le téléphone
  saisi n'atteint même pas `InvitationService::send()` — les trois services par rôle le rangent
  seulement dans les métadonnées du profil brouillon ; (2) **le front ne sert aucune page
  d'acceptation** : le courriel pointe vers `/invitations/accept?token=…` et aucune route de
  `takussan-web/src/app` ne la sert (`find src/app -ipath "*invit*"` → rien). Le SMS reprend le
  lien du courriel (un seul contrat de lien) plutôt que le `/invitations/{token}` du Delta, qui
  n'existe pas davantage ; la page manquante est au rapport, hors périmètre.
- Migration `2026_10_07_150300_add_phone_to_invitations_table` : `phone` (30), `email`
  nullable, `invitations_email_or_phone_check`, `invitations_phone_status_idx`.
- `InvitationService` : un seul point d'envoi `deliver()` (envoi, relance, rappel) — courriel
  s'il y a un e-mail, sinon SMS **au numéro** par `SmsRouterDriver` (`is_critical`), texte
  `invitations.sms.invite|reminder`. **Raccord TCK-588** : `ContactSansCompte` n'existe pas sur
  `dev` ; le SMS passera par `NotificationService::send(ContactSansCompte::…)` quand 588 aura
  fusionné (commentaire posé dans `deliver()`). Créneau de dédoublonnage `(numéro, type,
  agence)` quand l'e-mail manque ; compte titulaire = celui qui a **vérifié** le numéro ;
  `acceptAsNewUser` crée le compte au numéro, `email` et `email_verified_at` nuls, puis
  `markVerified` ; `acceptForAuthenticatedUser` compare le numéro vérifié (403
  `invitations.errors.phone_mismatch`).
- Les trois `Invite*Request` : `phone` passe toujours par `TelephoneJoignable` ; drapeau allumé,
  `email` `required_without:phone` et l'inverse. Les trois services par rôle acceptent un e-mail
  nul (garde « déjà actif dans l'agence » et recherche du prestataire existant **par e-mail
  seulement**) et transmettent le numéro. ⚠ `ServiceProviderInvitationService` est à TCK-592 :
  trois lignes touchées (e-mail facultatif, garde conditionnelle, `phone` transmis).
- **Exécutions** : `php artisan test tests/Feature/Invitation` + 24 fichiers qui invitent →
  337 verts.
- **Ablations** : envoi SMS retiré de `deliver()` → 4 rouges ; `markVerified` retiré de
  l'acceptation → rouge ; créneau par numéro neutralisé → « seconde invitation → 409 » rouge ;
  `TelephoneJoignable` retiré de la branche drapeau éteint → « injoignable, drapeau éteint » rouge.

### §7 — mise en service (API, commit `b3f4c308`)

- **Re-mesuré** sur `5f872f1f` : aucune route `setup-status`, aucun service ; la seule relance est
  `BrandingBanner` (logo). Écart : le Delta dit « autorisation par `agency.update` » ;
  `AgencyPolicy` explique pourquoi cette règle ne s'écrit **pas** `canActAt(Capability::AgencyUpdate)`
  (le résolveur n'exige pas que le profil actif soit sur l'agence visée et ignore
  `primary_admin_id`). Le contrôleur appelle donc `can('update', $agency)` — la règle
  `agency.update` dans l'agence, telle que la policy l'écrit une seule fois.
- `App\Services\Agency\AgencySetupStatus` — sept étapes lues sur la base, jamais sur un drapeau :
  `kyc_verified` (dossier `verified`, lu **sans** `dossierForAgency`, qui crée le dossier) ;
  `logo` (collection `logo`) ; `commission_rate` non nul (la fabrique en pose un : le test le
  vide) ; `payment_integration` = intégration **active** de Wave ou d'Orange Money — écart
  assumé avec « intégration active » de l'AC : le formulaire d'intégrations accepte un fournisseur
  libre (`twilio`, `stripe`…), qui n'encaisse rien pour l'agence ; `first_member` = une
  **deuxième personne** active (agent ou admin) — compté en personnes, car le fondateur porte
  souvent un profil d'agent **et** un d'admin (`AgencyController::addAgent`,
  `AgencyProvisioningService`) ; `first_published_property` = `Property::scopePublic()`
  **composé** (pas de cinquième liste de statuts) ; `admin_two_factor` = **tous** les admins
  actifs (et `primary_admin_id`) ont la 2FA.
- AC13, côté API : le récap du front lit `GET /api/me/capabilities?agency_id=` **pendant**
  l'onboarding, profil d'agent encore `draft`. Re-mesuré : `isAgentAt` et
  `MembershipCapabilityResolver::roleAllows` ne filtrent pas le statut — la réponse est déjà
  juste. `DraftAgentCapabilitiesTest` l'épingle (vert sans changement : c'est une garde, pas un
  correctif).
- **Exécutions** : `php artisan test tests/Feature/Agency/AgencySetupStatusTest.php` → 15 verts ;
  `tests/Feature/Api/Me/DraftAgentCapabilitiesTest.php` → vert ;
  `ProtectedActionsCoverageTest` → vert (route `GET`, hors familles mutantes).
- **Ablations** (AC14) : autorisation retirée → 2 rouges (agent, admin d'une autre agence) ;
  filtre Wave / Orange Money retiré → rouge ; `first_member` à « ≥ 1 » → 8 rouges ;
  `admin_two_factor` à « un admin suffit » → rouge ; `->public()` retiré → « un brouillon n'est
  pas un bien publié » rouge.

### Front (commits `0c2a1970`, `b80ef974`, `80a48290`)

- §1 : le type de l'action d'envoi perd `debug_code`, six composants n'affichent plus de code,
  9 clés retirées par langue. §4 : `set-token` dérive `maxAge` d'`expires_at` (7 j à défaut, rien
  de durable pour un jeton échu) ; l'inscription ouvre la session avec le jeton rendu ; `redirect`
  assaini (`lib/redirection-interne.ts`) traverse connexion → inscription → vérification d'e-mail
  → `/onboarding/intention`, l'entrée téléphone et Google ; `?action=reserver&debut=&fin=` rouvre
  la boîte pré-remplie puis nettoie l'URL. §2 : entrée « téléphone d'abord »
  (`ConnexionParTelephone`) affichée seulement si `data.phone_login`. §5/§6 : `GardeDoubleFacteur`
  — une 403 `two_factor_required` ouvre l'enrôlement sur place, une 403
  `two_factor_step_up_required` une boîte de code, puis l'action est rejouée ; garde du layout
  super-admin ; plus de « Plus tard » à l'étape 2FA de l'onboarding admin ; colonne 2FA de
  l'équipe ; interrupteur `require_team_two_factor`. §7 : reprise sur le bon profil
  (`lib/onboarding-reprise.ts`), récap des vraies capacités (`ROLE_PERMISSIONS` supprimée), carte
  `MiseEnService` sur `/admin` (aucune étape inventée : une clé inconnue n'est pas affichée).
- **Écart mesuré au navigateur, corrigé (`80a48290`)** — deux ruptures que les tests de page ne
  pouvaient pas voir (ils simulent `router.push`) :
  1. `proxy.ts` renvoie toute page `/auth/*` d'une session ouverte vers `/app`. L'inscription
     ouvrant désormais la session puis menant à `/auth/verify-email`, l'intention mourait là
     (relevé : `/auth/register?redirect=…` → `/app`). `/auth/verify-email` est exemptée — c'est
     la page d'un compte connecté (son renvoi de lien exige le jeton).
  2. `/onboarding/intention` (TCK-493) : « Je cherche un logement » menait à `/properties` en
     ignorant le `redirect` ; seul « Je verrai plus tard » l'honorait. Il ramène désormais à la
     destination demandée quand il y en a une.
  Ablations : `proxy.ts` de `dev` → le cas `verify-email` rougit ; choix `search` sans `retour`
  → le test TCK-589 de `QuestionDIntention` rougit.
- **Ablations par retour au code de `dev`** (`revert_run.py` : la source de `dev`, le test neuf,
  restauration) : AC5/AC5b (`register` + `login`) → 4 rouges ; AC7 (layout super-admin) → 2 ;
  AC10 (`set-token`) → 3 ; AC8 (assistant admin) → 1 ; AC13 (assistant agent) → 2 ; AC12 (trois
  pages d'onboarding) → 12 ; AC2b (page de connexion) → 7.
- ⚠ La boîte de réservation **anonyme** n'a pas de champs de dates : les « dates saisies » de
  l'AC5b ne peuvent venir que d'une intention déjà portée par l'URL (lien partagé, retour de
  connexion). C'est ce chemin qui est mesuré ci-dessous.

### AC5b au navigateur (2026-10-07)

API du worktree sur `:8104` (base isolée `takussan_tck589`, Redis base 9 préfixée,
`PHONE_LOGIN_ENABLED=true`, `SMS_LOG_FALLBACK=true`), `next dev` sur `:3104`, Chrome headless
piloté par CDP sur `:9344`. Un bien `rent`/`daily` publié.

- **E-mail, sans dates** : fiche → « Réserver » → boîte anonyme, lien « Créer un compte » =
  `/auth/register?redirect=%2Fproperties%2F<slug>%3Faction%3Dreserver` → inscription (voie
  e-mail) → `/auth/verify-email?redirect=…` → « Continuer » → `/onboarding/intention?redirect=…`
  → « Je cherche un logement » → `/fr/properties/<slug>`, boîte « Réserver ce bien » rouverte,
  URL nettoyée.
- **E-mail, avec dates** (`debut=2026-11-02`, `fin=2026-11-05`) : même chemin, boîte rouverte
  « Arrivée 2 novembre 2026 · Départ 5 novembre 2026 ».
- **Téléphone, avec dates** (`2026-10-27` → `2026-10-30`) : « Se connecter » → entrée téléphone
  en tête → `+221771234589` → code lu dans le journal (pilote `log`) → compte créé →
  orientation → retour sur la fiche, boîte rouverte « Arrivée 27 octobre 2026 · Départ 30 octobre
  2026 », devis de 3 nuits affiché.
- Avant `80a48290`, le premier chemin s'arrêtait sur `/app` (puis sur `/fr/properties`).

### Exécutions nommées finales (après `80a48290`)

- `php artisan test` sur les **41** fichiers de test que la branche touche
  (`git diff --name-only dev..HEAD -- takussan-api/tests`) → **277 verts, 1230 assertions**,
  35 s. Vaut pour AC1, AC1b, AC1c, AC2, AC2b, AC3, AC4, AC5, AC6, AC7, AC7b, AC8, AC9, AC10,
  AC11, AC13 (API), AC14, AC15, AC16, AC17.
- `npx vitest run` sur les **26** fichiers de test que la branche touche → **240 verts** ; puis
  `src/__tests__ src/components/onboarding src/app/onboarding src/app/(auth) src/components/auth`
  → 26 fichiers, 182 verts. Vaut pour la part vitest d'AC2b, AC5, AC5b, AC7, AC8, AC10, AC12,
  AC13.
- `npx tsc --noEmit` propre, `eslint` propre sur les fichiers touchés, `./vendor/bin/pint` propre,
  `for g in scripts/check-*.mjs` → aucune garde rouge.
- **Non lancées ici, par la règle du dépôt** : les suites entières `php artisan test` et
  `npm run test` (`bin/impacted-tests.php --base=dev` rend « SUITE ENTIÈRE ») — à la session.

### Fusion de `origin/dev` après TCK-587 (merge `fd4bd805`)

- Conflits textuels : `docs/adr/README.md` (0031 puis 0033), `INDEX.md` (régénéré),
  `User.php` (imports des deux côtés), `types/admin-users.ts` (`two_factor_enabled` à côté des
  profils de 587). Un conflit de types non signalé par git : 587 retire `onQuickAction`
  d'`AdminUsersTable` — retiré du test de la colonne 2FA (`tsc` le disait).
- **Conflit de sens, mesuré** : depuis 587 (ADR-0031 §3), un profil non actif ne confère rien.
  Le récap de l'onboarding agent lisait `GET /api/me/capabilities?agency_id=` alors que le profil
  est `draft` pendant tout l'assistant : la liste devenait **vide** sur le vrai serveur
  (`DraftAgentCapabilitiesTest` rougissait après la fusion : `[]` au lieu des deux capacités),
  tandis que le vitest, sur une réponse simulée, restait vert. Correctif : `GET
  /api/me/agent-profiles/{id}/role-capabilities` (propriétaire du profil seulement) rend la
  **promesse du rôle** — `AgencyRole::capabilityEnums()` —, pas un droit présent ; le front lit
  `useAgentRoleCapabilities(agentProfileId)` et le prop `agencyId` du wizard disparaît.
  `DraftAgentCapabilitiesTest` est remplacé par `AgentRoleCapabilitiesTest`, qui épingle aussi
  que `/me/capabilities` reste vide pour un `draft` (ADR-0031 tenu). Ablation : la route calculée
  par le résolveur (ce que fait `/me/capabilities`) → le cas `draft` rougit.
- `TwoFactorRequirement` attendait « le prédicat que 587 nommera » : c'est
  `MembershipCapabilityResolver::isStaffAt` (profil d'agent ou d'admin **actif**, ou délégation
  active). Le personnel concerné par l'interrupteur d'équipe se juge désormais par lui :
  le délégué l'est, l'agent suspendu ne l'est plus. Test
  `test_le_personnel_est_celui_du_predicat_de_587` ; ablation (profil d'agent de tout statut, sans
  délégation) → rouge.
- **Exécutions** : `php artisan test` sur les 63 fichiers touchés par 587 ou par cette branche →
  **642 verts, 2297 assertions** (208 s, charge 8,6 / 11,6 / 12,2) ; vitest sur les 45 fichiers
  touchés par l'un ou l'autre + `src/components/admin` + `src/components/onboarding` → 95
  fichiers, **742 verts** ; `tsc --noEmit` et `eslint` propres ; Pint propre ; gardes racine
  vertes.
- **Après la fusion, deuxième passe** : 587 a déplacé le geste d'équipe de
  `UserAdminController::block` (protégé ici) vers `TeamMemberSuspensionController`
  (`agencies.php`), contrôleur que la famille `agencies.php` ne listait pas — la garde de
  couverture ne pouvait donc pas le voir. Ajoutés : ce contrôleur à la famille, `suspend` /
  `reactivate` à `AGENCY_TWO_FACTOR` ; et `profiles.php` (suspendre / retirer un agent, TCK-258),
  famille oubliée dès `b045b935`. Les admins de `Tests\Concerns\CreatesAgencyMembers` (587)
  s'incarnent désormais avec leur 2FA, comme ceux d'`actingAsRole` : sans cela, 16 tests de 587
  rendaient `two_factor_required`.
- **Test intermittent trouvé et corrigé** : `AgencyStaffTwoFactorTest` créait une intégration par
  appel, fournisseur tiré au hasard parmi trois ; au second appel d'un même test, l'unicité
  `(provider, agency_id)` rougissait une fois sur trois (`UniqueConstraintViolationException`,
  vu dans la passe de 66 fichiers). Une intégration `wave` par agence ; 5 exécutions de suite
  vertes.
- **Exécutions** : les 66 fichiers (587 + branche + utilisateurs de `CreatesAgencyMembers` et des
  routes `profiles`) → 677 verts, 1 rouge, l'intermittent ci-dessus (332 s, charge 7,2 / 14,2 /
  14,8) ; après correctif, `tests/Feature/Auth/TwoFactor` + les cinq fichiers d'équipe et
  d'autorisation de 587 → 109 verts ; `AgencyStaffTwoFactorTest` ×5 → vert.
- **Ablations** de la deuxième passe : `TeamMemberSuspensionController@suspend` retiré de la liste
  → `ProtectedActionsCoverageTest` rouge ; `AgentProfileController@destroy` retiré → rouge.

### Corrections après vérification adverse (verif-589, 2026-10-07)

Verdict reçu : **refusé**, avec 2 bloquants, 4 majeurs et 8 mineurs. Le statut repasse à `doing`
le temps des corrections. Les sondes du vérificateur sont rejouées depuis le scratchpad, sans être
commitées. Chaque ablation est restaurée par `cp`, avec un contrôle `md5` avant et après.

#### B1 — rôle et déblocage hors de `/api/admin/*`

**Le défaut, confirmé par la sonde `SuperAdminRoleBypassProbeTest`.** Deux routes ne demandaient
ni 2FA ni step-up :
- `PUT /api/users/{u}/role {"role":"super_admin"}`, qui crée un `PlatformProfile` quand l'acteur
  est super-admin ;
- `POST /api/users/{u}/activate`.

Elles vivent dans `users.php`. La règle « profil plateforme ⇒ 2FA » ne visait que
`/api/admin/*`, alors que `Gate::before` ouvre au super-admin **toutes** les policies.

**Le correctif :**
- `STEP_UP_FOR_PLATFORM` gagne `UserRoleController@update` et `UserAdminController@activate`.
- `STEP_UP` gagne `UserSupportController@unlock` : lever un verrou rouvre un compte.
- `RequireTwoFactor` : un profil plateforme sans 2FA est refusé sur **toute** action mutante de
  `AGENCY_TWO_FACTOR` ou de `STEP_UP_FOR_PLATFORM`, quel que soit le fichier de routes.
- `RequireRecentTwoFactor` vise « tout profil plateforme » et non plus le seul `isSuperAdmin()`.
- Nouvelle liste `PLATFORM_POWER_EXEMPT`, motivée ligne à ligne. Elle contient
  `deleteOwnAccount` et l'enrôlement ou la confirmation de la 2FA du coopté.

**La garde, `ProtectedActionsCoverageTest::test_toute_action_qui_confere_un_pouvoir_plateforme_exige_le_step_up`.**
- Elle ne liste pas les contrôleurs : elle les **trouve** dans `app/Http/Controllers`, par ce que
  leur code écrit. Les marqueurs sont l'écriture d'un `PlatformProfile`,
  `'status' => UserStatus::Active` et les services de cooptation et d'amorçage. Elle trouve quatre
  contrôleurs : `UserRoleController`, `UserAdminController`, `SuperAdminTwoFactorController` et
  `SuperAdminInvitationController`.
- Toute route mutante de l'un d'eux, **dans n'importe quel fichier**, doit figurer dans une liste.
- Un plancher assure que la recherche trouve encore `UserRoleController` et `UserAdminController`.
- Le test des orphelines lit aussi `PLATFORM_POWER_EXEMPT`.

**Les tests, dans `PlatformPowerStepUpTest` (5 tests).**
- Un super-admin sans 2FA reçoit 403 `two_factor_required` sur PUT role et sur activate.
- Un jeton super-admin sans step-up reçoit 403 `two_factor_step_up_required` sur PUT role, activate
  et unlock.
- Un super-admin sans 2FA reçoit 403 `two_factor_required` sur `PUT agencies/{a}`, une agence dont
  il n'est pas membre.
- Avec step-up, la promotion et le déblocage passent (200).
- L'admin d'agence change un rôle dans son agence sans step-up.

**Rouge avant correctif.** Les trois fichiers de code ont été remis à `HEAD` (`d63541c1`) par
`git show`, puis restaurés par `cp` (`md5` identiques) : **3 rouges sur 5**. Ce sont les trois
refus ; les deux cas qui passent restent verts.

**Ablations, une à une :**

| Ablation | Résultat |
|---|---|
| `UserRoleController@update` retiré de `STEP_UP_FOR_PLATFORM` | « jeton sans step-up » et la garde de pouvoir plateforme passent au rouge |
| Règle plateforme de `RequireTwoFactor` neutralisée (`false &&`) | « ne modifie pas une agence » passe au rouge |
| `UserSupportController@unlock` retiré de `STEP_UP` | « jeton sans step-up » passe au rouge |

Note sur la deuxième ablation : sans la règle plateforme, le PUT role et l'activate restent
refusés. C'est `RequireRecentTwoFactor` qui rend `two_factor_required` sur toute action de
`STEP_UP_FOR_PLATFORM` sans 2FA. La règle de `RequireTwoFactor` sert donc les actions d'**agence**
ouvertes par `Gate::before`, d'où le test sur `PUT agencies/{a}`.

**Effet de bord voulu.** `PasswordLoginLockTest::test_le_deverrouillage_du_support_agit_enfin`
passe désormais par un jeton avec step-up.

**Exécutions :** `tests/Feature/Auth/TwoFactor` et 53 fichiers qui touchent `users/{u}/role`,
`activate`, `block`, `unlock`, `UserAdmin*`, `UserRole*`, `UserSupport*` ou un super-admin :
- 422 verts et 1 rouge, en 109 s. Le rouge était l'effet de bord ci-dessus.
- Après correction du test, `PasswordLoginLockTest` est vert (6).

#### B2 — par OAuth, un compte à 2FA entrait sans TOTP

**Le défi.** Sonde `OAuthSecondFactorProbeTest` rejouée sur la tête d'avant correctif : rappel
Google d'un super-admin à 2FA → 200 avec jeton, puis console → 200. Elle échoue désormais faute de
jeton : le rappel rend `requires_2fa=true`, sans jeton.

**Correctif — émettre :**
- `OAuthSessionOpener` porte l'ouverture de session des **deux** rappels (`OAuthController`,
  `AbstractOAuthController`). Pour un compte à 2FA, il ne rend pas de jeton mais
  `{data: {requires_2fa, challenge}}` :
  - un secret de 64 caractères ;
  - **haché** en cache (`oauth_2fa:<sha256>`), lié au compte ;
  - valable 5 min ;
  - `pull` au succès, donc à usage unique même sous concurrence ;
  - oublié après 5 seconds facteurs faux.
- `POST /api/auth/oauth/2fa` (`OAuthTwoFactorController`, `throttle:10,1,oauth-2fa`) solde le défi
  avec un TOTP ou un code de secours. Chaque échec compte contre le verrou du compte, comme
  `login`, et `account_locked` est jugé avant.
- Le préfixe du limiteur est voulu. Sans lui, la clé est celle du `throttle:60,1` du groupe : chaque
  appel comptait deux fois, et le cinquième essai rendait 429. Mesuré par le test d'épuisement.

**Correctif — juger :**
- `TwoFactorSession::verified()` : le jeton courant est un `PersonalAccessToken` et porte
  `two_factor_verified_at`.
- `RequireTwoFactor` laisse passer un compte à 2FA **seulement** si sa session est vérifiée.
  Sinon, la requête est jugée comme celle d'un compte sans 2FA. Le refus porte alors
  `two_factor_step_up_required`, et non `two_factor_required` : le remède est de saisir le TOTP sur
  ce jeton (step-up), pas de s'enrôler. `GardeDoubleFacteur` résout déjà ce code sur place, y
  compris pour une lecture.
- `EnsureSuperAdmin` applique le même juge.
- `TwoFactorController@confirm` (enrôlement et renouvellement) et
  `SuperAdminTwoFactorController@confirm` marquent le jeton : le TOTP vient d'y être saisi. Sans
  cela, l'admin qui vient de s'enrôler se voyait redemander son code à l'action suivante.
- ADR-0033 §8 complété.

**Front :**
- `oauthCallback` rend `AuthResponse | OAuthTwoFactorChallenge`, avec le prédicat
  `isOAuthTwoFactorChallenge` et la fonction `oauthSecondFactor`.
- La page de rappel affiche `DefiSecondFacteur` : code à 6 chiffres ou de récupération, mêmes
  libellés que `auth.twoFactorChallenge`, aucune clé neuve. La session ne s'ouvre qu'après le
  défi.

**Les tests :**
- `OAuthSecondFactorTest` (9) :
  - rappels Google et Facebook sans jeton (0 ligne en base) ;
  - défi réussi qui ouvre la console, avec `two_factor_verified_at` posé ;
  - code de secours accepté, puis défi rejoué → 422 `oauth_challenge_invalid` ;
  - cinq faux → 401, puis défi épuisé ;
  - défi inconnu ;
  - jeton sans second facteur d'un super-admin à 2FA : 403 `two_factor_step_up_required` sur la
    console et 403 sur PUT role, puis la console s'ouvre après step-up sur ce jeton ;
  - jeton sans second facteur d'un admin d'agence à 2FA : 403 sur `PUT agencies/{a}` ;
  - l'enrôlement marque le jeton.
- Front, `oauth-callback-second-facteur.test.tsx` (4) : aucune session ni redirection au défi ;
  session ouverte avec le jeton du défi ; code refusé, saisie ouverte ; code de récupération.

**Rouge avant correctif.** Sept fichiers ont été remis à `HEAD` par `git show`, puis restaurés par
`cp` (md5 identiques) : **9/9 rouges**. Page de rappel d'avant correctif : **4/4 rouges**.

**Ablations, chacune restaurée par `cp` :**

| Ablation | Résultat |
|---|---|
| A1 : le défi OAuth retiré (`if (true)` dans `open`) | 5 rouges, dont les deux rappels |
| A2 : `RequireTwoFactor` juge le compte | « action d'agence » rouge |
| A3 : `get` au lieu de `pull` | « ne sert qu'une fois » rouge |
| A4 : défi inépuisable | « s'épuise » rouge |
| A5 : l'enrôlement ne marque pas le jeton | rouge |
| A6 : `EnsureSuperAdmin` seul neutralisé | **vert**, voir ci-dessous |
| A2 + A6 ensemble | « console » et « action d'agence » rouges |
| Front : branche du défi retirée | 4 rouges |

A6 reste vert parce que `RequireTwoFactor` couvre aussi `/api/admin/*` : les deux juges se
recouvrent, comme le docblock d'`EnsureSuperAdmin` le dit.

**Harnais de test.** `TestCase::be()` sert un compte à 2FA incarné **sans jeton** comme après une
connexion à deux facteurs. Il lui donne un jeton non enregistré, second facteur saisi il y a une
heure, donc step-up expiré comme avant. Ce jeton est posé aussi sur la garde `sanctum`. Sans cela,
`auth:sanctum` relit la garde `web` et substitue un `TransientToken`.
- Le compte suivant, sans 2FA, fait oublier la garde `sanctum`. Sans cet oubli, trois tests qui
  changent d'acteur agissaient encore au nom du premier (mesuré : `AgencyUpgradeRequestSubmissionTest`,
  `AgencyTeamInvitationListingTest`).
- `Sanctum::actingAs` passe un mock de jeton que le juge tient pour vérifié. Ce cas ne se
  produit qu'en test. Un jeton réel sans la colonne est refusé, et c'est ce que les tests B2
  éprouvent.

**Rattrapage de B1.** Trois tests incarnaient un super-admin **sans 2FA** sur une action
d'`AGENCY_TWO_FACTOR` et rougissaient depuis `cff6b739`. Ils n'étaient pas dans la passe de B1.
On leur donne la 2FA (`withTwoFactor()`) : c'est le comportement voulu par B1.
- `PayoutStoreAuthorizationTest::test_a_super_admin_creates` ;
- `AgencyMembersListTest`, 7 tests ;
- `WatermarkActivationTest::test_activation_through_the_api_queues_the_regeneration`.

**Exécutions :**
- `tests/Feature/Auth` + 4 fichiers : 314 verts.
- 78 fichiers qui incarnent un compte à 2FA, un admin, `CreatesAgencyMembers` ou un vrai jeton :
  732 verts et 3 rouges, en 154 s, charge 4,1 / 5,1 / 8,9. Les 3 rouges étaient le défaut du
  harnais ci-dessus.
- 44 autres fichiers qui touchent un super-admin : 388 verts et 8 rouges, en 238 s. Les 8 rouges
  sont le rattrapage B1 ci-dessus.
- Après correction : les fichiers concernés plus `tests/Feature/Auth`, 332 verts, puis 24 verts.

#### M1 — verrou perpétuel posé par un tiers

**Le défaut, rejoué par la sonde `LockProbeTest`.** Limiteurs actifs, une seule IP :
- Avant : 10 × `verify-code` sans code demandé → 422 ×10, puis le **bon** mot de passe → 423, aux
  trois cycles.
- Après : 422 ×4 puis 429 ×6, puis le bon mot de passe → **200**.

La même sonde montre que le croisement e-mail ↔ numéro (m3) est fermé. Après le verrou du
mot de passe de `cible@`, son numéro rend le même 422 que les autres.

**Correctif, un volet par point :**
- **(a)** `PhoneVerificationService::hasCodeFor()`. Sans code en cours pour ce numéro,
  `PhoneLoginService::verify` rend 422 `phone_code_invalid` **sans écriture**.
- **(b)** Un verrou par canal. `PhoneLoginService` ne lit et n'écrit plus que le verrou du
  **numéro**, avec ou sans compte. Le code faux et le TOTP faux par téléphone comptent du côté du
  numéro. Un succès par téléphone ne lève plus le verrou du mot de passe.
  `UserSupportService::unlock` lève les deux.
- **(c)** Le limiteur `auth-phone-verify` passe de 10 à **4** par 15 min et par numéro
  (`AppServiceProvider::PHONE_VERIFY_PER_WINDOW`). Les échecs du numéro se comptent dans une
  fenêtre **fixe** de 15 min (`add` puis `increment`, au lieu d'un `put` qui repoussait l'échéance).
- **Pourquoi la moitié, et non « strictement inférieur » :** deux fenêtres de limiteur contiguës
  (5 + 5 = 10 avec la valeur d'exemple) tiennent dans une même fenêtre de verrou. À 4, leur somme
  (8) reste sous le seuil.
- **(d)** `PasswordLoginLockTest::test_un_tiers_ne_peut_pas_verrouiller_indefiniment` est retiré :
  il restait vert avec le défaut. Il est **réécrit** dans `ThirdPartyLockTest` sur la séquence du
  vérificateur, limiteurs actifs, avec une seule IP d'attaque et sans SMS : le titulaire entre aux
  trois cycles.
- ADR-0033 §6 est réécrit. Il écrit aussi ce qui reste : le canal mot de passe peut encore être
  fermé par qui connaît l'e-mail (dix essais en vingt minutes depuis une IP). Le titulaire garde
  alors le téléphone, OAuth et le support.

**Les tests, dans `ThirdPartyLockTest` (8) :**
- la séquence du vérificateur, sur trois cycles ;
- un code faux sans code en cours n'écrit rien (12 essais) ;
- le verrou du numéro ne ferme pas le mot de passe ;
- le verrou du mot de passe ne ferme pas le téléphone, et le téléphone ne le solde pas ;
- le limiteur est sous la moitié du seuil ;
- avec des codes réellement demandés, sur trois cycles, le numéro ne se verrouille pas ;
- fenêtre fixe : 5 échecs, puis 4 à +14 min, puis 5 à +16 min, et pas de verrou ;
- le support lève le verrou du numéro.

**Tests adaptés dans `PhoneLoginRateLimitTest` :**
- le verrou à 10 se pose sur des codes en cours, un code demandé toutes les cinq saisies ;
- le limiteur est lu par sa constante.

**Rouge avant correctif.** Cinq fichiers ont été remis à `HEAD`, avec la constante injectée à 10
(sa valeur d'avant), puis restaurés par `cp` (md5 identiques) : **8/8 rouges**.

**Ablations, chacune restaurée par `cp` :**

| Ablation | Résultat |
|---|---|
| (a) retiré | « sans code en cours » rouge |
| (b) le code faux compte contre le compte | 2 rouges |
| (b) le téléphone lit le verrou du compte | 2 rouges |
| (c) limiteur remis à 10 | « moitié du seuil » rouge |
| (c) fenêtre glissante | « fenêtre fixe » rouge |
| `unlock` sans le numéro | rouge |
| (a), (b) et (c) ensemble | la séquence du vérificateur, rouge : 423 |

Pris seul, aucun volet ne rougit la séquence du vérificateur : ils se recouvrent.

**Exécutions :**
- `tests/Feature/Auth` et `UserSupportTest` : 307 verts et 3 rouges. Ce sont les deux tests de
  `PhoneLoginRateLimitTest` qui supposaient l'ancien comportement, ci-dessus.
- Après adaptation : `tests/Feature/Auth/Phone` 30 verts, `ThirdPartyLockTest` 8 verts.

#### M2 — redirection ouverte par un caractère de contrôle

**Le défaut.** La sonde `verif589-redirection.test.ts` le reproduisait : `destinationInterne`
jugeait la chaîne **brute**, alors que le navigateur résout la chaîne **nettoyée**. Le parseur
d'URL retire tabulations et sauts de ligne, si bien que `/\t/evil.com` devient `//evil.com`, un
autre hôte. La sonde est verte après correctif (3/3).

**Le correctif, dans `src/lib/redirection-interne.ts`.** `destinationInterne` procède en trois
temps :
1. elle refuse d'abord tout contrôle C0, DEL ou antislash ;
2. elle **résout** ensuite par `new URL(brute, 'https://x.invalid')` et exige la même origine ;
3. elle rend enfin `pathname + search + hash`, c'est-à-dire ce qui a été jugé, jamais l'entrée.

**Les appelants, relevés un à un.** Le correctif tient en une seule fonction parce que tous les
lecteurs de `redirect=` passent par elle (`grep` de `get('redirect')`, `redirect=` et
`router.push|replace`) :
- par `destinationInterne` ou `avecRedirection` : la connexion, y compris le lien « Créer un
  compte » et l'entrée téléphone ; l'inscription ; `verify-email` ; le rappel OAuth ;
  `intention-oauth` ; `/onboarding/intention` ; `lien-connexion` et `RetourAuth` ;
- hors de la question :
  - `GardeDoubleFacteur` ne lit aucune destination ;
  - `EnrolementDoubleFacteurExige` reçoit une destination écrite en dur (`/super-admin` ou
    `/app`) ;
  - `proxy.ts` **pose** `redirect=<pathname>` sans le lire, et son lecteur, la connexion, filtre.
- **Signalé, hors du périmètre** : `PropertyContactMessageDialog` suit `redirect_to` rendu par
  l'API, une valeur du serveur et non de l'URL.

**Les tests.** Ils vivent dans `redirection-interne.test.ts`, qui passe de 13 à 19 tests :
- six formes refusées : les quatre du vérificateur, plus `\r` et `\u0000` ;
- la destination rendue est la forme résolue et reste sur le site (`/app/../../evil.com`,
  `/%2F%2Fevil.com`, etc.) ;
- `/app/./biens/../baux` est rendu `/app/baux`.

**Rouge avant correctif** : le fichier d'avant, rejoué, donne **5 rouges**. `"/\\/evil.com"` était
déjà refusé par l'ancien test de l'antislash initial.

**Ablations, chacune restaurée par `cp` :**

| Ablation | Résultat |
|---|---|
| Origine non jugée | `//evil.tld` passe au rouge |
| Caractères non filtrés | `/\u0000/evil.com` passe au rouge |
| Chaîne brute rendue | « forme résolue » passe au rouge |

Les deux premières se recouvrent : les autres formes à tabulation sont rattrapées par le jugement
d'origine.

**Exécutions** : `(auth)`, `components/auth`, `onboarding`, `src/lib`, `proxy` et
`components/home` donnent **121 fichiers, 1353 tests verts**. `eslint` et `tsc` sont propres.

#### M3 — `send-otp` comme relais de SMS

**Le défaut, rejoué par la sonde `SendOtpRelayProbeTest`** (drapeau éteint, limiteurs actifs) :
six comptes, une IP, six numéros étrangers. Avant : 200 ×6 et 7 SMS remis. Après : **422 ×6**, et
un seul SMS remis, celui du numéro sénégalais de l'oracle. L'oracle `409 phone_taken` est m4.

**Correctif :**
- **Liste blanche** `sms.otp_allowed_country_codes`, `SMS_OTP_ALLOWED_COUNTRY_CODES`, défaut `221`.
  - `PhoneVerificationService::countryAllowed()` est jugé par `send-otp` / `resend` **avant
    d'écrire** le numéro, et par `request-code`. Hors liste, la réponse est 422
    `phone_country_not_allowed`. Le refus est ouvert à `request-code` : l'indicatif ne dit rien
    d'un compte.
  - Il est **répété** dans `issue()`, si bien qu'aucun chemin d'envoi de code ne sort de la liste.
- **Limiteur** `auth-phone-send` (3 / 15 min et 5 / 24 h par numéro destinataire, 20 / h par IP)
  posé aussi sur `phone/send-otp` et `phone/resend`, à côté de `throttle:3,1`. Les assistants
  d'onboarding passent par ces deux routes.
  - La clé du numéro prend le numéro **du compte** quand le corps n'en porte pas. Une clé vide
    aurait mis tous ces envois dans un même seau.
- **Plafond global journalier** `sms.otp_daily_cap` (`SMS_OTP_DAILY_CAP`, défaut 2000, soit environ
  100 € par jour au tarif « default » le plus cher de la grille). Il est compté avant l'envoi,
  dans une fenêtre UTC.
  - Plafond atteint : `send-otp` rend 503 `sms_capacity_reached`, et `request-code` reste muet
    (202, pour l'énumération).
  - `Log::alert` est émis une seule fois par jour.
- Clés `auth.phone.country_not_allowed` et `auth.phone.capacity_reached` (fr/en/wo), en ajout.
- Le front affiche la prose localisée de Laravel (`messageErreurApi`) : aucune clé neuve.
- ADR-0033 §6 : trois lignes au tableau et le motif.

**Décision du porteur appliquée** : la diaspora n'est plus servie par défaut. Elle s'ajoute par
configuration. Les trois tests de forme de `PhoneVerificationTest` (`+33…`, `+39…`) posent donc la
liste qu'ils éprouvent.

**Les tests, dans `SmsOtpRelayTest` (7) :**
- la séquence du vérificateur : 422 ×6, 0 SMS, rien d'écrit ;
- une IP relaie au plus 20 codes, 25 comptes donnant 20 × 200 puis 5 × 429 ;
- un numéro reçoit au plus 3 codes, même depuis quatre IP ;
- sans corps, la clé est le numéro du compte : un second compte n'est pas bloqué ;
- le plafond à 2 rend 503 ×2, remet 2 SMS, alerte une fois, et le compteur repart le lendemain ;
- `request-code` hors liste rend 422 et n'envoie rien ;
- un indicatif ajouté par configuration est servi.

**Rouge avant correctif.** Six fichiers ont été remis à `HEAD`, puis restaurés par `cp` (md5
identiques) : **6/7 rouges**. Le test d'un indicatif ajouté par configuration est vert
(tout passait).

**Ablations, chacune restaurée par `cp` :**

| Ablation | Résultat |
|---|---|
| Liste blanche ouverte | 2 rouges |
| `send-otp` sans le limiteur nommé | 3 rouges |
| Clé sans repli sur le compte | « sans corps » rouge |
| Plafond retiré | « plafond » rouge |
| Le contrôleur écrit avant de juger | la séquence est rouge : le numéro est écrit |

**Exécutions** : 16 fichiers qui envoient un code : 118 verts et 3 rouges, les trois tests de forme
ci-dessus. Après correction, `PhoneVerificationTest` donne 22 verts et `SmsOtpRelayTest` 7.

#### M4 — familles hors des listes, et une garde qui apparie par contrôleur

**Déjà fait par `d845fcde`** : `profiles.php` dans `FAMILIES`, et
`AgentProfileController@suspend` / `@destroy` dans `AGENCY_TWO_FACTOR`. La sonde
`TeamFamilyGapProbeTest` rendait 200 / 204 sur `e59cb8b2` ; elle rend 403 depuis.

**Ce commit :**
- La garde apparie désormais **par contrôleur**. Les contrôleurs d'une famille sont ceux que
  déclarent les fichiers de `FAMILIES` (filtrés), plus `FAMILY_CONTROLLERS`. Ensuite, **toute
  route enregistrée** de l'un d'eux, quel que soit son fichier, doit être dans
  `AGENCY_TWO_FACTOR` ou dans `EXEMPT`. Un plancher exige `AgentProfileController` et
  `LeaseDepositRefundController` dans la famille calculée.
- Décision du porteur : `FAMILY_CONTROLLERS` reçoit `BookingPaymentController` et
  `LeaseDepositRefundController`. Leurs actions `@refund` et `@store` (caution) entrent dans
  `AGENCY_TWO_FACTOR`. `BookingPaymentController@store` entre dans `EXEMPT` : c'est le client qui
  paie, l'argent entre.
- **Trouvé par l'appariement lui-même** : `DELETE api/auth/account`
  (`UserAdminController@deleteOwnAccount`, dans `auth.php`). C'est une route d'un contrôleur de
  famille hors de son fichier, que la garde par fichier ne voyait pas. Elle est exemptée avec son
  motif : le compte s'efface lui-même.

**Les tests, dans `MoneyOutTwoFactorTest` (4) :**
- un admin sans 2FA reçoit 403 `two_factor_required` sur `PATCH profiles/{p}/suspend` et
  `DELETE profiles/{p}`, et le profil reste actif ;
- même 403 sur `deposit-refund`, sans restitution ;
- même 403 sur `booking-payments/{p}/refund`, sans remboursement ;
- avec la 2FA, la caution est restituée (201).

**Rouge avant correctif :**
- Avec le `ProtectedActions` d'avant ce commit : 2 rouges, les deux remboursements.
- Avec celui de `e59cb8b2` : 3 rouges, les remboursements et l'équipe.

**Ablations, restaurées par `cp`** : `LeaseDepositRefundController@store` est retiré de la liste.
- La nouvelle garde (par contrôleur) **rougit** et nomme la route.
- La garde d'avant (par fichier), rejouée sur la même liste, reste **verte**. C'est l'angle mort
  que M4 décrivait.

**Exécutions** : 19 fichiers qui touchent un remboursement, un profil ou une suspension donnent
173 verts. `tests/Feature/Auth/TwoFactor` et 3 fichiers donnent 81 verts.

#### Fusion d'`origin/dev` après TCK-588 (merge `442050b3`)

**Conflits, résolus vers les formes de 588 :**
- Les refus levés passent à `abort_code()`. Clés concernées : `support.account_not_locked`,
  `invitation.phone_mismatch` (ajoutée à `errors.php`, fr/en/wo), `invitation.email_mismatch`,
  `phone.*` et `two_factor.*`.
- Ma branche de renouvellement de `TwoFactorController` et le 409 `isVerifiedElsewhere` de
  `resend` sont conservés, écrits dans la forme de 588.

**`AuthRefusal::abort()` disparaît.** La garde de prose le refusait (forme f,
`new HttpResponseException` nu). Ses deux appelants changent :
- `markVerified()` lève `abort_code(409, 'phone.taken')`. Aucun fichier du front ne lisait
  `phone_taken` (mesuré par `grep`). `PhoneNumberUniquenessTest` asserte désormais `phone.taken`
  sur la vérification et l'onboarding.
- `SessionTokenIssuer` lève `auth.account_blocked` en dernier recours. Chaque chemin d'entrée
  refuse avant lui, avec le code plat `account_blocked` que lit `ConnexionParTelephone`. Le défi
  OAuth (`OAuthSessionOpener::complete`) gagne ce contrôle préalable : un compte bloqué entre le
  rappel et le défi garde la même réponse que partout ailleurs.

Les codes plats de `AuthRefusal::response()` restent le contrat du front. Leur passage à
`<domaine>.<code>` se fera d'un bloc, front compris : c'est noté dans son docblock.

**Exécutions** : la garde de prose, `tests/Feature/Auth` (321 verts), les invitations,
l'onboarding, le support et `tests/Unit/Lang` (188 verts). Les 40 fichiers de test apportés par
la fusion donnent 286 verts. Toutes les gardes racine passent, ainsi que lint, `tsc` et vitest
sur `src/lib` et `src/components/auth` (1159 verts).

#### Raccord TCK-588 et m1 (texte) — le SMS d'invitation passe par `ContactSansCompte`

- Le SMS d'invitation part par `NotificationService::send(ContactSansCompte::fromInvitation(…))`,
  avec deux codes neufs, `invitation.received` et `invitation.reminder` (`reachesContacts`,
  non `mobile`). Il hérite ainsi de la limite **par numéro** de `SmsChannel`, et n'écrit
  aucune ligne de cloche.
- **Décision : le SMS part au numéro, même si un compte l'a vérifié.** L'invitation est adressée
  au numéro. Elle prend la langue de ce compte, comme `ContactSansCompte::fromCustomer` le fait
  pour un client lié. Écrire au `User` ne la remettrait pas : `CodedNotification` n'ouvre un
  canal mobile qu'à un code `mobile()` qui a un interrupteur.
- **m1 (texte)** : le SMS ne porte plus le nom de l'invitant, que celui-ci édite. Il porte le nom
  de l'agence, filtré par `InvitationService::smsAgencyName()` : lettres, chiffres, espaces et
  `' - & , ( )`. Ni `:`, ni `/`, ni `.`, pour qu'aucun lien ne puisse s'y former. Le nom est
  tronqué au rendu (`SMS_TEXT_MAX` = 32). Les clés `invitations.sms.*`, posées par ce ticket,
  sont retirées.
- **Différence de comportement à connaître** : `CodedNotification` n'est pas critique, si bien
  qu'un SMS d'invitation émis entre 22 h et 6 h (Dakar) part à 6 h. Il partait avant
  immédiatement, avec `is_critical`. Le lien reste valable 7 jours.

**Test `InvitationSmsContentTest` (4)** : la sonde du vérificateur (invitant « Votre compte Wave
est suspendu, rappelez le +221… », agence dont le nom porte `<b>`, `http://evil.example/x`)
donne un SMS sans l'un ni l'autre, avec un nom de 32 caractères au plus. Les autres cas : le
code `invitation.received` sans ligne de cloche, le rappel sous `invitation.reminder`, et la
limite par numéro du canal.
**Rouge sur `442050b3`** : 4 rouges.
**Ablations, restaurées par `cp`** (empreinte md5 vérifiée) :
- filtre du nom retiré → 1 rouge (`…filtre et tronque`) ;
- rappel envoyé sous `invitation.received` → 1 rouge (`…son propre code`).
