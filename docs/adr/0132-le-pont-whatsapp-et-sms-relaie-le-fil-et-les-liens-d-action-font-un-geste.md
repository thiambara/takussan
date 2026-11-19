# ADR-0132 — Le pont WhatsApp et SMS relaie le fil, et un lien d'action signé fait un seul geste

- **Statut** : Accepté le 2026-11-19 (décisions du porteur : 1 à 6 ci-dessous ; le pont bâti sur des pilotes
  de canal, § 0 ; le locataire sans compte, option (a), § 2 ; les sept points de la session acceptés, dont 6a et
  7a ; maquette `fil-pont` approche D, choisie le 2026-11-17 ; le numéro des notifications ouvert en entrée,
  décision du 2026-11-17) — modalités : les questions restées ouvertes à l'écriture sont tranchées par la
  session (§ 8), sur délégation du porteur
- **Date** : 2026-11-19
- **Tickets** : TCK-2980 à TCK-2985 (lot 5 du [plan « Le Fil »](../plans/2026-11-17-le-fil.md), vague 98)
- **Va avec** : [ADR-0128](0128-le-fil-est-l-interface-des-objets.md) (le fil est l'interface des objets),
  [ADR-0129](0129-le-socle-temps-reel-signale-et-l-api-sert.md) (le socle temps réel)
- **S'appuie sur** : [ADR-0051](0051-lien-porteur-de-paiement-et-journal-des-webhooks.md) (le lien porteur
  qui paie une échéance, le journal des webhooks), [ADR-0081](0081-le-radar-prospecte-par-l-api-whatsapp-sur-son-propre-numero.md)
  (le numéro du Radar est distinct, le STOP exact), [ADR-0098](0098-le-locataire-signe-l-etat-des-lieux-sur-place-par-code-sms.md)
  (la signature par code SMS), [ADR-0112](0112-le-bailleur-confirme-les-visites-quand-l-agence-le-lui-confie.md) (le bailleur qui confirme une visite, `owners_confirm_visits`),
  [ADR-0127](0127-les-actions-de-deploiement-un-fichier-par-action.md) (les actions de déploiement)

## Contexte

Relevé sur `feat/le-fil-lots-3-5` (`6a26d9701`) le 2026-11-19 :

- **Le webhook des notifications ne lit que les accusés.** `WhatsappStatusController::extractStatuses`
  (`app/Http/Controllers/Webhook/WhatsappStatusController.php:126`) ne parcourt que
  `entry[].changes[].value.statuses[]`. Un message reçu (`value.messages[]`) est ignoré.
- **La fenêtre de 24 h ne s'ouvre jamais.** `WhatsappChannel` le dit lui-même
  (`app/Notifications/Channels/WhatsappChannel.php:185`) : « rien n'écrit encore `last_inbound_at` ».
  Hors des tests, tout message WhatsApp part en gabarit ou se replie sur le SMS.
- **Le seul lecteur de messages entrants est celui du Radar.** `RadarWhatsappInbox` filtre sur
  `metadata.phone_number_id` (`app/Services/Radar/Whatsapp/RadarWhatsappInbox.php:63`), rattache une réponse
  par `context.id` puis par le dernier envoi, et applique le STOP exact (`isStop`, `:92`). Son numéro est
  distinct de celui des notifications (ADR-0081 § 1, refus `radar.whatsapp.same_number`).
- **Le numéro des notifications est une intégration** `whatsapp_cloud`, d'agence ou globale
  (`IntegrationLocator::find`, `app/Services/Notifications/Sms/IntegrationLocator.php:25`). Un message entrant
  dit à quel numéro il s'adresse par `metadata.phone_number_id`.
- **Le consentement WhatsApp est un registre par numéro** (`whatsapp_contacts`, `phone` unique,
  `opt_in_status` `pending|opted_in|opted_out`, `user_id` facultatif). Seule l'alerte de recherche sans
  compte y écrit un accord (`PublicSearchAlertController:241`). Aucun opt-out SMS n'existe.
- **Le SMS entrant n'est pas lu.** Seule la file « Pulling DLR / MO » de Mtarget en voit passer, éteinte par
  défaut (`SMS_DLR_PULL_ENABLED=false`) ; `DlrReportApplier` écarte un MO (`:64`), et `SmsDlrRecord` n'en
  garde pas le texte. Orange et LAfricaMobile envoient sous un nom d'expéditeur.
