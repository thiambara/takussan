# ADR-0024 — La recherche publique exige TOUS les termes, et nomme ce qu'elle a dû relâcher

- **Statut** : Accepté
- **Date** : 2026-08-21
- **Tickets** : TCK-338 (sorti de [TCK-335](../backlog/tickets/TCK-335-recherche-navigation-defauts-mesures.md))
- **Frère de** : [ADR-0008](0008-meilisearch-sur-tous-les-environnements.md) — il décide *quel moteur*,
  celui-ci décide *ce que le moteur promet*.

> ⚠ **CET ADR S'EST APPELÉ `ADR-0020` DU 2026-08-21 AU 2026-08-22, ET IL N'ÉTAIT PAS SEUL.**
> [ADR-0020](0020-postgresql-sur-tous-les-environnements.md) — PostgreSQL sur tous les
> environnements — porte le même numéro, écrit le même jour. Deux décisions structurelles, un seul
> identifiant, et l'index les listait toutes les deux en `0020` sans que rien ne le signale.
>
> Le coût n'était pas le désordre, c'était l'**ambiguïté d'une référence** : 25 fichiers du dépôt
> citaient « ADR-0020 » sans lien, et le lecteur ne pouvait pas savoir lequel des deux était visé.
> [ADR-0023](0023-recherche-geographique-par-distances-sans-postgis.md) en portait déjà la trace —
> elle avait dû écrire « ADR-0020 *de la recherche conjonctive* » pour se faire comprendre. *Une
> référence qui a besoin d'une glose n'est plus une référence.*
>
> C'est celui-ci qui a été renuméroté, et pas l'autre, parce qu'il était le moins cité : 18
> citations contre plus de 40 pour PostgreSQL, dont une garde de CI entière
> (`scripts/check-db-engine.mjs`). Les 18 ont été reclassées une par une, en lisant le contexte de
> chacune — un remplacement global aurait renuméroté les citations de l'autre décision.
> **Un lien `adr/0020-recherche-publique-conjonctive-…` trouvé ailleurs pointe vers ce fichier.**

> ⚠ **Cet ADR est soumis DANS LA MÊME PR que son implémentation.** La règle du dépôt — « l'ADR
> avant le code » — porte sur l'ordre de la *décision*, pas sur l'ordre des merges : la décision a
> été arbitrée et écrite avant la première ligne de `PropertySearchService`, et les mesures
> ci-dessous ont toutes été prises **avant** d'écrire ce service. Rien dans le code livré ne dépend
> du merge de ce fichier, et il n'y avait pas de merge intermédiaire à faire : un agent délégué ne
> pousse pas.

## Contexte

Meilisearch applique par défaut `matchingStrategy: "last"` : quand un document ne porte pas tous les
termes, le moteur **retire des termes de la requête** — par la fin — plutôt que d'exclure le
document. Seul le **premier** terme est réellement obligatoire, et il l'est **document par
document** : il n'existe aucun « ensemble des termes relâchés » global à la requête.

Ce que cela produit, mesuré le 2026-08-21 sur la base locale (836 biens, 258 publics à l'index,
filtre public complet de `PropertySearchService::publicFilter()`), **TCK-335 déjà en place** :

| requête | `last` (défaut) | `all` |
|---|---|---|
| `villa` | 63 | 63 |
| `villa Saly` | **63** — les mêmes ids, dans le même ordre | **0** |
| `villa Dakar` | 63 | 47 |
| `Saly` seul | 0 | 0 |

`q=villa Saly` rendait donc 63 villas de Dakar, d'Almadies et de Ngor à quelqu'un qui a écrit
« Saly ». Ce n'est pas un défaut de classement — c'est le **total** qui est faux : `meta.total`
promet 63 biens correspondant à la demande, alors qu'aucun bien ne correspond au mot qui portait
toute l'intention.

TCK-335 avait posé les mots vides et le vocabulaire d'intention (`contract_label`,
`furnished_label`). Ces deux leviers **élargissent le rappel et corrigent le classement** ; aucun des
deux ne referme la conjonction. C'est une décision distincte, et elle change le contrat de la
recherche pour tout le site — d'où cet ADR.

## Décision

