---
id: TCK-1809
title: "La clé d'un brouillon d'assistant est bornée à 255 caractères dans la route"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#70-wizarddraft-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-181--tableaux-sans-borne-rangés-en-jsonb-et-relus-en-entier"
tags: [back, wizard-drafts, validation, pistes]
---

## Contexte

Réf : **P181.02** du fichier de pistes, `retenu · autonome` (A1).

Les trois routes `api/me/wizard-drafts/{key}` ne contraignaient la clé que par son alphabet
(`[A-Za-z0-9._:-]+`), sans longueur, alors que `wizard_drafts.key` est un `varchar(255)`
(`string('key')`, migration `2026_05_10_034943_create_wizard_drafts_table.php:25`). Une clé de
256 caractères ou plus atteignait la base et rendait 500 (`SQLSTATE[22001]`).

## Contraintes strictes

- Le contrat est écrit par le schéma (255) et par la contrainte de route, qui refuse déjà en 404
  une clé hors de son alphabet : la borne se pose au même endroit, avec le même code.
- Aucune migration, aucun changement de la forme de `data` ni de la liste.

## Delta à produire

- [x] `routes/api/me.php` : contrainte `[A-Za-z0-9._:-]{1,255}` sur `show`, `upsert` et `destroy`.
- [x] `WizardDraftCrudTest` : une clé de 256 caractères rend 404 sur les trois routes sans rien
      écrire ; une clé de 255 caractères est créée, relue et supprimée.

## Critères d'acceptation

- [x] AC1 — `PUT /api/me/wizard-drafts/<256 × k>` → 404, aucune ligne écrite (500 avant).
- [x] AC2 — `GET` et `DELETE` de la même clé → 404.
- [x] AC3 — Une clé de 255 caractères → 201, puis 200 en lecture.

## Hors périmètre

- La taille de `data`, le nombre de brouillons par compte et le contenu de la liste : P181.03,
  `retenu · à valider` (V7).

## Notes d'implémentation

- Hypothèse (mode sans humain) : 404 plutôt que 422, comme la Piste le propose en premier et
  comme la contrainte de route le fait déjà pour une clé hors alphabet.
- Ablation : contrainte remise à `+` → AC1 rouge (« Expected 404 but received 500 »,
  `QueryException`) ; avec la borne, 11/11 dans `WizardDraftCrudTest`.
