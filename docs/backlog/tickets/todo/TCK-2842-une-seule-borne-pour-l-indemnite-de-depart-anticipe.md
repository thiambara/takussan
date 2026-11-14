---
id: TCK-2842
title: "Une seule borne pour l'indemnité de départ anticipé : catalogue, bail et lecture à l'exécution"
status: todo
phase: P2
family: back
estimate: S
wave: 88
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2832]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#30-setting-"
tags: [back, leases, settings, validation]
---

## Objectif utilisateur

L'administrateur qui règle l'indemnité de départ anticipé de son agence (TCK-2832) n'enregistre
qu'une valeur qu'un bail neuf reprendra telle quelle. Aujourd'hui, il peut enregistrer 18 mois, et le
bail neuf en préremplit 12 sans le dire.

## Contexte (relevé au HEAD c488ac299, 2026-11-14)

La clé `lease.early_termination_penalty_months` a trois bornes différentes selon l'endroit :

| Lieu | Borne | Où |
|---|---|---|
| Catalogue (écriture du réglage) | `min:1`, `max:24` | `app/Domain/Settings/EditablePlatformSettings.php` (entrée de la clé) |
| Préremplissage du bail neuf | au plus 12 | `LeaseDefaults::EARLY_TERMINATION_MAX_MONTHS` |
| Validation du bail | `between:0,12` | `StoreLeaseRequest`, `UpdateLeaseRequest`, `RenewLeaseRequest` |
| Lecture à l'exécution | plafond du catalogue (24), plancher > 0 | `EarlyTerminationService::resolvePenaltyMonths()` (`EditablePlatformSettings::clamp`) |

Le 0 est traité de deux façons :
- le bail l'admet (« aucune indemnité »), et `penaltyMonthsFor()` exécute 0 pour un bail figé à 0 ;
- le catalogue le refuse (`min:1`), et une ligne d'agence à 0 ne compte pas comme un réglage : le
  global reprend la main (r6, `ScopedSetting::numericAgencyValue`).

Une agence ne peut donc pas régler « pas d'indemnité » par défaut, alors qu'un bail peut le porter.

TCK-2832 a livré l'écran avec les bornes du catalogue (1-24). L'aide de la carte dit qu'un bail neuf
en reprend 12 au plus.

## Intention

Poser **une seule** borne, déclarée **à un seul endroit** (la règle du catalogue), et la faire lire
par les trois autres lieux : le préremplissage, la validation du bail et la lecture à
l'exécution. La recommandation est 12, la borne que les baux portent déjà.

Trancher le 0 dans le même mouvement, avec une seule réponse pour les deux lieux :
- soit 0 devient un réglage d'agence valable (« aucune indemnité ») : le catalogue admet `min:0`, et
  `numericAgencyValue` ne le traite plus comme une absence pour cette clé ;
- soit le bail cesse de l'admettre.

La première option garde ce que les baux portent déjà. La décision s'écrit dans le ticket avant
l'implémentation.

**Avant de resserrer**, relever les lignes `settings` existantes de cette clé hors de la borne
retenue (portée agence et plateforme, préproduction comprise). La migration ou la commande qui les
ramène dans la borne se décide sur ce relevé, et se consigne dans le ticket avec les ids.

## Critères d'acceptation

- [ ] AC1 — Le relevé des lignes hors borne est écrit dans le ticket (environnement, ids, valeurs)
  avant tout changement de règle.
- [ ] AC2 — La borne est déclarée dans la règle du catalogue seulement. `StoreLeaseRequest`,
  `UpdateLeaseRequest`, `RenewLeaseRequest` et `LeaseDefaults` la lisent. Une ablation qui change la
  borne du catalogue fait changer la validation du bail (test rouge si l'un des lieux garde sa
  constante).
- [ ] AC3 — Le 0 a le même sens partout : une agence qui enregistre la valeur retenue pour « aucune
  indemnité » obtient un bail neuf prérempli à cette valeur, et la résiliation l'exécute.
- [ ] AC4 — Un réglage d'agence au-dessus de la borne est refusé avec le message du champ (422), et
  `GET /api/settings/lease` rend la borne neuve.
- [ ] AC5 — Une ligne écrite avant la règle et restée hors borne est lue à l'exécution dans la borne
  (pas d'indemnité supérieure à ce que le bail neuf aurait porté).

## Hors périmètre

- Le texte de l'écran de TCK-2832 : il lit les bornes de l'API. Seule l'aide « un bail neuf en
  reprend 12 au plus » devient inutile, et se retire si la borne retenue est 12.
- Les baux déjà signés : leur indemnité est figée dans leur contrat (VERIF-596).
