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

### Livré (2026-11-15)

- **Socle partagé `takussan-web/src/components/note-vocale/`** :
  - `useEnregistreurDeNoteVocale.ts` — le micro, les formats préférés d'ADR-0038, la borne de 60 s, le refus du micro ; rend `{blob, mimeType, duration}` par `onNote`, n'appelle aucun endpoint. Modes `toucher` et `appui`. Porte désormais `VOICE_NOTE_MAX_SECONDS` (la garde `seuils-de-saisie.parity.test.ts` y lit la constante ; `VoiceNoteRecorder` la ré-exporte).
  - `EnregistreurDeNoteVocale.tsx` — le geste complet hors messagerie : micro rond (`size-12`, maquette « Locataire — signaler »), chrono « 0:05 / 1:00 », réécoute par la pastille, « Supprimer le message vocal » ; `onChange(note | null)`.
  - `PastilleDeNoteVocale.tsx` — le lecteur « Message vocal · 0:18 » de la maquette (disque primaire), toute la pastille est un bouton de 44 px nommé « Écouter le message vocal » / « Mettre le message vocal en pause » ; erreur de lecture affichée + `onErreur` (pour relire une URL signée périmée).
  - `onde.tsx` — `Onde`, `minutesSecondes`, `useOndeDuFichier`, `useNiveauxDuMicro`, `reduireLesNiveaux`, `cretes`, sortis de `messages/NoteVocale.tsx` sans changement.
- **Messagerie** : `VoiceNoteRecorder` compose le hook (l'enregistrement) et garde son UI (pilule, onde, envoi) et `useSendVoiceNote` ; `messages/NoteVocale.tsx` ne garde que la bulle `LecteurDeNoteVocale`. Tests TCK-2632 / TCK-2861 / `ChatView*` inchangés et verts.
- Clés neuves `common.noteVocale.*` (10, fr/en, wo = fr) — `common` est servi à la racine : la pastille marche sur toute page sans toucher `namespaces.json`.

### Décisions (tranchées, consigne du porteur)

- **La bulle de la messagerie reste dans `messages/`** : elle lit une pièce dont l'URL se relit quand elle périme (`useLecteurDePieceAudio`, TCK-2736) et écrit son `<audio>` dans `ChatView` (gel `media-has-caption`). La pastille partagée joue par `new Audio()` : aucun élément, rien à sous-titrer ; la transcription reste hors périmètre (ADR-0038, ADR-0113). Le commentaire de TCK-2861 qui renvoyait cette question à TCK-2901 est mis à jour.
- **Disque de la pastille** : le micro de la maquette au repos (le nom accessible dit « Écouter le message vocal »), « pause » pendant la lecture ; `pl-3 pr-4` comme la maquette.
- **`VoiceNoteRecorder` compose le hook, pas les deux composants** : sa réécoute (pilule à onde, « m:ss / 1:00 », envoi en rond) est le dessin propre du composeur de la messagerie (TCK-2632/2861) ; la remplacer par la pastille aurait changé les libellés et cassé AC6.
- **Pas de fiche de fidélité** : le socle ne rend aucun écran de maquette ; ses surfaces (et leur relevé) sont celles de TCK-2902.
- **Appui bref** : en mode `appui`, une durée arrondie à 0 s (< 0,5 s) ne produit aucune note ; en mode `toucher` la règle de la messagerie (au moins 1 s) est gardée. Un relâchement AVANT l'ouverture du micro (`getUserMedia` asynchrone) est retenu et appliqué dès le démarrage.
- Mode `appui` : capture du pointeur (le doigt qui glisse hors du disque arrête quand même), `pointercancel` arrête, Espace/Entrée tenus au clavier, menu contextuel du téléphone empêché, pas de `onClick`.
- Un écran quitté pendant l'enregistrement ferme le micro sans rendre de note.
- Pour vider l'enregistreur après un envoi, l'appelant le remonte (`key`) — pas de mode contrôlé.

### Défaut voisin corrigé

- À la borne de 60 s, la minuterie de 250 ms pouvait appeler `stop()` plusieurs fois avant que React la retire (le test AC3 l'a montré : 3 notes rendues avec un `MediaRecorder` doublé synchrone). L'arrêt est gardé par un drapeau « actif » (vaut aussi pour la messagerie, qui compose le même hook).

### Écarts à la prémisse

- La clé `messaging.voiceNote.duration` n'existe plus : TCK-2860 l'a retirée. Rien à faire.
- `VoiceNoteRecorder` venait déjà d'être retouché par TCK-2861 (onde) ; `NoteVocale.tsx` était isolé pour ce ticket — conforme.

### Mesures

- `npx vitest run` (note-vocale/__tests__, messages VoiceNoteRecorder* + ChatView*, seuils-de-saisie.parity) : 12 fichiers, 68 tests verts.
- Ablations (une à une, restaurées par md5) : garde « actif » de la borne → AC3 rouge ; rejet de l'appui bref → AC2 rouge ; arrêt retenu avant l'ouverture du micro → rouge ; `if (!supporte) return null` → AC4 rouge.
- ADR-0038 : le renvoi `VoiceNoteRecorder.tsx:15` (formats) complété du nouvel emplacement.
- `eslint` des fichiers touchés, `tsc --noEmit`, `npm run check:*` (i18n, namespaces, classes, vouvoiement), `scripts/check-*.mjs` racine : verts.
- Non mesuré au navigateur (lot sans navigateur) : le geste « garder appuyé » sur un vrai téléphone.
