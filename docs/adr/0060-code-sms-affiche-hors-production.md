# ADR-0060 — Hors production, un code envoyé par SMS revient aussi dans la réponse, derrière un drapeau

- **Statut** : Accepté
- **Date** : 2026-10-10
- **Tickets** : [TCK-620](../backlog/tickets/TCK-620-code-sms-affiche-en-preproduction.md)
- **Amende** : [ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) §5 (*« le code
  n'apparaît dans aucune réponse, dans aucun environnement »*) et §1 (*« l'allumage suit un envoi réel
  mesuré »*), **pour `local` et `staging` seulement**. La production n'est pas touchée.

## Contexte

Relu sur `dev` à `f271eebb` (2026-10-10) :

- **La préproduction n'a aucun fournisseur SMS.** L'onglet Environment de `takussan-api-preview`
  (Dokploy, relevé le 2026-10-10 : 80 clés, `APP_ENV=staging`) ne porte aucune clé `SMS_*` ni
  `PHONE_LOGIN_ENABLED`. Le routeur (`SmsRouterDriver`) échoue sur toute la chaîne ; le code est
  pourtant rangé en cache, puisque `PhoneVerificationService::issue()` ne dépend pas de la remise.
  Il existe donc un code valide que **personne ne peut lire**.
- **Tout ce qui vérifie un numéro est donc fermé en préproduction** : la connexion et l'inscription
  par téléphone, la vérification du numéro du profil, l'étape « code SMS » des quatre onboardings
  (propriétaire, agent, prestataire, hôte particulier), la preuve par l'ancien numéro avant son
  remplacement, le step-up de suppression d'un compte sans e-mail, et la signature d'un bail par un
  signataire au numéro vérifié.
- En local, `SMS_LOG_FALLBACK=true` écrit le SMS dans le journal (TCK-589) : le code se lit, mais
  dans `storage/logs`, pas dans l'écran où on le saisit.

Le **2026-10-10**, le porteur a demandé : *« active la signin/signup par numéro de téléphone et pour
l'OTP on l'affiche dans le front quand on est en preview, comme ça on n'est pas bloqué même si le
SMS provider n'est pas encore fourni. Fais ça partout où on vérifie un numéro de téléphone si on est
en local ou en preview. »*

## Décision

**Hors production, et seulement si `OTP_PREVIEW_ENABLED` est vrai, tout code envoyé par SMS
revient dans la réponse de la requête qui l'a émis, sous la clé `otp_preview`. Le front l'affiche à
côté du champ de saisie. Le SMS part quand même.**

1. **Deux verrous, qui doivent tenir ensemble.**
   - Le drapeau `config('auth.otp_preview.enabled')` (`OTP_PREVIEW_ENABLED`), **faux par défaut**,
     forcé à faux dans `phpunit.xml`.
   - L'environnement : `APP_ENV` ∈ {`local`, `staging`, `testing`}, jugé **à l'exécution** par
     `App\Services\Auth\OtpPreview::enabled()`. C'est une **liste d'autorisation**, pas une liste
     d'exclusion de `production` : un environnement mal nommé reste fermé.
   - Recopié par erreur dans l'onglet de production, le drapeau seul ne rend donc aucun code.
     C'est la règle de `SMS_LOG_FALLBACK` (vérification adverse m6 de TCK-589), reconduite.
2. **Un seul collecteur, une seule sortie.** Chaque émetteur de code SMS appelle
   `OtpPreview::record($code)` ; le middleware `ExposeOtpPreview`, en tête du groupe `api`, ajoute
   `otp_preview` à la réponse JSON de la requête. Les émetteurs sont :
   - `PhoneVerificationService::issue()` : connexion par téléphone (`request-code`), vérification du
     numéro (`send-otp`, `resend`, et donc les onboardings), preuve de remplacement (`change-code`) ;
   - `DeletionStepUpService::sendCode()`, **quand le code part par SMS** ;
   - `LeaseSignatureService::sendCode()`, **quand le code part par SMS**.
3. **Le SMS part quand même.** L'affichage ne remplace pas l'envoi : le jour où la préproduction a un
   fournisseur, le même parcours éprouve la remise réelle sans changement de code. Les limiteurs, le
   plafond journalier, la liste d'indicatifs et le compteur d'échecs s'appliquent à l'identique :
   pas de code émis, pas de code affiché.
4. **Le code d'un e-mail n'est pas concerné.** La demande vise le téléphone. Un code de suppression
   ou de signature parti par e-mail ne revient pas (en préproduction, `MAIL_MAILER=log` : il reste
   illisible, ce qui est hors de cette décision).
5. **La connexion par téléphone est allumée en préproduction** (`PHONE_LOGIN_ENABLED=true`) et en
   développement (`.env.docker`), **sans envoi réel mesuré**. Cette mesure reste la condition de
   l'allumage **en production** (ADR-0033 §1, inchangé pour elle).

## Ce que ça coûte, écrit pour ne pas être découvert

Là où le drapeau est allumé, **qui peut joindre l'API peut entrer dans n'importe quel compte dont il
connaît le numéro vérifié** : `request-code` lui rend le code. Il peut aussi savoir si un numéro est
vérifié par un autre compte, puisque `send-otp` répond sans code dans ce cas (ADR-0033, m4). Ce n'est
acceptable que parce que :

- la préproduction ne porte que des données de seed et de test, jamais des comptes réels ;
- le front de préproduction est derrière une authentification Basic (TCK-525).

**Le jour où la préproduction reçoit des données réelles, ou une copie de la production, le drapeau
s'éteint avant.**

## Alternatives écartées

- **Un code fixe (`123456`) hors production** : c'est ce que TCK-589 a retiré (`OnboardingFixedCodeRemovedTest`).
  Un code fixe ne s'éprouve pas : il valide aussi un parcours où le code n'est jamais rangé.
- **Une boîte de réception SMS consultable** (une page « Mailpit des SMS ») : elle couvrirait aussi
  les envois de jobs, mais elle oblige à quitter l'écran du code. Ce n'est pas ce que demande le
  porteur.
- **Un en-tête HTTP au lieu d'une clé du corps** : les appels du front passent par des actions
  serveur et des route handlers qui ne rendent que le corps. L'en-tête se perdrait en route.
- **Ne garder que `APP_ENV`, sans drapeau** : un `staging` qui recevrait un jour des données réelles
  rendrait ses codes sans que personne ne l'ait décidé.

## Conséquences

- Un envoi fait **dans un job** ne revient dans aucune réponse. C'est le cas du code de confirmation
  d'une alerte de recherche par WhatsApp (`RecordPublicSearchAlert`), dont le canal est de toute
  façon fermé sans `search_alerts.whatsapp_enabled`.
- `OtpPreviewTest` garde les deux verrous : drapeau éteint, et drapeau allumé en `production`, aucun
  `otp_preview` ; drapeau allumé en `testing`, le code rendu ouvre la session.

## Application

- Code : `App\Services\Auth\OtpPreview`, `App\Http\Middleware\ExposeOtpPreview`,
  `config/auth.php` (`otp_preview.enabled`).
- Environnements : `OTP_PREVIEW_ENABLED` et `PHONE_LOGIN_ENABLED` à `true` dans `.env.docker` et
  dans l'onglet de `takussan-api-preview` ; la clé `OTP_PREVIEW_ENABLED` vide dans `.env.example`.
- Front : `lib/otp-preview.ts` lit la clé, `components/auth/CodeDePreproduction.tsx` l'affiche.
