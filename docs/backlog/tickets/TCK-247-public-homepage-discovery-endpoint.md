---
id: TCK-247
title: Endpoint unique homepage discovery (4 rangées dédupliquées côté serveur)
status: todo
phase: P2
family: back
estimate: M
created: 2026-05-10
updated: 2026-05-10
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

- [ ] Controller : méthode `discovery` dans `App\Http\Controllers\Public\PublicPropertyController`.
- [ ] FormRequest : `App\Http\Requests\Public\HomepageDiscoveryRequest` (validation `near_city`, `per_row`).
- [ ] Service : `App\Services\Property\HomepageDiscoveryService` qui assemble
      les 4 rangées avec dedup serveur (featured exempté).
- [ ] Route : `Route::get('public/properties/discovery', ...)` dans `routes/api.php`.
- [ ] Tests : `tests/Feature/Public/HomepageDiscoveryTest.php` couvrant :
      - structure de la réponse (4 clés `near` / `rent` / `featured` / `latest`),
      - dedup effective entre `near` / `rent` / `latest`,
      - absence de dedup pour `featured` (peut chevaucher les autres),
      - fill rate respecté quand le pool est suffisant,
      - fallback `Dakar` quand `near_city` absent,
      - exclusion des Draft / non-publics,
      - cap `per_row` à 20.
- [ ] Frontend : `HomepageDiscovery.tsx` consomme l'endpoint via un nouveau
      hook `useHomepageDiscovery()`. Suppression des 4 appels `useProperties`
      et du `dedupeAcross` client (et du `featuredUnique = featured.properties`
      exception).

## Critères d'acceptation

- [ ] AC1 — Sur la homepage, un seul appel réseau alimente les 4 rangées
      (vérifiable dans l'onglet Network du navigateur).
- [ ] AC2 — Aucune rangée ne se vide après être apparue (pas de flicker dû
      à la dedup) ; la rangée signature « Coup de cœur » reste pleine et les
      rangées génériques ne perdent pas leurs items quand featured arrive.
- [ ] AC3 — Un même bien apparaît au plus une fois dans la combinaison
      `near` ∪ `rent` ∪ `latest`, mais peut apparaître librement dans
      `featured`.
- [ ] AC4 — Si `near_city` absent, la rangée « near » utilise `Dakar`.
- [ ] AC5 — TTFB perçu sur la homepage en dev local : < 250ms pour la
      réponse de discovery (vs 4 appels parallèles aujourd'hui).

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
