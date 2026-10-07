# ADR-0033 — Le numéro de téléphone vérifié est un identifiant de connexion, à côté de l'e-mail

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-589](../backlog/tickets/TCK-589-entree-telephone-2fa-sessions-onboarding.md)
- **Précise** : [ADR-0010](0010-auth-token-sanctum-en-cookie.md) (le jeton Sanctum porté par cookie
  reste le seul transport de session ; ce qui change est **comment on l'obtient** et **combien de
  temps il vit**).

## Contexte

Mesuré le 2026-10-07 sur `origin/dev` (`5f872f1f`) :

- **On n'entre que par l'e-mail.** `LoginRequest` exige `email` (`app/Http/Requests/Auth/LoginRequest.php:25`),
  `AuthController::login` cherche par e-mail (`AuthController.php:48`), `RegisterRequest` exige un
  e-mail unique (`RegisterRequest.php:27`). Or le visiteur sénégalais type a un numéro de téléphone
  et pas toujours une adresse qu'il consulte ; l'analyse par acteur du 2026-10-06 (V7, C10, P9) en
  fait la première friction d'entrée.
- **Le téléphone n'est rien de plus qu'une colonne libre.** `users.phone` n'a **aucune unicité**
  (`2026_04_15_210400_add_fields_to_users_table.php:23`), et cinq chemins posent `phone_verified_at`
  sans regarder si un autre compte a déjà vérifié le même numéro (`PhoneVerificationController.php:28`,
  et les quatre services d'onboarding). Le même numéro peut aujourd'hui être **vérifié sur deux comptes**.
- **Le code n'est envoyé à personne.** `PhoneVerificationService::sendSms()` est un pilote `log-stub`
  qui écrit le code dans le journal (`PhoneVerificationService.php:74-84`) ; hors `production` le code
  revient dans la réponse HTTP (`debug_code`) et quatre onboardings acceptent `123456`. Le relais réel
  (`SmsRouterDriver`, pilotes Orange / LAfricaMobile / Mtarget) existe et n'est pas branché.
- **`users.email` est `NOT NULL`** (`0001_01_01_000000_create_users_table.php:17`) alors que
  `docs/models-spec.md` §1 le déclare nullable depuis l'origine. Deux index d'unicité le couvrent :
  `users_email_unique` (exact) et `users_email_lower_unique` (`LOWER(email COLLATE "und-x-icu")`,
  ADR-0025). PostgreSQL n'y compte pas les `NULL` comme des doublons.
- **Rien ne verrouille un compte.** `metadata.locked_at` / `failed_login_attempts` ne sont écrits par
  personne ; seul `UserSupportService::unlock` les lit, et rend donc toujours 409. La connexion n'est
  bornée que par IP (`throttle:5,10`).

Le **2026-10-06**, le porteur a tranché : *« oui, mais implémente tout »* — la connexion par téléphone
est livrée **entière**, testée drapeau allumé, et reste derrière un drapeau faux par défaut.

## Décision

**Un compte s'ouvre et se rouvre par son numéro de téléphone vérifié OU par son e-mail ; aucun des
deux n'est obligatoire, mais un compte en a toujours au moins un. Un numéro vérifié n'appartient
qu'à un compte. La preuve est un code à usage unique envoyé par SMS ; un numéro non vérifié ne prouve
rien.**

### 1. Le drapeau, et ce qu'il couvre

- `config('auth.phone_login.enabled')` (`PHONE_LOGIN_ENABLED`), **faux par défaut**. Éteint, les
  routes `POST /api/auth/phone/request-code` et `POST /api/auth/phone/verify-code` rendent **404**, les
  `Invite*Request` exigent l'e-mail, et le front n'affiche pas l'entrée par téléphone (il le lit dans
  `GET /api/auth/oauth/providers` → `data.phone_login`).
- **Le drapeau ne couvre que l'entrée sans e-mail.** Tout ce qui corrige un défaut vaut drapeau
  éteint : le code part réellement, `123456` et `debug_code` disparaissent, le numéro vérifié est
  unique, le compte bloqué ne rentre plus, le verrou du mot de passe, l'inscription qui connecte, les
  sessions bornées, la 2FA exigée.
- **L'allumage est un geste d'exploitation**, environnement par environnement (onglet Dokploy,
  ADR-0028), par une personne, **après un envoi réel mesuré** dans cet environnement (un code demandé
  sur un numéro de test, reçu, avec la trace du fournisseur). Aucun code ne l'allume.

### 2. Identifiant

- **`users.email` devient nullable.** Les deux index d'unicité restent valides tels quels (un `NULL`
  n'entre pas en collision). La spec (`models-spec.md` §1) disait déjà nullable : c'est le schéma qui
  s'aligne, pas la spec qui bouge.