**Deux régimes, dans cet ordre, sur la recherche publique de biens.**

1. **Régime nominal — `matchingStrategy: 'all'`.** Un document ne sort que s'il porte **tous** les
   termes utiles de la requête (les mots vides de `config/scout.php` sont retirés par le moteur,
   à la requête comme à l'indexation).
2. **Repli explicite — `last` + sondes.** Quand le régime nominal rend **0** *et* que la requête
   porte **au moins deux** termes utiles, la recherche est rejouée en `last`, et **chaque terme est
   sondé seul**. La réponse porte alors un bloc `search` qui **nomme les termes dont la sonde solo
   rend 0** — et uniquement ceux-là.

Le repli n'est pas un ornement : **il est constitutif de la décision**, cf. « Ce que ça coûte »
ci-dessous. Sans lui, on ne remplace pas un mensonge par une vérité, on le remplace par un
cul-de-sac.

### Ce que le repli a le droit de dire

`terms_unmatched` ne contient **que des termes effectivement sondés seuls et rendus à 0**. C'est la
seule affirmation prouvable :

> « Aucun bien du catalogue ne correspond à *Saly*. »

C'est aussi la seule que le moteur permette. **Meilisearch ne rend pas les termes qu'il a
relâchés** : il n'y a ni champ de réponse, ni ensemble global à lire — sous `last`, le sous-ensemble
retenu varie d'un document à l'autre. La formulation initiale du ticket (« la réponse nomme les
termes relâchés ») décrivait donc une information qui n'existe pas ; elle a été remplacée par
celle-ci, qui se calcule.

Deux cas, et ils sont distincts pour l'utilisateur :

| cas | exemple mesuré | `terms_unmatched` | ce que le front doit dire |
|---|---|---|---|
| un terme n'existe nulle part | `villa Saly` → `all` 0, solo `villa` 63 / `Saly` **0** | `["Saly"]` | « Aucun bien ne correspond à *Saly*. » |
| tous les termes existent, leur intersection non | `studio piscine` → `all` 0, solo `studio` 44 / `piscine` **3** | `[]` | « Aucun bien ne réunit tous ces mots. » |

Dans le second cas on ne nomme **aucun** terme : chacun est vrai séparément, désigner l'un d'eux
serait inventer un coupable.

### Forme du contrat

`GET /api/public/properties/search` gagne une clé de premier niveau, à côté de `data`, `facets`,
`meta` :

```jsonc
"search": {
  "strategy": "all",        // ou "widened"
  "terms_unmatched": [],    // toujours présent, [] sous "all"
  "widened_total": null     // null sous "all"
}
```

Sous `widened`, `data`, `facets` et `meta` décrivent le résultat **élargi** — pagination comprise —
et `widened_total` en est l'écho (`widened_total === meta.total`, par construction). Il est présent
pour que le message du front ne dépende pas de la lecture de la pagination, jamais pour porter un
compte que `meta` contredirait. `meta` reste construite par `PaginationMeta::of()` : cet ADR
n'ouvre pas une seconde forme d'enveloppe.

**Pourquoi rendre les résultats élargis plutôt qu'une page vide + un compte.** Une page vide
assortie d'un « 63 résultats si vous relâchez *Saly* » oblige l'utilisateur — ou le front — à
relancer une requête pour voir ce qu'on vient de lui décrire. Le repli livre donc les biens, et
c'est `strategy` + `terms_unmatched` qui interdisent de les présenter comme une réponse exacte.
C'est le motif « Showing results for … » : il n'est honnête que si l'étiquette est là.

### Un seul aller-retour

Le repli tient dans **un seul `POST /multi-search`** : requête élargie en position 0, puis une sonde
par terme (`matchingStrategy: 'all'`, `hitsPerPage: 0`, même filtre). Mesuré le 2026-08-21 sur la
base locale : **6 à 30 ms** pour 2 à 4 termes. Le chemin nominal, lui, reste à **une** requête — le
repli ne coûte qu'aux requêtes qui rendent 0.

Les sondes portent **le même filtre structuré** que la recherche (`city`, `price_min`, …). La phrase
rendue est donc vraie *dans le contexte affiché* : sous `filter[city]=Dakar`, « aucun bien ne
correspond à *Saly* » parle du catalogue de Dakar, qui est celui que l'utilisateur regarde.

## Ce que ça coûte — mesuré, et c'est la raison d'être du repli

Le passage en `all` est **brutal** sur un catalogue mince. Trois mesures du 2026-08-21 :

1. **La faute de frappe devient fatale.** `villa dakr` : **63 → 0**, sans aucune dégradation
   intermédiaire. `dakr` fait 4 caractères, sous le seuil
   `typoTolerance.minWordSizeForTypos.oneTypo = 5` : le moteur ne corrige pas, et `all` exclut. Sous
   `last`, la faute était simplement ignorée.
2. **La requête naturelle à deux mots tombe souvent.** Sur les 60 couples *(type de bien × ville)*
   construits à partir des 6 types courants et des 10 villes les plus représentées,
   **30 rendent 0 sous `all`** — la moitié. Le catalogue local compte 258 biens publics dont 210 à
   Dakar : hors de Dakar, deux mots suffisent à vider la page.
3. **Le seul régime que personne n'éprouve est celui que tout le monde exécute** : ces deux coûts ne
   se voient pas sur `q=villa` (63 dans les deux régimes) ni sur aucune requête mono-terme. Ils ne
   se voient que sur les requêtes que les utilisateurs écrivent réellement.

Le repli couvre les trois : il rend les 63 villas pour `villa dakr` en disant que *dakr* ne
correspond à rien, et il rend quelque chose pour les 30 couples vides. **Livrer `all` sans le repli
serait une régression produit**, et c'est pourquoi les deux sont une seule décision.

## Ce que ça gagne — la mesure qui a tranché

`all` **coïncide avec le filtre structuré équivalent**, mesuré le 2026-08-21 sur six types de
biens (base locale, filtre public complet) :

| requête texte | sous `all` | `q=<type>&city=Dakar` | sous `last` |
|---|---|---|---|
| `villa Dakar` | **47** | 47 | 63 |
| `appartement Dakar` | **24** | 24 | 35 |
| `studio Dakar` | **33** | 33 | 44 |
| `maison Dakar` | **19** | 19 | 23 |
| `bureau Dakar` | **34** | 34 | 38 |
| `terrain Dakar` | **21** | 21 | 24 |

**6 coïncidences sur 6** — et six divergences sur six sous `last`. Autrement dit :
sous `all`, écrire la ville dans la barre de recherche rend exactement ce que cocher la ville dans
les filtres rend. Sous `last`, les deux chemins divergeaient (63 contre 47) sans que rien ne le
signale. **Deux chemins qui portent le même mot doivent rendre le même compte** — c'est la même
règle qui a fait extraire `publicFilter()` en TCK-335 pour que la facette et la recherche cessent de
se contredire.

## Alternatives écartées

**`matchingStrategy: 'frequency'`** — le moteur retire les termes par fréquence décroissante au
lieu de les retirer par la fin. **Mesurée, pas déduite**, le 2026-08-21 :

```
q=villa Saly      last=63   all=0   frequency=63
q=villa dakr      last=63   all=0   frequency=63
q=studio piscine  last=44   all=0   frequency=3
```

Sur le défaut de tête — celui qui a ouvert le ticket — `frequency` rend **exactement ce que rendait
`last`** : 63 villas pour quelqu'un qui a écrit « Saly ». Elle ne corrige donc rien de ce qu'on
cherche à corriger, et sur `studio piscine` elle rend un ensemble (3) que ni l'utilisateur ni nous
ne pouvons prédire depuis la requête. Écartée.

**Post-filtrer la page côté PHP** (ne garder que les hits portant tous les termes) — écarté, et
c'est le piège que les critères d'acceptation du ticket cochaient sans le voir : cela produit un
total ≤ `per_page`, non nul et inférieur à 63, donc *plausible*, avec une pagination morte et un
`meta.total` faux. Un moteur qui pagine doit filtrer dans le moteur.

**Un réglage d'index** — écarté : `matchingStrategy` est un **paramètre de requête**. Sa portée est
naturellement limitée à l'appelant qui le pose, ici la seule recherche publique. Les autres
consommateurs de l'index (`SuggestService` et sa `facet-search`, l'admin) ne changent pas de
comportement, et il n'y a **pas de réindexation** à faire pour appliquer cet ADR ni pour le révoquer.

