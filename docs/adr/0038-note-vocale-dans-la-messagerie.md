# ADR-0038 — La note vocale est un message `audio` portant un fichier privé

- **Statut** : Accepté, **amendé le 2026-10-23** (cf. § *Amendement du 2026-10-23 — `video/mp4` est accepté*) et **le 2026-11-10** (cf. § *Amendement du 2026-11-10 — une photo ou un PDF joints*)
- **Date** : 2026-10-07
- **Tickets** : [TCK-592](../backlog/tickets/done/TCK-592-maintenance-intervention-de-bout-en-bout.md)
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

## Amendement du 2026-10-23 — `video/mp4` est accepté (P194.02)

Décision du porteur du 2026-10-23, sur la piste P194.02 (angle 194 du fichier de pistes,
`docs/plans/2026-10-15-pistes-d-amelioration.md`). Il complète la liste des formats du point 2.
Relu sur `pre-dev` 4a12ba515.

**Constat.**

- La règle du champ `audio` est `mimetypes:` seule, sur `SendMessageConversationRequest::AUDIO_MIMETYPES`
  (l. 54-56, appliquée l. 71) : `audio/webm`, `video/webm`, `audio/ogg`, `audio/mp4`,
  `audio/x-m4a`, `audio/aac`, `audio/mpeg`. `video/mp4` n'y est pas.
- Le front enregistre dans le premier format que le navigateur accepte, dans l'ordre
  `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg;codecs=opus`, `audio/mp4`
  (`VoiceNoteRecorder.tsx:15`). **`audio/mp4` est le dernier repli** : c'est celui d'un navigateur
  qui n'enregistre ni WebM ni Ogg.
- **`finfo` juge la marque `ftyp` du conteneur, pas sa piste.** Relevé par le mesureur et le
  délégué, le 2026-10-23, sur des fichiers produits par `afconvert` et sur des en-têtes `ftyp`
  synthétiques :
  - les marques MP4 génériques `isom`, `iso5`, `iso6` et `mp42` sont lues `video/mp4` ;
  - seule la marque `M4A ` est lue `audio/x-m4a`.

  Posté sur `POST /api/conversations/{id}/messages`, un AAC seul en marque `mp42` rend **422**. Le
  même son en marque `M4A ` rend 201.
- La marque que pose `MediaRecorder` dans Safari n'a pas été relevée. Si ce n'est pas `M4A `, une
  note vocale enregistrée sous Safari (iOS en particulier) rend 422.

**Décision.** `video/mp4` entre dans `AUDIO_MIMETYPES`. Le raisonnement est celui que le point 2
tient déjà pour `video/webm` : le type que rend `finfo` dit le conteneur. Un enregistrement de voix
**sans piste vidéo** dans un conteneur MP4 générique est lu `video/mp4`. Le refuser revient à
refuser une note vocale légitime.

**La borne de 2 Mo reste, et c'est elle qui protège.** Accepter `video/mp4` laisse aussi passer une
vraie vidéo de moins de 2 Mo, déposée comme « note vocale ». C'est la même ouverture que
`video/webm` depuis le premier jour. Elle est acceptée pour la même raison :

- la borne de taille est appliquée par le serveur (`AUDIO_MAX_KB = 2048`) ;
- le fichier reste privé, servi par URL signée aux seuls participants ;
- le serveur ne décode pas l'audio (point 3).

Une vidéo de 2 Mo ne pèse pas plus sur le stockage qu'une note vocale de 2 Mo.

**Application.**

- `SendMessageConversationRequest::AUDIO_MIMETYPES` gagne `video/mp4`, et son docblock dit
  pourquoi, comme pour `video/webm`.
- `tests/Feature/Messaging/AudioMessageTest.php` gagne un cas qui dépose un **vrai conteneur MP4
  audio** de marque générique (`isom` ou `mp42`), et non un fichier dont le type se déduit du nom
  (le seul test existant dépose un `note.ogg` par `createWithContent`). Le cas rend 201, et 422
  quand on retire `video/mp4` de la liste (ablation).
- Le relevé de la marque d'un enregistrement Safari réel reste utile. Il ne conditionne plus la
  décision.

## Amendement du 2026-11-10 — une photo ou un PDF joints (TCK-2631, TCK-2632)

