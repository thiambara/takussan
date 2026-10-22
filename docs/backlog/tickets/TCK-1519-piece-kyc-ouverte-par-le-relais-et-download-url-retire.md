---
id: TCK-1519
title: "La pièce KYC s'ouvre par un relais du front, et l'export de données ne rend plus `download_url` sans lecteur"
status: done
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
  models:
    - "docs/models-spec.md#spatielaravel-medialibrary"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations"
tags: [web, api, kyc, bff, privacy, pistes]
---

## Contexte

Réf : **P73.03** du fichier de pistes, `validé`. La piste demande trois choses : traiter
[TCK-546](TCK-546-lien-kyc-signe-rend-401-dans-le-navigateur.md) (la pièce KYC rend 401 au
navigateur), retirer `download_url` de l'export de données s'il n'a pas de lecteur, et vérifier
sur le serveur ce que Traefik journalise.

- `kyc.documents.show` est sous `auth:sanctum` (lu, `routes/api/kyc.php:6-8`), et les deux liens
  du front (`kyc-components.tsx:143`, console d'agence ; `kyc-queue.tsx:376`, file du super-admin)
  pointent `signed_url` tel quel, sur l'hôte de l'API : une navigation n'y porte aucun Bearer.
- `DataExportResource::download_url` n'a aucun lecteur au front (`grep -rn download_url
  takussan-web/src` → le type `super-admin.ts:714` et un fixture de test). Le téléchargement passe
  par le relais `data-exports/[id]/download`.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

## Choix de la voie (TCK-546)

TCK-546 laisse deux voies, et ni lui ni la piste n'en recommandent une. Retenue : **la plus
étroite, le relais BFF**. Il ne touche aucune autorisation de l'API : `kyc.documents.show` garde
`auth:sanctum`, la signature relative (TCK-1059) et les gardes de `KycDocumentController`. L'autre
voie sortait la route de `auth:sanctum` et signait l'identité dans l'URL, ce qui change la règle
d'accès à une pièce d'identité.

## Objectif utilisateur

L'admin d'agence et le super-admin qui cliquent sur une pièce KYC la voient, au lieu de
`{"message":"Unauthenticated."}`.

## Delta à produire

- [x] `GET /api/kyc/documents/[media]` au front : relaie vers `/kyc/documents/{media}` de l'API,
  chaîne signée comprise, avec le jeton de l'espace applicatif (`jetonEspaceApplicatif`) et le
  profil actif (`X-Active-Profile-Hint`), comme le relais `agencies`.
- [x] `lienPieceKyc(signed_url)` : le chemin et la requête du lien signé, sur l'origine du front ;
  les deux liens l'emploient.
- [x] `DataExportResource` ne rend plus `download_url` ; le type du front non plus.

## Hypothèses

- Le super-admin n'ouvre pas sa file KYC pendant une impersonation : le relais prend le jeton de
  l'espace applicatif, celui de la personne impersonnée le cas échéant, comme le relais du
  téléchargement d'export.

## Critères d'acceptation

- [x] AC1 — un lien de pièce, dans la console d'agence et dans la file du super-admin, pointe sur
  le relais du front, signature comprise.
- [x] AC2 — le relais, sans jeton, rend 401 sans appeler l'API ; avec jeton, il appelle
  `/api/kyc/documents/{media}?expires=…&signature=…` en Bearer et rend la pièce octet pour octet.
- [x] AC3 — l'export prêt ne porte plus `download_url`.

## Reste à faire

- Vérifier sur le serveur ce que Traefik journalise (`RequestPath` et la chaîne de requête), et
  sinon écarter la chaîne de requête des journaux : le serveur et `deploy/` sont fermés à
  l'implémenteur (voir P10.10).

## Hors périmètre

- Les refus de `KycDocumentAccessTest` ne changent pas : l'API n'est pas touchée sur cette route.

## Notes d'implémentation

- Avant correctif : les deux liens rendaient `href` = `signed_url` (hôte de l'API), et aucun relais
  `/api/kyc/documents/*` n'existait au front ; `POST /api/me/data-exports` (prêt) portait
  `download_url`.
- Ablation : liens remis sur `signed_url` et relais sans Bearer → 3 rouges sur 10
  (`LienPieceKyc.tck-1519`, `kyc/documents/[media]/route`) ; `DataExportResource` rendue à
  `pre-dev` → 1 rouge sur 10 (`DataExportTest`). Remis → tout vert.
- Le relais tombe sous les gardes génériques de `src/app/api/__tests__/` (segments, panne amont),
  rejouées vertes.
