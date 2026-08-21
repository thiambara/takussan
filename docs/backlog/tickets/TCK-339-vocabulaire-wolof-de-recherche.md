---
id: TCK-339
title: "Vocabulaire wolof de recherche — revue lexicale requise"
status: doing
phase: P3
family: applicatif
estimate: M
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: [TCK-335]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
tags: [back, search, i18n, wolof]
---

## Objectif utilisateur

Un visiteur qui cherche en wolof trouve quelque chose.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md), et **sa prémisse d'origine
était fausse** : `lang/wo/properties.php` existe et porte les 35 clés. Ce n'est pas la traduction
qui manque, c'est qu'on **ne peut pas la réutiliser comme vocabulaire de recherche**.

## Contraintes strictes (métier)

- **Injecter les libellés d'affichage wolof produirait un index FAUX** — `land => 'Dëkk'`,
  `farm => 'Jën'`, `sale => 'Jënd'`, `rent => 'Tëddé'` dans `lang/wo/properties.php`.
  ⚠ **Les gloses qui circulaient dans la version précédente de ce ticket** (« Dëkk = village »,
  « Jën = poisson », « Jënd = acheter », « seul `house => kër` est mesurablement bon »)
  **ne sont attribuées à personne** : aucun contributeur wolophone n'est identifié sur ce
  dépôt. Elles restent ici comme ALERTE — il y a lieu de douter — et non comme verdict.
  Écrire « c'est vérifié mot par mot » sans dire par qui, c'est le défaut même qu'on prétend
  corriger. **Une erreur de ce type est invisible à toute revue non wolophone, y compris à
  celle qui a rédigé la liste ci-dessus.**
- **Une table d'alias de recherche est INDÉPENDANTE des libellés d'affichage.** Les deux n'ont
  ni le même objet ni la même contrainte.
- **Dériver les alias de `lang/` casserait le déclencheur de réindexation** : `scripts/deploy.sh`
  réimporte sur un diff de `config/scout.php` ou de `app/Models/*.php`, **jamais** sur un diff de
  `lang/`. L'index resterait sur l'ancien vocabulaire et **rien ne rougirait**.
- **Le risque décisif n'est pas lexical, il est de CORPUS.** Un mot wolof parfaitement juste
  peut être déjà pris par le catalogue, et une revue lexicale ne peut pas le voir : elle
  regarde une liste de mots, pas l'index. Mesuré le 2026-08-21 sur `takussan_localproperties`
  (795 documents) — voir les notes d'implémentation pour le relevé complet :
  - `keur` rend **40** biens, parce que le quartier « Cité Keur Gorgui » existe ;
  - `Magasin` (le libellé que le front donne à `warehouse`) rend **56 biens dont `shop:56` et
    `warehouse:0`**, parce que « magasin » est déjà un jeton de l'alias français de `shop`.
    Adopté comme alias, il enverrait tout chercheur d'entrepôt sur des boutiques — **et le
    compte non nul aurait eu l'air d'un succès.**

## Delta à produire

- [x] **La mécanique, livrée À VIDE** : `Property::TYPE_SEARCH_ALIASES_WO` et
      `Property::CONTRACT_SEARCH_ALIASES_WO`, toutes les clés d'enum présentes, **aucune
      valeur**, concaténées dans `type_label` / `contract_label` — les champs que TCK-335 a
      déjà installés. Pas de champ neuf : un champ neuf forcerait une édition de
      `searchableAttributes`, donc un réimport de tous les modèles, et rouvrirait la question
      de l'ORDRE que TCK-335 a mesurée.
- [x] Les invariants exécutables de cette mécanique (`tests/Unit/PropertySearchableArrayTest.php`).
- [x] `php artisan search:wolof-review-sheet` — la feuille de séance, avec la colonne « hits »
      renseignée par une vraie requête et la répartition par type de bien.
- [ ] **Revue lexicale par un locuteur** — c'est ce qui reste, et c'est tout ce qui reste.
- [ ] Report des valeurs validées dans les deux tables, puis réimport de l'index.

## Critères d'acceptation

