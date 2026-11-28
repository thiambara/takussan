---
id: TCK-3009
title: "Un client BFF : une primitive pour les appels du front vers ses route handlers, qui sérialise, lève ApiError et remplace les jsonOrThrow recopiés"
status: todo
phase: P2
family: front
estimate: S
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: [TCK-3008]
blocks: [TCK-3010]
spec_refs:
  features: []
  models: []
tags: [front, bff, super-admin, architecture]
---

## Objectif utilisateur

Un appel du front vers un de ses route handlers (console super-admin, radar, `/me`…) se comporte toujours de la même façon : mêmes paramètres, même erreur, même session.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7). Deux familles visent deux serveurs différents :

- `apiRequest('/api/…')` → Laravel (`lib/api.ts:815-902` : Bearer, profil actif, XFF, `X-Request-Id`, relais d'impersonation) ;
- `fetch('/api/…')` relatif → les route handlers Next (BFF). Raison : le relais `/api/super-admin/[...path]` renomme vers `/admin` (TCK-145) et garde le jeton de l'**opérateur** pendant une impersonation (ADR-0055).

La famille BFF recopie la construction des paramètres (`URLSearchParams` à la main, ex. `lib/queries/super-admin.ts:110-121`), `credentials`, `if (!res.ok)` et `jsonOrThrow` (`lib/queries/super-admin-coque.ts:26`, `components/boost/admin/api.ts:53`, avec ses propres `lire`/`ecrire` :58-69). ~34 fichiers hors tests.

## Contraintes strictes (métier)

- La primitive est un **module frère** d'`apiRequest`, pas une option : elle n'envoie ni Bearer, ni profil actif, ni en-tête d'identité ; même origine, cookie.
- Elle sérialise par `buildQueryString` (sparse fieldsets, ADR-0006) et lève toujours `ApiError(status, data)` (forme de TCK-3008).
- Le préfixe `/api` reste écrit par l'appelant (décision séparée, hors ticket) ; `cheminApi` reste utilisable.
- Les chemins `impersonate` restent bloqués par le relais (inchangé).

## Delta à produire

- [x] Intention : une primitive BFF (GET/POST/PATCH/DELETE, paramètres, corps JSON ou FormData, signal)
- [x] Les fonctions de `lib/queries/super-admin*.ts`, `radar.ts`, `components/boost/admin/api.ts` et les autres appels `fetch('/api/…')` relatifs hors tests passent par elle ; les deux `jsonOrThrow` disparaissent
- [x] Tests : la primitive en unitaire (paramètres, erreur, credentials) ; le contrat de requêtes TCK-1800 reste vert

## Critères d'acceptation

- [x] AC1 — `grep -rn "jsonOrThrow" src | grep -v __tests__` est vide.
- [x] AC2 — `grep -rln "fetch(\`/api\|fetch('/api\|fetch(\"/api" src | grep -v __tests__` ne rend plus que la primitive (ou des exceptions documentées dans son en-tête, avec leur raison).
- [x] AC3 — `tsc --noEmit`, lint et les tests touchés sont verts.

## Hors périmètre

- Qui écrit le préfixe `/api` dans les ~300 appels `apiRequest`.

## Notes d'implémentation

Relevé refait le 2026-11-28 sur `feat/approfondissements-architecture` (`e92d8e957`), et ce qui diffère du contrat :

- **La primitive** : `appelBff<T>(chemin, { method, params, body, signal, cleIdempotence, cache, keepalive })`,
  `src/lib/bff.ts`. Pas d'`headers` libre : aucun en-tête d'identité ne peut s'y écrire (le type l'interdit) ;
  `Idempotency-Key` a son option (deux écritures du Radar la posaient). `credentials: 'include'`, `Accept` JSON,
  `Content-Type` seulement pour un corps JSON, rien pour un `FormData`. Une lecture ne pose pas `method` (les tests
  du Radar l'exigent `undefined`).
- **Il n'y avait pas deux `jsonOrThrow` mais une douzaine de copies** du même lecteur « JSON ou `ApiError` » : la coque
  (`super-admin-coque.ts`, exportée, importée par `super-admin.ts`, `radar.ts`, `radar-observatoire.ts`), plus des
  copies locales dans `announcements`, `admin-users`, `kyc`, `billing`, `data-exports`, `super-admin-propositions`,
  `privacy-requests`, `boost/admin/api.ts` (avec `lire`/`ecrire`), `corpsOuErreur` de
  `super-admin-photos-de-quartier`, `lireOuLever` de `useImpersonation`, et `safeFetch` de `useWizardDraft`. Toutes
  retirées ; **219 appels dans 29 fichiers** passent désormais par la primitive (relevé : `grep -rn "appelBff[<(]"`).
- **Le grep d'AC2 ne voyait qu'une partie du parc** : `fetch(cheminApi…)`, `fetch(BASE…)`, `fetch(url…)` lui
  échappaient. L'inventaire réel (tout `fetch(` relatif hors `src/app/api/`) a été converti, sauf les exceptions
  écrites dans l'en-tête de `bff.ts` : le cycle de session (`AuthContext`, `ReinitialiserSessionClient` — la garde
  `AuthContext.chemin-unique.test.ts` lit `fetch('/api/auth/…')` dans la source) et les **téléchargements**
  (`useExports`, export CSV de `privacy-requests`, `downloadAuditLogExport` et `exportAdminReport`), qui lisent un
  `Blob` et des en-têtes de réponse. Les appels directs à l'API (`origineApi()`, `urlApiPublique`) restent hors champ.
