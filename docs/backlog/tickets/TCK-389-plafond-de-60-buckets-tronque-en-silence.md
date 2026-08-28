---
id: TCK-389
title: "Rapports — le plafond de 60 buckets tronque une plage choisie sans le dire"
status: done
phase: P2
family: back
estimate: S
wave: 46
created: 2026-08-27
updated: 2026-08-28
depends_on: [TCK-361]
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models: []
tags: [back, super-admin, reporting, exactitude]
---

## Objectif utilisateur

Quand le super-admin demande une fenêtre plus large que ce que le service accepte de découper, il
l'apprend — au lieu de lire un total qui décrit deux mois sous une étiquette qui annonce six ans.

## Contexte

`PlatformReportingService::bucketsFor()` s'arrête à 60 buckets :

```php
if (count($buckets) >= 60) {
    // Hard cap so a malicious / accidental call doesn't fan out.
    break;
}
```

Le plafond est légitime — un bucket est une requête SQL, et rien ne borne la largeur de la plage
côté validation (`starts_at` / `ends_at` sont `nullable|date`, sans contrainte d'écart ;
`granularity` accepte `day`). **Ce qui ne l'est pas, c'est le silence.** Mesuré le 2026-08-27 :

```
$ php artisan tinker --execute='… growth("agencies", "12m", "day", "2020-01-01", "2026-01-01") …'
buckets=60  premier=2020-01-01  dernier=2020-02-29  range=2020-01-01..2026-01-01
```

Six ans demandés, **deux mois mesurés**, et l'enveloppe annonce `range = 2020-01-01..2026-01-01`.
`totals.total` compte donc les agences de janvier-février 2020 sous une fenêtre de six ans. Aucun
statut d'erreur, aucun drapeau de troncature, aucun compteur : c'est la même famille de défaut que
D5 de TCK-361 — *une plage choisie par l'utilisateur qui rend un chiffre faux, sans rien signaler*
—, et c'est ce même ticket qui a rendu la plage choisissable.

Le front ne l'expose pas aujourd'hui (il fige `granularity: 'month'`, ce qui repousse le plafond à
60 mois), mais l'API est publique pour la console et l'export CSV emprunte le même service.

## Contraintes strictes (métier)

- Le plafond lui-même ne se retire pas : il protège d'un éventail de requêtes SQL non borné.
- Un rapport tronqué ne doit pas pouvoir se lire comme un rapport complet — c'est le point du
  ticket, pas la manière d'y arriver.
- L'export CSV passe par le même service (`ReportingController::export`) : la décision doit valoir
  pour lui, un fichier étant précisément ce qu'on relit hors contexte.

## Delta à produire

Trancher entre les deux voies, et écrire laquelle avant de coder :

1. **Refuser** — la validation borne l'écart des deux bornes en fonction de `granularity`
   (60 jours, 60 semaines, 60 mois), et rend 422 en nommant la contrainte. Le plus net : l'appelant
   sait immédiatement ce qu'il doit demander. Il faut vérifier qu'aucun appel existant de la
   console ne franchit la borne.
2. **Dire** — l'enveloppe porte la troncature (`period.range` reflète ce qui a RÉELLEMENT été
   mesuré, plus un indicateur explicite), et l'écran l'affiche. Plus tolérant, plus de surface :
   l'indicateur doit voyager jusqu'au CSV et jusqu'à l'écran, sinon il ne sert à rien.

## Critères d'acceptation

- [x] **AC1** — un test d'API demande une plage dépassant le plafond et prouve le comportement retenu
  (422 nommé, ou enveloppe qui dit la troncature). Le vérifier par ablation : retirer le correctif
  doit faire rougir ce test précisément.
- [x] **AC2** — la sonde ci-dessus ne peut plus rendre `range = 2020-01-01..2026-01-01` avec 60 buckets
  s'arrêtant au 2020-02-29 : soit la requête est refusée, soit `range` dit `2020-01-01..2020-02-29`.
- [x] **AC3** — l'export CSV du même appel est couvert par le même comportement, et un test le montre.
- [x] **AC4** — `php artisan test tests/Feature/Api/Admin/PlatformReportingTest.php` et
  `./vendor/bin/pint` verts.

## Hors périmètre

- L'inégalité de durée entre la fenêtre affichée et sa comparaison sur une plage partielle : c'est
  TCK-388, même famille, racine différente.
- Toute optimisation du nombre de requêtes par bucket (une requête par bucket, agrégation en SQL) :
  le plafond existe pour ça et le ticket ne le remet pas en cause.

## Voie retenue — 1, REFUSER

Tranchée avant de coder, comme le demande le Delta.

**Pourquoi pas « dire ».** Un rapport tronqué qui s'annonce tronqué reste un rapport qu'on peut lire
de travers ; la contrainte du ticket est qu'il ne PUISSE PAS se lire comme un rapport complet, et
seul le refus le garantit. Et l'export CSV — le seul artefact qu'on relit hors contexte — aurait
exigé que le drapeau voyage jusque dans les colonnes du fichier pour servir à quelque chose. Le refus
vaut pour lui sans une ligne de plus.

**Où.** Dans `PlatformReportingService::bucketsFor()`, par `ValidationException` (422), et non dans
les `FormRequest`. Trois requêtes (`Growth`, `Revenue`, `ReportExport`) mènent au même découpage, et
le nombre d'intervalles ne se déduit pas des paramètres seuls : le raccourci `period` est résolu
contre `Carbon::now()`. Une règle de validation aurait recopié `bucketsFor()`, et deux copies d'une
même borne divergent.

**Champ nommé.** `ends_at` sur une plage libre ; `granularity` sur un raccourci `period`, l'appelant
n'ayant pas d'autre prise.

## Notes d'implémentation

**Re-mesure de la sonde du ticket, 2026-08-27, avant correctif — identique au chiffre écrit :**

```
buckets=60  premier=2020-01-01  dernier=2020-02-29  range=2020-01-01..2026-01-01
```

Après correctif, la même sonde rend :

```
2020-01-01..2026-01-01 (day)   => 422 {"ends_at":["… dépasse le plafond de 60 intervalles « day » …"]}
2021-01-01..2025-12-31 (month) => OK buckets=60 range=2021-01-01..2025-12-31
2021-01-01..2026-01-01 (month) => 422
```

**Ce que le ticket ne disait pas : la console PEUT franchir la borne.** « Il faut vérifier qu'aucun
appel existant de la console ne franchit la borne » — le front fige `granularity: 'month'`, mais
`ReportWindowControls` ne borne pas ses deux sélecteurs de dates : une plage de plus de soixante mois
est demandable depuis l'écran. Et `GrowthChart` / `RevenueChart` n'affichaient aucune erreur : un 422
serait retombé sur `rows = []`, c'est-à-dire « Aucune donnée sur cette période ». La troncature
silencieuse aurait changé de forme au lieu de disparaître. D'où `ReportError`, hors AC mais dans la
constrainte de la voie 1.

**Effet de bord assumé** : `period=12m&granularity=day` (366 intervalles) et `period=90d&granularity=day`
(91 intervalles) rendent désormais 422 au lieu d'une série tronquée. Aucun appel de la console ne les
émet — elle fige `month`.

