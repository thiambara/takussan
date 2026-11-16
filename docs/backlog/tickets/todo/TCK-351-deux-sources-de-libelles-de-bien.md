---
id: TCK-351
title: "Deux sources de libellés de bien s'affichent dans le même parcours — 44 divergences mesurées"
status: todo
phase: P2
family: technique
estimate: M
wave: 45
created: 2026-08-22
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
tags: [back, front, i18n, contrat, dette]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : toujours vrai.** Les 44 divergences sont toujours là, exactement l'ensemble de
`DIVERGENCES_CONNUES` (`property-labels.parity.test.ts:82-127`), répartition inchangée ;
`status.fr.pending` vaut toujours « Réservé » côté API (`lang/fr/properties.php:38`) contre « En attente »
côté front. Rien n'a été fermé entre-temps, sinon un alignement ponctuel (`published` = « Validé »,
TCK-2638, c68e2f21c) et une **bascule de fait vers l'issue 1, sans arbitrage écrit** : la console
`/app/properties/[id]` (`page.tsx:109-119`, `en-ligne/page.tsx:69-70`) traduit le code par le dictionnaire
du front et ne garde `*_label` qu'en repli. ADR-0097 § 4 penche vers le front pour un seul libellé ;
aucun ADR ne tranche les `*_label`.

- Écrire l'arbitrage (AC1), puis trancher les 20 divergences fr/en une à une (`status.fr.pending` d'abord).
- Reporter explicitement les 24 wolof vers TCK-342 (wolof en pause depuis le 2026-10-16).

**Décision attendue du porteur :** (a) issue 1, le front gagne — l'API cesse d'émettre six `*_label`
(consommateurs de la fiche publique, du comparateur et de la console à reprendre) ; (b) issue 2, l'API gagne ; (c) issue 3, deux tables tenues
identiques par la garde. Et, pendant la pause wolof : AC3 réduit à la seule partie fr/en de
`DIVERGENCES_CONNUES` — oui ou non ?

## Arbitrage du porteur (2026-11-16) — option (a), le front gagne

**Décision : issue 1.** Le principe non négociable n° 5 s'applique tel qu'il est écrit — *le front
possède le texte affiché*. `PropertyResource` cesse d'émettre les six `*_label` (`type_label`,
`contract_type_label`, `rent_period_label`, `status_label`, `title_type_label`, `condition_label`) ;
le front rend chaque code par `property.{types,contractTypes,rentPeriods,status,titleTypes,conditions}`
de next-intl, via `src/lib/biens/libelles-de-bien.ts`. Raison : une seule table à l'écran, la seule qui
existe aussi hors d'une réponse d'API (filtres, formulaire vide) ; l'issue 2 révoquait un principe,
l'issue 3 laissait deux tables à tenir en miroir.

**Rupture de contrat relevée** : six clés retirées de `GET /api/public/properties/{slug}`, des listes
publiques, de `/api/properties` et de `/api/admin/agencies/{id}/properties`. Aucun consommateur hors du
front n'est connu (l'API n'a jamais servi en production). Côté API, `lang/<locale>/properties.php` garde
`type` et `contract_type` pour leurs seuls lecteurs serveur (alias et suggestions de recherche — que le
front retraduit par code —, titre du radar, `SearchWolofReviewSheet`) ; `rent_period`, `status`,
`title_type` et `condition`, sans autre lecteur, sont retirés.

### Les 44 valeurs, une par une

Le décompte réel de `DIVERGENCES_CONNUES` est **16 fr/en + 28 wo** (et non 20 + 24 comme écrit plus haut).

