---
id: TCK-336
title: "`PropertyResource` fabrique des valeurs pour les colonnes que `fields[]` n'a pas fait lire"
status: doing
phase: P2
family: technique
estimate: M
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [back, api, conventions, dette]
---

## Objectif utilisateur

Une réponse dit ce qu'elle a lu. Si le `SELECT` n'a ramené que deux colonnes, la réponse n'en
affirme pas trente-deux.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md) après contre-mesure. La
**version initiale de ce ticket prescrivait un filtre `array_intersect_key` au niveau ressource,
et cette voie est REJETÉE, par mesure** — voir « Ce que la revue adverse a établi ». L'arbitrage
complet est dans [ADR-0021](../../adr/0021-sparse-fieldsets-au-niveau-ressource.md).

### Le défaut réel, mesuré le 2026-08-21

`/api/properties` passe par `Property::buildQuery()`, donc par `fields[properties]=…`, qui restreint
**réellement** le `SELECT`. La ressource, elle, accédait à ses trente colonnes en direct :

```
$ php artisan tinker   # fields[properties]=id,title
COLONNES CHARGEES : id,title
NB CLES (resolve)  : 32
price => 0    furnished => false    featured => false    views_count => 0    favorites_count => 0
+ 23 clés à `null` (status, currency, bedrooms, area, slug, …)
```

Cinq valeurs **fabriquées par les casts** de `toArray()` (`(float) null` → `0`, `(bool) null` →
`false`, `?? 0`), et vingt-trois `null` qui disent « ce bien n'a pas de statut » au lieu de « je ne
l'ai pas lu ». La restriction du `SELECT` vaut aussi pour un `include=` imbriqué — mesuré : une
`Booking` incluse avec `fields[properties]=id,title,slug,price,currency` rend un modèle à
**5 colonnes**.

### Corrections apportées aux chiffres de la version initiale

Le dépôt tient à ce que les erreurs soient dites, pas effacées.

| Version initiale | Mesuré le 2026-08-21 |
|---|---|
| « 47 clés » (deux fois) | **32 en forme liste, 43 en forme détail.** 47 est le compte de `toArray()` **brut**, `MissingValue` compris — c'est-à-dire les clés que `resolve()` retire avant l'envoi. Le chiffre décrivait un tableau PHP intermédiaire, pas une réponse HTTP. |
| « Cinq appelants front comptent sur la sur-livraison » | **18 sites** passent `fields[properties]`. Aucun ne peut demander une clé dérivée (spatie rend 400) : **les 18** sont exposés dès qu'ils en lisent une. `.property.main_photo_url` apparaît 5 fois, `.property.title` 11 ; `location` et les `*_label` sont lus par les quatre tableaux de bord. |
| AC3 : « les vignettes … de la console super-admin s'affichent encore » | **La console super-admin n'a AUCUNE vignette.** `SuperAdminPropertiesTable.tsx` lit `id, title, slug, reference_number, type, contract_type, rent_period, status, status_label, price, currency, visibility, location, agency, created_at, published_at` — pas `main_photo_url` ; `agency-detail.tsx` non plus. La moitié de cet AC était **vraie par construction** : rien ne pouvait la faire échouer. |
| « le mécanisme manquant est au niveau RESSOURCE, sur les 44 ressources » | Vrai pour la **fabrication**. Faux pour le **filtrage** : sur les trois surfaces de biens, **deux ignorent totalement `fields[]`** — `/api/public/properties/search` (le service Meilisearch réhydrate des modèles entiers) et `/api/properties/{property}` (liaison de modèle par route). Un filtre au niveau ressource y filtrerait un modèle **complet**, ce qui est un autre sujet. |
| — (non relevé) | `fetchDashboardProperty` envoie `fields[properties]=…` à `/api/properties/{id}` : **c'est décoratif**, l'endpoint rend ses 43 clés quoi qu'il arrive. |

### Ce que la revue adverse a établi

`fields[properties]` est validé contre `Property::$queryFields` = **30 colonnes**, quand la ressource
émet **32/43 clés** dont **13 adossées à aucune colonne** (`location`, `main_photo_url`, les cinq
`*_label`, `photos`, `tags`, `media_extra`, `average_rating`, `reviews_count`, `price_history`,
`documents`) plus les clés d'`include=` (`owner`, `agency`, `collaborators`). **Deux espaces de noms
disjoints : filtrer l'un par l'autre supprime ce que le client n'a aucun moyen de demander.**

Prouvé par ablation : le filtre `array_intersect_key` prescrit initialement fait passer le test de
fabrication **et** fait rougir les deux tests de survie des dérivées et des includes.

Le gain qu'il visait vaut **123 octets gzippés** sur une réponse de détail de 3 906.

## Delta à produire

- [x] `PropertyResource::toArray()` — `whenHas()` sur **toute clé adossée à une colonne** ; les
      dérivées et les relations d'`include=` restent inconditionnelles
- [x] `tests/Feature/Public/PropertyResourceSparseFieldsTest.php` — 6 tests, chacun vérifié par
      ablation
