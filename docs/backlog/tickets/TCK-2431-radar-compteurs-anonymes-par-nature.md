---
id: TCK-2431
title: "Radar : figer chaque jour des compteurs anonymes par nature d'annonceur, pour mesurer la part d'intermédiaires au-delà de la purge"
status: done
phase: P3
family: back
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2393]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, observatoire, adr-0077, adr-0083]
---

## Objectif utilisateur

Le porteur connaît la part d'intermédiaires parmi les annonceurs du marché sur toute la durée de la
collecte, pas seulement sur les 90 derniers jours.

## Contexte

L'observatoire (TCK-2393, [ADR-0083](../../adr/0083-l-observatoire-du-marche.md)) compte les annonceurs par
nature présumée à la lecture. La purge (TCK-2391) remet la nature d'un annonceur sans annonce restante à
`unknown` : la mesure ne porte donc que sur les annonceurs encore porteurs d'annonces non purgées.

## Delta à produire

- [x] Un compteur quotidien anonyme (date, nature, nombre d'annonceurs vus ce jour-là, nombre d'annonces),
      écrit avant la purge, sans identifiant d'annonceur.
- [x] L'observatoire lit ces compteurs pour la part par nature sur une période.

## Critères d'acceptation

- [x] AC1 — La part par nature d'une période passée est la même avant et après la purge.
      `RadarNatureCountsTest::test_la_part_par_nature_d_une_periode_passee_survit_a_la_purge` : horloge figée, trois
      jours comptés, purge planifiée à échéance, un jour de plus compté sur le marché vidé ; la part du 1er au 3 octobre
      est identique, la lecture vivante est tombée à zéro (comptage allumé). Ablation : une purge qui vide les compteurs le
      fait rougir.

## Hors périmètre

- Une offre « pro solo » (ADR-0077 § 7) : décision à part.

## Notes d'implémentation

- **`radar_nature_counts`** (`RadarNatureCount`) : `day` (date, Dakar), `nature`, `advertisers`, `listings`, unique sur
  (`day`, `nature`). Ni horodatation de ligne, ni identifiant, ni lieu, ni prix, ni site ; un test fige la liste des
  colonnes. Les quatre natures s'écrivent chaque jour, zéros compris : un jour compté à zéro se distingue d'un jour non
  compté.
- **Le périmètre est celui de la section vivante `natures`** : `RadarNatureCounter::live()`, que
  `RadarObservatory::natures()` lit désormais aussi. Annonceurs porteurs d'au moins une annonce non purgée et non doublon
  (`duplicate_of_listing_id` nul), et ces annonces ; une annonce sans annonceur ne compte pas.
- **Éteint par défaut** (`radar.nature_counts.enabled`) : voir « Menace » plus bas. Un test lit le défaut du fichier de
  configuration, variable d'environnement absente.
- **Avant la purge** : `radar:count-natures` à 04:13 (Dakar), `radar:purge` à 04:15 ; `RadarPurger::run()` (passage
  global seulement) pose le compte en premier, si bien qu'un passage planifié manqué ne laisse pas la purge effacer avant
  de compter. `insertOrIgnore` sur (jour, nature) : rejouée le même jour, l'écriture garde le PREMIER compte, celui d'avant
  la purge (un `upsert` l'aurait écrasé par celui d'après).
- **Lecture** : section `nature_history` de `GET /api/admin/radar/observatory`, bornée par `filter[since]` et
  `filter[until]` (neuf, ne borne que cette section ; `until < since` → 422). Elle rend `days`, `first_day`, `last_day`
  et, par nature, la somme des annonceurs (« annonceurs-jours ») et des annonces. Le front (onglet Marché, section « Part
  par nature dans la durée ») a sa propre période et sa propre requête.
