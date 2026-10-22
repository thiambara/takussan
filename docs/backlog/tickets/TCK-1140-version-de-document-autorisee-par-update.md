---
id: TCK-1140
title: "Versions d'un document : téléverser et restaurer exigent le droit de le modifier"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#22-document-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-64--pièces-kyc-des-profils-à-leffacement-à-la-fin-du-profil-et-au-re-téléversement"
tags: [back, documents, authorization, tck-097, pistes]
---

## Contexte

Réf : **P64.01** du fichier de pistes, `validé` (V2 accordé : retirer ces deux gestes au personnel
de l'agence et au propriétaire du porteur qui ne sont pas le téléverseur).

`DocumentVersionController::store` et `::restore` n'autorisaient que par `view` : le locataire d'un
bail, qui lit les documents du bail, remplaçait le fichier actif d'un document du bailleur, alors
que TCK-097 écrit « uploader une version requiert le même accès que `Document::update` ; restaurer
une version idem ».

## Décision du porteur

validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la piste n'a qu'une voie — `store` et `restore` par `update`, `index` et `download`
gardés sur `view`.

## Objectif utilisateur

Seul celui qui peut modifier un document (son téléverseur non suspendu, ou le super-admin) en
change le fichier actif.

## Delta à produire

- [x] `DocumentVersionController::store()` et `::restore()` : `authorize('update', …)`.
- [x] Test dans `tests/Feature/DocumentVersionTest.php`.

## Critères d'acceptation

- [x] AC1 — locataire d'un bail, document du bailleur : `POST …/versions` → 403,
      `POST …/versions/{v}/restore` → 403, aucune version ajoutée ; `GET …/versions` → 200.
- [x] AC2 — le bailleur téléverseur : 201 et 200 sur les mêmes gestes.

## Hors périmètre

- Le front : aucun écran ne masque le bouton d'ajout de version selon le droit (non vérifié) ; le
  geste refusé rend 403.

## Notes d'implémentation

- Ablation : les deux `authorize('update')` remis à `view` → AC1 rouge (201 sur l'ajout) ; remis → vert.
- Le commentaire de fin de contrôleur (TCK-306) disait que le passage à `update` rendrait 403 :
  c'est désormais voulu, et il le dit.