- **Les clés du webhook sont déclarées, leurs valeurs pas posées.** `WHATSAPP_WEBHOOK_URL_TOKEN`,
  `_APP_SECRET` et `_VERIFY_TOKEN` sont dans `.env.example:398-400`, `.env.docker` et
  `deploy/takussan/env.api.production.example:258-260`, et `scripts/check-webhook-env-keys.mjs` sort en 0.
  L'ardoise D-49 date d'avant. Mais le relevé de la préproduction (`docs/infra/hebergement.md:273`) nomme le
  jeton d'URL et le jeton de vérification, **pas le secret d'application** : sans lui, tout webhook WhatsApp
  y est refusé en 403 (`WhatsappStatusController::verifySignature`). `docs/infra/prod-drivers.json` ne dit
  rien de WhatsApp. **À re-mesurer** avant de compter sur le pont en préproduction.
- **Qui est « sans compte ».** Le bailleur (`leases.landlord_id` → `users`) et le prestataire
  (`maintenance_requests.assigned_to` → `users`) de la maquette sont des comptes **sans mot de passe**
  (`users.password_set_at` nul) : ils peuvent déjà être membres d'un fil. Le locataire d'un bail est une
  **fiche client** (`leases.tenant_id` → `customers`, `customers.user_id` nullable), et
  `conversation_participants.user_id` est obligatoire (`2026_04_17_160017`, ligne 14).
- **Un numéro n'est vérifié que sur un compte** : `users_phone_verified_unique`
  (`2026_10_07_150200`). Le second numéro vérifié se lit par `User::secondary_phone*` (`User.php:550`).
- **La notification d'un message part déjà par WhatsApp et SMS** pour qui l'a activée
  (`NotifyNewMessageJob`, événement `message_received`, préférence `whatsapp` éteinte par défaut).
- **Les gestes des objets passent par des routes authentifiées** qui lisent `$request->user()` :
  `POST property-visits/{visit}/confirm` (`PropertyVisitPolicy::peutConfirmer`, le bailleur s'y voit
  autorisé par ADR-0112), `POST maintenance-requests/{id}/accept` (le prestataire, avec `scheduled_at`),
  `POST inventories/{inventory}/sign` (code SMS, ADR-0098). Le paiement d'une échéance a déjà son lien
  porteur sans session (`/api/pay/{token}`, ADR-0051), réutilisable jusqu'au paiement.

Le porteur veut que ceux qui n'ouvriront pas Takussan (le plombier, le bailleur de la diaspora, le
locataire sans compte) participent au fil d'un objet sans perdre la sécurité.

## Décision

**Le pont relaie le fil sur WhatsApp, et sur SMS en secours, par le numéro des notifications. Il ne
relaie que ce que le personnel écrit, jamais une note d'équipe, jamais une donnée qui dépend du lecteur.
Un geste ne se fait jamais dans WhatsApp : il se fait par un lien signé, à usage unique, qui fait UN geste
sur UN objet, par le même service et la même politique que la route de l'objet.**

### 0. Un pont, des pilotes de canal (exigence du porteur, 2026-11-19)

Demain, d'autres messageries (Telegram, Messenger, RCS…) doivent pouvoir s'ajouter. Le pont ne connaît donc ni
WhatsApp ni le SMS : il connaît des **pilotes de canal**.

