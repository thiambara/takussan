---
id: TCK-488
title: "La fiche d'un bien ne lit la matrice de pertinence qu'à moitié : une tâche impossible dans l'aperçu, des équipements domestiques sur un terrain à l'édition"
status: done
phase: P1
family: front
estimate: S
wave: 55
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-464, TCK-469]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [front, properties, ux, i18n, bug, formulaire]
---

## Objectif utilisateur

Un agent qui ouvre la fiche d'un appartement ne voit pas, dans sa liste de tâches restantes, un
champ qu'aucun écran ne lui permet de renseigner ; et un bailleur qui édite un terrain ne s'y voit
pas proposer une machine à laver.

## Contrat de données

**Rien à créer, rien à demander de plus.** `field-matrix.ts` répond déjà à « ce champ existe-t-il
pour ce couple *(type, contrat)* ? », et `DASHBOARD_PROPERTY_DETAIL_FIELDS` demande déjà les
colonnes concernées. Le trou est que **deux écrans de la même page lisent le bien sans consulter la
matrice**, alors que TCK-464 la déclare partagée par « la création, l'édition et la sérialisation ».

**Les quatre écarts, mesurés le 2026-08-30 :**

| # | Où | Ce que le code fait | Ce que la matrice dit |
|---|---|---|---|
| 1 | `PropertyOverviewPanel.tsx:49-52` | L'item de checklist « titre foncier » est construit **inconditionnellement**, avec `target: 'edit'` | `field-matrix.ts:86` — `title_type` est **sans objet** pour `apartment`, `studio`, `room`, `office`, `shop` |
| 2 | `PropertyForm.tsx:527` | La section Équipements n'est gardée que par `tags.length > 0` | `field-matrix.ts:96` — `tag_ids` est sans objet pour `land`, `garage`, `parking`. Le parcours, lui, la garde (`StepCaracteristiques.tsx:141`) |
| 3 | `PropertyForm.tsx:414` | Le libellé de surface est figé à `t('fields.area')` | `areaLabelKey()` distingue surface de **parcelle** et surface **habitable** — le parcours l'applique (`StepCaracteristiques.tsx:70`) |
| 4 | `PropertyForm.tsx:196-197` | `setPropertyTagsAction` n'est appelé que si la liste est **non vide**, et son résultat n'est **pas lu** | Contrainte 3 de TCK-464 : « leur échec doit être affiché ». Le parcours teste `r.ok` (`PropertyWizard.tsx:234-238`) |

**L'écart n°1 se referme sur lui-même.** Sur un appartement, l'aperçu affiche la tâche, l'agent
clique, arrive sur l'onglet d'édition — **le champ n'y est pas**. Et si la valeur avait été posée
avant que le type ne change, le premier enregistrement depuis l'édition la met à `null`
(mode `erase`, TCK-469) : l'item bascule de fait à *non fait*, sans aucune affordance de retour.

**L'écart n°4 en cache un second, plus coûteux, et il est mesurable sur une base semée.**
`toDefaults` compose `tag_ids` à partir de **tous** les tags du bien (`PropertyForm.tsx:91`), alors
que l'écran n'affiche que les tags `amenity` (`app/(dashboard)/app/properties/[id]/page.tsx:75`).
Or `SyncPropertyTagRequest::rules()` n'accepte que des ids de type `amenity`, et
`FilterCoverageSeeder` attache des tags de type `feature` aux biens
(`FilterCoverageSeeder.php:76,291`). Un bien porteur d'un tag `feature` fait donc **422 sur l'appel
des tags à chaque enregistrement**, sans que rien ne s'affiche — parce que le résultat n'est pas lu.
⚠ Le correctif ne peut pas se contenter d'envoyer la liste telle quelle : **il ne doit pas détacher
les tags que l'écran n'a jamais montrés.**

**Les deux clés i18n à créer.** `property.form.fields` ne porte que `area` ; `areaLand` /
`areaLiving` n'existent que sous `property.wizard.fields`. La fonction `areaLabelKey()` rend une clé
**relative** (`'fields.areaLand' | 'fields.areaLiving'`), donc utilisable telle quelle une fois les
deux entrées ajoutées au dictionnaire de l'édition.

## Direction UX / Artistique

**Rien de neuf à dessiner : de la soustraction.** Un écran qui ne propose pas ce qui n'a pas lieu
d'être est plus court, pas plus pauvre — c'est la même intention que le parcours de publication.

**La checklist doit rester honnête sur ce qu'elle compte.** Un bien dont le type ne comporte pas de
statut foncier n'a pas une tâche en moins *à faire*, il a une tâche **qui n'existe pas** : le total
affiché suit, il ne reste pas calé sur quatre items dont l'un serait inatteignable.

**Le vocabulaire de la surface est celui du parcours, au caractère près.** Deux écrans qui nomment
la même grandeur différemment font douter de la donnée, pas du libellé.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md).

## Contraintes strictes (métier)

1. **La règle de pertinence reste unique.** Aucune condition sur `type` ou `contract_type` ne
   s'écrit en clair dans ces écrans : ils interrogent `field-matrix.ts`. Une deuxième version de la
   règle est celle qui finit par diverger (en-tête de la matrice).
