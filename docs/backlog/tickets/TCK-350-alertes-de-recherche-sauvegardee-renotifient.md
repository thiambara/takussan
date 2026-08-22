---
id: TCK-350
title: "Les alertes de recherche sauvegardée renotifient les mêmes biens tous les jours"
status: todo
phase: P1
family: technique
estimate: M
wave: 45
created: 2026-08-22
updated: 2026-08-22
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

- [ ] **AC1 — deux passages consécutifs sans publication n'envoient qu'UNE notification.** Un test
      exécute le job deux fois de suite sur une recherche qui correspond à des biens existants, et
      assert **1** notification au total. ⚠ Le même test assert que le **premier** passage en a bien
      produit une : un job cassé qui ne notifie plus rien cocherait autrement la moitié du critère.
- [ ] **AC2 — un bien publié ENTRE les deux passages est notifié, et lui seul.** Le second passage
      produit une notification dont la charge utile (`count`) vaut **1**, pas le total de la
      recherche. Sans cette assertion sur le compte, un correctif qui renotifie tout dès qu'un seul
      bien est neuf passerait.
- [ ] **AC3 — `notification_frequency = 'off'` n'envoie RIEN**, et `'daily'` envoie, dans le même
      test, sur deux recherches sœurs du même utilisateur. Les deux moitiés sont nécessaires : une
      garde qui écarterait tout le monde cocherait la première seule.
- [ ] **AC4 — `last_notified_at` n'est PAS avancé quand rien n'est envoyé.** Sinon la borne dérive
      en silence à chaque passage muet, et une nouveauté publiée entre-temps devient invisible pour
      toujours. Assertion sur la valeur exacte avant/après.
- [ ] **AC5 — une exception sur UNE recherche ne tue pas les suivantes.** Le job itère par `each()` :
      aujourd'hui, une seule recherche fautive interrompt toutes les alertes du jour (c'est ce
      qu'ADR-0023 a mesuré sur le `acos()` de PostgreSQL). Le test rend une recherche fautive puis
      assert que la suivante a bien été notifiée.
- [ ] **AC6 — la décision de l'option retenue est écrite** : en commentaire du job si elle est
      locale, en ADR si elle introduit une table ou une colonne.
- [ ] **AC7 — vérifié par ablation.** Retirer le correctif fait rougir AC1 et AC2 ; les restaurer
      les rend verts. Le rapport porte les deux sorties.

## Références

- `takussan-api/app/Jobs/SendSavedSearchAlerts.php`
- `takussan-api/app/Services/Model/SearchService.php` — `search()`, `getMatchingProperties()`
- `takussan-api/routes/console.php:36` — la planification quotidienne
- [ADR-0023](../../adr/0023-recherche-geographique-par-distances-sans-postgis.md) — pourquoi
  `SavedSearch.criteria` ne converge pas encore vers le vocabulaire de `/search`
- [TCK-346](TCK-346-geo-postgis.md) § *Ce qui RESTE* — d'où vient ce constat
