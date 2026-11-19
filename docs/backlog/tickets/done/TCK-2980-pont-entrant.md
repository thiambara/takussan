---
id: TCK-2980
title: "Le pont entrant : le webhook des notifications lit les messages, un numéro connu parle dans son fil, un inconnu devient un prospect, STOP / ARRET / START"
status: done
phase: P2
family: back
estimate: L
wave: 98
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2957, TCK-2960]
blocks: [TCK-2981, TCK-2984, TCK-2985]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#54-whatsappcontact-
    - docs/models-spec.md#67-propertycontactlead-
tags: [back, messagerie, le-fil, pont, whatsapp, webhook, consentement, adr-0132, adr-0128]
---

## Objectif utilisateur

- **Le bailleur, le prestataire, le client qui écrivent au numéro WhatsApp de Takussan** : leur message arrive
  dans le fil de leur bail, de leur intervention ou de leur échange avec l'agence, marqué « par WhatsApp ».
- **Une personne inconnue qui écrit à ce numéro** : sa demande arrive dans la boîte des demandes de l'agence,
  à traiter, sans entrer dans le fil d'un client.
- **Toute personne** : « STOP » ou « ARRET » coupe WhatsApp pour son numéro, sur-le-champ ; « START » le rouvre.

## Contrat de données

Le contrat est [ADR-0132](../../../adr/0132-le-pont-whatsapp-et-sms-relaie-le-fil-et-les-liens-d-action-font-un-geste.md),
§§ 0 (le pilote de canal), 1, 2 (sans le locataire sans compte, TCK-2981), 3 (STOP, ARRET, START) et 7.

**Prémisses mesurées (2026-11-19, `6a26d9701`)** :
- `WhatsappStatusController::extractStatuses` (`app/Http/Controllers/Webhook/WhatsappStatusController.php:126`)
  ne lit que `value.statuses[]` ;
- `WhatsappChannel.php:185` : rien n'écrit `whatsapp_contacts.last_inbound_at` ;
- le patron à suivre est `RadarWhatsappInbox` (filtre `metadata.phone_number_id` `:63`, `context.id`, `isStop` `:92`,
  verrou et index unique contre le rejeu de Meta) ;
- `IntegrationLocator::find` (`app/Services/Notifications/Sms/IntegrationLocator.php:25`) : l'intégration
  `whatsapp_cloud` est d'agence ou globale ; son identifiant de numéro est dans `credentials` ;
- `users_phone_verified_unique` (`2026_10_07_150200`) : un numéro vérifié désigne un seul compte ;
  `User.php:550` pour le second numéro ;
- `PropertyContactLead.php:85` (filtre par défaut `channel = form`), `:127` (`scopeATraiter`) et
  `ContactLeadController.php:86` (convertir exige `form`).

**Schéma** :
- `messages.channel` : chaîne, non nulle, défaut `app` ; valeurs `app`, `whatsapp`, `sms` (enum
  `App\Models\Enums\MessageChannel`, contrôle applicatif, ADR-0007). **Jamais lue d'une requête** : seul le pont
  la pose, par un attribut interne de `ConversationWriter::post`. `MessageResource` ne la rend **qu'au personnel actif de l'agence du fil et à l'auteur du message** (ADR-0132
  § 4, « Ce qui ne sort jamais »).
- `message_relays` (posée ici, servie aussi par TCK-2981, TCK-2982, TCK-2985) : `purpose`
  (`message|invitation|action_link|digest`), `direction` (`in|out`), `message_id` (FK, `cascadeOnDelete`, nul),
  `conversation_id` (FK, `nullOnDelete`, nul), `agency_id` (FK, `nullOnDelete`, nul), `user_id` (FK,
  `nullOnDelete`, nul), `customer_id` (FK, `nullOnDelete`, nul), `property_contact_lead_id` (FK, `nullOnDelete`,
  nul), `channel` (`whatsapp|sms`), `form` (`text|template|interactive|sms`, nul en entrée), `template` (nul),
  `phone` (E.164), `business_number_id` (nul), `provider_message_id` (nul), `status`, `failure_reason` (nul),
  `sent_at`, `delivered_at`, `read_at`, `failed_at` (nuls), horodatages. Index unique partiel
  `(channel, provider_message_id) WHERE provider_message_id IS NOT NULL` ; index `(phone, business_number_id,
  direction, created_at)` ; index `(conversation_id, user_id)`.