- [ ] AC1 — un jeu de requêtes wolof validé par un locuteur rend des résultats pertinents.
- [x] AC2 — **la table wolof est un no-op tant qu'elle est vide** : le document indexé est
      identique **à la chaîne près** à celui d'avant ce ticket, pour chaque valeur d'enum.
      *(Vérifié par ablation ; et vérifié aussi contre les 795 documents réellement indexés
      par le code d'avant.)*
- [x] AC3 — **toute clé d'enum est couverte** par les deux tables, sans clé en trop : une clé
      manquante serait avalée par le `?? ''` de la jointure, une clé en trop resterait morte.
- [x] AC4 — **un alias renseigné atteint réellement le document indexé.** Prouvé en parcourant
      le chemin avec une valeur non vide, jamais en constatant que rien n'a changé — une
      implémentation qui ignorerait purement la table cocherait ce dernier constat.
- [x] AC5 — **un alias n'atterrit pas dans le champ voisin** : `type_label` ne porte pas le
      vocabulaire de contrat, et réciproquement.
- [x] AC6 — **tout champ de vocabulaire est déclaré `searchable`** : un champ indexé mais
      absent de `searchableAttributes` grossit le document et n'est interrogeable par personne.
- [ ] AC7 — les valeurs retenues sont **attribuées** : qui les a validées, et quand.

> ### ⚠ L'AC2 d'origine était FAUSSE, et elle exigeait de révoquer TCK-335
>
> Elle disait : *« aucun alias ne fait remonter un bien en vente sur un mot signifiant
> "acheter" »*. Or `CONTRACT_SEARCH_ALIASES['sale']` vaut **déjà** `'vendre vente achat
> acheter'`, et `q=acheter` rend **54** biens en vente — délibérément, mesuré, et c'est le
> comportement voulu : **un acheteur cherche avec le verbe de SON intention, pas avec celui du
> vendeur.** Écrit tel quel, ce critère condamnait du code livré et vert.
>
> La règle juste n'est pas « pas de verbe d'achat » mais **« le verbe doit désigner l'intention
> que le contrat sert »**. Un mot d'achat sur un bien en LOCATION serait la faute ; sur un bien
> en vente, c'est le but. Cette règle-là n'est pas mécanisable — elle demande un locuteur —
> d'où sa place en AC1/AC7 et non dans un test.
>
> *Un critère d'acceptation qu'une régression cocherait aussi est une case, pas un critère ; un
> critère que le code juste ne peut pas cocher est pire encore.*

## Hors périmètre

- ~~Les libellés d'affichage wolof, qui sont complets et corrects.~~
  **Faux, et contredit par ce ticket même** : la section « Contraintes » ci-dessus tient
  précisément parce que ces libellés sont douteux. Ils sont en outre **incohérents entre le
  back et le front** — mesuré le 2026-08-21 : sur 18 clés d'enum, **3 concordent et 15
  divergent**, dont 5 en SENS (`land` : Dëkk contre Suuf ; `farm` : Jën contre Tool ;
  `warehouse` : Dépôt contre Magasin ; `sale` : Jënd contre Njaay ; `rent` : Tëddé contre
  Luwaas). Ils restent hors périmètre **par disjonction d'objet, pas parce qu'ils vont bien** :
  c'est [TCK-342](TCK-342-libelles-wolof-divergents-back-front.md) qui les porte, et il vise
  la même séance de validation.
- La détection de la langue de la requête : les alias élargissent le rappel dans un index
  unique, sans routage par langue.

## Notes d'implémentation

### Ce qui est livré, et pourquoi à vide

`Property::TYPE_SEARCH_ALIASES_WO` (16 clés) et `Property::CONTRACT_SEARCH_ALIASES_WO`
(2 clés) sont **présentes et vides**. `Property::joinSearchAliases()` concatène l'alias
français et l'alias wolof d'une même clé, en écartant les valeurs vides **avant** la jointure :
tant que la table wolof est vide, la chaîne produite est identique au caractère près à celle
d'avant, sans même une espace de fin — un espace de fin suffirait à faire diverger les 795
documents et à devoir tout réimporter pour rien.

Le helper emploie `static::` et non `self::` : la liaison tardive est ce qui permet à un double
de test de redéclarer les constantes et de **prouver** que le chemin de concaténation existe.
Sans elle, la seule preuve disponible serait « rien n'a changé » — qu'une implémentation
ignorant purement la table wolof cocherait tout aussi bien.

### Les trois faits du moteur qui gouvernent l'écriture des mots

Mesurés le 2026-08-21 sur l'index vivant, et rappelés en tête de la feuille de séance :

1. **Les diacritiques sont normalisés**, à l'indexation comme à la requête. `q=mëublé` et
   `q=meuble` rendent le même ensemble (319) ; `ë`, `ï`, `é` se ramènent à la lettre nue.
   Écrire l'alias avec ou sans diacritique ne change rien, ni en bien ni en mal.
2. **`oneTypo` démarre à 5 caractères** (`twoTypos` à 9). **Sous 5 lettres, la tolérance aux
   fautes est nulle** : `q=ker` ne rend pas « Keur » (0 contre 40). Le wolof compte beaucoup de
   mots de 3 ou 4 lettres ; ceux-là n'auront droit à aucune approximation de saisie, et c'est
   une raison de préférer, à sens égal, la forme la plus longue.
3. **Le dernier mot de la requête est cherché comme un PRÉFIXE** : `q=appar` rend les 210
   appartements. Un alias wolof court peut donc être happé par un mot français plus long qui
   le commence, sans que personne ne l'ait voulu.

### La feuille de séance

```bash
cd takussan-api && php artisan search:wolof-review-sheet
php artisan search:wolof-review-sheet --probe=<mot proposé en séance>
php artisan search:wolof-review-sheet --no-hits    # hors ligne, sans Meilisearch
```

Elle imprime 18 lignes — 16 types, 2 contrats — avec, pour chacune : l'alias français en
vigueur, le libellé wolof du back (`lang/wo/properties.php`), celui du front
(`takussan-web/src/messages/wo.json`), un marqueur `≠` quand les deux diffèrent, **le nombre de
biens que chaque mot atteint déjà dans l'index**, et une colonne vide pour la réponse du
locuteur. Une seconde table trie tous les mots sondés par nombre de hits décroissant, avec la
**répartition par type de bien** : c'est elle qui distingue une collision d'adresse (« keur »,
tous types) d'une collision de type (« Magasin » → `shop:56`).

**Relevé du 2026-08-21** — les libellés d'affichage déjà pris dans le corpus :

| mot | source | hits | types atteints |
|---|---|---|---|
| Appart | lang/wo | 210 | `apartment:210` |
| Villa | lang/wo | 142 | `villa:64 house:29 apartment:11 warehouse:9` |
| Studio | les deux | 84 | `studio:68 apartment:16` |
| Garaj | lang/wo | 60 | `garage:60` |
| Boutik | lang/wo | 56 | `shop:56` |
| **Magasin** | wo.json | 56 | **`shop:56`** ← libellé de `warehouse` |
| keur | (sonde) | 40 | `apartment:12 shop:6 house:4 office:3` |
| **Parking** | les deux | 36 | **`garage:32 parking:4`** |
| Usine / Usin / Hôtel | — | 4 | `factory:4` / `factory:4` / `hotel:4` |

Les 24 autres mots relevés rendent 0 — ce qui, pour un alias de recherche, est la situation
**souhaitable** : le mot n'est encore pris par rien.

### La séance elle-même

Trois questions par ligne, dans cet ordre — la commande les imprime en pied de feuille :

1. Ce mot désigne-t-il bien **ce type de bien**, pas un objet voisin ?
2. Est-ce le mot qu'on **taperait** pour chercher, ou celui qu'on lit ? Un alias est un mot
   d'intention, pas une étiquette.
3. Y a-t-il un **second** mot d'usage courant ? Plusieurs jetons par clé sont permis, séparés
   par une espace : c'est du rappel gagné à coût nul.

Les réponses se reportent dans les deux constantes de `Property`, **jamais dans `lang/`**, puis
`php artisan scout:import "App\Models\Property"`.

## Reste sur dev

**La mécanique est fusionnée ; le vocabulaire ne l'est pas, et il ne le sera pas sans un locuteur.**
`TYPE_SEARCH_ALIASES_WO` et `CONTRACT_SEARCH_ALIASES_WO` portent les 18 clés d'enum et **aucune
valeur** — no-op prouvé contre les 795 documents de l'index. AC2 à AC6 sont fermés par
`tests/Unit/PropertySearchableArrayTest.php`. **AC1 et AC7 restent ouverts** : ils demandent des
mots, et qui les a validés.

Ce qui les ferme, et rien d'autre :

```bash
cd takussan-api && php artisan search:wolof-review-sheet
```

18 lignes, dont la dernière colonne est vide. Chaque ligne porte déjà l'alias français indexé, le
libellé wolof du back, celui du front, et — c'est là qu'est la valeur — **le nombre de biens que le
mot atteint DÉJÀ**, avec leur répartition par type.

**Deux mots ont ainsi été écartés avant même la séance**, et aucune revue purement lexicale ne les
aurait vus :

| mot | ce qu'il devait désigner | ce qu'il atteint réellement |
|---|---|---|
| `Magasin` | `warehouse` (libellé wolof du front) | **56 boutiques, 0 entrepôt** — le mot est déjà pris par l'alias français de `shop` |
| `keur` | `house` | **40 biens de tous types** — *Cité Keur Gorgui* est un quartier |

*Le risque de ce ticket n'est pas lexical, il est de corpus* : un mot juste en wolof peut être déjà
occupé en français ou par une adresse. Un locuteur l'aurait validé sans hésiter.

Une fois la feuille remplie, ajouter un alias est **une ligne de données**, et les invariants
d'AC3 à AC6 la valident en CI.

⚠ La séance porte sur **les deux tables à la fois** — alias de recherche *et* libellés d'affichage
(cf. [TCK-342](TCK-342-libelles-wolof-divergents-back-front.md)) : ce sont les mêmes 18 mots, et
faire revenir le locuteur deux fois est le seul coût réellement irréductible ici.

