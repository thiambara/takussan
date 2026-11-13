---
id: TCK-2784
title: "`customers.last_contacted_at` à la microseconde : deux contacts dans la même seconde ne perdent plus le canal du second"
status: todo
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, crm, migration, postgresql, precision, suite-de-tck-2766]
---

## Objectif utilisateur

Le pipeline dit par quel canal s'est fait le **dernier** contact d'une fiche, même quand deux contacts ont été
notés dans la même seconde.

## Contrat de données

**Décision.** Porteur, 2026-11-13, liste du soir n° 28 : ticket de suivi. Relevé s (TCK-2766 q1, préexistant) :
« aucun parcours du front ne le déclenche ; correctif possible timestamp(6) ».

**Constat, relu sur l'arbre du 2026-11-13.** Le défaut a deux causes, et il faut corriger les deux.

1. **La colonne est à la seconde.** `2026_11_11_130300_add_last_contacted_at_to_customers` écrit
   `$table->timestamp('last_contacted_at')`. Laravel 13 prend `Schema\Builder::$defaultTimePrecision = 0` :
   la colonne est un `timestamp(0) without time zone`. PostgreSQL **arrondit** à la seconde la plus proche, il ne
   tronque pas (12:00:00.6 devient 12:00:01).
2. **La valeur liée est tronquée.** `ContactGestureService::touchCustomer()` écrit par
   `->toBase()->update([...])`, sous la garde `last_contacted_at < $at`. Le `Carbon` lié passe par
   `Grammar::getDateFormat()` = `'Y-m-d H:i:s'` : la microseconde est perdue avant même d'arriver à la base.

Le second contact de la même seconde voit donc `last_contacted_at < $at` faux. Il n'écrit rien, et
`last_contact_channel` garde le canal du premier. Avec l'arrondi, un contact à .6 s peut même porter une heure
postérieure à un contact réel de la seconde suivante.

`last_contact_channel` (`2026_11_13_100000_add_last_contact_channel_to_customers`) est écrit par la même requête,
donc jamais en désaccord avec la colonne, mais il hérite de la même perte.

## Contraintes strictes (métier)

- **PostgreSQL seul** (ADR-0020). La migration se pense pour lui, et son `down()` est écrit juste (principe 4 de
  CLAUDE.md).
- `timestamp(6)` et une valeur liée à la microseconde : l'un sans l'autre ne corrige rien.
- L'index `customers_agency_last_contacted_idx` (`agency_id`, `last_contacted_at`) est conservé. Le changement de
  type le reconstruit.
- Le tri `sort=last_contacted_at` et `CustomerLastContactedSort` gardent leur sens et leur ordre pour les données
  existantes, toutes à la seconde.
- Le front ne lit `last_contacted_at` qu'en ISO (`BaseResource::iso`). La sortie sur le fil ne change pas de forme.

## Delta à produire

- [ ] Migration `change_last_contacted_at_precision_on_customers` :
  - `up()` : `$table->timestamp('last_contacted_at', 6)->nullable()->change()` ;
  - `down()` : `$table->timestamp('last_contacted_at', 0)->nullable()->change()`. Ce retour est **avec perte** : la
    microseconde est arrondie par PostgreSQL, et le docblock le dit.
- [ ] `ContactGestureService::touchCustomer()` lie `$at` sous la forme `'Y-m-d H:i:s.u'`, en garde **et** en
  valeur écrite. Il ne passe pas par le format de la grammaire.
- [ ] Recensement, dans les notes du ticket, des autres écrivains de `last_contacted_at` (note, visite terminée,
  compte rendu). Chacun passe par `touchCustomer` ou lie à la microseconde.
- [ ] `docs/models-spec.md` § 7 Customer : la ligne `last_contacted_at` dit `timestamp(6)`, par `/sync-specs`
  après fusion (règle 3 du backlog).
- [ ] Test `DernierContactMemeSecondeTest`.

## Critères d'acceptation

- [ ] AC1 — Deux appels à `touchCustomer` sur la même fiche, à 12:00:00.200 (`call`) puis à 12:00:00.700
  (`whatsapp`), laissent `last_contact_channel = whatsapp` et `last_contacted_at = 12:00:00.700000` en base.
- [ ] AC2 — Dans l'ordre inverse (le plus récent écrit d'abord), le canal reste celui du plus récent.
- [ ] AC3 — `information_schema.columns.datetime_precision` vaut 6 pour `customers.last_contacted_at` après `up()`,
  et 0 après `down()`. Le `down()` est rejoué dans le test.
- [ ] AC4 — `sort=last_contacted_at` rend le même ordre qu'avant sur un jeu de fiches à la seconde.
- [ ] AC5 — Vérifié par ablation. Avec la migration seule (valeur liée à la seconde), AC1 est rouge. Avec la liaison
  seule (colonne à la seconde), AC1 est rouge aussi.

## Hors périmètre

- La précision des autres colonnes de date et heure du schéma. Un balayage de `defaultTimePrecision` serait une
  décision structurelle, donc un ADR.

## Notes d'implémentation

_(à remplir par implementing-specs)_