- **Statut** : Accepté le 2026-11-10 (approche A de la messagerie, « Les personnes d'abord », famille 3
  de l'audit UX ; recommandations validées par le porteur) — modalités : décisions de la session, à
  revoir.
- **Amende** : le point 1 (ce qu'un participant écrit) et le point 2 (le champ de fichier). Les points 3
  à 6 valent pour les nouveaux types.

**Contexte** (relevé sur `dev`, 1bce3798a, le 2026-11-10 ; audit
[`03-coque-et-accueil.md`](../qa/audit-ux-2026-11/03-coque-et-accueil.md), § 5).

- Envoyer la photo d'une fuite, d'un compteur, d'une pièce d'identité ou d'un devis en PDF est un
  besoin entier. Le trombone avait été retiré de l'écran parce que l'API ne servait pas la route
  (TCK-683).
- `MessageType` a déjà `image` et `document`. Seul `SendMessageConversationRequest::PARTICIPANT_TYPES`
  les refuse au participant (`MessageTypeSpoofingTest` le garde).
- La collection privée `attachments`, l'URL signée (`PrivateMediaAccess`) et la ressource
  `attachments[]` existent depuis le point 5.

**Décision.** **Un participant actif peut envoyer une image ou un PDF, un fichier par message, dans la
collection privée `attachments`, lu par la même URL signée que la note vocale.**

1. `PARTICIPANT_TYPES` devient `text`, `audio`, `image` et `document`. `system` reste à
   `SystemMessageFactory`.
2. **Formats et bornes**, appliqués par le serveur sur le type que rend `finfo` :
   - image `jpeg`, `png` ou `webp`, **8 Mo** au plus ;
   - PDF, **10 Mo** au plus ;
   - un fichier par message ;
   - le champ de fichier est requis pour ces types et interdit pour les autres.
3. **Les métadonnées EXIF des images sont retirées avant stockage**, la position GPS en tête : une photo
   prise chez un locataire dit où il habite. Une vignette est produite pour l'aperçu.
4. **Lecture** : la même que la note vocale (point 5). Une URL signée par `PrivateMediaAccess`, servie
   dans une réponse déjà autorisée (participant actif).
5. **Aperçu neutre dans la liste des conversations** : une clé (« Photo », « Document »), jamais le nom
   du fichier.
6. **Suppression et portabilité** : celles du message (point 6). L'export de données de l'auteur porte
   ses messages comme aujourd'hui.
7. **Débit** : le limiteur `conversation-message` et l'idempotence
   ([ADR-0072](0072-une-cle-d-idempotence-commune-pour-les-ecritures-rejouees.md)) s'appliquent tels
   quels.

**L'analyse antivirus.** Le dépôt n'en a aucune, et ce choix laisse passer un PDF piégé d'un
participant à un autre.

- **Elle n'est pas exigée par cet amendement, et c'est une dette nommée** : [D-73](../ardoise.md#d-73--les-pièces-jointes-de-la-messagerie-ne-seront-analysées-par-aucun-antivirus) de l'ardoise.
- La raison : seuls les participants du fil lisent la pièce, par URL signée et jamais par lien public.
  Le risque est celui d'une pièce jointe de courriel entre deux personnes qui se connaissent, pas
  celui d'un dépôt public.
- La dette se rouvre si une pièce jointe devient lisible hors du fil (partage, publication) ou si un
  fil s'ouvre à des inconnus.

**Conséquences.**

- **Le stockage croît par pièce**, sur le seau privé (R2,
  [ADR-0029](0029-medias-sur-r2-servis-par-cloudflare-transformations.md)). Les bornes de taille sont
  la protection.
- **Un PDF n'est pas réécrit** : seules les images sont nettoyées. Un PDF garde ses métadonnées
  d'auteur, comme dans un courriel.
- `MessageTypeSpoofingTest` change exprès : `image` et `document` passent, `system` reste refusé.
- Une pièce ne se recherche pas (`MessageSearchService` n'indexe que `content`).

**Application.** `SendMessageConversationRequest` (types, mimes, tailles). `ConversationController::sendMessage`
(fichier, EXIF retiré, vignette, aperçu). Gardes (TCK-2631) :

- une photo JPEG avec position GPS est acceptée, et le fichier relu n'a plus de balise GPS ;
- un PDF de 10 Mo passe, un PDF de 11 Mo rend 422 ;
- un exécutable renommé `.pdf` rend 422 (type par `finfo`) ;
- un non-participant ne lit pas l'URL.

Chaque garde se vérifie par ablation.