- `ContactLeadChannel::WhatsappInbound = 'whatsapp_inbound'` : une demande À TRAITER (identité : numéro et nom de
  profil WhatsApp ; un texte), comptée par `scopeATraiter`, listée par le filtre par défaut, convertible.

**Lecture du webhook** : `WhatsappStatusController::process` lit les statuts (inchangé) puis passe
`entry[]` à `App\Services\Pont\PontEntrant::recevoir()`. Le journal annote `event_type = messages` et le
nombre rangé, comme le Radar.

**Routage (ADR-0132 § 2)** — `App\Services\Pont\RoutageEntrant` :
- numéro d'entreprise : `metadata.phone_number_id` d'une intégration `whatsapp_cloud` active, sinon ignoré
  (`App\Services\Pont\NumerosDuPont`) ;
- numéro connu : vérifié sur un compte (principal ou second), ou `whatsapp_contacts` `opted_in` de source
  `pont_invitation` ou `pont_start` avec `user_id` ;
- fil, dans l'ordre : `context.id` → relais sortant ; dernier relais sortant **rattaché à un fil** vers ce numéro (< 7 jours ; un relais de résumé, sans fil, ne compte
  pas ici) ; fil le
  plus récemment actif du compte, inscriptible, de l'agence du numéro (numéro global : une seule agence en jeu) ;
  sinon prospect portant le nom et le numéro du compte (aucune colonne ne le rattache au compte) ;
- écriture par `ConversationWriter::post` au nom du compte, `channel = whatsapp`, avec un relais entrant
  (`direction = in`, `provider_message_id` = le `wamid`) ; `whatsapp_contacts.last_inbound_at` posé (ligne
  créée en `pending` si absente).

## Contraintes strictes (métier)

- **Garde inchangée** : jeton d'URL (404), signature (403, secret absent compris). Un message n'est lu qu'après
  la signature.
- **Rejeu** : un `wamid` déjà rangé ne s'écrit pas deux fois, ni en message ni en prospect, sous un verrou par
  numéro et l'index unique en dernier recours (PostgreSQL : pas de `try/catch` pour poursuivre une transaction
  abandonnée — `insertOrIgnore` ou verrou d'abord).
- **Un numéro inconnu n'entre jamais dans un fil**, même si une fiche client porte ce numéro.
- **Aucune ouverture de fil d'office** : le pont n'écrit que dans un fil existant où le compte peut écrire.
- **STOP / ARRET / START exacts** (règle de `RadarWhatsappInbox::isStop`, étendue aux trois mots, accents et
  casse repliés) ; tout autre texte est un message ordinaire. STOP ne crée ni message ni prospect.
- **Avis à code, jamais de prose, lus du seul personnel** : `pont.stop`, `pont.start` (dans les fils où ce
  numéro a un relais rattaché) et `pont.media_non_relaye` (`metadata` : le compte, le type de média), écrits en
  **`visibility = team`** (ADR-0132 § 3) : un autre client du fil n'apprend rien du canal d'un participant.
  Déclarés là où vivent les codes des avis du fil (à mesurer : `CodesDuFil` ou `SystemMessageFactory`), en
  vérifiant que le chemin d'écriture des avis accepte `team` (TCK-2965 l'a écrit pour les messages). Aucun média
  n'est téléchargé.
- **Prospect sans agence** (numéro de la plateforme) : `agency_id` nul, lu du seul super-admin
  (`PropertyContactLeadPolicy::view`, `app/Policies/PropertyContactLeadPolicy.php:31`) — mesuré, voulu.
- **Le numéro de téléphone** d'un relais n'est rendu par aucune ressource dans ce ticket.

## Delta à produire

- [ ] Migrations `add_channel_to_messages`, `create_message_relays_table` (index ci-dessus), avec `down()`.
- [ ] `MessageChannel`, `MessageRelay` (modèle), `ContactLeadChannel::WhatsappInbound` et ses lectures
  (`scopeATraiter`, filtre par défaut, `convert`).
