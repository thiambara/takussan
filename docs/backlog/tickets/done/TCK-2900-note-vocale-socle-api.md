---
id: TCK-2900
title: "API — la note vocale hors de la messagerie : une règle partagée, un trait, et le premier porteur, la demande d'intervention du locataire"
status: done
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2902]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#27-médias--fichiers"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#20-message-"
tags: [back, voix, media, interventions, audit-ux, app]
---

## Objectif utilisateur

Le locataire qui signale une fuite peut la dire au lieu de l'écrire : sa note vocale part avec la demande, et l'agence l'écoute sur la fiche.

## Contrat de données

Décision : [ADR-0113](../../../adr/0113-la-note-vocale-est-un-fichier-prive-porte-par-ce-qu-elle-accompagne.md) (proposé le 2026-11-15, **à faire valider par le porteur avant le code**).

Constat (vérifié à l'écriture) :

- La note vocale n'existe que dans la messagerie (ADR-0038) : `SendMessageConversationRequest` (`AUDIO_MIMETYPES`, 2 048 Ko, `duration` 1..60), fichier dans `attachments` du `Message`.
- `MaintenanceRequest` n'a aucune collection audio (`photos`, `completion_photos`, `quotes`, `before_photos`) ; la conversation de l'intervention ne naît qu'à l'assignation (`SyncMaintenanceConversation`).
- `POST /api/media` n'accepte pas l'audio (`MediaUploadRequest`).

Audit (`audit-f4-patrimoine.md`, app-interventions **e1**, **e3**, et § « Écarts couverts » : TCK-2654 l. 144 « La note vocale … demande le stockage d'un audio, et un ticket » — **ce ticket n'existait pas**).

## Contraintes strictes (métier)

- Les bornes d'ADR-0038 s'appliquent sans copie : la messagerie et la demande lisent la **même** règle.
- Fichier **privé** (ADR-0029), servi par URL signée, dans le bloc `media` du détail, avec exactement les lecteurs des photos du signalement (`MaintenanceRequestResource::mediaBlock`) — relever cette règle avant le code et l'épingler par un test ; jamais une autre agence ni un lecteur public.
- Une demande peut partir sans description quand elle porte une note vocale (règle actuelle sinon).
- Le journal de la demande (`GET …/journal`, TCK-2786) mentionne la note sur l'entrée du signalement.
- Pas de régression de la messagerie (`AudioMessageTest`, `MessageTypeSpoofingTest`).

## Delta à produire

- [ ] Ajouter ADR-0113 à l'index `docs/adr/README.md` une fois validé.
- [ ] `App\Support\Media\VoiceNoteRules` : formats, taille, durée — `SendMessageConversationRequest` s'y branche.
- [ ] Trait `App\Models\Concerns\HasVoiceNotes` : collection privée `voice_notes` (un fichier), durée en `custom_properties`.
- [ ] `MaintenanceRequest` utilise le trait ; `StoreMaintenanceRequestRequest` : `voice_note` (fichier), `voice_note_duration` ; `MaintenanceRequestController::store` dépose le fichier dans la même transaction que la demande.
- [ ] `MaintenanceRequestResource` : `voice_note {url, duration, mime_type}` au détail, pour les lecteurs autorisés ; `has_voice_note` en liste.
- [ ] Journal : l'entrée du signalement compte la note.
- [ ] `docs/models-spec.md` § 21 : la collection `voice_notes` (ou laisser à /sync-specs).
- [ ] Tests : `MaintenanceRequestVoiceNoteTest` (note de 18 s acceptée, privée, URL signée ; fichier texte, durée 61 s, fichier > 2 Mo → 422 ; demande sans description mais avec note → 201 ; prestataire non assigné ne voit pas `voice_note` ; autre agence 404) ; `AudioMessageTest` reste vert (et rougit si la messagerie cesse de lire la règle partagée — ablation).

## Critères d'acceptation

- [ ] AC1 — Un locataire `POST /api/maintenance-requests` avec un fichier `audio/webm` de 300 Ko et `voice_note_duration=18`, sans description : 201, un média `voice_notes` sur le disque privé, et le détail rend `voice_note.duration = 18` avec une URL signée qui répond 200.
- [ ] AC2 — Le même envoi avec un `text/plain`, une durée de 61, ou un fichier de 2,5 Mo : 422 sur le champ concerné, et aucune demande créée.
- [ ] AC3 — Pour chaque lecteur du détail, `voice_note` est présent si et seulement si les `photos` du signalement le sont (test paramétré sur le demandeur, le personnel, le prestataire assigné avant et après acceptation, un prestataire non assigné) ; rouge si la condition de la note est retirée.
- [ ] AC4 — Retirer `audio/webm` de `VoiceNoteRules` fait rougir à la fois `AudioMessageTest` et `MaintenanceRequestVoiceNoteTest` (une seule source).
- [ ] AC5 — Le journal de la demande rend, sur l'entrée « Signalée par … », le nombre de photos et la présence de la note vocale.

## Hors périmètre

- L'enregistreur et les écrans (TCK-2901, TCK-2902).
- La transcription (ADR-0038, ADR-0113 : hors périmètre).
- La dictée de la note de pièce d'un état des lieux (TCK-2903 : texte, aucun fichier).

## Notes d'implémentation

### Livré (2026-11-15)

- `App\Support\Media\VoiceNoteRules` : `MIMETYPES`, `MAX_KB = 2048`, `MAX_SECONDS = 60`, `file()`, `duration()`. `SendMessageConversationRequest` s'y branche (`AUDIO_MIMETYPES`, `AUDIO_MAX_KB`, `AUDIO_MAX_SECONDS` supprimées : aucun autre lecteur, mesuré par `grep`).
- Trait `App\Models\Concerns\HasVoiceNotes` : collection `voice_notes` (`singleFile`, disque privé par défaut), `attachVoiceNote($file, $duration)` (durée en `custom_properties.duration`), `voiceNote()`, `hasVoiceNote()`, scope `withVoiceNoteFlag()` (sous-requête `exists`), `voiceNoteBlock()` (URL d'API signée, `PrivateMediaAccess::signedUrl`).
- `MaintenanceRequest` utilise le trait. `StoreMaintenanceRequestRequest` : `voice_note` (nullable, `VoiceNoteRules::file()`), `voice_note_duration` (`exclude_without:voice_note`, `required_with:voice_note`, `VoiceNoteRules::duration()`) ; la description du donneur d'ordre n'est plus exigée quand une note est jointe.
- `MaintenanceRequestController::store` : création, entrée `created` du journal et dépôt de la note dans une `DB::transaction` ; notifications et alerte d'urgence hors transaction (inchangées). `index` et `indexForProperty` posent `withVoiceNoteFlag()` après `buildQuery` (les champs choisis sont déjà appliqués).
- `MaintenanceRequestResource` : `has_voice_note` sur toute ligne ; `media.voice_note` (objet ou `null`) DANS `mediaBlock`, donc aux lecteurs de `photos` exactement.
- Journal : `MaintenanceJournalController` ajoute `photos_count` et `has_voice_note` sur la seule entrée `created`, lus à la lecture (les photos arrivent après la création par `POST …/photos`) : une requête `media`, seulement si la page porte cette entrée. Aucun code d'événement neuf.
- `docs/models-spec.md` : table des collections, § 20 (Message : la règle partagée), § 21 (`voice_notes`). Index des ADR : 0113 y était déjà.
- Front, types seuls : `MaintenanceVoiceNote`, `media.voice_note`, `has_voice_note` (`src/types/maintenance.ts`), `photos_count` / `has_voice_note` d'`EntreeDuJournal` (`src/lib/queries/maintenance.ts`).

### Contrat pour l'écran (TCK-2902)

- **Envoi** : `POST /api/maintenance-requests`, **multipart** (`FormData`, par `apiFetch`) — `property_id`, `title`, `category`, `description` (facultative pour le demandeur ; pour le donneur d'ordre, facultative SI une note est jointe), `priority`?, `lease_id`?, `voice_note` (le `Blob` de l'enregistreur, nommé p. ex. `note.webm`), `voice_note_duration` (entier, secondes, 1..60, exigé avec la note). Bornes : `VoiceNoteRules` (2 048 Ko, formats d'ADR-0038). 422 sur `voice_note` ou `voice_note_duration`. Les photos partent ensuite, comme avant, par `POST /api/maintenance-requests/{id}/photos`.
- **Réponse 201** : `data.has_voice_note: true` (pas de bloc `media` : ce n'est pas le détail).
- **Détail** `GET /api/maintenance-requests/{id}` : `data.media.voice_note = {id, url, duration, mime_type} | null` (URL d'API signée, 30 min, sans jeton — `<audio src>` direct ; `id` stable pour le cache de l'onde, comme dans la messagerie). Lecteurs : ceux des `photos` (demandeur, bailleur du bien, personnel, prestataire assigné avant et après acceptation).
- **Listes** (`GET /api/maintenance-requests`, `GET /api/properties/{id}/maintenance-requests`) : `has_voice_note` par ligne, jamais le fichier.
- **Journal** `GET …/journal` : l'entrée `created` porte `photos_count` (entier) et `has_voice_note` (booléen) → « Signalée par … — 2 photos, un message vocal ».
- TCK-2903 (note de pièce de l'état des lieux) n'est PAS un porteur : c'est une dictée en texte, sans fichier ni route (ADR-0113 § 7).

### Écarts à la prémisse

- « Demande sans description mais avec note → 201 » était déjà vrai pour le **locataire** (TCK-2652 : description facultative pour le demandeur). La règle nouvelle ne concerne que le **donneur d'ordre** : épinglée par `test_le_donneur_d_ordre_est_dispense_de_description_par_une_note` (rouge sans le correctif).
- AC4 : `finfo` lit un vrai WebM `video/webm` (mesuré sur un en-tête EBML minimal), jamais `audio/webm`, et `AudioMessageTest` ne postait que de l'Ogg et du MP4. L'entrée `audio/webm` ne se juge donc que par le type DÉCLARÉ : un cas `UploadedFile::fake()->create('note.webm', 300, 'audio/webm')` est ajouté à `AudioMessageTest` (et AC1 l'utilise), voulu malgré la règle de `FichiersReels`.
- AC1 « URL qui répond 200 » : le disque de test répond 200 ou 302 selon qu'il sait présigner — même tolérance que `AudioMessageTest` et `MaintenanceMediaExposureTest`.
- AC3 : un prestataire non assigné et une autre agence ne lisent pas le détail du tout (403/404) ; « voice_note ssi photos » se tient donc en mettant la note dans le bloc `media` lui-même. Le test vérifie en plus qu'aucune ligne de liste ne porte `voice_note` ni `media`.
- `JournalDeLInterventionTest` : l'entrée `created` a deux clés de plus (`photos_count`, `has_voice_note`) — attente mise à jour (voulu), les autres entrées gardent six clés.

### Mesures

- Tests : `MaintenanceRequestVoiceNoteTest` (18, dont la transaction et le chemin `fields[…]` du drapeau), `AudioMessageTest` (12), `MessageTypeSpoofingTest`, `JournalDeLInterventionTest`, `MediaDiskCollectionsTest`, `MaintenanceStoreWithoutDescriptionTest`, `MaintenanceMediaExposureTest`, `MaintenanceRequestListQueryBudgetTest`, `AmountRepresentationTest`, `DateRepresentationTest` + les trois gardes d'architecture : 91 verts. Gardes `scripts/check-*.mjs` : toutes vertes. `tsc --noEmit` propre.
- Ablations (une à une, restaurées, md5 vérifié) : `audio/webm` retiré de `VoiceNoteRules` → AC1 et le cas `audio/webm` d'`AudioMessageTest` rouges ; `voice_note` sorti du bloc `media` → AC3 rouge (5 lecteurs) ; dispense de description retirée → test du donneur d'ordre rouge ; `withVoiceNoteFlag()` retiré des listes → test de budget de requêtes `media` rouge ; `withReportedMedia` retiré → deux tests du journal rouges. `DB::transaction` retiré de `store` (dépôt qui lève) → `test_un_depot_de_note_qui_echoue_ne_laisse_ni_demande_ni_journal` rouge.
- La vue du personnel coûte déjà une lecture de `properties` et un `exists` `agent_profiles` PAR LIGNE de liste (relevé en écrivant le test de budget, hors de ce ticket) ; le test du drapeau ne compte donc que les requêtes sur `media`.

### Collision

- Les hunks TCK-2900 de `MaintenanceRequest.php`, `MaintenanceRequestResource.php` et `MediaDiskCollectionsTest.php` ont été embarqués par le commit de TCK-2911 (737e50291), sans le trait ni la règle : tant que ce ticket n'est pas commité, l'arbre commité référence `HasVoiceNotes` absent.

