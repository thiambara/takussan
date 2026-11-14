---
id: TCK-2780
title: "GET /api/leases/{id} : le locataire n'est rendu que sous `include=tenant`, et seulement avec les champs demandés"
status: todo
phase: P2
family: full
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-14
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

- [x] `LeaseController::show()` : `tenant` sort de la liste chargée d'office et n'est chargé que sous
  `include=tenant`.
- [x] `CustomerResource` (ou une méthode partagée) : lecture de `fields[customers]` qui garde `id`, comme
  `AppNotificationResource::requestedFields()`. Elle est appliquée au bloc `tenant` du bail.
- [x] Inventaire des appelants front de `GET /api/leases/{id}` (`cheminApi\`/api/leases/${…}\``). Pour chacun : ce
  qu'il lit du locataire, puis `include` et `fields` réduits à cela.
- [x] Le commentaire de `useContexteDuBail` est réécrit : l'écart qu'il consigne est fermé.
- [x] Tests `BailLocataireALaDemandeTest`, pour chacun des quatre lecteurs :
  - sans `include=tenant` : pas de clé `tenant` ;
  - avec `include=tenant&fields[customers]=id,first_name,last_name` : ni `phone` ni `email` dans le bloc.

## Critères d'acceptation

- [x] AC1 — `GET /api/leases/{id}` sans `include` ne contient pas la clé `tenant`, pour chacun des quatre lecteurs.
  Preuve : `BailLocataireALaDemandeTest::test_sans_include_la_cle_tenant_est_absente` (sans `include`, `include=property`,
  `include=property,landlord,agent` ; ni le téléphone ni l'e-mail nulle part dans la réponse).
- [x] AC2 — `GET /api/leases/{id}?include=tenant&fields[customers]=id,first_name,last_name` rend un bloc `tenant`
  aux seules clés `id`, `first_name` et `last_name`. Le test vérifie que `phone` et `email` sont **absents** : il ne
  se contente pas de compter les clés.
  Preuve : `test_les_champs_demandes_bornent_le_bloc` (`assertArrayNotHasKey` puis le bloc exact), et
  `test_une_cle_demandee_n_ouvre_aucun_droit` (le bailleur qui demande la pièce, le contact d'urgence et le budget ne
  reçoit que `id` et `phone`).
- [x] AC3 — `include=tenant` sans `fields` rend le même bloc qu'aujourd'hui, à l'instantané.
  Preuve : `test_sans_fields_le_bloc_est_celui_d_avant` — les clés de chaque lecteur, relevées sur l'arbre d'avant le
  changement (vert sur l'arbre d'avant, AC1 et AC2 rouges), et l'égalité avec le bloc de la liste.
- [x] AC4 — Le parcours « Démarrer » un état des lieux, puis la fiche du bail, n'affichent aucune régression. Leurs
  tests vitest restent verts, et le réseau d'un « Démarrer » ne contient plus le téléphone ni l'e-mail du locataire.
  Preuve : `components/leases`, `components/inventory/terrain`, `components/property-dashboard/fiche` et
  `lib/queries/__tests__` verts ; « Démarrer » envoie `include=tenant,property&fields[customers]=id,first_name,last_name`
  (`inventory.tck-2648`) ; `test_la_requete_de_demarrer_ne_porte_aucune_coordonnee_du_locataire` joue cette requête
  exacte pour les quatre lecteurs, signature du locataire comprise, et ne trouve son téléphone ni son e-mail nulle part
  dans la réponse. Relevé par les tests, pas au navigateur.
- [x] AC5 — Vérifié par ablation. Un `show` qui recharge `tenant` d'office rend AC1 rouge. Un bloc qui ignore
  `fields` rend AC2 rouge. Preuve : ablations a1 à a6 et f1 à f4, dans les notes.

## Hors périmètre

- Décider si le bailleur doit lire le téléphone du locataire de son bail : ce ticket rend la réponse fidèle à la
  demande, il ne change pas les droits de `CustomerResource`.
- `GET /api/property-visits` : voir TCK-2779.

## Notes d'implémentation

**La forme lue : `fields[customers]`** (le nom de la table). Mesuré le 2026-11-14 sur la liste
(`GET /api/leases?include=tenant`, lecteur : le personnel) :

- `fields[customers]=id,first_name` → 200, mais le bloc `tenant` reste **entier** : spatie cherche les champs d'une
  relation incluse sous le nom de la relation au pluriel (`tenants`, `convert_relation_table_name_strategy` à `null`) ;
- `fields[tenants]=…` et `fields[tenant]=…` → 400 (`allowedFields` ne connaît que `customers.*`).

La liste accepte donc `fields[customers]` et le valide, sans qu'il borne le locataire. La fiche lit la même clé, et
elle la fait valoir. Le bornage de la liste est hors de ce ticket (écart noté au rapport).

**Pourquoi une décision du contrôleur, et pas `whenLoaded`.** `LeasePolicy::view` lit `$lease->tenant` pour
reconnaître le locataire, ce qui charge la relation avant le rendu. `LeaseResource::avecLocataire(bool, ?champs)`
porte la décision du contrôleur ; la liste garde `whenLoaded` (`locataire === null`). Ablation a2 : sans cette
décision, AC1 rougit même avec `tenant` retiré de la liste chargée d'office.

**Le bornage.** `CustomerResource::champsDemandesDuBloc()` lit `fields.customers` par `ParametreUnique` (une liste
`fields[customers][]=` vaut absente, bloc entier) et ajoute `id`. `borneeAuxChamps()` borne le rendu APRÈS les gardes,
le locataire étant chargé entier : une clé demandée que la garde retire reste absente.

**Appelants front de `GET /api/leases/{id}`** (inventaire refait : `leases-file.ts` appelle la LISTE, pas le show) :

| Appelant | Ce qu'il lit du locataire | Requête |
|---|---|---|
| `useLease` sous `LeaseDetail` (fiche du bail : `LeaseDetail`, `gestes.ts`, `FeuilleDeRevision`, `AbandonnerLeBrouillon`) | `id`, `user_id`, `first_name`, `last_name`, `phone`, `email` (repli des initiales) | `useLease(id, { avecLocataire: true })` : `include=…,tenant&fields[customers]=` `CHAMPS_DU_LOCATAIRE_DE_LA_FICHE` |
| `useLease` sous `useLocationDuBien` (onglet « Location » du bien) | rien | inchangé, sans `tenant` |
| `useContexteDuBail` (« Démarrer ») | `first_name`, `last_name` | `include=tenant,property&fields[customers]=id,first_name,last_name` |
| `useContexteDuBail(…, { avecLocataire: false })` (parcours, récapitulatif) | rien (le nom vient de l'état des lieux, `inventories.tenant_id` non nul) | inchangé |

Avant ce ticket, `useLease` ne demandait pas `tenant` et le recevait quand même : sans la mise à jour de
`LeaseDetail`, la fiche perdait le nom, le téléphone et le blocage « sans compte » de l'envoi en signature.

**Garde et documentation.** `show-sans-fields.garde.test.ts` admet une seconde exception, étroite : vers
`/api/leases/${id}`, `fields: { customers: CHAMPS_DU_LOCATAIRE_… }` seul, et tant que `LeaseController.php`
appelle `CustomerResource::champsDemandesDuBloc($request)` (témoins). `docs/spatie-query-builder.md` le dit.

**Tests de l'API mis à jour** : `CustomerIdNumberEncryptionTest` (deux lectures) et `CustomerScopeTest` (deux
lectures) lisaient `data.tenant` d'un show sans `include` ; ils demandent désormais `include=tenant`, leurs
assertions de non-fuite inchangées.

**Ablations** (une à la fois, fichier restauré et md5 vérifié) :

- a1 — `tenant` rendu d'office (`when(true)`) : AC1 rouge.
- a2 — le show sans la décision du contrôleur (retour à `whenLoaded`) : AC1, AC2 et « aucun droit » rouges.
- a3 — `borner()` rend tout : AC2, « aucun droit » et la requête de « Démarrer » (AC4) rouges.
- a4 — `id` non ajouté aux champs : AC2 rouge.
- a5 (sonde, pas un mutant tué) — locataire lu en `SELECT` partiel des champs demandés : reste VERT. Attendu : `CustomerResource` relit la fiche
  quand les traits jugés manquent (`ficheJugeable`, TCK-2759), ses gardes ne dépendent pas du `SELECT`.
- a6 — garde `litLaFiche` ouverte : « aucun droit » et AC3 rouges.
- f1 — « Démarrer » sans `fields` : `inventory.tck-2648` rouge.
- f2 — la fiche sans `avecLocataire` : `LeaseDetail.fiche.tck-2645` rouge.
- f3 — `useLease` sans `fields` : `leases.locataire.tck-2780` rouge.
- f4 — l'exception de la garde étendue à tout show : ses témoins rougissent.