- [x] [ADR-0021](../../adr/0021-sparse-fieldsets-au-niveau-ressource.md) — pose l'arbitrage et
      laisse ouverte la partie 2 (faut-il, en plus, filtrer par `fields[]` ?)
- [ ] Étendre les listes `fields[]` du front à ce qu'elles lisent réellement (autre agent, même lot)
- [ ] ~~`BaseResource::restreintAuxChampsDemandes()`~~ — **rejeté**, cf. ci-dessus
- [ ] ~~`SearchPublicPropertyRequest::rules()` déclare `fields`~~ — sans objet une fois le filtre
      rejeté

## Critères d'acceptation

Chaque AC est formulé pour qu'une **régression silencieuse le fasse rougir**. Les trois AC initiaux
ne le faisaient pas : AC1 (« rend exactement les clés demandées ») était coché par le filtre qui
supprime les vignettes ; AC2 (« inchangée au caractère près ») était coché par un correctif qui ne
fait rien du tout ; AC3 était vrai par construction sur sa moitié super-admin.

- [ ] **AC1 — la fabrication n'a plus lieu, et l'ABSENCE est la preuve.** Sur
      `GET /api/properties?fields[properties]=id,title`, les clés `price`, `furnished`, `featured`,
      `views_count`, `favorites_count`, `status`, `currency`, `bathrooms` sont **absentes de la
      réponse** — `assertArrayNotHasKey`, pas « valent 0 ». Un correctif qui les rendrait à `null`
      échoue cet AC.
- [ ] **AC2 — « pas lu » et « lu et nul » restent distincts.** Sur
      `fields[properties]=id,title,floor_number,price` avec `floor_number = null` en base, la clé
      `floor_number` est **présente et vaut `null`**, et `price` vaut le vrai prix. Cet AC fait
      rougir tout garde bâti sur `isset()` / `whenNotNull()` / `array_filter()`.
- [ ] **AC3 — ce que le client ne peut pas demander lui est servi quand même.** Sous
      `fields[properties]=id,title,type&include=address,owner`, les clés `location` (avec sa ville
      renseignée), `main_photo_url`, `type_label` (**non nul**) et `owner` (**non nul**) sont
      présentes. C'est l'AC qui refuse le filtre `array_intersect_key` : il le fait rougir.
- [ ] **AC4 — sans `fields[]`, la réponse reste complète ET vraie.** Sur `GET /api/properties` sans
      sparse fieldset, les huit clés de l'AC1 sont présentes avec leurs valeurs réelles
      (`price = 42 500 000,50`, `furnished = true`, `status = available`). Sans cet AC, un correctif
      qui omettrait partout cocherait les trois précédents.
- [ ] **AC5 — les deux compteurs restent dans la forme LISTE.** `views_count` et `favorites_count`
      sont émis par `GET /api/properties`. La proposition de les passer derrière `$isDetail`
      (parce que `show()` incrémente `views_count` et change ainsi le corps de toute page de
      résultats) **est rejetée par mesure** : `DASHBOARD_PROPERTY_FIELDS` les demande, et
      `PropertyList.tsx` les rend dans chaque ligne du tableau de bord agent (267/272 en cartes,
      405/409 en tableau), derrière un `?? 0` qui absorberait l'absence sans erreur TypeScript.

## Hors périmètre

- Les 43 autres ressources. Elles ont le même défaut potentiel et **rien ne le signalera** : il n'y
  a pas encore de garde de forme sur `whenHas`. Premier candidat, sur le modèle de
  `scripts/check-resource-date-format.mjs`.
- La partie 2 d'ADR-0021 — élargir `$queryFields` aux noms calculés (36 modèles concernés sur 64,
  et le trait que 68 portent), ou introduire `view=card|detail`.
- Les cinq `*_label`, qui sortent encore à `null` quand leur colonne source n'est pas lue. Les
  apparier changerait le contrat d'un appelant qui lit le libellé sans demander la colonne ;
  vérifié sur les 18 sites, aucun n'est dans ce cas — c'est donc un choix, pas un correctif évident.

## Notes d'implémentation

Le correctif tient dans le patron déjà posé par `UserResource::has_usable_password` (TCK-272) :
`whenHas()` teste `array_key_exists(…, $model->getAttributes())` et **omet** la clé au lieu d'en
fabriquer la valeur. Le raisonnement complet est en tête de `PropertyResource::toArray()`.

**Ablations jouées** (le correctif retiré, les tests doivent rougir — et rougir au bon endroit) :

| Ablation | Résultat |
|---|---|
| Accès nu (état d'avant) | AC1 rouge, les 5 autres verts |
| Filtre `array_intersect_key` prescrit initialement | AC1/AC2/AC4/AC5 **verts**, AC3 et l'AC des includes **rouges** |
| `whenNotNull()` au lieu de `whenHas()` | AC2 **rouge**, les autres verts |
| Compteurs derrière `$isDetail` | AC4 et AC5 **rouges** |
