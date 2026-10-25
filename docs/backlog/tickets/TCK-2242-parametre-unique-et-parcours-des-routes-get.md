---
id: TCK-2242
title: "Un seul lecteur pour un paramètre en liste (`ParametreUnique`), et un parcours des routes `GET` qui refuse tout 5xx"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2120, TCK-2122, TCK-2124, TCK-2126]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-216--paramètres-lus-à-la-main-en-chaîne-hors-de-buildquery-reçus-en-liste"
tags: [api, validation, query-builder, pistes, porteur]
---

## Contexte

Réf : **P216.05** du fichier de pistes, `validé` par le porteur (critère V6 accordé, écrit en
[ADR-0075](../../adr/0075-une-valeur-en-liste-vaut-une-valeur-absente.md)). Sept correctifs d'une
valeur reçue en liste ont chacun écrit leur garde locale (TCK-1407, TCK-1866, TCK-2120 à TCK-2126),
et rien n'empêchait le cast suivant de rendre 500 « Array to string conversion ».

## Décision du porteur

> validé — validation du porteur (2026-10-24) : ADR-0075 : une valeur reçue en liste là où une valeur unique est attendue vaut absente, lue par un lecteur partagé ; les 400 et 422 en place restent ; un test de parcours des routes `GET` refuse tout 500

## Objectif

Une URL qui envoie en liste un paramètre attendu seul n'accuse jamais le serveur : la route la lit
comme une valeur absente, ou la refuse comme elle refuse déjà une valeur inconnue.

## Contrat de données

Aucune réponse ne change pour une valeur en chaîne. Pour une liste : la réponse qu'aurait la valeur
absente, sauf les refus que liste ADR-0075 § 2 (400, 422, « aucune ligne »).

## Delta à produire

- [x] `App\Support\Http\ParametreUnique` (`chaine()`, `valeur()`), avec son test unitaire.
- [x] Les sites d'ADR-0075 « Application » migrés vers le lecteur, à comportement égal : trois
  tableaux de bord, console des boosts, quatre consoles super-admin, historique des paiements
  (`filter[status]` garde son 422), interventions, `DocumentResource`, biens d'une agence en
  console, avis, échéancier, filtres `due` et `assigned_to` des tâches (« aucune ligne » gardé), et
  `filter[moderation_status]` des avis.
- [x] `tests/Feature/Api/ValeursEnListeParcoursDesRoutesTest.php` : chaque route `GET` de `api/*`
  reçoit `sort[]`, `include[]`, puis `filter[<nom>][]` pour chaque nom qu'elle lit (ceux que spatie
  autorise, et ceux que l'action lit à la main), et aucune réponse n'est 5xx. Il compte les routes
  atteintes (plancher) et nomme celles qu'il ne sait pas atteindre, chacune avec sa raison.
- [x] Les 500 que le parcours a trouvés hors des quatre entrées de l'angle, passés au lecteur :
  `filter[search]` de `HasQueryBuilder` (25 routes), `filter[city]` des biens, `filter[role]` des
  utilisateurs (garde « aucune ligne », comme un rôle inconnu), `filter[subject_type]` du KYC,
  `filter[search]` du journal d'audit, `include` d'un relevé bancaire.

## Critères d'acceptation

- [x] AC1 — `ParametreUnique` rend la chaîne, et `null` pour une valeur absente, une liste ou une
  liste vide, en notation pointée comme sur une valeur déjà extraite.
- [x] AC2 — les tests `ValeursEnListe*Test` et `TaskDueFilterTest` restent verts sans modification.
- [x] AC3 — le parcours est vert, sur 244 routes parcourues dont 238 atteintes.

## Hors périmètre

- Les 45 routes que le parcours n'atteint pas encore (paramètre d'URL sans liaison de modèle, ou
  modèle sans fabrique) : nommées dans `HORS_PARCOURS`, à couvrir une à une.
- Les autres lectures `(string) $request` que le parcours ne fait pas tomber : migrées quand un
  ticket les touche (ADR-0075, « Application »).
- Une valeur illisible pour sa colonne (`filter[price]=x`, colonne numérique) : rend 500
  `22P02` même en chaîne seule. Ce n'est pas une valeur en liste ; le parcours envoie `1` pour ne
  pas la confondre avec elle.

## Notes d'implémentation

- Reproduction : `ParametreUniqueTest` rouge avant le lecteur (classe absente) ; le parcours, une
  fois écrit, a rendu 32 requêtes en 5xx hors des sites déjà corrigés, sur six lignes de code
  (`HasQueryBuilder.php:224`, `Property.php:711`, `User.php:332`, `KycDossier.php:64`,
  `AuditLogController.php:152`, `BankStatementController.php:96`), plus `api/health` (503 voulu).
- Ablations : lecteur qui caste la liste → `ParametreUniqueTest` 4 rouges, les cinq
  `ValeursEnListe*Test` 16 rouges, `TaskDueFilterTest` 1 rouge, et le parcours 56 requêtes en 500 ;
  les six correctifs neufs remis à `pre-dev` → parcours rouge sur les 32 requêtes. Tout remis → vert.
- Pièges du parcours : chaque requête tourne dans un point de sauvegarde (une erreur SQL
  abandonnerait sinon la transaction du test, et toutes les requêtes suivantes accuseraient
  `25P02`) ; une réponse en flux ne porte pas `exception` ; la recherche publique exige ses index
  (`InteractsWithMeilisearch`) ; `api/health` rend 503 en test, son contrat quand une sonde échoue,
  et est mise à part (`TEMOIN_5XX`).
- `User::roleFilter` : un rôle inconnu rendait déjà aucune ligne, et une liste aussi désormais
  (ADR-0075 § 2), là où la console super-admin (`UserDetailController`, TCK-2120) lit la liste comme
  absente. Les deux chemins ne sont pas le même filtre.
