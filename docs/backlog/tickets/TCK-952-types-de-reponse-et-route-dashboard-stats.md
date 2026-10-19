---
id: TCK-952
title: "Deux types de réponse alignés sur l'API, `GET /api/dashboard/stats` retiré faute d'appelant, et le docblock du layout du tableau de bord qui citait une route absente"
status: done
phase: P2
family: full
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#25-reporting--tableaux-de-bord
  models: []
tags: [typage, retrait, code-mort, routes, tableau-de-bord, pistes]
---

## Contexte

Piste P45.03 (`docs/plans/2026-10-15-pistes-d-amelioration.md`, angle 45). Quatre écarts sans lien
entre eux, tous sans effet visible aujourd'hui :

1. `useUpdateParticipantRole` typait sa réponse `ApiResponse<{ user_id; role }>`, alors que
   `ConversationParticipantController::update` rend `data` = une `ConversationResource` entière.
2. `archiveProperties` typait `failed: number`, alors que `PropertyBulkArchiveService::archive` rend
   `failed` en liste `[{ id, reason }]`.
3. `GET /api/dashboard/stats` rendait `active_leases` pour quatre profils et `active_lease` pour le
   locataire, et aucun écran ne l'appelait.
4. Le docblock de `(dashboard)/layout.tsx` disait que `getMeAction()` frappe `/api/users/me`, une
   route qui n'existe pas.

Décision du porteur, recopiée de la ligne Statut :

> porteur (2026-10-18) : traité hors agents, en session : types alignés sur la réponse réelle, retrait de `GET /api/dashboard/stats` s'il reste sans appelant, docblock corrigé

## Objectif utilisateur

Un développeur qui lit ces types ou ce commentaire lit ce que l'API fait vraiment, et la surface de
l'API ne porte plus de route que rien n'appelle.

## Delta à produire

- `takussan-web/src/lib/queries/conversations.ts` : `useUpdateParticipantRole` typé
  `ApiResponse<Conversation>`.
- `ConversationParticipantController::update` : `->resolve($request)` à la place de
  `->toArray($request)`. Appelé à la main, `toArray()` laissait passer les `MissingValue` :
  `unread_count`, `last_message`, `property` et `participants` sortaient en `{}`.
- `ConversationResource` émet `updated_at` : le type `Conversation` le déclare obligatoire, et la
  liste le demande dans `fields[conversations]`. Aucune ressource ne le rendait, sur aucune route.
- `takussan-web/src/lib/queries/super-admin.ts` : `archiveProperties` rend
  `{ archived; failed: BulkFailure[]; archived_ids }` (type de `@/types/agent-crm`, déjà celui des
  autres actions en masse). Le double de `super-admin-properties.test.ts` passe `failed: []`.
- `takussan-api/routes/api/dashboard.php` : la route `dashboard.stats` retirée ;
  `DashboardController` perd `stats()` et ses quatre méthodes privées.
- `tests/Feature/Api/DashboardStatsTest.php` supprimé (6 cas, tous sur la route).
- `tests/Feature/Api/LocaleMiddlewareTest.php` : la route n'y était qu'un véhicule, remplacée par
  `GET /api/auth/me`. Le `setUp` fige `app.locale` à `fr` : avec `APP_LOCALE=en` dans un `.env`
  local, deux cas restaient verts middleware neutralisé.
- `tests/Feature/Reporting/OwedRemainderTest.php` : les deux assertions sur `/stats` retirées.
- `takussan-web/src/app/(dashboard)/layout.tsx` : le docblock cite `/api/auth/me`.
- Tests neufs : `tests/Feature/Routes/DashboardStatsRouteRemovedTest.php`,
  `tests/Feature/Api/ParticipantRoleResponseShapeTest.php` (la réponse réelle du `PATCH`) et
  `takussan-web/src/lib/queries/__tests__/types-de-reponse.tck-952.test.ts` (garde de type, lue par
  `tsc --noEmit`).

## Critères d'acceptation

- [x] **AC1** — `useUpdateParticipantRole` est typé sur la réponse réelle, mesurée par exécution.
      *Mesuré, côté API : `ParticipantRoleResponseShapeTest` appelle le `PATCH` et lit la réponse.
      Aucune valeur `{}`, `unread_count`, `last_message`, `property` et `participants` absents,
      `updated_at` présent. Rouge avant le correctif (« data.unread_count est un objet vide »), vert
      après. Ablation 1 : `->toArray($request)` remis → rouge, même message. Ablation 2 :
      `updated_at` retiré de la ressource → rouge (« null is of type string »). Restauration par
      `cp`, `md5` identiques. Côté front : `types-de-reponse.tck-952.test.ts` rouge sous
      `npx tsc --noEmit` avant (TS2344, « missing … role, user_id »), vert après. Ablation : l'ancien
      `conversations.ts` remis → rouge. La garde de type compare deux types TypeScript : seule
      l'exécution prouve l'alignement sur l'API. `ConversationInfoSheet.tsx` ne lit aucune clé du
      résultat ; son test reste vert. La 1re version de cet AC avait été cochée par lecture, et la
      vérification adverse l'a refusée.*
