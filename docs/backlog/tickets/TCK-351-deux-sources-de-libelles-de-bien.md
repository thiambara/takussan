---
id: TCK-351
title: "Deux sources de libellés de bien s'affichent dans le même parcours — 44 divergences mesurées"
status: todo
phase: P2
family: technique
estimate: M
wave: 45
created: 2026-08-22
updated: 2026-08-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
tags: [back, front, i18n, contrat, dette]
---

## Objectif utilisateur

Qu'un bien porte **le même mot d'un écran à l'autre** — que la carte de résultat et la fiche du
même bien ne l'appellent pas différemment.

## Le constat — mesuré le 2026-08-22, pas déduit

**Il existe DEUX tables de libellés de bien, elles s'affichent dans le même parcours, et elles
divergent sur 44 valeurs.**

| | Source | Qui la rend |
|---|---|---|
| A | `takussan-api/lang/{fr,en,wo}/properties.php` | `PropertyResource:61-70` émet `type_label`, `contract_type_label`, `rent_period_label`, `status_label`, `title_type_label`, traduits par `BaseResource::enumLabel()` dans la locale de la requête |
| B | `takussan-web/src/messages/{fr,en,wo}.json` → `property.{types,contractTypes,rentPeriods,status}` | les cartes, les filtres de recherche, le formulaire |

**Et le front consomme les deux.** Mesuré :
`app/(public)/properties/[slug]/page.tsx:74` rend `property.type_label` (source A) ;
`PropertyCharacteristics.tsx:19-20` rendent `contract_type_label` et `rent_period_label` (source A) ;
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
[TCK-292](TCK-292-i18n-reste-du-parc.md) avait nommé ce risque et l'avait mis **hors périmètre**,
en écrivant qu'il n'avait pas été mesuré : *« Si l'API renvoie des phrases françaises, traduire le
front ne suffira pas : ce sera un ticket backend, pas celui-ci. »* **La mesure est faite ; ce
ticket est celui-là.**

## L'arbitrage à rendre AVANT d'implémenter

Trois issues, et aucune n'est neutre :

| | Ce que ça donne | Ce que ça coûte |
|---|---|---|
| **1. Le front gagne** — l'API cesse d'émettre les `*_label`, le front rend tout depuis son dictionnaire | conforme au principe n°5, une seule source | **rupture de contrat d'API** sur 5 champs ; il faut trouver tous les consommateurs (le front en a au moins 3, mais l'API est publique) |
| **2. L'API gagne** — le front supprime `property.{types,…}` et rend les `*_label` | une seule source, sans rupture | **révoque le principe n°5** ; et les libellés ne seraient plus disponibles hors d'une réponse d'API (filtres, formulaires vides) |
| **3. Les deux restent, une garde les tient identiques** | pas de rupture, divergence impossible | deux tables à maintenir en miroir ; *c'est l'état actuel plus une garde* — et il faut quand même trancher les 44 valeurs |

⚠ **Quelle que soit l'issue, les 44 valeurs doivent être arbitrées une par une**, et les 24 wolof
exigent un locuteur — c'est le même besoin que [TCK-342](TCK-342-libelles-wolof-divergents-back-front.md)
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

- [ ] **AC1 — l'arbitrage est écrit** (ADR ou section de ce ticket) et dit laquelle des trois issues
      est retenue, avec la raison. *Le dépôt exige qu'une décision structurelle s'écrive AVANT
      l'implémentation.*
- [ ] **AC2 — les 44 valeurs sont arbitrées une par une**, et celles qui changent le sont sur une
      raison écrite. Un arbitrage en bloc (« l'API gagne partout ») est refusé par ce critère :
      `type.farm` et `type.land` montrent que la bonne réponse change d'une clé à l'autre.
- [ ] **AC3 — `DIVERGENCES_CONNUES` de la garde est VIDE**, et la garde reste verte. C'est la
      formulation qui ne peut pas être cochée par une régression : vider la liste sans corriger
      fait rougir le second contrôle.
- [ ] **AC4 — les 24 divergences wolof portent la trace d'une relecture par un locuteur**, ou sont
      explicitement reportées avec leur ticket. *Aucune garde ne peut établir qu'une traduction est
      juste ; ne pas cocher ce critère sur une parité.*
- [ ] **AC5 — `status.pending` rend le MÊME état des deux côtés.** C'est la seule divergence qui
      induit l'utilisateur en erreur sur une donnée métier, pas sur un mot.

## Ce que ce ticket ne fait pas

- Il ne traite pas les autres groupes d'enums que `properties.php` (`agencies`, `leases`…) : la
  mesure n'a porté que sur les biens. Si l'issue retenue est la n°1, ils suivront.
- Il ne touche pas au vocabulaire de recherche wolof — [TCK-339](TCK-339-vocabulaire-wolof-recherche.md).