- **Index unique partiel `users_phone_verified_unique`** sur `phone`
  `WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL`. Seul le numéro **vérifié** est unique :
  un numéro saisi et jamais vérifié ne réserve rien, et un compte supprimé (soft delete) libère le sien.
- **Un seul écrivain de `phone_verified_at`** : `PhoneVerificationService::markVerified(User, string)`,
  qui **teste avant d'écrire** et lève **409 `phone_taken`** si le numéro est vérifié ailleurs. Jamais
  d'attrape de `UniqueConstraintViolationException` : sous PostgreSQL, l'erreur abandonne la transaction
  entière (piège n° 1 de `CLAUDE.md`). L'index est la garde de dernier recours, pas le mécanisme.
- Le numéro est stocké et comparé sous sa forme E.164 normalisée (`PhoneNumber::normalize`), que
  `TelephoneJoignable` a déjà validée (TCK-566, TCK-574).

### 3. Un numéro non vérifié ne prouve rien (option retenue par défaut)

La connexion par téléphone ne se rattache **qu'à** un compte dont ce numéro est vérifié. Si aucun
compte ne l'a vérifié — même si un ou plusieurs comptes le portent sans l'avoir vérifié — elle **crée
un compte neuf** au premier code valide (`phone_verified_at` posé, `email` nul, mot de passe aléatoire,
`password_set_at` nul). **Aucune fusion automatique.** L'ancien compte qui tente ensuite de vérifier ce
numéro reçoit 409 `phone_taken`.

### 4. L'e-mail facultatif, et ce qui en dépendait

| Ce qui supposait un e-mail | Sort pour un compte sans e-mail |
|---|---|
| Réinitialisation du mot de passe | Sans objet : le compte n'a pas de mot de passe choisi ; il rentre par téléphone. |
| Step-up de suppression de compte (TCK-272) | Le code part **par SMS** au numéro vérifié, même service d'envoi que la vérification. |
| Notifications `toMail()` (39 classes) | `User::routeNotificationForMail()` rend `null` sans e-mail ; le canal `mail` de Laravel n'envoie rien et ne lève pas. |
| Résumés quotidiens (`Mail::to($user->email)`) | Sautés quand l'e-mail manque. |
| Invitations (`Mail::to()`) | Parties par SMS au **numéro** quand l'invitation n'a pas d'e-mail (drapeau allumé). |

Un compte créé par téléphone **ne peut revenir que par téléphone** tant qu'il n'a pas d'e-mail : c'est
pourquoi les invitations sans e-mail suivent le même drapeau.

### 5. Le code

- 6 chiffres, `random_int`, TTL **5 min**, **usage unique**, comparé par `hash_equals`, stocké **haché**
  en cache (`hash_hmac('sha256', …, APP_KEY)`). Le code n'apparaît **dans aucune réponse, dans aucun
  environnement**, `testing` compris : les tests le lisent par un faux `SmsRouterDriver` lié dans le
  conteneur (`Tests\Support\FakeSmsRouter`).
- Envoi **direct** par `SmsRouterDriver`, contexte `is_critical = true`, `bypass_quiet_hours = true`,
  `event_type = phone_otp`. **Jamais par `SmsChannel`** : ce canal refuse à dessein tout destinataire
  dont `phone_verified_at` est nul, or le destinataire d'un code l'est par construction. Le texte est
  une clé `auth.phone.sms_code`.
- **5 échecs sur un même code l'invalident** ; il faut en redemander un. Vaut pour la vérification du
  profil comme pour la connexion.

### 6. Limiteurs et verrou

| Borne | Valeur | Où |
|---|---|---|
| Délai entre deux envois au même numéro | 60 s | service (cache) |
| `auth-phone-send` — par numéro | 3 / 15 min **et** 5 / 24 h | limiteur nommé |
| `auth-phone-send` — par IP | 20 / h | limiteur nommé |
| `auth-phone-send` posé aussi sur `phone/send-otp` et `phone/resend` (M3) | mêmes bornes, numéro destinataire = corps, sinon numéro du compte | limiteur nommé |
| Indicatifs servis pour un code (M3) | liste blanche, défaut `221` (`sms.otp_allowed_country_codes`) ; hors liste 422 `phone_country_not_allowed`, rien n'est écrit ni envoyé | appelants + `issue()` |
| Plafond global des codes (M3) | 2000 / jour UTC (`sms.otp_daily_cap`) ; atteint : 503 `sms_capacity_reached` (202 muet à `request-code`), alerte au journal une fois | service (cache) |
| `auth-phone-verify` — par numéro | **4** / 15 min (sous la moitié du seuil, M1) | limiteur nommé |
| Échecs sur un même code | 5 → code invalidé | service |
| Échecs avant verrou, **par canal** | **10** | mot de passe : `metadata.failed_login_attempts` ; téléphone : cache, par numéro, fenêtre fixe de 15 min |
| Durée du verrou | **15 min**, calculée depuis `metadata.locked_at` | lu avant toute vérification |

