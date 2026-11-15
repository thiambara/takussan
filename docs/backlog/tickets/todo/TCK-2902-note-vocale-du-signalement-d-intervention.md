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

_(à remplir par implementing-specs)_