- **Le contrat** `App\Services\Pont\CanalDuPont`, implémenté par chaque pilote :
  - `nom()` : la valeur du canal, une **chaîne libre déclarée par le pilote** (`whatsapp`, `sms`, demain
    `telegram`). `messages.channel` et `message_relays.channel` sont des chaînes, **pas une enum** : `app` est la
    seule valeur que le code connaisse en dur ;
  - `capacites()` : ce que le canal sait faire, déclaré — **reçoit** (lit des messages entrants), **gabarits**,
    **médias**, **accusés** (remis, lu), **boutons**, et la **fenêtre de réponse libre** en heures (24 pour
    WhatsApp, `null` = toujours ouverte, ou sans objet pour le SMS qui n'a pas de réponse libre à garder) ;
  - `envoyerTexte()`, `envoyerGabarit()` (et, si `boutons`, un bouton de réponse ou d'URL) : un résultat neutre
    (identifiant externe, statut, échec sûr ou ambigu) ;
  - `verifierWebhook(Request)` : la signature ou le jeton propres au fournisseur ; refus = 403 ;
  - `lireWebhook(Request)` : une liste de **messages entrants normalisés** (expéditeur : numéro E.164 ou
    identifiant du canal ; numéro ou compte d'entreprise destinataire ; texte ; médias ; réponse à un bouton ;
    message cité ; horodatage ; **identifiant externe**, clé de l'idempotence) et d'**accusés** normalisés.
- **Le registre est piloté par la configuration**, sur le patron mesuré du dépôt : un pilote par clé, lié par
  `match` sur une valeur de `config/` dans `AppServiceProvider` (`sms.default_driver`, `whatsapp.default_driver`,
  `AppServiceProvider.php:366`, `:399`), et des intégrations nommées (`IntegrationProviderRegistry`).
  `config/messagerie.php` déclare les canaux actifs, le pilote de chacun, et **l'ordre de repli** par défaut
  (`whatsapp` texte → `whatsapp` gabarit → `sms`). Trois pilotes dans ce lot : `whatsapp` (Meta Cloud API, posé
  sur `WhatsappDriverInterface`, jamais un second client de Meta), `sms` (sortant seulement, sur
  `SmsRouterDriver` : sans la capacité « reçoit » dans ce lot) et un **faux pilote** pour les tests.
- **Une route de webhook par canal, générique** : `POST|GET /api/webhooks/messagerie/{canal}/{token}`, sur le
  patron mesuré de `webhooks/payments/{provider}/{token}` (`routes/api/payments.php:47`) — le registre résout le
  canal (inconnu ou sans « reçoit » : 404), le jeton d'URL du canal garde (404), le pilote vérifie la signature
  (403), puis le journal des webhooks et le pont. L'URL actuelle `webhooks/whatsapp/status/{token}`, peut-être
  déjà déclarée chez Meta, reste un alias qui passe au pilote `whatsapp` jusqu'à ce que l'action de déploiement
  ait déplacé l'URL de rappel.
- **Le fil, l'accord, STOP / START, les gabarits et le repli raisonnent par canal** : l'accord et l'opposition
  se tiennent par (numéro ou identifiant, canal) ; un mot de consentement reçu sur un canal ne coupe que ce
  canal ; un gabarit se cherche par (événement, canal, langue).
- **Ce qu'un canal neuf demande** : une classe qui implémente `CanalDuPont`, une entrée dans
  `config/messagerie.php`, ses clés d'environnement (déclarées dans `.env.example`, `.env.docker` et le gabarit de
  production, gardées par `check-webhook-env-keys.mjs` si elles gardent un webhook) et leur action de déploiement.
  Rien dans le routage (§ 2), l'accord (§ 3), le relais (§ 4) ni les liens (§ 5). Un pilote SMS entrant (la file MO
  de Mtarget, quand elle portera le texte) s'ajoute ainsi en déclarant « reçoit ».

### 1. Le numéro des notifications reçoit, et le webhook des notifications lit les messages

- Le pilote `whatsapp` lit `value.messages[]` en plus des statuts, par la route générique du § 0
  (`webhooks/messagerie/whatsapp/{token}`) et par l'alias `webhooks/whatsapp/status/{token}`, sous la même garde
  (jeton d'URL, signature `X-Hub-Signature-256` sous `WHATSAPP_WEBHOOK_APP_SECRET`, journal des webhooks).
- **Seuls les numéros des intégrations `whatsapp_cloud` sont lus** : `metadata.phone_number_id` doit être
  celui d'une intégration active ; tout autre identifiant (celui du Radar compris) est ignoré. L'agence de
  l'intégration (nulle pour la plateforme) est l'**agence du numéro**.
- **Idempotence par l'identifiant Meta** du message (`wamid`) : un message déjà reçu ne s'écrit pas deux fois
  (Meta rejoue ses webhooks). Le corps reste au journal, chiffré, avec la rétention du canal `whatsapp`
  (`config/webhooks.php:14`, 30 jours), et se rejoue par le même chemin.
- Tout message reçu d'un numéro **ouvre la fenêtre de 24 h** de ce numéro pour ce numéro d'entreprise
  (`whatsapp_contacts.last_inbound_at`, et la trace du relais entrant, § 4).
- **Ce qui est relayé en entrée** : le texte, et la réponse à un bouton. Une photo, un vocal ou un document
  s'écrivent comme un message au code neutre `pont.media_non_relaye` : le fil dit qu'un média est arrivé
  sur WhatsApp, sans le télécharger (voir « Ce que ça ne règle pas »).

### 2. Où va un message entrant (décision 1)

**Un numéro connu** est, dans cet ordre :
- le numéro **vérifié** d'un compte (`users.phone` ou le second numéro, avec leur `*_verified_at`) ;
- le numéro d'un `whatsapp_contacts` **accepté par le pont** (`opt_in_source` `pont_invitation` ou `pont_start`) et rattaché
  à un compte (`user_id`) : la réponse au bouton « Accepter les messages », venue de ce numéro, en prouve la
  détention.

**Un message d'un numéro connu est versé dans un fil de ce compte avec l'agence**, marqué de son canal
(`messages.channel = whatsapp`), écrit par `ConversationWriter::post` au nom de ce compte, sous
`ConversationAccess::allowsWriting`. Le fil se choisit dans cet ordre :
1. le fil du message relayé que cite `context.id` (la personne a répondu à ce message, ou touché un bouton) ;
2. sinon, le fil du dernier relais sortant **rattaché à un fil** vers ce numéro depuis ce numéro d'entreprise,
   s'il date de moins de 7 jours (un relais de résumé, sans fil, restreint l'étape 3 à son agence) ;
3. sinon, le fil le plus récemment actif où ce compte est participant actif, où il peut écrire, et dont
   l'agence est celle du numéro (pour le numéro de la plateforme : toute agence, **si une seule** est en
   jeu) ;
