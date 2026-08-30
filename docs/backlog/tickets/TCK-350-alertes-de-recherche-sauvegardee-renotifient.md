---
id: TCK-350
title: "Les alertes de recherche sauvegardée renotifient les mêmes biens tous les jours"
status: todo
phase: P1
family: technique
estimate: M
wave: 45
created: 2026-08-22
updated: 2026-08-29
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md
tags: [back, notifications, alertes]
---

## Le constat, vérifié par lecture le 2026-08-22

Trouvé pendant TCK-346, **hors périmètre géographique et non corrigé**. Trois faits, chacun à sa
ligne.

**1. La borne temporelle est calculée puis JETÉE.**

```php
// app/Jobs/SendSavedSearchAlerts.php:25-32
$criteria = $search->criteria ?? [];

if ($search->last_notified_at) {
    $criteria['published_after'] = $search->last_notified_at->toDateTimeString();
}

$matches = $searchService->getMatchingProperties($search);   // ← $criteria n'est pas passé
```

`getMatchingProperties()` **relit `criteria` depuis le modèle** :

```php
// app/Services/Model/SearchService.php:140-142
public function getMatchingProperties(SavedSearch $search): Collection
{
    $filters = $search->criteria ?? [];
```

La variable locale enrichie n'atteint jamais le service. Elle n'a **aucun** autre lecteur : la seule
autre occurrence de `published_after` dans `app/` et `tests/` est celle de la ligne 29.

**2. `SearchService::search()` ne connaîtrait pas la clé de toute façon.** Les filtres qu'elle lit
sont `type`, `contract_type`, `status`, `currency`, `title_type`, `min_price`, `max_price`,
`min_area`, `bedrooms`, `city`, `furnished`, `tags`, le rectangle `lat_min…lng_max`, le rayon
`lat`/`lng`/`radius_km`, puis `sort` / `direction` / `per_page`. **`published_after` n'y figure
pas.** Corriger le passage de la variable ne suffirait donc pas : la clé serait ignorée en silence,
ce qui est exactement le mode de panne actuel avec un pas de plus.

**3. Le job tourne tous les jours à 09:00** (`routes/console.php:36`) et ne filtre que sur
`is_active` (`SendSavedSearchAlerts.php:21-23`).

## Ce que l'utilisateur subit

Une recherche sauvegardée active qui correspond à *N* biens produit **une notification par jour,
indéfiniment, avec les mêmes *N* biens** — y compris quand aucun bien n'a été publié depuis la
veille. `last_notified_at` est bien mis à jour (`:46`), mais il ne sert plus à rien qu'à être écrit.

L'objet de la notification annonce « Nouvelles propriétés correspondent à votre recherche » (`:41`) :
le message affirme une nouveauté que le calcul n'a jamais vérifiée.

### ⚠ Un second défaut du même job, mesuré au passage

**`notification_frequency` n'est lue par aucun code d'envoi.** Elle est validée
(`in:off,daily,weekly,instant`, `StoreSavedSearchRequest:54` et `UpdateSavedSearchRequest:48`),
persistée (`SavedSearch:14`), exposée (`SavedSearchResource:17`) — et le job ne la consulte pas :
`grep -rn notification_frequency app` ne rend aucun lecteur hors de ces quatre fichiers.

Conséquence : **un utilisateur qui règle son alerte sur `off` continue de recevoir une notification
par jour.** Il n'existe aujourd'hui aucun moyen de faire taire une alerte autrement qu'en passant
`is_active` à `false`.

Ce défaut est adjacent, pas identique — il est inclus ici parce qu'il vit dans le même job, produit
la même notification indésirable, et qu'un correctif de la renotification qui l'ignorerait laisserait
`off` sans effet.

## Ce qui reste à trancher — et c'est le cœur du ticket

**La question n'est pas « comment faire respecter `published_after` », c'est « où vit
l'anti-renotification ».** Trois réponses possibles, aucune évidente :

1. **`SearchService` apprend `published_after`.** Le moins de code. Mais `criteria` est un tableau
   **libre** — validé `['required','array']`, sans schéma de clés — dont le contenu a été écrit par
   le front à la date de la sauvegarde ([ADR-0023](../../adr/0023-recherche-geographique-par-distances-sans-postgis.md),
   § *Pourquoi le chemin 3 ne converge pas*). Y injecter une clé de contrôle mélange un critère
   d'utilisateur et un état d'envoi dans la même structure : le jour où l'on migrera les `criteria`
   vers le vocabulaire de `/search`, il faudra savoir laquelle des clés n'en était pas une.
