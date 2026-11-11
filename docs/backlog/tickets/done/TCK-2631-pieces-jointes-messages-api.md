---
id: TCK-2631
title: "Pièces jointes dans la messagerie, côté API : une photo ou un PDF par message, servi par URL signée aux seuls participants"
status: done
phase: P2
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: [TCK-2632]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#20-message-"
tags: [back, messagerie, media, securite, adr, audit-ux, app]
---

## Objectif utilisateur

Le locataire envoie la photo de la fuite, le client sa pièce d'identité, l'agent un plan. Le fil garde la pièce, et seuls les participants la voient.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `MessageType` a déjà `image` et `document`, mais `SendMessageConversationRequest::PARTICIPANT_TYPES` = `[Text, Audio]` (`:54`). Un participant ne peut envoyer ni l'un ni l'autre.
- La collection de médias `attachments` existe sur `Message` et sert la note vocale (ADR-0038, privée). `ConversationController::messages` charge `media`, et `MessageResource` rend `attachments` avec une URL signée (`PrivateMediaAccess`, « participant actif de la conversation »).
- Le trombone du front a été retiré parce que la route n'existait pas (TCK-683).

## Direction UX / Artistique

Sans objet (ticket API). Écran servi : TCK-2632 (trombone, appareil photo, aperçu dans la bulle).

## Contraintes strictes (métier)

