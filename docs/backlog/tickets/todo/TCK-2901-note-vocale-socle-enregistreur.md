---
id: TCK-2901
title: "Front — un enregistreur de note vocale et un lecteur réutilisables, sortis de la messagerie"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2902]
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#27-médias--fichiers"
  models:
    - "docs/models-spec.md#20-message-"
tags: [front, voix, socle, messagerie, audit-ux, app]
---

## Objectif utilisateur

Partout où une maquette dessine un micro pour « un message vocal », l'utilisateur retrouve le même geste que dans la messagerie : appuyer pour enregistrer, réécouter, supprimer — et la même lecture « Message vocal · 0:18 ».

## Contrat de données

Aucun endpoint. Le socle n'envoie rien : il rend un fichier (`Blob`, type MIME, durée en secondes) à l'écran qui l'emploie. La messagerie garde son envoi (`useSendVoiceNote`, `POST conversations/{id}/messages`, ADR-0038).

Constat : `components/messages/VoiceNoteRecorder.tsx` (TCK-592, TCK-2632) mêle l'enregistrement (`MediaRecorder`, formats préférés, borne de 60 s, réécoute) et l'envoi propre à la messagerie (`conversationId`, `useSendVoiceNote`). Rien n'est réutilisable ailleurs. Décision : [ADR-0113](../../../adr/0113-la-note-vocale-est-un-fichier-prive-porte-par-ce-qu-elle-accompagne.md) § 1 et Conséquences.

## Direction UX / Artistique

- Référence : le micro rond de la messagerie (TCK-2632) et la pastille de lecture de la maquette `app-interventions` (`/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-interventions-agence.tsx` l. 415-420 : disque primaire avec `Mic`, « Message vocal · 0:18 ») — téléphone et bureau.
- Deux modes d'enregistrement : **toucher** (comme la messagerie) et **garder appuyé** (« gardez le micro appuyé », `app-interventions-autres.tsx` l. 144-148), relâcher arrête.
- Le lecteur : lecture / pause, durée « 0:18 », lisible au clavier.

## Contraintes strictes (métier)

- Bornes d'ADR-0038 : 60 s au plus (arrêt automatique), formats dans l'ordre `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg;codecs=opus`, `audio/mp4`.
- Rien n'est rendu sans `MediaRecorder` (un bouton qui ne peut pas marcher est un défaut).
- Un refus du micro s'affiche ; la note enregistrée reste pour réessayer.
- **Aucune régression de la messagerie** : mêmes libellés, même composeur (micro qui devient envoyer), mêmes tests verts.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Extraire l'enregistreur (sans envoi) et un lecteur de note vocale ; `VoiceNoteRecorder` de la messagerie les compose.
- [ ] Mode « garder appuyé » en plus du toucher.
- [ ] Tests : enregistreur rend `{blob, mimeType, duration}` ; borne de 60 s ; absent sans `MediaRecorder` ; mode appui (pointerdown/pointerup) ; lecteur affiche « 0:18 » ; tests de la messagerie inchangés et verts.

## Critères d'acceptation

- [ ] AC1 — L'enregistreur, monté hors de la messagerie avec un `MediaRecorder` doublé, rend à son appelant un fichier, son type MIME et une durée ≤ 60 ; il n'appelle aucun endpoint (aucune requête réseau).
- [ ] AC2 — En mode « garder appuyé », `pointerdown` démarre et `pointerup` arrête ; une durée de 0 s (appui bref) ne produit aucune note.
- [ ] AC3 — À 60 s l'enregistrement s'arrête seul.
- [ ] AC4 — Sans `window.MediaRecorder`, ni l'enregistreur ni son bouton ne sont dans le DOM.
- [ ] AC5 — Le lecteur d'une note de 18 s affiche « Message vocal · 0:18 » et son bouton de lecture a un nom accessible.
- [ ] AC6 — Les tests existants de `VoiceNoteRecorder` et du composeur de la messagerie passent sans modification de leurs attentes.

## Hors périmètre

- Les surfaces des interventions (TCK-2902).
- La dictée (TCK-2903).

## Notes d'implémentation

_(à remplir par implementing-specs)_
