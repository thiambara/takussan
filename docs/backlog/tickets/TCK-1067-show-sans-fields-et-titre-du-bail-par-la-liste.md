---
id: TCK-1067
title: "Un show rend la ressource de détail entière : le front ne lui envoie plus de fields, et le titre du bail passe par la liste"
status: done
phase: P2
family: dette
estimate: M
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  docs:
    - "docs/spatie-query-builder.md#sparse-fieldsets-sélection-de-champs"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-60--include-acceptés-chargés-et-non-émis--show-qui-ignorent-include-et-fields"
tags: [api, web, spatie, pistes]
---

## Contexte

Réf : **P60.03** du fichier de pistes, `validé` (V7). Les `show` de l'API chargent des relations
fixes et ignorent `fields[...]`. Seul `CustomerController::show` passe par `buildQuery`. Le front
leur envoyait quand même des `fields`, ce qui faisait croire à une réponse réduite. Pour son seul
titre d'onglet, la fiche de bail faisait jouer au `show` tout son chargement (bien, locataire,
paiements, signatures).

## Décision du porteur

> (b) un `show` rend la ressource de détail entière, `fields`/`include` ne valent que pour les listes : l'écrire dans `docs/spatie-query-builder.md`, retirer du front les `fields` envoyés à un `show`, servir l'en-tête de la fiche de bail par la liste filtrée par id ; la partie 2 d'ADR-0021 est fermée en session (TCK-1045, même PR) (porteur, 2026-10-20)

## Objectif

Aucun appel du front n'envoie de `fields[...]` à une route de détail. La règle est écrite dans
`docs/spatie-query-builder.md`, et le titre de la fiche de bail se lit par
`GET /api/leases?filter[id]=…&fields[leases]=id,reference_number`.

## Delta à produire

- [x] Front : `fields` retiré des 15 appels de détail relevés par la garde (bail, réservation,
      conversation, facture, reversement, visite, client, bien du tableau de bord, intervention,
      état des lieux, agence ×2, console : agence et utilisateur, en-tête du bail). Les constantes
      `*DETAIL_FIELDS` qui ne servaient qu'à eux sont retirées.
- [x] Front : `generateMetadata` de `leases/[id]/page.tsx` lit la liste filtrée par id.
- [x] API : `id` ajouté à `Lease::$requestFilterable`, sinon `filter[id]` rend 400.
- [x] `docs/spatie-query-builder.md` : la règle, la lecture légère par la liste, `filter[id]` des baux.
- [x] Garde : `src/lib/queries/__tests__/show-sans-fields.garde.test.ts`.

## Critères d'acceptation

- [x] AC1 : la garde ne trouve aucune déclaration qui appelle `/api/<ressource>/${id}` avec des `fields`.
- [x] AC2 : `GET /api/leases?filter[id]=X&fields[leases]=id,reference_number` rend le seul bail X,
      dans le périmètre de la liste (un bail tiers ne sort pas), et un id illisible rend 400.
- [x] AC3 : le titre de la fiche de bail appelle la liste filtrée par id, jamais le `show`.

## Hypothèses (mode sans humain)

- **`filter[id]` sur les baux est ajouté.** La `Piste` écrivait que « la liste filtrée par id existe
  déjà ». Mesuré : `GET /api/leases?filter[id]=…` rendait 400 (`id` absent de
  `$requestFilterable`). Le filtre ajouté ne fait que restreindre la liste, qui garde son périmètre.
  `ExactIdentifierFilter` refuse en 400 un id non entier.
- **Les `include` envoyés aux `show` restent.** La décision ne retire que les `fields`, et trois
  `show` lisent encore `include=` (`Customer`, `MaintenanceRequest`, `BankStatement`). La doc dit
  ces trois exceptions.
- **La partie 2 d'ADR-0021** se ferme en session (`docs/adr/` est fermé à l'implémenteur).

## Hors périmètre

- Faire refuser `fields` par les `show` côté API.
- Les `include` des `show` (P21.04).

## Notes d'implémentation

- Avant correctif : la garde liste 15 déclarations ; `filter[id]` sur `/api/leases` rend 400
  (2 rouges sur 3 dans `LeaseListFilterByIdTest`). Ablations : `id` retiré de `$requestFilterable`
  → 2 rouges ; `page.tsx` d'origine → 4 rouges (garde, deux titres, appel à la liste).
- Les ressources se règlent sur les colonnes **chargées**, pas sur le paramètre : sans `fields`, un
  `show` rend toutes ses clés. Le cas `fetchDashboardProperty` de
  `property-fields.coverage.test.ts` est retiré : il n'y a plus de liste demandée à confronter.
