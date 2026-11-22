# ADR-0094 — Une invitation se lit avant d'entrer, et s'accepte par un code SMS ; ses états se distinguent

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 3 : (a) l'invité entre par code SMS ; (a) la page montre l'agence, le rôle et qui invite) — modalités : décisions de la session, à revoir ; § 6 décidé par le porteur le 2026-11-10 (e-mail posé vérifié)
- **Date** : 2026-11-10
- **Tickets** : TCK-2609 (aperçu public, demande de nouveau lien), TCK-2610 (acceptation par code, correctif du compte doublé), TCK-2611 (la page)
- **Contredit** : TCK-610 (todo), partie invitation : **à réécrire** (voir Conséquences)
- **S'appuie sur** : [ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) (code, limiteurs, verrou, drapeau), [ADR-0060](0060-code-sms-affiche-hors-production.md) (code affiché hors production)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- La page `/invitations/accept` existe (TCK-626). Elle ne sait **rien** de l'invitation avant l'acceptation : `GET /api/invitations/{token}/prefill` est **sous session** (TCK-2281). L'invité saisit donc un mot de passe sans savoir qui l'invite, ni à quoi.
- `POST /api/invitations/{token}/accept` est public, et il **distingue déjà** les états du jeton : 404 `invitation.token_not_found`, 410 `token_accepted`, `token_revoked` ou `token_expired`, 401 `requires_login`.
- **TCK-610** (todo) prescrit au contraire un `GET /api/invitations/{token}` qui rend un **404 unique, « sans oracle »**, quel que soit l'état.
- Le produit se connecte par code SMS ([ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md)), mais l'invitation exige un mot de passe.
- **Défaut** : un compte né par téléphone, sans e-mail, qui accepte **connecté** une invitation envoyée par e-mail passe par `acceptAsNewUser` et crée un **second compte**.
- L'acceptation sans session pose **déjà** l'e-mail de l'invitation comme vérifié sur le compte qu'elle crée (`InvitationService`, `email_verified_at => now()`).

## Décision

**Le jeton d'invitation est un secret porteur. Qui le détient lit ce que le message reçu disait déjà : l'agence, le rôle, le prénom de l'invitant, et l'état du jeton. Il accepte par un code SMS, comme il se connecterait.**

1. **Aperçu public** : `GET /api/public/invitations/{token}`, en lecture seule.
   - Pour un jeton actionnable, il rend : le rôle ; l'agence (nom, logo, **ville seule**, nombre de biens publics, mention « vérifiée », téléphone public s'il l'est) ; le **prénom seul** de l'invitant ; le destinataire **masqué** et son canal ; si un compte existe pour ce destinataire ; les dates ; le prénom et le nom saisis par l'agence ; et ce qui attend l'invité (biens en attente du bailleur, intervention du prestataire).
   - Les nombres de biens et la mention « vérifiée » suivent les règles de la fiche publique d'agence. Il n'y a pas de seconde définition.
2. **Les états se distinguent, et ce n'est pas un oracle.**
   - Jeton inconnu : **404 sans aucune donnée**.
   - Jeton expiré, révoqué ou accepté : **410 avec son code**, plus le nom, le logo et le téléphone public de l'agence et la date de l'invitation. La page dit l'issue (« Dakar Immo vous avait invité le 3 nov. ») et donne une suite.
   - Pourquoi ce n'est pas un oracle : l'oracle que TCK-610 voulait fermer est **déjà ouvert** par le `POST …/accept` public. Les états qu'on distingue sont ceux d'un jeton **que l'on détient**, pas ceux des jetons des autres. Deviner un jeton reste impraticable, et le limiteur par IP borne les essais.
   - Le 404 unique ne protégeait donc rien. Il condamnait seulement l'invité dont le lien a expiré à une impasse.
3. **Ce que l'aperçu ne révèle jamais** :
   - le destinataire en clair ;
   - le nom de l'invitant ;
   - un identifiant interne ;
   - une adresse d'agence au-delà de la ville.

   Le `GET` n'écrit rien : ni « vu », ni statut. La page n'accepte rien au rendu. Elle sert `Referrer-Policy: no-referrer`, et le jeton reste hors de la mesure d'audience : c'est la contrainte 1 de TCK-610, **conservée**.
