---
id: TCK-676
title: "Une photo de bien qui échoue à la conversion ne laisse ni ligne ni copie temporaire, et le 422 la nomme"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-10--médias--tailles-conversions-disques-nettoyage
tags: [back, media, photos, pistes]
---

## Contexte

Réf : **P10.01** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`PropertyMediaController::store` appelait `$media?->delete()` dans son `catch`, mais `$media`
n'y était jamais affecté : `toMediaCollection()` lève avant de rendre. Or Spatie enregistre la
ligne et copie l'original **avant** la miniature synchrone (`FileAdder::processMediaItem`). Une
image que GD ne décode pas laissait donc une ligne `photos` sans miniature (une case vide dans la
galerie), l'original sur le disque, et la copie de l'original dans le répertoire temporaire de
conversion, que Spatie ne supprime qu'en cas de succès (`FileManipulator::performConversions`).
Le 422 portait la seule clé `photos` et ne disait pas laquelle avait échoué.

## Décision du porteur

supprimer le média raté et son répertoire temporaire ; la réponse liste les photos en échec

## Objectif

Une photo en échec ne laisse rien derrière elle. Les autres photos du lot restent, et le 422 nomme
chaque photo en échec par son rang.

## Delta à produire

- [x] `PropertyMediaController::addPhoto` : impose un `uuid` au média (`withProperties`), et en cas
      d'échec supprime le média de cet `uuid` (ligne et fichiers).
- [x] Même méthode : loge le répertoire temporaire de conversion sous un parent propre à la photo
      (`media-library.temporary_directory_path`, rétabli ensuite), et supprime ce parent dans tous
      les cas.
- [x] `store` : un échec n'arrête plus le lot ; le 422 porte une clé `photos.N` par photo en échec.
- [x] Test `PropertyMediaTest::test_photo_that_fails_conversion_is_removed_and_listed_while_the_others_stay`,
      avec un PNG à en-tête valide et corps illisible ; la clé du test existant du faux PNG passe
      de `photos` à `photos.0`.

## Critères d'acceptation

- [x] AC1 — Un lot `good.jpg`, PNG illisible, `after.jpg` rend 422 avec la seule clé `photos.1`.
- [x] AC2 — Après ce lot, le bien porte exactement `good.jpg` et `after.jpg` dans `photos`.
- [x] AC3 — Après ce lot, le répertoire temporaire de conversion est vide.

## Hypothèses (mode sans humain)

- « la réponse liste les photos en échec » : le statut reste 422 dès qu'une photo échoue. C'est le
  contrat que lisent les deux écrans (`PropertyWizard`, `MediaManager`), qui envoient depuis
  TCK-673 une photo par requête et affichent `message` sur un `ok: false`. La liste est portée
  par les clés `photos.N` de `errors`, la forme des erreurs indexées de Laravel. Aucun code du front
  ne lisait la clé `photos`.
- Le lot n'est pas rendu atomique : la précision ne demande de supprimer que le média raté.
- Le média raté se retrouve par l'`uuid` qu'on lui impose, et non par « le dernier média du bien »
  (la `Piste`), qu'un envoi concurrent sur le même bien peut être.

## Hors périmètre

- La borne de dimensions avant décodage (P10.02).
- Le front n'affiche pas quelles photos ont échoué dans un lot de plusieurs : il n'en envoie plus
  qu'une par requête.

## Notes d'implémentation

- Rouge avant correctif : le 422 portait `photos`, pas `photos.1`.
- Ablation, chaque pièce retirée seule : sans la suppression par `uuid`, le bien garde
  `broken.png` ; sans la suppression du parent temporaire, il reste un répertoire ; avec un `break`
  à la place du `continue`, `after.jpg` n'est pas ajoutée. Les trois rendent le test rouge, et il
  repasse au vert avec le correctif remis.
- Le faux PNG de `test_corrupted_image_…` (`UploadedFile::fake()->create`) atteint bien le
  `catch`, contrairement à ce que dit la mesure de la piste. Mais il y est refusé par le contrôle
  de type MIME de la collection, avant l'écriture de la ligne : c'est pourquoi ce test ne voyait
  pas le défaut.
