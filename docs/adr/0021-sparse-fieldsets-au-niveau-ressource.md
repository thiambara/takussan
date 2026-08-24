# ADR-0021 — `fields[]` désigne des colonnes ; une ressource n'invente pas ce qu'elle n'a pas lu

- **Statut** : **Proposé** — la partie 1 est appliquée, l'arbitrage de la partie 2 reste ouvert
- **Date** : 2026-08-21
- **Tickets** : TCK-336 (le ticket qui aurait dû exiger cet ADR), TCK-335 (l'audit d'où il sort)

## Contexte

`spatie/laravel-query-builder` valide `fields[properties]=…` contre `Property::$queryFields` —
**30 entrées, toutes des COLONNES**. `PropertyResource::toArray()` émet **32 clés dans sa forme
liste et 43 dans sa forme détail**. Les deux ensembles ne sont pas emboîtés : **13 clés émises ne
sont adossées à aucune colonne** et ne peuvent donc *jamais* figurer dans `fields[]` — spatie rend
alors **400 `InvalidFieldQuery`**.

| Famille | Clés | Peut figurer dans `fields[properties]` ? |
|---|---|---|
| Colonnes | `id`, `title`, `price`, `status`, `bedrooms`, … (30) | **oui** |
| Dérivées | `location`, `main_photo_url`, les 5 `*_label`, `photos`, `tags`, `media_extra`, `average_rating`, `reviews_count`, `price_history`, `documents` | **non — 400** |
| Relations `include=` | `owner`, `agency`, `collaborators` | **non — 400** |

**Deux espaces de noms disjoints.** La question que TCK-336 posait sans la nommer est donc :
*« que veut dire "sparse fieldset" au niveau ressource, quand le client ne peut désigner que le
tiers de ce qui sort ? »*

### Le défaut réel, mesuré le 2026-08-21

Ce n'était pas la sur-livraison. C'était la **fabrication**. Sonde sur `/api/properties` — le seul
chemin de biens qui passe réellement par `Property::buildQuery()` :

```
$ php artisan tinker  # fields[properties]=id,title
COLONNES CHARGEES: id,title
NB CLES (resolve)  : 32
price => 0    furnished => false    featured => false    views_count => 0    favorites_count => 0
status, currency, bedrooms, area, slug, … => null   (23 clés)
```

Le `SELECT` avait lu deux colonnes ; la réponse en affirmait trente-deux. Un bien **à 0 F CFA, non
meublé, non mis en avant, jamais consulté, jamais mis en favori** — cinq mesures là où il n'y a eu
aucune lecture, et vingt-trois `null` qui disent « ce bien n'a pas de statut » au lieu de « je ne
l'ai pas lu ». *Une clé absente se remarque ; une clé fausse se croit.*

⚠️ **La sur-livraison, elle, ne vaut presque rien** : sur une réponse de détail de 3 906 octets, le
filtrage complet aurait économisé **123 octets gzippés**.

## Décision

L'ADR se scinde en deux, parce que les deux moitiés n'ont pas le même degré de certitude.

### Partie 1 — appliquée : une clé adossée à une COLONNE passe par `whenHas()`

Une ressource **n'invente pas** un attribut que la requête n'a pas sélectionné. `whenHas()` teste
`array_key_exists(…, $model->getAttributes())` et **omet la clé** — c'est la seule forme qui
distingue « pas lu » de « nul ». Précédents : `UserResource::has_usable_password` (TCK-272),
`PaymentGatewayService::paymentAmount()` (ardoise D-51).

Corollaire, et c'est lui qui est contre-intuitif : **une colonne DEMANDÉE qui vaut `null` reste
émise à `null`**. La distinction porte sur *lue ou pas*, jamais sur *nulle ou pas* — sans quoi le
front ne peut plus séparer « ce bien n'a pas d'étage » de « je n'ai pas demandé l'étage ».

Les clés **dérivées** et les **relations d'`include=`** restent **inconditionnelles** : le client
n'a aucun moyen de les demander, les gager sur `fields[]` les ferait disparaître chez des appelants
qui les affichent.

### Partie 2 — OUVERTE : faut-il, en plus, filtrer par `fields[]` ?

Trois voies. Elles ne s'excluent pas de la partie 1 ; elles s'y ajoutent.