2. **Le job filtre après coup** sur `published_at > last_notified_at`. Indépendant du service, et
   il survivrait à la convergence future vers `PropertySearchService`. Mais il paginate puis jette :
   une recherche large peut ne rendre que des biens déjà notifiés dans sa première page et taire une
   nouveauté classée plus loin.
3. **Une table de traçage** (`saved_search_notified_properties`, ou une colonne
   `last_notified_property_id`). Le seul mécanisme qui tienne quand un bien est **republié**, quand
   `published_at` est rétrodaté, ou quand la recherche est modifiée entre deux passages. Le plus
   cher, et il faut décider de sa purge.

**Ce ticket ne tranche pas.** Il exige que la décision soit prise explicitement — et si elle est
structurelle (option 3), en ADR.

## Critères d'acceptation

Écrits pour qu'une régression ne puisse pas les cocher : chacun porte son versant négatif, sans quoi
« ne notifie pas » serait satisfait par un job qui ne notifie plus jamais.

- [x] **AC1 — deux passages consécutifs sans publication n'envoient qu'UNE notification.** Un test
      exécute le job deux fois de suite sur une recherche qui correspond à des biens existants, et
      assert **1** notification au total. ⚠ Le même test assert que le **premier** passage en a bien
      produit une : un job cassé qui ne notifie plus rien cocherait autrement la moitié du critère.
- [x] **AC2 — un bien publié ENTRE les deux passages est notifié, et lui seul.** Le second passage
      produit une notification dont la charge utile (`count`) vaut **1**, pas le total de la
      recherche. Sans cette assertion sur le compte, un correctif qui renotifie tout dès qu'un seul
      bien est neuf passerait.
- [x] **AC3 — `notification_frequency = 'off'` n'envoie RIEN**, et `'daily'` envoie, dans le même
      test, sur deux recherches sœurs du même utilisateur. Les deux moitiés sont nécessaires : une
      garde qui écarterait tout le monde cocherait la première seule.
- [x] **AC4 — `last_notified_at` n'est PAS avancé quand rien n'est envoyé.** Sinon la borne dérive
      en silence à chaque passage muet, et une nouveauté publiée entre-temps devient invisible pour
      toujours. Assertion sur la valeur exacte avant/après.
- [x] **AC5 — une exception sur UNE recherche ne tue pas les suivantes.** Le job itère par `each()` :
      aujourd'hui, une seule recherche fautive interrompt toutes les alertes du jour (c'est ce
      qu'ADR-0023 a mesuré sur le `acos()` de PostgreSQL). Le test rend une recherche fautive puis
      assert que la suivante a bien été notifiée.
- [x] **AC6 — la décision de l'option retenue est écrite** : en commentaire du job si elle est
      locale, en ADR si elle introduit une table ou une colonne.
- [x] **AC7 — vérifié par ablation.** Retirer le correctif fait rougir AC1 et AC2 ; les restaurer
      les rend verts. Le rapport porte les deux sorties.

## Références

- `takussan-api/app/Jobs/SendSavedSearchAlerts.php`
- `takussan-api/app/Services/Model/SearchService.php` — `search()`, `getMatchingProperties()`
- `takussan-api/routes/console.php:36` — la planification quotidienne
- [ADR-0023](../../adr/0023-recherche-geographique-par-distances-sans-postgis.md) — pourquoi
  `SavedSearch.criteria` ne converge pas encore vers le vocabulaire de `/search`
- [TCK-346](TCK-346-geo-postgis.md) § *Ce qui RESTE* — d'où vient ce constat

---

## Décision — étape 0 du lot, 2026-08-29

### L'option retenue : la 1, dans une variante qui répond à l'objection portée contre elle

**Ni la 1 telle qu'écrite, ni la 2, ni la 3. La borne est un ARGUMENT de méthode, jamais une clé
de `criteria`.**

```php
public function getMatchingProperties(SavedSearch $search, ?CarbonInterface $publieApres = null): Collection
```

et `search()` apprend un filtre `published_after` qu'elle applique en SQL
(`where('published_at', '>', …)`), alimenté par cet argument — **jamais** par le tableau persisté.

**Ce que cette forme fait tomber, option par option :**