- **Le plafond Orange de 3 SMS / jour / MSISDN** (`SmsRouterDriver.php:127-138`) est compté : la borne
  journalière par numéro (5) le dépasse de deux envois, que le routeur fait passer par le fournisseur
  suivant de la chaîne. Une borne à 3 aurait laissé un utilisateur bloqué un jour entier après trois
  codes non reçus.
- **Un verrou par canal** (révisé après vérification adverse M1, 2026-10-07).
  - Le **mot de passe** verrouille le compte. Un second facteur faux saisi derrière lui, ou
    derrière un rappel OAuth, compte du même côté.
  - Le **téléphone** verrouille le **numéro**, en cache, qu'un compte l'ait vérifié ou non. Le 423
    tombe donc au même seuil dans les deux cas, et ne dit rien de l'existence d'un compte.
  - Chaque verrou pose `423 account_locked` tant qu'il court et est **lu avant** la vérification du
    secret : le bon secret n'y échappe pas.
  - Le verrou **expire seul** au bout de 15 min. Un succès sur un canal ne solde pas l'autre.
  - Le geste « Déverrouiller » de la console (`UserSupportService::unlock`) lève les deux.
- **Ce que M1 a corrigé.** Les deux canaux partageaient le verrou du compte. Un tiers qui
  connaissait le numéro vérifié saisissait dix codes faux sans qu'aucun code ait été demandé (le
  limiteur valait 10 / 15 min, exactement le seuil). Il fermait ainsi la porte du **mot de passe**
  à chaque échéance, depuis une IP et sans dépenser un SMS. Trois volets ferment ce passage :
  - **(a)** un code faux ne compte que si un code est **en cours** pour ce numéro. Sinon, la
    réponse est 422, sans aucune écriture.
  - **(b)** un canal ne ferme pas l'autre.
  - **(c)** le limiteur de vérification vaut **4** par 15 min et par numéro, strictement sous la
    **moitié** du seuil. Les échecs du numéro se comptent dans une fenêtre **fixe** de 15 min.
    Deux fenêtres de limiteur contiguës peuvent tomber dans une même fenêtre de verrou, et leur
    somme (8) reste sous le seuil. Un tiers ne peut donc plus poser le verrou du numéro.
- **Ce qui reste, écrit pour ne pas être découvert.** Le canal mot de passe peut encore être
  verrouillé par qui connaît l'e-mail : `throttle:5,10` par IP, un compteur sans fenêtre, et donc
  dix essais en vingt minutes depuis une IP. Le titulaire garde alors le téléphone et OAuth, et le
  support peut lever le verrou. C'est ce que « un verrou par canal » achète, à défaut d'un verrou
  qu'aucun tiers ne pourrait poser.
- **Un code part par un VRAI SMS** (§5) : sans borne par destinataire ni liste d'indicatifs, un
  formulaire public devient un relais de « SMS pumping » vers des numéros surtaxés. C'est la
  vérification adverse M3, qui l'a reproduit : six comptes, une IP, six numéros étrangers, six SMS
  remis, drapeau éteint. D'où les trois lignes M3 du tableau.
  - La diaspora s'ajoute par configuration, indicatif par indicatif.
  - Le plafond global borne la perte d'un jour à un montant connu.
- **Aucune réponse ne laisse deviner si le numéro a un compte** : `request-code` rend 202
  `{retry_after}` identique dans les deux cas.

### 7. Canal : SMS seul (option retenue par défaut)

WhatsApp est exclu pour le code : `features.md` §2.3 le met hors périmètre (modèle d'authentification
Meta à faire approuver, SMS de secours obligatoire). C'est une amélioration future, pas un défaut.

### 8. Interaction avec la 2FA TOTP

Le code SMS prouve la **possession du numéro** ; il remplace le mot de passe, **pas** le second facteur.
Un compte `two_factor_enabled` reçoit `{requires_2fa: true}` après un code valide et doit reposter avec
un TOTP ou un code de secours — le même défi que la connexion par mot de passe. Le code SMS n'est
**jamais** accepté comme second facteur d'une connexion par mot de passe : deux facteurs qui
reposeraient sur le même téléphone n'en feraient qu'un.

**Ajouté après vérification adverse (B2, 2026-10-07) : la 2FA exigée juge la SESSION, pas le
compte.** `two_factor_enabled` dit qu'un TOTP est configuré. Il ne dit pas que le jeton a été
obtenu avec ce TOTP.

