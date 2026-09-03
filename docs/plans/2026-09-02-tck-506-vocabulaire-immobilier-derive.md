# Plan — TCK-506 · vocabulaire immobilier dérivé des colonnes dans l'index

Ticket : [`TCK-506`](../backlog/tickets/TCK-506-vocabulaire-immobilier-derive-dans-lindex.md).
Branche : `feat/tck-506-vocabulaire-immobilier-derive`. Backend seul, aucune migration.

## Mesures préalables (2026-09-02, index local `takussan_localproperties`, 252 biens publics)

**Collision de corpus des alias candidats** — sonde solo, stratégie `all`, facette `type` :

| Alias | Hits | Répartition | Verdict |
|---|---|---|---|
| `appart` | 61 | apartment 61 | adopté |
| `parcelle` | 49 | land 25, reste dispersé (descriptions) | adopté — majorité `land` |
| `lot`, `depot`, `colocation`, `auberge`, `lodge`, `campement`, `verger` | 0 | — | adoptés, aucun jeton pris |
| `hangar` | 18 | warehouse 18 | adopté |
| `local commercial` | 13 | shop 13 | adopté (le couple ; `local` seul est déjà bruité par le préfixe de « location ») |
| `plateau de bureaux` | 4 | office 4 | **écarté** : `plateau` seul rend 24 biens de 10 types — c'est le quartier. L'alias enverrait tout chercheur du Plateau sur 90 bureaux |
| `champ` | 73 | room 38, house 14, villa 14, farm **0** | **écarté** : majoritairement un autre type |

## Tâches

1. `tests/Unit/PropertyLabelsTest.php` — en table, RED.
2. `app/Support/Search/PropertyLabels.php` — classe pure : `FAMILLES`, `rooms()`, `facts()`, `title()`.
3. `Property::toSearchableArray()` + alias enrichis ; `config/scout.php` (ordre + commentaire mesuré).
4. `tests/Unit/PropertySearchableArrayTest.php` — trois champs présents, `derived_title` déclaré
   searchable, `FAMILLES` couvre exactement `PropertyType`.
5. `tests/Feature/Search/PropertyDerivedVocabularyTest.php` — corpus à titres muets, un scénario
   par requête de la prémisse, ablation jouée.
6. Seed : `SenegalFakerProvider` (F = chambres + 1), `PropertySeeder` et `PropertyFactory`
   (pas de chambres hors habitation) ; test unitaire du provider et de la factory.
7. `scripts/deploy.sh` — un diff de `app/Support/Search/*.php` réimporte `Property`.
8. Position de `derived_title` : test de TCK-335 vert → notes. Réindexation locale chronométrée.
9. Pint, tests impactés, `php artisan test` entier (session principale), notes, PR.

## Ce que l'implémentation a mesuré (2026-09-02)

⚠ Toutes les durées ci-dessous sont prises **sous charge** — deux suites Pest `--parallel` d'autres
projets tournaient sur la machine (`load average` 200-330 sur 8 cœurs). Elles décrivent la machine,
pas le dépôt ; aucune ne sert de référence.

**Le chiffre nu, ou pourquoi « 4 pièces » n'est pas couvert.** Première forme de `rooms_label` :
`F4 T4 4 pieces 3 chambres 3 chambres salon`. Sur le corpus de test, `q=4 pieces` rendait le bien à
**4 chambres** (« 5 pieces 4 chambres ») en plus du bien à 3 — un document est un sac de mots, et
chaque chiffre nu qu'il porte répond à toute requête « N … ». Forme retenue : **un seul chiffre nu
par document habitable, celui des chambres** ; `sdb` sans compte, `{n}e etage` sans chiffre nu,
`R+{n}` seul (le `+` sépare, « R n » était un doublon).

**« chambre » tolère une faute.** 7 lettres > `oneTypo = 5` : « chambre » matche « chambres », et
`q=chambre salon` rend tous les biens à n ≥ 2 chambres. C'est le classement qui isole le bien à
1 chambre (règles `typo` puis `exactness`) — AC3 est un test de rang, pas d'ensemble.

**Ablations (`PropertyDerivedVocabularyTest`, une ligne renommée dans `toSearchableArray()`)** :

| Retiré | Rougit | Reste vert |
|---|---|---|
| `rooms_label` | AC2 (`T4`, `3 chambres`…), AC3 | **AC1** — `derived_title` porte « F4 » |
| `rooms_label` + `derived_title` | AC1 | AC5 (le terrain n'a jamais de F4) |
| `facts_label` | AC4 | tout le reste |
| `derived_title` | le test de classement | **AC1 à AC5** |

**Ce que `derived_title` achète.** Par construction il ne porte aucun jeton nouveau (F(n) est dans
`rooms_label`, le type dans `type_label`, le lieu dans `neighborhood`/`city`) : il n'élargit pas
l'ensemble rendu. Il fait rivaliser les colonnes avec un titre libre. Sondé sur un index jetable
avec `showRankingScoreDetails`, appartement à Mermoz (colonnes) contre « Appartement avec vue sur
Mermoz » à Ouakam (texte), `q=appartement F4 Mermoz` :

| | proximity | attribute | premier |
|---|---|---|---|
| avec `derived_title` | 0,857 contre 0,571 | — | le bien de Mermoz |
| sans | 0,142 contre 0,142 | 0,644 contre 0,703 | le témoin |

⚠ `proximity` est sensible à l'**ordre des mots** : `q=appartement Mermoz F4` rend le témoin premier
dans les deux cas (0,571 contre 0,428). La première version du test (`appartement F4 Mermoz` avec un
témoin dont la **description** disait « appartement Mermoz ») restait verte sous ablation :
`attribute` tranchait déjà pour le bien de Mermoz via son `title`. *Un test de classement qui ne
rougit pas sous ablation ne mesure rien ; il a fallu un témoin dont le titre bat le type.*

**Position de `derived_title` (2ᵉ)** : l'arbitre de TCK-335
(`PropertySearchVocabularyTest::test_le_vocabulaire_elargit_le_rappel_sans_reordonner_la_pertinence`)
reste vert.

**Le `+` de « R+1 », sondé sur index jetable (2026-09-02)** — cinq documents : villa R+1 150 m²,
villa basse 150 m², appartement 1 chambre, villa R+2, villa R+10 :

| Requête | sans `dictionary` | `dictionary` R+0…R+10 (une casse) | les deux casses |
|---|---|---|---|
| `villa R+1` | R+1, R+10, **villa basse** (150 m2 : préfixe du « 1 ») | R+1, R+10 | R+1, R+10 |
| `villa r+1` | — | **0** (casse) | R+1, R+10 |
| `villa r+1␣` (espace final) | R+1 | 0 | R+1 |
| `1 chambre` | appart, **villa R+1** | appart | appart |
| `R 1` | R+1, R+10, villa basse | 0 | 0 (repli TCK-338) |

Ce qui a décidé : un jeton composé côté document ET côté requête ferme le chiffre nu et le préfixe
en une seule mesure, sans synonyme (contrainte 3 tenue). Ce qui reste : R+10 sur `q=…R+1` sans
espace final — préfixe du dernier mot, accepté.
