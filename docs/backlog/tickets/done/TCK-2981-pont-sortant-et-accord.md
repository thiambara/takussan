---
id: TCK-2981
title: "Le pont sortant et l'accord : « Joindre par WhatsApp », le relais par destinataire (texte dans la fenêtre, gabarit, SMS), la trace du canal, et le locataire sans compte dans sa salle"
status: done
phase: P2
family: back
estimate: L
wave: 98
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2980, TCK-2965]
blocks: [TCK-2982, TCK-2984]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#19-conversationparticipant-
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#54-whatsappcontact-
    - docs/models-spec.md#55-notificationtemplate--extension-whatsapp-
tags: [back, messagerie, le-fil, pont, whatsapp, sms, consentement, non-fuite, adr-0132, adr-0128]
---

## Objectif utilisateur

- **Le personnel de l'agence** : depuis le fil, il joint par WhatsApp un participant qui n'ouvre pas Takussan
  (le plombier, le bailleur de la diaspora, le locataire sans compte). Une fois l'accord donné, ce qu'il écrit
  part sur WhatsApp, ou en message type hors de la fenêtre de 24 h, ou par SMS en secours, et le fil dit par où.
- **La personne jointe** : elle reçoit une invitation à accepter les messages, rien avant ; ensuite les seuls
  messages de l'agence, jamais une note d'équipe ni le message d'un autre participant.
- **Le locataire sans compte** (décision à confirmer, ADR-0132 § 2) : en acceptant, il rejoint la salle de son
  bail.

## Contrat de données

