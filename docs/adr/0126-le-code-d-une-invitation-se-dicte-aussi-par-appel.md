# ADR-0126 — Le code d'une invitation se dicte aussi par un appel

- **Statut** : Accepté le 2026-11-15 — décision prise à l'implémentation de TCK-2940, « valide tes choix » du porteur, à confirmer à la revue
- **Date** : 2026-11-15
- **Tickets** : TCK-2940 (API), TCK-2948 (écran)
- **S'appuie sur** : [ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) § 5-6 (le code, ses bornes — **amendé** sur le stockage du code, § 3 ci-dessous), [ADR-0060](0060-code-sms-affiche-hors-production.md) (code affiché hors production), [ADR-0094](0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md) § 5 (l'invitation s'accepte par code)

## Contexte

Mesuré le 2026-11-15 : `POST /api/public/invitations/{token}/code` n'envoie le code que par SMS
(écart `#6` de TCK-2611). La maquette de l'entrée par invitation dit : « Rien reçu ? Renvoyer le code
dans 0:38, ou le recevoir par appel. » L'invité dont le SMS se perd (opérateur, téléphone sans réseau
SMS, filtrage) n'a aujourd'hui aucune autre voie.

Un appel sortant est un **nouveau fournisseur** et une **nouvelle dépense** : il s'ajoute à la surface
de « SMS pumping » qu'ADR-0033 § 6 borne (indicatifs servis, plafond global du jour, borne par numéro).

## Décision

**Le même code — même valeur, même échéance, même compteur d'essais — peut être dicté par un appel
automatique au numéro, sur demande (`channel: "voice"`). L'appel dépense les mêmes bornes que le SMS ;
il ne les double pas. La voie n'existe que si un pilote d'appel est configuré.**

### 1. Le fournisseur : LAfricaMobile, « Push A TTS Call »

LAfricaMobile est déjà l'un des trois fournisseurs SMS (TCK-102) ; son API TTS
(`developers.lafricamobile.com/docs/tts`) dicte un texte en appelant une liste de numéros :

- `POST {base}/login` (formulaire : `username`, `password`) → `access_token` ;
- `POST {base}/push_tts`, en-tête `Authorization: Bearer <access_token>`, corps JSON
  `text`, `to_lang`, `login`, `password`, `contacts_list` (numéros).

Écarté : LAMVOICE (`/docs/voice`), qui ne dicte pas de texte — il faut téléverser un fichier audio par
message, donc un fichier par code. Un fournisseur international (Twilio, Infobip) : un contrat, une
facturation et un sous-traitant de plus pour un usage de secours.

**Non vérifié sur la documentation, donc configurable et non deviné** : l'URL de base (la
documentation ne la publie pas ; LAM la donne à l'ouverture du compte), les valeurs admises de
`to_lang` (défaut `fr`), la durée de vie du jeton (gardé 10 min en cache, refait sur un 401), la forme
de la réponse (documentée comme une chaîne). Un appel est réputé parti sur un statut 2xx.

### 2. Le pilote et le drapeau

- Contrat `App\Services\Auth\Voice\VoiceCodeSender` : `available(): bool` et
  `call(string $phone, string $code, ?string $locale): bool`.
- Pilote choisi par `PHONE_VOICE_CODE_DRIVER` (`auth.phone_login.voice_driver`) :
  - vide (défaut, et la valeur de `.env.example`, donc de la CI) : **aucun pilote, la voie n'existe
    pas** ;
  - `lafricamobile` : disponible seulement si `VOICE_LAM_BASE_URL`, `VOICE_LAM_LOGIN` et
    `VOICE_LAM_PASSWORD` sont tous posés — une clé absente éteint la voie, jamais une erreur 500 ;
  - `log` : écrit dans le journal que l'appel aurait eu lieu, **jamais le code** (TCK-589 a retiré tout
    code du journal) ; disponible seulement sous `APP_ENV` `local` ou `testing`, comme
    `SMS_LOG_FALLBACK`. En local, le code se lit par l'aperçu d'ADR-0060.
