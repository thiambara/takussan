---
id: TCK-2902
title: "Interventions : le locataire joint un message vocal à son signalement, la confirmation le compte, l'agence l'écoute sur la fiche et au journal"
status: todo
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2900, TCK-2901]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [front, voix, interventions, locataire, agence, audit-ux, app]
---

## Objectif utilisateur

Le locataire dit « il y a de l'eau sous l'évier depuis ce matin » en gardant le micro appuyé ; l'agence entend sa voix en ouvrant la demande.

## Contrat de données

- `POST /api/maintenance-requests` accepte `voice_note` + `voice_note_duration` ; le détail rend `voice_note {url, duration, mime_type}` ; la liste `has_voice_note` ; le journal compte la note (TCK-2900).
- Enregistreur et lecteur : TCK-2901.

Audit (`audit-f4-patrimoine.md`) : app-interventions **e3** (note vocale absente, docblock `acteurs/SignalementDuLocataire.tsx:49` « Hors périmètre : la note vocale »), **e4** (« 2 photos, 1 message vocal »), **e1** (message vocal du locataire absent de la fiche agence) ; fiche `TCK-2654.json` a-1, a-3, a-4.

## Direction UX / Artistique

**Référence de fidélité** : page `app-interventions`, approche `a` :

- **e3 « Locataire — signaler »** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-interventions-autres.tsx` l. 140-150 : sous « En deux mots », le champ texte et, à sa droite, le micro rond de 48 px ; dessous « Écrivez, ou gardez le micro appuyé pour un message vocal. » — **téléphone et bureau**. Une note enregistrée se réécoute et se supprime avant l'envoi.
- **e4 « Locataire — demande envoyée »** — même fichier l. 228-236 : la ligne de résumé « Eau · urgent · 2 photos, 1 message vocal » — **téléphone et bureau**.
- **e1 « Fiche — à dispatcher »** — `app-interventions-agence.tsx` l. 405-420 : la pastille « Message vocal · 0:18 » sous la description, et l. 368-372 l'entrée du journal « Signalée par Ousmane Niang — 2 photos, un message vocal » — **téléphone et bureau**.

## Contraintes strictes (métier)

- « En deux mots » n'est plus requis quand une note vocale est jointe ; sans note, la règle actuelle tient.
- L'envoi de la demande reste idempotent (`idempotent` sur la route) : un double toucher ne crée pas deux demandes ni deux fichiers.
- Le prestataire ne voit la note que si l'API la lui rend (aucune décision côté écran).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Signalement du locataire : micro à droite du champ, aide « Écrivez, ou gardez le micro appuyé… », note réécoutable / supprimable, envoyée avec la demande.
- [ ] Confirmation : « n photos, 1 message vocal » dans le résumé.
- [ ] Fiche de l'agence (et du locataire) : lecteur « Message vocal · 0:18 » ; journal qui dit « un message vocal ».
- [ ] Mettre à jour la fiche de fidélité `TCK-2654.json` (a-1, a-3, a-4 : l'écart « note vocale » disparaît) et le docblock de `SignalementDuLocataire.tsx`.
- [ ] Tests : `FormData` du signalement porte `voice_note` et `voice_note_duration` ; envoi sans description accepté avec note ; résumé ; lecteur rendu quand `voice_note` est servi, absent sinon.

## Critères d'acceptation

- [ ] AC1 — À 390, le formulaire de signalement porte un bouton « Message vocal » à droite du champ « En deux mots » et le texte d'aide ; sur un navigateur sans `MediaRecorder`, ni le bouton ni la phrase « gardez le micro appuyé » ne sont rendus (l'aide dit seulement « Écrivez »).
- [ ] AC2 — Une note de 12 s enregistrée puis envoyée produit une requête dont le `FormData` contient `voice_note` (fichier) et `voice_note_duration=12` ; la description vide n'empêche pas l'envoi.
- [ ] AC3 — La confirmation d'une demande envoyée avec 2 photos et une note rend « 2 photos, 1 message vocal ».
- [ ] AC4 — La fiche agence d'une demande dont le détail porte `voice_note.duration = 18` rend « Message vocal · 0:18 » et un bouton de lecture ; sans `voice_note`, rien de tout cela.
- [ ] AC5 — Le journal de cette demande rend « un message vocal » sur l'entrée du signalement.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` (écrans e1, e3, e4) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` (écrans e1, e3, e4) liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La transcription de la note.
- La note vocale dans les échanges après l'assignation : c'est la messagerie (ADR-0038), déjà livrée.

## Notes d'implémentation

Implémenté le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), sur l'API de TCK-2900 et le socle de TCK-2901.

**Livré :**
- e3 — `SignalementDuLocataire` : « En deux mots » porte à sa droite `EnregistreurDeNoteVocale` (mode `appui`, micro rond de 48 px) ; une note en cours ou enregistrée passe sur sa propre ligne (`onActif` → `basis-full`) pour ne pas écraser le champ à 390. Aide sous le champ, reliée par `aria-describedby` : « Écrivez, ou gardez le micro appuyé pour un message vocal. » quand `MediaRecorder` existe (lu par `useSyncExternalStore`, faux au rendu serveur, comme l'enregistreur), sinon « Écrivez ce qui ne va pas, en quelques mots. ». Docblock mis à jour (« Hors périmètre : la note vocale » retiré).
- Envoi — avec une note, `useSignalerUnProblemeAvecNote` (`lib/queries/maintenance-signalement.ts`) : même `POST /api/maintenance-requests`, **multipart** (`formDataDuSignalement` : champs du corps sauf nuls, `voice_note` nommé `note-vocale.<ext>` par `extensionAudio` — exportée de `conversations.ts`, la messagerie nomme ses notes ainsi —, `voice_note_duration` entier), `idempotence: true`. Sans note, le corps JSON d'avant est inchangé (`useSignalerUnProbleme`). Les photos partent ensuite comme avant.
- e4 — `DemandeEnvoyee` : clé `resumeAvecVocal` quand le détail sert `media.voice_note` — « Eau · urgent · 2 photos, 1 message vocal », et « … · 1 message vocal » sans photo (jamais « sans photo, 1 message vocal »).
- e1 — `NoteVocaleDeLaDemande` (`components/maintenance/`) : `PastilleDeNoteVocale` « Message vocal · 0:18 » sous la description, dans `FicheDIntervention` (agence) ET `MaintenanceDetail` (locataire, bailleur, prestataire) — rendue quand l'API sert `media.voice_note`, aucune décision de lecteur à l'écran. Une lecture qui échoue (URL signée périmée) relit le détail UNE fois. Une demande sans description ne rend plus de paragraphe vide (les deux fiches).
- Journal — l'entrée `created` dit « Signalée par {nom} » puis « 2 photos, un message vocal » (`photos_count`, `has_voice_note`, clé ICU `maintenance.journal.pieces`) ; sans pièce, la seconde ligne est omise. Les autres entrées ne changent pas.
- Fiches de fidélité : `TCK-2654.json` — l'écart « note vocale hors périmètre » (a-3) retiré, remplacé par un écart « donnée » sur a-4 (la #44 de la démo n'a pas de note) ; `TCK-2653.json` (a-1/a-2) — le motif « donnée » dit désormais où la pastille et le journal s'affichent.

**Décisions (mineures, tranchées) :**
- Multipart seulement avec une note : le chemin sans note, éprouvé et attendu par les tests de TCK-2654, ne bouge pas. Un double toucher reste gardé par `enCours` et par la clé d'idempotence (la même pour la requête rejouée).
- Aide sans micro : « Écrivez ce qui ne va pas, en quelques mots. » (l'AC dit « seulement Écrivez »).
- Journal : « Signalée par Ousmane Niang » sur l'entrée du signalement (maquette e1), au lieu de « Signalée / Par Ousmane Niang » ; l'attente de `relancer-le-bailleur.tck-2786` mise à jour (voulu).

**Écarts à la prémisse :**
- « Envoi sans description accepté avec note » était déjà vrai pour le locataire (TCK-2652, rappelé par TCK-2900) : rien à changer côté écran, la description vide n'était déjà pas envoyée ; le test AC2 l'épingle sans ablation propre.

**Mesures :** tests neufs — `signalement-note-vocale.tck-2902` (5 : micro à droite et aide liée, sans `MediaRecorder`, note de 12 s → `FormData` `voice_note` + `voice_note_duration=12` sans description et avec `Idempotency-Key`, suppression → JSON, double toucher → une demande) ; ajouts : `demande-envoyee.tck-2654` (3), `fiche-d-intervention.tck-2653` (3), `relancer-le-bailleur.tck-2786` (3), `MaintenanceDetail.test` (2). 30 fichiers du périmètre (maintenance, note-vocale, messagerie vocale, signalement) : 238 tests verts. 5 ablations rouges puis restaurées (md5) : envoi toujours JSON (AC2), aide toujours « gardez appuyé » (AC1), résumé sans vocal (AC3 ×2), pastille jamais rendue (AC4), pièces du journal omises (AC5). ESLint et `tsc --noEmit` propres ; `check:i18n`, `check:classes-emises`, `check:vouvoiement`, `scripts/check-*.mjs` racine verts. `check:i18n-namespaces` rouge hors de ce ticket (`journee` atteignable depuis `app/calendar` et `app/visits`, l'agenda).

**Non mesuré (navigateur hors du lot) :** AC-F2 à AC-F6 (`fidelite compare`, rideau, largeurs intermédiaires) ; le geste « garder appuyé » sur un vrai téléphone ; l'envoi multipart réel contre l'API (`property_id`/`lease_id`/`voice_note_duration` en chaînes : relu, l'API les lit par `(int)` / `integer()` et les règles `integer` acceptent une chaîne numérique).