- [x] **AC2** — `archiveProperties` type `failed` en `BulkFailure[]`. *Mesuré : relu
      `PropertyBulkArchiveService.php:38` (le `@return`) et `PropertyController::bulkArchive`, qui
      le rend tel quel ; même garde de type, rouge avant (« Expected: ..., Actual: number »), vert
      après, ablation rejouée avec AC1. `SuperAdminPropertiesTable.tsx:128` ne lit pas le résultat.*
- [x] **AC3** — Aucun appelant front de `dashboard/stats`, et la route est retirée. *Mesuré :
      `grep -rn "dashboard/stats\|dashboard\.stats" takussan-web/src` → 0 ; la seule construction
      dynamique, `cheminApi\`/api/dashboard/${tableau}…\`` (`lib/queries/dashboard.ts:159`), prend
      `tableau: 'owner' | 'agent' | 'tenant'` ; `DashboardStatsRouteRemovedTest` vert, et rouge
      sous ablation (« GET /api/dashboard/stats répond 200 ») ; `route:list --path=dashboard` → 5
      routes, `dashboard/me` comprise.*
- [x] **AC4** — La règle des impayés garde sa preuve par des voies vivantes. *Mesuré :
      `OwedRemainderTest` vert, il éprouve toujours la même règle (`CollectedPayments::leaseOwed`)
      par `/dashboard/agency`, `/dashboard/owner`, `/dashboard/tenant`, `/finance/aging`, l'export
      `aging` et le relevé du bailleur. `/stats` en était un lecteur de plus, sans écran : retiré, il
      n'a plus rien à garder.*
- [x] **AC5** — `SetLocaleMiddleware` garde ses dix cas, quel que soit le `.env`. *Mesuré :
      `LocaleMiddlewareTest` vert sur `/api/auth/me` (10 tests), avec un `.env` local à
      `APP_LOCALE=en`. Ablation (`return $next($request);` en tête de `handle`) → 8 rouges sur 10
      (2 avant le `setUp`). Les 2 qui restent verts attendent la locale par défaut. Restauration par
      `cp`, `md5` identique.*
- [x] **AC6** — Le docblock cite la route réelle. *Mesuré : `grep -n "api/users/me"
      "takussan-web/src/app/(dashboard)/layout.tsx"` → 0 ; `getMe` (`lib/auth.ts:99`) appelle
      `/api/auth/me`.*

## Hors périmètre

- L'autre voie de la piste, unifier la clé `active_leases` : sans objet, la route est retirée.
- **TCK-619** (`todo`) prévoit, au point 2 et à l'AC2, des gardes de mutation sur les branches
  globale et locataire de `/dashboard/stats`. Ce point n'a plus d'objet. Le ticket n'est pas modifié
  ici : c'est à son porteur de le retirer.

## Notes d'implémentation

Re-mesure des quatre points (deux venaient d'un sous-agent) : les quatre tiennent sur l'arbre du
2026-10-18. Les deux points « à vérifier » sont confirmés : `failed` est bien une liste
(`PropertyBulkArchiveService.php:38,51-69,106`), et `dashboard/stats` n'a aucun appelant.

**Ce que `DashboardStatsTest` éprouvait** : la forme de la réponse par profil (super-admin, admin
d'agence, agent, locataire), et le compte des maintenances ouvertes par demandeur. Tout part avec la
route. Les tableaux de bord par rôle ont leurs propres tests (`tests/Feature/Dashboard/`).

**`->toArray($request)` dans une réponse : inventaire, non corrigé.** `grep -rnE
"Resource::(make|collection)\(.*\)->toArray\(\$request\)" app/Http/Controllers` → 198 lignes
dans 53 contrôleurs (les expressions sur plusieurs lignes n'y sont pas). Une ligne ne fuit des `{}`
que si la ressource porte un `when*` dont la valeur est absente. Le tri reste à faire. En tête :
`ReviewController` 12, `PropertyVisitController` 11, `MaintenanceRequestController` 11,
`PropertyController` 9, `ConversationController` 8.