| | Voie | Ce que ça coûte | Ce que ça rapporte | Ce que ça casse |
|---|---|---|---|---|
| **(a)** | **Rien de plus** — statu quo après partie 1 | 0 | `fields=id,title` sur 20 items : **14 043 → 6 083 octets** bruts (−57 %), **775 → 554 gzip** (−221 o, −29 %) ; sans `fields[]` : **16 325 / 2 246, identique à l'octet** | rien de mesuré (18 sites front vérifiés) |
| **(b)** | Élargir `$queryFields` aux noms calculés et découpler *demandable* / *sélectionnable* dans `HasQueryBuilder` | **36 modèles** déclarent `$queryFields`, sur 64 ; le découplage touche le trait que **68 modèles** portent | `fields[]` devient enfin le contrat complet : un appelant peut refuser `main_photo_url` | tout `fields[]` existant devient *restrictif* : les **18 sites front** qui passent `fields[properties]` perdent chacun ce qu'ils n'énumèrent pas |
| **(c)** | Un paramètre distinct — `view=card\|detail` | un enum de vues par ressource ; `$isDetail` (déjà là, déduit du **nom de route**) devient explicite | sépare proprement les deux espaces au lieu de les fondre | rien tant que le défaut reste la forme actuelle |

**Chiffres à peser avant de trancher (b) :** le bénéfice maximal de (b) sur le cas mesuré est de
**123 octets gzippés** sur 3 906 — c'est-à-dire le prix des 13 clés dérivées. Le gain déjà obtenu
par la partie 1 est de **221 octets gzippés** sur 775. *La partie 1 rapporte déjà plus que ce que
(b) ajouterait, et sans changer un seul appelant.*

⚠️ **Résidu connu, et il appartient à la partie 2.** Sous `fields[properties]=id,title`, les cinq
`*_label` sortent encore à `null` : la ressource affirme « pas de libellé de type » alors qu'elle
n'a pas lu `type`. Les apparier à leur colonne source (`whenHas('type', fn () => enumLabel(…))`)
fermerait le trou — mais **change le contrat d'un appelant qui lit le libellé sans demander la
colonne**. Vérifié sur les 18 sites : aucun n'est dans ce cas aujourd'hui. C'est donc un choix
disponible, pas un correctif évident.

## Conséquences

**Ce que ça rend possible.** Une réponse dit désormais ce qu'elle a lu. Un front qui reçoit
`price` sait qu'il vient de la base ; un front qui ne le reçoit pas sait qu'il ne l'a pas demandé.

**Ce que ça coûte.** Le contrat TypeScript du front déclare ces clés **obligatoires** alors qu'elles
deviennent optionnelles. Rien ne le vérifie à l'exécution — c'est du JSON —, donc l'écart est muet
dans les deux sens. C'est la raison pour laquelle la liste `fields[]` de chaque appelant doit couvrir
ce qu'il affiche : la vérification est humaine, elle a été faite une fois (2026-08-21, 18 sites), et
elle se refera à chaque nouvelle vue.

**Ce que ça n'améliore PAS, et c'est mesuré.** Deux des trois surfaces de biens **ignorent
totalement `fields[]`** : `/api/public/properties/search` (le service Meilisearch réhydrate des
modèles entiers) et `/api/properties/{property}` (liaison de modèle par route). Le
`fields[properties]` que `fetchDashboardProperty` envoie au second est **décoratif** — mesuré :
43 clés rendues, `fields[]` ou pas.

**Ce que ça interdit.** Le filtre `array_intersect_key(data, fields)` que TCK-336 prescrivait.
Prouvé par ablation : il fait passer le test de fabrication **et** fait disparaître `location`,
`main_photo_url`, les `*_label` et `owner` — de six appelants front mesurés, sans erreur TypeScript
ni test rouge.

## Application

- `takussan-api/app/Http/Resources/PropertyResource.php` — partie 1, avec le raisonnement en tête de
  `toArray()`.
- `takussan-api/tests/Feature/Public/PropertyResourceSparseFieldsTest.php` — 6 tests, chacun
  vérifié par ablation. Les trois qui ferment la porte aux mauvais correctifs :
  `test_les_cles_derivees_survivent_au_sparse_fieldset` et
  `test_les_relations_incluses_survivent_au_sparse_fieldset` rougissent sur la voie
  `array_intersect_key` ; `test_une_colonne_selectionnee_mais_nulle_reste_emise` rougit sur tout
  garde bâti sur `isset()`/`whenNotNull()`.
- **Pas encore de garde CI.** Les 43 autres ressources n'ont rien de tout cela, et rien ne le
  signalera. C'est le premier candidat à une garde de forme, sur le modèle de
  `scripts/check-resource-date-format.mjs`.
