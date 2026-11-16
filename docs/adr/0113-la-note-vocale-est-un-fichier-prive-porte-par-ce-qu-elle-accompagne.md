# ADR-0113 — La note vocale, hors de la messagerie, est un fichier privé porté par ce qu'elle accompagne, sous les bornes d'ADR-0038

- **Statut** : Accepté le 2026-11-15 (le porteur a demandé « écris les tickets pour tous les manques, implémente tout » — la proposition ci-après vaut acceptation, modalités à revoir) — proposé le 2026-11-15 (écrit avec les tickets des manques de l'audit des maquettes de `/app`, famille 4) — décision de la session, **à valider par le porteur** avant l'implémentation de TCK-2900
- **Date** : 2026-11-15
- **Tickets** : TCK-2900 (socle API), TCK-2901 (socle écran), TCK-2902 (les surfaces des interventions)
- **S'appuie sur** : [ADR-0038](0038-note-vocale-dans-la-messagerie.md) (la note vocale de la messagerie : formats, 60 s, 2 Mo, durée déclarée), [ADR-0029](0029-medias-sur-r2-servis-par-cloudflare-transformations.md) (médias privés sur R2, servis par URL signée)

## Contexte

Les maquettes validées par le porteur le 2026-11-11 placent une note vocale **hors de la messagerie** :

- le locataire qui signale une panne « garde le micro appuyé pour un message vocal » (`app-interventions`, écran « Locataire — signaler ») ;
- la confirmation résume « 2 photos, 1 message vocal » (écran « Locataire — demande envoyée ») ;
- l'agence l'écoute sur la fiche à dispatcher (« Message vocal · 0:18 ») et le journal le date (« Signalée par … — 2 photos, un message vocal »).

Mesuré le 2026-11-15 sur `dev` (worktree `feat/audit-manques-2026-11-15`) :

- ADR-0038 fait de la note vocale **un `Message` de type `audio`**. Le fichier vit dans la collection privée `attachments` du message ; `SendMessageConversationRequest` porte les formats et les bornes (`AUDIO_MIMETYPES`, 2 048 Ko, `duration` 1..60).
- Une demande d'intervention n'a **pas de conversation au signalement** : le fil de groupe naît à la première assignation d'un prestataire (`SyncMaintenanceConversation`). La note du locataire ne peut donc pas être un message.
- Le téléversement générique `POST /api/media` n'accepte que `photos`, `documents`, `avatars`, `logo`, en image ou PDF/DOCX (`MediaUploadRequest`).
- Aucune note audio n'existe sur `MaintenanceRequest` (collections `photos`, `completion_photos`, `quotes`, `before_photos`) ni ailleurs hors messagerie.
- TCK-2647 et TCK-2654 avaient mis la note vocale hors périmètre « en attendant un ticket » qui n'a jamais été écrit.

## Décision

**Hors de la messagerie, une note vocale est un fichier de la collection privée `voice_notes` du modèle qu'elle accompagne, déposé par le même geste que lui, sous les bornes d'ADR-0038. Elle n'est jamais un `Message`.**

1. **Un seul mécanisme, écrit une fois.**
   - Les formats, la taille et la durée déclarée d'ADR-0038 (§ 2 et § 3, amendement `video/mp4` compris) sortent de `SendMessageConversationRequest` vers une règle partagée (`App\Support\Media\VoiceNoteRules`).
   - La messagerie et chaque porteur l'appliquent. Une borne ne s'écrit jamais deux fois.
2. **Le porteur déclare la collection** par un trait (`HasVoiceNotes`). La collection est `voice_notes` : privée (ADR-0029), une note au plus par porteur dans ce premier usage, durée dans les propriétés du média (`custom_properties.duration`).
3. **Premier porteur : `MaintenanceRequest`**, au signalement.
   - Champs `voice_note` et `voice_note_duration` sur `POST /api/maintenance-requests`, facultatifs.
   - La demande reste valide sans description quand une note vocale est jointe. Sans note, la règle actuelle s'applique.
4. **Lecture.**
   - La ressource expose `voice_note {url, duration, mime_type}`, l'URL étant signée par `PrivateMediaAccess::signedUrl()`.
   - Elle l'expose dans le bloc `media` du détail (`MaintenanceRequestResource::mediaBlock`), sous la même règle que les photos du signalement (`photos`) : la note a les lecteurs de ces photos, ni plus ni moins. TCK-2900 relève cette règle et l'épingle par un test.
5. **Rétention** : celle du porteur. Le média suit la suppression du modèle (medialibrary). Aucune purge propre.
6. **Le journal** de la demande compte la note (« 2 photos, un message vocal »).
7. **La dictée n'est pas une note vocale.** Un champ dont le texte part dans un document signé (la note d'une pièce d'un état des lieux) reçoit une **dictée** : la parole devient du texte par la reconnaissance du navigateur, et aucun fichier n'est envoyé à Takussan (TCK-2903). Cette reconnaissance passe d'ordinaire par le service de l'éditeur du navigateur : ce transfert est à porter à la politique de confidentialité si la dictée est retenue.

## Conséquences

- **Ce que ça coûte** : une collection privée de plus par porteur, sur R2. Le composant d'enregistrement du front (`VoiceNoteRecorder`) se scinde en deux : un enregistreur sans envoi, réutilisable, et l'envoi propre à la messagerie (TCK-2901).
- **Ce que ça interdit** : envoyer la note du signalement comme un message. Le fil de l'intervention n'existe pas encore à ce moment, et le créer pour l'occasion changerait la règle de TCK-592, selon laquelle le fil naît à l'assignation.
- **Ce que ça rend possible** : tout porteur futur (une réserve d'état des lieux, une visite) reçoit une note vocale par le trait et la règle, sans nouvel ADR, pourvu qu'il garde ces bornes et cette lecture.
- **Ce que ça ne règle pas** : la transcription. Comme sous ADR-0038, elle reste hors périmètre et demanderait son propre ADR.

## Options écartées

- **Créer la conversation de l'intervention au signalement pour y poster un `Message` audio** : cela change le moment où le fil naît (TCK-592), et le prestataire hériterait d'un fil dont il n'était pas partie.
- **Ouvrir `POST /api/media` à l'audio** : la note serait déposée hors du geste qui la justifie. Le lien entre le fichier et la demande serait reconstitué après coup, avec une autorisation à réécrire.
- **Copier les règles de `SendMessageConversationRequest` dans la requête de la demande** : on aurait deux listes de formats qui dérivent. C'est le défaut que l'amendement `video/mp4` d'ADR-0038 a déjà dû corriger une fois.

## Application

- `App\Support\Media\VoiceNoteRules` (règle partagée), trait `HasVoiceNotes`.
- `MaintenanceRequest` : collection `voice_notes`. `StoreMaintenanceRequestRequest` et `MaintenanceRequestResource` portent la note (TCK-2900).
- Gardes :
  - `AudioMessageTest` reste vert, et prouve que la messagerie lit la règle partagée ;
  - un test de la demande : note acceptée, privée, URL signée ; formats et bornes refusés en 422 ; note invisible d'un prestataire non assigné.
