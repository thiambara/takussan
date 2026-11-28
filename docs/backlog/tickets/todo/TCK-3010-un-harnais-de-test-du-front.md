---
id: TCK-3010
title: "Un harnais de test du front : un rendu unique (intl, QueryClient, auth, gestes) et une doublure de l'API par ressource, fidèle à fields[] et include="
status: todo
phase: P2
family: technique
estimate: M
wave: 99
created: 2026-11-27
updated: 2026-11-27
depends_on: [TCK-3008, TCK-3009]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, tests, technique, architecture]
---

## Objectif utilisateur

Un test du front se monte en une ligne et parle à une API simulée qui ne rend que les colonnes demandées, comme la vraie.

## Contrat de données

Relevé du 2026-11-27 (`dev` 4e3a929f7), 1 971 fichiers de test :

- `vi.mock('@/lib/api')` ×252, `stubGlobal('fetch')` ×170, `vi.mock('@/lib/queries/…')` ×549, `AuthContext` ×492, `new QueryClient` ×556 ; aucun outil partagé pour `QueryClient` ni l'auth (chaque test refait son `monter`).
- Outils partagés existants : `withIntl` (`src/test/intl.tsx`, 1 181 importeurs), `avecGestes` (`src/test/habilitations.tsx`), `navigationDeTest`.
- Une seule doublure fidèle : `commeLApi` (`src/test/visites-comme-l-api.ts`), au niveau du retour d'`apiRequest`, pour `/api/property-visits` seulement ; le contrat TCK-1800 recopie la table de renommage des relais (`requetes-du-front.tck-1800.test.tsx:122-125`).

## Contraintes strictes (métier)

- Pas de dépendance neuve (pas de MSW) ; interception au niveau de `fetch`, qui couvre Laravel, le BFF et le contrat TCK-1800.
- La doublure applique `fields[<table>]` et `include=` sur les listes (ADR-0006, ADR-0021) et signale une clé lue hors de `fields`.
- La table de renommage des relais n'existe qu'une fois (lue par le harnais et par le contrat TCK-1800).
- Migration progressive : les tests existants ne sont pas réécrits en bloc ; on migre ceux des dossiers touchés par TCK-3005, 3007, 3008, 3009, et la doublure des visites.

## Delta à produire

- [x] Intention : un rendu de test unique (intl, QueryClient frais, auth fournie, gestes, navigation)
- [x] Intention : une doublure d'API par ressource sur `fetch`, qui généralise `commeLApi` (au moins visites, réservations, baux), avec erreurs à la forme de TCK-3008
- [x] `commeLApi` passe par la nouvelle doublure ; ses 11 importeurs restent verts
- [x] Tests du harnais lui-même (fields, include, clé hors fields signalée, erreur)

## Critères d'acceptation

- [x] AC1 — Un test qui lit une clé non demandée dans `fields[]` échoue avec un message qui la nomme (test du harnais).
- [x] AC2 — Les tests migrés n'ont plus de `new QueryClient` ni de `vi.mock('@/lib/api')` locaux.
- [x] AC3 — La table de renommage des relais n'est écrite qu'une fois dans `src/test/`.
- [x] AC4 — `tsc --noEmit`, lint et les tests touchés sont verts.

## Hors périmètre

- La migration des ~1 900 autres fichiers de test (elle se fera au fil des tickets qui les touchent).

## Notes d'implémentation

Livré le 2026-11-28 (branche `feat/approfondissements-architecture`).

**Le harnais** (`takussan-web/src/test/`) :

- `api-simulee.ts` — `doublerLApi()`, au niveau du module d'un test : installe un `fetch` simulé avant chaque test et
  vérifie après lui. `servir(ressource, lignes)` (liste et détail `<route>/<id>`, bornés par `fields[<table>]` et
  `include=`), `sur(méthode, motif, corps)`, `refuser(méthode, motif, statut, { code, message, params, errors })`
  (l'enveloppe de `bootstrap/app.php`, ADR-0032 : `ApiError.codeMetier` et `params` la lisent, TCK-3008), un
  producteur qui lève `new ApiError(…)` refuse selon la requête, `parDefaut(corps)`, `appels(chemin)` (méthode,
  chemin, requête, corps décodé, en-têtes), `oublierLesAppels()`, `auRepos()`, `verifier()`. Une déclaration faite pendant un
  test ne vaut que pour lui. **Ce qui fait échouer un test après lui** : une clé lue hors de `fields`/`include`
  (nommée, avec sa table et sa route) et une requête qu'aucune déclaration ne sert — notées pendant le test,
  jamais levées dans le rendu, où React Query les avalerait. `json()` rend l'arbre sous surveillance (le `Proxy`
  ne survivrait pas à `JSON.stringify`). Le chemin journalisé est celui que Laravel reçoit : absolu tel quel,
  relatif par `RELAIS_DU_BFF` (`admin-users`, `super-admin`, et `impersonation/proxy`), seule copie de la table.