- **Divergences de comportement, voulues** (alignées sur `apiRequest`) :
  - un 2xx sans corps JSON (204) rend `null` ; l'ancien lecteur rejetait, d'où les trois cas particuliers retirés
    (`releaseRadarAdvertiser`, `deleteRadarListingPhoto`, `releaseModerationItem`) et deux `if (res.status === 204)`.
  - `EcranDeMaintenance` lisait le corps sans regarder le statut : le 502 `{ code }` du relais devenait la donnée
    et `data.data.window` levait au rendu — précisément pendant une panne de l'API. Test rouge d'abord
    (`src/app/maintenance/__tests__/EcranDeMaintenance.test.tsx`).
  - `MinimalProfileTriggerProvider`, `useAccueilsVus`, `useWizardDraft` levaient un `Error` nu
    (`save_failed`, `welcome-seen 500`…) : ils lèvent l'`ApiError`. `pieces.ts` levait sa propre `EchecDEnvoi` :
    retirée, `VosPieces` lit l'`ApiError` de l'envoi par son corps (`messageCorpsErreurBff`) comme avant — un 502
    illisible garde le libellé de l'écran.
  - `credentials: 'same-origin'` → `'include'` sur sept appels (et six qui n'en posaient pas : impersonation,
    maintenance, drapeaux) : même origine, sans effet.
  - `MinimalProfileTriggerProvider` levait `Error('save_failed')`, que `messageErreurApi` laissait passer TEL QUEL :
    la feuille affichait « save_failed ». Elle affiche désormais la prose de l'API, le libellé du code, ou son repli.
  - Les drapeaux et l'écran de maintenance REJETTENT sur un 5xx là où ils résolvaient le corps d'erreur :
    `createQueryClient` relance une fois un 5xx (pas un 4xx), soit un appel de plus pendant une panne. Le bandeau de
    maintenance, lui, rend toujours `null` sur un refus (TCK-1221), sans relance. Relevé côté API :
    `api/maintenance/status` est exempté du blocage (`MaintenanceService::shouldBlock`), il rend 200 et sa fenêtre
    même en maintenance `down` — l'écran ne perd donc pas son message.
  - La garde `AuthContext.chemin-unique.test.ts` voit aussi `appelBff('/api/auth/{set-token,logout}')` : sans cela,
    la primitive était un détour qu'elle ne lisait pas.
- **Paramètres** : `buildQueryString` sert là où la sortie est identique — `fetchAdminAgencies` (l'exemple du
  ticket, `is_verified` gardé en `'1'`/`'0'` : le sérialiseur écrirait `true`), `fetchPrivacyRequests`,
  `fetchUsers` de la page des comptes. Les autres gardent leur `URLSearchParams` dans le chemin par
  `cheminApi`/`requete()` : les `requeteFile*` sont partagés avec l'accueil serveur (TCK-1828), et le fichier du
  contrat TCK-1800 compare l'ORDRE des paramètres (`JSON.stringify`), qu'un passage au sérialiseur changerait.
- **Ablations** (md5 vérifié à la restauration) : sans la levée sur refus, 3 tests de `bff.test.ts` rougissent ;
  avec le détour d'`apiRequest` par le relais d'impersonation et le profil actif, le test d'identité rougit
  (`/api/impersonation/proxy/super-admin/users/4` reçu).
- Vérifié : `tsc --noEmit` propre, ESLint propre sur les fichiers touchés, contrat TCK-1800 vert, et 128 fichiers
  de test (ceux des modules convertis, et ceux qui stubbent `fetch` sur une URL du BFF), verts. Deux assertions
  d'appel exact ont suivi la forme de la requête (`FeatureFlagProvider`, `ImpersonationBanner`).