Par OAuth, un compte à 2FA recevait un jeton sans saisir de TOTP, et ce jeton ouvrait la
console. Deux règles ferment ce passage :

- **Aucun chemin d'entrée n'émet le jeton d'un compte à 2FA sans son second facteur.**
  - Le mot de passe et le téléphone posaient déjà un défi.
  - Les rappels OAuth rendent désormais `{requires_2fa, challenge}`. Le défi est un secret haché
    en cache, lié au compte, valable 5 min, à usage unique, oublié après 5 échecs.
  - Ce défi se solde par `POST /auth/oauth/2fa`.
- **Le jeton porte la preuve.** `personal_access_tokens.two_factor_verified_at` est posé à
  l'émission quand un second facteur vient d'être saisi, puis renouvelé par le step-up et par
  l'enrôlement.
  - **Présent**, il vaut « session à deux facteurs ». C'est ce que jugent `RequireTwoFactor` et
    `EnsureSuperAdmin` (`TwoFactorSession`).
  - **Récent (10 min)**, il vaut step-up.
  - Un compte à 2FA dont le jeton n'en porte pas reçoit `two_factor_step_up_required`. Le front
    résout ce refus sur place, en demandant le TOTP.

## Alternatives écartées

- **Rattacher la connexion par téléphone au compte qui porte le numéro, même non vérifié.** Le numéro
  a pu être saisi par erreur, ou par un tiers (une agence qui crée une fiche client) : se connecter
  dessus livrerait le compte de quelqu'un d'autre. Écarté au profit de la contrainte 2 du ticket.
- **Fusion automatique de deux comptes qui partagent un numéro.** Irréversible, et elle décide à la
  place des deux humains. Hors périmètre (support).
- **Unicité de `users.phone` tout court.** Des doublons non vérifiés existent sans doute en base
  (fiches saisies) ; l'unicité totale aurait exigé de les purger, et aurait laissé un numéro saisi
  par erreur bloquer son vrai titulaire.
- **Attraper la violation d'unicité** au lieu de tester avant d'écrire : abandonne la transaction sous
  PostgreSQL, et le message accuse la requête suivante.
- **Faire passer le code par `SmsChannel`** : le message serait abandonné sans erreur (`return null`)
  pour tout numéro non vérifié — c'est-à-dire pour tous.
- **Livrer par morceaux, ou allumer le drapeau par défaut** : refusé par le porteur le 2026-10-06 ;
  le drapeau existe pour que l'allumage suive un envoi réel mesuré, pas pour retarder du code.
- **Un verrou permanent jusqu'au geste du support** : un tiers pourrait bloquer n'importe quel compte
  en dix essais.

## Conséquences

- **Un compte sans e-mail existe.** Tout code qui lit `$user->email` comme une chaîne doit supporter
  `null` ; l'inventaire (`grep -rn "Mail::to(" app`, les `toMail()`) est traité par TCK-589, et un test
  prouve qu'une notification à un compte sans e-mail ne lève pas.
- **Le même humain peut avoir deux comptes** (un par e-mail, un par téléphone) s'il a vérifié son
  numéro sur l'un et pas sur l'autre. C'est le prix de la contrainte 2 ; la fusion est un geste du
  support, hors de ce ticket.
- **Un coût par connexion** : chaque entrée par téléphone dépense un SMS, borné par les limiteurs
  ci-dessus. L'envoi est imputé à la plateforme (pas d'`agency_id` dans le contexte).
- **La migration d'index échoue si des doublons vérifiés existent déjà** : la commande de relevé est
  jointe à la PR et doit être passée sur chaque base avant le déploiement :

  ```sql
  SELECT phone, count(*), array_agg(id) FROM users
  WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL
  GROUP BY phone HAVING count(*) > 1;
  ```

## Application

- Schéma : migration `make_email_nullable_and_phone_unique_on_users_table`.
- Code : `App\Services\Auth\PhoneVerificationService` (envoi, code haché, compteur, `markVerified`),
  `App\Services\Auth\PhoneLoginService`, `App\Http\Controllers\Api\Auth\PhoneLoginController`,
  `App\Services\Auth\LoginLock` (verrou partagé), limiteurs nommés dans `AppServiceProvider`.
- Gardes (TCK-589) : `PhoneOtpDeliveryTest`, `PhoneOtpAttemptLimitTest`,
  `OnboardingFixedCodeRemovedTest`, `PhoneLoginTest`, `PhoneLoginFlagTest`,
  `PhoneLoginEnumerationTest`, `PhoneLoginRateLimitTest`, `PhoneNumberUniquenessTest`,
  `PasswordLoginLockTest`, `AccountWithoutEmailTest`.