4. sinon : rien n'est versé dans un fil ; le message devient un prospect portant le nom et le numéro du compte,
   comme un numéro inconnu (ci-dessous). La décision 1 dit « le fil direct » : faute d'un fil existant, le serveur
   ne choisit pas l'interlocuteur à la place de l'agence (à confirmer). Jamais un fil n'est ouvert d'office avec une personne choisie par le serveur.

Un fil où le compte ne peut plus écrire (bail fini, contexte fermé, TCK-2753) est sauté à chaque étape.

**Un numéro inconnu crée un prospect, jamais un fil** : une demande de contact (`property_contact_leads`)
au canal neuf `whatsapp_inbound`, comptée « à traiter » (`scopeATraiter`), portée par le numéro, le nom de
profil WhatsApp et le texte, pour l'agence du numéro. Sur le numéro de la plateforme, le prospect est sans agence, et ne se lit que du
 super-admin (`PropertyContactLeadPolicy::view`). Un seul prospect
non traité par numéro et par agence : un message suivant s'ajoute à son texte, borné à la colonne. **Aucun
rapprochement avec une fiche client existante** n'est fait d'office : rattacher le prospect à un client reste
le geste « convertir » de l'agence.

**Le locataire sans compte** (décision du porteur, 2026-11-19, option (a), sur le relevé du Contexte :
`leases.tenant_id` → `customers`, `customers.user_id` nullable, `conversation_participants.user_id` obligatoire).
- **Un compte sans mot de passe est créé par l'accord explicite au gabarit d'invitation, et par lui seul**, quand
  cet accord vient du numéro de la fiche à laquelle l'agence a envoyé l'invitation pour sa salle. **Jamais par un
  simple message entrant.** Le compte est rattaché à la fiche (`customers.user_id`), son numéro tenu pour vérifié
  par ce message ; il devient membre de sa salle par la synchronisation existante (`SallesDuFil::membresAttendus`),
  comme le bailleur sans compte.
- **La fiche reste la source du numéro** : le compte prend le numéro de la fiche, jamais l'inverse.
- **Un numéro déjà porté par un autre compte bloque la création** : rien n'est créé, l'accord n'est pas posé, le
  personnel est prévenu (avis `pont.numero_deja_a_un_compte`), et **rien n'est fusionné** ; l'agence rattache la
  fiche par ses gestes existants.

