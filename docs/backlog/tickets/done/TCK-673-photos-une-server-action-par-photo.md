---
id: TCK-673
title: "Les photos d'un bien partent une par une, et la limite de 1 Mo des server actions est relevée"
status: done
phase: P0
family: bug
estimate: M
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-8--parcours-sur-téléphone
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage
tags: [front, back, media, photos, pistes]
---

## Contexte

Réfs : **P08.01** et **P10.03** du fichier de pistes, toutes deux `validé` par le porteur, avec la
même précision. Critères accordés : V7 et V8 pour P08.01, V5 et V7 pour P10.03. Les deux pistes ont
la même cause (le lot de photos part en une seule requête) et le même correctif.

L'assistant de création (`PropertyWizard`) et le panneau de médias (`PropertyMediaPanel` →
`MediaManager`) mettaient toutes les photos dans un seul `FormData`, envoyé à
`uploadPropertyPhotosAction`. Sans `serverActions.bodySizeLimit`, Next refuse tout corps de server
action au-delà de 1 Mo, alors qu'une seule photo réduite pèse 1 446 048 o (TCK-542). Côté API, la
règle `photos` n'avait pas de borne, et `max_file_uploads` n'était pas fixé (20 par défaut) : PHP
ignorait un 21e fichier sans erreur.

## Décision du porteur

une server action par photo, progression par fichier, bodySizeLimit à 12 Mo ; max_file_uploads et photos max:20

## Objectif

Chaque photo part dans sa propre server action, et chaque ligne dit ce qui arrive à sa photo. Le
corps d'une action accepte 12 Mo. L'API refuse un lot de plus de 20 photos, et PHP applique la même
borne.

## Delta à produire

- [x] `takussan-web/next.config.ts` : `experimental.serverActions.bodySizeLimit = '12mb'`.
- [x] `MediaManager` : une requête `onUpload([fichier])` par photo, l'une après l'autre. Chaque
      ligne passe de `pending` à `uploading`, puis à `done` ou `error`. La progression simulée
      jusqu'à 85 % est retirée. Un échec reste sur sa ligne, et les photos suivantes partent.
- [x] `PropertyWizard` : une server action par photo. Les photos déjà passées sont retenues une à
      une, et une reprise ne renvoie que les autres. Pendant l'envoi, une ligne `role="status"`
      dit « Envoi des photos : N sur M » (clé `property.wizard.photosProgress`, fr/en/wo).
- [x] `StorePropertyMediaRequest` : `photos` `max:20`.
- [x] `takussan-api/docker/php.ini` : `max_file_uploads = 20`.
- [x] Tests : `MediaManager.test.tsx` (2), `PropertyWizard.test.tsx` (3),
      `next-config.server-actions.test.ts` (1), `PropertyMediaTest.php` (2).

## Critères d'acceptation

- [x] AC1 — `next.config.ts` porte `experimental.serverActions.bodySizeLimit === '12mb'`.
- [x] AC2 — Trois photos déposées dans `MediaManager` donnent trois appels d'`onUpload`, d'une photo
      chacun. Si la deuxième échoue, son message s'affiche sur sa ligne, et les deux autres finissent
      `done`, avec deux vignettes dans la grille.
- [x] AC3 — Dans `MediaManager`, la deuxième photo reste `pending` tant que la première n'a pas
      abouti.
- [x] AC4 — Trois photos dans l'assistant donnent trois appels à `uploadPropertyPhotosAction`, avec
      un seul fichier `photos` chacun.
- [x] AC5 — Pendant l'envoi de la première de deux photos, l'assistant affiche « Envoi des photos :
      1 sur 2 ».
- [x] AC6 — Dans l'assistant, si la deuxième de trois photos échoue, l'avertissement partiel
      s'affiche. Réessayer ne renvoie que cette photo, et le bien n'est pas recréé.
- [x] AC7 — `POST /api/properties/{id}/media` avec 21 photos rend 422 sur `photos`, et aucun média
      n'est créé.
- [x] AC8 — `docker/php.ini` fixe `max_file_uploads` à `20`.

## Hypothèses (mode sans humain)

- « progression par fichier » : une server action ne rend aucun octet de progression. La ligne de
  chaque photo dit donc son état réel (en attente, en cours, envoyée, en échec), et la barre d'une
  photo en cours est indéterminée (pleine, pulsée), sans pourcentage inventé. Dans l'assistant,
  qui n'avait aucune ligne par photo, la progression est le rang de la photo en cours.
- Les photos partent l'une après l'autre, pas en parallèle : l'ordre d'arrivée donne l'ordre de la
  galerie, et la première photo devient la couverture.
- Dans l'assistant, un échec n'arrête pas les photos suivantes. Le premier message d'échec est celui
  qui s'affiche sur l'étape des photos.
- `takussan-api/docker/php.ini` n'est pas un chemin fermé à l'implémenteur, et le critère V5 que
  touche ce fichier est celui que le porteur a accordé pour P10.03.

## Hors périmètre

- `proxyClientMaxBodySize` : `src/proxy.ts` couvre les pages `/app/*` d'où partent ces actions, et
  Next y tronque un corps à 10 Mo par défaut
  (`next/dist/server/config-shared.js`, `proxyClientMaxBodySize: 10485760`). Une photo proche de
  10 Mo, enveloppe multipart comprise, peut donc encore échouer avant le plafond de 12 Mo. La
  précision ne le demandait pas : ce n'est pas modifié.
- Les autres envois par server action (`dashboard-customers.ts` pour les documents,
  `admin-agency.ts`) ne profitent que du nouveau plafond de 12 Mo. Leur voie d'envoi n'est pas
  modifiée.
- Le proxy Traefik devant l'API n'a pas été mesuré.
- Aucun envoi réel vers l'API n'a été rejoué (aucun navigateur, aucune préproduction).

## Notes d'implémentation

- Rouge avant correctif : les 8 tests. 21 photos rendaient 201. L'assistant envoyait un seul
  `FormData` de trois photos. `MediaManager` passait les deux photos à `uploading` d'un coup.
- Ablation : les cinq fichiers de correctif remis à `origin/pre-dev` donnent 8 rouges (6 vitest,
  2 PHPUnit). Une fois le correctif remis, les 8 sont verts.
- Le second paramètre `onProgress` d'`onUpload` est retiré du type. Aucun appelant ne s'en servait,
  et il n'a plus de sens avec un appel par photo.
- Un `UploadedFile::fake()` ne passe pas par PHP : le test de `max:20` ne dépend donc pas de
  `max_file_uploads`. C'est pourquoi `php.ini` a son propre test.
- Piège : une fois la progression simulée retirée, ESLint lève `react-hooks/set-state-in-effect`
  sur l'effet préexistant `useEffect(() => setGrid(items))`. Le fichier d'origine passait le lint.
  La synchronisation se fait maintenant pendant le rendu (motif de la prop précédente gardée dans
  l'état), avec le même résultat.