**L'analyse d'intention** — transformer « Saly » en `filter[city]=Saly` — reste hors périmètre. Elle
supprimerait la question plutôt que d'y répondre, et c'est un cran de plus (TCK-338 § Hors
périmètre).

## Conséquences

- **Le contrat de `/api/public/properties/search` change** : `meta.total` devient un compte
  conjonctif. Tout client qui comparait un total à une valeur mesurée sous `last` la verra bouger.
  Les comptes **mono-terme** acquis par TCK-335 (`q=louer` → 204, `q=vente` → 54, `q=villa` → 63)
  sont **invariants** : `matchingStrategy` n'a aucun effet à un seul terme utile, et un test les
  épingle.
- **⚠ Le front ne sait pas encore afficher le repli, et il faut mesurer ce que cela laisse
  ouvert.** `takussan-web/src/types/search.ts` déclare `SearchResult` avec `data`, `facets` et
  `meta`, et rien d'autre : `search.strategy` et `search.terms_unmatched` arrivent dans le JSON et
  **meurent là**. Conséquence exacte, et elle se sépare en deux cas :

  | à l'écran | avant | après cet ADR, sans l'étiquette |
  |---|---|---|
  | `villa Dakar` (conjonction non vide) | 63 biens, dont ceux qui ignorent « Dakar » | **47**, tous à Dakar — corrigé |
  | `villa Saly` sur un catalogue sans Saly | 63 villas de Dakar | **63 villas de Dakar** — inchangé |

  Sur la seconde ligne, la charge utile est **identique à l'octet près** hors du bloc `search` :
  ce que l'ADR corrige, c'est le CONTRAT (`meta.total` ne prétend plus décrire une correspondance
  exacte), pas encore l'écran. **L'objectif utilisateur du ticket — « un visiteur qui cherche
  *villa Saly* ne reçoit pas des villas de Dakar » — n'est donc pas atteint tant que le front ne
  rend pas l'étiquette.** Le back est la moitié nécessaire ; elle n'est pas suffisante, et écrire
  le contraire serait exactement le genre d'AC qu'une régression coche. C'est la dette explicite
  que TCK-338 porte en « hors périmètre ».