| Entrée(s) | API (retirée de l'écran) | Front (affiché) | Raison |
|---|---|---|---|
| `status.fr.pending` | « Réservé » | **« En attente »** | `pending` est un état « À valider » (`Property::LISTING_PENDING_STATUSES`, TCK-2638), pas une réservation : « Réservé » était un libellé faux (AC5). |
| `status.en.under_maintenance` | « Under Maintenance » | **« Under maintenance »** | casse de phrase, celle de tout le dictionnaire anglais. |
| `type.en.resort` | « Resort » | **« Complex »** | le mot du front, celui des cartes et des filtres ; « Resort » reste un terme de recherche. |
| `type.en.shop` | « Shop » | **« Retail »** | idem ; « Shop » reste un terme de recherche. |
| `contract_type.fr.{sale,rent}`, `.en.{sale,rent}` | « À vendre / À louer », « For Sale / For Rent » | **« Vente / Location »** (ligne « Contrat »), **« En vente / En location »** (pastille et carte de réservation) | la pastille de la fiche reprend le mot de `ContractTypeChip`, celui de la carte qui y mène. |
| `rent_period.fr.*`, `.en.*` (8) | « par jour… », « per day… » | **« Journalier / Hebdo / Mensuel / Annuel »**, « Daily… » | la ligne « Période » attend un adjectif ; le suffixe du prix a sa propre table (`rentPeriodsShort`), inchangée. |
| 28 entrées `*.wo.*` | wolof de l'API (dont `farm` « Jën », `land` « Dëkk ») | la valeur du front, telle quelle | **aucune n'est tranchée ici** : wolof en pause depuis le 2026-10-16. **Reportées à [TCK-342](TCK-342-libelles-wolof-divergents-back-front.md)** pour relecture par un locuteur ; les tables wolof `type`/`contract_type` de l'API restent du vocabulaire de recherche (TCK-339). |

## Objectif utilisateur

Qu'un bien porte **le même mot d'un écran à l'autre** — que la carte de résultat et la fiche du
même bien ne l'appellent pas différemment.

## Le constat — mesuré le 2026-08-22, pas déduit

**Il existe DEUX tables de libellés de bien, elles s'affichent dans le même parcours, et elles
divergent sur 44 valeurs.**

| | Source | Qui la rend |
|---|---|---|
| A | `takussan-api/lang/{fr,en,wo}/properties.php` | `PropertyResource:61-70` émet `type_label`, `contract_type_label`, `rent_period_label`, `status_label`, `title_type_label` *(2026-11-16 : `PropertyResource.php:129-156`, six `*_label` dont `condition_label`, TCK-508 — `title_type` et `condition` nés alignés)*, traduits par `BaseResource::enumLabel()` dans la locale de la requête |
| B | `takussan-web/src/messages/{fr,en,wo}.json` → `property.{types,contractTypes,rentPeriods,status}` | les cartes, les filtres de recherche, le formulaire |

**Et le front consomme les deux.** Mesuré :
`app/(public)/properties/[slug]/page.tsx:74` rend `property.type_label` (source A) ;
`PropertyCharacteristics.tsx:19-20` rendent `contract_type_label` et `rent_period_label` (source A) ;
*(2026-11-16 : `page.tsx:107`, dans la meta description seulement ; le rendu visible passe par
`PropertyCharacteristics.tsx:32-50`, `PropertyHeader.tsx:67-68`, `PropertyBookingCard.tsx:57-58`)* ;
les cartes et `FilterSidebar` rendent `property.types` (source B). *Un visiteur qui clique sur une
carte passe de B à A sans le savoir.*

### Les 44 divergences

```
properties.type ↔ property.types
  fr :  0 / 16
  en :  2 / 16   resort  API « Resort »  ≠ front « Complex »
                 shop    API « Shop »    ≠ front « Retail »
  wo : 13 / 16   land « Dëkk »/« Suuf » · apartment « Appart »/« Apartama » · villa « Villa »/« Wiila »
                 room « Néeg »/« Neeg » · office « Birow »/« Biro » · shop « Boutik »/« Butik »
                 warehouse « Dépôt »/« Magasin » · factory « Usine »/« Usin » · farm « Jën »/« Tool »
                 hotel « Hôtel »/« Otel » · resort « Complexe »/« Kompleks » · garage « Garaj »/« Garaas »
                 other « Yeneen »/« Beneen »

properties.contract_type ↔ property.contractTypes      fr 2/2 · en 2/2 · wo 2/2
properties.rent_period   ↔ property.rentPeriods        fr 4/4 · en 4/4 · wo 4/4
properties.status        ↔ property.status             fr 1/9 · en 1/9 · wo 9/9
```

### ⚠ Trois d'entre elles ne sont PAS des nuances de style

1. **`status.pending` — fr : API « Réservé », front « En attente ».** Ce sont deux ÉTATS
   différents. Un bien en attente s'affiche comme réservé sur la fiche et comme en attente sur la
   carte. C'est un libellé faux, pas un synonyme.
2. **`type.farm` — wo : API « Jën », front « Tool ».** *Jën* désigne le poisson ; *tool* désigne le
   champ. L'un des deux est simplement faux.
3. **`type.land` — wo : API « Dëkk », front « Suuf ».** *Dëkk* désigne le village ou la ville ;
   *suuf* désigne le sol, la terre.

**Plusieurs valeurs wolof de la source A sont d'ailleurs du FRANÇAIS** — `status.draft` = « Brouillon »,
`status.archived` = « Archivé », `status.pending` = « Attente », `type.factory` = « Usine ».

## Ce que ce constat dit du principe non négociable n°5

> « **Le front possède le texte affiché.** L'API émet des codes et des données ; les libellés
> passent par next-intl. »

`PropertyResource` le viole, et pas à la marge : cinq champs de libellé, traduits côté serveur.
[TCK-292](../done/TCK-292-i18n-reste-du-parc.md) avait nommé ce risque et l'avait mis **hors périmètre**,
en écrivant qu'il n'avait pas été mesuré : *« Si l'API renvoie des phrases françaises, traduire le
front ne suffira pas : ce sera un ticket backend, pas celui-ci. »* **La mesure est faite ; ce
ticket est celui-là.**

## L'arbitrage à rendre AVANT d'implémenter

Trois issues, et aucune n'est neutre :

| | Ce que ça donne | Ce que ça coûte |
|---|---|---|
| **1. Le front gagne** — l'API cesse d'émettre les `*_label`, le front rend tout depuis son dictionnaire | conforme au principe n°5, une seule source | **rupture de contrat d'API** sur 5 champs ; il faut trouver tous les consommateurs (le front en a au moins 3 — *au 2026-11-16 : les trois composants de la fiche publique, `page.tsx:107`, `compare/compare-rows.ts:98-102`, `admin/super/agency-detail.tsx:605`, `SuperAdminPropertiesTable.tsx:239`, plus la console `/app/properties/[id]` en repli — le compte exact se reprend par grep des `*_label`* —, mais l'API est publique) |
| **2. L'API gagne** — le front supprime `property.{types,…}` et rend les `*_label` | une seule source, sans rupture | **révoque le principe n°5** ; et les libellés ne seraient plus disponibles hors d'une réponse d'API (filtres, formulaires vides) |
| **3. Les deux restent, une garde les tient identiques** | pas de rupture, divergence impossible | deux tables à maintenir en miroir ; *c'est l'état actuel plus une garde* — et il faut quand même trancher les 44 valeurs |

