---
id: TCK-1915
title: "État des lieux borné à l'envoi (20 pièces × 20 éléments, notes à 200 et 1 000) pour que son PDF signé se rende sous 256M"
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
  features:
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-143--pdf-à-contenu-variable-rendus-par-dompdf-dans-la-requête-http"
tags: [api, web, inventory, pdf, validation, pistes]
---

## Objectif utilisateur

Le PDF d'un état des lieux signé se télécharge toujours. Aujourd'hui, un état des lieux de
40 pièces × 40 éléments est accepté à l'envoi, puis son PDF contractuel rend 500 à chaque essai
(dompdf épuise les 256M de `memory_limit`), et l'état signé ne se modifie plus.

## Contexte

Réf : **P143.01** du fichier de pistes, `validé`. `InventoryStoreRequest` et
`InventoryUpdateRequest` ne bornaient ni le nombre de pièces, ni celui des éléments, ni les notes ;
le schéma `takussan-web/src/lib/schemas/inventory.ts` non plus.

## Décision du porteur

validation du porteur (2026-10-23) : 20 pièces × 20 éléments, notes d'élément à 200 caractères, notes de pièce et générales à 1 000, libellés à 255 (mesuré : 25,4 s, pic 188 Mo sous 256M) ; mêmes plafonds dans `inventory.ts` ; la recommandation 30 × 30 est écartée, mesurée en échec mémoire

## Hypothèses (mode sans humain)

- Les libellés restent à `max:255`, la borne d'aujourd'hui (la décision les fixe à 255).
- Le front a besoin d'un message pour chaque refus : trois clés de validation neuves
  (`validation.inventory.roomsMax`, `elementsMax`, `notesTooLong`), paramétrées par `{max}` comme
  `validation.message.bodyTooLong`. Le wolof porte le texte français (wolof en pause).
- Les états des lieux déjà enregistrés au-delà du plafond ne sont pas touchés (aucune réécriture
  de données) ; un brouillon trop gros sera refusé à sa prochaine modification de `rooms`.

## Delta à produire

- [x] `InventoryStoreRequest` : constantes `MAX_ROOMS`, `MAX_ELEMENTS_PER_ROOM`, `MAX_ELEMENT_NOTES`, `MAX_NOTES`, et les `max:` sur `rooms`, `rooms.*.elements`, les trois `notes`.
- [x] `InventoryUpdateRequest` relit les mêmes constantes.
- [x] `inventory.ts` : mêmes plafonds, exportés, avec message par clé.
- [x] Tests : `InventorySizeLimitsTest` (API), `inventory.plafonds.tck-1915.test.ts` (front).

## Critères d'acceptation

- [x] AC1 — `POST` et `PATCH /api/inventories…` rendent 422 sur 21 pièces, 21 éléments dans une pièce, une note d'élément de 201 caractères, une note de pièce ou générale de 1 001 ; rien n'est créé.
- [x] AC2 — Un état des lieux exactement au plafond (20 × 20, libellés à 255, notes à 200 et 1 000) est accepté.
- [x] AC3 — Le PDF signé de cet état des lieux au plafond se rend (200, `%PDF-`) sous un `memory_limit` de 256M.
- [x] AC4 — Le schéma du front refuse les mêmes dépassements, avec une clé de validation, et accepte le plafond.

## Hors périmètre

- Un rendu du PDF hors de la requête, ou rangé une fois signé.
- L'affichage, dans `RoomEditor`, de l'erreur portée par le tableau `rooms` (le message `roomsMin` existant n'y est pas rendu non plus — lu, non vérifié à l'écran).

## Notes d'implémentation

- Ablation API : les `max:` retirés des deux FormRequests (constantes gardées) → 2 rouges (« received 201 », « received 200 ») ; remis → 4 verts.
- Garde du PDF éprouvée : plafonds relevés temporairement à 40 × 40 → `Allowed memory size … exhausted` dans `dompdf/src/Css/Style.php:2281`, processus PHPUnit tué ; remis à 20 × 20 → vert en 29,5 s.
- La borne mémoire du test vaut `max(256M, usage courant + 216M)` : le processus PHPUnit porte déjà l'application et le harnais (~95 Mo mesurés), qu'une requête de FrankenPHP n'a pas.
- Le texte des notes est en mots de trois lettres : chaque mot est un cadre dompdf, et c'est le nombre de mots qui fait la mémoire.
- Ablation front : les `.max(...)` retirés → 5 rouges sur 8 ; remis → verts. `messages.test.ts` liste les trois clés parmi les messages paramétrés.
