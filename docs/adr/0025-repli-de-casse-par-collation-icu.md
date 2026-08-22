# ADR-0025 — Le repli de casse passe par `COLLATE "und-x-icu"`, jamais par `lower()` nu

- **Statut** : Accepté
- **Date de la décision** : 2026-08-22
- **Tickets** : —
- **ADR liés** : [ADR-0020](0020-postgresql-sur-tous-les-environnements.md) §4.2 (les six contraintes
  d'unicité sur texte), [ADR-0007](0007-pas-d-enum-sql.md) (indirectement : même famille de décisions
  « la base garde les données, l'application garde le comportement »)

## Contexte

### ADR-0020 a posé une intention que son implémentation ne tenait qu'à moitié

ADR-0020 crée la base en `--encoding=UTF8 --locale=C` : collation **déterministe**, sensible à la
casse et aux accents. C'est la décision la plus lourde de cet ADR, et elle est délibérée —
PostgreSQL refuse `LIKE` sur une collation non déterministe, et le dépôt en compte 21.

Elle met à découvert six contraintes d'unicité sur texte, que l'ancien `utf8mb4_0900_ai_ci`
rendait insensibles à la casse. La migration `2026_08_21_130000_add_case_insensitive_unique_indexes`
en restaure trois par un index sur `LOWER(col)` — `tags.name`, `users.username`, `users.email`.

**Cet index ne fait pas ce qu'il annonce.** `lower()` emprunte la collation de son argument ; sous
`--locale=C`, elle ne replie que l'ASCII A-Z. Mesuré le 2026-08-22 sur le conteneur qui tourne :

```sql
SELECT lower('CAFÉ'), lower('CAFÉ') = lower('Café');
 cafÉ | f

SELECT lower('DAKAR') = lower('Dakar');
 t
```

### La preuve, par ablation, avant toute correction

Sur une base jetable créée avec la même locale, avec l'index **exact** posé par la migration :

```sql
CREATE UNIQUE INDEX tags_name_lower_unique ON tags (LOWER(name));

INSERT INTO tags (name) VALUES ('Dakar');
INSERT INTO tags (name) VALUES ('DAKAR');   -- ERROR: duplicate key ✔ attrapé
INSERT INTO tags (name) VALUES ('Café');
INSERT INTO tags (name) VALUES ('CAFÉ');    -- INSERT 0 1  ✘ PASSE
```

L'index dont la raison d'être **entière** est de refuser les variantes de casse laisse passer la
variante de casse dès que la lettre concernée n'est pas de l'ASCII.

### Pourquoi la suite ne l'a jamais vu

`tests/Feature/Database/CaseInsensitiveUniquenessTest` teste exactement cette règle. Sa valeur est
`'Dakar'.bin2hex(…)`, et sa variante `strtoupper($valeur)` — or `strtoupper()` de PHP est
**ASCII-only**. Le test éprouvait le seul cas où le défaut ne se manifeste pas.

Même forme dans `HomepageDiscoveryTest::test_city_matching_ignores_case` : `Ziguinchor` /
`ZIGUINCHOR`, purement ASCII.

> *Un test dont la donnée évite le cas limite ne garde pas la règle, il garde l'exemple.*

### La portée réelle, mesurée et non déduite

| Site | Effet du défaut | Atteignable par |
|---|---|---|
| `tags_name_lower_unique` | deux tags `Café` / `CAFÉ` coexistent | seeder, import, `DB::table()->insert()` |
| `users_username_lower_unique` | deux pseudonymes qui ne diffèrent que par la casse d'une lettre accentuée | idem |
| `users_email_lower_unique` | idem sur l'e-mail — `User::setEmailAttribute()` couvre le chemin Eloquent, pas les autres | idem |
| `CustomerTagController.php:42` | `LOWER(name) = ?` ne retrouve pas le tag saisi dans une autre casse | HTTP |
| `HomepageDiscoveryService::cityCandidates()` | une ville **stockée** `THIÈS` n'est pas trouvée par un visiteur géolocalisé à `Thiès` : la ligne « près de toi » bascule sur Dakar, `fallback: true`, sans qu'aucune erreur ne soit levée | HTTP public |
| 4 × `…InvitationService` | `LOWER(email) = ?` — même cause, portée résiduelle (les e-mails accentués en capitales sont rares, pas impossibles) | HTTP |

⚠ **Le sens compte, et la première version du test de ville l'avait à l'envers.** `lower('Thiès')`
rend bien `thiès` : le `è` est déjà minuscule, seul le `T` est replié. C'est `lower('THIÈS')` qui
rend `thiÈs`. **La valeur fautive est celle qui est STOCKÉE en capitales.** Mesuré sur la base de
développement : `0` adresse dans ce cas aujourd'hui — le défaut est donc **latent** sur ce site-là,
et actif sur les trois index, où il suffit d'un import.

## Décision

**Toute comparaison de texte insensible à la casse — index comme requête — s'écrit
`LOWER(col COLLATE "und-x-icu")`.**

`lower(col)` nu est un écart, pas une variante.

### Pourquoi `und-x-icu`, mesuré propriété par propriété

| Propriété exigée | Vérification | Résultat |
|---|---|---|
| replie la casse hors ASCII | `lower('CAFÉ' COLLATE "und-x-icu")` | `café` ✔ |
| **ne mange PAS les accents** | `lower('CAFÉ' COLLATE "und-x-icu") = 'cafe'` | `f` ✔ |
| **déterministe** — `LIKE` reste possible | `collisdeterministic` sur `und-x-icu` | `t` ✔ |
| l'index est bien EMPRUNTÉ par la requête | `EXPLAIN` sur 5000 lignes | `Index Scan` ✔ |
| aucune extension à installer | ICU est fourni par l'image | ✔ |

**`und` — la locale racine — et pas une locale de pays.** Le repli de casse est localisé : mesuré,
`lower('ISTANBUL' COLLATE "tr-x-icu")` rend `ıstanbul` avec un i sans point. Choisir une locale
nationale ferait dépendre l'unicité d'une base de la langue supposée de ses données.

### Ce que cette décision ne fait PAS, et c'est la reconduction d'un choix d'ADR-0020

**Elle ne restaure pas l'insensibilité aux ACCENTS.** `Café` et `Cafe` restent deux valeurs
distinctes. C'est explicitement voulu, et la raison est déjà écrite dans
`2026_08_21_130000` : *« `José` et `Jose` sont deux adresses e-mail DIFFÉRENTES, et deux noms de
personne différents. L'insensibilité aux accents de MySQL était un défaut de collation subi, jamais
une règle métier écrite. »* La restaurer exigerait l'extension `unaccent`, qu'ADR-0020 §2 refuse
d'installer sans un ticket qui la porte.

**Cet ADR ne rouvre donc rien de ce débat.** Il corrige la CASSE, qui était censée être couverte et
ne l'était qu'en ASCII.

### Le couplage index ↔ requête est une contrainte dure

Mesuré sur 5000 lignes, index `LOWER(name COLLATE "und-x-icu")` en place :

```
EXPLAIN SELECT … WHERE LOWER(name COLLATE "und-x-icu") = 'café';   → Index Scan  ✔
EXPLAIN SELECT … WHERE LOWER(name) = 'café';                       → Seq Scan    ✘
```

**Changer l'index sans changer les requêtes transforme chaque recherche insensible à la casse en
balayage complet, silencieusement.** Les deux bougent ensemble ou pas du tout. C'est la raison pour
laquelle cet ADR porte sur une FORME d'écriture et pas seulement sur un jeu d'index.

## Conséquences

### Ce qui change

- `2026_08_22_100000_recreate_case_insensitive_indexes_with_icu_collation` recrée les trois index.
- Les 6 sites applicatifs qui écrivent `LOWER(col) = ?` passent à la forme ICU.
- Un index unique **partiel** est enfin posé sur `agency_roles (agency_id, base_profile_type)
  WHERE is_system` — invariant que la spec exige, tenu jusqu'ici seulement par l'application, sur
  la foi d'une limite de MySQL qui n'a plus cours.

### Ce que ça coûte

- **Verrouillage.** `CREATE UNIQUE INDEX` prend un `ACCESS EXCLUSIVE` sur la table. Sur les volumes
  actuels c'est instantané ; le jour où ça ne le sera plus, `CONCURRENTLY` existe — et ne peut pas
  vivre dans une migration transactionnelle.
- **La migration ÉCHOUE si des doublons existent déjà**, et c'est le comportement voulu : un
  doublon de casse est une donnée à arbitrer, pas à écraser. Mesuré avant écriture sur la base de
  développement : `0` doublon sur les trois colonnes, `0` violation sur `agency_roles`.
- Une écriture de plus à retenir. C'est le prix d'une collation déterministe, et il est plus bas
  que celui d'une collation non déterministe, qui interdirait `LIKE` sur 21 sites.

### Ce qui n'est pas fait ici, et pourquoi

- **`addresses.city` ne reçoit aucun index.** La requête de découverte est déjà un balayage, la
  table est petite, et poser un index par symétrie plutôt que par mesure est exactement ce que le
  piège n°8 du `CLAUDE.md` interdit (« à indexer **par mesure** (`EXPLAIN`) et non en masse »).
- **Aucune normalisation des données existantes.** On indexe `LOWER(col)`, on ne force pas la
  colonne en minuscules : `Dakar` reste affiché `Dakar`. Seule la comparaison change.

## Alternatives écartées

| Alternative | Pourquoi non |
|---|---|
| **`citext`** | une extension à installer pour ce que la collation sait déjà faire ; et `citext` est une propriété de la COLONNE, donc une migration de type sous `ACCESS EXCLUSIVE` sur 6 colonnes au lieu d'une expression d'index |
| **Collation non déterministe** (`ICU … deterministic=false`) | PostgreSQL **refuse `LIKE`** sur une collation non déterministe, et le dépôt en compte 21. C'est le motif exact pour lequel ADR-0020 a choisi `--locale=C` |
| **`unaccent`** | résout un autre problème (les accents), qu'ADR-0020 a délibérément décidé de ne pas résoudre |
| **Colonne normalisée maintenue par l'application** | déplace la garantie de la base vers le code, c'est-à-dire vers le chemin qui ne couvre ni les seeders, ni les imports, ni `updateQuietly` — soit précisément les chemins que ces index existent pour couvrir |
| **Ne rien faire** | l'index annonce une garantie qu'il ne tient pas. *Une contrainte qui change de sens ne lève aucune erreur — elle laisse passer un doublon* |