- **Les chiffres de cet ADR sont pris sur Meilisearch 1.36.0** (machine de développement). La CI et
  `docker-compose.yml` tournent sur **v1.16** — l'écart de version est celui qu'ADR-0008 documente
  déjà (ardoise D-09). Le *comportement* décidé ici ne dépend pas de la version (`matchingStrategy`
  existe depuis 1.0) ; les *comptes*, eux, sont ceux d'un jeu de données local, jamais des
  invariants. Les tests de non-régression sont donc écrits sur un corpus semé, pas sur ces
  chiffres-là.
- **Révocation** : retirer une ligne (`'matchingStrategy' => 'all'`) rétablit exactement le
  comportement antérieur. C'est la propriété qui rend cette décision peu coûteuse à défaire, et
  c'est aussi ce qui la rend facile à défaire par accident — d'où l'ablation exigée sur chaque test.

## Application

| quoi | où |
|---|---|
| les deux régimes, la sonde, le bloc `search` | `takussan-api/app/Services/Search/PropertySearchService.php` |
| le contrat de bout en bout, et le repli **exercé** | `takussan-api/tests/Feature/Search/RechercheConjonctiveTest.php` |
| les acquis mono-terme de TCK-335, épinglés contre le passage en `all` | `takussan-api/tests/Feature/Search/PropertySearchVocabularyTest.php` |
| les mots vides dont se déduisent les « termes utiles » | `takussan-api/config/scout.php` — **lus**, jamais recopiés |

Chaque test de `RechercheConjonctiveTest` a été vérifié **par ablation** : le retrait de
`'matchingStrategy' => 'all'` ou du repli le fait rougir. Un test de conjonction qui reste vert sans
la conjonction ne prouve rien — et c'est un piège concret ici, parce que la décision se défait en
retirant une seule ligne.
