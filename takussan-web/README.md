# takussan-web

Front-end de **Takussan**, plateforme de gestion immobilière (Sénégal — XOF, français / anglais /
wolof). Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4.

> Ce fichier a été le template `create-next-app` par défaut jusqu'au 2026-08-16 (TCK-311). Il
> promettait la police Geist et un déploiement Vercel : ce projet utilise Bricolage Grotesque et
> DM Sans, et se déploie sur un VPS. *Un README qui décrit un autre projet coûte plus cher que pas
> de README : on ne s'en méfie pas.*

## Démarrer

Depuis la **racine du monorepo**, pas d'ici — le front seul ne sert à rien sans l'API, la base, la
file de jobs et Meilisearch :

```bash
./dev.sh          # services docker + API + worker + scheduler + front
./dev.sh doctor   # qui répond, qui manque, quelles migrations sont en attente
```

Le front écoute sur `http://localhost:3000`, l'API sur `http://127.0.0.1:8002`.

Pour ne lancer que le front (l'API doit déjà tourner) :

```bash
npm install
npm run dev
```

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production — **ne lance PAS ESLint** sous Next 16 |
| `npm run start` | sert le build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (une passe) |
| `npm run test:watch` | Vitest en watch |
| `npm run check:i18n` | les trois catalogues de traduction déclarent-ils les mêmes clés ? |
| `npx tsc --noEmit` | **il n'existe pas de script `typecheck`** — une erreur TS a survécu 53 jours sur `dev` |

Les deux dernières lignes ne sont pas des remarques de style : `build` qui n'exécute pas ESLint et
l'absence de `typecheck` sont exactement les deux trous par lesquels une erreur de lint et une
erreur de types ont atteint la branche d'intégration et y sont restées.

## Structure

```
src/
├── app/                  # App Router — 112 pages, 31 route handlers BFF
│   ├── (auth)/           # connexion, inscription, OAuth
│   ├── (public)/         # site public : accueil, recherche, fiches biens, agences, agents
│   ├── (dashboard)/      # espace connecté : /app (agent) et /admin (admin d'agence)
│   ├── (super-admin)/    # console plateforme
│   ├── actions/          # server actions
│   └── api/              # route handlers BFF (proxy vers l'API Laravel)
├── components/           # composants — `ui/` porte les primitives du design system
├── context/ hooks/ lib/  # contextes React, hooks, clients HTTP et requêtes
├── i18n/ messages/       # next-intl — catalogues `fr.json`, `en.json`, `wo.json`
└── types/ data/ test/
```

## Deux pièges déjà payés

**Le préfixe `/api` n'est pas symétrique.** `apiFetch` l'ajoute tout seul ; `apiRequest` et
`useApiQuery` **non** — c'est l'appelant qui l'écrit. L'oubli ne produit pas un 404 propre mais un
`net::ERR_FAILED` par CORS (Laravel n'expose que `api/*`), ce qui envoie chercher le défaut au
mauvais endroit. Ni le typage ni le lint ne l'empêchent.

**Sparse fieldsets obligatoires.** Le backend utilise `spatie/laravel-query-builder`. Toute lecture
passe `fields[table]=…` avec les seules colonnes de la vue, filtre par `filter[…]` **côté serveur**
(jamais côté client sur une liste déjà récupérée), et charge les relations par `include=`.

```
filter[status]=active   filter[search]=mot clé   sort=-created_at
include=address,owner   fields[properties]=id,title   per_page=20
```

## Interface

Primitives **shadcn style `base-nova` sur `@base-ui/react`** — il n'y a **aucune** dépendance Radix
dans ce projet. Direction visuelle « Ancrage Local Contemporain » : palette Lin
(`--background #fcf9f3`, `--primary #a85332`, `--accent #5d6e4f`), typographie Bricolage Grotesque /
DM Sans.

**Le front possède le texte affiché** : l'API émet des codes et des données, les libellés passent
par next-intl (`fr` / `en` / `wo`).

## Où lire la suite

- [`CLAUDE.md`](./CLAUDE.md) — conventions de ce dossier : `apiFetch` vs `apiRequest` vs
  `useApiQuery`, route handlers BFF, design system, i18n, conventions de composants.
- [`../CLAUDE.md`](../CLAUDE.md) — le monorepo, ses commandes réelles et ses principes non négociables.
- [`../docs/design-guidelines.md`](../docs/design-guidelines.md) — à lire et appliquer pour tout travail d'interface.
- [`../docs/spatie-query-builder.md`](../docs/spatie-query-builder.md) — la référence complète des lectures API.
