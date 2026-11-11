# API Query Builder — spatie/laravel-query-builder

Le backend utilise [spatie/laravel-query-builder](https://spatie.be/docs/laravel-query-builder) pour exposer des filtres, un tri, des inclusions et la sélection de champs depuis le frontend.

---

## Query params disponibles

### Filtres

```
GET /api/properties?filter[status]=available
GET /api/properties?filter[status]=available&filter[type]=apartment
GET /api/customers?filter[pipeline_stage]=lead
```

**Filtre textuel (recherche multi-champs) :**
```
GET /api/properties?filter[search]=villa mermoz
GET /api/customers?filter[search]=Amadou
GET /api/users?filter[search]=Fatou
```

**Filtres de range (min/max) :**
```
GET /api/properties?filter[price_min]=50000&filter[price_max]=200000
GET /api/properties?filter[area_min]=80
GET /api/leases?filter[monthly_rent_min]=100000
```

### Tri

```
GET /api/properties?sort=-price        # décroissant
GET /api/properties?sort=price         # croissant
GET /api/leases?sort=-monthly_rent
GET /api/customers?sort=last_name
```

### Inclusions (eager loading)

```
GET /api/properties?include=address,owner
GET /api/leases?include=property,tenant
GET /api/customers?include=addresses,tags
```

**Compter les relations :**
```
GET /api/properties?include=bookingsCount,leasesCount,reviewsCount
```

### Sparse fieldsets (sélection de champs)

Réduit les données retournées aux seules colonnes nécessaires. Le nom de la ressource correspond au nom de la table (pluriel snake_case).

```
GET /api/properties?fields[properties]=id,title,price,status
GET /api/customers?fields[customers]=id,first_name,last_name,email,status
GET /api/leases?fields[leases]=id,property_id,monthly_rent,status,start_date,end_date
```

**`fields` et `include` ne valent que pour les listes. Un `show` rend la ressource de détail
entière** (P60.03, TCK-1067). Le front n'envoie donc aucun `fields[...]` à une route de détail
(`GET /api/<ressource>/{id}`) ; `src/lib/queries/__tests__/show-sans-fields.garde.test.ts` le
garde. Relevé du 2026-10-19 : les `show` chargent des relations fixes et ignorent `fields` ;
`CustomerController::show` est le seul à passer par `buildQuery`, et trois `show` lisent encore
`include=` (`Customer`, `MaintenanceRequest`, `BankStatement`).

Pour une lecture légère d'une seule ligne (un titre d'onglet, un en-tête), passer par la liste
filtrée par id, avec ses `fields` :

```
GET /api/leases?filter[id]=42&fields[leases]=id,reference_number&per_page=1
```

### Pagination

```
GET /api/properties?per_page=50
GET /api/properties?per_page=10&page=2
```

---

## Filtres disponibles par ressource

### Property
| Param | Type | Description |
|---|---|---|
| `filter[id]` | exact | un ou plusieurs ids, séparés par des virgules (TCK-2524) — voir ci-dessous |
| `filter[status]` | exact | `draft`, `available`, `rented`, `sold`, ... |
| `filter[type]` | exact | `apartment`, `house`, `villa`, ... |
| `filter[contract_type]` | exact | `sale`, `rental`, ... |
| `filter[user_id]` | exact | ID du propriétaire |
| `filter[agency_id]` | exact | ID de l'agence |
| `filter[bedrooms]` | exact | Nombre de chambres |
| `filter[bathrooms]` | exact | Nombre de salles de bain |
| `filter[featured]` | exact | `1` ou `0` |
| `filter[currency]` | exact | `XOF`, `EUR`, `USD`, ... |
| `filter[price_min]` | range | Prix minimum |
| `filter[price_max]` | range | Prix maximum |
| `filter[area_min]` | range | Surface minimum (m²) |
| `filter[area_max]` | range | Surface maximum (m²) |
| `filter[search]` | search | Recherche dans title, reference_number, description |
| `sort` | `-price`, `price`, `-created_at`, `area`, `bedrooms`, `featured` | |

**`filter[id]`** (TCK-2524) — lire des biens par leurs ids, avec leurs `fields` : la vitrine de
l'agence nomme ainsi les biens de sa sélection, quel que soit leur rang dans la liste.

```
GET /api/properties?filter[id]=839,838&filter[agency_id]=1&fields[properties]=id,title,reference_number&per_page=6
```