⚠ **Quelle que soit l'issue, les 44 valeurs doivent être arbitrées une par une**, et les 24 wolof
exigent un locuteur *(wolof en pause depuis le 2026-10-16 : AC4 se coche par un report explicite vers
TCK-342)* — c'est le même besoin que [TCK-342](TCK-342-libelles-wolof-divergents-back-front.md)
et [TCK-339](TCK-339-vocabulaire-wolof-recherche.md). Ne pas choisir « celle de l'API » ou « celle
du front » en bloc : `farm` montre que la bonne réponse change d'une clé à l'autre.

## Ce qui est DÉJÀ fait, et qui empêche la dette de croître

`takussan-web/src/types/__tests__/property-labels.parity.test.ts` (2026-08-22) est un **cliquet à
contenu nommé** : les 44 divergences y sont écrites une par une, et la garde rougit **dans les deux
sens** — une divergence nouvelle non inscrite, et une entrée inscrite qui aurait cessé de diverger.
Prouvée par deux mutations : ajouter une divergence (`type.fr.house`) et en résoudre une
(`type.en.shop`) font toutes deux sortir la garde en échec.

`web-ci.yml` déclenche sur `takussan-api/lang/**` et sur `PropertyResource.php` — *les deux côtés
qu'une garde compare doivent la déclencher, sinon elle dort quand l'un bouge seul.*