- [ ] Le contrat `App\Services\Pont\CanalDuPont` (ADR-0132 § 0) et son pilote WhatsApp Cloud
  (`App\Services\Pont\Canaux\WhatsappCloud`, **posé sur `WhatsappDriverInterface`**, jamais un second client de
  l'API Meta) : normalisation d'un message entrant en forme neutre, accord et
  opposition, fenêtre. `PontEntrant` et `RoutageEntrant` ne lisent que la forme neutre (test : un faux pilote
  route sans rien de WhatsApp).
- [ ] `App\Services\Pont\NumerosDuPont`, `RoutageEntrant`, `PontEntrant`, `MotsDuConsentement` (STOP, ARRET,
  START).
- [ ] `WhatsappStatusController::process` : appel du pont, annotation du journal ; docblock à jour.
- [ ] `ConversationWriter::post` : attribut interne `channel` (absent de toute `FormRequest`).
- [ ] Commande `pont:effacer-numeros`, planifiée chaque nuit : met à `null` le `phone` des relais dont le dernier
  envoi a plus de 90 jours (ADR-0132 § 4, « Rétention ») ; TCK-2982 y ajoute ses liens.
- [ ] `ServiceWindow` : la fenêtre se lit par numéro **et** numéro d'entreprise (relais entrant le plus récent),
  `last_inbound_at` gardé pour les appelants existants.
- [ ] **L'action de déploiement** `docs/deploiement/actions/2026-11-19-ouvrir-le-pont-whatsapp.md` (ADR-0127,
  `type: cle-env`, `cles: [WHATSAPP_WEBHOOK_APP_SECRET, WHATSAPP_WEBHOOK_URL_TOKEN, WHATSAPP_WEBHOOK_VERIFY_TOKEN]`) :
  poser le secret d'application (absent du relevé de `docs/infra/hebergement.md:273`), re-mesurer les deux
  jetons, abonner le champ `messages` du webhook de l'application Meta, faire approuver les quatre gabarits
  d'ADR-0132 § 7 en `fr` et `en`. `node scripts/check-actions-de-deploiement.mjs` vert.
- [ ] Tests :
  - `PontEntrantTest` : charge utile signée, un cas par étape du routage (`context.id`, dernier relais, fil
    le plus récent, numéro global à deux agences → prospect) ; fil fermé à l'écriture sauté ; second numéro
    vérifié ; numéro d'un autre `phone_number_id` (celui du Radar) ignoré ;
  - `ProspectDuPontTest` : numéro inconnu → prospect `whatsapp_inbound` à traiter ; second message ajouté au
    même prospect ; fiche client au même numéro → prospect, pas de fil ; numéro global → `agency_id` nul ;
  - `ConsentementDuPontTest` : STOP, « Arrêt. », START ; « stop svp » reste un message ; avis `pont.stop` ;
    `WhatsappChannel` n'envoie plus rien à ce numéro après STOP ;
  - `RejeuDuPontTest` : le même `wamid` deux fois → un message, un relais ; idem pour un prospect ;
  - média → avis `pont.media_non_relaye`, aucun appel réseau.

## Critères d'acceptation

- [ ] **AC1** — Un message d'un numéro vérifié qui répond (`context.id`) à un relais arrive dans le fil de ce
  relais, `channel = whatsapp`, écrit par son compte. *Ablation : ignorer `context.id` le fait tomber dans le fil
  le plus récent d'un jeu de données à deux fils — rouge.*
- [ ] **AC2** — Un numéro inconnu, même porté par une fiche client, ne crée qu'un prospect. *Ablation :
  rapprocher par `customers.phone` — rouge.*
- [ ] **AC3** — Un `wamid` rejoué ne s'écrit qu'une fois. *Ablation : sans la vérification d'unicité — rouge.*
- [ ] **AC4** — STOP coupe WhatsApp pour le numéro (`opted_out`, source `pont_stop`), START le rouvre ; « stop
  svp » ne coupe rien. *Ablation : `isStop` élargi à `str_contains` — rouge.*
- [ ] **AC5** — Un message adressé à un `phone_number_id` qui n'est pas celui d'une intégration `whatsapp_cloud`
  n'écrit rien. *Ablation : filtre retiré — rouge.*
- [ ] **AC6** — Une requête non signée ou mal signée reste refusée en 403, sans rien écrire.
- [ ] **AC7** — Le locataire, lecteur d'un fil où le bailleur a écrit par WhatsApp puis dit STOP, ne reçoit ni
  l'avis `pont.stop` ni le `channel` du message du bailleur ; le personnel de l'agence reçoit les deux.
  *Ablation : écrire l'avis en `visibility = all` — rouge ; rendre `channel` à tout lecteur — rouge.*
