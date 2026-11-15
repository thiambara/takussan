---
id: TCK-2900
title: "API — la note vocale hors de la messagerie : une règle partagée, un trait, et le premier porteur, la demande d'intervention du locataire"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
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

_(à remplir par implementing-specs)_
