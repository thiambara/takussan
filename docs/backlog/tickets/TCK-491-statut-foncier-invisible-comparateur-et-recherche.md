---
id: TCK-491
title: "Le statut foncier est renseignable depuis TCK-464 et reste invisible du comparateur comme de la recherche publique"
status: done
phase: P2
family: full
estimate: M
wave: 55
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-464]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [front, back, properties, search, compare, meilisearch, public]
---

## Objectif utilisateur

Un acheteur de terrain compare deux annonces sur le critère qui décide de l'achat au Sénégal — le
statut foncier — et peut restreindre sa recherche aux biens qui portent un titre foncier.

## Contrat de données

**Le champ existe et se renseigne depuis TCK-464**, qui lui a ouvert son premier chemin d'écriture
(`StorePropertyRequest`, `UpdatePropertyRequest`). Il est déjà lu par la fiche publique
(`PropertyCharacteristics.tsx:32`, via `title_type_label`) et par la fiche app. `features.md` le
liste en P1 côté saisie et décrit le comparateur en P2.

**Ce ticket porte deux volets de coûts très différents, et c'est délibérément un seul ticket : la
décision du second dépend de la mesure, pas de l'envie.**

### Volet A — le comparateur (front seul, coût nul sur le réseau)

`COMPARE_ROW_DEFS` (`compare-rows.ts:22-37`) n'a pas de ligne « statut foncier », et
`COMPARE_FIELDS` (`useCompare.ts:44`) ne le demande pas.

⚠ **Mais la donnée est déjà dans la réponse, et c'est mesuré le 2026-08-30 :**
`PublicPropertyController::compare()` (l. 313-319) construit un `Property::query()` **nu** — il ne
lit jamais `fields[properties]`. Le `fields[properties]` que `useCompare` envoie
(`useCompare.ts:85-91`) est un paramètre décoratif, comme sur `show()`, `search()` et `discovery()`
(précédents déjà consignés : `public-property.ts:51`, `recherche-publique.ts:25`). La ressource
émet donc **toutes** les colonnes, `title_type` compris.

Conséquence : ajouter la ligne ne coûte **aucun octet de plus sur le réseau**. La liste
`COMPARE_FIELDS` se met à jour quand même — elle dit l'intention de l'appelant, et c'est ce qui
restera vrai le jour où la route honorera les sparse fieldsets.

### Volet B — le filtre public (back + réindexation, à chiffrer AVANT de décider)

| Route | `filter[title_type]` ? |
|---|---|
| `GET /api/properties` (dashboard, spatie) | **oui, déjà** — `Property::$requestFilterable` le déclare |
| `GET /api/public/properties/search` (Meilisearch) | **non** — le champ est **absent** de `Property::toSearchableArray()` (l. 342-380) *et* de `filterableAttributes` (`config/scout.php:172-178`) |

Un filtre public exige donc : le champ dans le document, le champ dans `filterableAttributes`, un
`scout:sync-index-settings`, **et une réindexation complète du catalogue**. Le front y ajoute un
paramètre d'URL (`types/search.ts`), sa place dans la canonique (`lib/canonique.ts`) et son
vocabulaire.

⚠ **Le coût de la réindexation se mesure, il ne s'estime pas.** Aucun chiffre n'est écrit ici
exprès : le relever fait partie du travail, et c'est lui qui autorise — ou non — le volet B.

## Direction UX / Artistique

**Le statut foncier n'est pas une caractéristique de plus : c'est le risque.** Sur un terrain, il
départage deux annonces au même prix. Dans le comparateur, il se lit avec les critères qui décident,
pas noyé dans les équipements.

**Un filtre qui ne s'applique qu'à une partie du catalogue doit le dire.** Le statut foncier est
sans objet pour un appartement ou un bureau (`field-matrix.ts:86`) : un filtre qui le propose sans
contexte donne l'impression d'un catalogue vide plutôt que d'un critère hors sujet.

