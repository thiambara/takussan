---
id: TCK-2631
title: "Pièces jointes dans la messagerie, côté API : une photo ou un PDF par message, servi par URL signée aux seuls participants"
status: todo
phase: P2
family: back
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-10
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
- [ ] AC2 — Un PDF de 11 Mo est refusé en 422 avec un code d'erreur de taille, et aucun message n'est écrit (compte avant / après).
- [ ] AC3 — Un utilisateur retiré du groupe après l'envoi reçoit 403 sur l'URL de la pièce. Un participant actuel la lit.
- [ ] AC4 — La liste des conversations montre « Photo » en aperçu, et non le nom du fichier.
- [ ] AC5 — Ablation : remettre `PARTICIPANT_TYPES = [Text, Audio]` fait rougir AC1.

## Hors périmètre

- Plusieurs fichiers par message, la vidéo, les formats bureautiques autres que le PDF.
- L'antivirus des fichiers déposés : à décider dans l'amendement d'ADR (le dépôt n'en a pas aujourd'hui).
- L'écran (TCK-2632).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
