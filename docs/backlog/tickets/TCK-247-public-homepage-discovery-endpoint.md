---
id: TCK-247
title: Endpoint unique homepage discovery (4 rangées dédupliquées côté serveur)
status: review
phase: P2
family: back
estimate: M
wave: 28
created: 2026-05-10
updated: 2026-08-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#3-decouverte-publique"
  models:
    - "docs/models-spec.md#3-property"
tags: [homepage, discovery, performance, back]
---

## Objectif utilisateur

Le visiteur (anonyme ou connecté) qui arrive sur la homepage publique voit
les 4 rangées de découverte (« Près de toi » / « À louer » / « Coup de cœur » /
« Nouveau ») se remplir en un seul aller-retour réseau, avec un fill rate
garanti par rangée et sans flicker au moment où une rangée résout son fetch.

## Contrat de données

**Endpoint à créer :**

- `GET /api/public/properties/discovery`
  - Query params :
    - `near_city` (string, nullable) — résolu côté frontend via géo-IP ; fallback `Dakar` si absent.
    - `per_row` (int, default 10, max 20) — nombre d'items visés par rangée.
  - Réponse :
    ```json
    {
      "near":     { "items": [PropertyResource, ...], "city": "Dakar" },
      "rent":     { "items": [PropertyResource, ...] },
      "featured": { "items": [PropertyResource, ...] },
      "latest":   { "items": [PropertyResource, ...] }
    }
    ```
  - Logique : la rangée `featured` est résolue **sans dedup** (rangée curée,
    les chevauchements avec les autres rangées sont intentionnels). Les 3
    autres rangées sont dédupliquées entre elles : un même bien ne peut pas
    apparaître dans plus d'une de `near` / `rent` / `latest`.
  - Garantir le fill rate : si une rangée tombe sous `per_row` après dedup,
    le serveur pioche dans un pool plus large pour compléter (limite : 3×
    `per_row` candidats par rangée, au-delà on accepte la rangée courte).

**Frontend** : remplacer les 4 appels `useProperties` de `HomepageDiscovery`
par un seul appel à ce nouvel endpoint, et supprimer la dedup côté client
(la `featuredUnique = featured.properties` exception introduite dans la PR
qui ferme ce ticket disparaît également).

## Contraintes strictes (métier)

- Visibilité : ne renvoyer que des biens `public()` et `status != Draft`,
  comme les endpoints existants `/public/properties` et `/public/properties/search`.
- `featured` : tri `featured DESC, published_at DESC` puis filtre `featured = true`.
- `near` : filtre `address.city = near_city` (case-insensitive si possible),
  tri `featured DESC, published_at DESC`.
- `rent` : filtre `contract_type = rent`, tri `featured DESC, published_at DESC`.
- `latest` : tri `created_at DESC`.
- Sparse fieldset : exposer le même `PropertyResource` que les endpoints
  existants — pas d'extension de payload.
