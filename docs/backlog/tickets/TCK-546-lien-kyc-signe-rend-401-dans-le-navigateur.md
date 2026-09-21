---
id: TCK-546
title: "Ouvrir une pièce KYC depuis la console rend 401 : le lien signé exige un jeton Bearer qu'un lien de navigateur n'envoie pas"
status: todo
phase: P1
family: full
estimate: S
wave: 67
created: 2026-09-21
updated: 2026-09-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#27-médias--fichiers
  models:
    - docs/models-spec.md#spatielaravel-medialibrary
tags: [back, front, kyc, media, auth]
---

## Objectif utilisateur

Qu'un admin d'agence ou un super-admin qui clique sur une pièce KYC la voie, au lieu d'une page
`{"message":"Unauthenticated."}`.

## Contexte

Relevé le 2026-09-21 en implémentant TCK-539 (partie A). Personne ne l'avait remarqué, faute de
dossier KYC réel en préproduction.

**Les maillons, lus un par un :**

1. `KycDossierResource.php:69` émet `signed_url = URL::temporarySignedRoute('kyc.documents.show', …)`,
   une URL **absolue sur l'hôte de l'API** (`APP_URL`).
2. `routes/api/kyc.php` place cette route sous `auth:sanctum` **en plus** de la signature.
3. `bootstrap/app.php` n'appelle pas `statefulApi()` : le groupe `api` n'a ni session ni
   `EnsureFrontendRequestsAreStateful`. Sanctum n'y authentifie donc **que** par
   `Authorization: Bearer`.
4. Le front garde ce jeton dans un cookie httpOnly **de son propre domaine** et ne l'ajoute qu'aux
   appels passés par ses route handlers BFF (`src/app/api/agencies/[[...path]]/route.ts`).
   Le BFF transmet le corps tel quel : `signed_url` arrive au navigateur inchangé, toujours sur
   l'hôte de l'API.
5. Le lien s'ouvre par `<a href={signed_url} target="_blank">` —
   `components/kyc/kyc-components.tsx:126` (console d'agence) et
   `components/admin/super/kyc-queue.tsx:356` (file super-admin). Une navigation n'envoie pas
   d'en-tête `Authorization`, et aucune route BFF ne relaie `/api/kyc/documents/*`.

**Mesuré** par un test jetable (rejouant le parcours : dossier lu par
`GET /api/agencies/{id}/kyc` en Bearer, puis navigation vers `signed_url`) :

```
signed_url=http://localhost:8002/api/kyc/documents/1?expires=…&signature=…
navigation (sans Authorization, Accept: text/html)  → 401 {"message":"Unauthenticated."}
même URL AVEC Bearer                                  → fichier servi (StreamedResponse)
```

`KycDocumentAccessTest` ne l'attrape pas : il appelle toujours la route en `actingAs(…, 'sanctum')`,
c'est-à-dire en étant authentifié, ce que le navigateur n'est pas.

## Delta à produire

Rendre le lien ouvrable par un navigateur **sans affaiblir** les trois gardes de
`KycDocumentController` : la signature, l'appartenance à un `KycDossier`, et le couple
(utilisateur, agence active). Deux voies à trancher dans le ticket :

- une route BFF qui relaie `/api/kyc/documents/{media}` avec le jeton du cookie, le front
  réécrivant `signed_url` vers elle ;
- ou une signature qui porte elle-même l'identité (utilisateur et profil actif signés dans l'URL,
  jugés à nouveau au moment de servir), la route sortant alors de `auth:sanctum`, sur le modèle de
  `media.private.show` (TCK-539).

## Critères d'acceptation

- [ ] Un test rejoue le parcours du navigateur : lien obtenu par la vraie route du dossier, puis
      navigation **sans** `Authorization` → la pièce est servie à l'ayant droit.
- [ ] Les refus actuels de `KycDocumentAccessTest` (signature absente, altérée ou expirée ; média
      hors KYC ; admin d'une autre agence ; membre non admin ; admin sous un autre profil) restent
      des refus dans le nouveau parcours.
- [ ] `./vendor/bin/pint` propre ; tests des classes touchées verts.