- **Pas d'antivirus, et c'est une dette nommée** : [D-73](../../../ardoise.md#d-73--les-pièces-jointes-de-la-messagerie-ne-seront-analysées-par-aucun-antivirus) (amendement d'ADR-0038). La pièce ne se lit que dans le fil, par URL signée ; tout geste qui la rendrait lisible hors du fil est hors périmètre.
- **Types acceptés** :
  - `image` : `jpeg`, `png` ou `webp`, 8 Mo au plus, contrôle par le contenu (`mimetypes`) et non par l'extension ;
  - `document` : `pdf`, 10 Mo au plus.
- **Un fichier par message**, avec une légende facultative dans `content` (5 000 caractères, la limite actuelle du texte).
- **Stockage** : la collection privée `attachments`, comme la note vocale (ADR-0038). Jamais un disque public.
- **Lecture** par URL signée de courte durée, rendue dans `attachments[].url` par `PrivateMediaAccess::signedUrl`, comme la note vocale (`MessageResource::attachments`), servie aux seuls **participants actuels** du fil. Un ancien membre, un non-participant ou un lien expiré reçoit 403. On réutilise ce contrôle, sans en écrire un second.
- **Les images perdent leurs métadonnées EXIF** (position GPS d'une photo prise chez le locataire) avant stockage. Une vignette est générée pour l'aperçu.
- **Aperçu de la liste** : `last_message_preview` neutre (« Photo », « Document »), comme la note vocale, sans le nom du fichier.
- **Débit** : le limiteur `conversation-message` et l'idempotence (ADR-0072) s'appliquent tels quels.
- **Un fil en lecture seule** refuse la pièce comme il refuse le texte.
- **Portabilité et suppression** : les pièces d'un compte supprimé suivent la règle des notes vocales (ADR-0038). L'export de données du compte les liste comme elle liste les notes vocales.
- **ADR** : l'extension de la collection `attachments` aux images et aux PDF est écrite en amendement d'ADR-0038 **avant** le code (amendement du 2026-11-10 de [ADR-0038](../../../adr/0038-note-vocale-dans-la-messagerie.md)).

## Delta à produire

- [ ] `SendMessageConversationRequest` :
  - `PARTICIPANT_TYPES` = `[Text, Audio, Image, Document]` ;
  - règles `file` selon le type (`mimetypes`, taille) ;
  - `content` facultatif pour `image` et `document`.
- [ ] `ConversationController::sendMessage` : fichier dans `attachments`, EXIF retiré, vignette, aperçu neutre.
- [ ] Vérifier que `PrivateMediaAccess` refuse l'ancien membre pour une image comme pour une note vocale (test), sans nouveau contrôle.
- [ ] Clés de traduction de l'aperçu (`messaging.image_preview`, `messaging.document_preview`) en `fr`, `en` et `wo`, et parité `LangGroupParity`.
- [ ] Tests :
  - `MessageAttachmentTest` :
    - jpeg de 2 Mo accepté ;
    - PDF de 11 Mo refusé (422) ;
    - `.exe` renommé `.jpg` refusé ;
    - EXIF GPS absent du fichier stocké ;
    - URL signée lisible par un participant, 403 pour un ancien membre et un non-participant ;
    - aperçu « Photo » ;
    - fil en lecture seule refusé.

## Critères d'acceptation

- [ ] AC1 — Un locataire participant envoie une photo jpeg de 3 Mo prise avec position GPS. Réponse 201 : `type = image` et `attachments[0].url` signée. Le fichier relu n'a aucune balise EXIF GPS.
- [ ] AC2 — Un PDF de 11 Mo est refusé en 422 avec l'erreur de taille de la validation (`errors.file` = `validation.max.file`, 10240 Ko ; le dépôt n'a pas de code pour un 422 de validation), et aucun message n'est écrit (compte avant / après). *Réécrit le 2026-11-11 d'après la mesure (TCK-2631, Notes d'implémentation).*
- [ ] AC3 — Un utilisateur retiré du groupe après l'envoi, et un non-participant, reçoivent 403 sur le fil (`GET …/messages`) : aucune URL de la pièce ne leur est plus émise. Une URL retouchée ou échue rend 403. Un participant actuel la lit. *Réécrit le 2026-11-11 d'après la mesure : l'URL signée est hors `auth:sanctum`, une URL déjà émise reste lisible 30 min par qui la détient (Notes d'implémentation).*
- [ ] AC4 — La liste des conversations montre « Photo » en aperçu, et non le nom du fichier.
- [ ] AC5 — Ablation : remettre `PARTICIPANT_TYPES = [Text, Audio]` fait rougir AC1.

## Hors périmètre

- Plusieurs fichiers par message, la vidéo, les formats bureautiques autres que le PDF.
- L'antivirus des fichiers déposés : à décider dans l'amendement d'ADR (le dépôt n'en a pas aujourd'hui).
- L'écran (TCK-2632).

## Notes d'implémentation

Relevé le 2026-11-11 sur `feat/audit-ux-app-lot-1` (b9cf98153).

**Prémisses qui différaient**

- **AC3 ne peut pas être tenu tel qu'écrit, et rien ne le tenait pour la note vocale non plus.** `media.private.show`
  est hors `auth:sanctum` (`PrivateMediaController`) : la signature EST l'autorisation, et une URL déjà émise reste
  lisible 30 min (`PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES`) par qui la détient, ancien membre compris.
  `PrivateMediaAccess` ne « refuse » donc personne : le contrôle réutilisé est celui de la RÉPONSE qui émet l'URL
  (`ConversationAccess`). Éprouvé (`test_seule_une_reponse_autorisee_emet_l_url_de_la_piece`) : l'ancien membre et le
  non-participant reçoivent 403 sur `GET …/messages` (plus d'URL neuve) ; une URL retouchée vers un autre média ou
  échue (31 min) rend 403 ; un participant actuel lit la pièce. **Fenêtre résiduelle : 30 min après le retrait**,
  à accepter ou à fermer par un ticket (TTL plus court pour `attachments`, ou une route authentifiée), pas ici : le
  ticket interdit un second contrôle.
- `messages.content` est **NOT NULL** : une pièce sans légende porte `content = ''` (et non l'aperçu, comme la note
  vocale) pour que le front distingue une légende du texte de repli. L'aperçu de la liste vient de
  `Message::neutralPreview()`, légende ou non ; l'avis de nouveau message (`NotifyNewMessageJob`) retombe sur lui
  quand `content` est vide (sans quoi l'extrait partait vide).
- **Export** : `messages.json` porte les lignes de message, `media/manifest.json` les seuls médias du compte —
  les notes vocales n'y sont pas listées comme fichiers aujourd'hui. « Comme les notes vocales » (ADR point 6) :
  aucun changement.
- **Suppression du compte** : `AccountDeletionService` ne touche aucun message ni ses médias (la note vocale suit le
  message, ADR-0038 point 6) — même règle pour une photo ou un PDF, aucun changement. Aucune route ne modifie ni ne
  supprime un message de participant ; `MessageObserver::created` écrit un aperçu depuis `content`, que
  `sendMessage` remplace dans la même transaction par l'aperçu neutre.
- **Idempotence** (ADR-0072) : la même photo rejouée sous la même clé rend un message et une pièce (testé).
- AC2 « code d'erreur de taille » : le dépôt n'a pas de code pour un 422 de validation. Le refus est
  `errors.file = validation.max.file` (attribut `messaging.attributes.file`, 10240 Ko), asserté tel quel.

**Décisions**

- Champ du fichier : `file` (le ticket dit « règles `file` »), requis pour `image`/`document`, interdit ailleurs
  (`audio` garde son champ `audio`). Règles par type dans `SendMessageConversationRequest::ATTACHMENT_RULES`.
- **Bombe de décompression** : le réencodage décode l'image entière dans la requête → `PixelsAuPlus` (20 Mpx, celle
  des avatars) sur l'en-tête, avant tout décodage. Conséquence : une photo de 48 Mpx (capteur plein) est refusée en
  422 — le front de TCK-2632 devra réduire avant l'envoi. Une image dont l'en-tête est lisible mais que GD ne décode
  pas rend 422 `media.file_rejected` (code existant), sans message ni fichier.
- EXIF : `AvatarReencode::sansMetadonnees()` réutilisé (spatie/image + GD, orientation appliquée aux pixels avant
  la perte de la balise) — pas de troisième réencodeur.
- Vignette : conversion `thumbnail` (400 px, jpg, file `media`) sur les seules images d'`attachments`, servie par
  `SERVABLE_CONVERSIONS` ; `attachments[].thumbnail_url` (null pour une note vocale, un PDF, ou tant que la file ne
  l'a pas produite).
- Limites d'envoi : `upload_max_filesize = 25M`, `post_max_size = 26M` (`docker/php.ini`), Caddy 25 MiB — un PDF de
  10 Mo passe en déploiement.
- Fixture : un JPEG porté à 3 Mo par des octets après `EOI`. Des segments `COM` ne conviennent pas : au-delà de 50,
  `finfo` renonce (« name use count (50) exceeded ») et `mimetypes:` refuse un JPEG valide.
- [D-73](../../../ardoise.md#d-73--les-pièces-jointes-de-la-messagerie-ne-seront-analysées-par-aucun-antivirus) passe de « décidée » à « ouverte ».