### 3. L'accord, STOP et START (décision 3)

- **L'accord est explicite, et précède la première réponse sortante qui n'est pas une notification.** Le
  personnel « joint par WhatsApp » une personne du fil (un geste par personne et par fil) : part alors
  l'invitation, gabarit `pont_invitation` hors fenêtre, message interactif dans la fenêtre, avec le bouton
  « Accepter les messages ». **Rien d'autre ne lui est relayé avant sa réponse.** Les messages du personnel
  écrits entre-temps restent dans le fil, en attente d'accord, et partent à l'accord (qui ouvre la fenêtre).
- L'accord s'écrit sur `whatsapp_contacts` (`opted_in`, `opt_in_source = pont_invitation`, `user_id`). **Il vaut
  pour ce numéro, pas pour un fil** : joindre la même personne dans un autre fil ne lui redemande rien (elle est
  jointe d'emblée, et le premier relais nomme l'objet du fil). Un `opted_in` d'une source étrangère au pont (ni `pont_invitation` ni
  `pont_start` : l'alerte de recherche, par exemple) ne vaut pas accord du pont : l'invitation part. Les notifications lisent cet accord
  (`WhatsappChannel::resolveMessage`).
- **STOP et ARRET**, seuls (aux espaces, à la casse et à la ponctuation finale près, la règle de
  `RadarWhatsappInbox::isStop`), **coupent WhatsApp pour ce numéro dès réception**, sans l'agent :
  `opted_out`, horodaté, source `pont_stop`. Tous les envois le respectent : le pont, et les notifications
  (déjà, par `isOptedOut`). Le fil le dit par un avis système à code (`pont.stop`).
- **Le pont ne se replie pas sur le SMS vers un numéro qui a dit STOP.** Les notifications gardent leur
  repli SMS et e-mail selon les préférences de la personne.