4. **Demande de nouveau lien** : `POST /api/public/invitations/{token}/renewal-request`, pour un jeton **expiré** seulement. L'invitant est prévenu, par une notification à code ([ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md)), avec le lien vers le renvoi existant. Une demande par invitation et par 24 h est retenue : la suivante rend 202 sans notifier.
5. **Acceptation par code SMS** : `POST /api/public/invitations/{token}/code`, puis `…/verify`.
   - **Un numéro vérifié suffit.** Pour une invitation par SMS, le code part au numéro de l'invitation, et le corps n'en porte pas. Pour une invitation par e-mail, le numéro est saisi.
   - Mêmes limiteurs, même verrou et même service de code que `auth/phone/*` ([ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) § 5-6). Même code affiché hors production ([ADR-0060](0060-code-sms-affiche-hors-production.md)). Même réponse qu'un compte existe ou non : aucune énumération.
   - Soit **A**, le compte dont ce numéro est vérifié, et **E**, le compte qui porte l'e-mail de l'invitation :
     - si E existe et que A ≠ E : 401 `invitation.requires_login`, comme aujourd'hui ;
     - si A existe : l'invitation est acceptée pour A, aux règles d'`acceptForAuthenticatedUser` ;
     - si A n'existe pas : le compte est créé au numéro vérifié, puis l'invitation est acceptée.
   - Un second facteur actif rend `requires_2fa`, sans consommer le code.
   - **Les deux routes suivent le drapeau `auth.phone_login.enabled`** : 404 drapeau éteint. La voie mot de passe reste entière.
6. **L'e-mail de l'invitation, sur le compte qui accepte par code.** Si le compte n'a pas d'e-mail et que l'invitation en porte un, l'e-mail est posé.
   - **Décidé par le porteur le 2026-11-10** : il est posé **vérifié**. Le lien est arrivé à cette adresse, et c'est la prémisse que l'acceptation sans session tient déjà aujourd'hui (`email_verified_at => now()`).
   - L'alternative est de le poser non vérifié et d'envoyer une vérification. Elle protège le cas d'un lien transféré à un tiers, au prix d'un geste de plus pour l'invité.
   - La recommandation garde **une seule** prémisse pour les deux voies : le porteur du lien est le destinataire.
7. **Le compte connecté n'est jamais doublé.** Sans compte E, un appelant connecté accepte pour lui-même, aux règles d'`acceptForAuthenticatedUser`, et l'e-mail est posé s'il n'en a pas. Ce correctif vaut drapeau allumé comme éteint.

## Conséquences

