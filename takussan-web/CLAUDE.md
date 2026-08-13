# CLAUDE.md — `takussan-web/`

Conventions du frontend Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind v4.
**Elles sont établies et lisibles dans le code — ne pas les redécouvrir.** Le contexte produit et les
principes non négociables sont dans le `CLAUDE.md` de la racine.

Chaque convention porte son **fichier exemplaire** : en cas de doute, lire celui-là.

---

## Le piège le plus coûteux du projet : le préfixe `/api`

Il y a **trois** façons d'appeler l'API, et elles ne traitent pas le préfixe de la même manière.

| Primitive | Base | Qui écrit `/api` | Usage |
|---|---|---|---|
| `apiFetch(path)` | `API_BASE` = `…/api` | **la fonction** | endpoints publics uniquement (10 appels, tous en `/public/…`) |
| `apiRequest(path)` | `API_URL` (sans `/api`) | **l'appelant** | tout le reste — 173 appels, **100 % commencent par `/api`** |
| `useApiQuery` / `useApiMutation` | via `apiRequest` | **l'appelant** | hooks React Query (25 et 14 fichiers) |

**Oublier `/api` avec `apiRequest` ou `useApiQuery` ne produit pas un 404 propre.** L'URL sort du
périmètre CORS de Laravel (qui n'expose que `api/*`), et le navigateur rend un `net::ERR_FAILED` — un
symptôme qui envoie chercher la panne côté réseau ou serveur, jamais dans le chemin. Rien dans le
typage ni dans le lint ne l'empêche.

**Seconde moitié du piège : le littéral `/api/...` désigne deux backends différents selon l'appelant.**
`fetch('/api/agencies/1')` atteint le **route handler Next** `src/app/api/agencies/[[...path]]/route.ts` ;
`apiRequest('/api/agencies/1')` atteint **Laravel** directement. Même chaîne, deux destinations.

`src/lib/api.ts:4-9` définit `API_URL` et `API_BASE` — mais **n'exporte ni l'une ni l'autre**. Résultat
mesuré : **23 fichiers** relisent `process.env.NEXT_PUBLIC_API_URL` et redéclarent chacun la
normalisation `.replace(/\/api$/, '')`.

## Couche réseau

**Fichier exemplaire : `src/lib/api.ts`.**

`apiRequest` gère : Bearer token, `Content-Type` JSON ou FormData, `Accept-Language` dérivé du cookie
`NEXT_LOCALE`, header `X-Active-Profile-Hint` pour le scope multi-profil, et `X-Forwarded-For`
reconstitué depuis `next/headers` en SSR — **sans quoi le rate-limit Laravel verrait toutes les
requêtes serveur venir d'une seule IP** (`src/lib/api.ts:103-120`).

`ApiError` (`src/lib/api.ts:55-90`) est la classe d'erreur canonique : porte `status` + `data`, expose
`displayMessage` et `validationErrors` (typage des 422 Laravel). `apiFetch`, elle, lève un `Error`
générique — c'est une des raisons de la réserver aux endpoints publics.

`buildQueryString(SpatieQueryParams)` (`src/lib/api.ts:182-230`) est le **sérialiseur canonique**
spatie : `fields[table]`, `filter[]`, `include`, `sort`, `page`, `per_page`. 26 fichiers l'importent,
et **32 constantes `*_FIELDS = [...]`** matérialisent les sparse fieldsets par vue dans
`src/lib/queries/`. Une vue neuve déclare sa constante — c'est ce qui rend la règle des sparse
fieldsets tenable.

## Modules de queries par domaine

**42 modules dans `src/lib/queries/`** — c'est la colonne vertébrale data. Chacun exporte ses
`*_FIELDS`, ses fonctions serveur (token explicite) et/ou ses hooks React Query.

> ⚠️ **Piège Next 16 déjà payé.** Marquer un module de queries `'use client'` transforme tous ses
> exports en références client et **casse les appels depuis les server actions**. La correction
> adoptée est un **module jumeau server-safe** : `properties.ts` (`'use client'`) ré-exporte 18
> symboles depuis `properties-server.ts` (sans directive). Voir le commentaire
> `src/lib/queries/properties.ts:34-65`. Reproduire ce patron, ne pas en inventer un autre.

> ⚠️ Le pattern « query key factory » n'est appliqué qu'à **9 modules sur 42** ; les 33 autres
> composent leurs `queryKey` en ligne, ce qui rend l'invalidation croisée fragile et non typée. Pour
> du code neuf : factory.

## Route handlers BFF

**31 route handlers** dans `src/app/api/` servent de BFF same-origin : ils lisent le cookie httpOnly
et forwardent vers Laravel avec un Bearer. **Fichier exemplaire :
`src/app/api/super-admin/[...path]/route.ts:16-47`.**

Namespaces couverts : `auth/{me,logout,set-token,session-expired}`, `me/*` (17 routes),
`agencies/[[...path]]`, `admin-users/[[...path]]`, `super-admin/[...path]`, `announcements`,
`data-exports`, `export/[entity]`, `feature-flags/me`, `maintenance/status`.

## Auth & permissions

Le cookie httpOnly `auth_token` (`AUTH_COOKIE_NAME`, `src/lib/constants.ts:1`) est posé par
`POST /api/auth/set-token` (sameSite lax, secure en prod, 7 jours) et effacé avec `active_profile_id`
à chaque `set-token` et à chaque `clearToken`.

**Le garde de route serveur est `src/proxy.ts`** — Next 16 a renommé `middleware.ts` → `proxy.ts`.
Il redirige `/app/*` et `/admin/*` vers `/auth/login?redirect=…` sans cookie, et `/auth/*` vers `/app`
avec cookie.

> ⚠️ Son matcher **ne couvre pas `/super-admin/*`** : cette surface ne tient que par la défense en
> profondeur des layouts.

**Défense en profondeur dans les layouts serveur** : `(dashboard)/layout.tsx` appelle `getMeAction()` ;
`(dashboard)/admin/layout.tsx` ajoute `if (!isAdmin(user.roles)) redirect('/app/profile')` ;
`(super-admin)/super-admin/layout.tsx` vérifie token puis `isSuperAdmin`. `getMeAction` est mémoïsé
par requête via `cache()` de React et redirige vers `/api/auth/session-expired` sur 401 — **les
cookies sont read-only en RSC**, c'est pourquoi l'effacement passe par un route handler.

`useAuth()` **ne lève pas** hors provider : il rend un objet no-op (`src/context/AuthContext.tsx:272-286`).
Un composant qui en dépend doit donc gérer `user === null` — le silence n'est pas une garantie de
montage.

Prédicats de rôle : `src/lib/roles.ts:14-64`. Verrouillage des routes pro :
`src/lib/access/pro-features.ts` (`PRO_ROUTES`, `isProRouteLocked`), doublé côté SSR par
`ensureStandardAgencyOrRedirect`.

> ⚠️ `src/lib/access/server-guards.ts` a un **jumeau PHP** assumé dans un commentaire, mais **aucun
> test ni garde ne vérifie que les deux implémentations restent d'accord** (dette D-23).

## Structure

```
src/app/         217 fichiers — 4 route groups : (auth) (dashboard)→/app+/admin (public) (super-admin)
                 + segments /onboarding /maintenance /publish · 111 page.tsx · 31 route.ts
src/app/actions/ 20 modules de server actions
src/components/  451 fichiers
src/lib/         126 — dont queries/ (42), schemas/ (17), access/
src/hooks/       47
src/types/ 28 · src/context/ 4 · src/i18n/ 4 · src/messages/ 3 · src/data/ 1
```

**Il n'existe pas de dossier `features/`.** 383 fichiers sur 875 portent `'use client'` — mais
seulement **29 des 111 pages** : l'essentiel des pages est RSC et délègue à des composants client.

## Conventions de nommage — mesurées

- Composants en **PascalCase** (264 fichiers), **sauf les primitives `ui/` en kebab-case** (20/20).
- Hooks en `useXxx` (seule exception : `src/hooks/pipelineKeys.ts`).
- Props typées par **`interface XxxProps`** (178 occurrences) plutôt que `type Props` (27).
- Champs de props marqués **`readonly`** (717 occurrences dans `components/`).
- Tests colocalisés en `__tests__/` adjacent, suffixe `.test.ts(x)` — **0 fichier `.spec`**.

> ⚠️ 15 fichiers hors `ui/` sont en kebab-case, tous concentrés dans `src/components/admin/super/`.
> C'est un écart, pas un précédent.

## Design system

**Fichier exemplaire : `src/app/globals.css`** (272 lignes) — Tailwind v4 pur (`@import "tailwindcss"`,
`@theme inline`, `@custom-variant dark`). Palette **« Lin »** sur `:root` : `--background #fcf9f3`,
`--foreground #1f1812`, `--primary #a85332`, `--accent #5d6e4f`, `--border #ebe5d5`. Échelle de rayons
calculée depuis `--radius 0.625rem`. Dark mode par classe `.dark`.

Les primitives sont **shadcn style `base-nova` sur `@base-ui/react`** — **aucune dépendance Radix**
dans ce projet (`components.json`, et `grep radix package.json` → 0). 20 composants dans
`src/components/ui/`, variantes via `class-variance-authority`, fusion par `cn()` = `twMerge(clsx())`.

**4 variantes de cartes** : `PropertyCardStandard` / `PropertyCardCover` / `PropertyCardListing` /
`PropertyCardCompact` (+ `PropertyRow`), avec un type `CardVariant` et des props communes
(`src/components/property/cards/types.ts`).

**Les graphiques sont maison en SVG + Tailwind** — aucune dépendance de charting, et c'est un choix
documenté (`src/components/charts/README.md`).

Règles complètes : `docs/design-guidelines.md`.

> ⚠️ Deux affirmations de `docs/design-guidelines.md` sont fausses aujourd'hui : les 6 familles de
> fontes « réservées au /playground » sont bien déclarées et appliquées sur `<html>`, et la règle
> « zéro valeur hex arbitraire » compte 27 hex à 6 chiffres dans 8 `.tsx` plus 27 classes `blue-*`
> alors que le bleu a été retiré du DS (TCK-129).

## État

**TanStack Query v5 est le store serveur unique.** `createQueryClient()` (`src/lib/query-client.ts:15-32`)
— `staleTime` 5 min, `gcTime` 30 min, **pas de retry sur 4xx** (via `instanceof ApiError`), mutations
sans retry. `QueryProvider` instancie un client par session via `useState`.

**2 contexts React seulement** — `AuthContext` et `CompareContext`. Le reste de
l'état partagé passe par TanStack Query ou par des stores localStorage maison :
`favoritesStore.ts`, `recently-viewed.ts`, `wizard-drafts.ts`, `compare.ts`.

## Formulaires

react-hook-form + zod via le hook maison **`useApiForm`** (`src/hooks/useApiForm.ts:64-120`), qui
remappe les erreurs 422 de Laravel sur les champs RHF — y compris les clés imbriquées
(`address.city`) et indexées (`items.0.quantity`) — et agrège les clés inconnues dans un
`globalError`. 17 schémas zod dans `src/lib/schemas/`, 8 composants `Form*` exposés par un barrel.

## i18n

**next-intl sans segment `[locale]` dans l'URL.** La locale est résolue côté serveur : cookie
`NEXT_LOCALE` → `Accept-Language` (avec parsing des q-factors) → `fr`
(`src/i18n/request.ts:44-99`). 3 locales — `fr` (63 Ko), `en` (59 Ko), `wo` (54 Ko) — et **`wo` est
deep-mergé sur `fr`** pour un repli gracieux. Fuseau figé à `Africa/Dakar`.

> ⚠️ **La règle « le front possède le texte affiché » est une intention, pas un état** : seuls
> **82 fichiers sur 875** utilisent `useTranslations`/`getTranslations`, alors que les trois
> dictionnaires sont complets (1376 clés fr/en). Des libellés produits sont en dur en français, y
> compris dans la navigation. Aucune garde ne le mesure (dette D-24).

## Tests & gardes

vitest 4 + jsdom + @testing-library, alias `@` → `./src`, setup global qui polyfille
`ResizeObserver` et `matchMedia` (`vitest.setup.ts`). **~143 fichiers, ~810 tests, tous verts** (arrondi : cf. la note du `CLAUDE.md` racine).

```bash
npm run lint          # ⚠ `npm run build` ne lance PAS ESLint sous Next 16
npx tsc --noEmit      # ⚠ aucun script `typecheck` dans package.json
npm run test
```

> **Les trois commandes ci-dessus doivent être vertes avant tout commit.** Le frontend n'a eu
> **aucune CI** jusqu'au 2026-08-12 : une erreur ESLint bloquante, une erreur TypeScript et un test
> en échec ont vécu sur `dev` pendant 53 à 94 jours sans que rien ne les signale. `web-ci.yml` les
> attrape désormais — mais `npm run build` seul ne suffit toujours pas, et c'est pour ça que les
> trois sont listées.

## Environnement

Une seule variable applicative : **`NEXT_PUBLIC_API_URL`** (39 lectures), plus `NODE_ENV` (9).
`.env.example` et `.env.local` pointent sur `http://127.0.0.1:8002`.

> ⚠️ Incohérence d'hôte : l'API annonce `APP_URL=http://localhost:8002` et
> `SANCTUM_STATEFUL_DOMAINS=localhost:3000`, le front pointe sur `127.0.0.1:8002`. **Du point de vue
> des cookies, `localhost` et `127.0.0.1` sont deux origines distinctes.**

`next.config.ts` branche le plugin next-intl sur `./src/i18n/request.ts` et autorise en
`remotePatterns` picsum/placehold/unsplash + `api.takussan.com` + `preview.api.takussan.com` +
`127.0.0.1:8002` + `localhost:8002`, avec `dangerouslyAllowSVG` et `dangerouslyAllowLocalIP`.

## À ne pas croire

- `README.md` est resté le **template create-next-app par défaut** (Geist, Vercel, « editing
  app/page.tsx ») — zéro information Takussan.
- Les constantes de navigation vivent dans `src/data/navigation.ts` — **pas** dans un fichier
  nommé « mock ». Elles y étaient, mêlées à ~300 lignes d'annonces factices sans usage, et un
  nom pareil finit par faire supprimer par mégarde des données que la production consomme.