## Critères d'acceptation

- [x] **AC1 — l'arbitrage est écrit** (ADR ou section de ce ticket) et dit laquelle des trois issues
      est retenue, avec la raison. *Le dépôt exige qu'une décision structurelle s'écrive AVANT
      l'implémentation.*
- [x] **AC2 — les 44 valeurs sont arbitrées une par une**, et celles qui changent le sont sur une
      raison écrite. Un arbitrage en bloc (« l'API gagne partout ») est refusé par ce critère :
      `type.farm` et `type.land` montrent que la bonne réponse change d'une clé à l'autre.
- [x] **AC3 — `DIVERGENCES_CONNUES` de la garde est VIDE**, et la garde reste verte. C'est la
      formulation qui ne peut pas être cochée par une régression : vider la liste sans corriger
      fait rougir le second contrôle.
- [x] **AC4 — les 24 divergences wolof portent la trace d'une relecture par un locuteur**, ou sont
      explicitement reportées avec leur ticket. *Aucune garde ne peut établir qu'une traduction est
      juste ; ne pas cocher ce critère sur une parité.*
- [x] **AC5 — `status.pending` rend le MÊME état des deux côtés.** C'est la seule divergence qui
      induit l'utilisateur en erreur sur une donnée métier, pas sur un mot.

## Ce que ce ticket ne fait pas

- Il ne traite pas les autres groupes d'enums que `properties.php` (`agencies`, `leases`…) : la
  mesure n'a porté que sur les biens. Si l'issue retenue est la n°1, ils suivront.
- Il ne touche pas au vocabulaire de recherche wolof — [TCK-339](TCK-339-vocabulaire-wolof-recherche.md).

## Livré (2026-11-16)

- **AC1** — section « Arbitrage du porteur » ci-dessus, et amendement d'ADR-0021 (les `*_label` quittent la famille des clés dérivées).
- **AC2** — tableau des 44 valeurs ci-dessus ; les 28 wolof sont reportées, pas tranchées.
- **AC3** — la liste a disparu avec son objet : il n'y a plus qu'une table à l'écran. `property-labels.parity.test.ts` garde désormais (1) que `PropertyResource` n'émet aucun des six libellés, (2) qu'aucun fichier du front n'en lit un (lecture ou déclaration de champ, commentaires et clés de dictionnaire exclus, liste `LECTURES_HORS_BIEN` à cliquet), (3) que chaque cas des six enums PHP est connu du front et a sa clé fr/en/wo. Ablations : relire `status_label` dans `statut-au-visiteur.ts` → rouge ; réémettre `type_label` → rouge (front) et 4 rouges `PropertyLabelLocaleTest` (API) ; ajouter `case Castle` à `PropertyType` → rouge. Restauré par copie, md5 vérifiés.
- **AC4** — report explicite vers TCK-342, sans parité invoquée.
- **AC5** — `pending` se dit « En attente » partout (fiche, carte, console) : `statut-au-visiteur.tck-2638.test.tsx` l'épingle sur la fiche publique.
- `web-ci.yml` se déclenche aussi sur les six fichiers d'enum que la garde lit.