- **TCK-610 est à réécrire, et cet ADR ne le modifie pas.**
  - Sa partie invitation est périmée, puisque la page existe (TCK-626), et contredite, puisque son 404 unique est écarté par le § 2.
  - Elle est à retirer, avec un renvoi à TCK-2609 et TCK-2611.
  - Restent à garder : sa contrainte 1 (`Referrer-Policy`, jeton hors mesure d'audience), le renouvellement d'appareil du second facteur et l'entrée de la console.
- Deux limiteurs nommés de plus, par IP : `public-invitation-preview` (30/min) et `public-invitation-renewal` (5/h).
- Une notification de plus : la demande de nouveau lien, à code, avec ses libellés en `fr`, `en` et `wo`.
- La règle de discordance entre e-mail et numéro (§ 5 et § 6) est la seule qui puisse rattacher un e-mail à un compte né d'un numéro. Elle se teste cas par cas (TCK-2610).

## Options écartées

- **Le 404 unique de TCK-610** : il ne ferme aucun oracle, puisque le `POST` en ouvre déjà un, et il prive l'invité de la seule information utile, « votre lien a expiré, demandez-en un autre ».
- **L'aperçu sous session** (le `prefill` d'aujourd'hui) : il demande de créer un compte pour savoir qui vous invite. La décision 3 (a) l'écarte.
- **Le mot de passe comme voie principale** : l'option (b) de la décision 3, écartée. Il reste une voie possible.
- **Un code envoyé à l'e-mail** : le produit se connecte par SMS, et l'e-mail ne prouve pas un numéro.

## Application

- `routes/api/invitations.php` : préfixe `public/invitations`, hors `auth:sanctum`.
- `PublicInvitationPreviewController` et sa ressource, `InvitationRenewalRequestController`, `InvitationCodeController`. `InvitationService::acceptByVerifiedPhone`, et le correctif de la branche connectée d'`accept()`.
- Gardes :
  - `PublicInvitationPreviewTest` : forme exacte par rôle, destinataire masqué, prénom seul, 404 sans donnée, 410 avec l'agence, aucune écriture ;
  - `InvitationRenewalRequestTest` ;
  - `InvitationAcceptByCodeTest` : un cas par branche du § 5 ;
  - `InvitationAcceptConnectedNoDuplicateTest`, rouge sur `dev` au 2026-11-10.

## Amendement du 2026-11-15 — ce qui se montre avant le code (TCK-2939)

- **Statut** : décidé à l'implémentation de TCK-2939, « valide tes choix » du porteur (2026-11-15) — l'option la plus sûre à chaque point, à confirmer à la revue.
- **Origine** : écarts de l'audit des maquettes (TCK-2611 `#2`, `#3`, `#4`, « essais restants » ; TCK-2613 `#8`, « rien avant le code »).

1. **§ 3, l'adresse de l'agence : maintenu.** L'écart demandait « l'adresse publique de la fiche d'agence ». Mesuré le 2026-11-15 : la fiche publique (`PublicAgencyController::show`) ne rend **que la ville** (`city`), ni rue ni quartier. L'aperçu rend donc déjà tout ce que la fiche montre ; aucune adresse de plus n'est servie, et la règle « jamais une adresse d'agence au-delà de la ville » reste entière.
2. **§ 1 et § 3, les biens qui attendent un bailleur : précisé.** `awaiting.pending_properties[]` rend, pour **au plus trois** biens saisis pour lui par l'agence qui invite (`pending_owner_profile_id`, bornés à `agency_id` de l'invitation), et **rien d'autre** :
   - `title` — le titre saisi par l'agence ;
   - `neighborhood` — le **quartier seul**, comme l'annonce publique le montre (`PropertyResource::buildLocation`) ; jamais la rue, le libellé d'adresse, les coordonnées ni les identifiants du référentiel ;
   - `cover_url` — la **vignette publique** de la première photo (`PublicPhotoUrl::upTo(…, 'thumbnail')` : jamais l'original, jamais une conversion non filigranée), ou `null`.
   Ni identifiant, ni prix, ni locataire, ni bail. `properties_count` garde le total. Une liste de clés exacte est gardée par test.
3. **§ 2, le 410 : précisé.** Le complément d'un jeton fermé (expiré, révoqué, accepté) porte aussi `inviter_first_name`, le **prénom seul** de l'invitant, comme l'aperçu du § 1 — jamais son nom de famille ni son contact.
4. **§ 5, le numéro d'une invitation par SMS : amendé.** L'invité peut **corriger** le numéro : `POST …/code` et `…/verify` acceptent `phone` pour une invitation par SMS ; le code part à ce numéro, et l'invitation est acceptée pour le compte qui l'a vérifié. Le numéro de l'invitation est alors remplacé par le numéro vérifié, dans la transaction de l'acceptation, et le journal porte l'événement `invitation_phone_corrected` (numéros **masqués**). Mêmes limiteurs, même verrou, même service de code ; le seau du limiteur de vérification est celui du numéro **effectif** (le numéro corrigé s'il y en a un).
   - Pourquoi ce n'est pas un affaiblissement : une invitation par e-mail laisse **déjà** saisir n'importe quel numéro ; le lien d'une invitation par SMS ne prouve rien de plus qu'un lien par e-mail, et c'est le code qui prouve le numéro du compte.
   - **Exception : une invitation partagée** ([ADR-0123](0123-l-invitant-recoit-le-lien-d-une-invitation-partagee.md) § 4) refuse un numéro corrigé (422). Son lien sort vers l'invitant et peut être transmis à n'importe qui : la preuve du numéro saisi par l'admin est sa **seule** garde.
   - La voie mot de passe (`POST /invitations/{token}/accept`) et l'acceptation connectée gardent la règle d'avant : le numéro de l'invitation, vérifié.
5. **§ 5, les essais restants : ajouté.** Un code faux (422 `phone_code_invalid`, le code que le front lit déjà — l'écart nommait `invitation.code_invalid`, qui n'existe pas) porte `attempts_left` : le **plus petit** des restes des trois compteurs existants du numéro — le limiteur `auth-phone-verify` (4 par 15 min), les essais du code en cours (5), le verrou du numéro (`LoginLock`, 10). Aucune seconde comptabilité. Tous trois sont **par numéro**, jamais par compte : la valeur est la même qu'un compte existe ou non. Au bout, la réponse reste celle d'aujourd'hui (429 du limiteur, 423 du verrou).
6. **TCK-2613 `#8`, « rien avant le code » : levé pour le titulaire du profil seulement.** `GET /api/me/profiles/{profile}/invite-summary` rend le résumé chiffré du rôle (biens suivis, titres, dernier loyer encaissé, pièces manquantes) au **titulaire** du profil (`ActiveProfileResolver::resolve`, sinon 404) — c'est-à-dire **après** l'acceptation, qui lie le profil au compte, et avant la vérification du numéro. Ce sont les données du profil de l'appelant ; rien n'en sort vers le porteur d'un lien.