- **START** (même règle d'exactitude) rouvre le canal : `opted_in`, source `pont_start`, et un avis système
  (`pont.start`).
- Tout autre texte, même un refus (« stop svp »), est un message ordinaire versé au fil.
- **Les avis du pont** (`pont.accord`, `pont.stop`, `pont.start`, `pont.media_non_relaye`,
  `pont.numero_deja_a_un_compte`) sont écrits en `visibility = team` : seul le personnel de l'agence du fil les
  lit (ADR-0128 § 6). Un autre client du fil n'apprend rien du canal d'un participant.

### 4. Le relais sortant (décision 2)

- **Ce qui est relayé** : les messages `text` d'un auteur qui est personnel actif de l'agence du fil
  (`EquipeDuFil`), en `visibility = all`. **Jamais une note d'équipe** (ADR-0128 § 6), jamais un message
  d'un autre client ou d'un autre prestataire, jamais un avis système. Une carte ou un événement ne part que
  sous forme de lien d'action (§ 5), vers la personne que l'objet attend (`action_for`).
- **À qui** : le relais se juge **par destinataire**, pas par fil. Un participant actif est *joint par le pont*
  dans un fil quand il y a accepté l'invitation, ou que son dernier message dans ce fil est arrivé par
  WhatsApp. Il cesse de l'être dès qu'il écrit dans ce fil depuis l'application.
- **Comment** :
  - fenêtre ouverte (moins de 24 h depuis son dernier message entrant sur ce numéro d'entreprise) : le texte,
    précédé du nom de l'auteur et de l'agence, tel quel ;
  - fenêtre fermée : le gabarit approuvé `pont_nouveau_message` (extrait borné, nom de l'agence, objet du fil
    en code) ;
  - sans gabarit approuvé, ou échec sûr de WhatsApp : le SMS, avec le même texte borné. Un échec ambigu
    (délai, 5xx) ne se replie pas (règle de TCK-766) ;
  - numéro en `opted_out` : rien ne part.
- **Le fil dit par où c'est parti** : une ligne de relais par message et par destinataire (`message_relays`),
  avec le canal, la forme (texte, gabarit, SMS), l'identifiant du fournisseur et son
  statut (`envoye`, `remis`, `lu`, `echec`), mis à jour par le webhook des statuts.
- **Le relais remplace la notification `message.received` sur les canaux mobiles** pour un destinataire joint
  par le pont dans ce fil : il ne reçoit pas deux fois le même message. L'application et l'e-mail restent
  ceux de ses préférences.
- **Ce qui ne sort jamais** : le numéro d'un participant vers un autre participant ; le canal d'un message
  (`messages.channel`), l'état de ses relais et le bloc `pont` d'un participant vers un lecteur qui n'est ni
  personnel de l'agence du fil, ni l'auteur du message.
- **Rétention** : un relais et un lien d'action gardent un numéro de téléphone. Leur numéro s'efface (la ligne
  reste, pour la trace) 90 jours après le dernier envoi ou l'expiration, par une tâche planifiée ; le journal
  des webhooks garde sa rétention propre.

### 5. Un lien d'action fait un geste, une fois (décision 4)

- **Un lien = un geste sur un objet, pour une personne.** Registre fermé en code (`GestesParLien`), chaque
  entrée nommant le service et la politique déjà employés par la route de l'objet :
  - `property_visit.confirm` — confirmer une visite (`PropertyVisitPolicy::peutConfirmer`, le service de
    `PropertyVisitController::confirm`) ;
  - `maintenance_request.accept` — accepter une intervention et son créneau (le service de
    `MaintenanceRequestController::accept`) ;
  - `inventory.sign` — signer un état des lieux : le lien ouvre la signature, **le code SMS d'ADR-0098 reste
    exigé** ;
- **Payer n'a pas de lien du pont** : le lien porteur d'ADR-0051 en est déjà un (une échéance, sans session), et
  les relances de loyer le portent déjà au locataire, sur WhatsApp puis SMS (`SendLeasePaymentReminders`). Le pont
  n'en émet pas un second.
- **Pas de doublon** : le pont n'émet pas de lien pour un événement dont l'objet envoie déjà au même
  destinataire, sur WhatsApp ou SMS, une notification qui mène au même geste. Les codes ainsi couverts (les
  échéances, `lease_payment.*`) sont écrits dans `GestesParLien`, avec leur test.
- **Signé, haché, lié** : un jeton aléatoire (le clair n'est jamais stocké, `token_hash` SHA-256 unique),
  l'objet, le geste, le compte pour qui il agit, le numéro qui l'a reçu, le message relayé qui le porte.
- **Valable 7 jours, à usage unique, sans ouvrir de session.** « Utilisé » veut dire **le geste a réussi** :
  un geste refusé par la machine d'état de l'objet ne consomme pas le lien.
  Un lien est émis quand l'événement qui attend le geste est écrit, **et** à l'accord ou à la jonction d'une
  personne pour les gestes qu'un fil attend encore d'elle (un prestataire joint après `maintenance.assigned`
  reçoit le lien d'acceptation).
- **Le geste se fait par le service et la politique de l'objet, pour le compte du lien**, jamais par une
  route « agir sur une carte » (ADR-0128 § 4) : la politique est rejugée au moment du geste. Un compte qui a
  perdu le droit voit le refus de l'objet, sans plus.
- **La page publique est minimale** : le geste, l'objet dans sa projection minimale (quartier, créneau, motif
  — ni adresse exacte, ni montant d'un autre, ni téléphone), le bouton. Après le geste : la confirmation, et
  une invitation à créer son mot de passe.
- **Un lien mort ne dit rien de l'objet** : expiré, déjà utilisé ou révoqué, la réponse est un code
  (`action_link.expired`, `.used`, `.revoked`) et rien d'autre. Un jeton inconnu rend 404.
- La carte du fil garde la trace du lien (envoyé, ouvert, fait), visible du personnel de l'agence du fil.

### 6. Le résumé du lundi (décision 5)

- **Lundi à 09:00, heure de Dakar**, un résumé par bailleur **et par agence** : ses biens que cette agence
  gère (bien d'agence dont il est le bailleur au sens de `BailleurDuBien::est`, profil propriétaire actif).
- **Seulement** s'il a au moins un tel bien **et** a activé le résumé dans ses préférences : événement neuf
  `owner_weekly_digest`, cases `email` et `whatsapp` éteintes par défaut ; activé = l'une des deux allumée. La
  case `inapp`, toujours vraie (`PreferenceResolver::shouldSend`), ne compte pas : le résumé n'entre pas dans le
  fil des notifications.
- Par WhatsApp, gabarit approuvé `resume_hebdo_bailleur` ; sinon par e-mail. Pas de SMS.
- Il porte, pour la semaine écoulée et pour ses seuls biens : les loyers encaissés et en retard, les
  interventions ouvertes et closes, les visites confirmées. Rien d'un autre bailleur.
- **Une réponse au résumé revient dans un fil** : le relais du résumé garde l'agence ; la réponse suit la
  règle du § 2 (étape 3, restreinte à cette agence).

### 7. Les clés et les gabarits (décision 6)

- Le code s'écrit et se vérifie **sans clé** : sur la documentation de l'API WhatsApp Cloud de Meta (forme des
  webhooks `messages`, `context.id`, boutons, `metadata.phone_number_id`) et par des tests à **faux
  transport** (`LogWhatsappDriver`, pilote SMS `log`, requêtes signées par un secret de test).
- **Une action de déploiement** (ADR-0127) liste ce qu'une personne doit faire : poser
  `WHATSAPP_WEBHOOK_APP_SECRET` (et re-mesurer les deux jetons), abonner le champ `messages` du webhook de
  l'application Meta, et faire approuver les quatre gabarits — `pont_invitation`, `pont_nouveau_message`,
  `pont_lien_action`, `resume_hebdo_bailleur` — en français et en anglais. TCK-2980 la crée.

### 8. Ce que la session a tranché (délégation du porteur, 2026-11-19)

Les questions restées ouvertes à l'écriture, tranchées par la recommandation de la session :

1. **Numéro de la plateforme** : un compte présent dans plusieurs agences, sans relais qui le rattache, devient un
   prospect ; un inconnu, un prospect sans agence, lu du seul super-admin (`PropertyContactLeadPolicy::view`).
2. **Code à 6 chiffres** : pour la signature seulement (ADR-0098). L'approbation d'un devis n'a pas de lien.
3. **`maintenance.assigned`**, seul code émetteur sans `action_for`, émet le lien d'acceptation vers le
   prestataire assigné tant que l'intervention n'est pas acceptée ; la règle vit dans `GestesParLien`.
4. **Une page, un geste** : ni « proposer un autre créneau », ni « je ne peux pas intervenir », ni « recevoir un
   nouveau lien » ; tout le reste passe par la conversation.
5. **Le résumé** : 09:00 heure de Dakar (la maquette disait 8 h heure de Paris) ; un résumé par (bailleur,
   agence) ; le bailleur sans mot de passe ne le reçoit pas.
6. **Rétention** : le numéro d'un relais et d'un lien s'efface 90 jours après le dernier envoi ou l'expiration ;
   la ligne reste.
7. **Taille** : TCK-2980 et TCK-2981 restent d'un seul tenant ; la création du compte du locataire est un
   morceau détachable de TCK-2981.

## Conséquences

- **Ce que ça coûte** :
  - une table `message_relays`, une table `action_links`, une colonne `messages.channel`, un cas
    `ContactLeadChannel::WhatsappInbound`, un événement de préférence ;
  - une tâche planifiée qui efface les numéros des relais et des liens après 90 jours ;
  - l'extension du pilote WhatsApp aux messages interactifs (bouton de réponse, bouton d'URL) et aux composants
    de bouton des gabarits : `WhatsappMessage` ne porte aujourd'hui que `text` et `template` (corps seul) ;
  - quatre gabarits Meta à faire approuver avant l'ouverture, par environnement ;
  - chaque message du personnel coûte une requête de plus (les destinataires joints par le pont), dans le job
    qui relaie, jamais dans la requête d'envoi.
- **Ce que ça interdit** :
  - qu'une note d'équipe, un montant d'un autre lecteur ou un numéro de téléphone quitte Takussan par le pont ;
  - qu'un geste se fasse dans WhatsApp lui-même (pas de bouton « Approuver ») ;
  - qu'un numéro inconnu entre dans le fil d'un client existant ;
  - que le pont écrive à un numéro qui a dit STOP, même par SMS.
- **Ce que ça rend possible** :
  - la fenêtre de 24 h existe enfin : les notifications peuvent partir en texte libre à qui a écrit ;
  - le bailleur de la diaspora et le plombier suivent le fil depuis WhatsApp, et agissent par lien ;
  - le locataire sans compte rejoint sa salle (si le porteur confirme le § 2).

## Ce que ça ne règle pas

- **Les médias entrants et sortants** (photo, vocal, document) : signalés, pas relayés. Les relayer demande de
  télécharger le média de Meta par son jeton et de le ranger dans la collection privée des pièces : décision
  à part.
- **Le SMS entrant** : ni réponse par SMS, ni STOP par SMS. La file MO de Mtarget ne garde pas le texte, et
  les autres opérateurs envoient sous un nom. Une personne sans WhatsApp ne peut donc pas donner l'accord, et
  ne reçoit le pont qu'en secours d'un accord donné sur WhatsApp. La page « Répondre » de la maquette n'est
  pas retenue dans ce lot.
- **Un refus qui n'est pas un STOP exact** (« stop svp ») : la maquette D le met « à trancher » par l'agent,
  avec une pause des envois. Non retenu dans ce lot ; c'est un message ordinaire.
- **Approuver un devis par lien** : hors du registre des gestes. Le code à six chiffres que la maquette
  ajoute aux gestes sensibles n'existe que pour la signature, par ADR-0098.
- **Plusieurs messages types au choix de l'agent** (« Relance du créneau », « Demande de devis » dans la
  maquette) : un seul gabarit, `pont_nouveau_message`, relaie tout message hors fenêtre. **Plusieurs gestes sur
  une page** (« Proposer un autre créneau », « Je ne peux pas intervenir ») : un lien fait un geste ; le reste
  passe par la conversation.
- **Le bailleur sans compte et le résumé** : il n'a pas de préférences à régler ; il ne reçoit pas le résumé
  tant qu'il n'a pas de mot de passe.
- **Le numéro de la plateforme et plusieurs agences** : un message sans contexte d'un compte présent dans deux
  agences ne se range pas (§ 2, étape 4).
- **Les engagements de l'agence** dans le résumé : quand le lot 3 les aura livrés.

## Options écartées

- **(A) Tout dans WhatsApp** (boutons et listes pour agir) : le numéro serait la seule preuve d'identité ; un
  téléphone prêté approuve un devis. Signer et payer ne tiennent pas dans un bouton.
- **(B) Les liens seuls**, sans relayer la conversation : ce que la personne écrit dans WhatsApp se perd.
- **(C) Un petit espace par jeton durable** : un jeton de 30 jours est un compte qui ne dit pas son nom
  (révocation, appareils).
- **Un second modèle de participant « par le pont »**, sans compte : il dupliquerait `ConversationAccess`, les
  non-lus, la boîte et la non-fuite des notes pour une seconde sorte de lecteur.
- **Un second numéro WhatsApp pour le pont** : le porteur a retenu le numéro des notifications ouvert en
  entrée ; celui du Radar reste à part (ADR-0081).

## Application

- **TCK-2980** (API) — le pont entrant : lecture de `value.messages[]`, numéro d'entreprise, idempotence,
  fenêtre, routage du § 2, prospect `whatsapp_inbound`, STOP / ARRET / START, `messages.channel` ; l'action de
  déploiement.
- **TCK-2981** (API) — l'accord et le relais sortant : invitation, `message_relays`, fenêtre, gabarit, SMS,
  statuts, `message.received` remplacé pour qui est joint par le pont ; le locataire sans compte.
- **TCK-2982** (API) — les liens d'action : `action_links`, `GestesParLien`, routes publiques, relais d'une
  carte ou d'un événement en lien.
- **TCK-2983** (front) — la page publique du lien d'action, et l'interrupteur du résumé dans les préférences.
- **TCK-2984** (front) — la vue de l'agent : canaux des participants, fenêtre et annonce du message type,
  « Joindre par WhatsApp », états des relais, trace de la carte.
- **TCK-2985** (API) — le résumé du lundi.
- **Gardes** :
  - une matrice de non-fuite du pont, un test par chemin de sortie (texte, gabarit, SMS, lien, résumé),
    vérifiée par ablation : aucune note d'équipe, aucun numéro, aucun montant d'un autre lecteur ;
  - un lien mort ne rend que son code ;
  - un message entrant rejoué ne s'écrit qu'une fois.
