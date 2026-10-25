---
id: TCK-2058
title: "Une note vocale en conteneur MP4 de marque générique (lue video/mp4) est acceptée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#20-message-"
  adr:
    - "docs/adr/0038-note-vocale-dans-la-messagerie.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-note-vocale-enregistrée-en-audiomp4-peut-être-lue-videomp4-par-finfo-et-refusée-en-422"
tags: [api, messagerie, audio, pistes]
---

## Objectif

Une note vocale enregistrée dans un conteneur MP4 de marque générique, que `finfo` lit
`video/mp4`, n'est plus refusée en 422.

## Contexte

Réf : **P194.02** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : ADR-0038, amendement du 2026-10-23 : ajouter `video/mp4` à `AUDIO_MIMETYPES`, borne de 2 Mo inchangée, avec un test sur un vrai conteneur `isom`

- `SendMessageConversationRequest::AUDIO_MIMETYPES` n'avait pas `video/mp4` ; `finfo` juge la
  marque `ftyp`, et lit `video/mp4` pour `isom`, `iso5`, `iso6` et `mp42`.

## Hypothèses (mode sans humain)

- Le « vrai conteneur `isom` » est une seconde d'AAC à 32 kbit/s produite par
  `afconvert -f mp4f -d aac` (piste unique, `hdlr` `soun`), dont la marque majeure `mp42` est
  remplacée par `isom` (même longueur, contenu audio inchangé). Il est versionné en
  `takussan-api/tests/fixtures/audio/note-vocale-isom.mp4` (5 Ko) : la CI n'a pas `afconvert`.

## Delta à produire

- [x] `video/mp4` dans `AUDIO_MIMETYPES`, avec son motif dans le docblock.
- [x] `FichiersReels::mp4Isom()` et un cas de plus dans `AudioMessageTest::conteneurs`.

## Critères d'acceptation

- [x] AC1 — Le conteneur MP4 audio de marque `isom` est accepté (201).
- [x] AC2 — La borne de 2 Mo est inchangée.

## Hors périmètre

- Le relevé de la marque d'un enregistrement Safari réel (ADR-0038 : utile, ne conditionne plus la
  décision).

## Notes d'implémentation

- Avant correctif : le cas `mp4 isom` rend 422 (« must be a file of type … »).
- Ablation : `video/mp4` retiré de la liste → 1 rouge ; remis → 10 verts.