- **Voie éteinte : `channel: "voice"` est refusé en 422 sur le champ `channel`** (règle `in`), le SMS
  inchangé. Pas un 404 : la route existe et sert le SMS.
- La réponse 202 de `…/code` porte `data.voice_available` (booléen) : l'écran ne propose « le recevoir
  par appel » que s'il est vrai. L'aperçu public de l'invitation n'en dit rien (il ne sait pas encore
  quel numéro recevra le code).

### 3. Le même code — amendement d'ADR-0033 § 5

ADR-0033 § 5 garde le code **haché** en cache : il ne peut donc pas être redit. Quand un pilote d'appel
est disponible, l'entrée d'un code de la portée `login` (l'entrée par téléphone, dont l'invitation) porte
**aussi une copie chiffrée** (`Crypt`, clé d'application), lue
par le seul appel. Le coût est faible : quiconque tient `APP_KEY` retrouve un code de six chiffres
depuis son HMAC en un million d'essais. Voie éteinte, ou autre portée (vérification du numéro d'un compte,
second numéro, step-up), rien ne change.

- **Un code en cours** pour ce numéro et cette portée : l'appel le dicte tel quel ; l'échéance et le
  compteur d'essais de l'entrée **ne sont pas touchés** — l'appel n'ajoute pas cinq essais.
- **Aucun code en cours** : un code neuf est émis comme pour un SMS (mêmes 5 min, mêmes 5 essais), et
  le délai de renvoi du SMS est posé aussi.

### 4. Les bornes partagées

L'appel passe par les mêmes portes que le SMS, dans le même ordre :

- limiteur de route par IP (`throttle:auth-phone-send`, même route) ;
- **borne par numéro** `PhoneSendQuota` (3 / 15 min, 5 / 24 h) : vérifiée avant, comptée après —
  un SMS puis un appel dépensent deux places ;
- **plafond global du jour** `sms.otp_daily_cap` et indicatifs servis (`reserveCodeDelivery`) ;
- verrou du numéro (`LoginLock`) : numéro verrouillé, réponse neutre, aucun appel.

Seul le délai de renvoi est propre à la voie (60 s entre deux appels) : c'est ce qui permet d'appeler
pendant que le compte à rebours du SMS court, comme la maquette le montre.

### 5. Données transmises

Au fournisseur : le numéro et le texte dicté, qui ne contient que le code (chiffres séparés, dit deux
fois) et sa durée. Ni nom, ni agence, ni invitation.

## Conséquences

- Un code peut coûter un SMS **et** un appel : la dépense par numéro reste bornée par
  `PhoneSendQuota`, la dépense totale par `sms.otp_daily_cap` (désormais « codes du jour », toutes
  voies). Le coût unitaire d'un appel n'est pas connu à ce jour (contrat LAM) : à relever avant
  d'allumer la voie en production.
- Le pilote `lafricamobile` n'a été éprouvé que contre `Http::fake` sur la forme documentée ; il se
  vérifie à l'ouverture du compte voix (URL de base, `to_lang`), avant d'allumer le drapeau.
- Hors invitation (connexion par numéro), le mécanisme existe dans `PhoneLoginService` mais n'est pas
  exposé : un ticket à part le voudrait.

## Application

- `App\Services\Auth\Voice\` (contrat, pilotes `log` et `lafricamobile`, résolution du pilote) ;
  `PhoneVerificationService::callCodeTo()` ; `PhoneLoginService::requestVoiceCode()` ;
  `SendInvitationCodeRequest` (`channel`) ; `InvitationCodeAcceptance::sendCode()`.
- `tests/Feature/Invitation/InvitationVoiceCodeTest.php` : pilote reçu (numéro et code), code vérifié,
  même code après un SMS, borne par numéro et plafond du jour partagés, voie éteinte (422, SMS
  inchangé), pilote `lafricamobile` contre `Http::fake`, clé absente.