- [ ] **AC8** — `scripts/check-actions-de-deploiement.mjs` et `scripts/check-webhook-env-keys.mjs` verts ;
  Pint propre ; tests des fichiers touchés verts.

## Hors périmètre

- Le relais sortant, l'invitation et l'accord par bouton, le locataire sans compte : TCK-2981.
- Les liens d'action : TCK-2982. L'écran : TCK-2984.
- Le téléchargement des médias, le SMS entrant (ADR-0132, « Ce que ça ne règle pas »).
- Un refus qui n'est pas un STOP exact « à trancher » par l'agent.

## Notes d'implémentation

### 2026-11-19 — implémentation (agent impl-2980, arbre partagé `feat/le-fil-lots-3-5`)

**Écarts au ticket, et pourquoi :**
- **Pas d'enum `MessageChannel`** : exigence du porteur relayée par la session — le canal est une **valeur libre**
  (`messages.channel`, `message_relays.channel`), contrôlée par le registre des pilotes
  (`App\Services\Pont\RegistreDesCanaux` : `APP` + les clés de `config('pont.canaux')`). Un canal neuf = une classe
  qui implémente `CanalDuPont`, une entrée de `config/pont.php`, ses clés ; aucune migration, aucune énumération.
- **`ContactLeadChannel::WhatsappInbound` gardé** (ADR et TCK-2984 le nomment) ; le PILOTE déclare le canal de son
  prospect (`CanalDuPont::canalDuProspect()`), le pont n'y nomme rien. Un second canal entrant coûtera un cas d'enum.
- `ContactLeadChannel::demandes()` / `estUneDemande()` : `scopeATraiter`, le filtre par défaut (tableau
  `[form, whatsapp_inbound]`), `ContactLeadController::convert` ET `ContactLeadService` (`:301`, `:346`, qui
  re-vérifiaient `Form` derrière le contrôleur — sans eux, convertir un prospect du pont rendait 422).
- **Avis du pont** : déclarés dans `SystemMessageFactory::AVIS_DU_PONT` (avis système sans auteur, catalogue fermé de
  clés de `metadata` : `user_id`, `channel`, `media`), écrits par `avisDuPont()` en `visibility = team`.
  `CodesDuFil` est le catalogue des événements d'OBJET ; un avis du pont n'a pas d'objet. Le chemin `team` d'un
  `system` passe par l'observateur (aucun aperçu commun) et par les signaux (canal personnel des lecteurs des notes).
