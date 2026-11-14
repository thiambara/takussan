---
id: TCK-2803
title: "Le bloc locataire des baux, hors de la fiche : la liste borne fields[customers] et ne charge tenant que sous include, les gestes ne le rendent plus d'office"
status: todo
phase: P2
family: back
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#7-customer"
tags: [back, front, baux, sparse-fieldsets, confidentialite, suite-de-tck-2780]
---

## Objectif utilisateur

Un écran qui lit la liste des baux, ou qui pose un geste sur un bail, ne reçoit du locataire que ce qu'il a demandé.
Celui qui n'a rien demandé ne reçoit ni son téléphone ni son e-mail.

## Contrat de données

**Origine.** Écart consigné par TCK-2780 (décision 2, notes « La forme lue ») : la fiche (`GET /api/leases/{id}`)
borne désormais le locataire, mais la liste et les autres réponses qui rendent `LeaseResource` ne le font pas.

**Constat, relu sur HEAD (`ebc494478`, fichiers sans modification locale) le 2026-11-14 :**

- **La liste charge toujours le locataire.** `LeaseController::index()` part de
  `Lease::query()->with(['property.address', 'property.media', 'tenant'])` : `tenant` est chargé que la requête porte
  `include=tenant` ou non. `LeaseResource` le rend alors par `whenLoaded('tenant', …)`, en bloc
  `CustomerResource` entier.
- **La liste valide `fields[customers]` sans s'en servir.** Mesuré par TCK-2780 le 2026-11-14 :
  `fields[customers]=id,first_name` rend 200 avec un bloc `tenant` entier, et `fields[tenants]` comme `fields[tenant]`
  rendent 400. Spatie cherche les champs d'une relation incluse sous `tenants`.
- **Sept réponses de gestes chargent `tenant` d'office**, et le rendent entier par `whenLoaded` :
  - `LeaseController::store` (`load(['property', 'tenant'])`) ;
  - `LeaseEarlyTerminationController::store`, `destroy` et `confirm` ;
  - `LeaseSignatureController::detail` (demande d'envoi en signature et signature) ;
  - `LeaseRenewalController::store` ;
  - `LeaseRentController::update`.
- **Quatre autres le rendent selon l'état de la relation** : `LeaseController::update` (`fresh()`), `activate` et
  `terminate`, et `LeaseDepositRefundController::store`. Ils ne chargent rien, mais une policy qui lit
  `$lease->tenant` (`LeasePolicy`, l. 111, 236, 353, 376) charge la relation avant le rendu. Le bloc sort alors
  entier, sans que la requête l'ait demandé.
- `LeaseChainController::index` ne charge pas `tenant` : il n'est pas concerné.
- `CustomerResource::toArray` rend `email` et `phone` sans condition, à quiconque reçoit le bloc.

**Fuite : non confirmée (lu, non exécuté).** Toutes les portes relues ne s'ouvrent qu'au bailleur du bail
(`bailleurEcrit`), au personnel de son agence, au locataire du bail ou au super-admin. Ce sont des lecteurs que
`LeasePolicy::view` admet déjà, et qui reçoivent le même bloc par `GET /api/leases/{id}?include=tenant`. Le défaut est
donc une sur-livraison au regard des champs demandés, comme TCK-2780, et pas un accès hors droit. **Le ticket passe en
P1 si AC1 trouve une porte qui admet un appelant que `view` refuse.**

**Endpoints touchés :** `GET /api/leases`, et les réponses des gestes listés ci-dessus.

## Contraintes strictes (métier)

- **La liste ne charge le locataire que sous `include=tenant`.** Sans lui, la clé `tenant` est absente de chaque ligne.
- **Sous `include=tenant`, `fields[customers]` borne le bloc de la liste** comme celui de la fiche : `id`, plus les
  clés demandées, par la même lecture (`CustomerResource::champsDemandesDuBloc()` et `borneeAuxChamps()`). La liste
  et la fiche acceptent la même forme. Il n'en naît pas une troisième.
- **Une clé demandée n'ouvre aucun droit** : les gardes de `CustomerResource` se jugent sur la fiche complète
  (leçon de TCK-2759 r3, reprise par TCK-2780).
- **Une réponse de geste ne rend pas `tenant` d'office.** Elle suit la même règle que la fiche (`include=tenant`
  explicite), ou elle ne rend pas le bloc du tout. Le choix est écrit dans les notes, geste par geste, avec l'appelant
  front qui lit la réponse.
