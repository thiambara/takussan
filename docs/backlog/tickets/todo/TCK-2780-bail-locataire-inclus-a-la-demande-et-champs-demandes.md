---
id: TCK-2780
title: "GET /api/leases/{id} : le locataire n'est rendu que sous `include=tenant`, et seulement avec les champs demandés"
status: todo
phase: P2
family: full
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#7-customer"
tags: [back, front, baux, sparse-fieldsets, confidentialite, suite-de-tck-2647]
---

## Objectif utilisateur

L'écran qui ouvre un bail pour en lire le nom du locataire reçoit ce nom, pas son téléphone ni son e-mail. Un écran
qui ne demande pas le locataire ne le reçoit pas du tout.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 24 : ticket de suivi. Relevé ac (TCK-2647 q1, contre-vérification
de 065941306).

**Constat, relu sur l'arbre du 2026-11-13.**

- `LeaseController::show()` ne passe pas par `buildQuery()` (TCK-2642). Il charge **toujours**
  `['property.address', 'tenant', 'signatures.signer', 'signatures.onBehalfOf']`, que la requête demande
  `include=tenant` ou non.
- `LeaseResource` rend alors `tenant` par `CustomerResource::make($this->tenant)` entier : `first_name`,
  `last_name`, `email`, `phone`, `occupation`, `status`, `pipeline_stage`, `locale`, `user_id`, `added_by_id`…
  Le contrôleur ne lit aucun `fields`.
- Conséquence : le contournement du front ne protège rien. `useContexteDuBail(…, { avecLocataire: false })`
  (`takussan-web/src/lib/queries/inventory.ts`) retire `tenant` de `include` pour ne pas recevoir le téléphone et
  l'e-mail, mais l'API les rend quand même.
- Lecteurs de `show` (`LeasePolicy::view`) : le bailleur du bien (même suspendu), le personnel de l'agence, le
  locataire du bail et le super-admin.
- Appelants front qui demandent `tenant` aujourd'hui :
  - `src/lib/queries/inventory.ts` (le contexte du bail, « Démarrer » un état des lieux) ;
  - `src/lib/queries/leases-file.ts` (la fiche du bail, deux lectures).

**Endpoint touché :** `GET /api/leases/{id}`.

## Contraintes strictes (métier)

- **Le locataire n'est chargé que sous `include=tenant`.** Sans lui, la clé `tenant` est absente de la réponse.
- **Sous `include=tenant`, `fields[customers]` borne le bloc** : `id`, plus les clés demandées. Le nom de clé
  `fields[…]` est celui que spatie lit pour la relation `tenant` de l'index (`GET /api/leases`). L'index et la fiche
  doivent lire la même forme, et le ticket écrit laquelle dans ses notes.
- **Aucune clé demandée n'ouvre un droit** : `CustomerResource` garde ses gardes (`litLaFiche`, `notesLisibles`,
  `readsVisits`…), jugées sur la fiche complète et non sur le `SELECT` partiel (la leçon de TCK-2759 r3).
- Un appelant qui ne demande rien de plus (`include=tenant` sans `fields`) garde la réponse d'aujourd'hui. Seul le
  chargement sans `include` change.
- Les appelants front sont mis à jour dans le même ticket. Chacun demande le locataire seulement s'il le lit, et les
  seules colonnes qu'il lit.

## Delta à produire

- [ ] `LeaseController::show()` : `tenant` sort de la liste chargée d'office et n'est chargé que sous
  `include=tenant`.
- [ ] `CustomerResource` (ou une méthode partagée) : lecture de `fields[customers]` qui garde `id`, comme
  `AppNotificationResource::requestedFields()`. Elle est appliquée au bloc `tenant` du bail.
- [ ] Inventaire des appelants front de `GET /api/leases/{id}` (`cheminApi\`/api/leases/${…}\``). Pour chacun : ce
  qu'il lit du locataire, puis `include` et `fields` réduits à cela.
- [ ] Le commentaire de `useContexteDuBail` est réécrit : l'écart qu'il consigne est fermé.
- [ ] Tests `BailLocataireALaDemandeTest`, pour chacun des quatre lecteurs :
  - sans `include=tenant` : pas de clé `tenant` ;
  - avec `include=tenant&fields[customers]=id,first_name,last_name` : ni `phone` ni `email` dans le bloc.

## Critères d'acceptation

- [ ] AC1 — `GET /api/leases/{id}` sans `include` ne contient pas la clé `tenant`, pour chacun des quatre lecteurs.
- [ ] AC2 — `GET /api/leases/{id}?include=tenant&fields[customers]=id,first_name,last_name` rend un bloc `tenant`
  aux seules clés `id`, `first_name` et `last_name`. Le test vérifie que `phone` et `email` sont **absents** : il ne
  se contente pas de compter les clés.
- [ ] AC3 — `include=tenant` sans `fields` rend le même bloc qu'aujourd'hui, à l'instantané.
- [ ] AC4 — Le parcours « Démarrer » un état des lieux, puis la fiche du bail, n'affichent aucune régression. Leurs
  tests vitest restent verts, et le réseau d'un « Démarrer » ne contient plus le téléphone ni l'e-mail du locataire.
- [ ] AC5 — Vérifié par ablation. Un `show` qui recharge `tenant` d'office rend AC1 rouge. Un bloc qui ignore
  `fields` rend AC2 rouge.

## Hors périmètre

- Décider si le bailleur doit lire le téléphone du locataire de son bail : ce ticket rend la réponse fidèle à la
  demande, il ne change pas les droits de `CustomerResource`.
- `GET /api/property-visits` : voir TCK-2779.

## Notes d'implémentation

_(à remplir par implementing-specs)_
