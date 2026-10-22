---
id: TCK-1144
title: "Liens de partage d'un document : la liste et la révocation passent par la règle share"
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
    - "docs/models-spec.md#29-documentsharelink-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-82--bailleur-et-membre-jugés-en-dur-hors-de-landlordwrites-et-des-capacités"
tags: [back, documents, share-links, authorization, adr-0031, pistes]
---

## Contexte

Réf : **P82.03** du fichier de pistes, `validé` (V2 accordé : refuser au bailleur suspendu la
révocation d'un lien public vers son propre bail).

`DocumentShareLinkController::index` et `::destroy` autorisaient par `authorizeDocument()`, recopie
de l'ancienne règle sans `landlordWrites` : un bailleur suspendu, refusé à la création d'un lien
(`DocumentPolicy::share`), en lisait encore les jetons (l'URL publique du document) et les révoquait.

## Décision du porteur

validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la piste n'a qu'une voie, `can('share', $document)` pour `index` et `destroy`. Son
second volet — retirer `authorizeDocument()` et son exemption de
`scripts/check-controller-authorization.mjs` — passe par une garde existante, que l'implémenteur ne
modifie pas (critère V9) ; la garde rougit si le helper disparaît en gardant l'exemption. Le helper
reste donc, réduit à `$this->authorize('share', $document)`.

## Reste à faire

retirer `authorizeDocument()` de `DocumentShareLinkController` et son exemption de `scripts/check-controller-authorization.mjs` (garde existante, fermée à l'implémenteur)

## Objectif utilisateur

Qui ne peut plus publier un lien vers un document n'en lit plus les jetons et n'en révoque plus.

## Delta à produire

- [x] `DocumentShareLinkController::authorizeDocument()` délègue à `DocumentPolicy::share`.
- [x] Test dans `tests/Feature/Api/Agency/TeamMemberSuspensionTest.php`.

## Critères d'acceptation

- [x] AC1 — bailleur bloqué dans A, téléverseur d'un document de son bail avec un lien actif :
      `GET …/share-links` → 403, `DELETE …/share/{link}` → 403, le lien reste actif.
- [x] AC2 — le même dans B, où il est actif : liste 200, révocation 204 ; l'admin de A : 200 et 204.

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- Ablation : l'ancienne règle du helper remise → AC1 rouge (200 sur la liste) ; remis → vert.