- Les appelants front de la liste et des gestes sont mis à jour dans le même ticket : chacun demande le locataire
  seulement s'il le lit, et les seules colonnes qu'il lit.
- Pas de N+1 : le bornage de la liste ne recharge pas une fiche par ligne quand les traits jugés sont déjà chargés.

## Delta à produire

- [ ] `LeaseController::index()` : `tenant` sort du `with()` d'office et n'est chargé que sous `include=tenant`.
- [ ] `LeaseResource` : sur la liste, le bloc `tenant` est borné par `fields[customers]` comme sur la fiche.
- [ ] Les onze réponses de gestes listées au constat suivent la règle retenue (`include=tenant`, ou aucun bloc).
- [ ] Inventaire des appelants front de `GET /api/leases` et des onze gestes : ce qu'ils lisent du locataire, puis
  `include` et `fields` réduits à cela.
- [ ] `docs/spatie-query-builder.md` dit que `fields[customers]` borne `tenant` sur la liste ET la fiche des baux.
- [ ] Tests `BailLocataireDeLaListeEtDesGestesTest`, pour chacun des quatre lecteurs (bailleur, personnel,
  locataire, super-admin).

## Critères d'acceptation

- [ ] AC1 — Pour chacune des onze portes de geste, un test confronte la porte à `LeasePolicy::view` : tout
  utilisateur admis par la porte est admis par `view`. Le test énumère les mêmes profils que ceux de
  `BailLocataireALaDemandeTest`, plus un bailleur suspendu et un membre parti de l'agence.
- [ ] AC2 — `GET /api/leases` sans `include=tenant` : aucune ligne ne contient la clé `tenant`, et ni le téléphone ni
  l'e-mail du locataire n'apparaissent nulle part dans la réponse. La recherche porte sur les valeurs, pas seulement
  sur la clé.
- [ ] AC3 — `GET /api/leases?include=tenant&fields[customers]=id,first_name,last_name` : chaque bloc `tenant` porte
  exactement `id`, `first_name` et `last_name`. Le test vérifie que `phone` et `email` sont ABSENTS
  (`assertArrayNotHasKey`), il ne compte pas les clés.
- [ ] AC4 — `GET /api/leases?include=tenant` sans `fields` rend le bloc d'aujourd'hui, à l'instantané relevé sur
  l'arbre d'avant le changement.
- [ ] AC5 — Pour chacun des onze gestes, la réponse sans `include=tenant` ne contient ni le téléphone ni l'e-mail du
  locataire. Pour les quatre réponses qui dépendent de la policy, le test passe par un lecteur dont la policy charge
  `tenant` (le locataire du bail).
- [ ] AC6 — Les tests vitest des écrans qui lisent la liste et les réponses de gestes restent verts. Chaque requête
  front qui demande `include=tenant` porte aussi `fields[customers]`.
- [ ] AC7 — Vérifié par ablation, une à la fois : `tenant` remis dans le `with()` de la liste rend AC2 rouge ; le bloc
  de la liste non borné rend AC3 rouge ; `load('tenant')` remis dans un geste rend AC5 rouge pour ce geste.

## Hors périmètre

- Décider si le bailleur doit lire le téléphone et l'e-mail du locataire : ce ticket rend la réponse fidèle à la
  demande, il ne change pas les droits de `CustomerResource`.
- `GET /api/leases/{id}` (TCK-2780) et `GET /api/property-visits` (TCK-2779).
- `GroupContextLeaseResource` (contexte de conversation), qui ne passe pas par `LeaseResource`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