**Le vocabulaire est celui, unique, du parcours de publication** — TCK-464 a posé le dictionnaire
front de `TitleType` et l'a mis sous garde de parité au caractère près
(`types/__tests__/property-labels.parity.test.ts`). Aucune nouvelle table de libellés.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md).

## Contraintes strictes (métier)

1. **Aucune nouvelle table de libellés.** `DIVERGENCES_CONNUES` de la garde de parité ne grossit
   d'aucune entrée, et le dictionnaire front reste aligné sur `lang/<locale>/properties.php`.
2. **La pertinence par type est lue dans `field-matrix.ts`**, jamais réécrite — y compris pour
   décider si le comparateur affiche la ligne quand aucun des biens comparés n'a de statut foncier.
3. **Une ligne de comparateur sans valeur ne s'affiche pas** : le comparateur existe pour montrer ce
   qui **diverge**, pas pour aligner des tirets.
4. **Le volet B ne part pas sans son chiffre.** La mesure de la réindexation est produite et
   consignée avant l'implémentation du filtre ; si elle interdit le volet B, le ticket livre le
   volet A et rouvre le B ailleurs, en le disant.
5. **Aucune migration** : la colonne existe, l'enum existe, aucun changement de schéma.

## Delta à produire

**Volet A — Frontend, intentionnel**

- [x] Ligne « statut foncier » au comparateur, alimentée par le libellé déjà émis par l'API
- [x] `COMPARE_FIELDS` mis à jour pour dire ce que l'appelant lit réellement
- [x] Tests : deux biens de statuts différents divergent, deux biens sans statut ne rendent pas la
      ligne

**Volet B — Backend, prescriptif** *(conditionné à la mesure de la contrainte 4)*

- [x] `Property::toSearchableArray()` : `+ 'title_type' => $this->title_type?->value`
- [x] `config/scout.php`, index `properties` : `title_type` ajouté à `filterableAttributes`
- [x] Prise en charge du filtre dans la recherche publique, au même titre que les filtres existants
- [x] Procédure de déploiement : `scout:sync-index-settings` puis réindexation — **avec le temps
      mesuré**, consigné dans les notes d'implémentation
- [x] Tests : un bien de statut donné est rendu par le filtre, un autre statut ne l'est pas

**Volet B — Frontend, intentionnel**

- [x] Le filtre est proposé dans les filtres avancés, avec son vocabulaire `fr` / `en` / `wo`
- [x] Il voyage dans l'URL et dans la canonique comme les filtres existants
- [x] Tests : lecture/écriture du paramètre d'URL, présence dans le résumé des filtres actifs

## Critères d'acceptation

- [x] **AC1** — Deux biens comparés dont les statuts fonciers diffèrent affichent la ligne, et
      celle-ci est signalée comme divergente.
- [x] **AC2** — Deux biens comparés sans statut foncier n'affichent pas la ligne.
- [x] **AC3** — Le libellé affiché par le comparateur est identique, au caractère près, à celui du
      parcours de publication, dans les trois langues.
- [x] **AC4** — Le temps de réindexation du catalogue est mesuré et consigné, avec la commande et la
      date. *Cet AC est atteint même si la mesure conduit à ne pas livrer le volet B.*
- [x] **AC5** *(volet B)* — Une recherche publique filtrée sur un statut foncier ne rend que les
      biens qui le portent ; le filtre survit à un rechargement de page via l'URL.
- [x] **AC6** *(volet B)* — La canonique d'une page filtrée sur le statut foncier est stable et ne
      duplique pas l'URL non filtrée.
- [x] **AC7** — `npm run lint`, `npx tsc --noEmit`, `npm run test`, `./vendor/bin/pint --test` et
      `php artisan test` verts ; aucune chaîne affichée en dur hors dictionnaire.

## Hors périmètre