- **Format** : une liste d'entiers séparés par des virgules, chacun de **18 chiffres au plus**. Une
  valeur non entière ou plus longue rend **400**, pas 500 (`ExactIdentifierFilter`, comme tout filtre
  `id` / `*_id`).
- **Le périmètre de l'appelant est inchangé** : le filtre restreint la liste que l'appelant voit déjà,
  il n'en ouvre aucune. Un id qu'il ne voit pas ne rend rien, sans erreur.
- **Où il vaut** : sur toute liste qui passe par `Property::buildQuery()`, c'est-à-dire
  `GET /api/properties` (`PropertyController::index`), `GET /api/properties/{property}/children`
  (`PropertyChildrenController::index`), `GET /api/me/owner-profiles/{owner_profile}/properties`
  (`Me\OwnerProfileController::properties`) et `GET /api/admin/agencies/{agency}/properties`
  (`Admin\AgencyDetailController::properties`). La liste se relit par
  `grep -rn "Property::buildQuery" takussan-api/app`.

### Customer
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `active`, `inactive`, ... |
| `filter[pipeline_stage]` | exact | `lead`, `prospect`, `client`, ... |
| `filter[agency_id]` | exact | ID de l'agence |
| `filter[search]` | search | Recherche dans first_name, last_name, email, phone |
| `sort` | `-created_at`, `first_name`, `last_name`, `status` | |

### Lease
| Param | Type | Description |
|---|---|---|
| `filter[id]` | exact | lecture légère d'un bail (TCK-1067) |
| `filter[status]` | exact | `active`, `expired`, `terminated`, ... |
| `filter[type]` | exact | `rental`, `sale` |
| `filter[property_id]` | exact | |
| `filter[tenant_id]` | exact | |
| `filter[currency]` | exact | |
| `filter[monthly_rent_min]` | range | |
| `filter[monthly_rent_max]` | range | |
| `sort` | `-created_at`, `start_date`, `end_date`, `monthly_rent` | |

### Booking
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `pending`, `confirmed`, `cancelled`, ... |
| `filter[kind]` | exact | `stay`, `application`, `offer` — la nature (TCK-2579, ADR-0102) ; liste admise (`stay,offer`) |
| `filter[property_id]` | exact | |
| `filter[customer_id]` | exact | |
| `filter[total_amount_min]` | range | |
| `filter[total_amount_max]` | range | |
| `sort` | `-created_at`, `start_date`, `end_date` | |

### Agency
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `active`, `inactive` |
| `filter[is_verified]` | exact | `1` ou `0` |
| `filter[search]` | search | Recherche dans name, email, license_number |
| `sort` | `-created_at`, `name`, `founded_at` | |

### Invoice / Payout / MaintenanceRequest / Task / Document / Tag
Même pattern : `filter[status]`, `filter[search]` (selon le model), `sort`.

`MaintenanceRequest` ajoute une plage sur le créneau (TCK-2623, « mes interventions du jour ») :

| Param | Type | Description |
|---|---|---|
| `filter[scheduled_from]` / `filter[scheduled_to]` | date | `YYYY-MM-DD`, heure de Dakar, bornes incluses ; une intervention sans créneau n'entre dans aucune plage ; illisible ou liste → 422. Le périmètre reste celui de la Policy (`visibleTo`) |

### Conversations — `GET /api/conversations` (TCK-2630)

Ne passe **pas** par `HasQueryBuilder` : la liste est cloisonnée par
`ConversationAccess::constrainListing` et filtrée dans `ConversationController::index`
(`ListConversationsRequest` ; saisie mal formée → 422).

| Param | Type | Description |
|---|---|---|
| `archived` | `0`/`1` | les fils archivés par l'appelant au lieu des autres |
| `filter[search]` | texte | chaque mot (6 au plus) trouve le prénom ou le nom d'un membre actuel autre que l'appelant, le titre ou la référence du bien, ou le sujet ; casse repliée (`CaseInsensitive`), **accents non repliés** (« thies » ne trouve pas « Thiès ») ; moins de 2 caractères → ignoré (TCK-2630) |
| `filter[unread]` | `1`/`0` | fils ayant au moins un message non lu (même définition que `unread_count`) (TCK-2630) |
| `filter[type]` | `direct` \| `group` | (TCK-2630) |

