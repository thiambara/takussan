---
id: TCK-2146
title: "L'échec de l'envoi des photos d'une demande d'intervention neuve est dit sur la fiche"
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
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-222--photos-et-pièces-téléversées-hors-de-mediamanager-et-mediadropzone"
tags: [front, maintenance, i18n, pistes]
---

## Objectif utilisateur

Le demandeur dont les photos n'ont pas pu partir avec sa demande d'intervention l'apprend en
arrivant sur la fiche, au lieu d'y trouver une demande sans photo, sans trace.

## Contexte

Réf : **P222.01** du fichier de pistes, `validé (délégué)`. `MaintenanceForm.onSubmit` crée la
demande, puis envoie les photos dans un `try { … } catch {}` vide, avant de naviguer vers la
fiche ; le commentaire du `catch` promet une reprise « Ajouter des photos » que la fiche n'offre
pas au demandeur.

## Décision du porteur (déléguée)

> ne plus taire l'échec : remplacer le `catch {}` vide de `MaintenanceForm` par un avertissement sur la fiche où le demandeur arrive (la demande reste créée, on ne reste pas sur le formulaire, qu'un second envoi dupliquerait), qui dit que les photos n'ont pas été envoyées, clé neuve en `fr` et `en`, le `wo` portant le texte français, et retirer le commentaire qui promet une reprise « Ajouter des photos » qui n'existe pas ; test Vitest : `uploadPhotos` rejette → l'avertissement s'affiche ; reste : l'envoi de la collection `photos` par le demandeur sur la fiche (parcours neuf, au porteur)

## Reste à faire

> l'envoi de la collection `photos` par le demandeur sur la fiche (parcours neuf, au porteur)

## Hypothèses (mode sans humain)

- L'avertissement est un toast `warning` **persistant** (`timeout: 0`) levé juste avant la
  navigation : le `Toaster` du layout `(dashboard)` survit à la navigation, il s'affiche donc sur
  la fiche et y reste jusqu'à ce que le demandeur le ferme. Aucun paramètre d'URL neuf.
- Texte : titre « Photos non envoyées » / « Photos not sent », description « La demande est
  créée, mais ses photos n'ont pas pu être envoyées. » / « The request was created, but its
  photos could not be sent. » ; le `wo` porte le français (wolof en pause).

## Delta à produire

- [x] `MaintenanceForm` : le `catch` lève l'avertissement, le commentaire trompeur est retiré.
- [x] Clés `maintenance.form.photos_failed_title` et `photos_failed_body` en `fr`, `en`, `wo`.
- [x] Test Vitest `MaintenanceForm.echec-photos.tck-2146.test.tsx`.

## Critères d'acceptation

- [x] AC1 — `uploadPhotos` rejette : l'avertissement s'affiche, et la navigation vers la fiche a lieu.
- [x] AC2 — `uploadPhotos` réussit : aucun avertissement.

## Hors périmètre

- L'envoi de la collection `photos` par le demandeur depuis la fiche (reste, au porteur).
- Les bornes de nombre et de poids du lot de photos (P222.02).

## Notes d'implémentation

- Ablation : `toast.add` neutralisé dans le `catch` → AC1 rouge (aucun avertissement) ; remis → vert.
- Le `Toaster` vit dans `(dashboard)/layout.tsx`, que la navigation vers la fiche ne démonte pas : c'est ce qui fait d'un toast persistant un avertissement « sur la fiche ». Le test monte donc `ToastProvider` et `Toaster` autour du formulaire.