- `ressources-de-l-api.ts` — visites, réservations, baux : `colonnes` (suivent `fields`), `inclusions` (nom
  d'`include=` → clés), `calculees` (servies telles quelles, jamais signalées). Chaque description est gardée
  contre le `toArray` de sa `Resource` PHP (`toutesLesCles` pour les visites).
- `rendu.tsx` — `rendre(ui, { compte, locale, gestes, url })`, `rendreLeHook`, `enveloppeDeTest` (pour un
  `renderToString` puis `hydrateRoot`) : `QueryClient` frais sans nouvel essai, le **vrai** `AuthProvider`
  (le Bearer et `X-Active-Profile-Hint` partent avec l'appel, vérifié), `avecGestes`, `withIntl`.
- `__tests__/api-simulee.test.tsx` — 24 cas : fields, include, détail et 404, réservations et baux selon leur
  description, clé hors fields nommée par `apiRequest` ET par `appelBff`, requête non doublée, refus 409 codé et
  422, portée d'une déclaration, `auRepos`, les trois relais, corps, auth (Bearer, profil actif, profil non
  hérité du rendu précédent), langue, gestes et URL de départ, et les trois gardes PHP.

**Ce qui différait du ticket, re-mesuré :**

- Réservations : `BookingController::index` charge `property`, `customer` et la contre-offre quoi que dise
  `include=` (et la fiche, les paiements) : ce sont des `calculees`, pas des inclusions. Baux : les noms
  d'inclusion `documentsCount`/`historyCount` ne sont pas ceux des clés ; `signatures` n'est pas incluable
  en liste (`Lease::$requestLoadable`). Sous `fields`, Laravel rend une colonne non lue tantôt absente
  (`whenHas`, `lue()`), tantôt `null` : la doublure l'omet dans les deux cas et signale sa lecture.
- Les blocs imbriqués (`property` sous `fields[properties]`) sont rendus entiers : la doublure ne les borne pas.
- `next/navigation` reste une ligne du fichier de test : un `vi.mock` ne se hisse que dans le fichier qui
  l'écrit ; l'option `url` ne fait que poser la requête de départ.
- Périmètre de la migration, mesuré : les dossiers de 3005/3007/3008/3009 comptent ~128 fichiers qui ont l'un
  des motifs. Migrés : les 10 importeurs de `commeLApi` (`visites-comme-l-api.ts` supprimé, sa garde PHP et
  son test passés au harnais), le contrat TCK-1800 (fixture identique, md5 `901debc6…`), la fiche de visite
  (`visits/fiche/__tests__/fiche.tck-2587`, TCK-3005), `bookings.trois-natures.tck-2594` (TCK-3007) et
  `leases.locataire.tck-2780`. **Non fait, décision attendue du porteur de la vague** : les autres fichiers de ces
  dossiers, dont ceux de 3008 et 3009 (prochaine tranche proposée : `components/boost/admin/__tests__`, 5 fichiers).
- Au niveau de `fetch`, une lecture part après les attentes d'`apiRequest` : un test qui vidait son journal
  juste après le montage attend désormais la première lecture (`semaine-et-filtres`), et **toute assertion
  d'absence** (« aucune lecture de… ») passe d'abord par `await api.auRepos()` — sans lui elle serait verte quoi
  que fasse le code (12 sites dans les fichiers migrés).

**Vérifié :** les 15 fichiers de test touchés verts ; `tsc --noEmit` et eslint propres ;
`npm run check:*` : les seuls rouges viennent de `playground/maquettes` et de `src/lib/bff.ts` (TCK-3009) ;
`node scripts/gen-requetes-du-front.mjs --check` vert ; gardes qui parcourent `src/` (13 fichiers) vertes, sauf
`relais-bff.tck-968` (« plus de 40 fetch littéraux », 5 depuis TCK-3009 : sans lien avec ce ticket).
Ablations : sans l'`afterEach` de `doublerLApi`, un test qui lit une clé non demandée passe au vert ; sans
`cancelled_by` dans `VISIT_CLIENT_FIELDS`, `mes-visites.tck-2883` rougit en nommant la clé ; sans l'entrée
`super-admin` de `RELAIS_DU_BFF`, le contrat TCK-1800 rougit ; sans `enabled: false` dans `useBookings`, l'assertion
d'absence de `bookings.trois-natures` rougit.