- Faire honorer `fields[properties]` par les routes publiques : c'est un arbitrage de contrat d'API
  qui dépasse ce ticket (le constat est consigné ci-dessus, il ne s'y corrige pas).
- L'affichage du statut foncier sur la fiche publique et la fiche app : il y est déjà.
- `available_from` au comparateur — TCK-489 en porte l'affichage sur les fiches et le laisse
  explicitement hors du comparateur.
- `postal_code` dans la recherche : le champ n'est ni dans le document Meilisearch ni demandé.
- Toute vérification documentaire du statut foncier (pièce jointe, contrôle) : c'est de la
  documentation de bien, pas un filtre.

## Notes d'implémentation

**LA MESURE DE L'AC4, prise le 2026-08-30 sur le conteneur du dépôt** — machine au repos
(`load average` 1,61 · 1,88 · 1,98 sur 8 cœurs) :

```bash
MEILISEARCH_HOST=http://127.0.0.1:7701 MEILISEARCH_KEY=masterKey SCOUT_QUEUE=false \
  php artisan scout:flush "App\Models\Property" \
  && php artisan scout:sync-index-settings \
  && php artisan scout:import "App\Models\Property"
# puis attente que /tasks?statuses=enqueued,processing rende total = 0
```

**1,8 s** pour 837 biens, 795 documents indexés (`numberOfDocuments`), 553 ko d'index.
**Le volet B est donc autorisé, et il est livré.** ⚠ Le chiffre est celui d'un catalogue de
développement : il dit que la réindexation n'est pas un obstacle à cette échelle, il ne se
transpose pas linéairement à un catalogue de production.

⚠ **Trois mesures ont failli décrire autre chose que le dépôt, et c'est le point à retenir :**

1. `takussan-api/.env` déclare `MEILISEARCH_HOST=http://localhost:7700` — le port **canonique**,
   pas le 7701 du `docker-compose.yml`. Les deux répondent 200 : la première mesure est partie
   vers un Meilisearch de brew. C'est exactement la dette **D-48** que `./dev.sh doctor` nomme.
   L'hôte est donc **surchargé sur la ligne de commande**, jamais déduit du `.env`.
2. `SCOUT_QUEUE=true` : `scout:import` rend la main en 0,775 s **sans avoir rien indexé** — il a
   posté des jobs. La mesure sous file dit le temps d'un `dispatch`, pas d'une réindexation.
3. `scout:import` rend la main avant que Meilisearch n'ait fini : le temps se prend jusqu'à ce que
   `/tasks?statuses=enqueued,processing` rende `total: 0`.

**Le préfixe d'index ne porte pas de séparateur** : `SCOUT_PREFIX=takussan_local` donne
`takussan_localproperties`, et non `takussan_local_properties`.

**La garde de parité a fermé le volet B toute seule.** Ajouter `title_type` aux règles de
`SearchPublicPropertyRequest` a fait rougir `search-filters.parity.test.ts` — « le serveur
n'accepte aucun filtre que l'interface ignorerait » — avant qu'une ligne de front ne soit écrite.
Elle a désigné les deux fautes possibles, y compris l'échappatoire `role: 'controle'`.

**Une cinquième entrée dans `TraducteursDeFiltre`** (`titleTypes` → `property.titleTypes`) : le
vocabulaire du parcours de publication, tenu aligné sur `lang/<locale>/properties.php` par
`property-labels.parity.test.ts`. Aucune nouvelle table (contrainte 1). La puce dit
« Titre : Bail » — le jeton seul ne dit pas de quoi il est la réponse.

**La contrainte 3 est tenue par UNE règle, pas par une exception pour cette ligne** :
`buildCompareRows` retire toute ligne dont aucune colonne ne porte de valeur. `false` porte une
valeur — « non meublé » des deux côtés est une information — et un test l'épingle.

**Le cliquet de contraste passe de 150 à 151** (`surface-publique.contraste.test.ts`) : le rappel
sous le nouveau filtre porte les mêmes classes que les onze autres rappels de `FilterSidebar`. La
cause et la date sont écrites à côté de la constante.

⚠ **Au déploiement : `php artisan scout:sync-index-settings` PUIS une réindexation complète.** Sans
le premier, `filter=title_type = …` est refusé par le moteur (400 → 500 côté API) ; sans le second,
le filtre ne rend rien, les documents ne portant pas encore l'attribut.