| Objection du ticket | Ce qu'elle devient ici |
|---|---|
| **Option 1** — « injecter une clé de contrôle dans `criteria` mélange un critère d'utilisateur et un état d'envoi » | L'objection porte sur la **persistance** de la clé. Un argument de méthode ne s'écrit dans aucune colonne : `criteria` n'est jamais modifié, et la migration future vers le vocabulaire de `/search` n'aura aucune clé à démêler. |
| **Option 2** — « paginate puis jette : une nouveauté classée plus loin est tue » | Ne s'applique pas : le filtre est **dans la requête**, donc la première page est déjà la page des seuls biens neufs. |
| **Option 3** — republication, `published_at` rétrodaté, recherche modifiée entre deux passages | **Non couverts, et c'est assumé** — voir ci-dessous. |

**Aucun ADR n'est donc requis** : ni table, ni colonne, ni décision structurelle. Un commentaire
dans le job suffit (AC6, versant « décision locale »).

⚠ **Le point de contrôle qui décide si cette variante tient :** `saveSearch()` recopie **tout**
`$criteria` dans la colonne (`SearchService:100-105`), y compris `name` et
`notification_frequency`. Une clé `published_after` qui y transiterait un jour y serait donc
**persistée**. C'est précisément pourquoi elle doit rester un argument — et pourquoi **un test doit
asserter qu'aucune ligne `saved_searches` ne porte `published_after` dans `criteria`** après un
passage du job. Sans cette assertion, la décision ci-dessus n'est qu'une intention.

### Ce qui est explicitement laissé de côté, et pourquoi

Les trois cas que seule l'option 3 couvre — bien **republié**, `published_at` **rétrodaté**,
recherche **modifiée** entre deux passages — restent non couverts. La raison n'est pas qu'ils sont
improbables : c'est qu'aucun d'eux **n'existe comme geste produit aujourd'hui**. Les instruire
demanderait d'abord de décider ce que « republier » veut dire, ce qu'aucun ticket ne tranche.

*Une table de traçage posée pour des cas qu'aucun geste ne produit encore est une décision prise
trop tôt, et qu'il faudra défaire.* → si l'un de ces gestes apparaît, **c'est lui** qui portera
l'ADR et la table, avec le cas réel sous les yeux.

**À écrire dans le commentaire du job**, sans quoi la limite se perd.

### `notification_frequency` : lue, et lue au bon endroit

Le job la consulte, et **le passage muet ne doit rien avancer** (AC4). Trois valeurs sur quatre
sont à trancher, et le ticket ne les couvre pas : décision d'étape 0 —

- `off` → aucun envoi, `last_notified_at` **inchangé** ;
- `daily` → comportement nominal ;
- `weekly` → envoi seulement si `last_notified_at` est nul **ou** vieux de ≥ 7 jours ;
- `instant` → **traité comme `daily` par ce ticket**, et la limite écrite en commentaire : un envoi
  réellement instantané suppose un déclencheur à la publication, pas une planification à 09:00.
  *Le rendre silencieusement synonyme de `daily` sans le dire serait la troisième façon pour ce
  job de mentir sur ce qu'il fait.*

⚠ La valeur peut être **absente** (`sometimes`, jamais `nullable` — TCK-330). Le défaut de lecture
est `daily`, aligné sur `saveSearch()` (`SearchService:104`). Un test le fixe : une recherche
sans `notification_frequency` notifie.

### Sur AC5 — l'exception qui tue les suivantes

Le `each()` reste, l'appel est enveloppé **par recherche**, et l'erreur est journalisée avec
l'`id`. ⚠ Sur PostgreSQL, **une exception SQL abandonne la transaction entière**
(`SQLSTATE[25P02]`, cf. `CLAUDE.md`) : un `try/catch` qui poursuit après une erreur SQL dans la
même transaction ne reprend pas — il accuse la recherche suivante. Le test d'AC5 doit donc rendre
une recherche fautive **par une exception applicative**, et un second cas doit éprouver l'erreur
SQL si le job venait à tourner dans une transaction.

## AC7 — ablation jouée le 2026-08-30

Elle était annoncée, pas exécutée. Jouée, elle mord.

`SearchService.php` — le correctif retiré, la borne du curseur revenant à l'état d'avant le
ticket. Empreinte relevée **avant** de lire le résultat : `8a46edeb…` → `14e02695…`, la mutation
est donc bien appliquée et non seulement écrite.

| | Tests |
|---|---|
| correctif retiré | **3 échecs / 6 verts** |
| correctif restauré | **9 verts / 9**, empreinte de référence retrouvée |

Les trois rouges sont ceux d'AC1 et d'AC2 — la renotification, et le curseur qui n'avance pas —
et aucun des six autres ne bouge. *Une ablation qui fait tout rougir n'a rien isolé ; celle-ci
sépare.*