- `message_relays.phone` est **nullable** (la rétention l'efface) ; `agency_id` a son propre index
  (`AgencyIdIsIndexedTest`).
- **STOP / START** sont tracés par un relais entrant sans message : un rejeu n'écrit pas un second avis. START ne
  rattache jamais un compte (`user_id`) : seul l'accord à une invitation le prouvera (TCK-2981).
- **Média d'un numéro inconnu** : le prospect est créé ou gardé, sans texte ajouté (aucun libellé écrit côté serveur).
- Étape 2 du routage : la restriction de l'étape 3 par un relais de **résumé** (`digest`, sans fil) n'est pas
  écrite — aucun relais `digest` n'existe avant TCK-2985.
- `channel` de `MessageResource` : rendu à l'auteur et à qui lit les notes d'équipe du fil
  (`EquipeDuFil::litLesNotes`, super-admin compris), jugé une fois par fil et par lecteur (attributs de la requête).
  Inscrit dans `CLES_JAMAIS_ATTEINTES` de `DateInventoryByValueTest` (le parcours n'a pas de lecteur).
- Webhook : le pont lit APRÈS les statuts ; une charge de statuts seuls garde l'annotation d'avant à l'octet près.
- Un `allowsWriting` sans profil actif (webhook, aucun `actingAs`) : vérifié, il ne lit pas `activeProfile()` ; tous
  les tests du pont passent par l'appel HTTP signé, sans `actingAs`.

**Mesures (2026-11-19)** : `php artisan test tests/Feature/Pont` → 35 tests verts après la révision du § 0 (6 classes, fichiers nommés un à un). Ablations, une à une,
restaurées par `cp`, md5 vérifié : AC1 (`context.id` ignoré) rouge ; AC2 (rapprochement par `customers.phone`) rouge ;
AC3 (sans vérification d'unicité) rouge (l'index unique lève : 500) ; AC4 (`str_contains`) rouge ; AC5 (filtre du
numéro retiré) rouge ; AC7 (avis en `all`) rouge ; AC7 (`channel` à tout lecteur) rouge.

**Ajouts après revue** : `Message::$hidden = ['channel']` (l'export des données sérialise les messages des
autres par `toArray()`) ; le pont retire un `user_id` qu'il n'a pas posé avant d'écrire STOP/START (sinon STOP puis
START feraient d'un compte jamais prouvé un « numéro connu ») ; un envoi par la route qui pose `channel` écrit `app`.
Deux ablations de plus, rouges. Le front type encore `channel` en `'form' | 'whatsapp' | 'call'`
(`contact-leads.ts:37`) ; `AgentPortfolio`, `ErasedMemberPortfolio` et `ContactLeadResponseStatsService` comptent
encore `form` seul.

### 2026-11-19 — révision d'ADR-0132 § 0 (elle PRIME sur le ticket)

La session a relayé la révision du § 0 après l'écriture du ticket ; le code suit l'ADR :
- **`config/messagerie.php`** (et non `config/pont.php`) : `canaux` (`nom => ['actif', 'pilote']`), `repli`
  (`whatsapp`, `sms` — lu par TCK-2981), `dernier_relais_jours`, `retention_numeros_jours`. Le registre
  (`RegistreDesCanaux`) lie le pilote par la config : une classe par clé, sans `match` en code — un `match` obligerait
  à toucher le code pour un canal neuf, ce que l'ADR exclut.
- **Le contrat** `CanalDuPont` : `nom()` (au lieu de `id()`), `capacites()` (`recoit`, `gabarits`, `medias`,
  `accuses`, `boutons`, `fenetreHeures`), `jetonDuWebhook()`, `verifierWebhook(Request)` (403),
  `lireWebhook(Request)` → `LectureDuWebhook` (messages entrants ET accusés normalisés, `AccuseEntrant`),
  `appliquerAccuses()`, `defiDAbonnement()` ; l'accord par (numéro, canal) : `accord`, `opposer`, `accorder`,
  `compteAccordePour`, `noterEntrant`. `envoyerTexte()` / `envoyerGabarit()` arrivent avec le relais (TCK-2981).
- **La route générique** `POST|GET /api/webhooks/messagerie/{canal}/{token}` (`MessagerieWebhookController`, patron
  de `webhooks/payments/{provider}/{token}`) : canal inconnu, inactif ou sans « reçoit » → 404 ; mauvais jeton → 404 ;
  signature refusée par le pilote → 403 ; journal `messagerie` (fournisseur = le canal, rétention 30 j), limiteur
  `webhook-messagerie`, rejeu par `WebhookReplayer` (`messagerie.webhook`). `webhooks/whatsapp/status/{token}` reste
  un **alias** (`WhatsappStatusController` délègue au même chemin) ; la garde HMAC et le défi `hub.*` sont passés du
  contrôleur au pilote `WhatsappCloud`, codes d'erreur inchangés.
- **L'accord, STOP et START par (numéro, canal)** : le pilote tient l'accord de SON canal (WhatsApp : `whatsapp_contacts`) ;
  un STOP reçu sur un canal ne coupe que lui (test `test_stop_ne_coupe_que_son_canal`, ablation rouge).
- Pas de pilote SMS dans ce ticket (sortant seulement, sans « reçoit » : il vient avec le relais, TCK-2981).
- Gardes de routes mises à jour : `AucunGuardTokenTest`, `ValeursEnListeParcoursDesRoutesTest`,
  `ImpersonationReadSweepTest` (`canal`), `PlatformAnyRouteExempt` (`MessagerieWebhookController@__invoke`).
- Ablations de la révision, rouges : « reçoit » ignoré, jeton ignoré, STOP propagé à un autre canal.

**Reste** : `MessageRelay` à documenter dans `docs/models-spec.md` (`check-models-spec` rouge, `/sync-specs`) ; le
libellé front de `whatsapp_inbound` et des avis `pont.*` (TCK-2984).
