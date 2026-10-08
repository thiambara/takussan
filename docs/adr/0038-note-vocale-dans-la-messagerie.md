# ADR-0038 — La note vocale est un message `audio` portant un fichier privé

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-592](../backlog/tickets/TCK-592-maintenance-intervention-de-bout-en-bout.md)
- **S'appuie sur** : [ADR-0029](0029-medias-sur-r2-servis-par-cloudflare-transformations.md) (médias privés
  sur R2, servis par URL signée).

## Contexte

Le prestataire travaille sur un téléphone, souvent plus à l'aise à l'oral qu'à l'écrit, et souvent
en wolof — langue que la plupart des claviers ne corrigent pas. Décrire une fuite, un compteur, un
accès par écrit lui coûte ; le dire lui prend dix secondes.

Mesuré le 2026-10-07 sur `dev` (`5f872f1f`) :

- `MessageType` porte `text`, `image`, `document`, `system`. Aucun type audio.
- `Message` déclare une collection de médias `attachments`, **privée**
  (`tests/Feature/Media/MediaDiskCollectionsTest.php` l'épingle) — mais **aucun chemin ne l'écrit** et
  `MessageResource` ne l'expose pas : le type front `Message.attachments` est déclaré et toujours
  absent de la réponse.
- `SendMessageConversationRequest` acceptait **tout** `MessageType` sans fichier ; TCK-592 l'a
  restreint à `text` (un participant postait un `system`). Ce ticket y ajoute le seul autre type qu'un
  participant écrit.

## Décision

**Une note vocale est un `Message` de type `audio` dont le fichier vit dans la collection privée
`attachments` du message, servi par URL d'API signée. ≤ 60 secondes, ≤ 2 Mo.**

1. **Type** : `MessageType::Audio = 'audio'`. Un participant écrit `text` ou `audio`, rien d'autre
   (`SendMessageConversationRequest::PARTICIPANT_TYPES`) ; `system` reste à `SystemMessageFactory`.
2. **Fichier** : champ `audio`, **requis** quand `type=audio`, **interdit** sinon. Formats acceptés,
   ceux que produisent les navigateurs mobiles via `MediaRecorder` et les lecteurs courants :
   `audio/webm`, `audio/ogg`, `audio/mp4` / `audio/x-m4a` / `audio/aac`, `audio/mpeg` — plus
   `video/webm`, que `finfo` rend pour un enregistrement Chrome **sans piste vidéo**. ≤ 2 Mo.
3. **Durée** : champ `duration` (secondes, `1..60`), **déclaré par le client** qui enregistre et
   l'affiche. Le serveur ne décode pas l'audio (aucun `ffprobe` dans l'image, et il n'en faut pas un
   pour cela) : la borne qu'il **applique** est la taille. À 32 kbit/s (Opus, voix), 60 s font
   ~240 Ko ; 2 Mo laissent la marge d'un codec moins efficace sans laisser passer une piste de
   plusieurs minutes de bonne qualité. La durée déclarée est stockée dans `metadata.duration` pour
   l'affichage, jamais pour une décision.
4. **Contenu** : `content` devient facultatif pour un `audio` ; l'API pose un aperçu neutre
   (`messaging.audio_preview`, clé) pour la liste des conversations.
5. **Lecture** : `MessageResource` expose `attachments[] {id, name, mime_type, size, url}`, l'URL
   étant signée par `PrivateMediaAccess::signedUrl()` — la réponse qui l'émet est déjà autorisée
   (participant actif).
6. **Rétention** : celle du message. Le fichier suit le message (suppression du message → média
   supprimé par medialibrary) ; aucune purge propre aux notes vocales.

## Conséquences

- **Ce que ça coûte** : un type de plus côté front (enregistrer, écouter), et un fichier par note
  sur R2. Une note ne se recherche pas (`MessageSearchService` n'indexe que `content`).
- **Ce que ça interdit** : une durée vérifiée côté serveur. Un client malveillant peut déclarer
  `duration=10` sur une piste plus longue ; il reste sous 2 Mo. C'est accepté : la borne qui protège
  le stockage est appliquée, celle qui sert l'affichage est déclarative.
- **Ce que ça ne règle pas** : la transcription (utile pour l'agence qui ne parle pas wolof) — hors
  périmètre, et elle demanderait un service tiers à décider dans son propre ADR.

## Application

- `MessageType::Audio` ; `SendMessageConversationRequest` (règles `audio`, `duration`) ;
  `ConversationController::sendMessage()` écrit le fichier dans `attachments` ;
  `MessageResource` (`attachments`, `metadata`).
- `tests/Feature/Messaging/AudioMessageTest.php` : note ≤ 60 s acceptée (201, fichier privé, URL signée) ;
  `type=audio` sans fichier, fichier texte, durée 61 s, fichier > 2 Mo → 422 ; `audio` joint à un `text` → 422.
  `MessageTypeSpoofingTest` garde le refus de `system`, `image`, `document`.