2. **Aucune valeur de pertinence ne change.** Ce ticket branche des lecteurs sur la matrice ; il ne
   rouvre pas l'arbitrage de TCK-464 sur *quel* champ vaut pour *quel* type.
3. **Un enregistrement ne détache jamais un tag que l'écran n'a pas montré.** Les tags non-`amenity`
   d'un bien survivent à une édition, quelle que soit la liste cochée.
4. **Un échec d'écriture des tags s'affiche, et il dit ce qu'il est** : le bien, lui, est enregistré
   (même exigence que la contrainte 3 de TCK-464 pour la création).
5. **Les libellés appartiennent au front** (principe non négociable n° 5) : `fr`, `en`, `wo`, et les
   deux nouvelles clés alignées **au caractère près** sur celles du parcours.

## Delta à produire

**Frontend — intentionnel**

- [x] La checklist de l'aperçu ne construit l'item « titre foncier » que si la matrice le déclare
      pertinent pour le couple *(type, contrat)* du bien
- [x] La section Équipements de l'édition suit `isFieldRelevant('tag_ids', …)`, comme l'étape
      correspondante du parcours
- [x] Le libellé de surface de l'édition vient d'`areaLabelKey()` ; les deux clés manquantes sont
      ajoutées au dictionnaire de l'édition en `fr` / `en` / `wo`
- [x] L'édition enregistre la liste des équipements **même vide**, sans jamais détacher les tags
      d'un autre type que ceux qu'elle affiche, et affiche l'échec s'il y en a un
- [x] Tests : la conditionnalité de l'item de checklist, la section d'équipements absente sur un
      terrain, le libellé de surface par type, le décochage du dernier équipement, et le bien
      porteur d'un tag non-`amenity` qui traverse un enregistrement intact

## Critères d'acceptation

- [x] **AC1** — Sur un appartement, l'aperçu ne propose plus la tâche « titre foncier », et le
      compte de tâches restantes le reflète. Sur une maison, il la propose toujours.
- [x] **AC2** — À l'édition d'un terrain, d'un garage ou d'un parking, aucune section d'équipements
      n'est rendue. *Ceci étend l'AC2 de TCK-464, qui exigeait déjà la vérification « à la création
      et à l'édition ».*
- [x] **AC3** — À l'édition, un terrain nomme sa surface comme le parcours la nomme, et un
      appartement aussi ; les deux libellés sont identiques à ceux du parcours, caractère pour
      caractère, dans les trois langues.
- [x] **AC4** — Décocher le dernier équipement puis enregistrer laisse le bien sans équipement.
      *Ce test échoue sur le code actuel*, où la liste vide n'est jamais envoyée.
- [x] **AC5** — Un bien portant un tag qui n'est pas un équipement traverse un enregistrement depuis
      l'édition sans perdre ce tag et sans produire d'erreur. *Ce test échoue sur le code actuel*
      (422 avalé).
- [x] **AC6** — Un échec de l'écriture des équipements est affiché, et le message ne laisse pas
      croire que la modification du bien a échoué.
- [x] **AC7** — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts ; aucune chaîne affichée en
      dur hors dictionnaire.

## Hors périmètre

- Les valeurs de la matrice elles-mêmes (quel champ vaut pour quel type) — arbitrées par TCK-464.
- L'affichage de `available_from` — TCK-489.
- Le comparateur et la recherche publique — TCK-491.
- Les cartes de liste et la fiche publique : leurs gardes de véracité (`> 0`, filtre sur
  `null | undefined | ''`) les protègent déjà d'une valeur héritée non pertinente.
- Le chemin d'écriture des tags côté API : `sync()` accepte déjà une liste vide
  (`tag_ids` → `present|array`), aucune modification backend n'est nécessaire.

## Notes d'implémentation

**AC5 a exigé une modification BACKEND, que la section « Hors périmètre » de ce ticket excluait.**
Elle l'excluait sur une prémisse vraie mais incomplète : `sync()` accepte bien une liste vide, mais
il **remplace la table de liaison entière** — et `SyncPropertyTagRequest` n'accepte que des ids
`amenity`. Un tag `feature` ne pouvait donc ni être renvoyé par l'appelant (422) ni survivre à
l'appel (détaché). *La contrainte 3 était hors d'atteinte du front seul.*
`PropertyTagController::sync()` reconduit désormais les tags hors de la portée de sa validation ;
les six tests existants de `PropertyTagsTest` restent verts sans modification, deux les rejoignent.

**Les deux correctifs de l'écart n°4 sont indissociables** : filtrer `toDefaults` sur les `amenity`
sans le correctif backend aurait supprimé le 422 en détachant les tags `feature` — le défaut
déplacé, pas fermé.

**Les tags ne partent pas du tout quand la matrice les déclare sans objet** (terrain, garage,
parking). Reconduction de TCK-469, qui laisse délibérément `tag_ids` hors de sa table d'effacement :
un changement de type ne détache rien.

**`fields.areaLand` / `areaLiving` ont été copiées du parcours par programme**, avec une assertion
d'égalité au caractère près sur les trois locales avant insertion — AC3 porte sur cette identité,
la relire à l'œil n'aurait rien prouvé.