Le contrat est [ADR-0132](../../../adr/0132-le-pont-whatsapp-et-sms-relaie-le-fil-et-les-liens-d-action-font-un-geste.md),
§§ 0 (les pilotes), 2 (« Le locataire sans compte »), 3 (l'accord) et 4.

**Prémisses mesurées (2026-11-19, `6a26d9701`)** :
- `WhatsappChannel` (`app/Notifications/Channels/WhatsappChannel.php`) : formes texte / gabarit
  (`TemplateResolver`), repli SMS (`SmsRouterDriver`), échec ambigu sans repli (TCK-766), `isOptedOut` ;
- `NotifyNewMessageJob` notifie `message.received` (préférence `message_received`) par tous les canaux de
  `NotificationService`, et filtre déjà les notes d'équipe (TCK-2965) ;
- `UpdateWhatsappDeliveryStatusJob` met à jour `notification_delivery_attempts` par `provider_message_id` ;
  `SendSmsAfterLateWhatsappFailureJob` est le patron du repli tardif ;
- `conversation_participants.user_id` obligatoire (`2026_04_17_160017:14`) ; `customers.user_id` nullable ;
  `SallesDuFil::membresAttendus` / `synchroniser` (`app/Services/Messaging/SallesDuFil.php:230`, `:258`) ;
- `EquipeDuFil` : le personnel actif de l'agence du fil.

**Routes** (auth Sanctum, jamais sous impersonation — `EnforceImpersonationReadOnly`) :
- `POST /api/conversations/{conversation}/pont/invitations` `{user_id}` ou `{customer_id}` : l'auteur est
  personnel actif de l'agence du fil **et** participant actif ; la cible est un participant actif du fil
  (`user_id`), ou la fiche du locataire sans compte du bail de cette salle (`customer_id`). Refus 422 à code :
  `pont.not_participant`, `pont.no_phone`, `pont.invalid_phone`, `pont.opted_out`, `pont.already_joined`,
  `pont.customer_not_in_room`. Limiteur nommé par auteur.
- **L'accord vaut pour le numéro, pas pour le fil** (ADR-0132 § 3) : si le numéro de la cible est déjà `opted_in`
  de source `pont_invitation` ou `pont_start`, « Joindre » la joint **d'emblée** dans ce fil, sans invitation (avis
  `pont.accord`, et les gestes que le fil attend d'elle émettent leur lien, TCK-2982) ; un `opted_in` d'une autre
  source (alerte de recherche) ne vaut pas accord : l'invitation part.
- **Un numéro vérifié sur un autre compte** que la cible (le numéro non vérifié d'un compte sans mot de passe, ou
  celui d'une fiche) : refus 422 `pont.numero_deja_a_un_compte`, pour les deux sortes de cible.
- Rien d'autre : aucune route « relayer ».

**L'invitation** : relais `purpose = invitation` (conversation, `user_id` ou `customer_id`, numéro, numéro
d'entreprise) ; gabarit `pont_invitation` hors fenêtre, message interactif dans la fenêtre ; un bouton de réponse
rapide « Accepter les messages » dont la charge utile désigne le relais d'invitation.

**Le pilote WhatsApp ne sait aujourd'hui envoyer que `text` et `template` à variables de corps**
(`WhatsappMessage.php`, `CloudApiWhatsappDriver::payloadFor` `:110`). Ce ticket l'étend, sur la documentation de
l'API Cloud de Meta : message `interactive` à boutons de réponse (`button_reply`), composant `button`
`quick_reply` à charge utile dans un gabarit ; et la lecture, à l'entrée, des types `button` et `interactive`
(`PontEntrant`). TCK-2982 y ajoute le bouton d'URL.

**L'accord** (lu par `PontEntrant`, TCK-2980) : la réponse au bouton, venue du numéro invité, pose
`whatsapp_contacts` en `opted_in`, `opt_in_source = pont_invitation`, `user_id` ; écrit l'avis `pont.accord`
dans le fil (`visibility = team`, comme tous les avis du pont) ; vide la file d'attente d'accord de ce
destinataire, dans l'ordre.
- **Fiche sans compte** (décision du porteur, 2026-11-19, ADR-0132 § 2) : **seule** la réponse au bouton de
  l'invitation envoyée à la fiche, venue du numéro de la fiche, crée un compte sans mot de passe
  (`password_set_at` nul), au numéro de la fiche (la fiche reste la source du numéro), tenu pour vérifié par ce
  message, rattaché à la fiche (`customers.user_id`), puis `SallesDuFil::synchroniser`. **Jamais un simple message
  entrant.** Un numéro déjà porté par un autre compte (principal ou second numéro, vérifié ou non) bloque : rien
  n'est créé, l'accord n'est pas posé, avis `pont.numero_deja_a_un_compte` (personnel seul), **aucune fusion**.

**Le relais** — `App\Jobs\RelayerMessageAuPont` (un par message et par destinataire), mis en file par
`NotifyNewMessageJob` :
- relayé : `type = text`, `visibility = all`, auteur personnel actif de l'agence du fil (`EquipeDuFil`) ;
- destinataire *joint par le pont* dans ce fil : accord donné dans ce fil, ou dernier message de lui dans ce fil
  en `channel = whatsapp` ; il cesse de l'être quand il écrit en `channel = app` ;
- forme : fenêtre ouverte → texte (« Nom (Agence) : … », gabarit de langue côté API, dans la langue du
  destinataire) ; fermée → gabarit `pont_nouveau_message` (registre `notification_templates`, événement
  `pont_nouveau_message`) ; sans gabarit approuvé ou échec sûr → SMS borné ; échec ambigu → rien de plus ;
  `opted_out` → rien, et pas de SMS ; avant l'accord → relais `status = en_attente_accord` ;
- chaque envoi écrit son relais (`purpose = message`, `direction = out`) ; `UpdateWhatsappDeliveryStatusJob`
  met aussi à jour les relais (`envoye`, `remis`, `lu`, `echec`) ; un `echec` tardif d'un relais WhatsApp repart
  une fois par SMS (sauf `opted_out`), avec son propre relais ;
- **`message.received` ne part plus sur WhatsApp ni SMS** vers un destinataire joint par le pont dans ce fil
  (application et e-mail inchangés).

**Lecture** :
- `MessageResource` : `channel` pour tous ; `relays` (`[{user_id, channel, form, status, at}]`, sans numéro)
  **seulement** pour un lecteur personnel actif de l'agence du fil.
- `GET /api/conversations/{id}/context`, par participant, pour ce même lecteur seulement : `pont`
  `{joint, accord_at, opposition_at, fenetre_jusqu_a, invitable}`.

## Contraintes strictes (métier)

- **Une note d'équipe ne part jamais par le pont**, ni en texte, ni en gabarit, ni en SMS, ni par la file
  d'attente d'accord.
- **Le message d'un participant qui n'est pas personnel** (un client, un prestataire) n'est relayé à personne.
- **Aucun numéro de téléphone** d'un participant dans une réponse de l'API, à aucun lecteur ; les relais et le
  bloc `pont` n'existent pas pour un client, un bailleur ou un prestataire qui lit le fil.
- **Rien ne part avant l'accord** ; **rien ne part vers `opted_out`**, SMS compris.
- Le relais tourne en file, après le COMMIT ; la requête d'envoi d'un message ne fait aucun appel réseau.
- Texte côté API pour WhatsApp et SMS : fichiers de langue, `fr` et `en`, `wo` = le français (wolof en pause).

## Delta à produire

- [ ] Route, `StorePontInvitationRequest`, `PontInvitationController`, codes d'erreur sous `LangGroupParity`,
  `ProtectedActionsCoverageTest` / `PlatformAnyRouteExempt` selon la règle des routes neuves.
- [ ] Le pilote `sms` du pont (`App\Services\Pont\Canaux\Sms`, sur `SmsRouterDriver`, **sans** la capacité
  « reçoit »), inscrit au registre de `config/messagerie.php` (ADR-0132 § 0, posé par TCK-2980) ; `RelaisSortant`
  suit l'**ordre de repli de la configuration** (`whatsapp` texte → `whatsapp` gabarit → `sms`) et les capacités
  déclarées de chaque pilote, sans nommer un canal en dur ; l'accord et l'opposition se lisent par (numéro, canal)
  (test : le faux pilote placé en tête de l'ordre de repli reçoit le relais ; un pilote sans « gabarits » est
  sauté hors fenêtre).
- [ ] `App\Services\Pont\InvitationsDuPont`, `AccordDuPont` (branché dans `PontEntrant`), `JointsParLePont`
  (qui est joint dans un fil, en lot), `RelaisSortant`.
- [ ] `RelayerMessageAuPont` ; `NotifyNewMessageJob` (relais + retrait des canaux mobiles pour les joints) ;
  `UpdateWhatsappDeliveryStatusJob` (relais) ; repli SMS tardif d'un relais.
- [ ] Entrées `notification_templates` (seeders) : `pont_invitation`, `pont_nouveau_message` en `fr` et `en`,
  `meta_status` non approuvé (l'approbation est l'action de déploiement de TCK-2980).
- [ ] `MessageResource`, `ConversationController::context` : `relays`, `pont`.
- [ ] Avis `pont.accord`, `pont.numero_deja_a_un_compte` déclarés avec ceux de TCK-2980, en `visibility = team`.
- [ ] `WhatsappMessage` et `CloudApiWhatsappDriver` : message interactif à boutons de réponse, bouton `quick_reply`
  de gabarit ; `LogWhatsappDriver` les journalise (faux transport).
- [ ] Tests :
  - `InvitationDuPontTest` : droits (client, agent d'une autre agence, non-participant refusés), cibles, codes,
    impersonation refusée ;
  - `AccordDuPontTest` : accord → `opted_in`, file d'attente vidée dans l'ordre ; fiche sans compte → compte
    créé, rattaché, membre de la salle ; un message libre du numéro de la fiche → aucun compte ; numéro porté par
    un autre compte (même non vérifié) → rien, avis au personnel, aucune fusion ;
  - `RelaisSortantTest` (faux transport) : fenêtre ouverte, fermée avec gabarit, sans gabarit → SMS, échec sûr →
    SMS, échec ambigu → rien, `opted_out` → rien, échec tardif → SMS une fois ; un seul relais par envoi ;
  - `NonFuiteDuPontTest` : note d'équipe, message d'un client, avis système → jamais relayés ; `relays` et
    `pont` absents pour le locataire ; aucun numéro dans les réponses ;
  - `message.received` non reçu sur WhatsApp par un joint, reçu par un non-joint qui l'a activé.

## Critères d'acceptation

- [x] **AC1** — Une note d'équipe écrite dans un fil où un participant est joint par le pont ne crée aucun
  relais. *Ablation : retirer le filtre `visibility` du relais — rouge.* — preuve : tests/Feature/Pont/RelaisSortantTest.php::test_note_d_equipe_avis_et_message_d_un_non_personnel_ne_partent_jamais
- [x] **AC2** — Avant l'accord, aucun envoi ; à l'accord, les messages en attente partent dans l'ordre.
  *Ablation : relayer sans regarder l'accord — rouge.* — preuve : tests/Feature/Pont/RelaisSortantTest.php::test_a_l_accord_les_messages_en_attente_partent_dans_l_ordre
- [x] **AC3** — Fenêtre ouverte → texte ; fermée → gabarit ; sans gabarit → SMS ; après STOP → rien, pas de SMS.
  *Ablation : retirer la garde `opted_out` du repli SMS — rouge.* — preuve : tests/Feature/Pont/RelaisSortantTest.php::test_fenetre_ouverte_texte_fermee_gabarit_sans_gabarit_sms et test_apres_stop_rien_ne_part_pas_meme_un_sms
- [x] **AC4** — Le locataire, lecteur du même fil, ne reçoit ni `relays` ni `pont`, et aucune réponse ne
  contient un numéro de téléphone. *Ablation : rendre `relays` à tout lecteur — rouge.* — preuve : tests/Feature/Pont/RelaisSortantTest.php::test_relays_et_numero_absents_des_reponses_du_fil
- [x] **AC5** — Un destinataire joint par le pont ne reçoit pas `message.received` sur WhatsApp ni SMS. *Ablation :
  ne pas retirer les canaux mobiles — rouge (deux envois).* — preuve : tests/Feature/Pont/RelaisSortantTest.php::test_un_joint_ne_recoit_pas_message_received_sur_le_mobile
- [x] **AC6** — L'accord d'une fiche sans compte en fait un membre de sa salle ; un message libre du même numéro
  n'en crée aucun ; un numéro porté par un autre compte ne crée rien. *Ablation : créer le compte sur tout message
  entrant — rouge ; créer sans vérifier les numéros des autres comptes — rouge.* — preuve : tests/Feature/Pont/AccordDeLaFicheTest.php::test_l_accord_de_la_fiche_en_fait_un_membre_de_sa_salle, test_un_message_libre_du_numero_de_la_fiche_ne_cree_aucun_compte, test_un_numero_porte_par_un_autre_compte_ne_cree_rien
- [x] **AC7** — Joindre dans un second fil une personne qui a accepté dans un premier ne lui envoie pas de seconde
  invitation ; une personne `opted_in` par l'alerte de recherche reçoit l'invitation. *Ablation : exiger une
  invitation par fil — rouge ; accepter toute source d'`opted_in` — rouge.* — preuve : tests/Feature/Pont/RelaisSortantTest.php::test_joindre_dans_un_second_fil_ne_reinvite_pas_mais_une_autre_source_d_accord_si
- [x] **AC8** — Pint propre ; tests des fichiers touchés verts. — preuve : Pint propre sur tests/Feature/Pont et Messaging/Copilote ; 36 tests verts (2026-11-19)

## Hors périmètre

- Les cartes et événements relayés en lien d'action : TCK-2982.
- L'écran de l'agent : TCK-2984.
- Une réponse par SMS, une page « Répondre », les médias.
- Joindre par SMS seul une personne sans WhatsApp (elle ne peut pas donner l'accord, ADR-0132).

## Notes d'implémentation

**Première livraison (2026-11-19, budget de 30 min, PR #1700)** — l'accord et le relais, avec leur non-fuite ; le locataire
sans compte et la lecture (`relays`, `pont`) restent.

Livré :
- **Contrat d'envoi** (`CanalDuPont`) : `envoyerTexte()`, `envoyerGabarit(destinataire, evenement, langue, variables,
  contexte)`, `fenetreOuverte()`, au résultat neutre `ResultatDEnvoi` (`envoye` / `echec` / `indisponible`, `ambigu`,
  `peutSeReplier()`). Pilotes : `WhatsappCloud` (par le pilote lié, gabarit par `TemplateResolver`, bouton de réponse en
  `interactive` dans la fenêtre et en `quick_reply` dans le gabarit) et **`Sms`** (sortant, sans « reçoit », inscrit à
  `config/messagerie.php`). Un SMS reporté par les heures calmes compte pour envoyé (le routeur le programme).
- **`RelaisSortant`** : l'ordre de `config('messagerie.repli')`, les capacités de chaque pilote (texte dans sa fenêtre,
  gabarit s'il en a), repli seulement sur un échec SÛR ; **une opposition sur un canal du repli arrête tout, SMS
  compris**. Aucun canal nommé (`PontSansCanalEnDurTest` reste vert : le cœur ne normalise plus par le module SMS).
- **`JointsParLePont`** (invitation acceptée dans le fil, ou dernier message venu du pont ; cesse s'il écrit depuis
  l'application ; invitation envoyée = en attente), **`InvitationsDuPont`** + `POST …/pont/invitations` `{user_id}`
  (personnel actif ET participant, pas d'impersonation, limiteur `pont-invitation` par auteur, codes `pont.*`),
  **`AccordDuPont`** branché dans `PontEntrant` (charge `pont-invitation:<id>`, numéro et canal de l'invitation ; STOP
  n'est pas levé par une vieille invitation ; avis `pont.accord` en `team` ; attente vidée dans l'ordre).
- **`RelayerMessageAuPont`** : garde AU DÉPART (texte, `visibility = all`, auteur personnel actif) ; en attente →
  `en_attente_accord` ; un seul relais par (message, destinataire) ; `NotifyNewMessageJob` le met en file et passe
  `mobileBorne: false` aux joints (application et courriel inchangés).
- Avis déclarés : `pont.accord`, `pont.numero_deja_a_un_compte`. Textes API : `lang/{fr,en,wo}/pont.php`.
- `message_relays.channel` devient nullable (relais qui n'a pu partir : `non_envoye`), dans la migration de TCK-2980.

**Complété après la PR #1700 (2026-11-19)** :
- **Bloc `pont` de `GET …/context`** (`PontDesParticipants`, `EtatDuNumero`, `CanalDuPont::etatDuNumero()` posé sur les
  trois pilotes dans la même passe) : une clé À PART de `participants[]`, sur le modèle de `commitments_records` — un
  objet indexé par `user_id`, une ligne pour CHAQUE participant actif sauf le lecteur (une ligne de relation n'existe
  que pour une relation lisible, TCK-2748). `{joint, invitation_en_attente, canal, accord_at, opposition_at,
  fenetre_jusqu_a, invitable}`, au seul personnel actif de l'agence du fil ; absente sinon. Écart au ticket : deux
  champs de plus (`invitation_en_attente`, `canal`), demandés pour l'écran (TCK-2984).
- **`MessageResource.relays`** (`[{user_id, channel, form, status, at}]`, le dernier relais par destinataire), au seul
  personnel actif ; `channel` reste servi à l'auteur et au personnel seulement, comme TCK-2980 l'a posé (le ticket
  disait « pour tous » : la règle plus étroite de TCK-2980, gardée par son AC7, est conservée).
- **Fiche sans compte (AC6)** : `POST …/pont/invitations {customer_id}` (la fiche locataire du bail de la salle, sinon
  `pont.customer_not_in_room` ; une fiche qui a un compte suit le chemin du compte) ; seule la réponse au bouton de
  SON invitation, venue de son numéro, crée le compte sans mot de passe (`PhoneVerificationService::markVerified`, le
  seul écrivain de `phone_verified_at`), le rattache, synchronise la salle. Numéro porté par un compte, même non
  vérifié : rien, accord non posé, avis `pont.numero_deja_a_un_compte`.
- **Accusés** (`AccusesDuPont`, appelé par `MessagerieWebhookController::traiter`, donc aussi au rejeu) : `envoye` →
  `remis` → `lu`, jamais de recul ; un `echec` tardif d'un relais de message repart une fois par les canaux qui suivent
  dans l'ordre de repli (`RelaisSortant::envoyer(apres:)`), jamais après une opposition. Écart au ticket : branché sur
  le contrôleur générique plutôt que dans `UpdateWhatsappDeliveryStatusJob`, pour rester sans canal nommé.
- **Gabarits** : migration `2026_11_19_298100_…` (`pont_invitation`, `pont_nouveau_message`, `fr`/`en`, `pending`).

Reste : un joint en sourdine n'est pas relayé (la sourdine filtre les destinataires en amont de
`NotifyNewMessageJob`) ; le bouton d'URL de gabarit (TCK-2982).