- Cache HTTP : `Cache-Control: public, max-age=60, s-maxage=300` (la page
  d'accueil n'est pas personnalisée pour l'anonyme ; varie sur `near_city`).

## Delta à produire

- [x] Controller : méthode `discovery` dans `App\Http\Controllers\Public\PublicPropertyController`.
- [x] FormRequest : `App\Http\Requests\Public\HomepageDiscoveryRequest` (validation `near_city`, `per_row`).
- [x] Service : `App\Services\Property\HomepageDiscoveryService` qui assemble
      les 4 rangées avec dedup serveur (featured exempté).
- [x] Route : `Route::get('public/properties/discovery', ...)` dans `routes/api.php`
      — déclarée dans `routes/api/public.php` (un fichier par domaine, cf. `takussan-api/CLAUDE.md`),
      **au-dessus** de `properties/{slug}` sans quoi le segment littéral est avalé comme un slug.
- [x] Tests : `tests/Feature/Public/HomepageDiscoveryTest.php` couvrant :
      - structure de la réponse (4 clés `near` / `rent` / `featured` / `latest`),
      - dedup effective entre `near` / `rent` / `latest`,
      - absence de dedup pour `featured` (peut chevaucher les autres),
      - fill rate respecté quand le pool est suffisant,
      - fallback `Dakar` quand `near_city` absent,
      - exclusion des Draft / non-publics,
      - cap `per_row` à 20.
- [x] Frontend : `HomepageDiscovery.tsx` consomme l'endpoint via un nouveau
      hook `useHomepageDiscovery()`. Suppression des 4 appels `useProperties`
      et du `dedupeAcross` client (et du `featuredUnique = featured.properties`
      exception).
- [x] Frontend : le titre de la rangée « Près de toi » est **dérivé** de la
      réponse (`near.city` / `near.fallback` / `near.requested_city`), clés
      next-intl dans `fr`/`en`/`wo`.

## Critères d'acceptation

- [x] AC1 — Sur la homepage, un seul appel réseau alimente les 4 rangées
      (vérifiable dans l'onglet Network du navigateur).
- [x] AC2 — Aucune rangée ne se vide après être apparue (pas de flicker dû
      à la dedup) ; la rangée signature « Coup de cœur » reste pleine et les
      rangées génériques ne perdent pas leurs items quand featured arrive.
- [x] AC3 — Un même bien apparaît au plus une fois dans la combinaison
      `near` ∪ `rent` ∪ `latest`, mais peut apparaître librement dans
      `featured`.
- [x] AC4 — Si `near_city` absent, la rangée « near » utilise `Dakar`.
- [ ] AC5 — TTFB perçu sur la homepage en dev local : < 250ms pour la
      réponse de discovery (vs 4 appels parallèles aujourd'hui).
      **Non mesuré** — aucun relevé n'a été pris, la case reste vide.

## Hors périmètre

- Personnalisation par utilisateur connecté (ranking par historique, etc.) —
  ticket dédié plus tard si besoin.
- Pagination / scroll infini sur les rangées (les rangées sont scrollables
  horizontalement avec un nombre fixe d'items, pas paginées).
- Header `x-vercel-ip-city` côté serveur pour résoudre la ville sans appel
  ipapi : c'est une optim séparée, déjà tracée hors backlog.

## Notes d'implémentation

Contexte : le bug de flicker initial (rangée « Sélection de la semaine »
vide, puis rangées « Près de toi » et « À louer » qui se vident après
arrivée de featured) a été corrigé par un fix client-side simple consistant
à exempter `featured` du `dedupeAcross`. Ce ticket trace l'évolution serveur
souhaitable quand un de ces signaux apparaît :

- la homepage gagne de la perso (« Pour toi », « basé sur tes recherches »),
- on veut garantir un fill rate par rangée que le client ne peut pas
  garantir (il drop, il ne pioche pas dans un pool plus large),
- le LCP mobile sur 3G sénégalais devient mesurable comme problématique à
  cause des 4 fetches parallèles.

### Décisions prises à l'implémentation

Seulement ce qui ne se lit pas dans le diff.

**Le seuil de bascule de « Près de toi » vaut 4, et la bascule est totale.**
`HomepageDiscoveryService::NEAR_ROW_MIN_ITEMS = 4` — sous 4 annonces dans la ville
du visiteur, la rangée passe **entièrement** sur `REFERENCE_CITY` (`Dakar`). Quatre,
parce que c'est ce que la rangée montre d'un coup : carte `standard` de 290px sur
gouttière de 24px (pas de 314px) dans une coque de 1440px moins 48px de padding, soit
⌊1344/314⌋ = 4 cartes avant le premier scroll. Une rangée qui ne remplit pas sa propre
largeur visible se lit comme cassée, pas comme clairsemée. Le seuil est **clampé par
`per_row`** : un appelant qui demande 2 cartes ne doit pas s'entendre dire que sa ville
est trop maigre pour une rangée de 2.

Deux alternatives ont été écartées, et c'est ce refus qui justifie les clés de réponse :
compléter une rangée locale avec des biens d'ailleurs (le titre nomme une ville — titrer
Ziguinchor au-dessus de biens dakarois est simplement faux), et afficher les deux ou trois
annonces locales réelles (un visiteur à l'étranger atterrit sur une première rangée vide).
La bascule totale garde la rangée pleine **et** le titre honnête — à condition que le titre
suive, d'où le point suivant.

**Le titre de la rangée locale est dérivé de la donnée, jamais deviné.** La réponse porte
`near.city` (la ville réellement servie), `near.requested_city` (celle devinée pour le
visiteur) et `near.fallback`. Le front choisit `near.title` ou `near.fallbackTitle` sur ce
seul drapeau. Trois pièges que ces trois clés existent pour fermer :

1. `fallback` est **faux** quand `requested_city` est `null` : ne pas savoir où est le
   visiteur est le défaut nominal, pas un repli — il n'y a pas de rangée locale à avoir
   remplacée.
2. `fallback` est **faux** quand le visiteur est déjà dans la ville de référence, même si
   elle est maigre : il n'y a nulle part de mieux où l'envoyer, et lever le drapeau ferait
   rebaptiser une rangée qui n'a pas bougé.
3. `city` est l'orthographe **du catalogue**, pas celle du visiteur : `?near_city=ZIGUINCHOR`
   rend `"Ziguinchor"`, parce que c'est cette chaîne que le front imprime dans le titre.

Corollaire côté front : quand la géolocalisation ne rend rien, le hook **n'envoie pas
`near_city`** au lieu d'envoyer `Dakar` par défaut. Envoyer `Dakar` écraserait la distinction
que le backend maintient (1). Le raccourci `city` de `UserLocationProvider` retombe déjà sur
`Dakar` — c'est `location.city` brut qu'il faut lire.

**Un seul appel, donc une attente bornée sur la géo-IP.** Le front retient la requête tant que
`UserLocationProvider` n'a pas résolu, sans quoi la page part sans ville puis repart avec :
deux requêtes, et l'AC1 tombe. Mais le provider appelle un tiers (`ipapi.co`) sans timeout à
lui, et une requête qui traîne sans jamais échouer laisserait la homepage en squelettes
indéfiniment. D'où `GEO_DEADLINE_MS = 1200` dans `HomepageDiscovery.tsx` : passé ce délai on
interroge sans ville et le backend sert son marché de référence.

**Pas de sparse fieldsets sur cet endpoint, et ce n'est pas un oubli.** `discovery` n'est pas
monté sur `spatie/laravel-query-builder` ; `HomepageDiscoveryRequest` accepte exactement
`near_city` et `per_row`. Les items sortent déjà dans la forme *liste* (légère) de
`PropertyResource` — la route n'est pas dans la liste `$isDetail`.

**`featured` ne consomme ni n'alimente l'ensemble des ids vus.** Ce n'est pas seulement
« exemptée de la dedup » : elle ne réserve rien non plus. Un coup de cœur qui est aussi une
location dakaroise appartient légitimement à trois rangées. La dedup court `near → rent →
latest`, l'ordre qu'utilisait le client, pour que la règle serveur ne rebatte pas
silencieusement ce que les visiteurs voient.

**AC2 est tenu par construction, pas par mesure** : les quatre rangées viennent d'une seule
réponse (plus de rangée qui arrive après les autres et les vide), et le hook ne blanchit pas
les rangées déjà à l'écran lors d'un refetch. Aucun relevé de flicker n'a été pris.

`per_row` vaut 12 pour les quatre rangées, là où le client demandait 10/12/12/14 : l'over-fetch
compensait la dedup client, qui n'existe plus.

## Reste sur dev

_Mesuré le 2026-08-15 (`git show --stat 3792eed7`, `git log dev --grep=TCK-247`)._

**Ce qui est sur `dev`** — un seul commit cite ce ticket, `3792eed7` du 2026-05-10, et il ne
livre **pas** l'endpoint : il introduit `UserLocationProvider` (géo-IP ipapi.co, cache 24 h en
localStorage) et rend la rangée « Près de toi » dynamique **sur les quatre appels clients
d'origine**. Neuf fichiers, tous frontend. Rien côté API.

**Ce qui n'est PAS sur `dev`** — tout le reste du ticket, qui vit sur la branche
`fix/suite-deterministe-et-tickets-ouverts` et n'est pas mergé :

- back : `HomepageDiscoveryService`, `HomepageDiscoveryRequest`,
  `PublicPropertyController::discovery()`, la route, et `tests/Feature/Public/HomepageDiscoveryTest.php` ;
- front : `useHomepageDiscovery`, le câblage de `HomepageDiscovery.tsx` sur l'appel unique,
  le titre dérivé et ses clés `fr`/`en`/`wo`, et les deux fichiers de tests vitest.

Le statut `review` porte donc sur cette branche, pas sur `dev`.