- **ADR-0083** reçoit un amendement : son §1 (« aucune table d'agrégats ») vaut pour le marché, la nature fait exception.

### Pourquoi une cellule à petit compte ne ré-identifie personne

Une ligne dit seulement : « tel jour, N annonceurs de telle nature présumée portaient M annonces ». Elle ne porte aucune
clé, ni d'annonceur, ni d'annonce, ni de passage, ni de lieu, ni de site, ni d'instant plus fin que le jour : elle ne se
joint à aucune fiche, et une cellule à 1 ne dit pas QUI est cet annonceur. Le jour et la nature sont les deux seules
dimensions, et la nature est une présomption de l'opérateur, pas une donnée de l'annonceur.

### Menace : la différence entre deux jours (vérification adverse, 2026-10-30)

Une ligne seule ne ré-identifie personne ; deux lignes successives, si. Un annonceur dit STOP le jour J : sa ligne est
gardée avec `do_not_contact_at` et l'empreinte HMAC de son numéro, ses annonces sont purgées et sa nature remise à
`unknown`. Le compte de J (04:13) l'incluait, celui de J+1 non : **la différence des deux compteurs rend sa nature
d'avant**, et `do_not_contact_at` donne le jour exact. Le même recoupement vaut pour un annonceur lié à un compte
(`user_id`), par les dates des fiches purgées. D'autres départs ou arrivées le même jour brouillent le calcul ; un jour
calme le rend exact. Reproduit par la vérification sur des cellules de 3 : **ce n'est pas une affaire de petites cellules,
et un seuil k ne la ferme pas.**

Portée : il faut les compteurs (`platform.radar.operate`, ou la base) et les dates de la ligne gardée ; relier la ligne à
une personne demande en plus la clé HMAC et un numéro ; ces mêmes opérateurs voyaient la nature avant la purge. Mais
`privacy.ts` § 6 promet qu'« il ne subsiste alors qu'une empreinte chiffrée de votre numéro » : avec les compteurs
allumés, une nature présumée redevient déductible.

Remèdes, de forme différente d'un seuil k, chacun au prix de la justesse : un grain plus gros (la semaine), un arrondi ou
un bruit sur les comptes ; effacer `do_not_contact_at` jusqu'au jour seul ne suffit pas. **À trancher avec l'avis juridique
de [TCK-2434](TCK-2434-radar-compteurs-anonymes-de-marche.md)** (section « Menaces »).

**Décision du chef d'équipe (nuit du 2026-10-30)** : le comptage est **éteint par défaut**
(`radar.nature_counts.enabled`, `RADAR_NATURE_COUNTS=false`). Éteint, ni `radar:count-natures` ni la purge n'écrivent
rien, et l'observatoire dit que le comptage n'est pas activé. Le porteur ne l'allume qu'après l'avis juridique.

### Décisions prises en autonomie, à revoir

- **Périmètre du compte** : retenu, le stock du jour (annonceurs porteurs d'une annonce vivante, la définition de
  `natures`) ; écarté, les seuls annonceurs dont une annonce a été revue par la collecte ce jour-là. Raison : la part
  figée et la part vivante mesurent la même chose, et les annonces saisies à la main comptent.
- **Idempotence** : retenu, `insertOrIgnore` (le premier compte du jour gagne) ; écarté, `upsert`. Raison : relancé après
  la purge, un `upsert` écraserait le compte d'avant par celui d'après.
- **Double garantie de l'ordre** : retenu, entrée planifiée à 04:13 ET compte posé par la purge en premier ; écarté,
  l'ordre du planificateur seul. Raison : une entrée manquée ne doit pas laisser la purge effacer avant de compter ; défaire
  = retirer trois lignes de `RadarPurger::run()`.
- **Part d'une période** : retenue, la somme des annonceurs-jours ; écartée, la moyenne des parts quotidiennes. Raison :
  les deux se valent sans identifiant ; la somme se lit avec ses comptes, la moyenne pèserait autant un jour à 2 annonceurs
  qu'un jour à 200.
- **Borne haute** : retenu, `filter[until]` neuf, lu par `nature_history` seule ; écarté, l'appliquer aux sections du
  marché. Raison : ne rien changer à ce que TCK-2393 rend ; le front l'envoie depuis une requête à part.
- **Aucun site, aucune ville** : non ajoutés (consigne). Une part par site ou par ville serait utile au porteur ; c'est une
  suite liée à TCK-2434 (cellules plus fines, donc seuil k et avis juridique).
- **Aucun seuil k** sur ces cellules : un seuil k ne ferme pas la menace de la différence entre deux jours (ci-dessus).
  Le remède (semaine, arrondi, bruit) se tranche avec l'avis juridique de TCK-2434 ; en attendant, le comptage est éteint.
- **Une panne du compteur ne fait jamais tomber la purge légale** : dans `RadarPurger::run()`, l'appel est dans sa propre
  transaction (un point de sauvegarde sous un appelant transactionnel) et un `try/catch` qui `report()` puis continue.
  Écarté : laisser l'exception remonter, qui bloquerait l'effacement à 90 jours pour une statistique.

## Prérequis hors code du porteur

- **Avis juridique** (celui de TCK-2434) sur la menace de la différence entre deux jours et sur son remède, AVANT
  d'allumer `RADAR_NATURE_COUNTS`. Allumé sans remède, une nature présumée d'un annonceur qui a dit STOP redevient
  déductible, contre la lettre de `privacy.ts` § 6.

## Reste sur dev

Plus aucune dépendance de fusion : TCK-2392 et TCK-2393 sont `done` sur `dev`, et la fusion de cette branche livre tout le
code du ticket (AC1 prouvé par `RadarNatureCountsTest`). Reste, hors de ce code :

- **L'allumage par le porteur** (`RADAR_NATURE_COUNTS=true`), seulement après l'avis juridique de
  [TCK-2434](TCK-2434-radar-compteurs-anonymes-de-marche.md) sur la menace de la différence entre deux jours et son
  remède (semaine, arrondi ou bruit).
