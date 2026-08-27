---
id: TCK-389
title: "Rapports — le plafond de 60 buckets tronque une plage choisie sans le dire"
status: todo
phase: P2
family: back
estimate: S
wave: 46
created: 2026-08-27
updated: 2026-08-27
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

- **AC1** — un test d'API demande une plage dépassant le plafond et prouve le comportement retenu
  (422 nommé, ou enveloppe qui dit la troncature). Le vérifier par ablation : retirer le correctif
  doit faire rougir ce test précisément.
- **AC2** — la sonde ci-dessus ne peut plus rendre `range = 2020-01-01..2026-01-01` avec 60 buckets
  s'arrêtant au 2020-02-29 : soit la requête est refusée, soit `range` dit `2020-01-01..2020-02-29`.
- **AC3** — l'export CSV du même appel est couvert par le même comportement, et un test le montre.
- **AC4** — `php artisan test tests/Feature/Api/Admin/PlatformReportingTest.php` et
  `./vendor/bin/pint` verts.

## Hors périmètre

- L'inégalité de durée entre la fenêtre affichée et sa comparaison sur une plage partielle : c'est
  TCK-388, même famille, racine différente.
- Toute optimisation du nombre de requêtes par bucket (une requête par bucket, agrégation en SQL) :
  le plafond existe pour ça et le ticket ne le remet pas en cause.
