---
id: TCK-2944
title: "« Démarrer » liste les pièces une à une (bailleur, agent, prestataire), au lieu d'une seule étape « Vos pièces »"
status: done
phase: P2
family: back
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2947]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#onboarding-"
    - "docs/models-spec.md#42-kycdossier-"
tags: [back, entree, pieces, demarrer, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le nouvel entrant voit dans « Démarrer » chaque pièce qui lui manque (RIB, pièce d'identité, NINEA…), cochée une à une.

## Contrat de données

Écart de TCK-2614 (`[4]`, renvoyé à TCK-2479 / 2490 / 2617-2619, tous `done` sans étape par pièce). Relevé du 2026-11-15 (`takussan-api/app/Services/Onboarding/DemarrageDeLEspace.php:18-125`) : le **bailleur** a une étape `kyc` unique (`:121`, pièces envoyées), l'**agent** et le **prestataire** une étape `pieces` unique ; l'**agence** a une étape `kyc` qui est **sa vérification** (`kyc_verified` de `AgencySetupStatus`, `:47`) — celle-là n'est pas une pièce et ne change pas. `PiecesDuProfil` connaît chaque pièce requise et son état.

- Pour le bailleur, l'agent et le prestataire, la réponse de « Démarrer » (`EspaceDemarrageController`) rend, à la place de leur étape `kyc` / `pieces`, une étape par pièce requise du profil actif : `{code: "piece:<type>", faite, etat: "manquante"|"envoyee"|"verifiee"|"refusee"}`, dans l'ordre de `PiecesDuProfil`.

## Contraintes strictes (métier)

- Une seule source : les pièces requises et leur état viennent de `PiecesDuProfil` (même règle que `/app/pieces`), jamais d'une liste recopiée.
- Le compte « n sur m » de « Démarrer » reste juste (une pièce = une étape).
- Les étapes `kyc` du bailleur et `pieces` de l'agent / du prestataire disparaissent ; l'étape `kyc` de l'**agence** (vérification) reste inchangée. Le front suit dans TCK-2947 ; chercher les autres lecteurs (`lib/navigation/demarrer.ts`, tests) avant de retirer.

## Delta à produire

- [x] `DemarrageDeLEspace` : étapes par pièce.
- [x] Tests : `DemarrageEtapesParPieceTest` (bailleur : RIB + CNI ; agence : NINEA + RCCM ; une pièce envoyée → `envoyee`, `faite` selon la règle actuelle).

## Critères d'acceptation

- [x] AC1 — Un bailleur à qui manquent RIB et pièce d'identité reçoit deux étapes `piece:rib` et `piece:identity`, non faites ; après envoi du RIB, `piece:rib` est `envoyee`.
- [x] AC2 — Un bailleur et un agent ne reçoivent plus d'étape `kyc` ni `pieces` ; un admin d'agence reçoit toujours `premier_bien`, `kyc` (vérification de l'agence) et `equipe`, inchangés (test de non-régression).

## Hors périmètre

- L'écran (TCK-2947).

## Notes d'implémentation

2026-11-15 (implementing-specs) :

- **Écart sur le code (prémisse re-mesurée)** : l'AC1 écrit `piece:identity` ; aucune pièce ne porte ce nom. Le `<code>` est celui de
  `PiecesDuProfil` (la sorte de l'envoi : `cni`, `rib`, `ninea`, `license`, `photo`, `insurance`), le même que `GET /api/me/pieces`
  — une seule table de libellés pour l'écran `/app/pieces` et le menu (TCK-2947). Donc `piece:cni` et `piece:rib`.
- **Pièces requises seules** : une pièce facultative (assurance RC pro du prestataire, NINEA du bailleur particulier, décision 2b
  de TCK-2614) n'est pas une étape — le « n sur m » ne compte que ce qui est demandé.
- `faite` = pièce envoyée ou vérifiée (règle de TCK-2612) ; `etat` traduit `missing|sent|verified|rejected` →
  `manquante|envoyee|verifiee|refusee` (`refusee` n'est jamais rendu aujourd'hui, comme `rejected`).
- **Décision (la plus sûre, une seule source)** : `metadata.kyc.submitted_at` du bailleur ne fait plus passer d'étape — une
  soumission ne dit pas QUELLE pièce est partie ; seul le `Document` vivant le dit. Un bailleur qui avait soumis sans fichier
  voit ses pièces manquantes revenir, ce qui est juste.
- `PiecesDuProfil::requisesEnvoyees()` n'avait plus de lecteur : retirée.
- Delta du ticket « agence : NINEA + RCCM » : contredit par le contrat et l'AC2 (l'étape `kyc` de l'agence est sa vérification,
  inchangée) ; non fait, l'AC2 l'emporte — l'agence est testée en non-régression.
- Front : `lib/navigation/demarrer.ts` ignore un code inconnu → jusqu'à TCK-2947, le bailleur/agent/prestataire ne voient plus
  l'étape des pièces dans le menu (aucune casse). Tests front : moqués, non touchés.
- Tests : `DemarrageEtapesParPieceTest` (5, neuf), `EspaceDemarrageTest` (14, mis à jour), `NineaFacultatifDuParticulierTest`
  (3, mis à jour) verts ; gardes d'architecture (3 classes) vertes ; `scripts/check-*.mjs` toutes vertes. Ablations : sans le
  filtre `required` → prestataire rouge ; `faite` sur `verified` seul → AC1 rouge ; restauré (md5).