`meta.counts {all, unread, group}` : les compteurs des puces, sur tout le cloisonné **hors
archives**, sans aucun filtre ; `unread` compte des fils, sourdine comprise — `meta.unread_total`
compte des messages, hors sourdine (TCK-2630).

`GET /api/conversations/{conversation}/context` (garde de `show`) rend `property {id, slug, title,
reference_number, price, status, cover_url}`, `lease {id, status, reference, tenant_name}`,
`maintenance {id, status, title, scheduled_at}`, chacun `null` s'il est absent ou interdit, et —
au seul personnel de l'agence du fil, sur une directe — `customer {id, full_name, stage, phone,
assigned_agent {id, name}}` ; la clé `customer` est absente pour tout autre lecteur (TCK-2630).

### Historique des paiements — `GET /api/payments/history`

Lu **à la main** par `PaymentController::history` (loyers et réservations fusionnés en PHP, plafond
de 5 000 lignes, `meta.truncated`), pas par `HasQueryBuilder` : ni `fields[…]`, ni filtre inconnu
refusé. Une valeur en liste (`filter[x][]=…`) vaut une valeur absente (ADR-0075), sauf
`filter[status]` (422).

| Param | Type | Description |
|---|---|---|
| `filter[entity_type]` + `filter[entity_id]` | exact | `property`, `lease`, `customer`, `booking` |
| `filter[status]` | liste | `pending,late,partially_paid` — inconnu → 422 `payment.filter_status_invalid` |
| `filter[date_from]` / `filter[date_to]` | date | `YYYY-MM-DD`, heure de Dakar |
| `filter[payer_id]` | exact | le client payeur : `lease_payments.payer_id`, ou le client de la réservation (TCK-2657) |
| `filter[landlord_id]` | exact | `leases.landlord_id`, ou le titulaire du bien de la réservation (TCK-2657) |
| `filter[payment_method]` | liste | `wave,cash` — inconnu → 422 `payment.filter_payment_method_invalid` (TCK-2657) |
| `filter[search]` | search | chaque mot dans : nom du payeur, titre ou référence du bien, référence du paiement ; casse repliée (`CaseInsensitive`), **accents non repliés** (TCK-2657) |
| `filter[days_late_min]` / `filter[days_late_max]` | entier ≥ 0 | échéances dues et échues seulement ; exclut les réservations (TCK-2657) |
| `include` | `payer`, `property`, `landlord`, `reminders` | `payer {id, name, phone}`, `property {id, title, reference_number}`, `landlord {id, name}` — nom inconnu ignoré (TCK-2657) ; `reminders` : `last_reminder {at, source, channel, by}` (ou `null`) et `reminders_count`, relances notées et rappels automatiques confondus, `null`/`0` sur une réservation (TCK-2658) |
| `sort` | `-date` (défaut), `amount`, `remaining_amount`, `created_at`, `days_late` | `days_late` : les lignes sans retard en dernier, dans les deux sens |

⚠ **`days_late` n'est émis que si la requête porte un paramètre neuf de TCK-2657** (un `include`,
un des filtres ci-dessus marqués TCK-2657, ou `sort=days_late`) : sans eux, la ligne garde sa forme
d'avant, clé pour clé. `filter[status]=pending` seul ne le rend pas. Sa valeur : un entier ≥ 1 sur
une échéance due (`pending`, `partially_paid`, `late`) échue avant aujourd'hui (heure de Dakar),
hors restitution de caution ; `null` sinon, et toujours `null` sur une réservation.

### Point du mois d'une agence — `GET /api/agencies/{agency}/finance/summary`

`period=YYYY-MM` (défaut : le mois courant, heure de Dakar ; illisible → 422
`reporting.invalid_period`). Même Policy que `finance/aging` (`reports.view_agency`). Rend
`collected {amount, count, previous_amount}`, `overdue {amount, count, leases_count, by_age
{under_8, from_8_to_30, over_30} → {count, amount}}` (à date, `as_of`), `deposits_held`,
`payouts_awaiting_approval {count, amount, landlords_count}`, `payouts_pending {count, amount}`,
`invoices_draft {count, amount}`, plus `period`, `as_of` et `currency` (TCK-2657).
`overdue.never_reminded_count` : les impayés sans aucune relance, notée (`lease_payment_reminders`) ni
automatique (`metadata.reminder_*_sent_at`) (TCK-2658).

### Relances d'une échéance — `GET|POST /api/lease-payments/{payment}/reminders`

Personnel de l'agence du bail seulement (`LeasePaymentPolicy::remind`). `POST {channel: whatsapp|call,
note?}` **note** une relance faite depuis le téléphone de l'agence — rien n'est envoyé (ADR-0105) ;
409 `lease_payment.not_overdue` hors d'une échéance due, non soldée et échue. `GET` rend toutes les
relances, de la plus récente à la plus ancienne : `{at, source: manual|automatic, channel, by {id,
name}, note, milestone}` — sans pagination ni filtre (TCK-2658).

### Grand livre des commissions — `GET /api/commissions` (TCK-595, TCK-2661)

Périmètre : `CommissionEntry::visibleTo` (l'agent ses lignes, `reports.view_agency` toute l'agence).

| Param | Type | Description |
|---|---|---|
| `filter[status]`, `filter[beneficiary_id]`, `filter[lease_id]`, `filter[origin]` | exact | |
| `filter[earned_from]` / `filter[earned_to]` | date | `YYYY-MM-DD`, heure de Dakar, bornes incluses ; illisible ou liste → 422 (TCK-2661) |
| `filter[paid_from]` / `filter[paid_to]` | date | idem sur `paid_at` ; une ligne non payée n'entre dans aucune plage (TCK-2661) |
| `include` | `lease`, `beneficiary`, `lease.property` | `lease.property` ajoute `lease.property {id, title, quarter}` (TCK-2661) |
| `sort` | `-earned_at` (défaut), `amount`, `paid_at`, `id` | |

`GET /api/commissions/summary?month=YYYY-MM&year=YYYY` (défaut : le mois courant de Dakar et son
année) rend, par bénéficiaire du même périmètre, `beneficiary {id, name}`, `due_amount`, `due_count`,
`oldest_due_earned_at`, `paid_month`, `paid_year`, `last_paid {at, method}` — le plus dû d'abord ;
`meta {month, year}` (TCK-2661).

### Mises en avant de l'espace — `GET /api/credits/boosts`, `GET /api/credits/suggestions` (TCK-2663)

Hors `HasQueryBuilder`, forme fixe comme `GET /api/credits` : même autorisation (`boost.spend` sur
l'espace actif, 403 avant 422), même 422 `credits.no_space` hors d'un espace (TCK-2663).

| Param | Type | Description |
|---|---|---|
| `filter[status]` | `active` \| `ended` | `active` : en cours ou en pause ; `ended` : terminé, annulé ou remboursé ; absent : en cours, plus terminé depuis 30 jours (TCK-2663) |
| `filter[id]` | entier | un boost de l'espace ; celui d'un autre espace rend une liste vide (TCK-2663) |
| `per_page` | 1 à 50 | défaut 20 ; tri fixe : en cours d'abord, puis le plus récemment terminé (TCK-2663) |

Chaque ligne porte `property {id, title, main_photo_url, quarter}` et `measures {impressions, clicks,
contacts, visits}`, mesurées de `starts_at` à `ended_at` (ou maintenant) : des comptes, aucune donnée
du demandeur ; `contacts` compte tous les canaux (TCK-2663). `GET /api/credits/suggestions?limit=N`
(1 à 10, défaut 10) : les biens publics de l'espace sans contact depuis 30 jours ni boost en cours,
du moins vu au plus vu, `{…property, views_count, last_contact_at}` et `meta.total` (TCK-2663).

---

## Architecture interne

Tous les models héritent du trait `HasQueryBuilder` via `AbstractModel`. Chaque model déclare :

```php
protected static array $requestFilterable = [/* filtres exacts */];
protected static array $requestFilterablePartial = [/* filtres LIKE */];
protected static array $requestRangeFilters = [/* champs avec _min/_max */];
protected static array $requestSearchFields = [/* champs pour filter[search] */];
protected static array $requestSortable = [/* champs triables */];
protected static array $requestLoadable = [/* relations via include= */];
protected static array $requestCountable = [/* relations via include=XCount */];
protected static array $queryFields = [/* colonnes via fields[table]= */];
```

Dans les controllers, le pattern est :

```php
// 1. Base query avec contrôle d'accès (business logic)
$base = Property::query();
if (!$user->hasRole(['admin', 'super_admin'])) {
    $base->where('user_id', $user->id);
}

// 2. Spatie prend la main pour les filtres/tri/champs frontend
$paginator = Property::buildQuery($base, $request)
    ->defaultSort('-created_at')
    ->paginate();
```
